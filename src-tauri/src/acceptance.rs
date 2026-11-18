// Compiled only in debug builds, and activated only by the dedicated acceptance executable name.
use std::{sync::{Arc,atomic::{AtomicBool,Ordering}},path::PathBuf,time::Duration};
use serde_json::json;use anyhow::{Result,ensure};use tauri::{Manager,Emitter};
pub fn profile()->Option<PathBuf>{let exe=std::env::current_exe().ok()?;if exe.file_name()?.to_str()?.eq_ignore_ascii_case("Ember-Native-Acceptance.exe"){Some(exe.parent()?.join("profile"))}else{None}}
pub async fn run(app:tauri::AppHandle,root:PathBuf){
 let player=app.state::<crate::Backend>().player.clone();let headers_seen=Arc::new(AtomicBool::new(false));let signal=headers_seen.clone();
 let media=Arc::new(include_bytes!("../../tests/playback.webm").to_vec());
 let router=axum::Router::new().route("/video",axum::routing::get(move|headers:axum::http::HeaderMap|{let media=media.clone();let signal=signal.clone();async move{
  if headers.get("x-ember-test").is_some_and(|v|v=="fixture"){signal.store(true,Ordering::SeqCst)}
  let (start,end,partial)=crate::server::range(headers.get("range").and_then(|v|v.to_str().ok()),media.len()as u64).unwrap();
  let mut b=axum::http::Response::builder().status(if partial{206}else{200}).header("content-type","video/webm").header("accept-ranges","bytes").header("content-length",(end-start+1).to_string());if partial{b=b.header("content-range",format!("bytes {start}-{end}/{}",media.len()))}
  b.body(axum::body::Body::from(media[start as usize..=end as usize].to_vec())).unwrap()
 }})).route("/bad",axum::routing::get(||async{axum::http::StatusCode::SERVICE_UNAVAILABLE}));
 let listener=match tokio::net::TcpListener::bind("127.0.0.1:0").await{Ok(l)=>l,Err(e)=>{let _=std::fs::write(root.join("../native-results.json"),json!({"error":e.to_string()}).to_string());return}};let base=format!("http://127.0.0.1:{}",listener.local_addr().unwrap().port());
 let server=tokio::spawn(async move{let _=axum::serve(listener,router).await;});let mut results=Vec::new();
 if let Some(w)=app.get_webview_window("main"){let _=w.set_title("Ember — isolated native playback verification");}
 let result:Result<()>=async{
  player.open(&format!("{base}/video"),12.,&json!({"X-Ember-Test":"fixture"})).await?;tokio::time::sleep(Duration::from_millis(800)).await;
  ensure!(player.inspect("time-pos").await?.as_f64().unwrap_or(0.)>12.);ensure!(headers_seen.load(Ordering::SeqCst));results.push("Native playback and provider headers".to_string());
  player.command(json!(["set_property","pause",true])).await?;let pos=player.inspect("time-pos").await?.as_f64().unwrap();
  player.prepare(&format!("{base}/video?quality=720"),pos,&json!({})).await?;player.commit(json!({"position":pos,"paused":true,"volume":0,"audio":"auto","subtitleOff":true})).await?;
  ensure!(player.inspect("pause").await?==true);ensure!((player.inspect("time-pos").await?.as_f64().unwrap()-pos).abs()<0.6);ensure!(player.inspect("volume").await?.as_f64().unwrap()==0.);results.push("Resolution handoff preserves position, pause, zero volume and subtitle off".into());
  let sub=root.join("fixture.srt");std::fs::write(&sub,"1\n00:00:00,000 --> 00:01:20,000\nEmber ordinary subtitle test\n")?;player.command(json!(["sub-add",sub.to_string_lossy(),"select"])).await?;
  ensure!(player.inspect("track-list").await?.as_array().unwrap().iter().any(|t|t["type"]=="sub"));results.push("Ordinary subtitle loading".into());
  player.command(json!(["set_property","pause",false])).await?;let before=player.inspect("time-pos").await?.as_f64().unwrap();
  ensure!(player.prepare(&format!("{base}/bad"),before,&json!({})).await.is_err());ensure!(player.inspect("pause").await?==false);ensure!(player.inspect("time-pos").await?.as_f64().unwrap()>before);results.push("Failed replacement leaves original playback running".into());
  player.prepare(&format!("{base}/video?quality=1080"),before,&json!({})).await?;player.cancel().await;ensure!(player.commit(json!({"position":before,"paused":false,"volume":100})).await.is_err());ensure!(player.inspect("pause").await?==false);results.push("Cancellation cannot replace working playback".into());
  ensure!(player.command(json!(["run","not-a-command"])).await.is_err());results.push("Unsupported commands rejected".into());Ok(())
 }.await;
 player.close().await;server.abort();
 let output=json!({"passed":results.len(),"results":results,"error":result.err().map(|e|e.to_string())});let _=std::fs::write(root.join("../native-results.json"),serde_json::to_vec_pretty(&output).unwrap());let _=app.emit("acceptance-result",output);
 if let Some(w)=app.get_webview_window("main"){let _=w.set_title("Ember — native verification finished; results saved");}app.exit(0);
}


