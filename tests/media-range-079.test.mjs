import test from 'node:test';import assert from 'node:assert/strict';
import {mediaRangeFetch} from '../src/media-range-fetch.mjs';
test('hidden range metadata uses one HEAD size request and preserves partial bodies',async()=>{
 let heads=0;const load=async(url,init)=>{
  if(init.method==='HEAD'){heads++;assert.equal(new Headers(init.headers).has('Range'),false);return new Response(null,{headers:{'Content-Length':'10000'}});}
  return new Response(new Uint8Array([1,2,3,4]),{status:206,headers:{'Content-Length':'4'}});
 };
 const read=mediaRangeFetch(new AbortController().signal,load);
 const first=await read('https://media.invalid/file',{headers:{Range:'bytes=0-3'}});assert.equal(first.headers.get('Content-Range'),'bytes 0-3/10000');assert.deepEqual([...new Uint8Array(await first.arrayBuffer())],[1,2,3,4]);
 const later=await read('https://media.invalid/file',{headers:{Range:'bytes=100-103'}});assert.equal(later.headers.get('Content-Range'),'bytes 100-103/10000');assert.equal(heads,1);
});
test('visible range metadata adds no request; invalid HEAD size is never invented',async()=>{
 let calls=0;const signal=new AbortController().signal;
 const visible=mediaRangeFetch(signal,async()=>{calls++;return new Response('test',{status:206,headers:{'Content-Range':'bytes 0-3/500','Content-Length':'4'}})});
 assert.equal((await visible('https://media.invalid',{headers:{Range:'bytes=0-3'}})).headers.get('Content-Range'),'bytes 0-3/500');assert.equal(calls,1);
 const unknown=mediaRangeFetch(signal,async(u,i)=>i.method==='HEAD'?new Response(null,{status:405}):new Response('test',{status:206,headers:{'Content-Length':'4'}}));
 assert.equal((await unknown('https://media.invalid',{headers:{Range:'bytes=0-3'}})).headers.get('Content-Range'),null);
});
