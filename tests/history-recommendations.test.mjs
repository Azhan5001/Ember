import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeRanges,playbackRange,recordHistory,historyItems,eraseHistory} from '../src/history-core.mjs';
import {features,recommend} from '../src/recommendation-core.mjs';
import {ensurePeople,enterProfile,enterGuest,snapshot,compactForStorage} from '../src/profile-core.mjs';
import {capture,newMeta,applyRecord} from '../src/sync-core.mjs';
import {continueItems,mergeProgressState} from '../src/progress-state.mjs';
const movie={id:'tt1234567',type:'movie',name:'Moon voyage',year:'2024',genres:['Sci-Fi','Adventure'],language:'en',country:'US',description:'Astronauts explore distant planets aboard a spacecraft.'};
const series={...movie,id:'tt7654321',type:'series',name:'Orbital'};
const event=(item,vid,ranges,at=1000)=>({item,vid,ranges,duration:100,updatedAt:at});
test('movie qualifies at 5% unique coverage, not seeks or repeated ranges',()=>{let h=recordHistory({},event(movie,movie.id,[[0,4]]));assert.equal(historyItems(h).length,0);h=recordHistory(h,event(movie,movie.id,[[0,4]]));assert.equal(historyItems(h).length,0);h=recordHistory(h,event(movie,movie.id,[[80,81]]));assert.equal(historyItems(h).length,1);assert.equal(h['movie:'+movie.id].fraction,.05);assert.deepEqual(playbackRange({position:0,at:0},{position:80,at:1000}),[])});
test('series qualifies at 5% of any one episode, not the sum of short starts',()=>{let h={};for(const id of ['1:1','1:2'])h=recordHistory(h,event(series,id,[[0,4]]));assert.equal(historyItems(h).length,0);h=recordHistory(h,event(series,'1:2',[[4,5]]));assert.equal(historyItems(h).length,1);assert.equal(h['series:'+series.id].completedEpisodes,0);h=recordHistory(h,event(series,'2:1',[[0,90]]));assert.equal(h['series:'+series.id].completedEpisodes,1)});
test('range validation handles unknown durations, repeated overlaps, and malicious numeric data',()=>{
 assert.deepEqual(mergeRanges([[0,2]],Infinity),[]);
 assert.deepEqual(mergeRanges([[0,20],[10,40],[60,120],[NaN,9]],100),[[0,40],[60,100]]);
 assert.deepEqual(recordHistory({},event(movie,movie.id,[])),{});
});
test('continue removal does not erase history; clearing can preserve continue or hide without resurrection',()=>{
 const history=recordHistory({},event(movie,movie.id,[[0,40]]));
 const s={history,progress:{a:{item:movie,position:40,duration:100,updatedAt:1}}};
 const hidden={...s,progress:{a:{...s.progress.a,hidden:true}}};assert.equal(historyItems(hidden.history).length,1);
 const keep=eraseHistory(s,true);assert.deepEqual(keep.history,{});assert.equal(continueItems(keep.progress).length,1);
 const clear=eraseHistory(s,false);assert.equal(continueItems(clear.progress).length,0);
 assert.equal(continueItems(mergeProgressState(s,clear).progress).length,0);
 assert.deepEqual(eraseHistory(s,true,'movie:'+movie.id).history,{});
});
test('history stays isolated across profiles, compact save/reload and guest entry',()=>{
 const empty={profile:'Guest',settings:{},addons:[],library:[],progress:{},history:{}};
 let s=ensurePeople({...empty,history:recordHistory({},event(movie,movie.id,[[0,40]]))},empty);
 s=enterProfile(s,'owner','main',empty);assert.equal(historyItems(s.history).length,0);
 s={...s,history:recordHistory({},event(series,'1',[[0,95]]))};
 s=ensurePeople(compactForStorage(s),empty);
 s=enterGuest(s);assert.equal(historyItems(s.history).length,1);assert.equal(s.history['series:'+series.id],undefined);
 assert.ok(snapshot(s).history);
});
test('guest default migration removes only stock Torrentio once, preserving configured addons and explicit reinstalls',()=>{
 const stock={base:'https://torrentio.strem.fun',manifest:{id:'torrentio'}};
 const configured={base:'https://torrentio.strem.fun/private',manifest:{id:'torrentio'}};
 const empty={profile:'Guest',addons:[],settings:{},library:[],progress:{}};
 let s=ensurePeople({...empty,addons:[stock,configured]},empty);
 assert.deepEqual(s.addons,[configured]);
 s={...s,addons:[...s.addons,stock]};s=ensurePeople(s,empty);assert.equal(s.addons.length,2);
});
test('history records and deletions sync within their profile namespace',()=>{
 const empty={profile:'You',addons:[],settings:{},library:[],progress:{},history:{}};
 let s=enterProfile(ensurePeople(empty,empty),'owner','main',empty);
 s={...s,history:recordHistory({},event(movie,movie.id,[[0,40]])),_sync:newMeta('owner')};s=capture(s);
 const id='space:main:history:movie:'+movie.id;assert.ok(s._sync.pending[id]);
 const remote=applyRecord(s,{id,deleted:true});assert.equal(historyItems(remote.history).length,0);
});
test('personal recommendations favor matching metadata, exclude watched aliases, and explain matches',()=>{
 const h=recordHistory({},event(movie,movie.id,[[0,95]],Date.now()));
 const similar={...movie,id:'tt8888888',name:'The next voyage'};
 const other={id:'tt9999999',name:'Quiet romance',type:'movie',genres:['Romance'],language:'fr',imdbRating:'8'};
 const result=recommend([movie,{...movie,id:'alias'},other,similar],h);
 assert.equal(result[0].id,similar.id);assert.equal(result.length,2);
 assert.match(result[0].recommendationReason,/Moon voyage/);
});
test('cold start, sparse metadata, deduplication and cultural features do not invent nationality',()=>{
 const sparse={id:'a',name:'Unknown',type:'movie'};
 const list=recommend([sparse,sparse,{...sparse,id:'b',name:'Known',imdbRating:'9'}],{});
 assert.equal(list.length,2);assert.equal(list[0].id,'b');
 assert.ok(features({...sparse,original_language:'ko',categories:['K-drama']}).has('language:korean'));
 assert.equal([...features({...sparse,name:'French story'}).keys()].some(k=>k.startsWith('country:')),false);
 assert.deepEqual(recommend([],{}),[]);
});
