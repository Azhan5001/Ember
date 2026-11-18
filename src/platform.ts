import {invoke,isTauri} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import type {} from './api';
let pending:Promise<unknown>=Promise.resolve();
let saveFailed=false;
function durable<T>(command:string,args:Record<string,unknown>):Promise<T>{const next=pending.then(()=>invoke<T>(command,args));pending=next.then(()=>{saveFailed=false},()=>{saveFailed=true});return next;}
function event<T>(name:string,fn:(payload:T)=>void){let disposed=false;let off:(()=>void)|undefined;void listen<T>(name,e=>{if(!disposed)fn(e.payload)}).then(f=>{if(disposed)f();else off=f});return()=>{disposed=true;off?.()};}

async function start(){
 if(isTauri()){
  const {base,platform,liveBoot}=await invoke<{base:string;platform:string;liveBoot?:boolean}>('bootstrap');
  window.ember={platform,downloadStart:request=>invoke("download_start",{request}),downloadOpen:id=>invoke("download_open",{id}),downloadList:()=>invoke("download_list"),downloadCancel:id=>invoke("download_cancel",{id}),trailerURL:id=>`${base}/trailer/${id}`,liveBoot,torrentRetain:url=>invoke("torrent_retain",{url}),takeLinks:()=>invoke('take_links'),registerLinks:()=>invoke('register_links'),addonLink:fn=>event('addon-link',fn),memory:()=>invoke('memory'),trakt:args=>invoke('trakt',{args}),torrent:(hash,index,sources)=>invoke('torrent',{hash,index,sources}),request:(url,headers)=>invoke('request',{url,headers}),
   checkpoint:p=>{void durable('checkpoint',{p}).catch(()=>window.dispatchEvent(new Event('ember-save-error')));return true},read:()=>invoke('read'),write:data=>durable('write',{data}),
   torboxStream:args=>invoke('torbox_stream',args),
   mediaRemote:(url,headers)=>invoke('media_remote',{url,headers}),
   mediaProbe:input=>invoke('media_probe',{input}),mediaOpen:options=>invoke('media_open',{options}),mediaSubtitle:(input,track,start)=>invoke('media_subtitle',{input,track,start}),
   native:(url,position,headers)=>invoke('native',{url,position,headers}),nativeCommand:command=>invoke('native_command',{command}).catch(()=>false),nativeEvent:fn=>event('native-event',fn),nativeSubtitle:text=>invoke('native_subtitle',{text}),nativePrepare:(url,position,headers)=>invoke('native_prepare',{url,position,headers}),nativeCommit:args=>invoke('native_commit',{args}),nativeCancel:()=>invoke('native_cancel'),openExternal:url=>{void invoke('external',{url})},artworkURL:url=>`${base}/art?url=${encodeURIComponent(url)}`,
  };
  if (platform === "linux" || platform === "win32" || platform === "android") {
   const {loadDesktopTorBoxKey} = await import("./web-playback");
   await loadDesktopTorBoxKey().catch(() => {});
  }
  // Restore normal caching promptly on interaction; idle browsing releases caches.
  // Never suspend scripts: cloud sync, native-player events and next episode stay live.
  let idleTimer:ReturnType<typeof setTimeout>|undefined,lowMemory=false;
  const playing=()=>[...document.querySelectorAll('video')].some(v=>!v.paused&&!v.ended&&v.readyState>0);
  const mode=(low:boolean)=>{if(lowMemory!==low){lowMemory=low;void invoke('resource_mode',{low}).catch(()=>{});}};
  const idle=()=>{if(playing()){mode(false);idleTimer=setTimeout(idle,8000)}else mode(true)};
  const active=()=>{mode(false);clearTimeout(idleTimer);idleTimer=setTimeout(idle,8000)};
  for(const name of ['pointerdown','pointermove','keydown','wheel','play','playing','pause','ended'])document.addEventListener(name,active,{passive:true,capture:true});
  window.addEventListener('focus',active);window.addEventListener('blur',()=>{if(!playing()){clearTimeout(idleTimer);idleTimer=setTimeout(idle,500)}});active();
  let closing=false;
  await listen('before-close',async()=>{if(closing)return;closing=true;window.dispatchEvent(new Event('beforeunload'));await new Promise(r=>setTimeout(r,0));await pending;if(saveFailed){closing=false;alert('Ember could not save your latest changes. Free some disk space, then close again to retry.');return}await invoke('finish_close');});
 }
 await import('./main');
}
void start().catch(error=>{console.error('Ember startup failed',error);document.getElementById('root')!.textContent='Ember could not start: '+String(error)+'. Your saved data has not been replaced.';});
