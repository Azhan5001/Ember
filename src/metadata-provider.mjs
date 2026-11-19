export const AIO_BASE='https://aiometadata.elfhosted.com/stremio/23e5c3c4-cc2f-40a8-8608-8fd2f51fc5cb';
export const isAio=a=>a?.manifest?.id==='aio-metadata';
export const isFallback=a=>['com.linvo.cinemeta','animes-season-addon'].includes(a?.manifest?.id);
export const hasAio=addons=>addons.some(a=>a.enabled&&isAio(a));
// Only actual genre feeds contribute tags. Language/year/schedule options are separate facets.
export const isGenreCatalog=c=>!/(?:trending|airing_today|\.year|\.language|\.schedule|\.seasons|\.studios|\.collections)/.test(c.id);
const order=['tmdb.top:movie','tmdb.top:series','tmdb.airing_today:series','tmdb.trending:movie','tmdb.trending:series','mal.airing:anime','mal.top_anime:anime','mal.seasons:anime','tmdb.top_rated:movie','tmdb.top_rated:series'];
export function catalogPriority(job){const i=order.indexOf(job.catalog.id+':'+job.type);return isAio(job.addon)?i<0?50:i:100;}
export function catalogFacet(c){return /\.year$/.test(c.id)?'year':/\.language$/.test(c.id)?'language':/\.studios$/.test(c.id)?'studio':null;}
export function facetOptions(addons,facet){return [...new Set(addons.filter(a=>a.enabled&&isAio(a)).flatMap(a=>(a.manifest.catalogs||[]).filter(c=>catalogFacet(c)===facet).flatMap(c=>c.extra?.find(e=>e.name==='genre')?.options||[])))];}
export function matchesFacets(item,facets={}){
 if(facets.year&&String(item.year||item.releaseInfo||item.released||'').slice(0,4)!==facets.year&&item.catalogFacets?.year!==facets.year)return false;
 return ['language','studio'].every(f=>!facets[f]||item.catalogFacets?.[f]===facets[f]||String(item[f]||'').toLowerCase()===facets[f].toLowerCase());
}
