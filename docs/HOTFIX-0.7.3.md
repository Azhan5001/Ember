# 0.7.3 hotfix

Buffering status now follows actual time advancement and debounced waiting, not buffered-range length. Stale fallback timers clear on resumed playback.
Linux progressive compatibility playback uses FFmpeg setpts/atempo at 2×, with source-time mapping for resume, subtitles and seeking. Read pacing scales with playback rate. Stable container pointer capture preserves holds across decoder swaps. Releasing restores 1×. Speed holds remain disabled during parties.

Four focused logic checks and TypeScript build pass. The bundled decoder has been rebuilt with atempo and verified with a real 4-second audio/video clip producing approximately 2 seconds at 2×. The Linux release and RPM package compile successfully. Web production packaging also passes. Native speed changes restart the progressive decoder at the current source timestamp, so a short reload may be visible on slower connections. No playback test on the user’s Fedora device is claimed.
