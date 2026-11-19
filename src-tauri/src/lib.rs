#[cfg(debug_assertions)]mod acceptance;
mod media;mod torbox;mod downloads;
#[cfg(any(target_os="linux",target_os="android"))] mod remote;
#[cfg(target_os="linux")] mod torrent_space;
mod resources;mod metrics;mod network;mod storage;mod player;mod torrents;mod server;
use tauri::{Manager,Emitter};
use serde_json::{Value,json};
use std::{sync::{Arc,Mutex},path::PathBuf};
use player::Player;use storage::Store;use torrents::Torrents;
struct Backend{downloads:Arc<downloads::Downloads>,#[cfg(any(target_os="linux",target_os="android"))] remote:Arc<remote::Remote>,media:Arc<media::Media>,store:Store,client:reqwest::Client,player:Arc<Player>,torrents:Arc<Torrents>,base:String,links:Mutex<Vec<String>>}
type Cmd<T>=Result<T,String>;
fn error(e:impl std::fmt::Display)->String{e.to_string()}
fn link(raw:&str)->Option<String>{let u=raw.replacen("stremio://","https://",1).replacen("ember://","https://",1);let u=network::checked(&u).ok()?;if !u.path().ends_with("/manifest.json")||u.fragment().is_some(){return None}Some(u.to_string())}
#[tauri::command]fn bootstrap(s:tauri::State<Backend>)->Value{json!({"platform":if cfg!(windows){"win32"}else if cfg!(target_os="android"){"android"}else if cfg!(target_os="macos"){"darwin"}else{"linux"},"base":s.base})}
#[tauri::command]fn read(s:tauri::State<Backend>)->Cmd<Value>{s.store.read().map_err(error)}
#[tauri::command]fn write(s:tauri::State<Backend>,data:Value)->Cmd<()>{s.store.write(data).map_err(error)}
#[tauri::command]fn checkpoint(s:tauri::State<Backend>,p:Value)->Cmd<bool>{s.store.checkpoint(p).map_err(error)?;Ok(true)}
#[tauri::command]fn auth_storage(s:tauri::State<Backend>,action:String,key:String,value:Option<String>)->Cmd<Option<String>>{s.store.secret(&key,match action.as_str(){"get"=>None,"set"=>Some(Some(value.unwrap_or_default())),"remove"=>Some(None),_=>return Err("Invalid storage action".into())}).map_err(error)}
#[tauri::command]async fn request(s:tauri::State<'_,Backend>,url:String,headers:Option<Value>)->Cmd<String>{let h=network::headers(&headers.unwrap_or(json!({}))).map_err(error)?;let(d,_)=network::download(&s.client,&url,h).await.map_err(error)?;String::from_utf8(d).map_err(error)}
#[tauri::command]async fn trakt(s:tauri::State<'_,Backend>,args:Value)->Cmd<Value>{
 let u=network::checked(args["url"].as_str().unwrap_or("")).map_err(error)?;let method=args["method"].as_str().unwrap_or("GET");if u.origin().ascii_serialization()!="https://api.trakt.tv"||!["GET","POST"].contains(&method){return Err("Invalid Trakt request".into())}
 let r=s.client.request(method.parse().map_err(error)?,u).headers(network::headers(&args["headers"]).map_err(error)?).body(args["body"].as_str().unwrap_or("").to_string()).send().await.map_err(|_|"Trakt connection failed".to_string())?;let status=r.status().as_u16();let mut r=r;let mut text=Vec::new();while let Some(c)=r.chunk().await.map_err(|_|"Trakt response failed".to_string())?{if text.len()+c.len()>10_000_000{return Err("Response too large".into())}text.extend_from_slice(&c)}Ok(json!({"status":status,"text":String::from_utf8_lossy(&text)}))
}
#[tauri::command]fn take_links(s:tauri::State<Backend>)->Vec<String>{std::mem::take(&mut *s.links.lock().unwrap())}
#[tauri::command]fn register_links(app:tauri::AppHandle)->Cmd<bool>{
 #[cfg(desktop)]{use tauri_plugin_deep_link::DeepLinkExt;app.deep_link().register_all().map_err(error)?;}Ok(true)
}
#[tauri::command]fn external(app:tauri::AppHandle,url:String)->Cmd<()>{use tauri_plugin_opener::OpenerExt;let u=network::checked(&url).map_err(error)?;app.opener().open_url(u.as_str(),None::<&str>).map_err(error)}
#[tauri::command]async fn download_start(s:tauri::State<'_,Backend>,request:downloads::Request)->Cmd<String>{s.downloads.start(request).map_err(error)}
#[tauri::command]fn download_list(s:tauri::State<Backend>)->Vec<downloads::Job>{s.downloads.list()}
#[tauri::command]fn download_open(app:tauri::AppHandle,s:tauri::State<Backend>,id:String)->Cmd<()>{use tauri_plugin_opener::OpenerExt;let path=s.downloads.completed(&id).ok_or("Download not found")?;app.opener().open_path(path,None::<&str>).map_err(error)}
#[tauri::command]fn download_cancel(s:tauri::State<Backend>,id:String){s.downloads.cancel(&id)}
#[tauri::command]async fn torrent(s:tauri::State<'_,Backend>,hash:String,index:Option<usize>,sources:Option<Vec<String>>)->Cmd<Value>{
 #[cfg(target_os="linux")] s.torrents.check_space().map_err(error)?;
 s.torrents.resolve(hash,index,sources.unwrap_or_default(),&s.base).await.map_err(error)
}
#[tauri::command]async fn torrent_retain(s:tauri::State<'_,Backend>,url:Option<String>)->Cmd<()>{s.torrents.retain(url,&s.base).await.map_err(error)}
#[tauri::command]async fn media_remote(s:tauri::State<'_,Backend>,url:String,headers:Option<Value>)->Cmd<Value>{
 #[cfg(any(target_os="linux",target_os="android"))]
 {
  let headers=network::headers(&headers.unwrap_or_default()).map_err(error)?;
  let opened=s.remote.open(&url,headers).await.map_err(error)?;
  Ok(json!({"url":if opened.playlist{url}else{format!("{}/remote/{}",s.base,opened.id)},"contentType":opened.content_type,"playlist":opened.playlist}))
 }
 #[cfg(not(any(target_os="linux",target_os="android")))]
 { let _=(s,url,headers); Err("The provider relay is available on Linux.".into()) }
}
#[tauri::command]async fn torbox_stream(s:tauri::State<'_,Backend>,token:String,hash:String,index:Option<u64>,filename:Option<String>,movie:bool,queue:Option<bool>)->Cmd<Value>{torbox::resolve(&s.client,&token,&hash,index,filename.as_deref(),movie,queue.unwrap_or(false)).await.map_err(error)}
#[tauri::command]async fn media_probe(s:tauri::State<'_,Backend>,input:media::Input)->Cmd<Value>{s.media.probe(input).await.map_err(error)}
#[tauri::command]async fn media_open(s:tauri::State<'_,Backend>,options:media::Encode)->Cmd<String>{
 let id=s.media.open(options).await.map_err(error)?;
 Ok(format!("{}/media/{id}",s.base))
}
#[tauri::command]async fn media_subtitle(s:tauri::State<'_,Backend>,input:media::Input,track:u32,start:Option<f64>)->Cmd<String>{s.media.subtitle(input,track,start).await.map_err(error)}
#[tauri::command]async fn native(s:tauri::State<'_,Backend>,url:String,position:f64,headers:Option<Value>)->Cmd<bool>{s.player.open(&url,position,&headers.unwrap_or(json!({}))).await.map_err(error)}
#[tauri::command]async fn native_prepare(s:tauri::State<'_,Backend>,url:String,position:f64,headers:Option<Value>)->Cmd<bool>{s.player.prepare(&url,position,&headers.unwrap_or(json!({}))).await.map_err(error)}
#[tauri::command]async fn native_commit(s:tauri::State<'_,Backend>,args:Value)->Cmd<bool>{s.player.commit(args).await.map_err(error)}
#[tauri::command]async fn native_cancel(s:tauri::State<'_,Backend>)->Cmd<()>{s.player.cancel().await;Ok(())}
#[tauri::command]async fn native_command(s:tauri::State<'_,Backend>,command:Value)->Cmd<Value>{s.player.command(command).await.map_err(error)}
#[tauri::command]async fn native_subtitle(s:tauri::State<'_,Backend>,text:String)->Cmd<String>{
 use sha2::{Digest,Sha256};if text.len()>2_000_000{return Err("Subtitle too large".into())}let dir=s.store.root.join("tracks");std::fs::create_dir_all(&dir).map_err(error)?;
 let file=dir.join(format!("{:x}.srt",Sha256::digest(text.as_bytes())));
 let mut files:Vec<_>=std::fs::read_dir(&dir).map_err(error)?.flatten().filter_map(|f|Some((f.path(),f.metadata().ok()?))).collect();files.sort_by_key(|(_,m)|m.modified().ok());let mut size: u64=files.iter().map(|(_,m)|m.len()).sum();
 for(p,m)in files{if size+text.len() as u64<=8*1024*1024{break}if p!=file{let _=std::fs::remove_file(p);size=size.saturating_sub(m.len());}}
 std::fs::write(&file,text).map_err(error)?;let path=file.to_string_lossy().to_string();s.player.command(json!(["sub-add",path,"select"])).await.map_err(error)?;Ok(path)
}
#[tauri::command]async fn finish_close(app:tauri::AppHandle,s:tauri::State<'_,Backend>)->Cmd<()>{s.player.close().await;s.torrents.close().await;app.exit(0);Ok(())}
#[tauri::command]fn memory()->Value{metrics::memory()}
#[cfg_attr(mobile,tauri::mobile_entry_point)]
pub fn run(){
 let runtime=tokio::runtime::Builder::new_multi_thread().worker_threads(2).max_blocking_threads(8).enable_all().build().expect("Async runtime unavailable");tauri::async_runtime::set(runtime.handle().clone());
 let builder=tauri::Builder::default().plugin(tauri_plugin_opener::init());
 #[cfg(desktop)]let builder=if std::env::var_os("EMBER_DATA_DIR").is_some(){builder}else{builder.plugin(tauri_plugin_single_instance::init(|app,args,_|{if let Some(s)=app.try_state::<Backend>(){for u in args.iter().filter_map(|u|link(u)){s.links.lock().unwrap().push(u.clone());let _=app.emit("addon-link",u);}}if let Some(w)=app.get_webview_window("main"){let _=w.unminimize();let _=w.set_focus();}}))};
 #[cfg(desktop)]let builder=builder.plugin(tauri_plugin_deep_link::init());
 builder.setup(|app|{
  let root=std::env::var_os("EMBER_DATA_DIR").map(PathBuf::from).unwrap_or(app.path().app_data_dir()?);
  #[cfg(debug_assertions)]let root=acceptance::profile().unwrap_or(root);
  let legacy=if std::env::var_os("EMBER_DATA_DIR").is_none(){std::env::var_os("APPDATA").map(|p|PathBuf::from(p).join("ember-desktop"))}else{None};
  #[cfg(debug_assertions)]let legacy=if acceptance::profile().is_some(){None}else{legacy};
  let store=Store::open(root.clone(),legacy)?;let client=network::client()?;
  let torrent_root=root.join("torrent-cache");
  // This is our disposable media cache only; never the user's source downloads or old profile.
  if torrent_root.exists(){let _=std::fs::remove_dir_all(&torrent_root);}
  let torrents=Arc::new(Torrents::new(torrent_root));
  let media_binary=|name:&str|{
   #[cfg(target_os="android")]
   {if let Ok(maps)=std::fs::read_to_string("/proc/self/maps"){if let Some(path)=maps.lines().filter_map(|l|l.split_whitespace().last()).find(|p|p.ends_with("/libember_lib.so")){if let Some(dir)=std::path::Path::new(path).parent(){return dir.join(format!("lib{name}.so"));}}}}
   let filename=if cfg!(windows){format!("{name}.exe")}else{name.to_string()};
   let bundled=app.path().resource_dir().ok().map(|dir|dir.join("media").join(&filename));
   let dev=PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../vendor/media");
   let dev=if cfg!(target_os="linux"){dev.join("linux")}else{dev}.join(&filename);
   std::env::var_os(format!("EMBER_{}",name.to_uppercase())).map(PathBuf::from)
    .or_else(||bundled.filter(|p|p.is_file())).unwrap_or_else(||if dev.is_file(){dev}else{PathBuf::from(filename)})
  };
  let media=Arc::new(media::Media::new(media_binary("ffmpeg"),media_binary("ffprobe")));
  #[cfg(any(target_os="linux",target_os="android"))] let remote=Arc::new(remote::Remote::new()?);
  let base=tauri::async_runtime::block_on(server::start(server::Server{#[cfg(any(target_os="linux",target_os="android"))] remote:remote.clone(),media:media.clone(),token:uuid::Uuid::new_v4().to_string(),client:client.clone(),torrents:torrents.clone(),images:Arc::new(tokio::sync::Semaphore::new(4))}))?;
  let filename=if cfg!(windows){"mpv.exe"}else{"mpv"};
  let bundled=app.path().resource_dir()?.join("mpv").join(filename);
  let dev=PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../vendor/mpv").join(filename);
  let binary=std::env::var_os("EMBER_MPV").map(PathBuf::from).unwrap_or_else(||if bundled.exists(){bundled}else if dev.exists(){dev}else{PathBuf::from(filename)});
  let player=Arc::new(Player::new(binary,app.handle().clone()));
  let links=Mutex::new(std::env::args().filter_map(|a|link(&a)).collect());
  #[cfg(target_os="linux")]
  if let Some(window)=app.get_webview_window("main") { resources::limit_linux_cache(&window); }
  let downloads=Arc::new(downloads::Downloads::new(app.path().download_dir().unwrap_or(root.join("downloads")).join("Ember"),root.join("download-cache")));
  app.manage(Backend{downloads,#[cfg(any(target_os="linux",target_os="android"))] remote,media,store,client,player,torrents,base,links});
  #[cfg(desktop)]{use tauri_plugin_deep_link::DeepLinkExt;let handle=app.handle().clone();app.deep_link().on_open_url(move|event|{let s=handle.state::<Backend>();for u in event.urls().iter().filter_map(|u|link(u.as_str())){s.links.lock().unwrap().push(u.clone());let _=handle.emit("addon-link",u);}});}
  #[cfg(debug_assertions)]if acceptance::profile().is_some(){let handle=app.handle().clone();tauri::async_runtime::spawn(async move{tokio::time::sleep(std::time::Duration::from_secs(2)).await;acceptance::run(handle,root).await;});}
  Ok(())
 }).on_window_event(|window,event|{if let tauri::WindowEvent::CloseRequested{api,..}=event{api.prevent_close();let _=window.emit("before-close",());}})
 .invoke_handler(tauri::generate_handler![bootstrap,download_start,download_list,download_cancel,download_open,read,write,checkpoint,auth_storage,request,trakt,take_links,register_links,external,torrent,torrent_retain,media_remote,torbox_stream,media_probe,media_open,media_subtitle,native,native_prepare,native_commit,native_cancel,native_command,native_subtitle,finish_close,memory,resources::resource_mode])
 .run(tauri::generate_context!()).expect("Ember could not start; the original profile remains unchanged");
}
