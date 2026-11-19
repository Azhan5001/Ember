use anyhow::{Result,bail};
use std::{path::PathBuf,sync::{Arc,atomic::{AtomicU64,Ordering}},collections::{HashMap,HashSet}};
use tokio::sync::Mutex;
use librqbit::{Session,SessionOptions,AddTorrent,AddTorrentOptions,ManagedTorrent};
use serde_json::{Value,json};
type ManagedTorrentHandle=Arc<ManagedTorrent>;

pub struct Torrents { operations:Mutex<()>,epoch:AtomicU64,root:PathBuf,session:Mutex<Option<Arc<Session>>>,pub files:Mutex<HashMap<String,(ManagedTorrentHandle,usize,u64,String)>>,active:Mutex<Vec<usize>>,pinned:Mutex<Option<usize>> }
impl Torrents{
 pub fn new(root:PathBuf)->Self{Self{operations:Mutex::new(()),epoch:AtomicU64::new(0),root,session:Mutex::new(None),files:Mutex::new(HashMap::new()),active:Mutex::new(Vec::new()),pinned:Mutex::new(None)}}
 #[cfg(target_os="linux")]
 pub fn check_space(&self)->Result<()> {
  if crate::torrent_space::live_boot(){bail!("Raw torrents are disabled on Linux live boots. Choose a cached debrid stream.");}
  let path=self.root.parent().unwrap_or(&self.root);
  crate::torrent_space::check(path,0)
 }
 async fn session(&self)->Result<Arc<Session>>{let mut s=self.session.lock().await;if let Some(s)=s.as_ref(){return Ok(s.clone())}std::fs::create_dir_all(&self.root)?;let new=Session::new_with_opts(self.root.clone(),SessionOptions{disable_dht_persistence:true,enable_upnp_port_forwarding:false,concurrent_init_limit:Some(2),
 #[cfg(target_os="linux")] default_storage_factory:Some(librqbit::storage::StorageFactoryExt::boxed(crate::torrent_space::Factory(self.root.clone()))),
 ..Default::default()}).await?;*s=Some(new.clone());Ok(new)}
 pub async fn resolve(&self,hash:String,index:Option<usize>,sources:Vec<String>,base:&str)->Result<Value>{
  let epoch=self.epoch.fetch_add(1,Ordering::SeqCst)+1;let _operation=self.operations.lock().await;
  if self.epoch.load(Ordering::SeqCst)!=epoch{bail!("Torrent request cancelled")}
  if hash.len()!=40||!hash.bytes().all(|c|c.is_ascii_hexdigit()){bail!("Unsupported torrent hash")}
  #[cfg(target_os="linux")] self.check_space()?;
  let s=self.session().await?;let mut magnet=url::Url::parse(&format!("magnet:?xt=urn:btih:{hash}"))?;
  for tracker in sources.iter().filter_map(|s|s.strip_prefix("tracker:")){if let Ok(u)=url::Url::parse(tracker){if ["udp","http","https"].contains(&u.scheme()){magnet.query_pairs_mut().append_pair("tr",tracker);}}}
  let result=tokio::time::timeout(std::time::Duration::from_secs(60),s.add_torrent(AddTorrent::from_url(magnet.to_string()),Some(AddTorrentOptions{overwrite:true,only_files:index.map(|i|vec![i]),..Default::default()}))).await.map_err(|_|anyhow::anyhow!("Torrent metadata timed out. Choose another source."))??;
  let h=result.into_handle().ok_or_else(||anyhow::anyhow!("Torrent unavailable"))?;
  let selected:Result<(usize,u64,String)>=async{
  tokio::time::timeout(std::time::Duration::from_secs(60),h.wait_until_initialized()).await??;
  let(i,len,name)=h.with_metadata(|m|{
   let i=index.or_else(||m.file_infos.iter().enumerate().filter(|(_,f)|f.relative_filename.extension().is_some_and(|e|["mkv","mp4","webm","avi","mov"].contains(&e.to_string_lossy().to_lowercase().as_str()))).max_by_key(|(_,f)|f.len).map(|(i,_)|i));
   i.and_then(|i|m.file_infos.get(i).map(|f|(i,f.len,f.relative_filename.to_string_lossy().to_string())))
  })?.ok_or_else(||anyhow::anyhow!("No matching video file in torrent"))?;
  if self.epoch.load(Ordering::SeqCst)!=epoch{bail!("Torrent request cancelled")}
  let mut selected=HashSet::from([i]);for(_, (other,index,_,_))in self.files.lock().await.iter(){if other.id()==h.id(){selected.insert(*index);}}
  s.update_only_files(&h,&selected).await?;Ok((i,len,name))}.await;
  let(i,len,name)=match selected{Ok(file)=>file,Err(e)=>{if !self.active.lock().await.contains(&h.id()){let _=s.delete(h.id().into(),true).await;}return Err(e)}};
  let key=format!("{hash}/{i}");self.files.lock().await.insert(key.clone(),(h.clone(),i,len,name.clone()));
  // Keep the working stream plus one handoff candidate; retire older torrents and their disk data.
  let mut active=self.active.lock().await;active.retain(|id|*id!=h.id());active.push(h.id());
  while active.len()>2{let pin=*self.pinned.lock().await;let slot=active.iter().position(|id|Some(*id)!=pin).unwrap_or(0);let id=active.remove(slot);self.files.lock().await.retain(|_,(h,_,_,_)|h.id()!=id);s.delete(id.into(),true).await?;}
  Ok(json!({"url":format!("{base}/torrent/{key}"),"filename":name}))
 }
 pub async fn retain(&self,url:Option<String>,base:&str)->Result<()>{
  self.epoch.fetch_add(1,Ordering::SeqCst);let _operation=self.operations.lock().await;
  let key=url.as_deref().and_then(|u|u.strip_prefix(&format!("{base}/torrent/")));
  let keep=if let Some(key)=key{self.files.lock().await.get(key).map(|(h,_,_,_)|h.id())}else{None};
  *self.pinned.lock().await=keep;
  let mut active=self.active.lock().await;
  let retired:Vec<_>=active.iter().copied().filter(|id|Some(*id)!=keep).collect();active.retain(|id|Some(*id)==keep);
  self.files.lock().await.retain(|k,_|Some(k.as_str())==key);
  if let Some(key)=key{if let Some((h,i,_,_))=self.files.lock().await.get(key){if let Some(s)=self.session.lock().await.as_ref(){s.update_only_files(h,&HashSet::from([*i])).await?;}}}
  if let Some(s)=self.session.lock().await.as_ref(){for id in retired{let _=s.delete(id.into(),true).await;}}
  if keep.is_none(){if let Some(s)=self.session.lock().await.take(){s.stop().await;}let _=std::fs::remove_dir_all(&self.root);}
  Ok(())
 }
 pub async fn close(&self){self.epoch.fetch_add(1,Ordering::SeqCst);let _operation=self.operations.lock().await;self.files.lock().await.clear();if let Some(s)=self.session.lock().await.take(){for id in self.active.lock().await.drain(..){let _=s.delete(id.into(),true).await;}s.stop().await;}let _=std::fs::remove_dir_all(&self.root);}
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn local_swarm_range_playback(){
  tokio::runtime::Runtime::new().unwrap().block_on(async{
   let root=std::env::temp_dir().join(format!("ember-swarm-{}",uuid::Uuid::new_v4()));let seed_dir=root.join("seed");std::fs::create_dir_all(&seed_dir).unwrap();let media=include_bytes!("../../tests/playback.webm");std::fs::write(seed_dir.join("playback.webm"),media).unwrap();
   let seed=Session::new_with_opts(seed_dir,SessionOptions{disable_dht:true,disable_dht_persistence:true,listen_port_range:Some(45100..45200),..Default::default()}).await.unwrap();
   let h=seed.add_torrent(AddTorrent::from_bytes(include_bytes!("../../tests/playback.torrent").as_slice()),Some(AddTorrentOptions{overwrite:true,..Default::default()})).await.unwrap().into_handle().unwrap();h.wait_until_initialized().await.unwrap();h.wait_until_completed().await.unwrap();let port=seed.tcp_listen_port().unwrap();
   let tracker=tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();let tracker_port=tracker.local_addr().unwrap().port();let track=tokio::spawn(async move{
    use tokio::io::{AsyncReadExt,AsyncWriteExt};loop{let Ok((mut socket,_))=tracker.accept().await else{break};let mut buf=[0u8;4096];let n=socket.read(&mut buf).await.unwrap_or(0);eprintln!("tracker request {}",String::from_utf8_lossy(&buf[..n]));let mut body=b"d8:completei1e10:incompletei0e8:intervali30e5:peers6:".to_vec();body.extend([127,0,0,1,(port>>8)as u8,port as u8]);body.push(b'e');let response=format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",body.len());let _=socket.write_all(response.as_bytes()).await;let _=socket.write_all(&body).await;}
   });
   let torrents=Arc::new(Torrents::new(root.join("client")));let client=crate::network::client().unwrap();let base=crate::server::start(crate::server::Server{remote:Arc::new(crate::remote::Remote::new().unwrap()),media:Arc::new(crate::media::Media::new("ffmpeg".into(),"ffprobe".into())),token:"fixture-token".into(),client:client.clone(),torrents:torrents.clone(),images:Arc::new(tokio::sync::Semaphore::new(2))}).await.unwrap();
   let result=torrents.resolve(include_str!("../../tests/playback.infohash").trim().into(),Some(0),vec![format!("tracker:http://127.0.0.1:{tracker_port}/announce")],&base).await.unwrap();let url=result["url"].as_str().unwrap();
   let response=client.get(url).header("Range","bytes=100-199").send().await.unwrap();assert_eq!(response.status(),206);assert_eq!(response.headers()["content-range"],format!("bytes 100-199/{}",media.len()));assert_eq!(&response.bytes().await.unwrap()[..],&media[100..200]);
   assert_eq!(client.get(url.replace("fixture-token","wrong-token")).send().await.unwrap().status(),404);
   assert_eq!(client.get(url).header("Range","bytes=999999999999-").send().await.unwrap().status(),416);
   torrents.retain(None,&base).await.unwrap();assert!(torrents.files.lock().await.is_empty());torrents.close().await;seed.stop().await;track.abort();std::fs::remove_dir_all(root).unwrap();
  });
 }
}


