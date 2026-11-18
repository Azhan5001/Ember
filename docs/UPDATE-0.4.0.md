# Ember 0.4.0 update

Ember 0.4.0 extends the Rust + Tauri 2 Windows release. The local SQLite schema stays the same. Existing data is retained; the account and guest spaces are separated in the saved application state.

## Accounts and profiles

- First launch shows a local Guest and an entry to sign in or register.
- An account has up to 12 profiles. Each profile has its own settings, watch progress, library, and display name.
- Installed addons are shared within an account by default. A profile can keep a separate addon list.
- Each profile can use an optional four-digit PIN. PIN verifiers use a random salt and PBKDF2-SHA-256; the PIN itself is never saved. The UI pauses after repeated incorrect attempts. A four-digit PIN is a privacy gate, not a substitute for the account password or device protection.
- Twenty-four small bundled SVG avatar images are available offline.
- Signing out switches to Guest. Guest changes stay on the device and are never uploaded. Previously signed-in account spaces remain cached separately.
- The account has a device-local sync switch. Turning it off stops account record uploads and downloads while keeping changes in local storage. Reenabling it queues the changed records.

## Discovery and playback

- TorrentioTB catalog feeds and their results are hidden. Its stream resources remain available.
- Catalog cards and Discover results are deduplicated by normalized title, year, and media type. Cinemeta metadata is preferred when available.
- Search results start in popularity order. Titles without useful popularity or rating data follow ranked titles in their existing order.
- Streams tagged HEVC, Dolby Vision, HDR10, 10-bit or AV1 start in the bundled native player. If the embedded player advances without displaying video frames, Ember hands the same stream and position to native playback.
- Changing audio on a direct stream opens the native player, which exposes embedded tracks. HLS and native playback select a matching track; if the current source lacks that language, Ember tries a source labeled with the requested language or explains that no matching track is present.
- The experimental home has a compact sidebar that expands over content on hover, a full-height spotlight with title logo artwork and larger description text, and a scroll-linked transition. Settings → Experimental layout restores the previous layout.

## Database action

For an existing Ember 0.3 Supabase project, run [ember-multi-profile-migration.sql](../supabase/ember-multi-profile-migration.sql) once in the Supabase SQL Editor. It is safe to rerun. For a new project, run [ember-supabase-setup.sql](../supabase/ember-supabase-setup.sql). Both retain the same account-owned tables and RPC while allowing profile-scoped record IDs. The local SQLite database needs no manual SQL change.

Existing 0.3 cloud records are imported into the account's main profile when it first loads. A device with the old 0.3 client should be upgraded before continuing to edit the same cloud account.

## Verification limits

The decoder fallback and audio handoff were tested with controlled local media and mocked providers. The specific Hope (2026) and Cyberpunk source files were unavailable in this workspace, so their exact encodes could not be reproduced. Supabase authentication tests use a local SQL engine and mocked HTTP; apply the SQL to your project for live sync.

## Technical references

- [Microsoft Edge video playback troubleshooting](https://learn.microsoft.com/en-us/troubleshoot/microsoft-edge/development/video-playback-issues) documents conditional HEVC decode support and hardware-dependent AV1 decode. Tauri 2 uses Edge WebView2 on Windows.
- [mpv track selection manual](https://mpv.io/manual/stable/#track-selection) documents the runtime `aid` selection and language preference used by the native player.
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security) explains the ownership check used by the account-scoped sync RPC.
