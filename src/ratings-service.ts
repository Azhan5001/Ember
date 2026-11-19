import {CatalogCache} from './catalog-cache.mjs';
import {ratingId,ratingSummary} from './ratings-core.mjs';
import {cachedMetadata} from './metadata-cache.mjs';
const cache=new CatalogCache({ttl:86400000,limit:1000});
let running=0;const waiting:(()=>void)[]=[];
export async function titleRating(addons:any[],item:any,load:(url:string)=>Promise<any>){
 const addon=addons.find(a=>a.enabled&&a.manifest?.id==='imdb.ratings.local'),id=ratingId(item);
 if(!addon||!id)return null;
 const url=addon.base+'/stream/'+(item.type==='movie'?'movie':'series')+'/'+encodeURIComponent(id)+'.json';
 return cache.get(url,async()=>{
  if(running>=4)await new Promise<void>(r=>waiting.push(r));running++;
  try{return ratingSummary(await cachedMetadata(url,()=>load(url)));}
  finally{running--;waiting.shift()?.();}
 });
}
