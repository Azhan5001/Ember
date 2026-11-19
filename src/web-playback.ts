import {secureAuth} from "./secure-auth";

const keyName = "ember-web-torbox-key";

let desktopKey = "";
export async function loadDesktopTorBoxKey() {
  desktopKey = await secureAuth.getItem(keyName) || "";
}
export function playbackTorBoxKey() {
  if (window.ember) return desktopKey;
  try { return localStorage.getItem(keyName) || sessionStorage.getItem(keyName) || ""; }
  catch { return ""; }
}
export async function savePlaybackTorBoxKey(value: string) {
  const key = value.trim();
  if (key && !/^[\x21-\x7e]{1,512}$/.test(key)) throw Error("Enter a valid TorBox API key.");
  if (window.ember) {
    if (key) await secureAuth.setItem(keyName, key);
    else await secureAuth.removeItem(keyName);
    desktopKey = key;
  } else {
    if (key) localStorage.setItem(keyName, key);
    else localStorage.removeItem(keyName);
    sessionStorage.removeItem(keyName);
  }
}
export async function webTorBoxStream(token: string, source: {
  hash: string; index?: number; filename?: string; movie: boolean; queue?: boolean;
}) {
  const response = await fetch("/api/torbox", {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(26000),
    headers: {"Content-Type":"application/json", Authorization:"Bearer " + token},
    body: JSON.stringify(source),
  }).catch(() => { throw Error("Could not reach the site's TorBox lookup. Try again."); });
  const result = await response.json().catch(() => null);
  if (result?.queued) return {queued:true as const};
  if (!response.ok || !result?.url)
    throw Error(result?.error || "The TorBox lookup is unavailable. Upload the complete Ember Cloudflare Pages package.");
  return {url: result.url};
}

export function browserStreamAllowed(url: string) {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "https:" || (protocol === "http:" && location.protocol === "http:");
  } catch { return false; }
}

export async function browserProviderLink(raw: string) {
  let parsed: URL;try {parsed=new URL(raw);}catch{return raw;}
  if(parsed.hostname!=='torrentio.strem.fun' || !parsed.pathname.startsWith('/resolve/torbox/'))return raw;
  const response=await fetch('/api/provider-link',{method:'POST',cache:'no-store',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({url:raw}),signal:AbortSignal.timeout(30000)});
  const result=await response.json().catch(()=>null);
  if(!response.ok || typeof result?.url!=='string')throw Error('Could not open the provider link. Update the website with the complete Ember web package, or try another source.');
  return result.url;
}
