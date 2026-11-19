const api = "https://api.torbox.app/v1/api/torrents";
const name = value => typeof value === "string" ? value.split(/[/\\]/).pop().toLowerCase() : "";
const validId = value => Number.isSafeInteger(value) && value >= 0;

export function selectFile(files, {filename, index, movie}) {
  const videos = Array.isArray(files) ? files.filter(file => validId(file?.id) &&
    /\.(mkv|mp4|webm|m4v|avi|mov|ts|mpg|wmv)$/i.test(name(file.short_name || file.name))) : [];
  const matches = videos.filter(file => filename && name(file.short_name || file.name) === name(filename));
  if (matches.length === 1) return matches[0].id;
  if (validId(index)) return videos.find(file => file.id === index)?.id;
  if (videos.length === 1) return videos[0].id;
  if (movie) return videos.sort((a,b) => (b.size || 0) - (a.size || 0))[0]?.id;
}

async function torbox(path, token, failure, options = {}) {
  const response = await fetch(api + path, {
    ...options, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8000),
    headers: {Authorization: "Bearer " + token},
  }).catch(() => { throw Error("Ember could not reach TorBox. Try again shortly."); });
  if ([401, 403].includes(response.status)) throw Error("TorBox rejected the API key. Check it in Addons.");
  if (response.status === 429) throw Error("TorBox is limiting requests. Try again shortly.");
  const reader = response.body?.getReader();
  if (!reader) throw Error(failure);
  const decoder = new TextDecoder();
  let text = "", bytes = 0;
  for (;;) {
    const {value,done} = await reader.read().catch(() => { throw Error(failure); });
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 2_000_000) { void reader.cancel(); throw Error(failure); }
    text += decoder.decode(value,{stream:true});
  }
  let result;
  try { result = JSON.parse(text + decoder.decode()); }
  catch { throw Error(failure); }
  if (result?.error === "DOWNLOAD_NOT_CACHED") throw Error("DOWNLOAD_NOT_CACHED");
  if (!response.ok || result?.success !== true) throw Error(failure);
  return result.data;
}

async function resolve(token, source) {
  const form = new FormData();
  form.set("magnet", "magnet:?xt=urn:btih:" + source.hash);
  form.set("add_only_if_cached", source.queue ? "false" : "true");
  form.set("allow_zip", "false");
  const matchesHash = item => item?.hash?.toLowerCase() === source.hash.toLowerCase();
  const created = await torbox("/createtorrent", token,
    "TorBox could not open this as a cached release. Choose another source.", {method:"POST",body:form});
  if (source.queue) return {queued:true};
  const id = created?.torrent_id ?? (Array.isArray(created) ? created.find(matchesHash)?.id : undefined);
  if (!validId(id)) throw Error("TorBox returned no cached torrent ID.");
  const list = await torbox("/mylist?" + new URLSearchParams({id,bypass_cache:"true"}),
    token, "TorBox could not look up the cached files.");
  const release = Array.isArray(list) ? list.find(item => item?.id === id) : list;
  if (release?.hash && !matchesHash(release)) throw Error("TorBox returned a different release.");
  const file = selectFile(release?.files, source);
  if (file === undefined) throw Error("Ember could not identify this video in the cached release. Choose another source.");
  const link = await torbox("/requestdl?" + new URLSearchParams({token,torrent_id:id,file_id:file,zip_link:"false"}),
    token, "TorBox could not create a playback link.");
  const url = typeof link === "string" && URL.canParse(link) ? new URL(link) : null;
  if (url?.protocol !== "https:" || url.username || url.password) throw Error("TorBox did not return a secure playback link.");
  return {url:url.href};
}

function json(value, status) {
  return Response.json(value, {status,headers:{"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
}

const torboxHost = host => ['torbox.app','tb-cdn.pw'].some(domain=>host===domain||host.endsWith('.'+domain));
export async function providerLink(raw) {
  let url;
  try { url=new URL(raw); } catch { throw Error('Invalid provider link.'); }
  if(url.protocol!=='https:' || url.username || url.password || url.port ||
     url.hostname!=='torrentio.strem.fun' || !url.pathname.startsWith('/resolve/torbox/'))
    throw Error('Unsupported provider link.');
  for(let redirects=0;redirects<5;redirects++) {
    const response=await fetch(url.href,{redirect:'manual',cache:'no-store',
      signal:AbortSignal.timeout(10000),headers:{Range:'bytes=0-0','User-Agent':'Ember/0.7.6'}});
    void response.body?.cancel();
    if([301,302,303,307,308].includes(response.status)) {
      const location=response.headers.get('Location');if(!location)break;
      const next=new URL(location,url);
      if(next.protocol!=='https:' || next.username || next.password || next.port ||
         !(torboxHost(next.hostname)||(next.hostname==='torrentio.strem.fun' && next.pathname.startsWith('/resolve/torbox/'))))
        throw Error('The provider returned an unsupported video server.');
      // Resolve links only; media bytes go directly from the provider to the browser.
      if(torboxHost(next.hostname))return {url:next.href};
      url=next;
    } else break;
  }
  throw Error('The provider could not create a video link. Try another source.');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!["/api/torbox","/api/provider-link"].includes(url.pathname)) {
      const asset = await env.ASSETS.fetch(request);
      const headers = new Headers(asset.headers);
      headers.set("X-Ember-Build", "0.7.6");
      if (headers.get("Content-Type")?.includes("text/html") || url.pathname === "/ember-build.json") {
        headers.set("Cache-Control", "no-store, max-age=0");
        headers.delete("ETag");
        headers.delete("Last-Modified");
      }
      return new Response(asset.body, {status:asset.status, statusText:asset.statusText, headers});
    }
    if (request.method !== "POST") return json({error:"Use POST."},405);
    if (request.headers.get("Origin") !== url.origin) return json({error:"Use the Ember site to open this source."},403);
    const token = request.headers.get("Authorization")?.match(/^Bearer ([\x21-\x7e]{1,512})$/)?.[1];
    if (!token && url.pathname === "/api/torbox") return json({error:"Enter your TorBox API key in Addons."},401);
    const reader = request.body?.getReader();
    let payload = "";
    try {
      if (!reader) return json({error:"Missing source."},400);
      const decoder = new TextDecoder();
      let length = 0;
      for (;;) {
        const {value,done} = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 4096) { void reader.cancel(); return json({error:"Source data is too large."},413); }
        payload += decoder.decode(value,{stream:true});
      }
      const source = JSON.parse(payload + decoder.decode());
      if(url.pathname === '/api/provider-link') {
        if(typeof source?.url!=='string' || source.url.length>3500)return json({error:'Invalid provider link.'},400);
        try {return json(await providerLink(source.url),200);}
        catch {return json({error:'Could not resolve this provider link. Try another source.'},422);}
      }
      if (typeof source?.hash !== "string" || !/^[a-f\d]{40}$/i.test(source.hash) ||
          (source.filename != null && typeof source.filename !== "string") ||
          (source.index != null && !validId(source.index)) || typeof source.movie !== "boolean" || (source.queue != null && typeof source.queue !== "boolean")) {
        return json({error:"Invalid source."},400);
      }
      try { return json(await resolve(token,source),200); }
      catch (error) { return json({error:error instanceof Error ? error.message : "TorBox lookup failed."},422); }
    } catch { return json({error:"Invalid source."},400); }
  },
};
