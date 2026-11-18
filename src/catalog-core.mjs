// Provider-neutral catalog planning. Resource types are never replaced in URLs.
export const SORTS = { default: 'Default', popularity: 'Popularity', trending: 'Trending', airing: 'Top airing', rating: 'Highest rated', votes: 'Most rated', newest: 'Newest' };
const key = s => { const k=String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); return ({sciencefiction:'scifi',scifi:'scifi',koreandrama:'kdrama',animated:'animation'})[k] || k; };
export function extras(c) {
  const names = new Set([...(c.extra || []).map(e => e.name), ...(c.extraSupported || []), ...(c.extraRequired || [])]);
  return [...names].map(name => ({ ...(c.extra || []).find(e => e.name === name), name, isRequired: !!((c.extra || []).find(e => e.name === name)?.isRequired || c.extraRequired?.includes(name)) }));
}
export function feedSort(c) {
  const s = key(c.id + ' ' + c.name);
  if (/airing|onair/.test(s)) return 'airing';
  if (/votecount|mostvoted|mostrated/.test(s)) return 'votes';
  if (/rating|rated|imdb/.test(s)) return 'rating';
  if (/trending/.test(s)) return 'trending';
  if (/popular|^top/.test(s)) return 'popularity';
  if (/new|latest|year|release/.test(s)) return 'newest';
  return 'default';
}
export function catalogLabel(a,c){
 const provider=key(a.manifest?.id+' '+a.manifest?.name),name=String(c.name||c.id);
 if(provider.includes('cinemeta')){const label=name.replace(/^cinemeta\s*[-·:]?\s*/i,'');return /movies?|series|shows?/i.test(label)?label:label+' '+(c.type==='movie'?'movies':'series')}
 if(/animes?seasons?/.test(provider)){let label=name.replace(/^anime[’']?s?\s*seasons?\s*[-·:]\s*/i,'');if(/^anime years?$/i.test(label))label='Anime of the year';return label}
 return `${a.manifest.name} · ${name}`;
}
/** @param {any[]} addons @param {string} type @param {string} search @param {{genres?: string[], sort?: string}} options */
export function catalogJobs(addons, type = 'all', search = '', { genres = [], sort = 'default' } = {}) {
  return addons.filter(a => a.enabled && !a.manifest.behaviorHints?.configurationRequired && !/(?:torrentio|torrenio)\s*tb/i.test(`${a.manifest?.name || ''} ${a.manifest?.id || ''} ${a.base || ''}`)).flatMap(a => (a.manifest.catalogs || []).flatMap(c => {
    if (!c.type || !c.id || (type !== 'all' && ['movie','series'].includes(c.type) && c.type !== type)) return [];
    const ex = extras(c), extra = {};
    const localSearch = search && !ex.some(e => e.name === 'search') ? search : '';
    if (search && !localSearch) extra.search = search;
    const genre = ex.find(e => e.name === 'genre');
    const selected = genres.find(g => genre?.options?.some(o => key(o) === key(g)));
    if (selected) extra.genre = genre.options.find(o => key(o) === key(selected));
    const sorter = ex.find(e => ['sort','sort_by','order'].includes(e.name));
    const order = sorter?.options?.find(o => feedSort({ id:o, name:o }) === sort);
    if (sort !== 'default' && order) extra[sorter.name] = order;
    for (const e of ex) if (e.isRequired && extra[e.name] === undefined) {
      // Search / account-context-only catalogs are not home rows.
      if (!e.options?.length) return [];
      extra[e.name] = e.options[0];
    }
    return [{ addon: a, catalog: c, type: c.type, extra, localSearch, feedSort: order ? sort : feedSort(c), name: catalogLabel(a,c), pageable: ex.some(e => e.name === 'skip') }];
  }));
}
export function genreOptions(addons) {
  const common = ['Anime','K-drama','Action','Adventure','Comedy','Drama','Romance','Thriller','Sci-Fi','Fantasy','Mystery','Horror','Animation','Documentary','Crime','Family','Adult','Nudity'];
  const all = addons.filter(a => a.enabled).flatMap(a => (a.manifest.catalogs || []).flatMap(c => [...(c.genres || []), ...(extras(c).find(e => e.name === 'genre')?.options || [])]));
  return [...new Map([...common, ...all.filter(g => !/^\d{4}$/.test(g))].map(g => [key(g),g])).values()];
}
export function normalizeItem(raw, job = {}) {
  const c = job.catalog || {}, a = job.addon || {};
  const japaneseAnimation = /japan|^ja$|^jpn$/.test(key([raw.country,raw.language,raw.original_language].join(' '))) && raw.genres?.some(g => key(g) === 'animation');
  const anime = japaneseAnimation || c.type === 'anime' || /^(kitsu|mal|anilist|anidb):/.test(raw.id) || /anime/i.test(`${c.id || ''} ${c.name || ''}`);
  const format = key(raw.media_type || raw.format || raw.subtype);
  const type = raw.type === 'movie' || format === 'movie' ? 'movie' : raw.type === 'series' || raw.type === 'anime' || c.type === 'anime' || raw.videos?.length ? 'series' : raw.type || c.type;
  const korean = /korean|southkorea|^kr$|^ko$|^kor$/.test(key([raw.country,raw.language,raw.original_language].join(' ')));
  const kdrama = /k.?drama|korean.*drama|korean.*(latest|trending)/i.test(`${c.name || ''} ${c.id || ''}`) || (korean && raw.genres?.some(g => key(g) === 'drama'));
  const linkedGenres=(raw.links||[]).filter(l=>l.category==='Genres').map(l=>l.name);
  const declaredGenres = raw.genres?.length ? raw.genres : raw.genre?.length ? raw.genre : linkedGenres.length ? linkedGenres : String(raw.description || '').match(/^Genres:\s*([^\n]+)/)?.[1]?.split(',').map(g=>g.trim()).filter(Boolean);
  return { ...raw, genres:declaredGenres, type, resourceType: raw.resourceType || c.type || raw.type, provider: raw.provider || a.base, categories: [...new Set([...(raw.categories || []), ...(anime ? ['Anime'] : []), ...(kdrama ? ['K-drama'] : [])])], confirmedGenres: [...new Set([...(raw.confirmedGenres || []), ...(job.extra?.genre && !/^\d{4}$/.test(job.extra.genre) ? [job.extra.genre] : [])])], ranks: { ...(raw.ranks || {}), ...(job.feedSort && job.feedSort !== 'default' ? { [job.feedSort]: job.rank ?? 0 } : {}) } };
}
/** @param {any} i @param {string[]} selected */
export function matchesGenres(i, selected = []) {
  const all = [...(i.genres || []), ...(i.confirmedGenres || []), ...(i.categories || [])].map(key);
  return selected.every(g => all.includes(key(g)));
}
const titleText = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const releaseYear = i => String(i.year || i.releaseInfo || i.released || '').match(/(?:19|20)\d{2}/)?.[0] || '';
const imdbId = i => String(i.imdb_id || i.imdbId || i.imdb || i.id || '').match(/tt\d{5,}/)?.[0];
export function identityKey(i) { return `${i.type}:${imdbId(i) || i.id || titleText(i.name)+':'+releaseYear(i)}`; }
export function sameTitle(a,b) {
 if(a.type!==b.type)return false;
 if(a.id&&a.id===b.id || imdbId(a)&&imdbId(a)===imdbId(b))return true;
 if(imdbId(a)&&imdbId(b)&&imdbId(a)!==imdbId(b))return false;
 return !!titleText(a.name)&&titleText(a.name)===titleText(b.name)&&!!releaseYear(a)&&releaseYear(a)===releaseYear(b);
}
export function mergeItems(items) {
 const out=[],byId=new Map(),byName=new Map();
 for(const i of items){const id=identityKey(i),name=releaseYear(i)?i.type+':'+titleText(i.name)+':'+releaseYear(i):null;
 const named=name?byName.get(name):undefined;
 const at=byId.get(id) ?? (named!==undefined&&sameTitle(out[named],i)?named:-1);
 if(at<0){byId.set(id,out.length);if(name)byName.set(name,out.length);out.push(i);continue;}
 byId.set(id,at);if(name)byName.set(name,at);
 const old=out[at],prefer=x=>(imdbId(x)?100:0)+['description','poster','background','logo','genres'].filter(k=>x[k]?.length).length;
 const chosen=prefer(i)>prefer(old)?i:old,other=chosen===i?old:i;
 out[at]={...other,...chosen,genres:[...new Set([...(old.genres||[]),...(i.genres||[])])],confirmedGenres:[...new Set([...(old.confirmedGenres||[]),...(i.confirmedGenres||[])])],categories:[...new Set([...(old.categories||[]),...(i.categories||[])])],ranks:{...i.ranks,...old.ranks}};}
 return out;
}
function nearWord(a,b){
 if(Math.min(a.length,b.length)<4||Math.abs(a.length-b.length)>1)return false;
 if(a===b)return true;
 if(a.length===b.length){const diff=[...a].map((c,i)=>c===b[i]?-1:i).filter(i=>i>=0);return diff.length===1 || diff.length===2&&diff[1]===diff[0]+1&&a[diff[0]]===b[diff[1]]&&a[diff[1]]===b[diff[0]];}
 if(a.length>b.length)[a,b]=[b,a];let i=0,j=0,skip=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++}else{j++;if(++skip>1)return false}}return true;
}
export function searchScore(i,query){const q=titleText(query),names=[i.name,i.original_title,i.originalName,...(Array.isArray(i.aliases)?i.aliases:[])].map(titleText).filter(Boolean);if(!q)return 1;return Math.max(0,...names.map(n=>n===q?100:n.startsWith(q)?80:n.includes(q)?65:q.split(' ').every(w=>n.split(' ').some(t=>t.startsWith(w)))?45:q.split(' ').every(w=>n.split(' ').some(t=>t===w||nearWord(w,t)))?25:0));}
export function searchItems(items,query){return mergeItems(items).map(item=>({item,score:searchScore(item,query)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||Number(b.item.type==='series')-Number(a.item.type==='series')).map(x=>x.item);}
function metric(i, sort) {
  const value = sort === 'rating' ? (i.imdbRating ?? i.rating) : sort === 'votes' ? (i.vote_count ?? i.votes ?? i.imdbVotes) : sort === 'popularity' ? i.popularity : sort === 'newest' ? Date.parse(i.released || i.releaseInfo || i.year || '') : undefined;
  const n = Number(String(value ?? '').replaceAll(',',''));
  return value !== undefined && value !== '' && Number.isFinite(n) ? n : undefined;
}
export function sortItems(items, sort = 'default') {
  if (sort === 'default') return items;
  return [...items].sort((a,b) => {
    const av=metric(a,sort) ?? (sort === 'popularity' ? metric(a,'rating') : undefined),bv=metric(b,sort) ?? (sort === 'popularity' ? metric(b,'rating') : undefined);
    if (av !== undefined && bv !== undefined) return bv-av;
    if (av !== undefined) return -1;
    if (bv !== undefined) return 1;
    const ar=a.ranks?.[sort],br=b.ranks?.[sort];
    if(ar !== undefined && br !== undefined) return ar-br;
    if(ar !== undefined) return -1;
    if(br !== undefined) return 1;
    return 0;
  });
}
export function resourceTypeFor(manifest, resource, type, id, preferred, supports) {
  return [...new Set([preferred,type,...(manifest.types || []),...(manifest.resources || []).flatMap(r => typeof r === "object" && r.name === resource ? r.types || [] : [])])].filter(Boolean).find(t => supports(manifest,resource,t,id));
}



