import test from 'node:test';
import assert from 'node:assert/strict';
import {ensurePeople,enterGuest,enterProfile,addProfile,editProfile,removeProfile,setSyncEnabled,pinDigest,verifyPin,saveCurrent,compactForStorage,snapshot} from '../src/profile-core.mjs';
import {capture,newMeta,project,applyRecord} from '../src/sync-core.mjs';
import {catalogJobs,mergeItems,sortItems} from '../src/catalog-core.mjs';
import {findAudioTrack,labeledAudioSource,audioLanguage} from '../src/audio-track-core.mjs';
import {prefersNative,missingVideoFrames} from '../src/video-frame-core.mjs';
const addon=(id)=>({base:'https://'+id+'.example',manifest:{id,name:id,resources:['catalog','stream'],catalogs:[{type:'movie',id:'top'}]},enabled:true});
const empty=()=>({profile:'Guest',settings:{quality:0},addons:[addon('cinemeta'),addon('opensubtitles')],library:[],progress:{}});
const owner='00000000-0000-0000-0000-000000000001';
test('guest and account spaces keep progress, settings, and addons apart',()=>{
 let s=ensurePeople({...empty(),profile:'Guest',library:[{type:'movie',id:'guest-film'}]},empty());
 s=enterProfile(s,owner,'main',empty());
 assert.equal(s.library.length,0);
 s={...s,settings:{...s.settings,quality:1080},library:[{type:'movie',id:'account-film'}],addons:[...s.addons,addon('shared')]};
 s=addProfile(s,owner,{id:'profile-2',name:'Second',avatar:12,isolatedAddons:false},empty());
 s=enterProfile(s,owner,'profile-2',empty());
 assert.ok(s.addons.some(a=>a.manifest.id==='shared'));
 assert.equal(s.settings.quality,0);
 s={...s,settings:{...s.settings,quality:720},progress:{second:{position:22}}};
 s=enterProfile(s,owner,'main',empty());
 assert.equal(s.settings.quality,1080);
 assert.equal(s.progress.second,undefined);
 s=enterGuest(s);
 assert.equal(s.profile,'Guest');
 assert.equal(s.settings.quality,0);
 assert.deepEqual(s.library.map(i=>i.id),['guest-film']);
 assert.equal(s.addons.some(a=>a.manifest.id==='shared'),false);
});
test('isolated addons, profile deletion and local sync setting',()=>{
 let s=enterProfile(ensurePeople(empty(),empty()),owner,'main',empty());
 s=addProfile(s,owner,{id:'profile-2',name:'Second',avatar:1,isolatedAddons:false},empty());
 s=editProfile(s,owner,'profile-2',{isolatedAddons:true});
 s=enterProfile(s,owner,'profile-2',empty());
 s={...s,addons:[...s.addons,addon('private')]};
 s=enterProfile(s,owner,'main',empty());
 assert.equal(s.addons.some(a=>a.manifest.id==='private'),false);
 s=setSyncEnabled(s,owner,false);
 assert.equal(s._people.accounts[owner].syncEnabled,false);
 s=removeProfile(s,owner,'profile-2');
 assert.equal(s._people.accounts[owner].profiles.length,1);
 assert.equal(s._people.accounts[owner].spaces['profile-2'],undefined);
});
test('PIN is salted, verifies four digits and never stores plaintext',async()=>{
 const a=await pinDigest('1234'),b=await pinDigest('1234');
 assert.notEqual(a.salt,b.salt);
 assert.notEqual(a.hash,b.hash);
 assert.equal(await verifyPin('1234',a),true);
 assert.equal(await verifyPin('4321',a),false);
 assert.equal(JSON.stringify(a).includes('1234'),false);
 await assert.rejects(pinDigest('12345'));
});
test('cloud projection includes every account profile but no guest records',()=>{
 let s=ensurePeople({...empty(),library:[{type:'movie',id:'guest'}]},empty());
 s=enterProfile(s,owner,'main',empty());
 s=addProfile(s,owner,{id:'profile-2',name:'Second',avatar:1,isolatedAddons:true},empty());
 s=enterProfile(s,owner,'profile-2',empty());
 s={...s,progress:{'movie:second':{item:{id:'second'},position:9}},_sync:newMeta(owner)};
 s=capture(s,()=>crypto.randomUUID());
 const ids=Object.keys(s._sync.pending);
 assert.ok(ids.includes('account:profile:main'));
 assert.ok(ids.includes('account:profile:profile-2'));
 assert.ok(ids.includes('space:profile-2:progress:movie:second'));
 assert.equal(ids.some(id=>id.includes('guest')),false);
 s=enterGuest(s);
 assert.deepEqual(project(s),{});
});
test('remote profile records apply to their own space',()=>{
 let s=enterProfile(ensurePeople(empty(),empty()),owner,'main',empty());
 s=applyRecord(s,{id:'account:profile:profile-2',data:{id:'profile-2',name:'Remote',avatar:3,isolatedAddons:false},deleted:false});
 s=applyRecord(s,{id:'space:profile-2:setting:quality',data:2160,deleted:false});
 assert.equal(s.settings.quality,0);
 s=enterProfile(s,owner,'profile-2',empty());
 assert.equal(s.settings.quality,2160);
});
test('TorrentioTB catalogs are omitted while stream addon remains enabled',()=>{
 const tb={...addon('tb'),manifest:{...addon('tb').manifest,name:'TorrentioTB'}};
 assert.equal(catalogJobs([addon('cinemeta'),tb],'movie').length,1);
 assert.equal(tb.enabled,true);assert.equal(catalogJobs([{...tb,manifest:{...tb.manifest,name:'TorrenioTB'}}],'movie').length,0);
});
test('different provider IDs for the same title merge; search ranks unknown metadata last',()=>{
 const results=mergeItems([{id:'provider:42',type:'movie',name:'Hope',year:'2026',provider:'other',imdbRating:'7.1'},{id:'tt1234567',type:'movie',name:'Hope',year:'2026',provider:'https://cinemeta.strem.io',description:'Rich'}]);
 assert.equal(results.length,1);assert.equal(results[0].id,'tt1234567');
 const ranked=sortItems([{name:'Unknown'},{name:'Good',imdbRating:'8.1'},{name:'Popular',popularity:100}],'popularity');
 assert.deepEqual(ranked.map(i=>i.name),['Popular','Good','Unknown']);
});
test('unsupported codec hints and progressing audio with no frames trigger native handoff',()=>{
 assert.equal(prefersNative({behaviorHints:{filename:'Hope.2026.DV.HEVC.mkv'}}),true);
 assert.equal(prefersNative({name:'H.264 AVC'}),false);
 assert.equal(missingVideoFrames({paused:false,readyState:4,videoWidth:0,getVideoPlaybackQuality:()=>({totalVideoFrames:0})},4),true);
 assert.equal(missingVideoFrames({paused:false,readyState:4,videoWidth:1920,getVideoPlaybackQuality:()=>({totalVideoFrames:30})},4),false);
});
import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
test('multi-profile SQL migration accepts scoped records and preserves account RLS',async()=>{
 const db=new PGlite();
 try{
  await db.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;insert into auth.users values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');");
  const sql=fs.readFileSync('supabase/ember-multi-profile-migration.sql','utf8');
  await db.exec(sql);await db.exec(sql);
  await db.exec("set role authenticated;select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false)");
  const op={id:'space:profile-2:setting:quality',base:0,mutation:'v2-1',data:1080,deleted:false};
  const a=(await db.query('select public.ember_sync_v1($1,$2::jsonb) result',[0,JSON.stringify([op])])).rows[0].result;
  assert.equal(a.records[0].id,op.id);
  await db.exec("select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false)");
  const b=(await db.query('select public.ember_sync_v1($1,$2::jsonb) result',[0,'[]'])).rows[0].result;
  assert.deepEqual(b.records,[]);
 }finally{await db.close();}
});

