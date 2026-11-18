use anyhow::{Result,bail,Context};
use rusqlite::{Connection,OptionalExtension,params};
use serde_json::{Value,json};
use std::{path::{Path,PathBuf},sync::Mutex};

#[cfg(windows)]
fn crypt(data:&[u8],encrypt:bool)->Result<Vec<u8>> {
 use windows_sys::Win32::{Security::Cryptography::{CRYPT_INTEGER_BLOB,CryptProtectData,CryptUnprotectData,CRYPTPROTECT_UI_FORBIDDEN},Foundation::LocalFree};
 let input=CRYPT_INTEGER_BLOB{cbData:data.len() as u32,pbData:data.as_ptr() as *mut u8};
 let mut output=CRYPT_INTEGER_BLOB{cbData:0,pbData:std::ptr::null_mut()};
 let ok=unsafe{if encrypt{CryptProtectData(&input,std::ptr::null(),std::ptr::null(),std::ptr::null_mut(),std::ptr::null(),CRYPTPROTECT_UI_FORBIDDEN,&mut output)}else{CryptUnprotectData(&input,std::ptr::null_mut(),std::ptr::null(),std::ptr::null_mut(),std::ptr::null(),CRYPTPROTECT_UI_FORBIDDEN,&mut output)}};
 if ok==0 {bail!("Windows could not unlock this profile. Sign in as its original Windows user, or import an Ember backup.")}
 let bytes=unsafe{std::slice::from_raw_parts(output.pbData,output.cbData as usize).to_vec()};
 unsafe{LocalFree(output.pbData as _);}
 Ok(bytes)
}
#[cfg(not(windows))]
fn crypt(_data:&[u8],_encrypt:bool)->Result<Vec<u8>> {bail!("Secure storage adapter for this platform is not installed")}

#[cfg(target_os="linux")]
fn linux_key(root: &Path) -> Result<[u8; 32]> {
 use aes_gcm::aead::{OsRng, rand_core::RngCore};
 use std::{fs::{self, OpenOptions},io::{Read, Write},os::unix::fs::{OpenOptionsExt, PermissionsExt}};
 let path = root.join("profile.key");
 if !path.exists() {
  let mut key = [0; 32];
  OsRng.try_fill_bytes(&mut key).map_err(|_| anyhow::anyhow!("Could not generate a profile key"))?;
  let staging = root.join(format!(".profile-key-{}", uuid::Uuid::new_v4()));
  let result = (|| -> Result<()> {
   let mut file = OpenOptions::new().write(true).create_new(true).mode(0o600).open(&staging)?;
   file.write_all(&key)?;
   file.sync_all()?;
   match fs::hard_link(&staging, &path) {
    Ok(()) => (),
    Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => (),
    Err(error) => return Err(error.into()),
   }
   Ok(())
  })();
  let _ = fs::remove_file(staging);
  result?;
 }
 let metadata = fs::symlink_metadata(&path)?;
 if !metadata.is_file() || metadata.permissions().mode() & 0o077 != 0 || metadata.len() != 32 {
  bail!("Ember cannot use this profile key. The key file must be private and 32 bytes long.");
 }
 let mut key = [0; 32];
 fs::File::open(path)?.read_exact(&mut key)?;
 Ok(key)
}

