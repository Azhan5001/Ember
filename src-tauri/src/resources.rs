// An idle webview keeps its scripts and network connections alive. Direct video
// playback always returns to the normal target; native playback runs in mpv.
#[tauri::command]
pub fn resource_mode(window:tauri::WebviewWindow,low:bool)->Result<(),String>{
 #[cfg(windows)]{
  use windows_core::Interface;
  use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2_19,COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW,COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL};
  window.with_webview(move|webview|unsafe{
   if let Ok(core)=webview.controller().CoreWebView2(){if let Ok(core)=core.cast::<ICoreWebView2_19>(){let _=core.SetMemoryUsageTargetLevel(if low{COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW}else{COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL});}}
  }).map_err(|e|e.to_string())?;
 }
 #[cfg(not(windows))]let _=(window,low);
 Ok(())
}

#[cfg(target_os = "linux")]
pub fn limit_linux_cache(window: &tauri::WebviewWindow) {
 use webkit2gtk::{CacheModel, WebContextExt, WebViewExt};
 let _ = window.with_webview(|webview| {
  if let Some(context) = webview.inner().context() {
   context.set_cache_model(CacheModel::DocumentViewer);
   // Wry gives this application its own WebKit data directory.
   context.clear_cache();
  }
 });
}
