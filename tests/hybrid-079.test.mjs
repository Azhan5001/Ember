import test from 'node:test';import assert from 'node:assert/strict';import {buildSync} from 'esbuild';import vm from 'node:vm';
import {catalogJobs,normalizeItem,sortItems,matchesGenres} from '../src/catalog-core.mjs';
import {catalogItems} from '../src/metadata-provider.mjs';import {applyRating,ratingId} from '../src/ratings-core.mjs';import {features,recommend} from '../src/recommendation-core.mjs';
const ctx={module:{exports:{}}};vm.runInNewContext(buildSync({entryPoints:['src/defaults.ts'],bundle:true,write:false,format:'cjs'}).outputFiles[0].text,ctx);const essentials=JSON.parse(JSON.stringify(ctx.module.exports.essentials));
test('original six Cinemeta rows precede MAL airing, weekly premieres and separate top series/movies',()=>{
 const rows=catalogJobs(essentials,'all','',{lazy:true});assert.deepEqual(rows.slice(0,6).map(r=>r.catalog.id+':'+r.type),['top:movie','top:series','year:movie','year:series','imdbRating:movie','imdbRating:series']);
 assert.deepEqual(rows.slice(6,10).map(r=>r.view||r.catalog.id),['mal.airing','mal.season_top_new','mal.top_series','mal.top_movies']);
 const custom={base:'https://custom.invalid',enabled:true,manifest:{name:'Custom',catalogs:[{id:'feed',type:'movie'}]}};assert.equal(catalogJobs([custom,...essentials],'all','',{lazy:true}).at(-1).addon,custom);
});
test('dedicated MAL weekly and top movie feeds preserve upstream resource types',()=>{
 const rows=catalogJobs(essentials,'all','',{lazy:true});const movies=rows.find(r=>r.catalog.id==='mal.top_movies');assert.equal(movies.type,'anime');assert.equal(rows.find(r=>r.catalog.id==='mal.season_top_new').extra.genre,undefined);assert.deepEqual(catalogItems([{id:'tv',type:'series'},{id:'film',type:'movie'}],movies).map(i=>i.id),['film']);
});
test('IMDb votes override conflicting catalog counts and scores; genre AND remains exact',()=>{
 const a=applyRating({id:'a',vote_count:900000,imdbRating:10},{score:7,votes:10}),b=applyRating({id:'b',vote_count:2,imdbRating:2},{score:9,votes:10000});
 assert.deepEqual(sortItems([a,b],'votes').map(i=>i.id),['b','a']);assert.deepEqual(sortItems([a,b],'rating').map(i=>i.id),['b','a']);assert.equal(ratingId({id:'mal:42',_imdbId:'tt12345'}),'tt12345');
 const item=normalizeItem({id:'tt1',type:'series',genres:['Drama'],keywords:[{name:'Time Travel'}]});assert.equal(matchesGenres(item,['Drama','Time Travel']),true);assert.equal(matchesGenres(item,['Drama','Comedy']),false);
});
test('recommendations understand richer metadata and exclude watched aliases across providers',()=>{
 const watched={id:'tt10001',type:'series',name:'Watched anime',genres:['Sci-Fi'],keywords:['time travel'],_originalLanguage:'ja',studios:['Studio A']};
 const history={'series:tt10001':{item:watched,qualifiedAt:1,lastWatched:Date.now(),fraction:1,completedEpisodes:3}};
 const similar={id:'mal:2',type:'series',name:'Related',genres:['Science Fiction'],keywords:['time travel'],language:'Japanese',studios:['Studio A'],imdbRating:8};
 const other={id:'tt30000',type:'series',name:'Different',genres:['Romance'],language:'English',imdbRating:8};
 const alias={...watched,id:'mal:1',imdb_id:'tt10001'};
 assert.ok(features(similar).has('genre:sci-fi'));assert.ok(features(watched).has('language:japanese'));assert.ok(features(similar).has('tag:time travel'));
 const result=recommend([other,alias,similar],history);assert.equal(result[0].id,'mal:2');assert.ok(!result.some(i=>i.id==='mal:1'));assert.ok(recommend([similar,other],{}).every(i=>!i.recommendationReason.includes('Watched anime')));
});

import {ensurePeople,enterProfile} from '../src/profile-core.mjs';
test('updated bundled metadata reaches existing guest and isolated/shared profiles without changing private addons',()=>{
 const current=essentials.find(a=>a.manifest.id==='aio-metadata'),old={...current,enabled:false,manifest:{...current.manifest,catalogs:[]}},custom={...old,base:'https://configured.invalid/custom'};
 const empty={addons:essentials,settings:{},history:{},progress:{},library:[]};
 const part={...empty,addons:[old,custom]};
 let state={...part,addonDefaultsVersion:5,_people:{version:2,owner:null,activeId:'guest',guest:part,guestProviderDefaultsVersion:2,guestDefaultsVersion:3,accounts:{owner:{addonDefaultsVersion:3,sharedAddons:[old,custom],profiles:[{id:'main',name:'You',isolatedAddons:true}],spaces:{main:part}}}}};
 state=ensurePeople(state,empty);assert.ok(state.addons[0].manifest.catalogs.some(c=>c.id==='mal.season_top_new'));assert.equal(state.addons[0].enabled,false);assert.equal(state.addons[1],custom);
 state=enterProfile(state,'owner','main',empty);assert.ok(state.addons[0].manifest.catalogs.some(c=>c.id==='mal.top_movies'));assert.equal(state.addons[0].enabled,false);assert.deepEqual(state.addons[1],custom);
});
