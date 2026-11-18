import {launch} from './tauri-harness.mjs';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
const media=fs.readFileSync('tests/playback.webm');
let base;
const item={id:'tt1234567',type:'movie',name:'Audio fixture',background:'',poster:'',original_language:'ja'};
const manifest={id:'fixture.audio',name:'Audio Fixture',types:['movie'],resources:['catalog','meta','stream'],catalogs:[{type:'movie',id:'top'}]};
const server=http.createServer((req,res)=>{
 res.setHeader('Access-Control-Allow-Origin','*');
 const u=req.url;
 if(u.startsWith('/art')){res.setHeader('Content-Type','image/svg+xml');return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#6e435b"/></svg>');}
 if(u.startsWith('/video')){const m=req.headers.range?.match(/bytes=(\d+)-(\d*)/),start=Number(m?.[1]||0),end=m?.[2]?Number(m[2]):media.length-1;res.writeHead(m?206:200,{'Content-Type':'video/webm','Content-Length':end-start+1,'Accept-Ranges':'bytes',...(m?{'Content-Range':`bytes ${start}-${end}/${media.length}`}:{})});return res.end(media.subarray(start,end+1));}
 let data={};if(u.startsWith('/catalog'))data={metas:[{...item,background:base+'/art',poster:base+'/art'}]};
 if(u.startsWith('/meta'))data={meta:{...item,background:base+'/art',poster:base+'/art'}};
 if(u.startsWith('/stream'))data={streams:[{name:'1080p dual audio',url:base+'/video.webm'}]};
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ember-audio-v04-')),db=new DatabaseSync(path.join(dir,'ember.sqlite'));
db.exec('create table state(id integer primary key,data blob not null,encrypted integer not null)');
db.prepare('insert into state values(1,?,0)').run(Buffer.from(JSON.stringify({profile:'Guest',addonDefaultsVersion:3,addons:[{base,manifest,enabled:true}],settings:{native:false,quality:0},library:[],progress:{}})));db.close();
let app;
try{
 app=await launch(dir);const p=app.page;
 await p.locator('.hero').waitFor();
 await p.evaluate(()=>{window.__audioCalls=[];window.ember.native=async(url,position,headers)=>{window.__audioCalls.push({kind:'open',url,position});return true};window.ember.nativeCommand=async command=>{window.__audioCalls.push({kind:'command',command});return true};window.ember.nativeCancel=async()=>true;window.ember.nativeEvent=fn=>{window.__nativeListener=fn;return()=>{}};});
 await p.getByRole('button',{name:'Watch now',exact:true}).click();
 await p.waitForFunction(()=>{const v=document.querySelector('video.activevideo');return v&&!v.paused&&v.currentTime>1},{timeout:20000});
 await p.locator('video.activevideo').evaluate(v=>v.currentTime=8);
 await p.waitForFunction(()=>document.querySelector('video.activevideo')?.currentTime>=7.9);
 await p.mouse.move(510,310);await p.getByRole('button',{name:'Languages',exact:true}).click();
 await p.getByLabel('Audio for this series').selectOption('en');
 await p.waitForFunction(()=>window.__audioCalls.some(x=>x.kind==='open'),{timeout:15000});
 const opening=await p.evaluate(()=>window.__audioCalls.find(x=>x.kind==='open'));
 assert.equal(opening.url,base+'/video.webm');assert.ok(opening.position>=7.5);
 console.log('PASS Direct playback changes to the same source in native mode without losing position');
 await p.evaluate(()=>window.__nativeListener({event:'property-change',name:'track-list',data:[{type:'audio',id:1,lang:'jpn',title:'Japanese',selected:true},{type:'audio',id:2,lang:'eng',title:'English Dub',selected:false}]}));
 await p.waitForFunction(()=>window.__audioCalls.some(x=>x.kind==='command'&&x.command[1]==='aid'&&x.command[2]===2));
 console.log('PASS English selection chooses the English embedded track, not the Japanese track');
 fs.writeFileSync('../tauri-audio-v04-results.json',JSON.stringify({passed:2},null,2));
}catch(e){console.error(e);process.exitCode=1;if(app){console.error((await app.page.locator('body').innerText()).slice(-1400));await app.page.screenshot({path:'../tauri-audio-v04-failure.png'}).catch(()=>{})}}
finally{await app?.forceClose();server.closeAllConnections();server.close();}
