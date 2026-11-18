export type MediaTrack = {
  id: number;
  type: "audio" | "sub";
  lang?: string;
  title?: string;
  codec?: string;
  default?: boolean;
  bitmap?: boolean;
};

export type MediaInfo = {
  duration: number | null;
  video: string | null;
  hdr: boolean;
  tracks: MediaTrack[];
};

const formats = {
  webm: ['video/webm; codecs="vp8,opus"', 'video/webm; codecs="vp8"'],
  mp4: ['video/mp4; codecs="avc1.4D4034,mp4a.40.2"', 'video/mp4; codecs="avc1.4D4034"'],
} as const;

export function mediaInput(source: any) {
  return { url: source.url, headers: source.providerRelay ? {} : (source.behaviorHints?.proxyHeaders?.request || {}) };
}

export function embeddedFormat(audio: boolean) {
  // Android copies the source video into fragmented MP4. Let the media element
  // read its actual codec configuration (including HEVC) from the init segment.
  if(window.ember?.platform==="android")return {format:"mp4" as const,mime:"video/mp4"};
  const choices = window.ember?.platform === "linux"
    ? (["webm", "mp4"] as const)
    : (["mp4", "webm"] as const);
  for (const format of choices) {
    const mime = formats[format][audio ? 0 : 1];
    const supported = format === "webm"
      ? document.createElement("video").canPlayType(mime)
      : window.MediaSource?.isTypeSupported(mime);
    if (supported) return { format, mime };
  }
  throw Error("This system is missing an in-app video decoder.");
}

export function embeddedStream(video: HTMLVideoElement, url: string, mime: string, duration: number | null) {
  if (mime.startsWith("video/webm") || window.ember?.platform==="android") {
    video.crossOrigin = "anonymous";
    video.src = url;
    return { progressive: true, error: () => undefined, close: () => {} };
  }
  const controller = new AbortController();
  const { signal } = controller;
  const media = new MediaSource();
  const object = URL.createObjectURL(media);
  video.src = object;

  function wait(target: EventTarget, event: string) {
    return new Promise<void>((resolve, reject) => {
      if (signal.aborted) { reject(signal.reason); return; }
      const done = (error?: unknown) => {
        target.removeEventListener(event, success);
        target.removeEventListener("error", fail);
        signal.removeEventListener("abort", abort);
        if (error) reject(error); else resolve();
      };
      const success = () => done();
      const fail = () => done(Error("The browser could not decode the compatibility stream."));
      const abort = () => done(signal.reason);
      target.addEventListener(event, success, { once: true });
      target.addEventListener("error", fail, { once: true });
      signal.addEventListener("abort", abort, { once: true });
    });
  }

  let failure: unknown;
  const run = async () => {
    await wait(media, "sourceopen");
    const buffer = media.addSourceBuffer(mime);
    if (duration !== null) media.duration = duration;
    const response = await fetch(url, { signal });
    if (!response.ok || !response.body) throw Error("The compatibility decoder could not open this source.");
    const reader = response.body.getReader();
    try {
      for (;;) {
        while (buffer.buffered.length && buffer.buffered.end(buffer.buffered.length - 1) > video.currentTime + 40) {
          await new Promise(resolve => setTimeout(resolve, 150));
          signal.throwIfAborted();
        }
        if (buffer.buffered.length && video.currentTime - buffer.buffered.start(0) > 70) {
          buffer.remove(0, video.currentTime - 60);
          await wait(buffer, "updateend");
        }
        const { done, value } = await reader.read();
        if (done) break;
        buffer.appendBuffer(value.slice().buffer);
        await wait(buffer, "updateend");
        if (video.currentTime === 0 && buffer.buffered.length && buffer.buffered.start(0) > 0 && buffer.buffered.start(0) <= 0.5) {
          video.currentTime = buffer.buffered.start(0);
        }
      }
      if (media.readyState === "open") media.endOfStream();
    } finally {
      void reader.cancel().catch(() => {});
    }
  };
  void run().catch(error => {
    if (!signal.aborted) {
      failure = error;
      if (media.readyState === "open") {
        try { media.endOfStream("decode"); } catch {}
      }
    }
    controller.abort();
  });
  return {
    progressive: false,
    error: () => failure,
    close: () => {
      controller.abort();
      URL.revokeObjectURL(object);
    },
  };
}
