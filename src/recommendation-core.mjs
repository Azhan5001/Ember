import {historyItems, titleKey} from './history-core.mjs';
import {identityKey,mergeItems} from './catalog-core.mjs';

const norm = x => String(x || '').normalize('NFKC').trim().toLowerCase();
const list = x => (Array.isArray(x) ? x : typeof x === 'string' ? x.split(/[,/]/) : []).map(v=>norm(typeof v === 'object' ? v.name : v)).filter(Boolean);
const aliases = {en:'english',eng:'english',ko:'korean',kor:'korean',ja:'japanese',jpn:'japanese',fr:'french',fra:'french',fre:'french',kr:'south korea','korea, republic of':'south korea',jp:'japan',us:'united states',usa:'united states',france:'france'};
const stop = new Set('about after again against also among an and are as at be been before being between but by can could day for from had has have her here him his how in into is it its life more must new not of on one or other out over own she some story than that the their them then there these they this through to two up was were what when where which while who will with world years young'.split(' '));
export function features(item) {
  const f = new Map();
  const add = (kind,values,weight) => {
    const unique = [...new Set(list(values))];
    for (const value of unique) f.set(`${kind}:${aliases[value] || value}`,weight / Math.sqrt(Math.max(1,unique.length)));
  };
  add('genre',[...(item.genres||[]),...(item.confirmedGenres||[])],3);
  add('category',item.categories,2.6);
  add('language',item.original_language || item.language || item.languages,2);
  add('country',item.country || item.countries || item.production_countries,1.6);
  add('director',item.director || item.directors,1.7);
  add('cast',list(item.cast).slice(0,5),.9);
  add('format',[item.type],.6);
  const year = Number(String(item.year || item.releaseInfo || '').match(/(?:19|20)\d{2}/)?.[0]);
  if(year) add('decade',[String(Math.floor(year/10)*10)],.5);
  const words = norm(item.description).match(/[\p{L}]{4,}/gu) || [];
  add('theme',words.filter(w=>!stop.has(w)).slice(0,100),.8);
  return f;
}
const dot = (a,b) => [...a].reduce((s,[k,v])=>s+v*(b.get(k)||0),0);
const unit = f => {const length=Math.sqrt(dot(f,f)) || 1;return new Map([...f].map(([k,v])=>[k,v/length]));};

// Content-based ranking: IDF feature vectors, recency/engagement weighted
// profile, nearest-title similarity, and MMR diversity re-ranking.
// No cross-user training data or claims of measured prediction accuracy.
export function recommend(candidates, history = {}, {limit=20,now=Date.now()} = {}) {
  const watched = historyItems(history), excluded = new Set(watched.map(h=>identityKey(h.item)));
  const pool = mergeItems(candidates).filter(i=>!excluded.has(identityKey(i)) && !history[titleKey(i)]?.qualifiedAt).slice(0,1200);
  const all = [...watched.map(h=>h.item),...pool];
  const raw = all.map(features), counts = new Map();
  for (const f of raw) for (const key of f.keys()) counts.set(key,(counts.get(key)||0)+1);
  const vectors = raw.map(f=>unit(new Map([...f].map(([key,v])=>[key,v*(1+Math.log((all.length+1)/((counts.get(key)||0)+1)))]))));
  const profile = new Map();
  watched.forEach((h,index)=>{
    const age = Math.max(0,now-h.lastWatched)/86400000;
    const engagement = h.item.type === 'movie' ? .5+.5*h.fraction : .7+.3*Math.min(1,h.completedEpisodes/10);
    const weight = (.25+.75*Math.pow(.5,age/120))*engagement;
    for (const [key,v] of vectors[index]) profile.set(key,(profile.get(key)||0)+v*weight);
  });
  const taste = unit(profile), confidence = Math.min(1,watched.length/6);
  const scored = pool.map((item,index)=>{
    const vector = vectors[index+watched.length];
    let similarity = 0, nearest = null;
    watched.forEach((h,n)=>{const s=dot(vector,vectors[n]);if(s>similarity){similarity=s;nearest=h;}});
    const rating = Math.min(10,Math.max(0,Number(item.imdbRating || item.rating)||6.5))/10;
    const relevance = .65*dot(vector,taste)+.35*similarity;
    const score = watched.length ? (.75+.15*confidence)*relevance+(.25-.15*confidence)*rating : rating;
    const matches = [...vector].filter(([k])=>!k.startsWith('theme:')&&!k.startsWith('format:')&&!k.startsWith('decade:')).sort((a,b)=>b[1]*(taste.get(b[0])||0)-a[1]*(taste.get(a[0])||0));
    const match = matches.find(([k])=>(taste.get(k)||0)>0)?.[0]?.split(':').slice(1).join(':');
    const reason = nearest && match ? `Because you watched ${nearest.item.name} · ${match}` : watched.length ? 'Something different to explore' : 'Explore while Ember learns your taste';
    return {item,vector,score,reason};
  });
  const chosen = [];
  while(scored.length && chosen.length<limit){
    let best=0, value=-Infinity;
    scored.forEach((r,index)=>{
      const redundancy = Math.max(0,...chosen.map(c=>dot(c.vector,r.vector)));
      const mmr = .85*r.score-.15*redundancy;
      if(mmr>value){best=index;value=mmr;}
    });
    chosen.push(scored.splice(best,1)[0]);
  }
  return chosen.map(({item,reason})=>({...item,recommendationReason:reason}));
}
