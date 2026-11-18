import React,{useState,useEffect,useRef} from 'react';
import {Plus,LockKeyhole,Settings2,ArrowLeft,ChevronLeft,ChevronRight,Trash2} from 'lucide-react';
import {migrate} from './defaults';
import {ensurePeople,enterGuest,enterProfile,addProfile,editProfile,removeProfile,pinDigest,verifyPin} from './profile-core.mjs';
const blank=()=>migrate({profile:'You',settings:{},addons:[],library:[],progress:{}});
const avatar=(n:number)=>'/avatars/'+String((n||0)%24+1).padStart(2,'0')+'.svg';
export default function ProfileChooser({state,setState,account,onClose,onAuth,allowClose=false}:any){
 const owner=account?.id,profiles=owner?state._people?.accounts[owner]?.profiles||[]:[];
 const [edit,setEdit]=useState<any>(null),[name,setName]=useState(''),[image,setImage]=useState(0),[isolate,setIsolate]=useState(false),[pin,setPin]=useState(''),[clearPin,setClearPin]=useState(false);
 const [locked,setLocked]=useState<any>(null),[lockedAction,setLockedAction]=useState<'open'|'edit'>('open'),[entryPin,setEntryPin]=useState(''),[error,setError]=useState(''),[saving,setSaving]=useState(false),[attempts,setAttempts]=useState(0),[blockedUntil,setBlockedUntil]=useState(0);
 const restored=useRef(false);
 useEffect(()=>{if(restored.current||!owner)return;const p=profiles.find((p:any)=>p.id===state._people?.activeId);if(p){restored.current=true;if(p.pin&&!allowClose){setLocked(p);setLockedAction('open')}}},[owner,profiles,allowClose]);
 const [selectedIndex,setSelectedIndex]=useState(owner && profiles.length ? 1 : 0);
 const swipeStart=useRef<number|null>(null);
 useEffect(()=>setSelectedIndex(owner && profiles.length ? 1 : 0),[owner,profiles.length]);
 const choices=[{id:'guest',name:'Guest',guest:true},...profiles,{id:'add',name:'Add profile',add:true}];
 const activeIndex=Math.min(selectedIndex,choices.length-1);
 const activate=(choice:any)=>{
  if(choice.guest){setState((s:any)=>enterGuest(ensurePeople(s,blank())));onClose();}
  else if(choice.add)begin(null);
  else void select(choice);
 };
 const reset=()=>{setEdit(null);setLocked(null);setPin('');setEntryPin('');setError('');setClearPin(false);};
 const begin=(p:any)=>{reset();setEdit(p||'new');setName(p?.name||'');setImage(p?.avatar||0);setIsolate(!!p?.isolatedAddons);};
 const select=async(p:any,action:'open'|'edit'='open')=>{
  setError('');
  if(p.pin){setLocked(p);setLockedAction(action);setEntryPin('');return;}
  if(action==='edit'){begin(p);return;}
  setState((s:any)=>enterProfile(s,owner,p.id,blank()));onClose();
 };
 const unlock=async(e:React.FormEvent)=>{
  e.preventDefault();if(Date.now()<blockedUntil)return;
  setSaving(true);
  try{
   if(await verifyPin(entryPin,locked.pin)){if(lockedAction==='edit')begin(locked);else{setState((s:any)=>enterProfile(s,owner,locked.id,blank()));onClose();}setAttempts(0);}
   else{const n=attempts+1;setAttempts(n);setEntryPin('');setError(n>=5?'Too many attempts. Try again in one minute.':'Incorrect PIN.');if(n>=5){setBlockedUntil(Date.now()+60000);setAttempts(0);}}
  }finally{setSaving(false);}
 };
 const save=async(e:React.FormEvent)=>{
  e.preventDefault();const clean=name.trim().slice(0,30);if(!clean){setError('Enter a profile name.');return;}
  if(pin && !/^\d{4}$/.test(pin)){setError('Use exactly four digits for the PIN.');return;}
  setSaving(true);setError('');
  try{
   const historySettings=state._people?.activeId===edit?.id?state.settings:state._people?.accounts[owner]?.spaces[edit?.id]?.settings;
   if(clearPin&&!pin&&historySettings?.historyLock?.mode==='profile')throw Error('History uses this profile PIN. Turn off its history lock or set a separate history PIN before removing the profile PIN.');
   const changes:any={name:clean,avatar:image,isolatedAddons:isolate};
   if(pin)changes.pin=await pinDigest(pin);
   else if(clearPin)changes.pin=null;
   if(edit==='new'){
    changes.id=crypto.randomUUID();
    setState((s:any)=>addProfile(ensurePeople(s,blank()),owner,changes,blank()));
   }else setState((s:any)=>editProfile(s,owner,edit.id,changes));
   reset();
  }catch(e:any){setError(e.message||'Could not save profile.');}
  finally{setSaving(false);}
 };
 return <div className="profilegateway" role="dialog" aria-modal="true" aria-label="Choose profile">
  <div className="gatewayinner">
   <h1>{locked?'Enter your PIN':edit?'Edit profile':owner?'Who is watching?':'Welcome to Ember'}</h1>
   <p>{owner?account.email:'Watch locally as a guest, or sign in to create profiles.'}</p>
   {error&&<p role="alert" className="autherror">{error}</p>}
   {locked?<form className="pinform" onSubmit={unlock}><img src={avatar(locked.avatar)} alt=""/><h2>{locked.name}</h2><input aria-label="Four-digit profile PIN" type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={entryPin} onChange={e=>setEntryPin(e.target.value.replace(/\D/g,''))} autoFocus/><div className="actions"><button className="glass" type="button" onClick={reset}>Back</button><button className="primary" disabled={saving||Date.now()<blockedUntil}>Unlock</button></div></form>:
   edit?<form className="profileform" onSubmit={save}><label>Profile name<input aria-label="Profile name" maxLength={30} required value={name} onChange={e=>setName(e.target.value)} autoFocus/></label><p>Choose a picture</p><div className="avatargrid" role="group" aria-label="Profile pictures">{Array.from({length:24},(_,n)=><button type="button" aria-label={'Picture '+(n+1)} aria-pressed={image===n} className={image===n?'selected':''} key={n} onClick={()=>setImage(n)}><img src={avatar(n)} alt=""/></button>)}</div><label className="settingline">Keep addons separate for this profile<input type="checkbox" checked={isolate} onChange={e=>setIsolate(e.target.checked)}/></label><label>Four-digit PIN {edit==='new'?'(optional)':'(leave blank to keep current)'}<input aria-label="New profile PIN" type="password" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,''))}/></label>{edit!=='new'&&edit.pin&&<label className="settingline">Remove existing PIN<input type="checkbox" checked={clearPin} onChange={e=>setClearPin(e.target.checked)}/></label>}<div className="actions"><button type="button" className="glass" onClick={reset}>Back</button><button type="submit" className="primary" disabled={saving}>{saving?'Saving…':'Save profile'}</button>{edit!=='new'&&profiles.length>1&&<button type="button" className="glass danger" onClick={()=>{if(confirm('Delete '+edit.name+' and all of this profile’s local data?')){setState((s:any)=>removeProfile(s,owner,edit.id));reset();}}}><Trash2 size={16}/>Delete</button>}</div></form>:
   <>
   {!owner && <button className="profileauthlink textbutton" onClick={onAuth}>Log in / Sign up</button>}
   <div className="profilecarousel" role="region" aria-roledescription="carousel" aria-label="Choose who is watching"
    tabIndex={0} onKeyDown={e=>{if(e.key==='ArrowLeft'){e.preventDefault();setSelectedIndex(Math.max(0,activeIndex-1));}if(e.key==='ArrowRight'&&owner){e.preventDefault();setSelectedIndex(Math.min(choices.length-1,activeIndex+1));}}}
    onTouchStart={e=>{swipeStart.current=e.touches[0].clientX;}}
    onTouchEnd={e=>{if(swipeStart.current===null||!owner)return;const delta=e.changedTouches[0].clientX-swipeStart.current;swipeStart.current=null;if(Math.abs(delta)>35)setSelectedIndex(Math.max(0,Math.min(choices.length-1,activeIndex+(delta<0?1:-1))));}}>
    <div className="profilecarouselscene">
     {(owner?choices:[choices[0]]).map((choice:any,index:number)=>{
      const distance=index-activeIndex;
      return <div className={"carouselprofile "+(distance===0?"is-current":"")} key={choice.id}
       style={{"--profile-offset":distance} as React.CSSProperties} aria-hidden={Math.abs(distance)>1}>
       <button className="profilechoice" tabIndex={distance===0?0:-1}
        aria-label={distance===0?'Watch as '+choice.name:'Select '+choice.name}
        onClick={()=>distance===0?activate(choice):setSelectedIndex(index)}>
        <span className={"choicecircle "+(choice.guest?"guestcircle":choice.add?"pluscircle":"")}>
         {choice.guest?"G":choice.add?<Plus size={34}/>:<img src={avatar(choice.avatar)} alt=""/>}
        </span><b>{choice.name}</b>
        {distance===0 && choice.pin && <small><LockKeyhole size={12}/> PIN locked</small>}
       </button>
       {distance===0&&!choice.guest&&!choice.add&&<button className="profileedit" aria-label={"Edit "+choice.name} onClick={()=>void select(choice,'edit')}><Settings2 size={16}/></button>}
      </div>;
     })}
    </div>
    {owner&&<div className="carouselnavigation"><button className="icon" aria-label="Previous profile" disabled={activeIndex===0} onClick={()=>setSelectedIndex(activeIndex-1)}><ChevronLeft/></button><span aria-live="polite">{choices[activeIndex].name}</span><button className="icon" aria-label="Next profile" disabled={activeIndex===choices.length-1} onClick={()=>setSelectedIndex(activeIndex+1)}><ChevronRight/></button></div>}
   </div>
   <div className="profilechoices"><button className="profilechoice" onClick={()=>{setState((s:any)=>enterGuest(ensurePeople(s,blank())));onClose();}}><span className="choicecircle guestcircle">G</span><b>Guest</b><small>Only on this device</small></button>{profiles.map((p:any)=><div className="choicewrap" key={p.id}><button className="profilechoice" onClick={()=>void select(p)}><span className="choicecircle"><img src={avatar(p.avatar)} alt=""/></span><b>{p.name}</b><small>{p.pin?<><LockKeyhole size={12}/> PIN locked</>:'Personal space'}</small></button><button className="profileedit" aria-label={'Edit '+p.name} onClick={()=>void select(p,'edit')}><Settings2 size={15}/></button></div>)}<button className="profilechoice" onClick={()=>owner?begin(null):onAuth()}><span className="choicecircle pluscircle"><Plus size={34}/></span><b>{owner?'Add profile':'Sign in or register'}</b><small>{owner?'Up to 12 profiles':'Sync across devices'}</small></button></div>{owner&&allowClose&&<button className="textbutton" onClick={onClose}><ArrowLeft size={14}/> Back to Ember</button>}</>}
  </div>
 </div>;
}
