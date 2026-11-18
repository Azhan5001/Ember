# Ember 0.4.0 release and verification

Ember 0.4.0 is a Windows x64 Rust + Tauri 2 installer with the original React interface, bundled mpv playback and local SQLite storage. It adds account-scoped profiles and the requested experimental home layout. The source archive contains build instructions and all application source.

## What is included

- First-launch Guest and account sign-in/register choices. Guest data remains device-only. An account supports up to 12 profiles with separate settings, progress and libraries, 24 bundled avatar choices, optional four-digit PINs, and shared or isolated addons. Cloud sync can be turned off per account on a device.
- Catalog and search deduplication, TorrentioTB catalog exclusion, popularity-first search, improved Discover genre and sorting controls, and poster fallback sources.
- Direct-stream audio selection hands the same source and position to the native player to expose embedded tracks. Japanese and English track selection was verified with a local fixture. Codec hints and a no-video-frame check hand unsupported direct playback to mpv; quality changes, Smart Skip, and next-episode behavior remain tested.
- The experimental home has a compact sidebar that expands over the page, a full-screen spotlight using title logo art, and a larger description. Settings can switch the layout back.

## Database action

Existing Ember 0.3 Supabase projects need `ember-multi-profile-migration.sql` applied once in the Supabase SQL Editor. It is idempotent. New projects use `ember-supabase-setup.sql`. The local SQLite schema requires no manual migration. Upgrade all devices that edit the same cloud account before continuing to sync it.

## Verification

The final installed Windows build passed 41 JavaScript checks, 8 Rust checks (the local swarm test was run with normal local network access), 51 installed-app feature checks, and 4 installer compatibility checks: **104 passing checks**. Installed-app checks cover profiles across two devices, audio tracks, native player handoff, cloud conflicts and password recovery, seamless quality changes, Smart Skip, next episode, discovery, metadata fallbacks, and legacy upgrade locations. The installer was extracted and its x64 executable and bundled mpv hash were verified.

| Footprint | Supplied Ember 0.2.7 | Ember 0.4.0 | Reduction |
|---|---:|---:|---:|
| Installer | 124.62 MB | 37.94 MB | 69.56% |
| Program payload | 426.28 MB | 130.39 MB | 69.41% |
| Idle working set, successful candidate run | 409.8 MiB | 342.3 MiB | 16.46% |
| Playback working set, successful candidate run | 532.4 MiB | 470.0 MiB | 11.72% |

Memory used the same 36-title local catalog and WebM video, with seven one-second samples after a ten-second warmup. These are observed medians from the last complete 0.4.0 candidate run. A repeat on the final binary recorded idle values, then its test browser closed during playback. Automatic desktop approval rejected a new test helper, so a complete final-binary memory comparison is unavailable. Process working sets can double-count shared pages and vary with system load.

The exact Hope (2026) and Cyberpunk source files were unavailable, so their encodes were not reproduced. The fallback and audio behavior were tested using controlled media and mocked providers. Supabase authentication and synchronization were tested with a local SQL engine and mocked HTTP; live project configuration was not changed.

Windows x64 is the supported build. Linux needs a secure-storage adapter and platform acceptance testing. Android needs Keystore, a mobile player adapter, lifecycle/download handling and touch-layout work. macOS/iOS need their platform storage and player adapters.

## Research used

- [Tauri 2 WebView versions](https://v2.tauri.app/reference/webview-versions/) and [Microsoft Edge video playback guidance](https://learn.microsoft.com/en-us/troubleshoot/microsoft-edge/development/video-playback-issues) informed the native codec fallback.
- [mpv track selection](https://mpv.io/manual/stable/#track-selection) informed embedded audio selection.
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security) informed account-owned sync records.
