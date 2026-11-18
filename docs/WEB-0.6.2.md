# Ember Web 0.6.2

Deploy the contents of Ember-Web-0.6.2-Cloudflare-Pages.zip as a new production deployment in the existing Cloudflare Pages project. Confirm the Home footer says EMBER / 0.6.2. The deployed /ember-build.json returns version 0.6.2. This identifies the bytes served by the site without depending on a reused download filename. The HTML and build metadata are sent with no-store through both the Pages worker and static header rules. Content-hashed JS/CSS remains separate.

The previous locally built panel CSS computed correctly in the test browser. The reported live website was not accessible because its URL was not supplied. Its specific failure to update is therefore unconfirmed. This release strengthens the browser-only panel rules at every viewport width, including desktop-site mode, with a 12% opaque surface, no backdrop blur, transparent/static headings, and 18px title text. It retains touch rail-arrow removal and persistent Continue Watching remove buttons.

Safari playback uses native HLS whenever the media element supports it. Otherwise HLS.js remains available. Muted playback starts before waiting for decoded data so Safari's preload policy cannot deadlock source preparation. A denied unmute becomes an actionable paused player.

When direct file playback fails, browser compatibility playback copies encoded video/audio packets into fragmented MP4 through MSE or ManagedMediaSource. The fallback supports byte-range fetches and CORS-enabled sources. Unsupported AC-3/E-AC-3 and DTS audio can be decoded with the on-demand Mediabunny extensions and encoded to AAC. Video is copied, preserving its original codec/quality. Audio selection and seeks restart at an appropriate keyframe when the desired position is outside the buffer. Original media timestamps remain represented in Ember's timeline.

Input byte cache is 8 MiB. Media reads follow a 20-second lookahead, with older MSE data removed behind playback. No movie file is written to storage. Decoder modules are loaded on demand. This is streaming playback, with normal network buffering. Providers without byte ranges or CORS are rejected by the fallback instead of buffering an entire movie.

The browser still needs hardware/software support for the VIDEO codec. H.264 is broadly suitable, while HEVC, AV1, HDR and Dolby Vision depend on device and format. DRM, TrueHD audio, malformed files, unsupported video profiles, provider CORS/range restrictions and older browsers can still prevent playback. No measured claim that most catalog sources work is made. TorBox documents raw playback for non-Pro users and broader transcoding for Pro. This release does not enable TorBox's paid transcoding API or require it.

## Verification

The production build and 60 existing/regression unit tests passed, including HTML/build-cache headers and the existing TorBox authentication/origin guards. Generated H.264/AAC MKV played through the new remuxer in Chromium. Seeking to 35 seconds restarted at the preceding keyframe, selecting a second Japanese audio track worked, and a generated H.264/DTS MKV played with audio converted to AAC. Ember's normal player also opened its compatibility path and exposed both audio tracks. Browser panels computed as rgba(12,9,18,0.12), with transparent headers.

A real Safari/iPhone/iPad/macOS runtime was unavailable. These are tested implementation improvements based on Apple's and the library's current documentation, not a claim of completed Safari-device acceptance. Test the same TorBox release on the actual Safari device after deploying.

## Research and implementation references

- Apple delivery guidance, autoplay/unmute policies and native HLS
  https://developer.apple.com/documentation/webkit/delivering-video-content-for-safari
- Apple's HLS authoring specification, codecs and HEVC/fMP4 requirements
  https://developer.apple.com/streaming/hls-authoring-specification-for-apple-devices.html
- WebKit's ManagedMediaSource requirements for iPhone
  https://webkit.org/blog/14735/webkit-features-in-safari-17-1/
- HLS.js native HLS fallback documentation
  https://github.com/video-dev/hls.js
- Mediabunny lazy input and fragmented output
  https://mediabunny.dev/guide/reading-media-files
  https://mediabunny.dev/guide/output-formats
- AC-3 and DTS extensions
  https://mediabunny.dev/guide/extensions/ac3
  https://github.com/Vanilagy/mediabunny/tree/main/packages/dts
- TorBox's raw versus transcoded streaming
  https://support.torbox.app/en/articles/12662996-torbox-web-streaming
- Cloudflare custom header behavior
  https://developers.cloudflare.com/workers/static-assets/headers/
