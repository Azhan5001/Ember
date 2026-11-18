import test from 'node:test';import assert from 'node:assert/strict';
import {catalogJobs,extras,genreOptions,normalizeItem,matchesGenres,mergeItems,sortItems,resourceTypeFor} from '../src/catalog-core.mjs';
import {artworkCandidates} from '../src/artwork-core.mjs';import {supports,resourceUrl} from '../src/core.mjs';
const addon=(catalogs)=>({base:'https://fixture.invalid',enabled:true,manifest:{name:'Fixture',types:['anime','movie','series'],resources:['catalog','meta','stream'],catalogs}});
test('all catalogs and custom types are planned without a four-row cap',()=>{
 const a=addon(Array.from({length:40},(_,i)=>({type:i%2?'anime':'series',id:'c'+i})));
 assert.equal(catalogJobs([a]).length,40);assert.equal(catalogJobs([a],'series').filter(j=>j.type==='anime').length,20);
});
test('required search/context feeds do not become unusable home rows; legacy extras work',()=>{
 const a=addon([{type:'anime',id:'search',extraSupported:['search','skip'],extraRequired:['search']},{type:'series',id:'progress',extra:[{name:'lastVideosIds',isRequired:true}]},{type:'movie',id:'year',extra:[{name:'genre',isRequired:true,options:['2026']}]}]);
 assert.equal(catalogJobs([a]).length,1);assert.equal(catalogJobs([a])[0].extra.genre,'2026');assert.equal(catalogJobs([a],'all','frieren').length,2);assert.equal(extras(a.manifest.catalogs[0])[0].isRequired,true);
});
test('genre AND is exact and retains one server prefilter while checking remaining genres locally',()=>{
 const a=addon([{type:'series',id:'top',extra:[{name:'genre',options:['Action','Romance']}]}]);
 const j=catalogJobs([a],'all','',{genres:['Action','Romance']})[0];assert.equal(j.extra.genre,'Action');
 const i=normalizeItem({id:'tt1',type:'series',name:'Both',genres:['Romance']},j);
 assert.equal(matchesGenres(i,['Action','Romance']),true);assert.equal(matchesGenres(i,['Action','Horror']),false);assert.equal(matchesGenres(i,['Act']),false);
});
test('anime provenance and explicit Korean drama classification survive normalization and merging',()=>{
 const i=normalizeItem({id:'kitsu:1',type:'anime',name:'Anime',description:'Genres: Action, Fantasy\nTags: Stuff'}, {catalog:{type:'anime'},addon:{base:'fixture'}});
 assert.equal(matchesGenres(normalizeItem({id:'tt-jp',type:'series',genres:['Animation'],country:'Japan'}),['Anime']),true);
 assert.equal(matchesGenres(normalizeItem({id:'tt-us',type:'series',genres:['Animation'],country:'USA'}),['Anime']),false);
 assert.equal(i.type,'series');assert.equal(i.resourceType,'anime');assert.equal(matchesGenres(i,['Anime','Fantasy']),true);
 assert.equal(matchesGenres(normalizeItem({id:'tt2',type:'series',genres:['Drama'],country:'South Korea'}),['K-drama']),true);
 assert.equal(matchesGenres(normalizeItem({id:'tt3',type:'series',genres:['Drama'],country:'Japan'}),['K-drama']),false);
 assert.equal(matchesGenres(mergeItems([i,{...i,categories:[],genres:['Romance']}])[0],['Anime','Action','Romance']),true);
});
test('sort does not equate vote counts to ratings or completed shows to top airing',()=>{
 const items=[{id:'a',imdbRating:'9.0',votes:10},{id:'b',imdbRating:'8.0',votes:1000},{id:'c',ranks:{airing:0}},{id:'d'}];
 assert.deepEqual(sortItems(items,'rating').map(i=>i.id),['a','b','c','d']);assert.deepEqual(sortItems(items,'votes').map(i=>i.id),['b','a','c','d']);assert.deepEqual(sortItems(items,'airing').map(i=>i.id),['c','a','b','d']);
});
test('provider-declared sort extras, genre choices and resource types remain interoperable',()=>{
 const a=addon([{type:'anime',id:'feed',extra:[{name:'sort',options:['Popular','Top Airing']},{name:'genre',options:['Shounen','2026']}]}]);
 assert.equal(catalogJobs([a],'all','',{sort:'airing'})[0].extra.sort,'Top Airing');assert.ok(genreOptions([a]).includes('Shounen'));assert.ok(!genreOptions([a]).includes('2026'));
 const m={resources:[{name:'stream',types:['anime'],idPrefixes:['kitsu']}],types:['anime']};
 const t=resourceTypeFor(m,'stream','series','kitsu:1:1',undefined,supports);assert.equal(t,'anime');assert.match(resourceUrl(a.base,'stream',t,'kitsu:1:1'),/stream\/anime\/kitsu%3A1%3A1.json/);
});
test('artwork fallbacks only use supplied URLs or exact IDs, never title guesses',()=>{
 assert.deepEqual(artworkCandidates({id:'kitsu:1',name:'Naruto',poster:'https://a',posters:['https://b','https://a']}),['https://a','https://b']);
 assert.match(artworkCandidates({id:'tt123',name:'Any'})[0],/metahub.*tt123/);assert.deepEqual(artworkCandidates({id:'custom',name:'Any'}),[]);
});

test('catalogs without a search endpoint remain locally searchable instead of disappearing',()=>{const jobs=catalogJobs([addon([{type:'anime',id:'seasons'}])],'all','Frieren');assert.equal(jobs[0].localSearch,'Frieren');assert.equal(jobs[0].extra.search,undefined);});
