import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
test('privacy migration preserves scoped data, broadcasts legacy retirement and blocks old writes',async()=>{
 const db=new PGlite();const uid='00000000-0000-0000-0000-000000000001';
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select '${uid}'::uuid$$;insert into auth.users values('${uid}');`);
  await db.exec(fs.readFileSync('supabase/ember-multi-profile-migration.sql','utf8'));
  const call=async(changes=[],cursor=0)=>(await db.query('select ember_sync_v1($1,$2::jsonb) as result',[cursor,JSON.stringify(changes)])).rows[0].result;
  const initial=[['progress:series:old',{item:{id:'old'}},false],['history:series:erased',{item:{id:'erased'}},true],['account:profile:main',{id:'main'},false],['space:main:progress:series:kept',{item:{id:'kept'}},false]];
  await call(initial.map(([id,data,deleted],i)=>({id,data,deleted,base:0,mutation:'initial-'+i})));
  const sql=fs.readFileSync('supabase/ember-privacy-076.sql','utf8');await db.exec(sql);
  const repaired=await call([],4);assert.equal(repaired.records.length,2);
  assert.ok(repaired.records.every(r=>r.deleted&&r.data===null));
  assert.equal((await call()).records.find(r=>r.id.includes(':kept')).deleted,false);
  await db.exec(sql);assert.equal((await call([],repaired.head)).records.length,0);
  await assert.rejects(call([{id:'progress:series:old',data:{},deleted:false,base:5,mutation:'old-client'}]),/Update Ember/);
  const kept=(await call()).records.find(r=>r.id.includes(':kept'));
  await call([{id:kept.id,data:{private:'must be purged'},deleted:true,base:kept.revision,mutation:'delete-kept'}]);
  const removed=(await call()).records.find(r=>r.id===kept.id);assert.equal(removed.data,null);assert.equal(removed.deleted,true);
  const stale=await call([{id:kept.id,data:kept.data,deleted:false,base:kept.revision,mutation:'stale-device'}]);
  assert.equal(stale.conflicts[0].deleted,true);
 }finally{await db.close()}
});
