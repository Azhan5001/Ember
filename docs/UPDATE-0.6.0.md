# Ember 0.6.0 — responsive UI, watch history and recommendations

## What is delivered

The Cloudflare Pages ZIP is a compiled browser release. Upload the contents of that ZIP, not the source ZIP. Keep the existing site's origin to retain browser-local data. Source includes the shared Linux, Windows and Web interface. Native RPM/EXE installers have not been built in this environment, which has no Rust/native packaging toolchain. The original Linux 0.5.2-1 installer is unchanged; it does not gain these new UI features until a new native build is installed.

This release does not diagnose or change Fedora Live browser codec compatibility. The browser retains the existing Web playback transport. Native Linux and Windows playback are restored from 0.5.2 and 0.5.1 respectively, with viewing-coverage observation added. No media download or media cache is introduced by history or recommendations.

## Layout

Fluid grids, safe-area padding, mobile navigation with a More menu, wrapping player controls, scrollable dialogs, and portrait/landscape layouts. Small cover displays, Duo-sized panes, fold/tablet widths and desktops share the existing visual style. Spotlight uses the same interface and font scale preferences, initially 120%. Hardware-specific hinge reporting is best-effort using CSS viewport segment variables; actual fold hardware was not available for validation.

## Guest defaults

New guest profiles contain Cinemeta, Animes' season and OpenSubtitles only. The exact unconfigured stock Torrentio URL is removed once from existing guest profiles. Configured provider URLs, disabled states, and account addons are retained. Manually reinstalling a provider after this migration is allowed. Default provisioning no longer adds a streaming addon to any new profile.

## Independent viewing history

- A movie appears after strictly more than 30% of its unique runtime has played.
- A series appears after three distinct episodes reach at least 92% coverage each, matching Ember's episode-completion threshold.
- Played sections are merged. Seeking ahead and replaying the same section do not count as additional coverage.
- History is per profile. It persists locally, travels in profile backups, and uses the existing optional account sync protocol.
- Removing a title from Continue Watching does not alter its history.
- Delete one title or clear all history. The confirmation explains that recommendations are affected and that Continue Watching is removed by default. Check **Keep Continue Watching** to retain resume entries exactly.
- Unchecked deletion hides affected resume entries with a newer timestamp so the desktop checkpoint merge cannot resurrect the row. This preserves resume metadata internally, but removes the Continue Watching catalog entries.
- Clearing history also clears unfinished history qualification records, so preserved Continue Watching cannot silently rebuild deleted history. New playback starts a new history record.
- History begins with playback after this update. Old resume positions cannot prove how much was actually watched and are not fabricated into historical viewing coverage.
- Tracking covers playback in Ember's main player. An external player does not report viewing coverage to the app.

## Recommendations

A local, content-based recommender uses IDF-normalized feature vectors. Features include confirmed genres, catalog categories (such as Anime/K-drama), supplied language/country, director, main cast, release decade, format and synopsis terms. Missing metadata is ignored. Nationality and culture are not guessed from a title or a person's name.

The user's preference vector weights qualified history by completion/engagement and recency (120-day half-life with a 25% long-term floor). Ranking combines the overall taste vector and similarity to individual watched titles, preserving more than one interest. Ratings supply a small quality prior, with more influence during cold start. A maximal marginal relevance pass balances relevance with diversity and removes duplicate/already-watched titles. Cards explain a matching feature and watched title. With no history, the row offers diverse highly rated catalog titles and explicitly says Ember is still learning.

Recommendations draw from the installed catalogs that have loaded on Home (up to 1,200 distinct candidates per ranking). They improve with both viewing data and metadata coverage. They are not a trained collaborative filtering model, and no claim of measured or universally best accuracy is made. No paid recommendation service, additional API key, background media scan, or external AI submission is used. Existing account sync remains optional; this does not make synced history device-only.

Design references:
- Google recommendation pipeline: https://developers.google.com/machine-learning/recommendation/overview/types
- Google content-based filtering: https://developers.google.com/machine-learning/recommendation/content-based/basics
- Diversified ranking research: https://www.ijcai.org/Proceedings/15/Papers/248.pdf

## Building desktop releases

Use the source ZIP and the platform instructions in README.md and the Tauri platform configurations. Build on Linux for RPM and Windows for NSIS. Both compile the same `src/` frontend as Web. Media tools are fetched separately using the supplied scripts and are not embedded in the source archive.

Typical frontend validation is `npm ci`, `npm test`, then `npm run build`.

Use `npm run tauri -- build --config src-tauri/tauri.linux.conf.json --bundles rpm` on a provisioned Linux build host, or `npm run tauri -- build --config src-tauri/tauri.windows.conf.json --bundles nsis` on a provisioned Windows host. These native builds have not been executed for this release.

## Account menu and history PIN

The top-right account button opens View profile, Settings and View history. View profile includes the profile manager and history privacy controls. History privacy is also available in Settings.

Choose no PIN, a separate four-digit history PIN, or the active profile PIN. A separate history PIN also works for guests. Changing or removing an existing lock requires its current PIN. Switching from a separate PIN to the profile PIN requires both. PINs use a random salt and PBKDF2-SHA256 with 600,000 iterations, never stored as plaintext. A dynamically loaded @noble/hashes fallback maintains identical hashes in contexts without Web Crypto's SubtleCrypto. Five failed entries impose a one-minute cooldown retained across reopening the view in the tab.

Leaving History, switching profiles, changing the PIN or losing foreground focus locks the view again. A profile PIN cannot be removed while that profile's history still depends on it. Recommendation explanations suppress watched-title names while a history lock is configured. This is an application screen lock, not encryption of exported backups or protection against someone with access to browser developer tools/local profile data. Continue Watching remains independently visible.

## Restored desktop baselines

The release archive now contains separate native source trees. Linux retains the recovered 0.5.2 native Rust source and its original playback frontend; Windows retains 0.5.1. The shared UI adds the features described above. Native Player.tsx changes only observe viewing coverage; the original source selection, native decoding, audio-track behavior and media IPC signatures remain intact. The later 0.5.3–0.5.5 desktop playback changes are not carried into these native trees.

The browser tree retains the working Web transport from the existing browser source. The original 0.5.0 source from the user's attachment, recovered 0.5.1 archive and recovered 0.5.2 archive are preserved with the release. The supplied RPM header was independently read as ember 0.5.2, release 1, x86_64. Source comparisons and file hashes are recorded in RESTORATION-MANIFEST.json. This identifies the recovered source lineage; it does not claim a bit-for-bit rebuild of the supplied RPM.
