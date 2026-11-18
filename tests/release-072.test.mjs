import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {animeEpisodeMappings,matchEpisode,mergeEpisode,enrichMetadata,trailerId,tvmazeItem} from '../src/metadata-core.mjs';
import {continueItems} from '../src/progress-state.mjs';
import {compactForStorage} from '../src/profile-core.mjs';
import {driftCorrection} from '../src/party-core.mjs';
import {matchesGenres,normalizeItem} from '../src/catalog-core.mjs';
const ep1={id:'tt13196080:3:1',season:3,episode:1,title:'The Longest Day',released:'2023-10-03'},ep2={id:'tt13196080:3:2',season:3,episode:2,released:'2023-10-10'};
const item={id:'tt13196080',type:'series',name:'Tokyo Revengers',videos:[ep1,ep2]};
test('season-specific MAL mapping and episode offsets prevent first-season reuse',()=>{
 const rows=JSON.parse(fs.readFileSync(new URL('../public/data/anime-mappings.json',import.meta.url)));
 assert.deepEqual(animeEpisodeMappings(rows,item,ep1).map(({mal,episode})=>({mal,episode})),[{mal:54918,episode:1}]);
 assert.equal(animeEpisodeMappings(rows,item,{season:4,episode:1})[0].mal,59088);
 assert.deepEqual(animeEpisodeMappings(rows,item,{season:9,episode:1}),[]);
});
test('episode date/title resolves conflicting season numbering, preserves playable ID',()=>{
 const external={season:1,number:38,name:'The Longest Day',airdate:'2023-10-03',image:{original:'https://images.example/right.jpg'},rating:{average:8.2},summary:'<p>Summary</p>'};
 const matched=matchEpisode(ep1,[{...external,airdate:'2021-01-01',name:'Other'},external]);
 const merged=mergeEpisode(ep1,matched);
 assert.equal(merged.id,ep1.id);assert.equal(merged.thumbnail,external.image.original);assert.equal(merged.rating,8.2);assert.equal(merged.description,'Summary');
 assert.equal(matchEpisode({...ep1,title:'Different',released:'2024-01-01'},[external]),undefined);
});
test('provider enrichment fills tags and rating counts without replacing stream IDs',()=>{
 const result=enrichMetadata({...item,genres:['Action'],videos:[{...ep1,thumbnail:'https://bad.example/image'}]}, {...item,genres:['Anime'],imdbVotes:32000,videos:[{...ep1,thumbnail:'https://good.example/image'}]});
 assert.deepEqual(result.genres,['Action','Anime']);assert.equal(result.imdbVotes,32000);assert.equal(result.videos[0].thumbnails[0],'https://good.example/image');
});
test('Korean language and genre aliases produce real AND matches',()=>{
 const value=normalizeItem(tvmazeItem({id:1,name:'Drama',type:'Scripted',language:'Korean',genres:['Drama','Science-Fiction'],externals:{imdb:'tt1234567'},rating:{average:8}}));
 assert.ok(matchesGenres(value,['K-drama','Sci-Fi']));assert.ok(!matchesGenres(value,['K-drama','Horror']));
});
test('finishing an episode continues to the next and never resurfaces stale episodes',()=>{
 const old={item,video:ep1,vid:ep1.id,watched:true,position:1500,duration:1600,updatedAt:10};
 let progress={['series:'+ep1.id]:old};
 assert.equal(continueItems(progress)[0].vid,ep2.id);assert.equal(continueItems(progress)[0].upNext,true);
 progress['series:'+ep2.id]={...old,video:ep2,vid:ep2.id,updatedAt:20};
 assert.equal(continueItems(progress).length,0);
 progress['series:'+ep2.id].hidden=true;assert.equal(continueItems(progress).length,0);
});
test('continue watching keeps unfinished current episodes and hides upcoming ones',()=>{
 const p={item,video:ep1,vid:ep1.id,position:100,duration:1000,updatedAt:1};
 assert.equal(continueItems({x:p})[0].vid,ep1.id);
 assert.equal(continueItems({x:{...p,watched:true}},Date.parse('2023-10-05')).length,0);
});
test('party correction uses a 650 ms dead zone with no continuous speed nudging',()=>{
 assert.equal(driftCorrection(10,10.65,true).seek,null);
 assert.equal(driftCorrection(10,10.66,true).seek,10.66);
 assert.equal(driftCorrection(10,9.34,true).seek,9.34);
 assert.equal(driftCorrection(NaN,100,true).seek,null);
});
test('stored progress preserves records while removing duplicated episode payloads',()=>{
 const s={progress:{a:{item,updatedAt:1},b:{item,updatedAt:2}}};
 const c=compactForStorage(s);assert.equal(c.progress.a.item.videos,undefined);assert.equal(c.progress.b.item.videos.length,2);assert.equal(s.progress.a.item.videos.length,2);
});
test('only validated YouTube IDs can enter trailer frames',()=>{
 assert.equal(trailerId({trailers:[{source:'idlLFNNpZiI'}]}),'idlLFNNpZiI');
 assert.equal(trailerId({trailers:[{source:'javascript:alert(1)'}]}),null);
});

test('search tolerates small typos and excludes unrelated results',async()=>{
 const {searchItems}=await import('../src/catalog-core.mjs');const list=[item,{id:'other',type:'series',name:'Black Clover'}];
 assert.equal(searchItems(list,'tokoy revengers')[0].id,item.id);assert.equal(searchItems(list,'tokyo revengrs').length,1);assert.equal(searchItems(list,'something unrelated').length,0);
});
