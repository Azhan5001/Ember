# Ember 0.7.7

Windows and Android try the same streaming remux/audio-conversion path as the website before using full native video conversion. Provider redirects are resolved once by the app relay. Track probing no longer blocks this path; native fallback has a bounded initial probe wait. Embedded subtitles are discovered after playback starts.

Party synchronization waits until muted media startup completes. Interrupted play attempts are not reported as codec failures. Signed-in devices can list and join active parties belonging to the same account, including parties created from another subprofile. Run the supplied Supabase update to enable that list.

Android Back uses Ember's page history. The website allows its own trailer wrapper to be framed and preserves the origin required by YouTube. IMDb Ratings is installed by default, supplies scores/vote counts and links to IMDb; informational rating results are excluded from playable sources. Metadata ratings remain visible if the addon is unavailable.

This release keeps the existing catalog arrangement. AIOMetadata changes are prepared separately after this backup.

Validation: core/database tests, paused-party AAC/DTS playback, simulated app paths with delayed probes, Android page-history navigation, and trailer headers. Real startup speed depends on the source, network and device. Browser-fixture timings are not device benchmarks.
