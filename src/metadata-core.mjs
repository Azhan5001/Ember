const unique = values => [...new Set(values.filter(Boolean))];
export const plainText = s => String(s || '').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&#39;|&apos;/g,"'").replace(/&quot;/g,'"');
const title = v => plainText(v.title || v.name).toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const date = v => Date.parse(v.released || v.firstAired || v.airdate || '');
export function matchEpisode(video, alternatives) {
  const named = title(video), useful = named && !/^episode\d+$/.test(named);
  const closeDate = v => Number.isFinite(date(video)) && Math.abs(date(v)-date(video)) <= 86400000*2;
  const sameNumber = v => Number(v.season)===Number(video.season) && Number(v.episode ?? v.number)===Number(video.episode ?? video.number);
  // A date/title match handles providers splitting anime cours into different seasons.
  const exact = alternatives.filter(v => useful && title(v)===named && closeDate(v));
  if(exact.length===1)return exact[0];
  const numbered=alternatives.find(v=>sameNumber(v) && (closeDate(v) || useful && title(v)===named || !Number.isFinite(date(video)) || !Number.isFinite(date(v))));
  if(numbered)return numbered;
  const dated=alternatives.filter(closeDate);
  return dated.length===1 ? dated[0] : undefined;
}
export function mergeEpisode(v, extra) {
  if(!extra)return v;
  const thumbnails=unique([...(v.thumbnails||[]),extra.thumbnail,extra.image?.original,extra.image?.medium,...(extra.thumbnails||[])]);
  return {...extra,...v,thumbnail:v.thumbnail||thumbnails[0],thumbnails,
    description:plainText(v.description||v.overview||extra.description||extra.summary),
    released:v.released||v.firstAired||extra.released||extra.airstamp||extra.airdate,
    rating:Number(v.rating)>0?v.rating:extra.rating?.average??extra.rating,
    ratingProvider:Number(v.rating)>0?v.ratingProvider:extra.rating?.average?'TVmaze':extra.ratingProvider};
}
export function enrichMetadata(primary, extra) {
  const result={...extra,...Object.fromEntries(Object.entries(primary).filter(([,v])=>v!==null&&v!==undefined&&v!==''&&(!Array.isArray(v)||v.length)))};
  for(const field of ['genres','categories','confirmedGenres','cast','director','trailers','trailerStreams']) result[field]=unique([...(primary[field]||[]),...(extra[field]||[])]);
  if(primary.videos?.length)result.videos=primary.videos.map(v=>mergeEpisode(v,matchEpisode(v,extra.videos||[])));
  return result;
}
export function tvmazeItem(show) {
 const country=(show.network||show.webChannel)?.country?.name||'';
 return {id:show.externals?.imdb||`tvmaze:${show.id}`,type:'series',name:show.name,tvmaze_id:show.id,
  tvdb_id:show.externals?.thetvdb,genres:show.genres||[],language:show.language,country,
  categories:show.language==='Korean'&&show.type==='Scripted'?['K-drama']:[],
  description:plainText(show.summary),poster:show.image?.original,year:show.premiered?.slice(0,4),released:show.premiered,
  rating:show.rating?.average,ratingProvider:'TVmaze',status:show.status,runtime:show.averageRuntime?`${show.averageRuntime} min`:undefined,
  network:(show.network||show.webChannel)?.name,metadataSource:show.url};
}
export function animeEpisodeMappings(rows,item,video) {
 const id=String(item.imdb_id||item.imdbId||item.id),season=Number(video.season),episode=Number(video.episode);
 const direct=String(item.id).match(/^(mal|kitsu|anilist):(\d+)$/);
 const matches=rows.filter(r=>direct?String(r[direct[1]+'_id'])===direct[2]:(r.imdb_id||[]).includes(id));
 const order=item.episodeOrder==='tmdb'?'tmdb':'tvdb';
 const eligible=matches.filter(r=>r.mal_id && (direct || Number(r.season?.[order])===season));
 const candidates=eligible.map(r=>({mal:r.mal_id,episode:episode-(direct?0:Number(r.episode_offset?.[order]||0)),offset:Number(r.episode_offset?.[order]||0)})).filter(r=>r.episode>0);
 // Highest applicable offset is the matching cour; never reuse season one's MAL ID for a later season.
 return candidates.sort((a,b)=>b.offset-a.offset).slice(0,1);
}
export function trailerId(item) {
 for(const t of [...(item.trailerStreams||[]),...(item.trailers||[])]){const id=t.ytId||t.source;if(/^[\w-]{11}$/.test(id||''))return id;}
 return null;
}
