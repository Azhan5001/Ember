import {useEffect,useMemo,useState} from 'react';
import {recommend} from './recommendation-core.mjs';
import {historyItems,titleKey} from './history-core.mjs';
import {profileScope} from './profile-core.mjs';
import {metadata,json,Item} from './api';
import {titleRating} from './ratings-service';
import {applyRating} from './ratings-core.mjs';
export function useRecommendations(items:Item[],state:any,catalog:any,enabled:boolean){
 const scope=profileScope(state),history=state?.history||{},addons=state?.addons||[];
 const qualified=historyItems(history),watched=qualified.slice(0,8);
 const historyKey=JSON.stringify(qualified.map((h:any)=>[titleKey(h.item),h.lastWatched,h.qualifiedAt]));
 const addonKey=JSON.stringify(addons.filter((a:any)=>a.enabled).map((a:any)=>a.base));
 const preliminary=useMemo(()=>recommend(items,history,{limit:24}),[items,state?.history]);
 const poolKey=preliminary.map((i:any)=>titleKey(i)).join('|');
 const key=scope+'|'+historyKey+'|'+addonKey+'|'+poolKey;
 const [enriched,setEnriched]=useState<{key:string;history:any;historySource:any;items:Item[]}|null>(null);
 useEffect(()=>{
  if(!enabled||!catalog?.loadRecommendations)return;
  const timer=setTimeout(()=>{void catalog.loadRecommendations()},400);
  return()=>clearTimeout(timer);
 },[enabled,scope,catalog?.generation]);
 useEffect(()=>{
  if(!enabled||!state||!preliminary.length)return;
  let active=true;
  const timer=setTimeout(()=>{void (async()=>{
   const seedItems=[...watched.map((h:any)=>h.item),...preliminary];
   const unique=[...new Map(seedItems.map((i:any)=>[titleKey(i),i])).values()] as Item[];
   const values=new Map<string,Item>();let cursor=0;
   const worker=async()=>{while(active&&cursor<unique.length){const item=unique[cursor++];try{const enriched=await metadata(addons,item,false);if(!active)return;const rating=await titleRating(addons,enriched,json).catch(()=>null);values.set(titleKey(item),applyRating(enriched,rating));}catch{values.set(titleKey(item),item);}}};
   await Promise.all([worker(),worker()]);if(!active)return;
   const updated=Object.fromEntries(Object.entries(history).map(([id,h]:any)=>[id,{...h,item:values.get(titleKey(h.item))||h.item}]));
   setEnriched({key,history:updated,historySource:history,items:items.map(i=>values.get(titleKey(i))||i)});
  })()},700);
  return()=>{active=false;clearTimeout(timer)};
 },[enabled,key,state?.history]);
 const result=useMemo(()=>recommend(enriched?.key===key&&enriched.historySource===history?enriched.items:items,enriched?.key===key&&enriched.historySource===history?enriched.history:history),[items,state?.history,enriched,key]);
 return result.map((i:any)=>state?.settings?.historyLock?.mode&&state.settings.historyLock.mode!=='off'?{...i,recommendationReason:'Picked from your viewing preferences'}:i);
}
