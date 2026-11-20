# Ember 0.7.9

Cinemeta's six original movie/series rows lead Home. They are followed by AIOMetadata's MAL Top Airing, Top New This Week, Top Series and Top Movies, then its remaining catalogs and custom addons. The bundled manifest was refreshed on 2026-11-20. Its weekly feed supplies the provider's ranking; Ember does not approximate it from premiere dates.

AIOMetadata remains the preferred search and title metadata provider. Cinemeta and Anime Seasons provide outage fallbacks. Existing starter configurations receive updated catalog definitions, preserving disabled state and separately configured addon URLs. IMDb Ratings supplies scores and vote counts for Highest rated and Most rated sorting, with bounded requests and a 24-hour cache. Counts are ratings, not written reviews; sorting covers loaded titles and expands through Load more.

For You uses catalog candidates across enabled providers plus richer metadata (genres, tags, language, studios and cast), enriches up to eight recent watched titles and 24 candidates, and keeps recommendations local to the active account/subprofile. Watched aliases are excluded and delayed metadata cannot restore a cleared history or leak another profile's preferences. History-lock explanations remain private.

The release includes 0.7.7 playback, watch-party, Android Back, trailer and privacy fixes plus the native streaming range-header fix. Native compatible sources use the same streaming remux path as the website; full conversion remains a fallback. Hosted source/network timing varies. SQL is provided for the owner to apply, not executed automatically. Existing incorrectly attributed history needs owner review; the migration cannot infer which person watched it.

Validation: unit/SQL tests, production frontend build, browser sorting/filter/cache/profile-switch tests; platform packaging and native runtime results are recorded with the release assets.

Final audio verification: the web resolver follows intermediate TorBox API redirects before returning a CDN URL. Streaming media obtains the complete file size through HEAD when a provider hides Content-Range from browser JavaScript. Both authorized real sources verified decoded AC3-to-AAC audio in the full browser player. Native relay responses already expose byte-range metadata, so they add no HEAD lookup. Unit/SQL suite: 88 passing; release suite: 43 passing. Android 16 first launch/restart passed on the 0.7.9 native build.
