import './long-playback-fixture.mjs';
import assert from 'node:assert/strict';import{chromium}from'@playwright/test';import{createServer}from'vite';
const server=await createServer({server:{host:'127.0.0.1',port:5175,strictPort:true}});await server.listen();const browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5175/tests/stable-0710.html');await page.waitForFunction(()=>window.test);
 const results=await page.evaluate(async()=>{
  const{catalogs,metadata,essentials,segmentDetails,render}=window.test,seen=[];
  const episode={id:'tt123:1:1',season:1,episode:1,title:'Released',released:'2020-01-01',thumbnail:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'};
  const future={...episode,id:'tt123:1:2',episode:2,title:'Upcoming',released:'2099-01-01',thumbnail:episode.thumbnail};
  window.fetch=async url=>{seen.push(String(url));if(String(url).includes('/meta/')){const aio=String(url).includes('aiometadata');if(aio)await new Promise(r=>setTimeout(r,350));return Response.json({meta:{id:'tt123',type:'series',name:'Anime',genres:['Animation'],videos:aio?[{...episode,id:'kitsu:123:1'},future]:[episode]}})}return Response.json({metas:[{id:'tt123',name:'Example',type:'movie',genres:['Drama']}]})};
  const custom={base:'https://local-fixture.invalid',enabled:true,manifest:{id:'custom',name:'Custom',types:['movie'],resources:['catalog'],catalogs:[{id:'feed',type:'movie'}]}};
  await catalogs([custom],'all','Example');const searchRequests=seen.length;const home=await catalogs([custom]);
  if(searchRequests!==0||home.items.length!==1||seen.length!==1)throw Error('Search poisoned Home cache');
  const cin=essentials.find(a=>a.manifest.id==='com.linvo.cinemeta');let snapshots=[];const rows=await catalogs([cin],'all','',{onUpdate:r=>snapshots.push(r.rows.map(x=>x.items.length))});
  if(!rows.rows.every(r=>r.items.length===1))throw Error('Overlapping titles removed from rows');
  let early=0;const begin=performance.now(),item=await metadata(essentials,{id:'tt123',type:'series',name:'Anime'},true,()=>early=performance.now()-begin);
  if(early>200||item.videos[0].id!==episode.id||item.videos[1].thumbnail!==future.thumbnail)throw Error('Metadata blocked early view or replaced episode identity/art');render(item);
  let finishSlow;const slow=new Promise(r=>finishSlow=r);let partial=[];
  const pending=segmentDetails({_imdbId:'tt36458668',id:'tmdb:123',type:'series'},{season:1,episode:5},2200,async url=>{if(url.includes('introdb'))return{intro:{start_sec:251,end_sec:312,confidence:1}};await slow;return{segments:{}}},s=>partial=s);
  await new Promise(r=>setTimeout(r,0));if(partial[0]?.start!==251)throw Error('Skip waits for slow provider');finishSlow();await pending;
  return{earlyMs:Math.round(early),rows:rows.rows.length};
 });
 await page.locator('.detail-episode').first().click();assert.equal(await page.evaluate(()=>window.played),'tt123:1:1');assert.equal(await page.locator('.detail-episode').nth(1).isDisabled(),true);console.log('PASS stable rows, search cache miss, early metadata, playable anime, upcoming artwork, independent skip providers',results);
 for(const ui of [false,true]){await page.goto('http://127.0.0.1:5175/tests/navigation-077.html');await page.getByRole('button',{name:'Discover',exact:true}).click();await page.getByRole('button',{name:'Play next'}).click();await page.getByRole('button',{name:'Play next'}).click();await page.getByRole('heading',{name:'Playing 2'}).waitFor();if(ui)await page.getByRole('button',{name:'Leave player'}).click();else await page.goBack();await page.getByRole('heading',{name:'Home',exact:true}).waitFor();}console.log('PASS hardware/browser and player Back return Home after changing episodes');
 await page.goto('http://127.0.0.1:5175/tests/stable-0710.html');await page.waitForFunction(()=>window.test);
 const cached=await page.evaluate(async()=>{const{cachedMetadata}=await import('/src/metadata-cache.mjs');let loads=0;const url='https://v3-cinemeta.strem.io/meta/movie/tt999000.json',load=async()=>{loads++;return{meta:{id:'tt999000',name:'Cached'}}};await cachedMetadata(url,load);await cachedMetadata(url,load);return loads});assert.equal(cached,1);
 await page.reload();await page.waitForFunction(()=>window.test);await page.evaluate(async()=>{const{cachedMetadata}=await import('/src/metadata-cache.mjs');const hit=await cachedMetadata('https://v3-cinemeta.strem.io/meta/movie/tt999000.json',async()=>{throw Error('Reload missed persistent cache')});if(hit.meta.name!=='Cached')throw Error('Invalid cached value');for(let n=0;n<105;n++)await cachedMetadata('https://v3-cinemeta.strem.io/meta/movie/tt88'+n+'.json',async()=>({meta:{id:'tt88'+n}}));});
 const cacheCount=await page.evaluate(()=>new Promise(resolve=>{const open=indexedDB.open('ember-public-metadata-v1');open.onsuccess=()=>{const request=open.result.transaction('responses').objectStore('responses').count();request.onsuccess=()=>resolve(request.result)}}));assert.ok(cacheCount<=100);console.log('PASS persistent cache survives reload and evicts beyond 100 entries');
 // Exercise a full browser buffer during a
 // continuous stream, including actual decoded audio and old-buffer eviction.
 await page.goto('http://127.0.0.1:5175/tests/stable-0710.html');await page.waitForFunction(()=>window.test);
 await page.evaluate(async()=>{const v=document.createElement('video');v.muted=true;document.body.append(v);window.v=v;window.quota=0;const append=SourceBuffer.prototype.appendBuffer;SourceBuffer.prototype.appendBuffer=function(data){if(v.currentTime>8&&!window.quota++){throw new DOMException('Injected full buffer','QuotaExceededError')}return append.call(this,data)};window.stream=await window.test.browserRemux(v,location.origin+'/tests/safari-long-0710.mkv',0,0,new AbortController().signal);await v.play();v.playbackRate=3});
 await page.waitForFunction(()=>window.v.currentTime>85||window.stream?.stream.error(),null,{timeout:60000});
 const sustained=await page.evaluate(()=>({time:v.currentTime,audio:v.webkitAudioDecodedByteCount,quota:window.quota,start:v.buffered.start(0),error:String(window.stream.stream.error()||'')}));assert.equal(sustained.error,'');assert.ok(sustained.time>85&&sustained.audio>0&&sustained.quota>0&&sustained.start>40);console.log('PASS 85 seconds of decoded playback, injected buffer-full recovery and buffer eviction',sustained);
}finally{await browser.close();await server.close()}
