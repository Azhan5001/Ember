import assert from 'node:assert/strict';import{chromium}from'@playwright/test';import{createServer}from'vite';
const server=await createServer({server:{host:'127.0.0.1',port:5175,strictPort:true}});await server.listen();const browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{const page=await browser.newPage();
 for(const platform of ['win32','android'])for(const file of ['safari-fixture.mkv','safari-dts.mkv']){
  const start=Date.now();await page.goto(`http://127.0.0.1:5175/tests/playback-regression.html?platform=${platform}&party&file=${file}`);
  await page.waitForFunction(()=>window.__partyReport?.ready,null,{timeout:5500});console.log('PASS app path bypasses six-second probe',platform,file,Date.now()-start,'ms');
  await page.evaluate(()=>Object.assign(window.__testParty.snapshot.room,{paused:false,waiting:false,anchor_at:new Date().toISOString()}));
  await page.waitForFunction(()=>{const v=document.querySelector('video.activevideo');return v&&v.currentTime>1&&v.webkitAudioDecodedByteCount>0});
 }
 await page.goto('http://127.0.0.1:5175/tests/navigation-077.html');await page.getByRole('button',{name:'Discover'}).click();await page.getByRole('button',{name:'Settings'}).click();await page.goBack();assert.equal(await page.locator('h1').innerText(),'Discover');await page.goBack();assert.equal(await page.locator('h1').innerText(),'Home');console.log('PASS Android history returns Settings → Discover → Home');
}finally{await browser.close();await server.close()}
