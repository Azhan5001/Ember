export function prefersNative(source={}) {
 const hint=[source.name,source.title,source.description,source.behaviorHints?.filename,source.url?.split('?')[0]].filter(Boolean).join(' ');
 return /(?:^|[\s._-])(?:hevc|h[.]?265|x265|av1|dovi|dv|dolby[ ._-]?vision|hdr10|10bit)(?:$|[\s._-])/i.test(hint);
}
export function missingVideoFrames(video,elapsed) {
 if(elapsed<3 || video.paused || video.readyState<2)return false;
 const quality=video.getVideoPlaybackQuality?.();
 return video.videoWidth===0 || (!!quality && quality.totalVideoFrames === (quality.droppedVideoFrames ?? 0));
}
