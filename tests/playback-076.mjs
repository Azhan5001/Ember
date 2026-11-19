import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {createServer} from 'vite';
const server=await createServer({server:{host:'127.0.0.1',port:5175,strictPort:true}});await server.listen();
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const file of ['safari-fixture.mkv','safari-dts.mkv']){
  await page.goto('http://127.0.0.1:5175/tests/playback-regression.html?file='+file);
  await page.waitForFunction(()=>{const v=document.querySelector('video.activevideo');return v&&v.currentTime>2&&v.webkitAudioDecodedByteCount>0},null,{timeout:40000});
  const result=await page.locator('video.activevideo').evaluate(v=>({time:v.currentTime,picture:v.videoWidth,audioBytes:v.webkitAudioDecodedByteCount}));
  assert.ok(result.picture>0);assert.ok(result.audioBytes>0);console.log('PASS audible playback',file,result);
  await page.locator('video.activevideo').click({button:'right',force:true});
  assert.equal(await page.getByRole('menuitem').count(),1);assert.match(await page.getByRole('menuitem').innerText(),/Download video/);
  assert.equal(await page.locator('.playerdrawer').count(),0);
 }
 assert.deepEqual(errors,[]);console.log('PASS one-item download context menu');
}finally{await browser.close();await server.close()}
