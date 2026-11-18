import {launch} from './tauri-harness.mjs';
import {PGlite} from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ember-profile-v04-'));
const db=new PGlite(),id='00000000-0000-0000-0000-000000000001',email='profiles@example.test';
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select '${id}'::uuid$$;insert into auth.users values('${id}');`);
await db.exec(fs.readFileSync('supabase/ember-supabase-setup.sql','utf8'));
const token=[{alg:'HS256',typ:'JWT'},{sub:id,exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000),aud:'authenticated',role:'authenticated'},'signature'].map(v=>typeof v==='string'?v:Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
const user={id,email,aud:'authenticated',role:'authenticated',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:new Date().toISOString()};
async function mock(p){
 await p.route('https://ifgohcjmrgetaxeykknc.supabase.co/**',async route=>{
  const u=route.request().url();
  if(u.includes('/auth/v1/token'))return route.fulfill({json:{access_token:token,refresh_token:'fixture-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user}});
  if(u.includes('/auth/v1/user'))return route.fulfill({json:user});
  if(u.includes('/rest/v1/rpc/ember_sync_v1')){const b=route.request().postDataJSON();try{const r=await db.query('select public.ember_sync_v1($1,$2::jsonb) result',[b.p_cursor,JSON.stringify(b.p_changes)]);return route.fulfill({json:r.rows[0].result});}catch(e){return route.fulfill({status:400,json:{message:e.message}})}}
  return route.fulfill({json:{}});
 });
}
let app;const results=[],ok=s=>{results.push(s);console.log('PASS',s)};
try{
 app=await launch(dir,{chooseGuest:false});const p=app.page;
 await mock(p);
 await p.locator('.profilegateway').waitFor();
 assert.equal(await p.locator('.profilegateway .profilechoice').count(),2);await p.screenshot({path:'../tauri-chooser-v04.png'});
 ok('First launch offers Guest and sign-in entry');
 await p.locator('.profilegateway .profilechoice').filter({hasText:'Guest'}).click();await p.waitForTimeout(1000);await p.screenshot({path:'../tauri-home-v04.png'});
 await p.getByRole('button',{name:'Settings',exact:true}).click();
 await p.getByLabel('Preferred quality').selectOption('720');
 ok('Guest playback preference is editable');
 await p.getByLabel('Account email',{exact:true}).fill(email);
 await p.getByLabel('Account password',{exact:true}).fill('fixture-password');
 await p.locator('.authflow form').getByRole('button',{name:'Sign in',exact:true}).click();
 await p.locator('.profilegateway .profilechoice').filter({hasText:'You'}).click({timeout:30000});
 await p.getByText('Up to date',{exact:false}).waitFor({timeout:30000});
 assert.equal(await p.getByLabel('Preferred quality').inputValue(),'0');
 ok('Account starts separately from guest settings');
 await p.getByRole('button',{name:'Account',exact:true}).click();
 await p.locator('.profilegateway .profilechoice').filter({hasText:'Add profile'}).click();
 await p.getByLabel('Profile name',{exact:true}).fill('Astra');
 await p.getByRole('button',{name:'Picture 13'}).click();
 await p.getByLabel('Keep addons separate for this profile').check();
 await p.getByLabel('New profile PIN').fill('2468');
 await p.getByRole('button',{name:'Save profile'}).click();
 await p.locator('.profilegateway .profilechoice').filter({hasText:'Astra'}).click();
 await p.getByLabel('Four-digit profile PIN').fill('1111');
 await p.getByRole('button',{name:'Unlock'}).click();
 await p.getByText('Incorrect PIN.').waitFor();
 await p.getByLabel('Four-digit profile PIN').fill('2468');
 await p.getByRole('button',{name:'Unlock'}).click();
 await p.locator('.profilegateway').waitFor({state:'hidden'});
 ok('Profile creation, picture selection and PIN gate work');
 await p.getByLabel('Preferred quality').selectOption('1080');
 await p.getByRole('button',{name:'Addons',exact:true}).click();
 const first=p.locator('.addon .toggle').first();assert.ok((await first.getAttribute('class')).includes('on'));await first.click();
 await p.getByRole('button',{name:'Account',exact:true}).click();
 await p.locator('.profilegateway .profilechoice').filter({hasText:'You'}).click();
 await p.getByRole('button',{name:'Settings',exact:true}).click();
 assert.equal(await p.getByLabel('Preferred quality').inputValue(),'0');
 await p.getByRole('button',{name:'Addons',exact:true}).click();
 assert.ok((await p.locator('.addon .toggle').first().getAttribute('class')).includes('on'));
 ok('Separate profile keeps playback settings and addons isolated');
 await p.getByRole('button',{name:'Settings',exact:true}).click();
 await p.getByRole('button',{name:'Sync now',exact:true}).click();
 for(let n=0;n<80;n++){const count=Number((await db.query("select count(*)::int as n from public.ember_sync_records where id like 'account:profile:%'")).rows[0].n);if(count===2)break;await new Promise(r=>setTimeout(r,250));}
 assert.equal(Number((await db.query("select count(*)::int as n from public.ember_sync_records where id like 'account:profile:%'")).rows[0].n),2);
 await p.getByRole('button',{name:'Sign out',exact:true}).click();
 await p.locator('.profilegateway .profilechoice').filter({hasText:'Guest'}).click();
 assert.equal(await p.getByLabel('Preferred quality').inputValue(),'720');
 const saved=await app.read();
 assert.equal(saved._people.owner,null);
 assert.equal(saved._people.accounts[id].profiles.length,2);
 assert.equal(JSON.stringify(saved).includes('"2468"'),false);
 ok('Sign out restores local guest and keeps account data sealed separately');
 await p.screenshot({path:'../tauri-profiles-v04.png'});
 await app.close();app=null;
 const second=fs.mkdtempSync(path.join(os.tmpdir(),'ember-profile-v04-second-'));
 app=await launch(second);const other=app.page;await mock(other);
 await other.getByRole('button',{name:'Settings',exact:true}).click();
 await other.getByLabel('Account email',{exact:true}).fill(email);
 await other.getByLabel('Account password',{exact:true}).fill('fixture-password');
 await other.locator('.authflow form').getByRole('button',{name:'Sign in',exact:true}).click();
 await other.locator('.profilegateway .profilechoice').filter({hasText:'Astra'}).click({timeout:30000});
 await other.getByLabel('Four-digit profile PIN').fill('2468');
 await other.getByRole('button',{name:'Unlock'}).click();
 await other.getByRole('button',{name:'Settings',exact:true}).click();
 assert.equal(await other.getByLabel('Preferred quality').inputValue(),'1080');
 await other.getByRole('button',{name:'Addons',exact:true}).click();
 assert.equal((await other.locator('.addon .toggle').first().getAttribute('class')).includes('on'),false);
 ok('Second device downloads isolated profile settings, PIN, and addon choice');
 fs.writeFileSync('../tauri-profiles-v04-results.json',JSON.stringify({passed:results.length,results},null,2));
}catch(e){console.error(e);process.exitCode=1;if(app){console.error((await app.page.locator('body').innerText()).slice(-2500));await app.page.screenshot({path:'../tauri-profiles-v04-failure.png'}).catch(()=>{})}}
finally{await app?.forceClose();await db.close();}


