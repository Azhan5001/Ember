# Ember 0.7.8 — experimental metadata

Includes the stable 0.7.7 fixes. A separate 0.7.7 source archive and installers are retained for rollback.

AIOMetadata is the default catalog provider for new guests and accounts and is added once to existing profiles. Existing configured addons and disabled states are preserved. Cinemeta and Anime Seasons are hidden while AIOMetadata is enabled and serve as catalog/metadata fallbacks. Disabling AIOMetadata restores their visible catalog rows.

Home starts with TMDB popular movies/series, airing and trending rows, followed by MAL airing/top/seasonal anime and remaining feeds. Catalog titles omit the AIOMetadata addon prefix. Search uses dedicated movie, series and anime search catalogs. Rich genre/theme tags can be searched in a scrollable expanded picker; the collapsed picker shows four rows. Separate year, language and anime-studio browsing options avoid treating those values as genres. Choose one of those three facets at a time, optionally combined with tags and title search.

Public AIOMetadata JSON is cached on each device in IndexedDB: six hours for catalogs and series metadata, 24 hours for movie metadata, one hour for search. Older entries up to seven days can display immediately while refreshing in the background. Explicit refresh bypasses the cache. The cache is capped at 160 responses and does not store account data, history or source URLs. No additional proxy/domain setup is required; shared Cloudflare edge caching has not been deployed.

The supplied provider returns TMDB movie metadata, TVDB series metadata and Kitsu anime metadata on the anime resource route. Upstream IMDb/Kitsu episode IDs are retained for stream-addon compatibility. The configuration password is not included in the app or repository.

Validation includes catalog ordering/search/facet tests, fallback behavior, browser cache persistence, mobile genre controls and the existing playback/privacy/party regression suite. As a preview, provider-side catalog and mapping changes may still affect results. The same Supabase update as 0.7.7 applies.
