import {refreshBundledMetadata} from './metadata-provider.mjs';
export function compactForStorage(state) {
 const compactPart=part=>{
  if(!part?.progress)return part;
  const latest=new Map();
  for(const [id,p] of Object.entries(part.progress)){
   const key=p.item?.type+':'+p.item?.id,old=latest.get(key);
   if(!old || (p.updatedAt||0)>(part.progress[old].updatedAt||0))latest.set(key,id);
  }
  return {...part,progress:Object.fromEntries(Object.entries(part.progress).map(([id,p])=>{
   if(!p.item)return [id,p];
   const {videos,...item}=p.item;
   if(latest.get(item.type+':'+item.id)===id && videos?.length)item.videos=videos.map(v=>({id:v.id,season:v.season,episode:v.episode,title:v.title||v.name,thumbnail:v.thumbnail,released:v.released}));
   return [id,{...p,item}];
  }))};
 };
 const result=compactPart(compactPeople(state));
 if(result._people){const people=result._people;result._people={...people,guest:compactPart(people.guest),accounts:Object.fromEntries(Object.entries(people.accounts||{}).map(([id,a])=>[id,{...a,spaces:Object.fromEntries(Object.entries(a.spaces||{}).map(([key,part])=>[key,compactPart(part)]))}]))};}
 return result;
}
function compactPeople(state) {
 const people=state._people;
 if(!people)return state;
 if(!people.owner || people.activeId==='guest')return {...state,_people:{...people,guest:null}};
 const account=people.accounts[people.owner];
 if(!account)return state;
 const spaces={...account.spaces};delete spaces[people.activeId];
 const next={...account,spaces};
 if(state._sync?.owner===people.owner)delete next.syncMeta;
 return {...state,_people:{...people,accounts:{...people.accounts,[people.owner]:next}}};
}
const clone = value => JSON.parse(JSON.stringify(value));
const spacesFor=(account,id)=>account.spaces[id] || {addons:[]};
const addDefaults=(addons,defaults)=>{
  const list=Array.isArray(addons)?[...addons]:[];
  for(const item of defaults)if(!list.some(a=>a.manifest?.id===item.manifest?.id))list.push(clone(item));
  return list;
};
export const fields = ['profile','settings','addons','library','progress','history','_progressDeleted'];
export const profileScope = state => JSON.stringify([state?._people ? state._people.owner ?? null : state?._sync?.owner ?? null, state?._people?.activeId ?? 'legacy']);
export function snapshot(state) {
  return Object.fromEntries(fields.map(k => [k, state[k] ?? (k === 'progress' || k === 'history' || k === 'settings' || k === '_progressDeleted' ? {} : k === 'profile' ? 'You' : [])]));
}
const content = (state, part) => ({...state,...snapshot(part || {})});
export function ensurePeople(state, empty) {
  if (state._people?.version === 2) {
    let people=state._people;
    if(people.bundledMetadataVersion!==5){
      const refresh=part=>part?{...part,addons:refreshBundledMetadata(part.addons,empty.addons)}:part;
      people={...people,bundledMetadataVersion:5,guest:refresh(people.guest),accounts:Object.fromEntries(Object.entries(people.accounts||{}).map(([id,a])=>[id,{...a,sharedAddons:refreshBundledMetadata(a.sharedAddons,empty.addons),spaces:Object.fromEntries(Object.entries(a.spaces||{}).map(([key,part])=>[key,refresh(part)]))}]))};
      state={...refresh(state),_people:people};
    }
    if(people.guestProviderDefaultsVersion !== 2) {
      const guest=people.guest || (!people.owner || people.activeId==='guest' ? snapshot(state) : snapshot(empty));
      const clean={...guest,addons:(guest.addons || []).filter(a=>!/^https:\/\/torrentio\.strem\.fun\/?$/.test(a.base))};
      people={...people,guest:clean,guestProviderDefaultsVersion:2};
      state={...state,...(!people.owner || people.activeId==='guest' ? {addons:clean.addons} : {}),_people:people};
    }
    const defaults=snapshot(empty).addons;
    if(people.guestDefaultsVersion!==4 || Object.values(people.accounts || {}).some(a=>a.addonDefaultsVersion!==4)){
      const guest=people.guest || (!people.owner?snapshot(state):snapshot(empty));
      const accounts=Object.fromEntries(Object.entries(people.accounts || {}).map(([id,account])=>{
        if(account.addonDefaultsVersion===4)return [id,account];
        const sharedAddons=addDefaults(account.sharedAddons,defaults);
        const spaces=Object.fromEntries(Object.entries(account.spaces || {}).map(([key,part])=>[key,{...part,addons:addDefaults(part.addons,defaults)}]));
        return [id,{...account,sharedAddons,spaces,addonDefaultsVersion:4}];
      }));
      people={...people,guest:{...guest,addons:addDefaults(guest.addons,defaults)},guestDefaultsVersion:4,accounts};
      const active=people.owner && people.activeId!=='guest' ? accounts[people.owner] : null;
      const entry=active?.profiles?.find(p=>p.id===people.activeId);
      state={...state,addons:active?(entry?.isolatedAddons?spacesFor(active,people.activeId).addons:active.sharedAddons):people.guest.addons,_people:people};
    }
    if(!people.owner && !people.guest)return {...state,_people:{...people,guest:snapshot(state)}};
    if(people.owner && people.activeId!=='guest'){
      const account=people.accounts[people.owner];
      if(account && !account.spaces[people.activeId]){
        const updated={...account,spaces:{...account.spaces,[people.activeId]:snapshot(state)},syncMeta:account.syncMeta || state._sync};
        return {...state,_people:{...people,accounts:{...people.accounts,[people.owner]:updated}}};
      }
    }
    return state;
  }
  const legacy = snapshot(state), owner = state._sync?.owner || null;
  const guest = state._guestBackup ? snapshot(state._guestBackup) : owner ? snapshot(empty) : legacy;
  guest.profile = 'Guest';
  const accounts = owner ? {[owner]:{profiles:[{id:'main',name:legacy.profile || 'You',avatar:0,isolatedAddons:false,kids:false}],spaces:{main:legacy},sharedAddons:clone(legacy.addons),syncEnabled:true}} : {};
  for(const [id,archive] of Object.entries(state._accountArchives || {})){
    if(accounts[id] || !archive || typeof archive!=='object')continue;
    const prior=snapshot(archive);
    accounts[id]={profiles:[{id:'main',name:prior.profile || 'You',avatar:0,isolatedAddons:false,kids:false}],spaces:{main:prior},sharedAddons:clone(prior.addons),syncEnabled:true,syncMeta:archive._sync};
  }
  const {_accountArchives,_guestBackup,...rest}=state;
  return ensurePeople({...rest,_people:{version:2,guest,accounts,owner,activeId:owner ? 'main' : 'guest'}},empty);
}
export function saveCurrent(state) {
  const people=state._people;
  if (!people) return state;
  const part=snapshot(state);
  if (!people.owner || people.activeId === 'guest')
    return {...state,_people:{...people,guest:part}};
  const account=people.accounts[people.owner];
  if (!account) return state;
  const entry=account.profiles.find(p => p.id === people.activeId);
  if(!entry)return state;
  const sharedAddons=entry?.isolatedAddons ? account.sharedAddons : part.addons;
  return {...state,_people:{...people,accounts:{...people.accounts,[people.owner]:{...account,sharedAddons,syncMeta:state._sync?.owner===people.owner?state._sync:account.syncMeta,spaces:{...account.spaces,[people.activeId]:part}}}}};
}
export function enterGuest(state) {
  state=saveCurrent(state);
  const people={...state._people,owner:null,activeId:'guest'};
  return content({...state,_sync:null,_people:people},people.guest);
}
export function ensureAccount(state,owner,empty) {
  state=saveCurrent(state);
  const people=state._people;
  if (people.accounts[owner]) return state;
  const part=snapshot(empty);
  part.profile='You';
  const account={profiles:[{id:'main',name:'You',avatar:0,isolatedAddons:false,kids:false}],spaces:{main:part},sharedAddons:clone(part.addons),addonDefaultsVersion:4,syncEnabled:true};
  return {...state,_people:{...people,accounts:{...people.accounts,[owner]:account}}};
}
export function enterProfile(state,owner,id,empty) {
  state=ensureAccount(state,owner,empty);
  state=saveCurrent(state);
  const people=state._people,account=people.accounts[owner],entry=account.profiles.find(p=>p.id===id);
  if(!entry) throw Error('Profile was not found.');
  const base=snapshot(empty),saved=account.spaces[id] || {};
  const part={...base,...saved,settings:{...base.settings,...(saved.settings || {})}};
  part.profile=entry.name;
  if(!entry.isolatedAddons) part.addons=clone(account.sharedAddons);
  return content({...state,_sync:account.syncMeta || null,_people:{...people,owner,activeId:id}},part);
}
export function addProfile(state,owner,entry,empty) {
  state=ensureAccount(state,owner,empty);
  state=saveCurrent(state);
  const people=state._people,account=people.accounts[owner];
  if(account.profiles.length>=12) throw Error('This account has reached 12 profiles.');
  const id=entry.id;
  if(!/^[a-zA-Z0-9-]{8,64}$/.test(id) || account.spaces[id]) throw Error('Invalid profile ID.');
  const part=snapshot(empty);part.profile=entry.name;part.addons=clone(account.sharedAddons);
  const next={...account,profiles:[...account.profiles,entry],spaces:{...account.spaces,[id]:part}};
  return {...state,_people:{...people,accounts:{...people.accounts,[owner]:next}}};
}
export function editProfile(state,owner,id,changes) {
  state=saveCurrent(state);
  const people=state._people,account=people.accounts[owner];
  const old=account?.profiles.find(p=>p.id===id);
  if(!old) throw Error('Profile was not found.');
  const updated={...old,...changes,id};
  const spaces={...account.spaces,[id]:{...account.spaces[id],profile:updated.name}};
  if(old.isolatedAddons && !updated.isolatedAddons) spaces[id].addons=clone(account.sharedAddons);
  if(!old.isolatedAddons && updated.isolatedAddons) spaces[id].addons=clone(account.sharedAddons);
  const next={...account,profiles:account.profiles.map(p=>p.id===id?updated:p),spaces};
  let result={...state,_people:{...people,accounts:{...people.accounts,[owner]:next}}};
  if(people.owner===owner && people.activeId===id) result={...result,profile:updated.name,addons:updated.isolatedAddons?spaces[id].addons:account.sharedAddons};
  return result;
}
export function removeProfile(state,owner,id) {
  state=saveCurrent(state);
  const people=state._people,account=people.accounts[owner];
  if(!account?.profiles.some(p=>p.id===id)) return state;
  if(account.profiles.length<=1) throw Error('Keep at least one profile on the account.');
  const spaces={...account.spaces};delete spaces[id];
  const next={...account,profiles:account.profiles.filter(p=>p.id!==id),spaces};
  let result={...state,_people:{...people,accounts:{...people.accounts,[owner]:next}}};
  if(people.owner===owner && people.activeId===id) result=enterProfile(result,owner,next.profiles[0].id,{profile:'You',settings:{},addons:account.sharedAddons,library:[],progress:{}});
  return result;
}
export function setSyncEnabled(state,owner,enabled) {
  state=saveCurrent(state);
  const people=state._people,account=people.accounts[owner];
  return {...state,_people:{...people,accounts:{...people.accounts,[owner]:{...account,syncEnabled:enabled}}}};
}
export async function pinDigest(pin,salt,portable=false) {
  if(!/^\d{4}$/.test(pin)) throw Error('Enter exactly four digits.');
  if(salt && !/^[a-f0-9]{32}$/i.test(salt))throw Error('Invalid PIN salt.');
  const bytes=salt ? Uint8Array.from(salt.match(/.{2}/g).map(x=>parseInt(x,16))) : crypto.getRandomValues(new Uint8Array(16));
  const password=new TextEncoder().encode(pin);
  let derived;
  if(crypto.subtle && !portable){
    const material=await crypto.subtle.importKey('raw',password,'PBKDF2',false,['deriveBits']);
    derived=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:bytes,iterations:600000,hash:'SHA-256'},material,256));
  }else{
    const [{pbkdf2Async},{sha256}]=await Promise.all([import('@noble/hashes/pbkdf2.js'),import('@noble/hashes/sha2.js')]);
    derived=await pbkdf2Async(sha256,password,bytes,{c:600000,dkLen:32,asyncTick:10});
  }
  return {salt:[...bytes].map(x=>x.toString(16).padStart(2,'0')).join(''),hash:[...derived].map(x=>x.toString(16).padStart(2,'0')).join('')};
}
export async function verifyPin(pin,stored) {
  if(!/^[a-f0-9]{32}$/i.test(stored?.salt || '') || !/^[a-f0-9]{64}$/i.test(stored?.hash || '') || !/^\d{4}$/.test(pin)) return false;
  const candidate=await pinDigest(pin,stored.salt);
  let mismatch=0;for(let i=0;i<candidate.hash.length;i++) mismatch|=candidate.hash.charCodeAt(i)^stored.hash.charCodeAt(i);
  return mismatch===0;
}


