import {saveCurrent} from './profile-core.mjs';
// Pure per-record sync. No account credentials or media bytes enter records.
const localOnly=new Set(['cloudUrl','cloudKey','native','traktToken','traktClientId','syncEnabled']);
const copy=x=>JSON.parse(JSON.stringify(x));
const stable=x=>Array.isArray(x)?x.map(stable):x && typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
export const equal=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
function compactItem(i={}) { const {videos,...rest}=i;return rest; }
function projectPart(out,prefix,part,includeAddons=true) {
 for(const [k,v] of Object.entries(part.history || {})) out[prefix+'history:'+k]={...v,item:compactItem(v.item)};
 out[prefix+'profile:name']=part.profile || 'You';
 for(const [k,v] of Object.entries(part.settings || {})) if(!localOnly.has(k)) out[prefix+'setting:'+k]=v;
 if(includeAddons) for(const a of part.addons || []) out[prefix+'addon:'+a.base]={base:a.base,enabled:a.enabled,manifest:a.manifest};
 for(const i of part.library || []) out[prefix+'library:'+i.type+':'+i.id]=compactItem(i);
 for(const [k,v] of Object.entries(part.progress || {})) out[prefix+'progress:'+k]={...v,item:compactItem(v.item),video:v.video ? {id:v.video.id,title:v.video.title,season:v.video.season,episode:v.video.episode,thumbnail:v.video.thumbnail}:undefined};
}
export function project(s) {
 const people=s._people, owner=people?.owner;
 if(!people){const out={};projectPart(out,'',s);return copy(out);}
 if(!owner) return {};
 const account=people.accounts[owner];
 if(!account) return {};
 const out={};
 for(const entry of account.profiles) {
  out['account:profile:'+entry.id]=entry;
  projectPart(out,'space:'+entry.id+':',account.spaces[entry.id] || {},entry.isolatedAddons);
 }
 for(const addon of account.sharedAddons || []) out['account:addon:'+addon.base]={base:addon.base,enabled:addon.enabled,manifest:addon.manifest};
 return copy(out);
}
export function capture(s,uuid=()=>crypto.randomUUID()) {
 const meta=s._sync;if(!meta?.ready)return s;
 s=saveCurrent(s);
 const values=project(s),pending={...meta.pending};let changed=false;
 for(const id of new Set([...Object.keys(values),...Object.keys(meta.shadow)])) {
  const exists=id in values,op=pending[id];
  if(op && exists===!op.deleted && equal(values[id],op.data))continue;
  if(!op && exists===(id in meta.shadow) && equal(values[id],meta.shadow[id]))continue;
  pending[id]={id,base:meta.revisions[id] || 0,mutation:uuid(),deleted:!exists,data:exists?values[id]:null};changed=true;
 }
 return changed ? {...s,_sync:{...meta,pending}} : s;
}
function applyPart(part,r) {
 const split=r.id.indexOf(':'),kind=r.id.slice(0,split),id=r.id.slice(split+1),v=r.data;
 if(kind==='profile')return {...part,profile:r.deleted?'You':v};
 if(kind==='setting'){if(localOnly.has(id))return part;const settings={...part.settings};if(r.deleted)delete settings[id];else settings[id]=v;return {...part,settings};}
 if(kind==='addon')return {...part,addons:[...(part.addons || []).filter(a=>a.base!==id),...(!r.deleted&&v?.base&&v?.manifest?.id?[v]:[])]};
 if(kind==='library')return {...part,library:[...(part.library || []).filter(i=>i.type+':'+i.id!==id),...(!r.deleted&&v?.id?[v]:[])]};
 if(kind==='history'){const history={...part.history};if(r.deleted)delete history[id];else if(v?.item?.id)history[id]=v;return {...part,history};}
 if(kind==='progress'){const progress={...part.progress};if(r.deleted)delete progress[id];else if(v?.item?.id)progress[id]=v;return {...part,progress};}
 return part;
}
export function applyRecord(s,r) {
 const owner=s._people?.owner,account=owner && s._people.accounts[owner];
 if(r.id.startsWith('account:') && account) {
  let next=account;
  if(r.id.startsWith('account:profile:')) {
   const id=r.id.slice(16),profiles=account.profiles.filter(p=>p.id!==id);
   if(!r.deleted && r.data?.id===id)profiles.push(r.data);
   const spaces={...account.spaces};if(r.deleted)delete spaces[id];
   next={...account,profiles,spaces};
  } else if(r.id.startsWith('account:addon:')) {
   const base=r.id.slice(14);
   next={...account,sharedAddons:[...(account.sharedAddons||[]).filter(a=>a.base!==base),...(!r.deleted&&r.data?.base&&r.data?.manifest?.id?[r.data]:[])]};
  }
  const people={...s._people,accounts:{...s._people.accounts,[owner]:next}};
  return {...s,_people:people,...(people.activeId!=='guest' && !next.profiles.find(p=>p.id===people.activeId)?.isolatedAddons ? {addons:next.sharedAddons}: {})};
 }
 if(r.id.startsWith('space:') && account) {
  const [,id,...rest]=r.id.split(':');
  if(!account.profiles.some(p=>p.id===id)) return s;
  const part=account.spaces[id] || {profile:'You',settings:{},addons:[],library:[],progress:{}};
  const updated=applyPart(part,{...r,id:rest.join(':')});
  const next={...account,spaces:{...account.spaces,[id]:updated}};
  const people={...s._people,accounts:{...s._people.accounts,[owner]:next}};
  return people.activeId===id ? {...s,...updated,_people:people,addons:account.profiles.find(p=>p.id===id)?.isolatedAddons?updated.addons:next.sharedAddons} : {...s,_people:people};
 }
 // Legacy v1 records are imported once for the main profile.
 return applyPart(s,r);
}
export function receive(s,result,sent=[]) {
 const meta=s._sync,pending={...meta.pending},shadow={...meta.shadow},revisions={...meta.revisions};let next=s;
 const accepted=new Map((result.acks || []).map(a=>[a.id,a]));
 for(const op of sent){const ack=accepted.get(op.id);if(!ack || ack.mutation!==op.mutation)continue;
  revisions[op.id]=ack.revision;if(op.deleted)delete shadow[op.id];else shadow[op.id]=op.data;
  if(pending[op.id]?.mutation===op.mutation)delete pending[op.id];else if(pending[op.id])pending[op.id]={...pending[op.id],base:ack.revision};
 }
 const conflicts=new Map((result.conflicts || []).map(r=>[r.id,r]));
 for(const r of [...(result.records || []),...conflicts.values()]) {
  if(r.revision<(revisions[r.id] || 0))continue;
  revisions[r.id]=r.revision;if(r.deleted)delete shadow[r.id];else shadow[r.id]=r.data;
  const op=pending[r.id];
  if(conflicts.has(r.id) && op){
   // Keep divergent local intent for review; never silently overwrite another device.
   pending[r.id]={...op,base:r.revision,conflict:true};
  } else if(!op) next=applyRecord(next,r);
 }
 return {...next,_sync:{...meta,pending,shadow,revisions,cursor:result.cursor,lastSync:Date.now()}};
}
export function resolveConflicts(s,keepLocal) {
 let next=s;const pending={...s._sync.pending};
 for(const [id,op] of Object.entries(pending))if(op.conflict){if(keepLocal)pending[id]={...op,conflict:false};else {next=applyRecord(next,{id,data:s._sync.shadow[id],deleted:!(id in s._sync.shadow)});delete pending[id];}}
 return {...next,_sync:{...s._sync,pending}};
}
export const newMeta=(owner)=>({owner,ready:true,cursor:0,pending:{},shadow:{},revisions:{},lastSync:0});