test('serialized profile state omits duplicate active data and restores it',()=>{let s=enterProfile(ensurePeople(empty(),empty()),owner,'main',empty());s={...s,library:[{type:'movie',id:'kept'}],_sync:newMeta(owner)};const compact=compactForStorage(s);assert.equal(compact._people.accounts[owner].spaces.main,undefined);const restored=ensurePeople(compact,empty());assert.equal(restored._people.accounts[owner].spaces.main.library[0].id,'kept');s=enterGuest(s);const g=compactForStorage(s);assert.equal(g._people.guest,null);assert.equal(ensurePeople(g,empty())._people.guest.profile,'Guest');});

test('Japanese to English audio selects the correct embedded track and source fallback',()=>{
 const tracks=[{type:'audio',id:1,lang:'jpn',title:'Japanese'},{type:'audio',id:2,lang:'eng',title:'English Dub'}];
 assert.equal(audioLanguage('Japanese'),'ja');
 assert.equal(audioLanguage('eng'),'en');
 assert.equal(findAudioTrack(tracks,'en').id,2);
 assert.equal(findAudioTrack(tracks,'ja').id,1);
 const sources=[{key:'current',name:'Japanese 1080p'},{key:'english',name:'English Dub 1080p'}];
 assert.equal(labeledAudioSource(sources,'en','current').key,'english');
});


test('old account archives migrate into isolated cached profiles without duplicate storage',()=>{const s=ensurePeople({...empty(),_sync:newMeta('a'),_guestBackup:{...empty(),profile:'Old guest'},_accountArchives:{b:{...empty(),profile:'Old B',_sync:newMeta('b')}}},empty());assert.equal(s._people.accounts.b.profiles[0].name,'Old B');assert.equal(s._people.guest.profile,'Guest');assert.equal('_accountArchives' in s,false);assert.equal('_guestBackup' in s,false);});

test('profile backup snapshot excludes other accounts and sync metadata',()=>{let s=enterProfile(ensurePeople(empty(),empty()),owner,'main',empty());s={...s,library:[{type:'movie',id:'current'}],_sync:newMeta(owner)};const file=snapshot(s);assert.equal(file.library[0].id,'current');assert.equal('_people' in file,false);assert.equal('_sync' in file,false);});
