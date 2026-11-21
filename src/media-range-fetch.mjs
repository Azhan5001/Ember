// Some CDNs allow CORS ranges but do not expose Content-Range. A bounded
// response's Content-Length is then mistaken for the complete media size.
export function mediaRangeFetch(signal, load=fetch, idleTimeout=15000) {
 const sizes=new Map();
 return async(resource,init={})=>{
  // A server can leave a range body open forever without producing a network
  // error. Time only pending network reads, never time spent paused by MSE.
  const controller=new AbortController();
  const requestSignal=AbortSignal.any([signal,controller.signal,...(init.signal?[init.signal]:[])]);
  const timeout=()=>controller.abort(new DOMException('Media request timed out','TimeoutError'));
  let timer=setTimeout(timeout,idleTimeout),response;
  try{response=await load(resource,{...init,signal:requestSignal});}finally{clearTimeout(timer);}
  if(response.body){
   const reader=response.body.getReader();
   const body=new ReadableStream({
    async pull(sink){
     let aborted;
     const stopped=new Promise((_,reject)=>{aborted=()=>reject(requestSignal.reason);if(requestSignal.aborted)aborted();else requestSignal.addEventListener('abort',aborted,{once:true});});
     timer=setTimeout(timeout,idleTimeout);
     try{const chunk=await Promise.race([reader.read(),stopped]);if(chunk.done)sink.close();else sink.enqueue(chunk.value);}
     catch(error){sink.error(error);void reader.cancel(error).catch(()=>{});}
     finally{clearTimeout(timer);requestSignal.removeEventListener('abort',aborted);}
    },
    cancel(reason){clearTimeout(timer);controller.abort(reason);return reader.cancel(reason);}
   },{highWaterMark:0});
   response=new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
  }
  const requested=new Headers(init.headers),range=requested.get('Range');
  if(range&&response.status!==206){void response.body?.cancel();throw Error('This provider does not allow byte-range streaming for browser compatibility playback.');}
  if(response.status!==206||response.headers.has('Content-Range'))return response;
  const start=Number(range?.match(/^bytes=(\d+)-/)?.[1]),length=Number(response.headers.get('Content-Length'));
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(length)||length<=0)return response;
  const key=String(resource instanceof Request?resource.url:resource);
  if(!sizes.has(key)){
   requested.delete('Range');
   sizes.set(key,load(resource,{...init,method:'HEAD',headers:requested,signal:AbortSignal.any([signal,AbortSignal.timeout(5000)])})
    .then(head=>{const size=Number(head.headers.get('Content-Length'));return head.ok&&Number.isSafeInteger(size)&&size>0&&!head.headers.has('Content-Encoding')?size:null;}).catch(()=>null));
  }
  const size=await sizes.get(key);signal.throwIfAborted();
  if(!size||start+length>size)return response;
  const headers=new Headers(response.headers);headers.set('Content-Range',`bytes ${start}-${start+length-1}/${size}`);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
 };
}
