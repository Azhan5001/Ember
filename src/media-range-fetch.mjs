// Some CDNs allow CORS ranges but do not expose Content-Range. A bounded
// response's Content-Length is then mistaken for the complete media size.
export function mediaRangeFetch(signal, load=fetch) {
 const sizes=new Map();
 return async(resource,init={})=>{
  const response=await load(resource,{...init,signal});
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
