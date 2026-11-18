import test from 'node:test';
import assert from 'node:assert/strict';
import {pinDigest} from '../src/profile-core.mjs';
import {historyLock,historyAccessKey,unlockHistory,cooldown} from '../src/history-lock.mjs';
const state=(mode='off',pin=null,id='guest')=>({settings:{historyLock:{mode,pin}},_people:{owner:null,activeId:id,accounts:{}}});
test('guest can protect history with a separate salted PIN without an account',async()=>{
 const pin=await pinDigest('2468'),s=state('separate',pin,'test-separate');
 assert.equal(historyLock(s).mode,'separate');
 await assert.rejects(()=>unlockHistory(s,'0000'),/Incorrect/);
 assert.equal(await unlockHistory(s,'2468'),true);
 assert.equal(JSON.stringify(s).includes('2468'),false);
});
test('profile mode uses the current profile PIN without copying its digest into settings',async()=>{
 const pin=await pinDigest('8642');const s=state('profile');s._people={owner:'owner',activeId:'main',accounts:{owner:{profiles:[{id:'main',pin}]}}};
 assert.equal(await unlockHistory(s,'8642'),true);
 const before=historyAccessKey(s);s._people.accounts.owner.profiles[0].pin=await pinDigest('1234');
 assert.notEqual(before,historyAccessKey(s));await assert.rejects(()=>unlockHistory(s,'8642'),/Incorrect/);
 assert.equal(await unlockHistory(s,'1234'),true);
 s._people.accounts.owner.profiles[0].pin=null;await assert.rejects(()=>unlockHistory(s,'1234'),/unavailable/);
});
test('history access identity changes with profile and lock settings',()=>{
 assert.notEqual(historyAccessKey(state('off',null,'one')),historyAccessKey(state('off',null,'two')));
 assert.notEqual(historyAccessKey(state()),historyAccessKey(state('separate')));
});
test('five incorrect attempts enforce a cooldown across reopened checks',async()=>{
 const s=state('separate',await pinDigest('2468'),'test-cooldown'),now=100000;
 for(let n=0;n<5;n++)await assert.rejects(()=>unlockHistory(s,'0000',now));
 assert.equal(cooldown('local:test-cooldown',now),60);
 await assert.rejects(()=>unlockHistory(s,'2468',now+1000),/Too many/);
 assert.equal(await unlockHistory(s,'2468',now+60001),true);
});
test('portable PIN hashing matches Web Crypto for existing stored PINs',async()=>{
 const salt='000102030405060708090a0b0c0d0e0f';
 assert.deepEqual(await pinDigest('2468',salt,true),await pinDigest('2468',salt));
});
