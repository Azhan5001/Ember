export function normalize(s, addon = "") {
  const text = [s.name, s.title, s.description, s.behaviorHints?.filename]
    .filter(Boolean)
    .join(" ");
  const quality = /2160|\b4k\b/i.test(text)
    ? 2160
    : /1080/.test(text)
      ? 1080
      : /720/.test(text)
        ? 720
        : /480/.test(text)
          ? 480
          : 0;
  const seed = Number(
    text.match(/(?:👤|seed(?:er)?s?[: ]*)\s*(\d+)/i)?.[1] || 0,
  );
  return {
    ...s,
    addon,
    quality,
    seed,
    label: s.description || s.title || s.name || "Unnamed source",
    key: s.url || (s.infoHash ? `${s.infoHash}:${s.fileIdx ?? ""}` : s.externalUrl),
    cached:
      /\bRD\+|\bAD\+|\bTB\+|\bcached\b|⚡/i.test(text) &&
      !/uncached/i.test(text),
  };
}
export function rankSources(streams, quality = 0, failed = new Set()) {
  const seen = new Set();
  return streams
    .filter((s) => {
      if (
        !s.key ||
        seen.has(s.key) ||
        failed.has(s.key) ||
        (quality && s.quality !== quality)
      )
        return false;
      seen.add(s.key);
      return true;
    })
    .sort((a, b) => score(b) - score(a) || (b.seed || 0) - (a.seed || 0));
}
export const torrentioConfigure = "https://torrentio.strem.fun/configure";

function torrentioPath(addon) {
  try {
    const url = new URL(addon.base);
    if (url.origin === "https://torrentio.strem.fun")
      return decodeURIComponent(url.pathname).replace(/\/+$/, "");
  } catch {}
  return null;
}

export function configuredTorBoxKey(addon) {
  return torrentioPath(addon)?.match(/(?:^|[|/])torbox=([^|/]+)/i)?.[1] || "";
}

export function torrentioConfiguration(addon) {
  const path = torrentioPath(addon);
  if (path === null) return null;
  if (configuredTorBoxKey(addon)) return "torbox";
  return !path || path === "/lite" ? "plain" : "custom";
}

export function preferConfiguredTorrentio(addons) {
  if (!addons.some(addon => addon.enabled && torrentioConfiguration(addon) === "torbox")) return addons;
  return addons.filter(addon => torrentioConfiguration(addon) !== "plain");
}

export function sourceTransport(source) {
  if (/^https?:\/\//i.test(source.url || "")) return "http";
  if (/^https?:\/\//i.test(source.externalUrl || "")) return "external";
  if (source.infoHash) return "torrent";
  return "unsupported";
}

export function linuxPlaybackSources(streams, quality, allowFallback, failed, allowTorrent = true) {
  const playable = streams.filter(source => {
    const transport = sourceTransport(source);
    return !failed.has(source.key) && (transport === "http" || (transport === "torrent" && allowTorrent));
  });
  // The presence of provider HTTP streams defines this playback session. A
  // failed provider stream must never silently turn into a local download.
  const providers = streams.some(source => sourceTransport(source) === "http");
  const available = playable.filter(source => {
    if (providers && sourceTransport(source) !== "http") return false;
    const labels = [source.name, source.description, source.title].filter(Boolean).join(" ");
    const pending = !source.cached && /\b(?:TB|TorBox|RD|AD|PM)\s*(?:download(?:ing)?|uncached)\b|\buncached\b/i.test(labels);
    const camera = /\b(?:hdcam|hdts|camrip|telesync)\b/i.test(labels) || /(?:^|[\s.\[(])CAM(?=$|[\s.\])_-])/.test(labels);
    return !pending && !camera;
  });
  const exact = rankSources(available, quality, failed);
  if (!quality || !allowFallback) return exact;
  return [...exact, ...rankSources(available.filter(source => source.quality !== quality), 0, failed)];
}

function score(s) {
  return (
    (s.url ? 100000 : 0) +
    (s.cached ? 50000 : 0) +
    Math.min(s.quality || 0, 2160) * 5 +
    (s.url ? 0 : Math.min(s.seed || 0, 1000))
  );
}
export function nextEpisode(videos, current) {
  const v = videos
    .filter((v) => Number(v.season) > 0 && (!v.released || Date.parse(v.released)<=Date.now()))
    .slice()
    .sort(
      (a, b) =>
        (a.season ?? 0) - (b.season ?? 0) ||
        (a.episode ?? 0) - (b.episode ?? 0),
    );
  const i = v.findIndex((v) => v.id === current);
  return i >= 0 ? v[i + 1] : undefined;
}
export function supports(manifest, resource, type, id = "") {
  return (manifest.resources || []).some((r) =>
    typeof r === "string"
      ? r === resource &&
        (manifest.types || []).includes(type) &&
        (!manifest.idPrefixes?.length ||
          manifest.idPrefixes.some((p) => id.startsWith(p)))
      : r.name === resource &&
        (!r.types || r.types.includes(type)) &&
        (!r.idPrefixes || r.idPrefixes.some((p) => id.startsWith(p))),
  );
}
export function addonBase(url) {
  const u = new URL(url.replace(/^stremio:\/\//, "https://"));
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
    throw Error("Use an HTTP(S) manifest URL.");
  if (!u.pathname.endsWith("/manifest.json"))
    throw Error("The URL must end in /manifest.json.");
  return u.href.slice(0, -14);
}
export function resourceUrl(base, resource, type, id, extra = {}) {
  const args = Object.entries(extra)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(
      ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
    )
    .join("&");
  return `${base}/${resource}/${encodeURIComponent(type)}/${encodeURIComponent(id)}${args ? "/" + args : ""}.json`;
}
export { updateWatch as updateProgress } from "./progress-state.mjs";

// Plain captions are rendered in Ember's own safe text layer. Timing stays in
// media seconds, independent of the control gradient or browser cue styling.
export function subtitleCues(text) {
  const seconds = (s) =>
    s.split(":").reduce((n, x) => n * 60 + Number(x.replace(",", ".")), 0);
  return String(text)
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .flatMap((block) => {
      const m = block.match(
        /((?:\d+:)?\d{2}:\d{2}[,.]\d{3})\s*-->\s*((?:\d+:)?\d{2}:\d{2}[,.]\d{3})[^\n]*\n([\s\S]*)/,
      );
      if (!m) return [];
      const start = seconds(m[1]),
        end = seconds(m[2]);
      const line = m[3]
        .replace(/\{\\[^}]*\}/g, "")
        .replace(/<[^>]*>/g, "")
        .replace(/\\N/g, "\n")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&amp;/g, "&")
        .trim();
      return end > start && line ? [{ start, end, text: line }] : [];
    })
    .sort((a, b) => a.start - b.start);
}
