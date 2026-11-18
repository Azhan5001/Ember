import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {cloud} from './store';import {migrate} from './defaults';
import {capture,newMeta,receive,resolveConflicts,applyRecord} from './sync-core.mjs';
import {ensurePeople,ensureAccount,enterGuest,enterProfile,saveCurrent,setSyncEnabled} from './profile-core.mjs';
const empty=()=>migrate({profile:'You',settings:{},addons:[],library:[],progress:{}});
const intervalMs=(v:string)=>({daily:86400000,weekly:604800000,manual:Infinity}[v] || 86400000);
export default function CloudAccount({logoutRef,state,setState,onAccount,onNotice,visible}:any){
 const client=cloud(),[user,setUser]=useState<any>(null),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[code,setCode]=useState(''),[recovery,setRecovery]=useState(false),[working,setWorking]=useState(false),[status,setStatus]=useState('Local profile'),[target,setTarget]=useState<HTMLElement|null>(null);
 const [authReady,setAuthReady]=useState(false);
 const [mode,setMode]=useState<'signin'|'register'|'recover'|'verify'|'password'>('signin'),[formError,setFormError]=useState('');
 const ref=useRef(state),lock=useRef(false),retryAt=useRef(0),failures=useRef(0),uid=useRef('');ref.current=state;uid.current=user?.id || '';
 useEffect(()=>{let active=true;client.auth.getSession().then(({data})=>{if(active){setUser(data.session?.user || null);setAuthReady(true)}});const {data}=client.auth.onAuthStateChange((_event,s)=>queueMicrotask(()=>{if(active){setUser(s?.user || null);setAuthReady(true)}}));return()=>{active=false;data.subscription.unsubscribe()};},[]);
 useEffect(()=>{if(recovery || !authReady)return;onAccount(user?{id:user.id,email:user.email}:null);if(!user)setState((s:any)=>s?enterGuest(ensurePeople(s,empty())):s);},[user?.id,user?.email,recovery,authReady]);
 useEffect(()=>{setTarget(visible?document.getElementById('account-settings'):null)},[visible]);
 useEffect(()=>{if(user && state._people?.owner===user.id && state._people.accounts[user.id]?.syncEnabled && state._sync?.owner===user.id)setState((s:any)=>capture(s));},[state.settings,state.addons,state.progress,state.history,state.library,state.profile,state._people?.accounts[user?.id]?.profiles,state._people?.accounts[user?.id]?.syncEnabled,user?.id]);
 async function synchronize(direction:'both'|'to'|'from'='both'){
  if(lock.current || !user)return;lock.current=true;setWorking(true);const owner=user.id;
  try{
   let initial=ref.current._sync?.owner!==owner || !ref.current._sync?.ready;
   if(initial){
    setStatus('Downloading account…');
    const all:any[]=[];let cursor=0;
    while(true){const {data,error}=await client.rpc('ember_sync_v1',{p_cursor:cursor,p_changes:[]});if(error)throw error;if(uid.current!==owner)return;all.push(...data.records);cursor=data.cursor;if(!data.more)break;}
    setState((s:any)=>{
     if(uid.current!==owner)return s;
     let next=ensurePeople(s,empty());
     if(next._people.owner && next._people.owner!==owner)next=enterGuest(next);
     next=ensureAccount(next,owner,empty());
     const account=next._people.accounts[owner];
     const remoteV2=all.some(r=>r.id.startsWith('account:profile:'));
     if(remoteV2){
      next={...next,_people:{...next._people,accounts:{...next._people.accounts,[owner]:{...account,profiles:[],spaces:{},sharedAddons:[],addonDefaultsVersion:0}}}};
      for(const r of all) if(r.id.startsWith('account:') || r.id.startsWith('space:'))next=applyRecord({...next,_people:{...next._people,owner,activeId:'guest'}},r);
      next=ensurePeople(next,empty());
      const first=next._people.accounts[owner].profiles[0]?.id;
      if(first)next=enterProfile(next,owner,first,empty());
     } else {
      next=enterProfile(next,owner,account.profiles[0].id,empty());
      for(const r of all)next=applyRecord(next,r);
      next=saveCurrent(next);
     }
     next={...next,_sync:newMeta(owner)};
     next=receive(next,{records:all,cursor});
     if(!all.length)next=capture(next);
     ref.current=next;return next;
    });
    // React updates are asynchronous; continue on the next scheduler pass.
    setStatus('Account loaded; preparing changes…');retryAt.current=0;return;
   }
   setStatus(direction==='to'?'Uploading changes…':direction==='from'?'Downloading changes…':'Synchronizing…');
   for(let page=0;page<200;page++){
    const current=capture(ref.current),sent:any[]=direction==='from'?[]:Object.values(current._sync.pending).filter((op:any)=>!op.conflict).slice(0,50);ref.current=current;
    const {data,error}=await client.rpc('ember_sync_v1',{p_cursor:current._sync.cursor,p_changes:sent});if(error)throw error;if(uid.current!==owner)return;
    await new Promise<void>(resolve=>setState((s:any)=>{if(s._sync?.owner!==owner){resolve();return s;}const next=receive(capture(s),direction==='to'?{...data,records:[],cursor:s._sync.cursor}:data,sent);ref.current=next;queueMicrotask(resolve);return next;}));
    if(direction==='from'?!data.more:direction==='to'?!Object.values(ref.current._sync.pending).some((op:any)=>!op.conflict):!data.more&&!Object.values(ref.current._sync.pending).some((op:any)=>!op.conflict))break;
    if(page===199)throw Error('More data remains; use Sync now to continue.');
   }
   failures.current=0;retryAt.current=0;setStatus(direction==='to'?'Upload complete':direction==='from'?'Download complete. Local edits are preserved.':'Up to date');
  }catch(e:any){failures.current++;retryAt.current=Date.now()+Math.min(3600000,30000*2**Math.min(failures.current,7));setStatus((e.code==='PGRST202' || e.message?.includes('ember_sync_v1'))?'Database setup required: run ember-supabase-setup.sql.':'Cloud unavailable. Local changes are saved and will retry.');}
  finally{lock.current=false;setWorking(false)}
 }
 useEffect(()=>{
  if(!user || recovery)return;
  const tick=()=>{const s=ref.current;if(s._people?.accounts[user.id]?.syncEnabled===false || Date.now()<retryAt.current)return;const meta=s._sync;if(s._people?.owner!==user.id && s._people?.accounts[user.id]?.syncMeta?.ready)return;if(meta?.ready && s.settings.syncInterval==='manual')return;const pending=Object.values(meta?.pending || {}).some((op:any)=>!op.conflict);if(meta?.owner!==user.id || !meta?.ready || pending || Date.now()-(meta?.lastSync || 0)>intervalMs(s.settings.syncInterval || 'daily'))void synchronize();};
  const timer=setInterval(tick,10000);tick();window.addEventListener('online',tick);return()=>{clearInterval(timer);window.removeEventListener('online',tick)};
 },[user?.id,recovery]);
 async function auth(action:string){if(working)return;setFormError('');setWorking(true);try{
  let r:any;
  if(action==='Sign out'){r=await client.auth.signOut({scope:'local'});if(!r.error){setUser(null);setState((s:any)=>enterGuest(s));setMode('signin');}setStatus('Signed out. Data stays on this device.');}
  else if(action==='Verify email code'){r=await client.auth.verifyOtp({email:email.trim(),token:code.trim(),type:recovery?'recovery':'signup'});if(!r.error){if(recovery){setMode('password');onNotice('Code accepted. Choose your new password.');}else{setMode('signin');setCode('');}}}
  else if(action==='Set new password'){if(password.length<8)throw Error('Use at least 8 characters.');r=await client.auth.updateUser({password});if(!r.error){setRecovery(false);setPassword('');setMode('signin');onNotice('Password updated.');}}
  else if(action==='Forgot password'){r=await client.auth.resetPasswordForEmail(email.trim());if(!r.error){setRecovery(true);setMode('verify');onNotice('If the account exists, check its email for a recovery code.');}}
  else{if(password.length<8)throw Error('Use at least 8 characters.');r=action==='Sign in'?await client.auth.signInWithPassword({email:email.trim(),password}):await client.auth.signUp({email:email.trim(),password});if(!r.error){setPassword('');if(action==='Create account' && !r.data?.session){setRecovery(false);setMode('verify');}onNotice(action==='Create account'?'Check your email for the confirmation code.':'Signed in. Your account data is loading.');}}
  if(r?.error)throw r.error;
 }catch(e:any){setFormError(e.message || (typeof e==='string'?e:'Account request failed.'));onNotice(e.message || (typeof e==='string'?e:'Account request failed.'))}finally{setWorking(false)}}
 React.useImperativeHandle(logoutRef,()=>()=>void auth('Sign out'));
 const pending=Object.values(state._sync?.pending || {}),conflicts=pending.filter((o:any)=>o.conflict).length;
 const ui=<div className="panel cloudaccount"><h3>Your Ember account</h3><p>Settings, addons, library, history and continue watching stay local and sync with your account. Addon configuration can contain private access tokens; only your account can access its records.</p><p role="status">{user?.email || 'Not signed in'} · {status}</p>
 {user && formError && <p className="autherror" role="alert">{formError}</p>}
 {user && mode!=="password"?<><label className="settingline">Sync this account to other devices<input type="checkbox" aria-label="Sync this account to other devices" checked={state._people?.accounts[user.id]?.syncEnabled!==false} onChange={e=>setState((s:any)=>setSyncEnabled(s,user.id,e.target.checked))}/></label><div className="actions"><button className="primary" disabled={working||state._people?.accounts[user.id]?.syncEnabled===false} onClick={()=>{retryAt.current=0;void synchronize('to')}}>Sync to server</button><button className="glass" disabled={working||state._people?.accounts[user.id]?.syncEnabled===false} onClick={()=>{retryAt.current=0;void synchronize('from')}}>Sync from server</button><button className="glass" disabled={working} onClick={()=>auth('Sign out')}>Sign out</button></div><p>{pending.length} pending · Last sync: {state._sync?.lastSync?new Date(state._sync.lastSync).toLocaleString():'Never'}</p><label>Reconcile other devices<select aria-label="Cloud reconciliation schedule" value={state.settings.syncInterval || 'daily'} onChange={e=>setState((s:any)=>({...s,settings:{...s.settings,syncInterval:e.target.value}}))}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="manual">Manually</option></select></label><small>Sync to uploads changes. Sync from downloads server changes while preserving unsent local edits. Manual mode uses only these buttons; daily and weekly modes also sync automatically while open.</small>{conflicts>0&&<div className="panel"><h4>{conflicts} conflicting changes</h4><p>Another device changed the same records. Your local version is preserved until you choose.</p><button className="glass" onClick={()=>setState((s:any)=>resolveConflicts(s,false))}>Use cloud versions</button><button className="glass" onClick={()=>setState((s:any)=>resolveConflicts(s,true))}>Keep this device’s versions</button></div>}</>:<div className="authflow">
 <nav className="authtabs" aria-label="Account access"><button type="button" className={mode==='signin'?'selected':''} onClick={()=>{setMode('signin');setFormError('')}}>Sign in</button><button type="button" className={mode==='register'?'selected':''} onClick={()=>{setMode('register');setFormError('')}}>Create account</button></nav>
 <h4>{({signin:'Welcome back',register:'Your cinema, on every device',recover:'Reset your password',verify:'Check your email',password:'Choose a new password'})[mode]}</h4>
 <p>{mode==='register'?'Create an account to sync your library, addons and watch progress.':mode==='verify'?'Enter the verification code from your email.':mode==='recover'?'We will send a recovery code to your email.':'Your local library stays available when you are offline.'}</p>
 <form onSubmit={e=>{e.preventDefault();void auth(({signin:'Sign in',register:'Create account',recover:'Forgot password',verify:'Verify email code',password:'Set new password'})[mode])}}>
 {mode!=='password'&&<label>Email<input aria-label="Account email" type="email" autoComplete="email" required placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)}/></label>}
 {['signin','register','password'].includes(mode)&&<label>{mode==='password'?'New password':'Password'}<input aria-label="Account password" type="password" autoComplete={mode==='signin'?'current-password':'new-password'} minLength={8} required placeholder="At least 8 characters" value={password} onChange={e=>setPassword(e.target.value)}/></label>}
 {mode==='verify'&&<label>Email code<input aria-label="Email verification code" autoComplete="one-time-code" inputMode="numeric" required value={code} onChange={e=>setCode(e.target.value.trim())}/></label>}
 {formError&&<p role="alert" className="autherror">{formError}</p>}
 <button type="submit" className="primary" disabled={working}>{working?'Please wait…':({signin:'Sign in',register:'Create account',recover:'Send recovery code',verify:'Verify email code',password:'Set new password'})[mode]}</button>
 </form>
 <div className="authlinks">{mode==='signin'&&<><button className="textbutton" onClick={()=>{setMode('recover');setFormError('')}}>Forgot password?</button><button className="textbutton" onClick={()=>{setMode('verify');setRecovery(false);setFormError('')}}>I have a confirmation code</button></>}{!['signin','register'].includes(mode)&&<button className="textbutton" onClick={()=>{setMode('signin');setFormError('')}}>Back to sign in</button>}</div>
 </div>}</div>;
 return target?createPortal(ui,target):null;
}


