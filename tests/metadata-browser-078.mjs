import assert from 'node:assert/strict';import {chromium} from '@playwright/test';import {createServer} from 'vite';import {AIO_BASE} from '../src/metadata-provider.mjs';
const server=await createServer({server:{host:'127.0.0.1',port:5175,strictPort:true}});await server.listen();const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();let calls=0,fail=false;
 await page.route(AIO_BASE+'/**',route=>{calls++;return fail?route.fulfill({status:503,body:'Unavailable'}):route.fulfill({json:{metas:[{id:'tt12345',name:'Fixture',type:route.request().url().includes('/movie/')?'movie':'series',genres:['Drama']}]}})});
 await page.route('https://v3-cinemeta.strem.io/**',route=>route.fulfill({json:{metas:[{id:'tt22222',name:'Backup title',type:'movie'}]}}));
 await page.route('https://api.tvmaze.com/**',route=>route.fulfill({json:[]}));
 await page.goto('http://127.0.0.1:5175/tests/metadata-078.html');await page.waitForFunction(()=>window.__metadataTest);
 assert.ok(await page.locator('.genrechips').evaluate(e=>e.clientHeight<=184));await page.getByRole('button',{name:'Show more'}).click();assert.ok(await page.locator('.genrechips').evaluate(e=>e.scrollHeight>e.clientHeight&&getComputedStyle(e).overflowY==='auto'));
 await page.getByRole('textbox',{name:'Search genres and tags'}).fill('adult cast');await page.getByRole('button',{name:'Adult Cast',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Adult Cast',exact:true}).getAttribute('aria-pressed'),'true');console.log('PASS four-row genre preview, expanded scroll and tag search');
 const result=await page.evaluate(async()=>{const t=window.__metadataTest;return (await t.catalogs(t.essentials.filter(a=>a.manifest.id==='aio-metadata'),'all','',{lazy:true})).items.length});assert.ok(result>0);const initial=calls;
 await page.reload();await page.waitForFunction(()=>window.__metadataTest);await page.evaluate(async()=>{const t=window.__metadataTest;await t.catalogs(t.essentials.filter(a=>a.manifest.id==='aio-metadata'),'all','',{lazy:true});});assert.equal(calls,initial);console.log('PASS catalog cache survives reload without upstream requests');
 fail=true;const fallback=await page.evaluate(async()=>{const t=window.__metadataTest;const r=await t.catalogs(t.essentials,'all','Backup title',{force:true});return r.items.map(i=>i.name);});assert.ok(fallback.includes('Backup title'));console.log('PASS provider failure automatically loads hidden backup');
 await page.setViewportSize({width:390,height:844});assert.ok(await page.locator('body').evaluate(e=>e.scrollWidth<=innerWidth));console.log('PASS mobile filter fits screen');
}finally{await browser.close();await server.close();}
