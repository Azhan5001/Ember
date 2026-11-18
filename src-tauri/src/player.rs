use anyhow::{Result,bail};
use serde_json::{Value,json};
use std::{collections::HashMap,path::PathBuf,sync::{Arc,Mutex as StdMutex,atomic::{AtomicU64,AtomicBool,Ordering}},time::Duration};
use tokio::{io::{AsyncBufReadExt,AsyncWrite,AsyncWriteExt,BufReader},sync::{Mutex,oneshot},process::{Child,Command}};
use tauri::Emitter;

type Writer=Box<dyn AsyncWrite+Unpin+Send>;
struct Handle{child:Mutex<Child>,writer:Mutex<Writer>,requests:StdMutex<HashMap<u64,oneshot::Sender<Value>>>,values:StdMutex<HashMap<String,Value>>,next:AtomicU64,closed:AtomicBool,active:AtomicBool,app:tauri::AppHandle}
impl Handle{
 async fn send(&self,c:Value)->Result<Value>{
  if self.closed.load(Ordering::SeqCst){bail!("Native player closed")}
  let id=self.next.fetch_add(1,Ordering::SeqCst);let(tx,rx)=oneshot::channel();self.requests.lock().unwrap().insert(id,tx);
  let line=format!("{}\n",json!({"command":c,"request_id":id}));
  if let Err(e)=self.writer.lock().await.write_all(line.as_bytes()).await{self.requests.lock().unwrap().remove(&id);return Err(e.into())}
  let r=tokio::time::timeout(Duration::from_secs(5),rx).await;self.requests.lock().unwrap().remove(&id);
  let e=r??;if e["error"]!="success"{bail!("Native command failed")};Ok(e["data"].clone())
 }
 async fn ready(&self)->Result<()>{
  let end=tokio::time::Instant::now()+Duration::from_secs(18);
  while tokio::time::Instant::now()<end{
   if self.closed.load(Ordering::SeqCst){bail!("Native player closed")}
   if let Ok(d)=self.send(json!(["get_property","duration"])).await{if d.as_f64().unwrap_or(0.)>0. && self.send(json!(["get_property","seeking"])).await.unwrap_or(json!(true))==false && self.send(json!(["get_property","paused-for-cache"])).await.unwrap_or(json!(true))==false{return Ok(())}}
   tokio::time::sleep(Duration::from_millis(100)).await;
  }bail!("New source was not ready")
 }
 async fn stop(&self){self.active.store(false,Ordering::SeqCst);self.closed.store(true,Ordering::SeqCst);let _=self.child.lock().await.kill().await;self.requests.lock().unwrap().clear();}
 fn publish(&self){for(name,data)in self.values.lock().unwrap().iter(){let _=self.app.emit("native-event",json!({"event":"property-change","name":name,"data":data}));}}
}
pub struct Player{binary:PathBuf,app:tauri::AppHandle,current:Mutex<Option<Arc<Handle>>>,pending:Mutex<Option<Arc<Handle>>>,epoch:AtomicU64,transaction:Mutex<()>}
impl Player{
 pub fn new(binary:PathBuf,app:tauri::AppHandle)->Self{Self{binary,app,current:Mutex::new(None),pending:Mutex::new(None),epoch:AtomicU64::new(0),transaction:Mutex::new(())}}
 async fn launch(&self,url:&str,pos:f64,headers:&Value,prepare:bool)->Result<Arc<Handle>>{
  crate::network::checked(url)?;
  let id=uuid::Uuid::new_v4();
  #[cfg(windows)]let ipc=format!(r"\\.\pipe\ember-{id}");
  #[cfg(not(windows))]let ipc=std::env::temp_dir().join(format!("ember-{id}.sock")).to_string_lossy().to_string();
  let mut c=Command::new(&self.binary);
  c.args(["--no-config","--load-scripts=no","--idle=yes","--keep-open=yes","--volume-max=200","--title=Ember • Native player","--force-window=yes","--pause=yes","--hwdec=auto-safe","--demuxer-max-bytes=32MiB","--demuxer-max-back-bytes=8MiB","--cache-secs=15","--sub-font=Arial","--sub-font-size=38","--sub-border-size=2","--sub-shadow-offset=1","--sub-margin-y=38"]);
  if prepare{c.args(["--window-minimized=yes","--mute=yes"]);}
  c.arg(format!("--input-ipc-server={ipc}")).arg(format!("--start={}",pos.max(0.)));
  if let Some(o)=headers.as_object(){for(k,v)in o{if k.chars().all(|c|c.is_ascii_alphabetic()||c=='-'){if let Some(v)=v.as_str(){if !v.contains(['\r','\n']){c.arg(format!("--http-header-fields-append={k}: {v}"));}}}}}
  c.arg("--").arg(url).stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).kill_on_drop(true);
  #[cfg(windows)]c.creation_flags(0x08000000);
  let mut child=c.spawn().map_err(|_|anyhow::anyhow!("The bundled native player could not start"))?;
  let mut stream=None;
  for _ in 0..60{
   if child.try_wait()?.is_some(){bail!("Native player exited before connecting")}
   #[cfg(windows)]let connection=tokio::net::windows::named_pipe::ClientOptions::new().open(&ipc);
   #[cfg(not(windows))]let connection=tokio::net::UnixStream::connect(&ipc).await;
   match connection{Ok(s)=>{stream=Some(s);break},Err(_)=>tokio::time::sleep(Duration::from_millis(100)).await}
  }
  let stream=stream.ok_or_else(||anyhow::anyhow!("Native player connection timed out"))?;
  let(reader,writer)=tokio::io::split(stream);
  let h=Arc::new(Handle{child:Mutex::new(child),writer:Mutex::new(Box::new(writer)),requests:StdMutex::new(HashMap::new()),values:StdMutex::new(HashMap::new()),next:AtomicU64::new(1),closed:AtomicBool::new(false),active:AtomicBool::new(false),app:self.app.clone()});
  let weak=Arc::downgrade(&h);
  tokio::spawn(async move{
   let mut lines=BufReader::new(reader).lines();
   while let Ok(Some(line))=lines.next_line().await{let Some(h)=weak.upgrade()else{break};if line.len()>2_000_000{break}if let Ok(e)=serde_json::from_str::<Value>(&line){
    if let Some(id)=e["request_id"].as_u64(){if let Some(tx)=h.requests.lock().unwrap().remove(&id){let _=tx.send(e.clone());}}
    if e["event"]=="property-change"{if let Some(n)=e["name"].as_str(){h.values.lock().unwrap().insert(n.to_string(),e["data"].clone());}}
    if h.active.load(Ordering::SeqCst){let _=h.app.emit("native-event",e);}
   }}
   if let Some(h)=weak.upgrade(){h.closed.store(true,Ordering::SeqCst);h.requests.lock().unwrap().clear();if h.active.load(Ordering::SeqCst){let _=h.app.emit("native-event",json!({"event":"closed"}));}}
  });
  let ready=async{for(i,n)in ["time-pos","duration","pause","track-list","chapter-list","paused-for-cache","eof-reached"].iter().enumerate(){h.send(json!(["observe_property",i+1,n])).await?;}h.ready().await}.await;
  if let Err(e)=ready{h.stop().await;return Err(e)}Ok(h)
 }
 pub async fn cancel(&self){self.epoch.fetch_add(1,Ordering::SeqCst);if let Some(h)=self.pending.lock().await.take(){h.stop().await;}}
 pub async fn open(&self,url:&str,pos:f64,headers:&Value)->Result<bool>{
  self.cancel().await;let epoch=self.epoch.load(Ordering::SeqCst);let h=self.launch(url,pos,headers,false).await?;
  let _guard=self.transaction.lock().await;
  if self.epoch.load(Ordering::SeqCst)!=epoch{h.stop().await;bail!("Cancelled")}
  if let Err(e)=h.send(json!(["set_property","pause",false])).await{h.stop().await;return Err(e)}
  let old=self.current.lock().await.replace(h.clone());h.active.store(true,Ordering::SeqCst);h.publish();if let Some(old)=old{old.stop().await;}Ok(true)
 }
 pub async fn prepare(&self,url:&str,pos:f64,headers:&Value)->Result<bool>{
  self.cancel().await;let epoch=self.epoch.load(Ordering::SeqCst);let h=self.launch(url,pos,headers,true).await?;
  let mut pending=self.pending.lock().await;if self.epoch.load(Ordering::SeqCst)!=epoch{h.stop().await;bail!("Cancelled")};*pending=Some(h);Ok(true)
 }
 pub async fn commit(&self,o:Value)->Result<bool>{
  let _guard=self.transaction.lock().await;let epoch=self.epoch.load(Ordering::SeqCst);
  let h=self.pending.lock().await.clone().ok_or_else(||anyhow::anyhow!("No prepared source"))?;let old=self.current.lock().await.clone();
  let result=async{
   let mut pos=o["position"].clone();let mut paused=o["paused"].clone();
   if let Some(old)=&old{pos=old.send(json!(["get_property","time-pos"])).await.unwrap_or(pos);paused=old.send(json!(["get_property","pause"])).await.unwrap_or(paused);}
   h.send(json!(["seek",pos,"absolute+exact"])).await?;h.ready().await?;
   h.send(json!(["set_property","volume",o["volume"].as_f64().unwrap_or(100.)])).await?;
   if let Some(audio)=o["audio"].as_str().filter(|a|*a!="auto"){h.send(json!(["set_property","alang",audio])).await?;}
   if let Some(sub)=o["subtitle"].as_str(){h.send(json!(["sub-add",sub,"select"])).await?;}else if o["subtitleOff"]==true{h.send(json!(["set_property","sid","no"])).await?;}
   if self.epoch.load(Ordering::SeqCst)!=epoch{bail!("Cancelled")}
   h.send(json!(["set_property","window-minimized",false])).await?;h.send(json!(["set_property","mute",false])).await?;h.send(json!(["set_property","pause",paused.as_bool().unwrap_or(false)])).await?;
   if self.epoch.load(Ordering::SeqCst)!=epoch{bail!("Cancelled")}
   *self.current.lock().await=Some(h.clone());self.pending.lock().await.take();h.active.store(true,Ordering::SeqCst);h.publish();if let Some(old)=old{old.stop().await;}Ok::<_,anyhow::Error>(true)
  }.await;
  if result.is_err(){h.stop().await;let mut p=self.pending.lock().await;if p.as_ref().is_some_and(|p|Arc::ptr_eq(p,&h)){p.take();}}result
 }
 pub async fn command(&self,c:Value)->Result<Value>{
  let name=c[0].as_str().unwrap_or("");if !["set_property","seek","cycle","stop","quit","sub-add"].contains(&name){bail!("Unsupported native command")}
  if name=="set_property" && !["pause","volume","aid","sid","alang","slang","sub-delay","fullscreen","mute"].contains(&c[1].as_str().unwrap_or("")){bail!("Unsupported player property")}
  let h=self.current.lock().await.clone();match h{Some(h)=>h.send(c).await,None=>Ok(json!(false))}
 }
 #[cfg(debug_assertions)]pub(crate) async fn inspect(&self,name:&str)->Result<Value>{let h=self.current.lock().await.clone().ok_or_else(||anyhow::anyhow!("No player"))?;h.send(json!(["get_property",name])).await}
 pub async fn close(&self){self.cancel().await;if let Some(h)=self.current.lock().await.take(){h.stop().await;}}
}
