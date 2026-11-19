import type {} from './api';
export type DownloadJob={id:string;name:string;bytes:number;total?:number;state:string;error?:string;path?:string;directUrl?:string};
const jobs:DownloadJob[]=[],controllers=new Map<string,AbortController>();
export async function downloadList():Promise<DownloadJob[]>{return window.ember?.downloadList?window.ember.downloadList():[...jobs]}
export async function cancelDownload(id:string){if(window.ember?.downloadCancel)return window.ember.downloadCancel(id);controllers.get(id)?.abort();}
export async function startDownload(source:any,name:string){
 const hinted=source.behaviorHints?.filename||'';
 const extension=hinted.match(/\.(mp4|mkv|webm|m4v|avi|mov|ts)$/i)?.[0]||source.url?.split('?')[0].match(/\.(mp4|mkv|webm|m4v|avi|mov|ts)$/i)?.[0]||'.mkv';
 name=name.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,140);
 if(!name.toLowerCase().endsWith(extension.toLowerCase()))name+=extension;
 if(source.playlist||/\.m3u8(?:[?#]|$)/i.test(source.url||''))throw Error('Choose a direct video file or torrent to download. HLS playlists cannot be saved as a single video yet.');
 if(window.ember?.downloadStart)return window.ember.downloadStart({name,url:source.localTorrent?undefined:source.url,headers:source.behaviorHints?.proxyHeaders?.request,hash:source.infoHash,index:source.fileIdx==null?undefined:Number(source.fileIdx),sources:source.sources});
 if(!source.url)throw Error('Open this torrent in the Ember app to download it, or select a direct source.');
 if(jobs.some(j=>j.state==='downloading'))throw Error('Wait for the current download or cancel it first.');
 const controller=new AbortController(),id=crypto.randomUUID();
 const job:DownloadJob={id,name,bytes:0,state:'downloading'};jobs.push(job);controllers.set(id,controller);
 void (async()=>{
  let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  let frame:HTMLIFrameElement|undefined,channel:MessageChannel|undefined,startTimer:number|undefined;
  try{
   const response=await fetch(source.url,{headers:source.behaviorHints?.proxyHeaders?.request,signal:controller.signal,credentials:'omit'});
   if(!response.ok||!response.body)throw Error('The provider rejected the download. Try the Ember desktop app.');
   if(/text\/html|json|mpegurl/.test(response.headers.get('content-type')||''))throw Error('This source did not return a downloadable video file.');
   job.total=Number(response.headers.get('content-length'))||undefined;reader=response.body.getReader();
   if(!('serviceWorker' in navigator))throw Error('This browser cannot save streaming downloads. Use the Ember app.');
   const registration=await navigator.serviceWorker.register(new URL('download-worker.js',document.baseURI).href);
   const worker=registration.active||registration.installing||registration.waiting;
   if(!worker)throw Error('Download service unavailable');
   if(worker.state!=='activated')await new Promise<void>((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Download service timed out')),15000);worker.addEventListener('statechange',()=>{if(worker.state==='activated'){clearTimeout(t);resolve()}})});
   if(navigator.serviceWorker.controller!==worker){
     await new Promise<void>((resolve,reject)=>{
       const ready=()=>{if(navigator.serviceWorker.controller===worker){cleanup();resolve()}};
       const cleanup=()=>{clearTimeout(timer);navigator.serviceWorker.removeEventListener("controllerchange",ready)};
       const timer=window.setTimeout(()=>{cleanup();reject(Error("The download worker could not take control. Reload and retry."))},15000);
       navigator.serviceWorker.addEventListener("controllerchange",ready);ready();
     });
   }
   channel=new MessageChannel();
   const port=channel.port1;
   const done=new Promise<void>((resolve,reject)=>{
    const abort=()=>reject(Error('Cancelled'));controller.signal.addEventListener('abort',abort,{once:true});
    port.onmessage=async e=>{
     try{
      if(e.data.ready){
       frame=document.createElement("iframe");
       frame.hidden=true;
       frame.title="Save video";
       frame.src=new URL(`downloads/file/${id}/${encodeURIComponent(name)}`,document.baseURI).href;
       document.body.append(frame);
       startTimer=window.setTimeout(()=>reject(Error("The browser did not start the download.")),20000);
      }
      if(e.data.cancel){controller.abort();return;}
      if(e.data.read){clearTimeout(startTimer);const r=await reader!.read();if(r.done){if(job.total&&job.bytes!==job.total)throw Error('Incomplete download');port.postMessage({done:true});resolve();}else{job.bytes+=r.value.length;port.postMessage({chunk:r.value},[r.value.buffer]);}}
     }catch(e){port.postMessage({error:String(e)});reject(e)}
    };
   });
   worker.postMessage({type:'download',id,name,total:job.total},[channel.port2]);
   await done;job.state='complete';
  }catch(e){job.state=controller.signal.aborted?'cancelled':'failed';job.error=String(e).replace(/^Error: /,'');
    if(!controller.signal.aborted && e instanceof TypeError && /^https?:\/\//i.test(source.url) && !Object.keys(source.behaviorHints?.proxyHeaders?.request||{}).length){
      job.directUrl=source.url;
      job.state='link';
      job.error="Click the link below to download this video in your browser.";
    }}
  finally{clearTimeout(startTimer);frame?.remove();channel?.port1.close();void reader?.cancel().catch(()=>{});controllers.delete(id)}
 })();return id;
}
