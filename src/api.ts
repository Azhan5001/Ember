import {isAdultItem} from './content-filter.mjs';
import {titleRating} from './ratings-service';
import {ratingId,applyRating} from './ratings-core.mjs';
import {isAio,isFallback,hasAio,matchesFacets,catalogItems} from './metadata-provider.mjs';
import {cachedMetadata} from './metadata-cache.mjs';
import { enrichTV, discoverySupplement, episodeArtwork } from './metadata-enrichment';
import { enrichMetadata, matchEpisode, mergeEpisode } from './metadata-core.mjs';
import type { MediaInfo } from "./embedded-media";
import { catalogJobs, normalizeItem, mergeItems, identityKey, matchesGenres, sortItems, resourceTypeFor, sameTitle, searchItems } from "./catalog-core.mjs";
import { artworkCandidates } from "./artwork-core.mjs";
import { CatalogCache } from "./catalog-cache.mjs";
import { addonBase, resourceUrl, supports, normalize, preferConfiguredTorrentio } from "./core.mjs";
export type Item = {
  id: string;
  type: string;
  name: string;
  poster?: string;
  logo?: string;
  background?: string;
  description?: string;
  year?: string;
  releaseInfo?: string;
  genres?: string[];
  imdbRating?: string;
  videos?: any[];
  resourceType?: string;
  provider?: string;
  categories?: string[];
  confirmedGenres?: string[];
  ranks?: Record<string, number>;
  [key: string]: any;
};
export type Addon = { base: string; manifest: any; enabled: boolean };
declare global {
  interface Window {
    ember?: {
      platform?: string;
      liveBoot?: boolean;
      downloadStart?: (request:any) => Promise<string>;
      downloadList?: () => Promise<any[]>;
      downloadOpen?: (id:string) => Promise<void>;
      downloadCancel?: (id:string) => Promise<void>;
      trailerURL?: (id:string) => string;
      artworkURL?: (url:string) => string;
      torrentRetain?: (url?:string) => Promise<void>;
      takeLinks: () => Promise<string[]>;
      registerLinks: () => Promise<boolean>;
      addonLink: (fn: (u: string) => void) => () => void;
      memory: () => Promise<any[]>;
      trakt: (args: any) => Promise<any>;
      torrent: (
        hash: string,
        index?: number,
        sources?: string[],
      ) => Promise<any>;
      request: (url: string, headers?: any) => Promise<string>;
      checkpoint: (p: any) => boolean;
      read: () => Promise<any>;
      write: (data: any) => Promise<void>;
      torboxStream?: (args:{token:string;hash:string;index?:number;filename?:string;movie:boolean;queue?:boolean}) => Promise<{url:string;contentType:string;playlist:boolean} | {queued:true}>;
      mediaRemote?: (url:string,headers?:any) => Promise<{url:string;contentType:string;playlist:boolean}>;
      mediaProbe: (input: {url:string;headers:any}) => Promise<MediaInfo>;
      mediaOpen: (options: {input:{url:string;headers:any};start:number;audio?:number;bitmap?:number;height?:number;rate?:number;format:"mp4"|"webm"}) => Promise<string>;
      mediaSubtitle: (input:{url:string;headers:any},track:number,start?:number) => Promise<string>;
      native: (url: string, position: number, headers?: any) => Promise<any>;
      nativeCommand: (command: any[]) => Promise<any>;
      nativeEvent: (fn: (event: any) => void) => () => void;
      nativeSubtitle: (text: string) => Promise<string>;
      nativePrepare: (
        url: string,
        position: number,
        headers?: any,
      ) => Promise<any>;
      nativeCommit: (a: any) => Promise<any>;
      nativeCancel: () => Promise<any>;
      openExternal: (url: string) => void;
    };
  }
}
export async function request(url: string, headers: any = {}) {
  if (window.ember) return window.ember.request(url, headers);
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(18000) });
  if (!r.ok) throw Error(`HTTP ${r.status}`);
  return r.text();
}
export async function json(url: string) {
  return JSON.parse(await request(url));
}
export async function install(url: string): Promise<Addon> {
  const base = addonBase(url.trim());
  const manifest = await json(base + "/manifest.json");
  if (!manifest.id || !Array.isArray(manifest.resources))
    throw Error("Invalid addon manifest");
  if (manifest.behaviorHints?.configurationRequired)
    throw Error("This addon needs configuration. Open its Configure page and paste the configured manifest URL.");
  return { base, manifest, enabled: true };
}
// Limit metadata traffic independently of playback. No catalog/artwork job opens media.
const cache = new CatalogCache({ limit: 48 });
let running = 0;
const queue: (() => void)[] = [];
async function limited<T>(fn: () => Promise<T>, priority=false): Promise<T> {
  if (running >= 4) await new Promise<void>(resolve => priority ? queue.unshift(resolve) : queue.push(resolve));
  running++;
  try { return await fn(); }
  finally { running--; queue.shift()?.(); }
}
const known = new Map<string, {item:Item; at:number}>();
const metaCache = new CatalogCache({ limit: 128 });
async function providerMeta(a: Addon, type: string, id: string, priority=false) {
  const url = resourceUrl(a.base, "meta", type, id);
  return metaCache.get(url, () => priority?cachedMetadata(url,()=>json(url)).then(r=>r.meta||null):limited(() => cachedMetadata(url,()=>json(url)).then(r => r.meta || null)));
}
export async function catalogs(
  addons: Addon[], type = "all", search = "",
  options: { onUpdate?: (result: any) => void; force?: boolean; lazy?: boolean; hideAdult?:boolean; genres?: string[]; sort?: string; facets?:any; active?: () => boolean } = {},
) {
  const jobs = catalogJobs(addons, type, search, options),catalogGeneration={};
  let supplemental: Item[] = [];
  let visibleLimit=60;
  const ratings=new Map<string,any>(),ratingChecked=new Set<string>();let ratingBusy=false,ratingFailures=0,ratingTimer:ReturnType<typeof setTimeout>|undefined;
  const selected = options.genres || [], checked = new Set<string>();
  const rows: any[] = jobs.map((j: any) => {
    const url = resourceUrl(j.addon.base,"catalog",j.type,j.catalog.id,j.extra);
    return { ...j, url, key:url+":"+(j.view||"default"), showEmpty:!!j.view, items: catalogItems((cache.peek(url) || []).map((i: any, rank: number) => normalizeItem(i,{...j,rank})),j), loaded: false, loading:false, error:false, offset:cache.peek(url)?.length || 0, exhausted:false };
  });
  const allItems = () => mergeItems([...supplemental,...rows.flatMap(r => search ? searchItems(r.items,search) : r.items).map((i: Item) => {
    const hit = known.get(i.type+":"+i.id);
    return hit && Date.now()-hit.at < 300000 ? mergeItems([i,hit.item])[0] : i;
  })]).filter((i: Item) => (type === "all" || i.type === type) && (options.hideAdult===false||!isAdultItem(i))).map((i:Item)=>applyRating(i,ratings.get(identityKey(i))));
  const needsMeta = (i: Item) => selected.length && !matchesGenres(i,selected);
  const uniqueRows=(_all:Item[])=>rows.map(r=>({...r,items:mergeItems(search?searchItems(r.items,search):r.items).filter((i:Item)=>options.hideAdult===false||!isAdultItem(i))}));
  const snapshot = () => {
    const all=allItems(), matches=all.filter((i:Item)=>matchesGenres(i,selected)&&matchesFacets(i,options.facets));
    const ranked=sortItems(search?searchItems(matches,search):matches,options.sort);
    return {
      generation:catalogGeneration, items: options.lazy?ranked:ranked.slice(0,visibleLimit), rows:uniqueRows(all),
      errors: rows.filter(r => r.error).length,
      hasMore: ranked.length>visibleLimit || rows.some(r => r.pageable && !r.exhausted),
      hasCheckMore: all.some((i: Item) => needsMeta(i) && !checked.has(i.type+":"+i.id)),
      loadMore: async () => { visibleLimit+=60;if(ranked.length>=visibleLimit){publish();return;}await Promise.all(rows.filter(r => r.pageable && !r.exhausted).map(r => r.load(true))); if(ranked.length<32)await checkMore();publish(); },
      checkMore,
      ratingPending:["rating","votes"].includes(options.sort||"")&&addons.some(a=>a.enabled&&a.manifest.id==="imdb.ratings.local")?matches.filter((i:Item)=>ratingId(i)&&!ratingChecked.has(identityKey(i))).length:0,ratingFailures,
      loadRecommendations:async()=>{const seen=new Set();await Promise.all(rows.filter(r=>{const key=r.addon.base+":"+r.type+":"+(r.catalog.itemType||"");if(seen.has(key)||r.view==="weekly")return false;seen.add(key);return true}).map(r=>r.load()));},
    };
  };
  const publish = () => { if (options.active?.() !== false) options.onUpdate?.(snapshot()); };
  async function refreshRatings(){
    if(ratingBusy||!["rating","votes"].includes(options.sort||"")||!addons.some(a=>a.enabled&&a.manifest.id==='imdb.ratings.local'))return;
    ratingBusy=true;
    try{for(;;){const pending=allItems().filter((i:Item)=>matchesGenres(i,selected)&&matchesFacets(i,options.facets)&&ratingId(i)&&!ratingChecked.has(identityKey(i))).slice(0,4);if(!pending.length||options.active?.()===false)break;
      await Promise.all(pending.map(async(i:Item)=>{try{const result=await titleRating(addons,i,json);if(result)ratings.set(identityKey(i),result);else ratingFailures++;}catch{ratingFailures++;}finally{ratingChecked.add(identityKey(i));}}));
      if(!ratingTimer)ratingTimer=setTimeout(()=>{ratingTimer=undefined;publish()},150);
    }}finally{ratingBusy=false;clearTimeout(ratingTimer);ratingTimer=undefined;publish();}
  }
  async function checkMore() {
    const candidates = allItems().filter((i: Item) => needsMeta(i) && !checked.has(i.type+":"+i.id)).slice(0,12);
    await Promise.all(candidates.map(async (i: Item) => {
      if (options.active?.() === false) return;
      checked.add(i.type+":"+i.id);
      const m = await metadata(addons,i,false);
      supplemental=supplemental.map(old=>old.type===i.type&&old.id===i.id?{...old,...m}:old);
      for (const row of rows) row.items = row.items.map((old: Item) => old.type === i.type && old.id === i.id ? { ...old, ...m } : old);
      publish();
    }));
    publish();
  }
  for (const r of rows) r.load = async (more = false) => {
    if (options.active?.() === false || r.loading || (!more && r.loaded) || (more && (!r.pageable || r.exhausted))) return;
    r.loading = true; publish();
    const extra = {...r.extra,...(more ? {skip:r.offset} : {})};
    const url = resourceUrl(r.addon.base,"catalog",r.type,r.catalog.id,extra);
    try {
      // A search-only cache miss must not replace a Home feed with an empty
      // response. Providers without search support are read locally only.
      const raw = r.cachedOnly ? (cache.peek(url) ?? (await cachedMetadata(url,()=>json(url),{cacheOnly:true})).metas ?? []) : await cache.get(url, () => limited(async () => {
        if (options.active?.() === false) return [];
        const data = await cachedMetadata(url,()=>json(url),{force:!!options.force,cacheOnly:!!r.cachedOnly,onRefresh:(data:any)=>{if(!more&&Array.isArray(data?.metas)&&options.active?.()!==false){r.items=catalogItems(data.metas.map((i:any,rank:number)=>normalizeItem(i,{...r,rank})),r);publish();void refreshRatings();}}});
        if (!Array.isArray(data.metas)) throw Error("Invalid catalog");
        return data.metas.filter((i: any) => i.id && i.name);
      }), !!options.force);
      const list = catalogItems(raw.map((i: any, rank: number) => normalizeItem(i,{...r,rank:rank+(more?r.offset:0)})),r);
      for (const i of list) {
        const k=i.type+":"+i.id, old=known.get(k);
        known.delete(k); known.set(k,{item:old && Date.now()-old.at<300000 ? mergeItems([i,old.item])[0] : i,at:Date.now()});
      }
      while(known.size>1200) known.delete(known.keys().next().value!);
      const before = r.items.length;
      r.items = more ? mergeItems([...r.items,...list]) : list;
      r.offset = more ? r.offset+raw.length : raw.length;
      r.exhausted = !raw.length || (!r.view && more && r.items.length === before);
      r.loaded = true; r.error = false;
    } catch {
      r.error = true; r.loaded = true;
      if(isAio(r.addon)&&!more){
        const backups=catalogJobs(addons.filter(a=>isFallback(a)),r.type.startsWith('anime')?'all':r.type,search,{genres:selected});
        for(const backup of backups.slice(0,2)){try{const data=await json(resourceUrl(backup.addon.base,'catalog',backup.type,backup.catalog.id,backup.extra));if(data.metas?.length){r.items=data.metas.map((i:any,rank:number)=>normalizeItem(i,{...backup,rank}));r.name=backup.name;r.error=false;r.pageable=false;break;}}catch{}}
      }
    }
    finally { r.loading = false; publish(); void refreshRatings(); }
    if(r.view&&!more&&r.pageable&&r.items.length<8&&!r.error){for(let page=0;page<3&&!r.exhausted&&r.items.length<8&&options.active?.()!==false;page++)await r.load(true);}
  };
  publish();
  await Promise.all([
    Promise.all((options.lazy ? rows.slice(0,2) : rows).map(r => r.load())),
    (!options.lazy && selected.includes('K-drama')) ? discoverySupplement(search,selected).then(list=>{supplemental=list.map(i=>normalizeItem(i));publish()}) : Promise.resolve()
  ]);
  // A selective filter needs more than the first catalog page. Keep expansion bounded.
  for(let page=0;selected.length && page<2 && snapshot().items.length<32 && options.active?.()!==false;page++) {
    const pageable=rows.filter(r=>r.pageable&&!r.exhausted).slice(0,6);
    if(!pageable.length)break;
    await Promise.all(pageable.map(r=>r.load(true)));
  }
  if (selected.length && snapshot().items.length < 32 && options.active?.() !== false) await checkMore();
  return snapshot();
}
export async function metadata(addons: Addon[], item: Item, episodes=true,onUpdate?:(item:Item)=>void) {
  const jobs=addons.filter(a=>a.enabled).map(a=>({a,t:resourceTypeFor(a.manifest,"meta",item.type,item.id,item.resourceType,supports)})).filter(j=>j.t);
  const cinema=jobs.find(j=>j.a.manifest.id==='com.linvo.cinemeta'),primary=jobs.find(j=>isAio(j.a));
  const get=async(j:any)=>{try{const m=await providerMeta(j.a,j.t,item.id,episodes);return m?.id===item.id?normalizeItem({...m,resourceType:j.t,provider:j.a.base},{catalog:{type:j.t}}):null;}catch{return null}};
  const baseline=cinema?get(cinema).then(m=>{if(m)onUpdate?.(enrichMetadata(m,item));return m}):Promise.resolve(null);
  const rich=primary?get(primary):Promise.resolve(null);
  const [base,aio]=await Promise.all([baseline,rich]);
  let combined:any=enrichMetadata(aio||base||item,item);
  if(base){
    combined=enrichMetadata(combined,base);
    if(base.videos?.length){
      combined.videos=base.videos.map((v:any)=>{const extra=matchEpisode(v,aio?.videos||[]);return mergeEpisode({...v,thumbnail:extra?.thumbnail||v.thumbnail},extra)});
      // Preserve announced episodes and their provider placeholder artwork,
      // while playable episodes retain Cinemeta's scraper-compatible IDs.
      for(const v of aio?.videos||[])if(Date.parse(v.released||v.firstAired)>Date.now()&&!combined.videos.some((b:any)=>Number(b.season)===Number(v.season)&&Number(b.episode)===Number(v.episode)))combined.videos.push(v);
    }
  }
  if(!base&&!aio){for(const j of jobs.filter(j=>j!==primary&&j!==cinema).slice(0,2)){const m=await get(j);if(m){combined=enrichMetadata(m,item);break}}}
  combined=normalizeItem(combined);known.set(item.type+":"+item.id,{item:combined,at:Date.now()});
  return combined as Item;
}
const artworkCache = new CatalogCache({limit:128});
export async function alternateArtwork(addons: Addon[], item: Item, kind: string): Promise<string[]> {
  const identity = addons.filter(a => a.enabled).map(a => a.base).join("|");
  return artworkCache.get(identity+":"+item.type+":"+item.id+":"+kind, async () => {
    const urls: string[] = [];
    const parsed=String(item.id).match(/^(.*):(\d+):(\d+)$/);
    const parent=kind==='thumbnail'?(item.seriesId||parsed?.[1]):null;
    const video=parent?{...item,season:item.season??Number(parsed?.[2]),episode:item.episode??Number(parsed?.[3])}:null;
    const id=parent||item.id;
    const jobs=addons.filter(a=>a.enabled).slice(0,12).map(async a=>{
      const t=resourceTypeFor(a.manifest,'meta',item.type,id,item.resourceType,supports);
      if(!t)return [];
      try{const m=await providerMeta(a,t,id);if(!m||m.id!==id)return [];
        const target=video?matchEpisode(video,m.videos||[]):m;
        return target?artworkCandidates(target,kind):[];
      }catch{return []}
    });
    if(video)jobs.push(episodeArtwork(item.series||{id:parent,type:'series'},video));
    for(const r of await Promise.allSettled(jobs))if(r.status==='fulfilled')urls.push(...r.value);
    return [...new Set(urls)];
  });
}
const streamCache = new CatalogCache({ttl: 120000, limit: 100});
export async function lookupStreams(addons: Addon[], type: string, id: string): Promise<{sources:any[],complete:boolean}> {
  const key = JSON.stringify([type,id,addons.filter(a=>a.enabled).map(a=>[a.base,a.manifest.resources])]);
  return streamCache.get(key, async () => {
    const sources: Addon[] = preferConfiguredTorrentio(addons);
  const result = await Promise.allSettled(
    sources
        .filter((a) => a.enabled && a.manifest.id !== 'imdb.ratings.local' && resourceTypeFor(a.manifest, "stream", type, id, undefined, supports))
      .map(async (a) => {
        const r = await json(resourceUrl(a.base, "stream", resourceTypeFor(a.manifest, "stream", type, id, undefined, supports)!, id));
        return (r.streams || []).map((s: any) => normalize(s, a.manifest.name));
      }),
  );
  return {sources:result.flatMap(r=>r.status==="fulfilled"?r.value:[]),complete:result.length>0&&result.every(r=>r.status==="fulfilled")};
  });
}
export async function streams(addons: Addon[], type: string, id: string) {
  return (await lookupStreams(addons,type,id)).sources;
}
export async function subtitles(
  addons: Addon[],
  type: string,
  id: string,
  stream: any,
) {
  const result = await Promise.allSettled(
    addons
      .filter((a) => a.enabled && resourceTypeFor(a.manifest, "subtitles", type, id, undefined, supports))
      .map(async (a) => {
        const h = stream.behaviorHints || {};
        const r = await json(
          resourceUrl(a.base, "subtitles", resourceTypeFor(a.manifest, "subtitles", type, id, undefined, supports)!, id, {
            videoHash: h.videoHash,
            videoSize: h.videoSize,
            filename: h.filename,
          }),
        );
        return (r.subtitles || []).map((s: any) => ({
          ...s,
          provider: a.manifest.name,
        }));
      }),
  );
  return [
    ...(stream.subtitles || []),
    ...result.flatMap((r) => (r.status === "fulfilled" ? r.value : [])),
  ];
}

export const artwork = (u?: string) =>
  u
    ? window.ember
      ? window.ember.artworkURL?.(u) || "ember-art://image/?url=" + encodeURIComponent(u)
      : u
    : undefined;
