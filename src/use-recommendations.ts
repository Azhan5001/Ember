import {useEffect,useMemo} from 'react';
import {recommend} from './recommendation-core.mjs';
import {profileScope} from './profile-core.mjs';
import {isAdultItem} from './content-filter.mjs';
import type {Item} from './api';
export function useRecommendations(items:Item[],state:any,catalog:any,enabled:boolean){
 const scope=profileScope(state);
 useEffect(()=>{if(!enabled||!catalog?.loadRecommendations)return;const timer=setTimeout(()=>{void catalog.loadRecommendations()},1200);return()=>clearTimeout(timer)},[enabled,scope,catalog?.generation]);
 const result=useMemo(()=>recommend(items.filter(i=>state?.settings?.hideAdult===false||!isAdultItem(i)),state?.history||{}),[items,state?.history,state?.settings?.hideAdult,scope]);
 return result.map((i:any)=>state?.settings?.historyLock?.mode&&state.settings.historyLock.mode!=='off'?{...i,recommendationReason:'Picked from your viewing preferences'}:i);
}
