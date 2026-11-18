const jobs=new Map();
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
 if(event.data?.type!=='download'||!event.ports[0])return;
 const {id,name,total}=event.data,port=event.ports[0];
 const stream=new ReadableStream({
  start(controller){port.onmessage=e=>{if(e.data.done)controller.close();else if(e.data.error)controller.error(Error(e.data.error));else controller.enqueue(e.data.chunk)};},
  pull(){port.postMessage({read:true})},cancel(){port.postMessage({cancel:true});jobs.delete(id)}
 },{highWaterMark:0});
 jobs.set(id,{name,total,stream});port.postMessage({ready:true});
 setTimeout(()=>jobs.delete(id),60000);
});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 const prefix=new URL('downloads/file/',self.registration.scope);
 if(event.request.method!=='GET'||url.origin!==prefix.origin||!url.pathname.startsWith(prefix.pathname))return;
 const id=url.pathname.slice(prefix.pathname.length).split('/')[0],job=jobs.get(id);
 if(!job)return;
 jobs.delete(id);
 const headers={'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(job.name)}`,'Cache-Control':'no-store'};
 if(job.total>0)headers['Content-Length']=String(job.total);
 event.respondWith(new Response(job.stream,{headers}));
});
