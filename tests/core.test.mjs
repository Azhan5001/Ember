import test from "node:test";
import assert from "node:assert/strict";
import {
  normalize,
  rankSources,
  nextEpisode,
  supports,
  addonBase,
  resourceUrl,
  updateProgress,
} from "../src/core.mjs";
test("cached HTTP outranks high seed torrent", () => {
  const a = normalize({ name: "4k 👤 500", infoHash: "a" }),
    b = normalize({ name: "1080p RD+", url: "https://x" });
  assert.equal(rankSources([a, b])[0].key, b.key);
});
test("quality filter and failover exclude attempted sources", () => {
  const a = normalize({ name: "1080p", url: "https://a" }),
    b = normalize({ name: "1080p", url: "https://b" }),
    c = normalize({ name: "720p", url: "https://c" });
  assert.deepEqual(rankSources([a, a, b, c], 1080, new Set([a.key])), [b]);
});
test("episode order crosses seasons and excludes specials", () => {
  const e = [
    { id: "c", season: 2, episode: 1 },
    { id: "s", season: 0, episode: 1 },
    { id: "b", season: 1, episode: 2 },
    { id: "a", season: 1, episode: 1 },
  ];
  assert.equal(nextEpisode(e, "b").id, "c");
  assert.equal(nextEpisode(e, "c"), undefined);
});
test("manifest filters custom prefixes and resources", () => {
  assert.equal(
    supports(
      {
        resources: [
          { name: "stream", types: ["series"], idPrefixes: ["anime:"] },
        ],
      },
      "stream",
      "series",
      "anime:4",
    ),
    true,
  );
  assert.equal(
    supports(
      { resources: ["stream"], types: ["movie"], idPrefixes: ["tt"] },
      "stream",
      "movie",
      "other",
    ),
    false,
  );
});
test("manifest URL parsing preserves configured path", () => {
  assert.equal(
    addonBase("stremio://example.com/token/manifest.json"),
    "https://example.com/token",
  );
  assert.throws(() => addonBase("file:///manifest.json"));
  assert.throws(() => addonBase("https://example.com/configure"));
});
test("resource identifiers and search args encoded", () =>
  assert.equal(
    resourceUrl("https://x", "stream", "series", "tt1:2:3", {
      search: "a/b & c",
    }),
    "https://x/stream/series/tt1%3A2%3A3/search=a%2Fb%20%26%20c.json",
  ));
test("rewatches permit earlier positions but stale writes rejected", () => {
  const old = { position: 900, updatedAt: 5, watched: true };
  assert.equal(
    updateProgress(old, { position: 10, duration: 1000, updatedAt: 6 })
      .position,
    10,
  );
  assert.equal(updateProgress(old, { position: 1000, updatedAt: 4 }), old);
});
test("completion preserves explicit watched setting", () =>
  assert.equal(
    updateProgress(null, {
      position: 50,
      duration: 100,
      updatedAt: 1,
      watched: true,
    }).watched,
    true,
  ));


test('selected resolution picks the best seeded torrent even above 1000 seeds',()=>{const low=normalize({name:'1080p 👤 1500',infoHash:'low'}),high=normalize({name:'1080p 👤 5000',infoHash:'high'}),wrong=normalize({name:'720p 👤 9000',infoHash:'wrong'});assert.deepEqual(rankSources([low,wrong,high],1080),[high,low]);});

test("Linux auto playback keeps cached provider sources ahead of quality fallbacks", async () => {
  const { linuxPlaybackSources, normalize } = await import("../src/core.mjs");
  const stream = (name, key) => normalize({name, url:"https://example.test/" + key}, "Torrentio");
  const exact = stream("[TB+] 1080p", "exact");
  const lower = stream("[TB+] 720p", "lower");
  const queued = stream("[TB download] 2160p", "queued");
  const camera = stream("[TB+] 1080p HDCAM", "cam");
  const raw = normalize({name:"1080p", infoHash:"a".repeat(40)}, "Torrentio");
  const all = [queued, raw, lower, camera, exact];
  assert.deepEqual(linuxPlaybackSources(all, 1080, true, new Set()).map(s => s.key), [exact.key, lower.key]);
  assert.deepEqual(linuxPlaybackSources(all, 1080, false, new Set([exact.key])), []);
  assert.deepEqual(linuxPlaybackSources([queued,raw,camera], 0, true, new Set()), []);
  assert.deepEqual(linuxPlaybackSources([raw], 1080, true, new Set()), [raw]);
});

test("Fedora Live selects HTTP sources while identifying torrents and browser-only sources", async () => {
  const { linuxPlaybackSources, normalize, sourceTransport } = await import("../src/core.mjs");
  const raw = normalize({infoHash:"a".repeat(40),name:"1080p"});
  const external = normalize({externalUrl:"https://example.test/watch"});
  const cached = normalize({url:"https://example.test/movie",name:"[TB+] 720p",infoHash:"b".repeat(40)});
  assert.deepEqual(linuxPlaybackSources([raw, external], 0, true, new Set(), false), []);
  assert.deepEqual(linuxPlaybackSources([raw, cached], 1080, true, new Set(), false), [cached]);
  assert.equal(sourceTransport(external), "external");
  assert.equal(sourceTransport(cached), "http");
  assert.equal(sourceTransport(raw), "torrent");
});

test("enabled TorBox Torrentio takes precedence over the stock Torrentio instance", async () => {
  const { preferConfiguredTorrentio, torrentioConfiguration } = await import("../src/core.mjs");
  const stock = {base:"https://torrentio.strem.fun",enabled:true};
  const configured = {base:"https://torrentio.strem.fun/lite/providers=yts%7Ctorbox=fixture",enabled:true};
  const other = {base:"https://example.test/torbox=fixture",enabled:true};
  assert.equal(torrentioConfiguration(configured), "torbox");
  assert.deepEqual(preferConfiguredTorrentio([stock, configured, other]), [configured, other]);
  assert.deepEqual(preferConfiguredTorrentio([stock, {...configured,enabled:false}, other]).map(a=>a.base), [stock.base, configured.base, other.base]);
});
