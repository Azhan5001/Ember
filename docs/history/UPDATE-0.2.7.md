# Ember 0.2.7

- Cards retry supplied alternate artwork, exact-ID Metahub artwork, and artwork from enabled metadata addons. Shared failure/lookup caches avoid repeated lookup storms; missing art has a visible flame placeholder.
- Home lists all browsable addon catalogs, including custom types such as `anime`. Only nearby rows load, with four concurrent metadata requests and a five-minute cache. Search-only and account-context-only catalogs are excluded from Home until their required context exists.
- Animes' Season is a new default catalog. Its live manifest and current series/movie catalogs were checked during this build. The original catalog resource type and origin are preserved for metadata requests; stream/subtitle providers may declare custom types independently.
- Discover offers Anime, K-drama, common genres and provider genre options. Multiple selections require every genre. Unknown genres are checked in bounded metadata batches. Search also matches titles locally for catalogs that have no search endpoint. Results cover loaded provider pages, with Load more / Check more titles controls; they do not represent an exhaustive query of every title in every provider's database.
- Default, Popularity, Trending, Top airing, Highest rated, Most rated and Newest sorts use matching provider feeds or actual metadata. Most rated uses vote count, distinct from rating score. Missing ranking information is not fabricated; provider rankings are not globally comparable. Empty sorts may require another addon.
- Discover places filters directly above results. The combined audio/subtitle drawer is narrowed from 680 to 460 CSS pixels.
- App/launcher, installer and uninstaller use the existing Ember flame. Dark native window-control overlay and branded setup pages add little artwork overhead. The installer is unsigned; SmartScreen reputation warnings cannot be guaranteed absent.
- Subtitle synchronization and timeline hover previews remain removed. Ordinary subtitles, Smart Skip, quality handoffs, local progress, source retry limits and automatic next episode remain.
- Account/cloud synchronization is implemented in this release; see the setup section below. Linux and Android builds are not delivered in this Windows release; provider planning/filtering/artwork logic remains platform neutral and Electron-only code stays in its desktop bridge.

## Account sync added in 0.2.7

Public project configuration is built into this installer. New database SQL, per-user accounts, local queue, changed-record uploads, incremental reconciliation, durable deletions, conflict review, account-specific caches and code-based email confirmation/recovery are implemented. Follow SUPABASE-SETUP.md; the earlier paragraph saying no cloud sync was implemented describes the 0.2.6 baseline only. Live setup is not completed automatically by installing the app.
