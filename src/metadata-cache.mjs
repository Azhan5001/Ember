import {AIO_BASE} from './metadata-provider.mjs';
const pending=new Map();let database;
function open(){
 if(!globalThis.indexedDB)return Promise.resolve(null);
 return database ||= new Promise(resolve=>{const r=indexedDB.open('ember-public-metadata-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('responses',{keyPath:'url'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>resolve(null);r.onblocked=()=>resolve(null);});
}
async function read(url){try{const db=await open();if(!db)return null;return await new Promise(resolve=>{const r=db.transaction('responses').objectStore('responses').get(url);r.onsuccess=()=>resolve(r.result);r.onerror=()=>resolve(null);});}catch{return null;}}
async function write(record){try{const db=await open();if(!db)return;const tx=db.transaction('responses','readwrite'),store=tx.objectStore('responses');store.put(record);const r=store.getAll();r.onsuccess=()=>{const rows=r.result.sort((a,b)=>b.at-a.at);for(const row of rows.slice(160))store.delete(row.url);};}catch{/* Storage limits must never prevent browsing. */}}
export function metadataTTL(url){return url.includes('/meta/movie/')||url.startsWith('https://imdbratings.kgenovz.com/stream/')?24*3600000:url.includes('search=')?3600000:6*3600000;}
/** @param {string} url @param {()=>Promise<any>} load @param {{force?:boolean,onRefresh?:(value:any)=>void}} options */
export async function cachedMetadata(url,load,{force=false,onRefresh}={}){
 // No stream links, watch history, account data or third-party private addon URLs are persisted.
 if(!url.startsWith(AIO_BASE+'/catalog/')&&!url.startsWith(AIO_BASE+'/meta/')&&!/^https:\/\/imdbratings\.kgenovz\.com\/stream\/(movie|series)\/(tt\d+|kitsu%3A\d+)\.json$/.test(url))return load();
 const hit=await read(url),age=hit?Date.now()-hit.at:Infinity;
 if(!force&&hit&&age<metadataTTL(url))return hit.value;
 const refresh=()=>{
  if(!pending.has(url))pending.set(url,Promise.resolve().then(load).then(value=>{if(value?.meta||Array.isArray(value?.metas)||Array.isArray(value?.streams)){void write({url,value,at:Date.now()});}return value;}).finally(()=>pending.delete(url)));
  return pending.get(url);
 };
 if(!force&&hit&&age<7*86400000){void refresh().then(value=>onRefresh?.(value)).catch(()=>{});return hit.value;}
 return refresh();
}
