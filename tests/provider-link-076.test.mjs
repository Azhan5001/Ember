import test from 'node:test';import assert from 'node:assert/strict';import worker,{providerLink}from'../web/_worker.js';
test('provider redirect resolution permits only Torrentio and TorBox and never buffers video',async()=>{
 const original=globalThis.fetch;let requests=0;
 try{
  globalThis.fetch=async(url,options)=>{requests++;assert.equal(options.redirect,'manual');assert.equal(options.headers.Range,'bytes=0-0');return new Response(null,{status:302,headers:{Location:'https://nexus.example.tb-cdn.pw/video.mkv?token=fixture'}})};
  const url='https://torrentio.strem.fun/resolve/torbox/fixture';assert.match((await providerLink(url)).url,/tb-cdn\.pw/);assert.equal(requests,1);
  for(const invalid of ['http://torrentio.strem.fun/resolve/torbox/x','https://127.0.0.1/private','https://torrentio.strem.fun/other','https://torrentio.strem.fun.evil.test/resolve/torbox/x'])await assert.rejects(providerLink(invalid));
  assert.equal(requests,1);
  globalThis.fetch=async()=>new Response(null,{status:302,headers:{Location:'http://127.0.0.1/private'}});await assert.rejects(providerLink(url),/unsupported/);
  const foreign=await worker.fetch(new Request('https://ember.example/api/provider-link',{method:'POST',headers:{Origin:'https://foreign.example'},body:JSON.stringify({url})}),{});assert.equal(foreign.status,403);
 }finally{globalThis.fetch=original}
});
