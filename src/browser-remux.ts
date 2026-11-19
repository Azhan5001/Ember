import {Input, ALL_FORMATS, UrlSource, Output, Mp4OutputFormat, StreamTarget,
  EncodedPacketSink, EncodedVideoPacketSource, EncodedAudioPacketSource, AudioSampleSink, AudioSampleSource} from 'mediabunny';
import type {MediaTrack} from './embedded-media';
import {audioLanguage} from './audio-track-core.mjs';

// Bounded packet copy into MP4 fragments, without a movie-sized buffer or disk cache.
export async function browserRemux(video: HTMLVideoElement, url: string, target: number,
  audioIndex: number | undefined, signal: AbortSignal, preferredLanguage = '') {
  const input = new Input({formats: ALL_FORMATS, source: new UrlSource(url, {
    maxCacheSize: 8 * 1024 * 1024, parallelism: 2,
    requestInit: {cache:'no-store', credentials:'omit', referrerPolicy:'no-referrer'},
    getRetryDelay: () => null,
    fetchFn: async (resource, init) => {
      const response = await fetch(resource, {...init, signal});
      if (new Headers(init?.headers).has('Range') && response.status !== 206) {
        void response.body?.cancel();
        throw Error('This provider does not allow byte-range streaming for browser compatibility playback.');
      }
      return response;
    },
  })});
  let output: Output | undefined, object = '', failure: unknown;
  const close = () => {
    input.dispose();
    void output?.cancel().catch(() => {});
    if (object) URL.revokeObjectURL(object);
  };
  signal.addEventListener('abort',close,{once:true});
  try {
    signal.throwIfAborted();
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw Error('This source has no readable video track.');
    const audioTracks = await input.getAudioTracks();
    let selectedIndex=audioIndex ?? 0;
    if(audioIndex===undefined && audioLanguage(preferredLanguage)) {
      const preferred=audioTracks.findIndex(entry=>audioLanguage(entry.languageCode)===audioLanguage(preferredLanguage));
      if(preferred>=0)selectedIndex=preferred;
    }
    if(audioIndex===undefined && audioTracks.length && !(await audioTracks[selectedIndex].getCodec())){
      for(let index=1;index<audioTracks.length;index++){
        if(await audioTracks[index].getCodec()){selectedIndex=index;break;}
      }
    }
    const audio=audioTracks[selectedIndex];
    const videoCodec = await track.getCodec(), audioCodec = await audio?.getCodec();
    const videoConfig = await track.getDecoderConfig(), audioConfig = await audio?.getDecoderConfig();
    if (!videoCodec || !videoConfig || (audio && (!audioCodec || !audioConfig)))
      throw Error('This stream uses codecs that browser compatibility playback cannot copy.');
    const videoParameter = await track.getCodecParameterString();
    const Source = window.MediaSource || (window as any).ManagedMediaSource;
    if (!Source?.isTypeSupported('video/mp4; codecs="' + videoParameter + '"'))
      throw Error('The device cannot decode this video codec. Choose an H.264 source or provider-transcoded HLS.');
    const audioParameter = await audio?.getCodecParameterString();
    const directMime = 'video/mp4; codecs="' + [videoParameter,audioParameter].filter(Boolean).join(',') + '"';
    const transcodeAudio = !!audio && !Source.isTypeSupported(directMime);
    if (transcodeAudio) {
      if (audioCodec === 'ac3' || audioCodec === 'eac3') {
        const {registerAc3Decoder} = await import('@mediabunny/ac3');
        registerAc3Decoder();
      } else if (audioCodec === 'dts') {
        const {registerDtsDecoder} = await import('@mediabunny/dts');
        registerDtsDecoder();
      }
      const {registerAacEncoder} = await import('@mediabunny/aac-encoder');
      registerAacEncoder();
      if (!await audio.canDecode()) throw Error('The device cannot decode this audio track. Try another audio track or source.');
    }
    const mime = transcodeAudio
      ? 'video/mp4; codecs="' + videoParameter + ',mp4a.40.2"'
      : directMime;
    if (!Source.isTypeSupported(mime)) throw Error('This device cannot play the remuxed MP4 stream.');
    const videoSink = new EncodedPacketSink(track);
    const firstVideo = await videoSink.getKeyPacket(target) || await videoSink.getFirstKeyPacket();
    if (!firstVideo) throw Error('No playable video keyframe was found.');
    const start = Math.max(0,firstVideo.timestamp), duration = await input.getDurationFromMetadata();
    const tracks: MediaTrack[] = await Promise.all(audioTracks.map(async (entry,id) => ({
      id, type:'audio' as const, lang:entry.languageCode || 'und', codec:await entry.getCodec() || undefined,
    })));
    const media: MediaSource = new Source();
    if (!window.MediaSource) video.disableRemotePlayback = true;
    object = URL.createObjectURL(media);
    const opened = new Promise<void>((resolve,reject) => {
      media.addEventListener('sourceopen',()=>resolve(),{once:true});
      signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
    });
    void opened.catch(() => {});
    video.removeAttribute('crossorigin');
    video.src = object;
    const videoOut = new EncodedVideoPacketSource(videoCodec);
    const audioOut = audioCodec && !transcodeAudio ? new EncodedAudioPacketSource(audioCodec) : null;
    const audioEncoder = transcodeAudio ? new AudioSampleSource({codec:'aac',bitrate:160000}) : null;
    let buffer: SourceBuffer | undefined, written = 0;
    const update = (action: () => void) => new Promise<void>((resolve,reject) => {
      const cleanup = () => {
        buffer!.removeEventListener('updateend',done);
        buffer!.removeEventListener('error',fail);
        signal.removeEventListener('abort',abort);
      };
      const done = () => {cleanup(); resolve();};
      const fail = () => {cleanup(); reject(Error('The browser rejected a media fragment.'));};
      const abort = () => {cleanup(); reject(signal.reason);};
      buffer!.addEventListener('updateend',done,{once:true});
      buffer!.addEventListener('error',fail,{once:true});
      signal.addEventListener('abort',abort,{once:true});
      try { action(); } catch (error) { cleanup(); reject(error); }
    });
    const writer = new WritableStream({async write(chunk:{data:Uint8Array<ArrayBuffer>;position:number}) {
      signal.throwIfAborted();
      await opened;
      if (chunk.position !== written) throw Error('The streaming muxer attempted an out-of-order write.');
      buffer ??= media.addSourceBuffer(mime);
      if (duration !== null && duration > start) media.duration = duration - start;
      if (video.currentTime > 70 && buffer.buffered.length && buffer.buffered.start(0) < video.currentTime - 60) {
        await update(() => buffer!.remove(0,video.currentTime - 60));
      }
      await update(() => buffer!.appendBuffer(chunk.data));
      written += chunk.data.byteLength;
    }});
    output = new Output({format:new Mp4OutputFormat({fastStart:'fragmented',minimumFragmentDuration:1}),
      target:new StreamTarget(writer)});
    output.addVideoTrack(videoOut);
    if (audioOut) output.addAudioTrack(audioOut);
    if (audioEncoder) output.addAudioTrack(audioEncoder);
    const audioSink = audio && !transcodeAudio ? new EncodedPacketSink(audio) : null;
    const samples = audio && transcodeAudio ? new AudioSampleSink(audio).samples(start) : null;
    const firstAudio = audioSink ? await audioSink.getPacket(start) || await audioSink.getFirstPacket() : null;
    const run = async () => {
      await output!.start();
      let v: typeof firstVideo | null = firstVideo, a = firstAudio;
      let sample = (await samples?.next())?.value;
      while (v || a || sample) {
        signal.throwIfAborted();
        const ahead = Math.min(v?.timestamp ?? Infinity,a?.timestamp ?? Infinity,sample?.timestamp ?? Infinity) - start;
        if (ahead > Math.max(target - start,video.currentTime) + 40) {
          await new Promise(resolve=>setTimeout(resolve,100));
          continue;
        }
        if (v && v.timestamp <= Math.min(a?.timestamp ?? Infinity,sample?.timestamp ?? Infinity)) {
          await videoOut.add(v.clone({timestamp:v.timestamp - start}),{decoderConfig:videoConfig});
          v = await videoSink.getNextPacket(v);
        } else if (a && audioOut && audioSink && audioConfig) {
          await audioOut.add(a.clone({timestamp:a.timestamp - start}),{decoderConfig:audioConfig});
          a = await audioSink.getNextPacket(a);
        } else if (sample && audioEncoder) {
          try {
            sample.setTimestamp(sample.timestamp - start);
            await audioEncoder.add(sample);
          } finally { sample.close(); }
          sample = (await samples!.next()).value;
        }
      }
      audioEncoder?.close();
      await output!.finalize();
      if (media.readyState === 'open') media.endOfStream();
    };
    void run().catch(error=>{if (!signal.aborted) failure = error;});
    return {start,duration,tracks,transcodeAudio,audio:audio ? selectedIndex : undefined,
      stream:{progressive:false,error:()=>failure,close:()=>{signal.removeEventListener('abort',close);close();}}};
  } catch (error) {
    signal.removeEventListener('abort',close);
    close();
    throw error;
  }
}
