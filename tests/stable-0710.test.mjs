import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {buildSync} from 'esbuild';
import {catalogJobs,genreOptions,normalizeItem,sortItems} from '../src/catalog-core.mjs';
import {isAdultItem,isAdultTag} from '../src/content-filter.mjs';import {refreshBundledMetadata,AIO_BASE} from '../src/metadata-provider.mjs';import {ensurePeople,enterProfile} from '../src/profile-core.mjs';import {applyRating} from '../src/ratings-core.mjs';
const ctx={module:{exports:{}}};vm.runInNewContext(buildSync({entryPoints:['src/defaults.ts'],bundle:true,write:false,format:'cjs'}).outputFiles[0].text,ctx);const essentials=JSON.parse(JSON.stringify(ctx.module.exports.essentials));
test('stable catalogs use original Cinemeta order followed by Anime Seasons; metadata provider has no catalog jobs',()=>{
 const rows=catalogJobs(essentials,'all','',{lazy:true});assert.deepEqual(rows.slice(0,6).map(r=>r.catalog.id+':'+r.type),['top:movie','top:series','year:movie','year:series','imdbRating:movie','imdbRating:series']);assert.ok(rows.slice(6,10).every(r=>r.addon.manifest.id==='animes-season-addon'));assert.ok(!rows.some(r=>r.addon.manifest.id==='aio-metadata'));
 const search=catalogJobs(essentials,'all','Severance').filter(r=>!r.cachedOnly);assert.equal(search.length,2);assert.ok(search.every(r=>r.addon.manifest.id==='com.linvo.cinemeta'));assert.deepEqual(search.map(r=>r.type),['movie','series']);
});
test('movie and series genres lead tags; explicit content and tags follow the setting',()=>{
 const tags=genreOptions(essentials);assert.deepEqual(tags.slice(0,4),['Action','Adventure','Comedy','Drama']);for(const t of ['Sex','Hentai','Ecchi','Mature'])assert.ok(!tags.includes(t));const all=genreOptions(essentials,{hideAdult:false});for(const t of ['Sex','Hentai','Ecchi','Mature'])assert.ok(all.includes(t));
 assert.ok(isAdultItem({genres:['Hentai']}));assert.ok(isAdultItem({app_extras:{certification:'TV-MA'}}));assert.ok(isAdultItem({keywords:[{name:'sexual intercourse'}]}));assert.equal(isAdultItem({genres:['Adult Cast','Drama']}),false);assert.equal(isAdultTag('Comedy'),false);assert.ok(normalizeItem({id:'tt1',type:'movie',adult:true}).genres.includes('Mature'));
});
test('metadata configuration migrates guest and isolated spaces while custom addons stay intact',()=>{
 const current=essentials.find(a=>a.manifest.id==='aio-metadata'),old={...current,base:'https://aiometadata.elfhosted.com/stremio/23e5c3c4-cc2f-40a8-8608-8fd2f51fc5cb',enabled:false},custom={...old,base:'https://custom.invalid/metadata'};
 const empty={addons:essentials,settings:{},history:{},progress:{},library:[]},part={...empty,addons:[old,custom]};let s=ensurePeople({...part,_people:{version:2,owner:null,activeId:'guest',guest:part,guestProviderDefaultsVersion:2,guestDefaultsVersion:3,accounts:{owner:{addonDefaultsVersion:3,sharedAddons:[old,custom],profiles:[{id:'main',name:'You',isolatedAddons:true}],spaces:{main:part}}}}},empty);
 assert.equal(s.addons.find(a=>a.base===AIO_BASE).enabled,false);assert.ok(s.addons.includes(custom));s=enterProfile(s,'owner','main',empty);assert.equal(s.addons.find(a=>a.base===AIO_BASE).manifest.catalogs.length,0);assert.ok(s.addons.some(a=>a.manifest.id==='animes-season-addon'));
});
test('IMDb counts still override provider counts in rating sorts',()=>{const a=applyRating({id:'a',vote_count:999999},{score:7,votes:20}),b=applyRating({id:'b',vote_count:1},{score:9,votes:3000});assert.equal(sortItems([a,b],'votes')[0].id,'b');assert.equal(sortItems([a,b],'rating')[0].id,'b')});
