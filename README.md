# Ember

Ember is a movie and series player for Windows, Linux, Android and the web.

- **Switch sources and resolution while watching.** Ember stages the replacement stream and resumes near your playback position. Series can remember a preferred source.
- **Watch parties** synchronize playback, pauses and seeks. The host chooses the episode.
- **Subprofiles** keep separate watch progress, personal libraries, subtitle preferences and recommendations. Choose a guest profile or use an account to sync across devices.
- **Continue Watching** puts newly released episodes first and completed titles last. Open the series and choose the new episode to dismiss its badge.
- **Player controls** include embedded audio and subtitle tracks, subtitle delay and styling, and direct video downloads. Open player settings or right-click the video for downloads.
- **Title details** include trailer previews, episode availability and rating counts. When provider counts are missing, Ember looks up the IMDb title on the free IMDbAPI service and displays a score and vote count from the same source.

[Download an installer from GitHub Releases](https://github.com/Azhan5001/Ember/releases)

## Earlier release notes

0.7.4 adds device downloads, subtitle height, embedded subtitle extraction corrections, direct native torrents, calmer player notices, episode artwork fallback corrections and trailer embedding fixes. See `docs/RELEASE-0.7.4.md` and `docs/FEATURE-AUDIT-0.7.4.md` for verified results and platform limits. The buffering and Linux 2× fixes from 0.7.3 are retained.

This release improves discovery with TVmaze search and country/language metadata, a built-in Korean catalog, merged addon metadata and typo-tolerant title matching. Results paginate in groups of 60 and sorting applies to searches too.

The redesigned title page includes landscape episode cards, alternate thumbnails, descriptions, dates, progress, green watched badges, available ratings and counts, cast and trailers. TVmaze episode matching uses title and air date when numbering differs. Fribb season mappings let AniSkip support later anime seasons alongside IntroDB/SkipDB. No timings, ratings or trailers are invented if unavailable. Movies continue to use installed metadata addons; AIOMetadata is an optional richer compatible provider (https://github.com/cedya77/aiometadata).

Continue Watching advances completed series to the next released episode. Synced episode directories are reloaded; local storage avoids duplicating full episode metadata. Player audio/subtitle panels are separate. Focus indicators are thin and muted. Pages retain independent scroll positions and Discover supports type-to-search.

Party synchronization retains action updates and 60-second checks with a ±650 ms tolerance. Buffered short seeks avoid needless reconversion. Hold right for 2× playback; hold left for buffered reverse frame stepping and a single seek on release outside the buffer. Hold speed controls are disabled during parties. Unbuffered remote seeking can still require downloading and decoding.

Source-selection and subtitle preferences from 0.7.1 remain supported. No new Supabase migration is required. Both party viewers should update clients.

## Build and install

Run `npm ci`, `npm run build`, and `python3 web/package.py` for the Cloudflare Pages ZIP. Upload its contents, including `_worker.js` and `_headers`, at the site root. `/ember-build.json` should report 0.7.5. Do not upload the source ZIP as the website.

For Linux, install Rust and the Tauri 2 system development dependencies (GTK 3, WebKitGTK 4.1, OpenSSL and librsvg), then run `npm run package:linux`. Linux FFmpeg/ffprobe binaries and licenses are included. Install with `sudo dnf install ./Ember-0.7.5-1.x86_64.rpm`. Existing profiles remain in app data. For Windows, use `npm run package:win` on Windows with the Rust MSVC toolchain and Visual Studio C++ build tools. For Android ARM64, install the Android SDK/NDK and JDK 21, then run `npm run tauri -- android build --target aarch64 --apk`. Sign the release APK with your retained signing key. Build the ARM64 media helpers first with `NDK_HOME=/path/to/ndk bash scripts/build-android-media.sh`.

Metadata attribution is in `public/data/README.md`. Refresh the Korean catalog with `python3 scripts/refresh-korean-catalog.py`. Set `EMBER_METADATA_CACHE` to reuse a specific cache directory; its default is `~/.cache/ember/tvmaze`.

Validation for this update is recorded in `docs/TEST-RESULTS-0.7.4.txt`; only relevant regression, streaming and build checks were run. Compilation does not establish real-device playback, crash or visual correctness; no such testing is claimed.

Windows installs run `scripts/setup-media.ps1` through the npm postinstall hook. It retrieves missing FFmpeg executables from `v1.0-deps` and verifies their release checksums. The binaries are ignored by Git.
