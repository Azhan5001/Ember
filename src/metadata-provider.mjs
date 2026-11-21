export const AIO_BASE='https://aiometadata.elfhosted.com/stremio/72a1aa3f-64bb-49de-b55c-d0c9007413b8';
export const isAio=a=>a?.manifest?.id==='aio-metadata';
export const isCinemeta=a=>a?.manifest?.id==='com.linvo.cinemeta';
export const isAnimeFallback=a=>a?.manifest?.id==='animes-season-addon';
export const isFallback=a=>['com.linvo.cinemeta','animes-season-addon'].includes(a?.manifest?.id);
export const hasAio=addons=>addons.some(a=>a.enabled&&isAio(a));
// Only actual genre feeds contribute tags. Language/year/schedule options are separate facets.
export const isGenreCatalog=c=>!/(?:trending|airing_today|\.year|\.language|\.schedule|\.seasons|\.studios|\.collections)/.test(c.id);
export function catalogPriority(job){
 if(isCinemeta(job.addon))return 0;
 if(isAnimeFallback(job.addon))return 10;
 if(!isAio(job.addon))return 100;
 if(job.catalog.id==='mal.airing')return 10;
 if(job.catalog.id==='mal.season_top_new')return 11;
 if(job.catalog.id==='mal.top_series')return 12;
 if(job.catalog.id==='mal.top_movies')return 13;
 return 50;
}
export function catalogViews(c){
 const names={'mal.airing':'MAL Top airing — Anime','mal.season_top_new':'Top new this week — Anime','mal.top_series':'MAL Top series — Anime','mal.top_movies':'MAL Top movies — Anime'};
 return [{...c,...(names[c.id]?{name:names[c.id]}:{}),...(['mal.top_series','mal.top_movies'].includes(c.id)?{itemType:c.id==='mal.top_movies'?'movie':'series'}:{})}];
}
export function catalogItems(items,job){return job.catalog?.itemType?items.filter(i=>i.type===job.catalog.itemType):items;}
export function refreshBundledMetadata(addons,defaults){
 const current=defaults.find(a=>isAio(a));
 const oldBase='https://aiometadata.elfhosted.com/stremio/23e5c3c4-cc2f-40a8-8608-8fd2f51fc5cb';
 const list=(addons||[]).map(a=>current&&isAio(a)&&[oldBase,current.base].includes(a.base)?{...a,base:current.base,manifest:current.manifest}:a);
 const seen=new Set();return list.filter(a=>{if(seen.has(a.base))return false;seen.add(a.base);return true});
}
export function defaultCatalogChoice(c,options,now=new Date()){
 if(c.id==='mal.schedule')return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][now.getUTCDay()];
 if(c.id==='mal.seasons'){const season=['Winter','Spring','Summer','Fall'][Math.floor(now.getUTCMonth()/3)]+' '+now.getUTCFullYear();return options.includes(season)?season:options[0];}
 return options[0];
}
export function catalogFacet(c){return /\.year$/.test(c.id)?'year':/\.language$/.test(c.id)?'language':/\.studios$/.test(c.id)?'studio':null;}
export function facetOptions(addons,facet){return [...new Set(addons.filter(a=>a.enabled&&isAio(a)).flatMap(a=>(a.manifest.catalogs||[]).filter(c=>catalogFacet(c)===facet).flatMap(c=>c.extra?.find(e=>e.name==='genre')?.options||[])))];}
export function matchesFacets(item,facets={}){
 if(facets.year&&String(item.year||item.releaseInfo||item.released||'').slice(0,4)!==facets.year&&item.catalogFacets?.year!==facets.year)return false;
 return ['language','studio'].every(f=>!facets[f]||item.catalogFacets?.[f]===facets[f]||String(item[f]||'').toLowerCase()===facets[f].toLowerCase());
}
