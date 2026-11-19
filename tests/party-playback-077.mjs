import assert from 'node:assert/strict';import{chromium}from'@playwright/test';import{createServer}from'vite';
const server=await createServer({server:{host:'127.0.0.1',port:5175,strictPort:true}});await server.listen();const browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const file of ['safari-fixture.mkv','safari-dts.mkv']){
  const started=Date.now();await page.goto('http://127.0.0.1:5175/tests/playback-regression.html?party&file='+file);
  await page.waitForFunction(()=>window.__partyReport?.ready,null,{timeout:25000});
  console.log('PASS paused party prepares first picture',file,Date.now()-started,'ms');
  await page.evaluate(()=>Object.assign(window.__testParty.snapshot.room,{paused:false,waiting:false,anchor_at:new Date().toISOString()}));
  await page.waitForFunction(()=>{const v=document.querySelector('video.activevideo');return v&&v.currentTime>2&&v.webkitAudioDecodedByteCount>0},null,{timeout:15000});
  console.log('PASS party starts with audible playback',file);
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();await server.close()}
