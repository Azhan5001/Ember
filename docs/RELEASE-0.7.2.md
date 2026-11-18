# Ember 0.7.2

Release validation: 41 focused checks pass; TypeScript/Vite production build and Linux RPM compilation pass. The bundled Korean catalog contains 1,527 unique IMDb-linked series from the complete TVmaze index snapshot. Real-device playback, crash and visual testing are not claimed.

- Merges compatible addon metadata rather than stopping at the first provider. Adds keyless TVmaze search/country/language/episode enrichment, normalized genre aliases and bounded extra catalog pages for selective filters.
- Korean discovery uses an attributed bundled TVmaze catalog; rebuild with scripts/refresh-korean-catalog.py. Missing IMDb identities are excluded to keep streaming compatible with installed providers.
- Episode thumbnails/descriptions/ratings match on date and title when season numbering differs; existing playable episode IDs are preserved.
- Bundled Fribb mappings resolve later anime seasons to the correct MAL entry before AniSkip. IntroDB and SkipDB remain available. Missing timings stay unavailable.
- Details redesigned with landscape episode cards, release date, progress, green watched labels, trailer playback, IMDb rating/count when supplied, cast, runtime and review link. No invented counts or ratings.
- Independent audio/subtitle panels, thin muted keyboard focus, per-page scroll restoration, type-to-search in Discover.
- Finished episodes advance Continue Watching to the next released episode; synced metadata is rehydrated. Local storage retains the episode directory once per series, reducing duplication.
- Party drift tolerance ±650 ms; action sync and 60-second periodic checks retained.
- Buffered seeking bypasses unnecessary reconversion, rapid seeks coalesce, remux/HLS buffer windows expanded. Native conversion reads ahead modestly. Remote unbuffered seeks still depend on server speed and codec.
- Hold right for actual 2× playback; hold left for 2× reverse frame stepping inside buffer, one seek on release outside it. Hold speed controls are disabled during a watch party to avoid diverging from shared playback.

Source and provider selection persistence from 0.7.1 remains in place. No new database migration. Windows not built as requested.