pub struct Store {
 db: Mutex<Connection>,
 pub root: PathBuf,
 #[cfg(target_os="linux")]
 key: [u8; 32],
}
impl Store {
 pub fn open(root:PathBuf,legacy:Option<PathBuf>)->Result<Self>{
  std::fs::create_dir_all(&root)?;
  let db=Connection::open(root.join("ember.sqlite"))?;
  db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA cache_size=-512; PRAGMA journal_size_limit=1048576; CREATE TABLE IF NOT EXISTS state(id INTEGER PRIMARY KEY,data BLOB NOT NULL,encrypted INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS secrets(key TEXT PRIMARY KEY,data BLOB NOT NULL);")?;
  #[cfg(target_os="linux")]
  let key=linux_key(&root)?;
  let store=Self{db:Mutex::new(db),root,#[cfg(target_os="linux")] key};
  if store.read()?.is_null(){if let Some(old)=legacy{if old.join("ember.sqlite").exists(){store.migrate(&old)?;}}}
  Ok(store)
 }
 fn migrate(&self,old:&Path)->Result<()> {
  let db=Connection::open_with_flags(old.join("ember.sqlite"),rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)?;
  let row:Option<(Vec<u8>,i64)>=db.query_row("SELECT data,encrypted FROM state WHERE id=1",[],|r|Ok((r.get(0)?,r.get(1)?))).optional()?;
  if let Some((data,encrypted))=row {
   let raw=if encrypted==0{data}else{legacy_decrypt(&data,old).context("The old profile could not be migrated; it has not been modified.")?};
   let value:Value=serde_json::from_slice(&raw)?;
   db.backup("main",self.root.join("electron-profile-backup.sqlite"),None)?;
   self.write(value)?;
  }
  Ok(())
 }
 fn crypt_profile(&self,data:&[u8],encrypt:bool)->Result<Vec<u8>> {
  #[cfg(not(target_os="linux"))]
  return crypt(data,encrypt);
  #[cfg(target_os="linux")]
  {
   use aes_gcm::{Aes256Gcm, KeyInit, Nonce, aead::{Aead, OsRng, rand_core::RngCore}};
   let cipher = Aes256Gcm::new((&self.key).into());
   if encrypt {
    let mut nonce = [0; 12];
    OsRng.try_fill_bytes(&mut nonce).map_err(|_| anyhow::anyhow!("Could not create a profile nonce"))?;
    let body = cipher.encrypt(Nonce::from_slice(&nonce), data).map_err(|_| anyhow::anyhow!("Could not encrypt the profile"))?;
    return Ok([nonce.as_slice(), &body].concat());
   }
   if data.len() < 28 { bail!("Invalid encrypted profile") }
   cipher.decrypt(Nonce::from_slice(&data[..12]), &data[12..]).map_err(|_| anyhow::anyhow!("Could not unlock this profile with its key"))
  }
 }
 fn read_db(&self,db:&Connection)->Result<Value>{
  let row:Option<(Vec<u8>,i64)>=db.query_row("SELECT data,encrypted FROM state WHERE id=1",[],|r|Ok((r.get(0)?,r.get(1)?))).optional()?;
  match row {Some((d,e))=>Ok(serde_json::from_slice(&if e==0{d}else{self.crypt_profile(&d,false)?})?),None=>Ok(Value::Null)}
 }
 pub fn read(&self)->Result<Value>{self.read_db(&self.db.lock().unwrap())}
 fn put(&self,db:&Connection,value:&Value)->Result<()>{
  let bytes=serde_json::to_vec(value)?;if bytes.len()>32*1024*1024 {bail!("Profile exceeds the 32 MB safety limit; export and compact old account archives.")}
  let data=self.crypt_profile(&bytes,true)?;
  db.execute("INSERT OR REPLACE INTO state VALUES(1,?,1)",[data])?;Ok(())
 }
 pub fn write(&self,mut value:Value)->Result<()> {
  let db=self.db.lock().unwrap();let old=self.read_db(&db)?;
  merge_progress(&old,&mut value);self.put(&db,&value)
 }
 pub fn checkpoint(&self,p:Value)->Result<()> {
  if p["item"]["type"].as_str().is_none() || p["vid"].as_str().is_none() || p["position"].as_f64().is_none() || p["duration"].as_f64().is_none(){bail!("Invalid checkpoint")}
  let db=self.db.lock().unwrap();let mut data=self.read_db(&db)?;if data.is_null(){data=json!({})}
  if !data["progress"].is_object(){data["progress"]=json!({})}
  let id=format!("{}:{}",p["item"]["type"].as_str().unwrap(),p["vid"].as_str().unwrap());
  let old=data["progress"][&id].clone();data["progress"][&id]=update_watch(old,p);self.put(&db,&data)
 }
 pub fn secret(&self,key:&str,value:Option<Option<String>>)->Result<Option<String>>{
  if !["ember-account-v1","ember-account-v1-user","ember-account-v1-code-verifier","ember-account-v1-flows-code-verifier"].contains(&key) {bail!("Unknown credential")}
  let db=self.db.lock().unwrap();
  if let Some(v)=value {match v{Some(v)=>{if v.len()>128*1024{bail!("Credential too large")}db.execute("INSERT OR REPLACE INTO secrets VALUES(?,?)",params![key,self.crypt_profile(v.as_bytes(),true)?])?;},None=>{db.execute("DELETE FROM secrets WHERE key=?",[key])?;}}return Ok(None)}
  let v:Option<Vec<u8>>=db.query_row("SELECT data FROM secrets WHERE key=?",[key],|r|r.get(0)).optional()?;
  v.map(|d|Ok(String::from_utf8(self.crypt_profile(&d,false)?)?)).transpose()
 }
}
fn legacy_decrypt(data:&[u8],dir:&Path)->Result<Vec<u8>> {
 if !data.starts_with(b"v10") {return crypt(data,false)}
 use base64::Engine;use aes_gcm::{Aes256Gcm,KeyInit,aead::Aead,Nonce};
 let local:Value=serde_json::from_slice(&std::fs::read(dir.join("Local State"))?)?;
 let encoded=local["os_crypt"]["encrypted_key"].as_str().context("Missing legacy key")?;
 let key=base64::engine::general_purpose::STANDARD.decode(encoded)?;
 if !key.starts_with(b"DPAPI") || data.len()<31 {bail!("Unsupported legacy profile encryption")}
 let key=crypt(&key[5..],false)?;
 Aes256Gcm::new_from_slice(&key).map_err(|_|anyhow::anyhow!("Invalid legacy key"))?.decrypt(Nonce::from_slice(&data[3..15]),&data[15..]).map_err(|_|anyhow::anyhow!("Legacy profile authentication failed"))
}
pub fn update_watch(old:Value,p:Value)->Value {
 if old["updatedAt"].as_f64().unwrap_or(0.)>p["updatedAt"].as_f64().unwrap_or(0.){return old}
 let watched=if p["watched"]==false{false}else{old["watched"]==true||p["watched"]==true||(p["duration"].as_f64().unwrap_or(0.)>0. && p["position"].as_f64().unwrap_or(0.)/p["duration"].as_f64().unwrap_or(1.)>=0.90)};
 let mut out=old.as_object().cloned().unwrap_or_default();if let Some(p)=p.as_object(){out.extend(p.clone())}out.insert("watched".into(),json!(watched));Value::Object(out)
}
pub fn merge_progress(old:&Value,new:&mut Value){
 let mut progress=old["progress"].as_object().cloned().unwrap_or_default();
 if let Some(p)=new["progress"].as_object(){progress.extend(p.clone());}
 if let Some(p)=old["progress"].as_object(){for(id,v) in p{
  let k=format!("progress:{id}");let nr=new["_sync"]["revisions"][&k].as_u64().unwrap_or(0);let or=old["_sync"]["revisions"][&k].as_u64().unwrap_or(0);
  let changed=new["_sync"]["owner"].as_str().is_some()&&new["_sync"]["owner"]!=old["_sync"]["owner"];
  if changed||nr>or {if new["progress"][id].is_null(){progress.remove(id);}continue}
  if new["progress"][id].is_null()&&nr>0{progress.remove(id);continue}
  if v["updatedAt"].as_u64().unwrap_or(0)>new["progress"][id]["updatedAt"].as_u64().unwrap_or(0){progress.insert(id.clone(),v.clone());}
 }}
 new["progress"]=Value::Object(progress);
}
#[cfg(test)]mod tests{use super::*;#[test]fn rewatch(){let old=json!({"watched":true,"updatedAt":1});assert_eq!(update_watch(old,json!({"watched":false,"updatedAt":2}))["watched"],false)}#[test]fn tombstone(){let old=json!({"progress":{"series:a":{"updatedAt":10}},"_sync":{"owner":"a","revisions":{"progress:series:a":1}}});let mut new=json!({"progress":{},"_sync":{"owner":"a","revisions":{"progress:series:a":2}}});merge_progress(&old,&mut new);assert_eq!(new["progress"],json!({}))}}
#[cfg(all(test,windows))]
mod migration_tests {
 use super::*;
 fn root()->PathBuf{std::env::temp_dir().join(format!("ember-rust-test-{}",uuid::Uuid::new_v4()))}
 #[test]fn dpapi_and_legacy_profile(){
  let old=root();std::fs::create_dir_all(&old).unwrap();let c=Connection::open(old.join("ember.sqlite")).unwrap();c.execute_batch("CREATE TABLE state(id INTEGER PRIMARY KEY,data BLOB,encrypted INTEGER)").unwrap();
  let data=json!({"profile":"Migration fixture","addons":[{"base":"https://example.test/private-token","enabled":false}],"progress":{}});
  c.execute("INSERT INTO state VALUES(1,?,1)",[crypt(&serde_json::to_vec(&data).unwrap(),true).unwrap()]).unwrap();drop(c);
  let new=root();let s=Store::open(new.clone(),Some(old.clone())).unwrap();assert_eq!(s.read().unwrap()["addons"],data["addons"]);assert!(new.join("electron-profile-backup.sqlite").exists());
  s.secret("ember-account-v1",Some(Some("private-refresh-token".into()))).unwrap();assert_eq!(s.secret("ember-account-v1",None).unwrap(),Some("private-refresh-token".into()));
  s.secret("ember-account-v1-flows-code-verifier",None).unwrap();s.secret("ember-account-v1-user",Some(None)).unwrap();s.secret("ember-account-v1",Some(None)).unwrap();assert_eq!(s.secret("ember-account-v1",None).unwrap(),None);
  drop(s);std::fs::remove_dir_all(old).unwrap();std::fs::remove_dir_all(new).unwrap();
 }
 #[test]fn chromium_v10_migration(){
  use base64::Engine;use aes_gcm::{Aes256Gcm,KeyInit,aead::Aead,Nonce};let old=root();std::fs::create_dir_all(&old).unwrap();let key=[17u8;32];let nonce=[9u8;12];
  let mut wrapped=b"DPAPI".to_vec();wrapped.extend(crypt(&key,true).unwrap());let ls=json!({"os_crypt":{"encrypted_key":base64::engine::general_purpose::STANDARD.encode(wrapped)}});std::fs::write(old.join("Local State"),serde_json::to_vec(&ls).unwrap()).unwrap();
  let payload=b"{\"profile\":\"original\"}";let mut data=b"v10".to_vec();data.extend(nonce);data.extend(Aes256Gcm::new_from_slice(&key).unwrap().encrypt(Nonce::from_slice(&nonce),payload.as_ref()).unwrap());assert_eq!(legacy_decrypt(&data,&old).unwrap(),payload);data[20]^=1;assert!(legacy_decrypt(&data,&old).is_err());std::fs::remove_dir_all(old).unwrap();
 }
 #[test]fn checkpoint_survives_stale_write_and_account_change(){
  let root=root();let s=Store::open(root.clone(),None).unwrap();let old=json!({"_sync":{"owner":"a"},"progress":{},"settings":{"native":false}});s.write(old.clone()).unwrap();s.checkpoint(json!({"item":{"type":"series"},"vid":"episode","position":65,"duration":100,"updatedAt":20})).unwrap();s.write(old).unwrap();assert_eq!(s.read().unwrap()["progress"]["series:episode"]["position"],65);s.write(json!({"_sync":{"owner":"b"},"progress":{}})).unwrap();assert_eq!(s.read().unwrap()["progress"],json!({}));drop(s);std::fs::remove_dir_all(root).unwrap();
 }
}


#[cfg(all(test, target_os = "linux"))]
#[test]
fn linux_profile_and_secrets_survive_reopen() {
 use std::os::unix::fs::PermissionsExt;

 let root = std::env::temp_dir().join(format!("ember-profile-{}", uuid::Uuid::new_v4()));
 {
  let store = Store::open(root.clone(), None).unwrap();
  store.write(json!({"profile":"Fixture"})).unwrap();
  store.secret("ember-account-v1", Some(Some("fixture-refresh-token".into()))).unwrap();
  let raw: Vec<u8> = store.db.lock().unwrap().query_row(
   "SELECT data FROM state WHERE id=1 AND encrypted=1", [], |row| row.get(0),
  ).unwrap();
  assert!(!raw.windows(b"Fixture".len()).any(|part| part == b"Fixture"));
 }
 let store = Store::open(root.clone(), None).unwrap();
 assert_eq!(store.read().unwrap()["profile"], "Fixture");
 assert_eq!(store.secret("ember-account-v1", None).unwrap().as_deref(), Some("fixture-refresh-token"));
 assert_eq!(std::fs::metadata(root.join("profile.key")).unwrap().permissions().mode() & 0o777, 0o600);
 drop(store);
 std::fs::remove_dir_all(root).unwrap();
}
