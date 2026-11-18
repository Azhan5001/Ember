import React,{useEffect,useState} from 'react';
import {LockKeyhole} from 'lucide-react';
import {pinDigest} from './profile-core.mjs';
import {historyLock,unlockHistory,cooldown} from './history-lock.mjs';

export function HistoryGate({state,children}:any) {
  const lock=historyLock(state);
  const [unlocked,setUnlocked]=useState(false),[pin,setPin]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[wait,setWait]=useState(()=>cooldown(lock.scope));
  useEffect(()=>{const timer=setInterval(()=>setWait(cooldown(lock.scope)),1000);return()=>clearInterval(timer)},[lock.scope]);
  // Lock again when the app loses foreground focus or its tab becomes hidden.
  useEffect(()=>{const hide=()=>{setUnlocked(false);setPin('');};window.addEventListener('blur',hide);document.addEventListener('visibilitychange',hide);return()=>{window.removeEventListener('blur',hide);document.removeEventListener('visibilitychange',hide)}},[]);
  if(lock.mode==='off'||unlocked)return children;
  return <section className="historylocked"><LockKeyhole size={36}/><h1>History is locked</h1><p>{lock.mode==='profile'?'Enter your profile PIN to view history.':'Enter your history PIN to view history.'}</p><form className="pinform" onSubmit={async e=>{e.preventDefault();if(busy||wait)return;setBusy(true);setError('');try{await unlockHistory(state,pin);setUnlocked(true);setPin('')}catch(e:any){setError(e.message);setPin('');setWait(cooldown(lock.scope))}finally{setBusy(false)}}}><label htmlFor="history-unlock">Four-digit PIN</label><input id="history-unlock" aria-label="History PIN" type="password" autoComplete="off" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" required value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,''))} autoFocus/><button className="primary" disabled={busy||wait>0}>{wait?`Try again in ${wait}s`:busy?'Checking…':'Unlock history'}</button>{error&&<p className="autherror" role="alert">{error}</p>}</form></section>;
}

export function HistoryPrivacy({state,onSetting}:any) {
  const lock=historyLock(state);
  const [mode,setMode]=useState(lock.mode),[current,setCurrent]=useState(''),[profilePin,setProfilePin]=useState(''),[pin,setPin]=useState(''),[confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  return <section className="panel historyprivacy"><h3><LockKeyhole size={18}/>History privacy</h3><p>Lock only your History screen, or use the same PIN as this profile. Continue Watching and exported backups remain visible.</p><form onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setMessage('');try{
    if(lock.mode!=='off')await unlockHistory(state,current);
    if(mode==='profile'&&!lock.profile?.pin)throw Error('Add a profile PIN first using Manage profiles.');
    if(mode==='profile'&&lock.mode!=='profile')await unlockHistory({...state,settings:{...state.settings,historyLock:{mode:'profile'}}},profilePin);
    let config:any={mode};
    if(mode==='separate'){
      if(!/^\d{4}$/.test(pin))throw Error('Enter four digits for your new history PIN.');
      if(pin!==confirmation)throw Error('The new PINs do not match.');
      config.pin=await pinDigest(pin);
    }
    onSetting({historyLock:config});setCurrent('');setProfilePin('');setPin('');setConfirmation('');setMessage('History privacy updated.');
  }catch(e:any){setMessage(e.message||'Could not update history privacy.')}finally{setBusy(false)}}}>
    <label>History lock<select aria-label="History lock mode" value={mode} onChange={e=>{setMode(e.target.value);setMessage('')}}><option value="off">No history PIN</option><option value="separate">Separate history PIN</option><option value="profile" disabled={!lock.profile?.pin}>Use profile PIN{!lock.profile?.pin?' (set a profile PIN first)':''}</option></select></label>
    {lock.mode!=='off'&&<label>{lock.mode==='separate'?'Current history PIN':'Current profile PIN'}<input aria-label="Current history or profile PIN" type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="off" required value={current} onChange={e=>setCurrent(e.target.value.replace(/\D/g,''))}/></label>}
    {mode==='profile'&&lock.mode!=='profile'&&<label>Profile PIN to use<input aria-label="Profile PIN to use for history" type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="off" required value={profilePin} onChange={e=>setProfilePin(e.target.value.replace(/\D/g,''))}/></label>}
    {mode==='separate'&&<><label>New history PIN<input aria-label="New history PIN" type="password" autoComplete="new-password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} required value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,''))}/></label><label>Confirm history PIN<input aria-label="Confirm history PIN" type="password" autoComplete="new-password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} required value={confirmation} onChange={e=>setConfirmation(e.target.value.replace(/\D/g,''))}/></label></>}
    <button className="glass" disabled={busy}>{busy?'Saving…':'Save history privacy'}</button><p role="status">{message}</p>
  </form></section>;
}
