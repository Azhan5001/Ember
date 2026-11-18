# Metadata sources

Korean catalog: TVmaze public show index, filtered to scripted shows with Korean language or South Korean origin and a known IMDb identifier. Data is attributed to TVmaze (https://www.tvmaze.com/api) and distributed under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). Ember selects and normalizes the fields; no rating is relabeled as IMDb. Refresh with scripts/refresh-korean-catalog.py. This bundled snapshot supplements installed catalogs and does not download videos.

Anime ID and season/episode-offset mapping: Fribb/anime-lists (https://github.com/Fribb/anime-lists), retrieved 2026-11-13. This compact projection includes IMDb, MAL, Kitsu, AniList and season/episode offsets from that project's published mapping. See the upstream project for mapping corrections and its Anime-Lists and anime-offline-database sources.

Runtime episode metadata and artwork: TVmaze, attributed on each enriched detail page. Intro/outro timestamps: IntroDB, SkipDB and AniSkip. Community coverage is not guaranteed; Ember never fabricates timings when a provider has none.

Korean snapshot completed 2026-11-13: 1,527 unique IMDb-linked series, from TVmaze show-index pages 0–382.
