# Ember 0.7.4 feature audit

Code review of the restored 0.7.3 base and 0.7.4 changes. “Present” describes implementation, not proof that every provider/device works.

| Request | Implementation / status |
|---|---|
| Download movies and episodes | Present: source-card action and player action; native streaming HTTP/P2P, cancellation, completed-file list/open; browser Service Worker streaming download. HLS not supported. |
| Embedded subtitles | Fixed native seek-window extraction and timestamp preservation; selectable browser-provided text tracks. Web support depends on its media engine; Android image subtitles need an external text track. |
| Torrents without debrid | Native Linux, Windows and Android use librqbit peers directly; browser still requires direct/debrid links. Native data cache needs free disk space. |
| Subtitle height / lower phone placement | Present, profile setting, lower hidden-control baseline. |
| Source-switch notices | Single latest message with at most two smaller fading predecessors; quality wording only for quality-menu changes. Working source is kept while replacement loads where supported. |
| Episode thumbnail backups | Parent metadata lookup, exact episode matching, TVmaze and mapped Kitsu pictures; stable lookup lifetime. Missing upstream pictures remain placeholders. |
| YouTube trailer | Web referrer policy and YouTube embed updated; app embeds through local HTTP wrapper. Publisher-disabled, regional, age-restricted or removed videos can still require opening YouTube. |
| Separate audio/subtitle panels | Present in Player. |
| Subtitle delay/style persistence | Present: per title/track delay and profile-wide scale/color/outline/background/height. |
| Remember source for next episodes | Present: addon/release-group/quality preferences by series. |
| History after 5% / watched at 90% or outro | Present: actual watched coverage for history, watched state/episode progress. |
| Continue watching / next episode | Present: next unwatched episode selection, next thumbnail card, progress. |
| Search deduplication / genre and sort / K-drama | Present: canonical metadata deduplication, combined filters, TVmaze supplement and Korean catalog snapshot. Completeness depends on providers. |
| Responsive cards, spotlight, panel style, focus | Present in current styles; no new full visual audit of every screen claimed. |
| Playback controls | Present: mobile controls toggle, larger-screen pause/play, icon-only central control, 5-second keyboard/double-tap, 10-second buttons, hold speed/rewind, finite hover time. |
| Party sync | Present: 650 ms dead zone, action-triggered and 60-second checks, readiness reporting; sub-profile identity. |
| Sync to / sync from | Present in account/cloud controls. |
| Remember account/sub-profile; PIN prompt | Present in secure-auth/profile restore flow. |
| Interface/text scaling | Present via UI/font scale variables. |
| Volume boost | Present through Web Audio gain when supported by source/device. |
| Windows / Linux / APK / web / source | All five deliverables are packaged. Required build/package checks pass; release report records actual results and limitations. |

No Windows/Android/Fedora user-device playback test is claimed. Provider-specific issues require the affected source/container details if they persist.
