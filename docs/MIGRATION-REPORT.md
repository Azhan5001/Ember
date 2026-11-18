# Ember 0.3.0 migration and verification

The Windows release migrates the desktop backend from Electron/Node.js to Rust + Tauri 2. The React/TypeScript interface remains, with revised account access forms and Discover filtering/sorting. The installer includes the original codec-capable mpv binary and does not require a separate Node.js or Rust installation.

## Measured footprint

| Measurement | Ember 0.2.7 | Ember 0.3.0 | Reduction |
|---|---:|---:|---:|
| Installer, decimal MB | 124.62 | 37.93 | 69.6% |
| Program payload, decimal MB | 426.28 | 130.27 | 69.4% |
| Idle browsing working set, MiB | 511.8 | 381.0 | 25.6% |
| Direct playback working set, MiB | 584.8 | 504.6 | 13.7% |

The program comparison excludes generated uninstallers, installer temporary assets, user profiles/caches, downloaded torrent media and the separately shared WebView2 runtime. The new payload consists of a 7.91 MB app, 121.11 MB mpv player and 1.25 MB consolidated notices. Retaining mpv preserves codec coverage; removing it would make the package much smaller but lose existing playback capability.

RAM figures are medians of seven one-second samples after a ten-second warmup, using the same 36-title local catalog and local WebM video. Each app ran separately. The measurement sums process working sets, including browser processes; shared pages can be counted repeatedly. Idle memory includes the new inactivity policy. Earlier runs varied (including 418 → 341 MiB idle and 582 → 498 MiB playback), so these are observed workload results, not fixed savings on every device or provider. The original first Tauri build did not reduce idle RAM; the low-memory policy and reduced background worker count were added after measuring it.

## What changed to reduce resources

- Removed the bundled Electron browser and Node runtime; use shared Evergreen WebView2.
- Rust handles durable SQLite/DPAPI storage, HTTP, native playback control and torrent streaming. Release uses size optimization, LTO, one codegen unit and stripped symbols.
- Two asynchronous runtime workers and a bounded blocking pool. No torrent session runs until requested; unused sessions stop.
- Retain only the current torrent and one handoff candidate. Remove retired media and clean interrupted cache files on startup. The current file can still grow to full media size.
- Bounded metadata/artwork lookup caches and four concurrent metadata requests. SQLite cache is 512 KiB with a 1 MiB journal target.
- mpv forward/backward buffers are 32 MiB / 8 MiB with a 15-second cache target. Existing short HLS buffering remains.
- After eight seconds without interaction, if no web video is playing, request WebView2's low-memory target. Restore normal caching on interaction/direct playback. Scripts and native events continue; this is not page suspension. Windows may page memory under this policy.
- Local fonts eliminate remote font loading. Identical third-party notices are consolidated instead of installing hundreds of small files. A 32 MiB browser disk-cache preference is best effort and depends on WebView2.

## Feature preservation and evidence

