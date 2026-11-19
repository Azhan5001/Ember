import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeProgressState} from '../src/progress-state.mjs';
import {ensurePeople,enterProfile,addProfile,profileScope} from '../src/profile-core.mjs';
import {receive,newMeta,project,capture} from '../src/sync-core.mjs';
import {eraseHistory} from '../src/history-core.mjs';
const empty={profile:'Guest',settings:{},addons:[],library:[],progress:{},history:{}};
const watch={item:{id:'title',type:'series'},vid:'ep',position:20,duration:100,updatedAt:100};
function profiles(){let s=enterProfile(ensurePeople(empty,empty),'owner','main',empty);s={...s,progress:{'series:ep':watch}};return addProfile(s,'owner',{id:'profile-two',name:'Two',isolatedAddons:false},empty)}
test('native full-state merge never crosses sibling, account or guest boundaries',()=>{
 const first=profiles();const second=enterProfile(first,'owner','profile-two',empty);
 assert.notEqual(profileScope(first),profileScope(second));
 assert.deepEqual(mergeProgressState(first,second).progress,{});
 assert.deepEqual(mergeProgressState(first,{...empty,_people:{owner:null,activeId:'guest'}}).progress,{});
});
test('erased progress stays erased offline and queues a scoped cloud tombstone',()=>{
 let s={...profiles(),_sync:newMeta('owner')};
 s=capture(s);const pending=Object.values(s._sync.pending);
 s=receive(s,{acks:pending.map((op,i)=>({...op,revision:i+1})),records:[],cursor:pending.length},pending);
 const erased=eraseHistory(s,false,'series:title');
 assert.deepEqual(mergeProgressState(s,erased).progress,{});
 assert.equal(capture(erased)._sync.pending['space:main:progress:series:ep'].deleted,true);
});
test('legacy sync records and tombstones cannot change the open subprofile',()=>{
 let s=enterProfile(profiles(),'owner','profile-two',empty);s={...s,progress:{'series:ep':{...watch,position:8}},_sync:newMeta('owner')};
 const next=receive(s,{records:[{id:'progress:series:ep',revision:7,deleted:true,data:null},{id:'profile:name',revision:8,deleted:false,data:'Legacy name'}],cursor:8});
 assert.equal(next.progress['series:ep'].position,8);assert.equal(next.profile,'Two');
});
test('a newer scoped remote removal or rewind wins over an older local checkpoint',()=>{
 const s={...profiles(),_sync:{owner:'owner',revisions:{'space:main:progress:series:ep':1}}};
 const incoming={...s,progress:{'series:ep':{...watch,updatedAt:50,position:2}},_sync:{owner:'owner',revisions:{'space:main:progress:series:ep':2}}};
 assert.equal(mergeProgressState(s,incoming).progress['series:ep'].position,2);
 assert.deepEqual(mergeProgressState(s,{...incoming,progress:{}}).progress,{});
});
test('deletion markers are local to the profile and deliberate rewatch is allowed',()=>{
 const s=eraseHistory(profiles(),false);const sibling=enterProfile(s,'owner','profile-two',empty);
 assert.deepEqual(sibling._progressDeleted,{});
 const rewatch={...s,progress:{'series:ep':{...watch,position:1,updatedAt:Date.now()+1000}}};
 assert.equal(mergeProgressState(s,rewatch).progress['series:ep'].position,1);
 assert.equal(Object.keys(project(s)).some(k=>k.includes('_progressDeleted')),false);
});
test('a delayed full-state save cannot resurrect progress after erasure',()=>{
 const before=profiles(),erased=eraseHistory(before,false);
 const next=mergeProgressState(erased,before);
 assert.deepEqual(next.progress,{});
 assert.ok(next._progressDeleted['series:ep']>=watch.updatedAt);
});
