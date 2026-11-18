use axum::{Router,routing::get,extract::{State,Path,Query},http::{StatusCode,HeaderMap,Method},response::{Response,IntoResponse},body::Body};
use std::{sync::Arc,collections::HashMap};
use tokio::io::{AsyncReadExt,AsyncSeekExt};
use crate::{network,torrents::Torrents};
#[derive(Clone)]pub struct Server{pub token:String,#[cfg(any(target_os="linux",target_os="android"))] pub remote:Arc<crate::remote::Remote>,pub media:Arc<crate::media::Media>,pub client:reqwest::Client,pub torrents:Arc<Torrents>,pub images:Arc<tokio::sync::Semaphore>}
pub async fn start(s:Server)->anyhow::Result<String>{
 let listener=tokio::net::TcpListener::bind("127.0.0.1:0").await?;let port=listener.local_addr()?.port();let base=format!("http://127.0.0.1:{port}/{}",s.token);
 #[cfg(any(target_os="linux",target_os="android"))] let remote=s.remote.routes(s.token.clone());
 let router=Router::new().route("/{token}/art",get(art)).route("/{token}/trailer/{id}",get(trailer)).route("/{token}/torrent/{hash}/{index}",get(torrent)).route("/{token}/media/{id}",get(crate::media::video)).with_state(s);
 #[cfg(any(target_os="linux",target_os="android"))] let router=router.merge(remote);
 tokio::spawn(async move{let _=axum::serve(listener,router).await;});Ok(base)
}
async fn art(State(s):State<Server>,Path(token):Path<String>,Query(q):Query<HashMap<String,String>>)->Response{
 if token!=s.token{return StatusCode::NOT_FOUND.into_response()}
 let Some(url)=q.get("url")else{return StatusCode::BAD_REQUEST.into_response()};
 let Ok(_permit)=s.images.acquire().await else{return StatusCode::SERVICE_UNAVAILABLE.into_response()};
 match network::download(&s.client,url,HeaderMap::new()).await{
  Ok((data,kind))if kind.starts_with("image/")=>Response::builder().header("content-type",kind).header("cache-control","private, max-age=3600").header("x-content-type-options","nosniff").body(Body::from(data)).unwrap(),
  _=>StatusCode::BAD_GATEWAY.into_response()
 }
}
pub fn range(raw:Option<&str>,len:u64)->Option<(u64,u64,bool)>{
 if len==0{return None}let Some(raw)=raw else{return Some((0,len-1,false))};let r=raw.strip_prefix("bytes=")?;if r.contains(','){return None}let(a,b)=r.split_once('-')?;
 let(start,end)=if a.is_empty(){let suffix=b.parse::<u64>().ok()?;if suffix==0{return None}(len.saturating_sub(suffix),len-1)}else{(a.parse().ok()?,if b.is_empty(){len-1}else{b.parse::<u64>().ok()?.min(len-1)})};
 if start> end||start>=len{return None}Some((start,end,true))
}
async fn torrent(State(s):State<Server>,Path((token,hash,index)):Path<(String,String,String)>,headers:HeaderMap,method:Method)->Response{
 if token!=s.token{return StatusCode::NOT_FOUND.into_response()}
 #[cfg(target_os="linux")] if s.torrents.check_space().is_err(){return StatusCode::INSUFFICIENT_STORAGE.into_response()}
 let file=s.torrents.files.lock().await.get(&format!("{hash}/{index}")).cloned();let Some((h,i,len,name))=file else{return StatusCode::NOT_FOUND.into_response()};
 let Some((start,end,partial))=range(headers.get("range").and_then(|h|h.to_str().ok()),len)else{return Response::builder().status(416).header("content-range",format!("bytes */{len}")).body(Body::empty()).unwrap()};
 let ty=if name.ends_with(".mp4"){"video/mp4"}else if name.ends_with(".webm"){"video/webm"}else{"video/x-matroska"};
 let mut response=Response::builder().status(if partial{206}else{200}).header("content-type",ty).header("cache-control","no-store").header("accept-ranges","bytes").header("content-length",(end-start+1).to_string()).header("access-control-allow-origin","*");
 if partial{response=response.header("content-range",format!("bytes {start}-{end}/{len}"));}
 if method==Method::HEAD{return response.body(Body::empty()).unwrap()}
 let Ok(mut stream)=h.stream(i)else{return StatusCode::SERVICE_UNAVAILABLE.into_response()};
 if stream.seek(std::io::SeekFrom::Start(start)).await.is_err(){return StatusCode::SERVICE_UNAVAILABLE.into_response()}
 response.body(Body::from_stream(tokio_util::io::ReaderStream::with_capacity(stream.take(end-start+1),64*1024))).unwrap()
}
#[cfg(test)]mod tests{use super::*;#[test]fn ranges(){assert_eq!(range(Some("bytes=2-4"),10),Some((2,4,true)));assert_eq!(range(Some("bytes=-3"),10),Some((7,9,true)));assert_eq!(range(Some("bytes=10-"),10),None);assert_eq!(range(Some("bytes=4-2"),10),None);assert_eq!(range(Some("bytes=0-1,3-4"),10),None);}}

async fn trailer(State(s):State<Server>,Path((token,id)):Path<(String,String)>)->Response{
 if token!=s.token||id.len()!=11||!id.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'-'||b==b'_'){return StatusCode::NOT_FOUND.into_response()}
 let html=format!(r#"<!doctype html><html><head><meta name="referrer" content="strict-origin-when-cross-origin"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,iframe{{width:100%;height:100%;margin:0;border:0;background:#000}}</style></head><body><iframe src="https://www.youtube.com/embed/{id}?rel=0&amp;playsinline=1" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe></body></html>"#);
 Response::builder().header("content-type","text/html; charset=utf-8").header("referrer-policy","strict-origin-when-cross-origin").header("cache-control","no-store").body(Body::from(html)).unwrap()
}