| Feature | Result and verification |
|---|---|
| Same app design/navigation/player controls | Existing React interface retained; actual packaged UI checked visually and through automated interaction. |
| Login/register/recovery | Separate forms, labels, validation and inline errors; sign-out storage compatibility fixed; seven account-flow checks pass using mocked Auth and local SQL. |
| Discover sort and genres | Aligned controls, selected chips, clear actions, AND matching; ranked titles first with unranked titles retained; custom anime resources/pagination preserved. |
| Resolution handoff | Direct/native source preparation retains the current stream until replacement is ready. Paused timestamp, zero volume, subtitles and failed/cancelled replacement paths checked. |
| Torrent source ranking | Resolution matching and cached-source preference retained; seed ordering now distinguishes torrents even above 1,000 seeds. |
| Torrent playback/seeking | Real librqbit local seeder/tracker/client transfer verifies byte ranges, access token checks, invalid ranges and release cleanup. |
| Smart intro/recap/outro | IntroDB/SkipDB/AniSkip and verified timing rules retained. Automatic intro/recap skip and optional early-outro advance pass fixture tests. No new audio-analysis system is claimed. |
| Next episode | Mandatory EOF advance and optional earlier outro advance are separate; both pass. |
| Image fallbacks | Alternate URLs and alternate installed metadata providers pass actual image-load tests; duplicate metadata lookups are suppressed. |
| Subtitles and language controls | Ordinary captions, subtitle selection and native subtitle loading pass; audio/language preferences and subtitle-off handling retained. |
| Progress/resume/rewatches | Durable checkpoint writes, close/restart resume, stale-write protection, tombstones, account ownership and backwards rewatches covered. |
| Existing profile migration | Direct Windows DPAPI and Chromium v10/AES-GCM profile decryption both tested; original database remains intact and a backup is created. |
| Cloud synchronization | Local mutation queue survives restart; account isolation, conflict decisions, request replay, pagination and SQL ownership policies pass. |
| Addons/catalogs | All 40 fixture catalog rows remain reachable while nearby rows load lazily; anime resource types, search, configuration-required handling and artwork providers retained. |
| Library, backups, Trakt, deep links, open stream | Existing frontend behavior retained and corresponding Rust/installer bridges provided; no live Trakt authorization or real provider credential flow was performed. |
| Retired workers | Previously removed speech synchronization and timeline-image preview features stay absent. |

## Validation

82 checks passed: 28 JavaScript/SQL, eight Rust, 17 playback/UI, 12 discovery/artwork, seven account, six native-player and four installer-location checks. Native/UI tests ran against the executable extracted from the final installer, using its bundled mpv. Executable/player hashes match the compiled/staged files. The source download script independently retrieved and verified the pinned mpv archive and executable.

The restricted command environment could not run some local-pipe/network tests or the 32-bit installer compiler. The same tests and generated installer script succeeded under normal Windows execution. The final Rust local-torrent check passed there as well. Tests use isolated profiles/local fixtures; live service configuration was not altered.

Installer compatibility recognizes an existing Tauri location or a validated 0.2.x Electron installation. Tests reject unrelated versions and ambiguous uninstaller commands. The generated installer was compiled and extracted; it was not installed over the user's real app as part of testing.

## Install, cloud and future platforms

Close Ember before running setup. Existing profile data migrates on first launch under the same Windows user; sign into the cloud again. Keep an exported backup when moving machines. The build is unsigned. If WebView2 is absent, setup needs an internet connection to install it.

Cloud login/registration UI is implemented, but real registration and recovery still require the existing Supabase project to have the supplied SQL and SMTP/email templates configured. The public project configuration is retained; no service-role key is embedded. See the source README and `docs/SUPABASE-SETUP.md`.

This delivery supports Windows x64. Linux, Android, macOS and iOS are future targets. Shared UI and Rust services are organized for reuse; secure storage and playback/lifecycle adapters still need implementation and device testing. In particular, the non-Windows encrypted-store stub intentionally refuses to save secrets in plaintext.

## Research and implementation references

- [Tauri size optimization](https://v2.tauri.app/concept/size/) — system webviews and release optimization informed the smaller deployment.
- [Tauri Windows installer guidance](https://v2.tauri.app/distribute/windows-installer/) — NSIS, shared WebView2 and installer-template configuration.
- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) — platform build dependencies.
- [librqbit source](https://github.com/ikatson/rqbit) — native torrent sessions and streaming; dependency pinned to 8.1.1.
- [mpv manual](https://mpv.io/manual/master/) — JSON IPC, playback properties and buffer controls.
- [Microsoft WebView2 performance guidance](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/performance) — system runtime reuse, hardware acceleration and supported resource management.
- [WebView2 memory target API](https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2.memoryusagetargetlevel) — lower-memory operation without suspending scripts.
- [Official Tauri installer template](https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.12.4/crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi) — base for the narrowly scoped legacy-install-location fallback.
