import {CatalogCache} from './catalog-cache.mjs';
import {enrichMetadata,tvmazeItem,animeEpisodeMappings,mergeEpisode,matchEpisode} from './metadata-core.mjs';
const cache=new CatalogCache({limit:160,ttl:3600000});
let running=0;const queue:(()=>void)[]=[];
export async function publicJson(url:string,priority=false):Promise<any>{
 return cache.get(url,async()=>{
  if(running>=2)await new Promise<void>(r=>priority?queue.unshift(r):queue.push(r));running++;
  try{const r=await fetch(url,{signal:AbortSignal.timeout(7000)});if(!r.ok)throw Error(`Metadata HTTP ${r.status}`);return await r.json()}
  finally{running--;queue.shift()?.()}
 });
}
export async function enrichTV(item:any,episodes=true){
 if(item.type!=='series')return item;
 try{
  const imdb=String(item.imdb_id||item.imdbId||item.id).match(/^tt\d+$/)?.[0];
  if(!item.tvmaze_id&&!imdb)return item;
  const show=await publicJson(item.tvmaze_id?`https://api.tvmaze.com/shows/${item.tvmaze_id}`:`https://api.tvmaze.com/lookup/shows?imdb=${imdb}`,episodes);
  const extra:any=tvmazeItem(show);extra.id=item.id;
  if(episodes){const rows=await publicJson(`https://api.tvmaze.com/shows/${show.id}/episodes`,true).catch(()=>[]);extra.videos=rows.filter((v:any)=>v.number>0).map((v:any)=>mergeEpisode({id:`${item.id}:${v.season}:${v.number}`,title:v.name,season:v.season,episode:v.number},v));}
  return enrichMetadata(item,extra);
 }catch{return item;}
}
export async function discoverySupplement(query:string,genres:string[]){
 const lists:any[][]=[];
 if(genres.includes('K-drama')){try{lists.push(await publicJson(new URL('data/korean-catalog.json',document.baseURI).href))}catch{}}
 if(query.trim()){try{const results=await publicJson(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query.trim())}`);lists.push(results.filter((r:any)=>r.show?.externals?.imdb).map((r:any)=>tvmazeItem(r.show)))}catch{}}
 return lists.flat();
}
let mappings:Promise<any[]>|undefined;
export async function animeMapping(item:any,video:any){
 if(!item.categories?.includes('Anime')&&!item.genres?.some((g:string)=>/anime|animation/i.test(g))&&!/^(mal|kitsu|anilist):/.test(item.id))return [];
 try{mappings ||= fetch(new URL('data/anime-mappings.json',document.baseURI)).then(r=>{if(!r.ok)throw Error('Mapping unavailable');return r.json()}).catch(e=>{mappings=undefined;throw e});return animeEpisodeMappings(await mappings,item,video)}catch{return []}
}

export async function episodeArtwork(series:any,video:any):Promise<string[]>{
 const result:string[]=[];
 const enriched=await enrichTV(series,true);
 const tv=matchEpisode(video,enriched.videos||[]);
 if(tv)result.push(tv.thumbnail,...(tv.thumbnails||[]));
 // Kitsu episode pictures are keyed by the exact mapped anime and episode, never a title guess.
 try{
  const direct=String(series.id).match(/^kitsu:(\d+)$/);
  let kitsu=direct?.[1],episode=Number(video.episode);
  if(!kitsu){
   const mapped=await animeMapping({...series,genres:[...(series.genres||[]),'Anime']},video);
   if(mapped.length){const rows=await mappings!;const row=rows.find(r=>r.mal_id===mapped[0].mal);kitsu=row?.kitsu_id;episode=mapped[0].episode;}
  }
  if(kitsu&&episode>0){
   const r=await publicJson(`https://kitsu.io/api/edge/episodes?filter[mediaType]=Anime&filter[mediaId]=${encodeURIComponent(kitsu)}&filter[number]=${episode}`,true);
   for(const row of r.data||[]){if(Number(row.attributes?.number)!==episode)continue;const t=row.attributes?.thumbnail;result.push(t?.original,t?.large,t?.medium,t?.small);}
  }
 }catch{}
 return [...new Set(result.filter((u:any)=>typeof u==='string'&&/^https?:/.test(u)))];
}
