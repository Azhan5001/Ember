export function prefersNative(source={}) {
 const hint=[source.name,source.title,source.description,source.behaviorHints?.filename,source.url?.split('?')[0]].filter(Boolean).join(' ');
 return /(?:^|[\s._-])(?:hevc|h[.]?265|x265|av1|dovi|dv|dolby[ ._-]?vision|hdr10|10bit)(?:$|[\s._-])/i.test(hint);
}
export function missingVideoFrames(video,elapsed) {
 if(elapsed<3 || video.paused || video.readyState<2)return false;
 const quality=video.getVideoPlaybackQuality?.();
 return video.videoWidth===0 || (!!quality && quality.totalVideoFrames === (quality.droppedVideoFrames ?? 0));
}

// Video can decode successfully while the platform silently drops its audio stream.
export function needsAudioConversion(codec, canPlay) {
 const mime = {dts:'audio/mp4; codecs="dtsc"',truehd:'audio/mp4; codecs="mlpa"',ac3:'audio/mp4; codecs="ac-3"',eac3:'audio/mp4; codecs="ec-3"'}[codec];
 return !!mime && !canPlay(mime);
}
export function hintedAudio(source) {
 const label=[source?.name,source?.title,source?.description,source?.behaviorHints?.filename].join(' ');
 if (/\btrue[ ._-]?hd\b/i.test(label)) return 'truehd';
 if (/\bdts\b/i.test(label)) return 'dts';
 if (/\b(?:e[ ._-]?ac[ ._-]?3|ddp|dd\+)/i.test(label)) return 'eac3';
 if (/\bac[ ._-]?3\b/i.test(label)) return 'ac3';
 return '';
}
