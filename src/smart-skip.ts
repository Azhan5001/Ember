import {CatalogCache} from './catalog-cache.mjs';
const timingCache=new CatalogCache({ttl:21600000,limit:120});
import { animeMapping } from './metadata-enrichment';
import { json } from "./api";
import { normalizeSegments } from "./skip-core.mjs";
export async function segmentDetails(
  item: any,
  video: any,
  duration: number,
  loader = json,
  onUpdate?: (segments:any[])=>void,
) {
  const read=(url:string)=>loader===json?timingCache.get(url,()=>loader(url)):loader(url);
  const imdb = String(item.imdb_id || item._imdbId || item.imdbId || item.id).match(
    /tt\d+/,
  )?.[0];
  const idparts = String(video?.id || "").split(":");
  const season = video?.season ?? Number(idparts.at(-2)),
    episode = video?.episode ?? Number(idparts.at(-1));
  const tv = item.type === "series";
  const q = new URLSearchParams({ imdb_id: imdb || "" });
  if (tv) {
    if (!(season >= 0 && episode > 0))
      return { segments: [], errors: ["Episode season/number missing."] };
    q.set("season", String(season));
    q.set("episode", String(episode));
  } else q.set("is_movie", "true");
  const jobs: { provider: string; run: Promise<any[]> }[] = [];
  if (imdb) {
    jobs.push({
      provider: "IntroDB",
      run: read("https://api.introdb.app/segments?" + q).then((r) =>
        ["intro", "recap", "outro"].flatMap((type) =>
          r[type]
            ? [
                {
                  type,
                  start: r[type].start_sec ?? r[type].start_ms / 1000,
                  end: r[type].end_sec ?? r[type].end_ms / 1000,
                  confidence: r[type].confidence,
                  submissions: r[type].submission_count,
                  provider: "IntroDB",
                  match: "community",
                },
              ]
            : [],
        ),
      ),
    });
    const sq = new URLSearchParams(q);
    sq.delete("is_movie");
    sq.set("duration", String(Math.round(duration)));
    sq.set("adjust", "conservative");
    jobs.push({
      provider: "SkipDB",
      run: read("https://api.skipdb.tv/api/segments?" + sq).then((r) =>
        Object.entries(r.segments || {}).flatMap(([type, s]: any) =>
          s
            ? [
                {
                  type,
                  start: s.start_ms / 1000,
                  end: (s.end_ms ?? duration * 1000) / 1000,
                  match: s.match,
                  confidence: s.confidence,
                  provider: "SkipDB",
                },
              ]
            : [],
        ),
      ),
    });
  }
  const directMal = item.mal_id || item._malId || item.malId || String(item.id).match(/^mal:(\d+)$/)?.[1];
  if(directMal||item.categories?.includes('Anime')||item.genres?.some((g:string)=>/anime|animation/i.test(g))){
    jobs.push({provider:'AniSkip',run:(async()=>{
      const mapped=await animeMapping(item,{...video,season,episode});
      const anime=mapped[0]||(directMal&&season===1?{mal:directMal,episode}:null);
      if(!anime||anime.episode<=0)return [];
      const r=await read(`https://api.aniskip.com/v2/skip-times/${anime.mal}/${anime.episode}?types%5B%5D=op&types%5B%5D=ed&episodeLength=${duration}`);
      return (r.results||[]).map((s:any)=>({type:s.skipType==='op'?'intro':'outro',start:s.interval.startTime,end:s.interval.endTime,provider:'AniSkip',match:Math.abs((s.episodeLength||duration)-duration)<=3?'exact':'community'}));
    })()});
  }
  const partial:any[]=[];
  for(const job of jobs)void job.run.then(list=>{partial.push(...list);onUpdate?.(normalizeSegments(partial,duration))},()=>{});
  const results = await Promise.allSettled(jobs.map((j) => j.run));
  return {
    segments: normalizeSegments(
      results.flatMap((r) => (r.status === "fulfilled" ? r.value : [])),
      duration,
    ),
    errors: results.flatMap((r, i) =>
      r.status === "rejected" ? [jobs[i].provider + " unavailable"] : [],
    ),
  };
}
export async function segments(item: any, video: any, duration: number) {
  return (await segmentDetails(item, video, duration)).segments;
}
export async function releaseKey(s: any, source: any, duration: number) {
  const raw = JSON.stringify([
    s.item.id,
    s.vid,
    source.infoHash,
    source.fileIdx,
    source.key,
    Math.round(duration),
  ]);
  return (
    "ember-skip-" +
    Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)),
      ),
    )
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("")
  );
}
export function lang(v = "") {
  return (
    (
      {
        eng: "en",
        jpn: "ja",
        kor: "ko",
        spa: "es",
        fre: "fr",
        fra: "fr",
        ger: "de",
        deu: "de",
        zho: "zh",
        chi: "zh",
        hin: "hi",
        urd: "ur",
        ara: "ar",
      } as any
    )[v.toLowerCase()] || v.toLowerCase().split("-")[0]
  );
}
export function original(item: any) {
  return (
    item.original_language ||
    item.originalLanguage ||
    (/japan/i.test(item.country || "")
      ? "ja"
      : /korea/i.test(item.country || "")
        ? "ko"
        : "auto")
  );
}
