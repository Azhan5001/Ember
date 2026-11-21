# Ember 0.7.10

Home restores Cinemeta's original Popular, New and Featured movie/series rows, then Anime Seasons and custom catalogs. AIOMetadata uses the new metadata-only configuration. Catalog rows retain their own titles instead of removing overlaps whenever another row loads. Search uses one supported search feed per provider/type and reads other feeds from cache without downloading them or replacing Home feeds with empty results.

AIOMetadata enriches title details while Cinemeta can display the episode list immediately. Playing a selected episode does not wait for additional metadata or logos. Released anime episodes are selectable without a preliminary source check. Scraper-compatible episode IDs and AIOMetadata's upcoming-episode artwork are retained.

Movie/series genres lead the searchable, scrollable tag filter. Show adult content is off by default; enabling it also exposes adult tags. Filtering uses the classifications supplied by providers. Recommendations remain on Home and use the active profile's history and available catalog metadata without a large background enrichment burst. IMDb Ratings continues to supply scores and vote counts for sorting loaded results.

Public catalog and metadata responses have a persistent cache capped at 100 entries and 12 MiB, with a seven-day maximum retention and oldest-entry eviction. Catalogs refresh after 30 minutes, search after 10 minutes, series metadata after six hours and movie metadata after 24 hours. Fresh cached views open immediately; stale responses refresh in the background. Private stream links and account history are not persisted in this cache.

Streaming playback retains approximately 15 seconds behind and 20 seconds ahead. A full browser buffer reclaims played data and retries the same fragment. Transient range requests retry; a failed compatibility stream triggers bounded recovery instead of leaving a silent stalled pump. The prior audio, TorBox redirect and range-header fixes remain included.

Watch parties use the host's timeline: a buffering guest no longer stops the host; the guest catches up when ready. Host buffering still holds the room. Runtime mismatches ask the guest to select a matching release. This behavior requires the supplied party SQL update. Leaving the player returns Home, including Android hardware/browser Back after episode changes. Other pages retain ordinary Back navigation.

Intro/outro lookup recognizes AIOMetadata IMDb aliases and displays verified timings as each provider responds, without waiting for slower providers. Prior privacy/profile isolation, Android startup, trailer framing, account-wide party discovery and Download-only context menu fixes remain included.

Apply `supabase/ember-watch-party-0710.sql` and `supabase/ember-catalog-0710.sql` after updating clients. The catalog migration covers shared account and isolated subprofile addon scopes, preserves custom/disabled addons, and does not edit history. The combined release SQL also includes the earlier privacy migration; it has not been executed against the owner's database.

Validation: 86 unit/database tests, 43 release checks, and production frontend build passed. Browser checks verified stable overlapping rows, non-poisoning search cache misses, early metadata, playable anime/upcoming artwork, independent skip providers, default filtering and Home navigation. Continuous browser remux decoded audio beyond 85 seconds and recovered from an injected buffer-full error. Full-player web, Android-bridge fixture and party paths decoded audio beyond 65 seconds; a buffering guest caught up after five seconds. Real Severance and Georgie & Mandy sources started in approximately 6.2 and 5.0 seconds respectively, with decoded audio. These are small-sample and controlled tests, not a guarantee for every remote provider or a physical Poco X7 Pro result.

Browser checks: install Edge and FFmpeg, then run `node tests/stable-browser-0710.mjs` and `node tests/stable-app-0710.mjs` separately. `FFMPEG` may point to the FFmpeg executable. The extended fixture is generated locally from the committed short fixture.
