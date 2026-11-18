use std::{path::PathBuf,sync::{Arc,Mutex}};
use serde::{Serialize,Deserialize};
use tokio::{io::{AsyncReadExt,AsyncWriteExt},sync::Notify};
use anyhow::{Result,bail};
use crate::{network,torrents::Torrents};
#[derive(Clone,Serialize)]pub struct Job{pub id:String,pub name:String,pub path:String,pub bytes:u64,pub total:Option<u64>,pub state:String,pub error:Option<String>}
#[derive(Deserialize)]pub struct Request{pub name:String,pub url:Option<String>,pub headers:Option<serde_json::Value>,pub hash:Option<String>,pub index:Option<usize>,pub sources:Option<Vec<String>>}
pub struct Downloads{root:PathBuf,jobs:Mutex<Vec<Job>>,cancel:Notify,torrents:Arc<Torrents>}
impl Downloads{
 pub fn new(root:PathBuf,cache:PathBuf)->Self{let _=std::fs::remove_dir_all(&cache);Self{root,jobs:Mutex::new(vec![]),cancel:Notify::new(),torrents:Arc::new(Torrents::new(cache))}}
 pub fn list(&self)->Vec<Job>{
  let mut jobs=self.jobs.lock().unwrap();
  if let Ok(files)=std::fs::read_dir(&self.root){for f in files.flatten(){let path=f.path();if !path.is_file()||path.extension().is_some_and(|x|x=="ember-part"){continue}let path=path.to_string_lossy().to_string();if jobs.iter().any(|j|j.path==path){continue}let name=f.file_name().to_string_lossy().to_string();let bytes=f.metadata().map(|m|m.len()).unwrap_or(0);jobs.push(Job{id:name.clone(),name,path,bytes,total:Some(bytes),state:"complete".into(),error:None});}}
  jobs.clone()
 }
 pub fn completed(&self,id:&str)->Option<String>{self.list().into_iter().find(|j|j.id==id&&j.state=="complete").map(|j|j.path)}
 pub fn cancel(&self,id:&str){if self.jobs.lock().unwrap().iter().any(|j|j.id==id&&j.state=="downloading"){self.cancel.notify_one();}}
 fn update(&self,id:&str,bytes:u64,total:Option<u64>){if let Some(j)=self.jobs.lock().unwrap().iter_mut().find(|j|j.id==id){j.bytes=bytes;j.total=total;}}
 pub fn start(self:&Arc<Self>,r:Request)->Result<String>{
  let mut jobs=self.jobs.lock().unwrap();if jobs.iter().any(|j|j.state=="downloading"){bail!("A download is already running. Wait for it or cancel it first.")}
  let id=uuid::Uuid::new_v4().to_string();let name=safe_name(&r.name);
  jobs.push(Job{id:id.clone(),name:name.clone(),path:String::new(),bytes:0,total:None,state:"downloading".into(),error:None});
  if jobs.len()>100{jobs.remove(0);}drop(jobs);
  let this=self.clone();let task_id=id.clone();tokio::spawn(async move{
   let path=this.root.join(format!("{}-{}",&task_id[..8],name));let part=path.with_extension("ember-part");
   let result=tokio::select!{r=this.transfer(&task_id,r,&part)=>r,_=this.cancel.notified()=>Err(anyhow::anyhow!("Cancelled"))};
   let result=match result{Ok(())=>tokio::fs::rename(&part,&path).await.map_err(Into::into),Err(e)=>Err(e)};
   if result.is_err(){let _=tokio::fs::remove_file(&part).await;}
   this.torrents.close().await;
   if let Some(j)=this.jobs.lock().unwrap().iter_mut().find(|j|j.id==task_id){match result{Ok(())=>{j.state="complete".into();j.path=path.to_string_lossy().into()},Err(e)=>{j.state=if e.to_string()=="Cancelled"{"cancelled"}else{"failed"}.into();j.error=Some(e.to_string())}}}
  });Ok(id)
 }
 async fn transfer(&self,id:&str,r:Request,path:&PathBuf)->Result<()>{
  tokio::fs::create_dir_all(&self.root).await?;let mut file=tokio::fs::OpenOptions::new().write(true).create_new(true).open(path).await?;let mut bytes=0;
  if let Some(url)=r.url{
   let client=reqwest::Client::builder().connect_timeout(std::time::Duration::from_secs(25)).redirect(reqwest::redirect::Policy::none()).build()?;
   let mut url=network::checked(&url)?;let mut headers=network::headers(&r.headers.unwrap_or_default())?;let mut response=None;
   for _ in 0..6{let reply=client.get(url.clone()).headers(headers.clone()).send().await?;
    if reply.status().is_redirection(){let next=network::checked(url.join(reply.headers().get("location").ok_or_else(||anyhow::anyhow!("Missing redirect"))?.to_str()?)?.as_str())?;if url.scheme()=="https"&&next.scheme()!="https"{bail!("Insecure download redirect")};if next.origin()!=url.origin(){headers.clear()}url=next;continue}
    response=Some(reply.error_for_status()?);break;
   }
   let mut response=response.ok_or_else(||anyhow::anyhow!("Too many download redirects"))?;
   let kind=response.headers().get("content-type").and_then(|v|v.to_str().ok()).unwrap_or("");
   if kind.contains("mpegurl")||kind.contains("text/html")||kind.contains("json"){bail!("This source is not a downloadable video file. Select a direct file or torrent.")}
   let total=response.content_length();
   while let Some(chunk)=tokio::time::timeout(std::time::Duration::from_secs(90),response.chunk()).await??{file.write_all(&chunk).await?;bytes+=chunk.len() as u64;self.update(id,bytes,total);}
   if total.is_some_and(|t|t!=bytes){bail!("Incomplete download. Please retry.")}
  }else if let Some(hash)=r.hash{
   let r=self.torrents.resolve(hash,r.index,r.sources.unwrap_or_default(),"http://download").await?;
   let key=r["url"].as_str().unwrap_or("").strip_prefix("http://download/torrent/").ok_or_else(||anyhow::anyhow!("Torrent file unavailable"))?;
   let(h,i,total,_)=self.torrents.files.lock().await.get(key).cloned().ok_or_else(||anyhow::anyhow!("Torrent file unavailable"))?;
   let mut stream=h.stream(i)?;let mut chunk=vec![0;128*1024];
   loop{let n=tokio::time::timeout(std::time::Duration::from_secs(120),stream.read(&mut chunk)).await??;if n==0{break}file.write_all(&chunk[..n]).await?;bytes+=n as u64;self.update(id,bytes,Some(total));}
   if bytes!=total{bail!("Incomplete torrent download. Please retry.")}
  }else{bail!("Choose a direct file or torrent source")}
  if bytes==0{bail!("The source returned an empty file")};file.flush().await?;file.sync_all().await?;Ok(())
 }
}
fn safe_name(raw:&str)->String{let name:String=raw.chars().map(|c|if c.is_control()||"/\\:*?\"<>|".contains(c){'_'}else{c}).take(180).collect();let name=name.trim_matches([' ','.']);if name.is_empty(){"video.mkv".into()}else{name.into()}}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn streamed_file_and_cancel(){tokio::runtime::Runtime::new().unwrap().block_on(async{
  use axum::{routing::get,Router};
  let listener=tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();let port=listener.local_addr().unwrap().port();
  let server=tokio::spawn(async move{axum::serve(listener,Router::new().route("/video",get(||async{vec![42u8;262144]})).route("/slow",get(||async{tokio::time::sleep(std::time::Duration::from_secs(10)).await;"slow"}))).await.unwrap()});
  let root=std::env::temp_dir().join(format!("ember-download-test-{}",uuid::Uuid::new_v4()));let d=Arc::new(Downloads::new(root.join("saved"),root.join("cache")));
  let request=|path:&str|Request{name:"test.webm".into(),url:Some(format!("http://127.0.0.1:{port}/{path}")),headers:None,hash:None,index:None,sources:None};
  let id=d.start(request("video")).unwrap();
  let job=tokio::time::timeout(std::time::Duration::from_secs(5),async{loop{let j=d.list().into_iter().find(|j|j.id==id).unwrap();if j.state!="downloading"{break j}tokio::time::sleep(std::time::Duration::from_millis(20)).await}}).await.unwrap();
  assert_eq!(job.state,"complete","{:?}",job.error);assert_eq!(std::fs::read(&job.path).unwrap(),vec![42u8;262144]);
  let id=d.start(request("slow")).unwrap();tokio::time::sleep(std::time::Duration::from_millis(50)).await;d.cancel(&id);
  tokio::time::timeout(std::time::Duration::from_secs(5),async{loop{let j=d.list().into_iter().find(|j|j.id==id).unwrap();if j.state!="downloading"{assert_eq!(j.state,"cancelled");break}tokio::time::sleep(std::time::Duration::from_millis(20)).await}}).await.unwrap();
  assert_eq!(std::fs::read_dir(root.join("saved")).unwrap().count(),1);server.abort();std::fs::remove_dir_all(root).unwrap();
 });}
}
