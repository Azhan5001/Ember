import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {catalogJobs,catalogLabel,genreOptions,normalizeItem,matchesGenres} from '../src/catalog-core.mjs';
import {AIO_BASE,matchesFacets} from '../src/metadata-provider.mjs';
const aio={base:AIO_BASE,enabled:true,manifest:JSON.parse(fs.readFileSync(new URL('../src/aiometadata-manifest.json',import.meta.url)))};
const backup={enabled:true,manifest:{id:'com.linvo.cinemeta',catalogs:[{id:'top',type:'movie'}]}};
test('Cinemeta leads Home, followed by curated MAL rows; AIOMetadata supplies search',()=>{
 const rows=catalogJobs([aio,backup],'all','',{lazy:true});assert.equal(rows[0].addon,backup);assert.deepEqual(rows.slice(1,5).map(j=>j.view||j.catalog.id),['mal.airing','mal.season_top_new','mal.top_series','mal.top_movies']);assert.ok(rows.filter(j=>j.addon===aio).every(j=>!j.name.includes('AIOMetadata')));
 const search=catalogJobs([backup,aio],'all','Severance');assert.equal(search.length,4);assert.ok(search.every(j=>j.addon===aio&&j.extra.search==='Severance'));
 assert.equal(catalogJobs([{...aio,enabled:false},backup]).length,1);
});
test('genre picker preserves common labels, includes richer tags and excludes schedule/language noise',()=>{
 const tags=genreOptions([aio]);assert.ok(tags.includes('Adult Cast'));assert.ok(tags.includes('Sci-Fi'));assert.equal(tags.filter(x=>/^(Sci-Fi|Science Fiction)$/.test(x)).length,1);
 for(const tag of ['None','Day','Week','Monday','English','Fall 2026','2026'])assert.ok(!tags.includes(tag),tag);
});
test('year language and studio facets use the corresponding provider feed without inventing genre labels',()=>{
 for(const [facet,value] of [['year','2024'],['language','Korean'],['studio','MAPPA']]){
 const jobs=catalogJobs([aio],'all','',{facets:{[facet]:value}});assert.ok(jobs.length>0);assert.ok(jobs.every(j=>j.extra.genre===value));
 const item=normalizeItem({id:'tt12345',name:'Fixture',genres:['Drama']},jobs[0]);assert.equal(matchesFacets(item,{[facet]:value}),true);assert.equal(matchesGenres(item,[value]),false);
 }
});
test('anime resource types and upstream episode stream IDs survive normalization',()=>{
 const item=normalizeItem({id:'mal:1',type:'anime.movie',imdb_id:'tt12345',name:'Anime',videos:[{id:'tt12345:1:2'}]},{catalog:{type:'anime.movie'},addon:aio});assert.equal(item.type,'movie');assert.equal(item.resourceType,'anime.movie');assert.equal(item.videos[0].id,'tt12345:1:2');
});
