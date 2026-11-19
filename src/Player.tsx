import { useEpisodeAvailability } from './use-episode-availability';
import {Download} from "lucide-react";
import DownloadsPanel from './DownloadsPanel';
import {startDownload} from './downloads';
import PlayerNotices from './PlayerNotices';
import {playbackHealth,mediaPosition,localPosition} from './playback-health.mjs';
const emberLogo=new URL('../assets/ember.svg',import.meta.url).href;
import {sourcePreference,preferSources} from './source-preference.mjs';
import {finiteTime,timelinePoint,partyReady,subtitlePreferenceKey} from './playback-math.mjs';
import WatchPartyPanel from './WatchPartyPanel';
import {partyPosition,driftCorrection,mediaKey,partyMedia} from './party-core.mjs';
import {useAnimatedPanel} from "./use-animated-panel";
import {playbackRange,mergeRanges} from "./history-core.mjs";
import {findAudioTrack,labeledAudioSource,audioLanguage} from "./audio-track-core.mjs";
import {embeddedFormat, embeddedStream, mediaInput, type MediaInfo, type MediaTrack} from "./embedded-media";
import {prefersNative, missingVideoFrames, missingAudioFrames, needsContainerRemux, hintedAudio, needsAudioConversion} from "./video-frame-core.mjs";
import { watchIndicator } from "./progress-state.mjs";
import PlaybackSettings from "./PlaybackSettings";
import { automaticSegment, normalizeSegments } from "./skip-core.mjs";
import React, { useEffect, useRef, useState, useMemo } from "react";
import Hls from "hls.js";
import {
  ArrowLeft,
  MoreVertical,
  RotateCcw,
  RotateCw,
  Play,
  Pause,
  X,
  ChevronRight,
  Subtitles,
  Languages,
  SlidersHorizontal,
  ListVideo,
  Settings,
  SkipForward,
  Volume2,
  VolumeX,
  Users,
  ChevronDown,
  Maximize,
  Upload,
  CheckCircle,
} from "lucide-react";
import Artwork from "./Artwork";
import { artwork, request, subtitles } from "./api";
import { playbackTorBoxKey, webTorBoxStream, browserProviderLink } from "./web-playback";
import { rankSources, linuxPlaybackSources, sourceTransport, configuredTorBoxKey, nextEpisode, subtitleCues } from "./core.mjs";
import { segmentDetails, releaseKey, lang, original } from "./smart-skip";
const fmt=(value:number)=>{const n=finiteTime(value);return `${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`};
const languageName = (s: string) => {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(s) || s;
  } catch {
    return s || "Unknown";
  }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type BrowserAudioTrack = {label:string; language:string; enabled:boolean};
function browserAudioTracks(video: HTMLVideoElement | null) {
  return Array.from((video as (HTMLVideoElement & {audioTracks?: ArrayLike<BrowserAudioTrack>}) | null)?.audioTracks || []);
}

export default function Player({
  session: s,
  state,
  onClose,
  onOpenAddons,
  onProgress,
  onNext,
  onNotice,
  onSetting,
  onEpisode,
  onPrefetch,
  party,
}: any) {
  const container = useRef<HTMLDivElement>(null),
    videos = useRef<(HTMLVideoElement | null)[]>([null, null]);
  const hls = useRef<(Hls | null)[]>([null, null]),
    active = useRef(0),
    generation = useRef(0),
    subGeneration = useRef(0),
    mounted = useRef(true);
  const [slot, setSlot] = useState(0),
    [selected, setSelected] = useState<any>(null),
    sourceRef = useRef<any>(null);
  const [sourceLoaded,setSourceLoaded]=useState(false);
  const [contextMenu,setContextMenu]=useState<{x:number;y:number}|null>(null);
  useEffect(()=>{
    if(!contextMenu)return;
    const close=(event:PointerEvent)=>{if(!(event.target as Element)?.closest('.player-context-menu'))setContextMenu(null)};
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape')setContextMenu(null)};
    document.addEventListener('pointerdown',close);document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key)};
  },[contextMenu]);
  const stalledAt=useRef(0),lastPartyCheck=useRef(0),lastPartyRoom=useRef<any>(null),lastPartySeek=useRef(0),pendingPartySync=useRef(false);
  const tapTimer=useRef<any>(null),lastTap=useRef({at:0,side:false}),lastTouch=useRef(0);
  function surfaceTap(x:number){
    if(drawer){setDrawer('');return}const now=Date.now(),rect=container.current?.getBoundingClientRect();const side=x>(rect?rect.left+rect.width/2:innerWidth/2);
    if(now-lastTap.current.at<280&&side===lastTap.current.side){clearTimeout(tapTimer.current);lastTap.current.at=0;holdConsumed.current=true;seek(time.current.position+(side?5:-5));wake();return}
    lastTap.current={at:now,side};clearTimeout(tapTimer.current);tapTimer.current=setTimeout(()=>{if(matchMedia('(max-width:900px)').matches){setControlsVisible(v=>!v);activity.current=Date.now();setVolumeOpen(false)}else if(sourceRef.current)toggle()},280);
  }
  const hold=useRef<any>(null),holdTimer=useRef<any>(null),holdTick=useRef<any>(null),holdOrigin=useRef({x:0,y:0}),holdConsumed=useRef(false);
  const [holdDirection,setHoldDirection]=useState(0);
  const surfacePointer=useRef<number|null>(null),playbackSample=useRef<any>(null);
  const nativeSpeed=useRef(1),speedChanging=useRef(false);
  async function changeNativeSpeed(rate:number){
    nativeSpeed.current=rate;
    if(speedChanging.current)return;
    speedChanging.current=true;
    try{
      while(mounted.current && sourceRef.current){
        const current=compatibility.current[active.current];
        if(!current || (current.rate||1)===nativeSpeed.current)break;
        const desired=nativeSpeed.current,position=absoluteTime(active.current).position;
        const ok=await chooseRef.current(sourceRef.current,true,false,{position,rate:desired,audio:current.audio,bitmap:current.bitmap,height:current.height});
        if(ok===false){nativeSpeed.current=1;onNotice('Could not change playback speed. Try the source again.');break;}
      }
    } finally{speedChanging.current=false;}
  }
  function finishSurface(e:React.PointerEvent<HTMLDivElement>,cancel=false){
    if(surfacePointer.current!==e.pointerId)return;
    surfacePointer.current=null;
    const held=endHold(cancel);
    if(!held&&!holdConsumed.current&&!cancel)surfaceTap(e.clientX);
    lastTouch.current=Date.now();
  }
  function beginHold(e:React.PointerEvent<HTMLVideoElement>){
    if(e.button!==0)return;
    surfacePointer.current=e.pointerId;holdConsumed.current=false;
    container.current?.setPointerCapture(e.pointerId);
    if(drawer||!sourceLoaded)return;
    const rect=e.currentTarget.getBoundingClientRect(),fraction=(e.clientX-rect.left)/rect.width;
    if(fraction>.4&&fraction<.6)return;
    holdOrigin.current={x:e.clientX,y:e.clientY};container.current?.setPointerCapture(e.pointerId);
    clearTimeout(holdTimer.current);
    holdTimer.current=setTimeout(()=>{
      clearTimeout(tapTimer.current);lastTap.current.at=0;holdConsumed.current=true;
      if(latest.current.party?.snapshot){onNotice('Speed controls are available outside watch parties.');lastTouch.current=Date.now();return;}
      const v=videos.current[active.current];if(!v||opening.current)return;
      const direction=fraction<.4?-1:1;
      hold.current={direction,video:v,paused:v.paused,rate:v.playbackRate,target:time.current.position,native:linux&&!!compatibility.current[active.current]?.stream.progressive};
      setHoldDirection(direction);lastSample.current=null;
      if(direction===1){if(hold.current.native){pauseRef.current=false;void changeNativeSpeed(2)}else{v.playbackRate=2;void v.play().catch(()=>endHold(true));}}
      else {v.pause();holdTick.current=setInterval(()=>{
        const h=hold.current;if(!h)return;h.target=Math.max(0,h.target-.5);
        const stream=compatibility.current[active.current],local=localPosition(h.target,stream?.start,stream?.rate||1);
        if([...Array(v.buffered.length).keys()].some(i=>local>=v.buffered.start(i)&&local<=v.buffered.end(i)))v.currentTime=local;
        setPosition(h.target);setSeekPreview(h.target);
      },250)}
    },450);
  }
  function endHold(cancel=false){
    clearTimeout(holdTimer.current);clearInterval(holdTick.current);
    const h=hold.current;hold.current=null;setHoldDirection(0);
    if(!h)return false;
    lastTouch.current=Date.now();setSeekPreview(null);
    if(h.native&&h.direction===1){pauseRef.current=h.paused;void changeNativeSpeed(1);lastSample.current=null;return true;}
    h.video.playbackRate=h.rate;
    if(h.direction===-1&&!cancel)seek(h.target);
    if(h.paused)h.video.pause();else if(!cancel)void h.video.play().catch(()=>{});
    lastSample.current=null;return true;
  }
  const [seekPreview,setSeekPreview]=useState<number|null>(null);
  const dragging=useRef(false),dragValue=useRef(0);
  const [volumeOpen,setVolumeOpen]=useState(false);
  const lastVolume=useRef(100),partyPlayBlocked=useRef(false),partyNoticeAt=useRef(0);
  const [operation,setOperation]=useState<'source'|'quality'|'seek'|'audio'|'speed'>('source');
  const [quality, setQuality] = useState(state.settings.seriesSources?.[s.item.id]?.quality ?? state.settings.quality);
  const compatibility = useRef<(null | {
    start: number; duration: number | null; rate?: number; audio?: number; bitmap?: number; height?: number;
    stream: ReturnType<typeof embeddedStream>;
  })[]>([null, null]);
  const probes = useRef(new Map<string, Promise<MediaInfo | null>>());
  const seekTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const audioContext = useRef<AudioContext | null>(null);
  const audioGains = useRef<(GainNode | null)[]>([null, null]);
  const [status, setStatus] = useState("Finding your best source…"),
    [switching, setSwitching] = useState(false),
    [error, setError] = useState("");
  const [paused, setPaused] = useState(false),
    pauseRef = useRef(false),
    [position, setPosition] = useState(0),
    [duration, setDuration] = useState(0);
  const coverage = useRef<number[][]>([]);
  const lastSample = useRef<any>(null);
  const completed = useRef(
    !!state.progress[s.item.type + ":" + s.vid]?.watched,
  );
  const time = useRef({
    position: state.progress[s.item.type + ":" + s.vid]?.watched
      ? 0
      : state.progress[s.item.type + ":" + s.vid]?.position || 0,
    duration: 0,
  });
  const [drawer, setDrawer, drawerClosing] = useAnimatedPanel((s.showSources || s.video?.showSources) ? "sources" : "");
  useEffect(()=>{if(drawer)endHold(true)},[drawer]);
  useEffect(() => {
    if (!drawer) return;
    const panel = container.current?.querySelector<HTMLElement>(".playerdrawer");
    const previousFocus = document.activeElement as HTMLElement | null;
    panel?.querySelector<HTMLButtonElement>('[aria-label="Close drawer"]')?.focus();
    const containFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !panel) return;
      const controls = Array.from(panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]'
      )).filter(element => element.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (!first) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    panel?.addEventListener("keydown", containFocus);
    return () => {
      panel?.removeEventListener("keydown", containFocus);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [drawer]);

  const
    [audio, setAudio] = useState(
      state.settings.seriesAudio?.[s.item.id] || original(s.item),
    );
  const [activeAudioTrack, setActiveAudioTrack] = useState<number | undefined>(undefined);
  const [tracks, setTracks] = useState<any[]>([]),
    [subs, setSubs] = useState<any[]>([]),
    [subLanguage, setSubLanguage] = useState(
      state.settings.subtitleLanguage === "off"
        ? "en"
        : lang(state.settings.subtitleLanguage || "en"),
    );
  const [browserSubs,setBrowserSubs]=useState<any[]>([]);
  const [browserCaption,setBrowserCaption]=useState('');
  const [subText, setSubText] = useState(""),
    [subSelection, setSubSelection] = useState<any>(null),
    subRef = useRef<any>(null);
  const opening = useRef(false),
    recoveryAttempts = useRef(0),
    recoveryFailed = useRef(false);
  const [volume, setVolume] = useState(100),
    volumeRef = useRef(100),
    [buffering, setBuffering] = useState(true),
    healthy = useRef(false);
  const [skipSegments, setSkipSegments] = useState<any[]>([]);
  const prefetched = useRef(false),
    lastSave = useRef(0),
    stall = useRef<any>(null),
    failed = useRef(new Set()),
    nextStarted = useRef(false),
    frameWatch = useRef({key:"",position:0});
  const latest = useRef<any>({});
  latest.current = { state, audio, selected, subSelection, party };

  const [controlsVisible, setControlsVisible] = useState(true),
    activity = useRef(Date.now()),
    keyboardFocus = useRef(false);
  const [selectedSeason, setSelectedSeason] = useState(
    Number(s.video?.season) ||
      (s.item.videos || []).find((v: any) => v.season > 0)?.season ||
      1,
  );
  const [skipStatus, setSkipStatus] = useState("Loading segment timings…");
  const episodeList = useRef<HTMLDivElement>(null);
  const seasons = [
    ...new Set(
      (s.item.videos || [])
        .filter((v: any) => v.season > 0)
        .map((v: any) => Number(v.season)),
    ),
  ].sort((a: any, b: any) => a - b) as number[];
  const wake = () => {
    activity.current = Date.now();
    setControlsVisible(true);
  };
  useEffect(() => {
    wake();
    const timer = setInterval(() => {
      if (
        !drawer &&
        !paused &&
        !status &&
        !error &&
        !switching &&
        !keyboardFocus.current &&
        Date.now() - activity.current > 2800
      )
        setControlsVisible(false);
    }, 250);
    return () => clearInterval(timer);
  }, [drawer, paused, status, error, switching]);
  useEffect(() => {
    if (drawer === "episodes") setSelectedSeason(Number(s.video?.season) || 1);
  }, [drawer, s.vid]);
  useEffect(() => {
    if (drawer !== "episodes") return;
    const frame = requestAnimationFrame(() => {
      const target = episodeList.current?.querySelector<HTMLElement>(
        '[aria-current="true"]',
      );
      target?.focus({ preventScroll: true });
      if (target && episodeList.current) {
        const episodes = episodeList.current;
        const list = getComputedStyle(episodes).overflowY === "visible"
          ? episodes.closest<HTMLElement>(".playerdrawer") || episodes
          : episodes;
        const row = target.closest(".episoderow") as HTMLElement;
        const box = row.getBoundingClientRect(),
          bounds = list.getBoundingClientRect();
        list.scrollTop +=
          box.top - bounds.top - (list.clientHeight - box.height) / 2;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [drawer, selectedSeason]);
  const next = nextEpisode(s.item.videos || [], s.vid),
    all = rankSources(s.candidates),
    qualityOptions = [
      ...new Set(s.candidates.map((x: any) => x.quality).filter(Boolean)),
    ] as number[];
  function store(done?: boolean) {
    if (done) completed.current = true;
    if (time.current.position > 0 && Number.isFinite(time.current.duration)) {
      onProgress(
        s,
        time.current.position,
        time.current.duration,
        completed.current || undefined,
        coverage.current,
      );
      window.ember?.checkpoint({
        profileScope:s.profileScope,
        item: s.item,
        video: s.video,
        vid: s.vid,
        position: time.current.position,
        duration: time.current.duration,
        watched: completed.current || undefined,
        hidden: false,
        updatedAt: Date.now(),
      });
    }
  }
  useEffect(() => {
    const fn = () => store();
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, []);
  function episodeRecord(v: any) {
    return v.id === s.vid
      ? {
          ...state.progress[s.item.type + ":" + v.id],
          position,
          duration,
          watched: completed.current,
        }
      : state.progress[s.item.type + ":" + v.id];
  }
  function health(ok: boolean) {
    healthy.current = ok;
    if(ok){stalledAt.current=0;clearTimeout(stall.current);stall.current=undefined;}
    setBuffering(!ok);
  }
  const browser = !window.ember;
  const linux = window.ember?.platform === "linux";
  const android = window.ember?.platform === "android";
  const providerOnly = browser;
  const hasHttpSources = all.some((source: any) => sourceTransport(source) === "http");
  const hasRawTorrents = all.some((source: any) => sourceTransport(source) === "torrent");
  const configuredKey = true ? state.addons.filter((addon: any) => addon.enabled).map(configuredTorBoxKey).find(Boolean) : undefined;
  const torboxKey = playbackTorBoxKey() || configuredKey;
  const canRecoverTorBox = !!torboxKey && (browser || !!window.ember?.torboxStream);
  const sourceHelp = providerOnly && hasRawTorrents && !hasHttpSources
    ? canRecoverTorBox ? "Choose a source to stream it through TorBox."
      : "Choose a source. Connect TorBox in Addons to stream torrent results from the cloud."
    : "";
  const [cloudCandidate, setCloudCandidate] = useState<any>(null);
  const compatibilitySource = selected || (providerOnly ? all.find((source: any) => sourceTransport(source) === "http") : all[0]);
  function candidates(quality: number, excluded = failed.current, allowFallback = latest.current.state.settings.qualityFallback) {
    const rows=providerOnly?linuxPlaybackSources(s.candidates,quality,allowFallback||!!latest.current.state.settings.seriesSources?.[s.item.id],excluded,false):rankSources(s.candidates,quality,excluded);
    return preferSources(rows,latest.current.state.settings.seriesSources?.[s.item.id]);
  }
  function hlsSource(source: any) {
    return source.playlist || /\.m3u8(?:[?#]|$)/i.test(source.url);
  }
  const remuxControllers = useRef<(AbortController | null)[]>([null,null]);
  const remuxTracks = useRef<(MediaTrack[] | null)[]>([null,null]);
  function clearSlot(i: number) {
    remuxControllers.current[i]?.abort();
    remuxControllers.current[i] = null;
    remuxTracks.current[i] = null;
    compatibility.current[i]?.stream.close();
    compatibility.current[i] = null;
    hls.current[i]?.destroy();
    hls.current[i] = null;
    const v = videos.current[i];
    if (v) {
      v.pause();
      v.removeAttribute("src");
      v.load();
    }
  }
  function applyVolume(index: number) {
    const video = videos.current[index];
    if (!video) return;
    const level = volumeRef.current / 100;
    if (level > 1 && audioContext.current && !audioGains.current[index]) {
      const context = audioContext.current;
      const gain = context.createGain();
      context.createMediaElementSource(video).connect(gain).connect(context.destination);
      audioGains.current[index] = gain;
    }
    video.volume = Math.min(1, level);
    const gain = audioGains.current[index];
    if (gain) gain.gain.value = Math.max(1, level);
  }
  async function changeVolume(value:number){
    const n=Math.abs(value-100)<=3?100:Math.max(0,Math.min(200,value));
    if(n>0)lastVolume.current=n;volumeRef.current=n;setVolume(n);
    try{if(n>100){audioContext.current??=new AudioContext();await audioContext.current.resume();const v=videos.current[active.current];if(v&&sourceRef.current&&!v.crossOrigin&&!v.currentSrc.startsWith('blob:')){const ok=await chooseRef.current(sourceRef.current,!!window.ember,false,{});if(!ok)throw Error('Boost unavailable')}}applyVolume(active.current);}
    catch{volumeRef.current=100;setVolume(100);applyVolume(active.current);onNotice('Audio boost is unavailable for this source. Volume is set to 100%.');}
  }
  function readyAudio(i: number) {
    const h = hls.current[i];
    if (!h) return;
    const list = h.audioTracks.map((t: any, n: number) => ({
      ...t,
      id: n,
      type: "audio",
    }));
    if (i === active.current) {
      setTracks(list);
      setActiveAudioTrack(h.audioTrack >= 0 ? h.audioTrack : undefined);
    }
    const pref =
      latest.current.audio === "auto" ? original(s.item) : latest.current.audio;
    const found = findAudioTrack(list,pref);
    if (found && h.audioTrack !== found.id) h.audioTrack = found.id;
  }
  async function resolve(source: any, queue = false) {
    if (!queue && (sourceTransport(source) === "http" || (!providerOnly && source.url))) {
      if(browser)return {...source,url:await browserProviderLink(source.url)};
      if (window.ember?.mediaRemote && !source.providerRelay && !source.playlist &&
          !hlsSource(source) && !source.localTorrent) {
        const remote = await window.ember.mediaRemote(source.url, source.behaviorHints?.proxyHeaders?.request);
        return {...source, ...remote, providerRelay: !remote.playlist};
      }
      return source;
    }
    if (source.infoHash && canRecoverTorBox && (browser || queue)) {
      const args = {
        hash:source.infoHash,index:typeof source.fileIdx === "string" && /^\d+$/.test(source.fileIdx) ? Number(source.fileIdx) : source.fileIdx,filename:source.behaviorHints?.filename,movie:s.item.type === "movie",queue,
      };
      const remote = browser ? await webTorBoxStream(torboxKey!, args)
        : await window.ember!.torboxStream!({...args,token:torboxKey!});
      if ("queued" in remote && remote.queued) return {queued:true};
      if((linux||android)&&"url" in remote&&window.ember?.mediaRemote){const relay=await window.ember.mediaRemote(remote.url);return {...source,...relay,providerRelay:!relay.playlist,cached:true}}
      return {...source,...remote,cached:true};
    }
    if (source.infoHash && window.ember) {
      const r = await window.ember.torrent(
        source.infoHash,
        source.fileIdx == null ? undefined : Number(source.fileIdx),
        source.sources,
      );
      return {
        ...source,
        url: r.url,
        localTorrent: true,
        behaviorHints: { ...source.behaviorHints, filename: r.filename },
      };
    }
    if (browser && source.infoHash) throw Error("Browsers cannot connect to ordinary torrent peers. Open this source in the Ember app for peer-to-peer streaming, or connect a debrid provider for web playback.");
    throw Error("This addon did not provide a video link or a torrent hash Ember can open.");
  }
  function probe(source: any) {
    const existing = probes.current.get(source.url);
    if (existing) return existing;
    const pending = window.ember?.mediaProbe(mediaInput(source)).catch(() => null) ?? Promise.resolve(null);
    probes.current.set(source.url, pending);
    void pending.then(info => { if (!info && probes.current.get(source.url) === pending) probes.current.delete(source.url); });
    return pending;
  }
  const preferredAudio = () => latest.current.audio === "auto" ? original(s.item) : latest.current.audio;
  function defaultAudio(info: MediaInfo | null) {
    return info?.tracks.find(track => track.type === "audio" && track.default)
      ?? info?.tracks.find(track => track.type === "audio");
  }
  function absoluteTime(index: number) {
    const v = videos.current[index]!;
    const stream = compatibility.current[index];
    return { position: mediaPosition(stream?.start,finiteTime(v.currentTime),stream?.rate||1), duration: finiteTime(stream?.duration) || finiteTime(v.duration) || finiteTime(time.current.duration) };
  }
  type PlaybackChange = {position?:number; audio?:number; bitmap?:number|null; height?:number; rate?:number; reason?:'quality'};
  async function loadVideo(source: any, index: number, id: number, target: number, info: MediaInfo | null,
    convert: boolean, change: PlaybackChange) {
    const v = videos.current[index]!;
    clearSlot(index);
    v.playbackRate=1;
    v.muted = true;
    v.preload = (linux||android||browser) ? "metadata" : "auto";
    if (!convert && (source.url.includes("/torrent/") || source.providerRelay || audioGains.current[index] || volumeRef.current > 100)) v.crossOrigin = "anonymous";
    else v.removeAttribute("crossorigin");
    let mediaError = false;
    let stream: ReturnType<typeof embeddedStream> | undefined;
    if (source.browserRemux) {
      const controller = new AbortController();
      remuxControllers.current[index] = controller;
      const deadline = setTimeout(() => controller.abort(), 20000);
      try {
        const {browserRemux} = await import("./browser-remux");
        const repacked = await browserRemux(v, source.url, target, change.audio, controller.signal, preferredAudio());
        if (id !== generation.current || !mounted.current) { controller.abort(); throw Error("Cancelled"); }
        remuxTracks.current[index] = repacked.tracks;
        compatibility.current[index] = {start:repacked.start,duration:repacked.duration,audio:repacked.audio,stream:repacked.stream};
        stream = repacked.stream;
      } finally { clearTimeout(deadline); }
    } else if (convert) {
      const desktop = window.ember;
      if (!desktop) throw Error("Compatibility playback requires the desktop app.");
      if (info && !info.video) throw Error("This source contains no video track.");
      const audio = change.audio ?? findAudioTrack(info?.tracks, preferredAudio())?.id ?? defaultAudio(info)?.id;
      const {format,mime} = embeddedFormat(!info || audio !== undefined);
      const bitmap = change.bitmap ?? undefined;
      const rate=change.rate ?? nativeSpeed.current;
      v.playbackRate=1;
      const url = await desktop.mediaOpen({input:mediaInput(source),start:target,rate,audio,bitmap,height:change.height ?? (Number(source.quality) || undefined),format});
      if (id !== generation.current || !mounted.current) throw Error("Cancelled");
      stream = embeddedStream(v, url, mime, info?.duration ? Math.max(0.1, (info.duration - target)/rate) : null);
      compatibility.current[index] = {start:target,rate,duration:info?.duration ?? (Number.isFinite(time.current.duration) && time.current.duration > 0 ? time.current.duration : null),audio,bitmap,height:change.height,stream};
    } else if (hlsSource(source) && Hls.isSupported() && !v.canPlayType("application/vnd.apple.mpegurl")) {
      const h = new Hls({maxBufferLength:30,maxMaxBufferLength:45,backBufferLength:60,maxBufferSize:48*1024*1024});
      hls.current[index] = h;
      h.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => readyAudio(index));
      h.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_, event) => {
        if (index === active.current) setActiveAudioTrack(event.id);
      });
      h.on(Hls.Events.ERROR, (_, e) => {
        if (!e.fatal) return;
        mediaError = true;
        if (index === active.current && !opening.current) fallback();
      });
      h.attachMedia(v);
      h.loadSource(source.url);
    } else {
      v.src = source.url;
      v.load();
    }
    const until = performance.now() + (linux ? (convert ? 14000 : 4500) : (convert ? 32000 : 20000));
    const wait = async (check: () => boolean) => {
      for (;;) {
        if (id !== generation.current || !mounted.current) throw Error("Cancelled");
        if (stream?.error()) throw stream.error();
        if (mediaError || v.error) throw Error("The source could not be decoded.");
        if (check()) return;
        if (performance.now() > until) throw Error("The source did not become ready.");
        await sleep(70);
      }
    };
    // Safari may ignore preload for inactive media. Start muted before waiting for data.
    if (browser) void v.play().catch(error => {
      if (id === generation.current && error?.name !== "NotAllowedError" && error?.name !== "AbortError") mediaError = true;
    });
    await wait(() => v.readyState >= 1);
    const localTarget = target - (compatibility.current[index]?.start ?? 0);
    if (!convert && localTarget > 0) {
      if (Number.isFinite(v.duration) && localTarget > Math.max(0, v.duration - 0.15))
        throw Error("This source has a different runtime and cannot resume here.");
      v.currentTime = localTarget;
    }
    // Metadata-only preload keeps WebKitGTK out of on-disk download mode.
    // Start muted to obtain the first decoded frame, then restore pause on commit.
    if ((linux||android||browser) && v.readyState < 2) {
      void v.play().catch(error => { if (id === generation.current && !['AbortError','NotAllowedError'].includes(error?.name)) mediaError = true; });
    }
    await wait(() => !v.seeking && v.readyState >= 2);
    if (!v.videoWidth || !v.videoHeight) throw Error("This source did not display a video picture.");
    return v;
  }
  async function choose(
    input: any,
    forceCompatibility = !!state.settings.native,
    automatic = false,
    change?: PlaybackChange,
  ) {
    const same = input.key === sourceRef.current?.key;
    if (same && !change && !error && !buffering && (!forceCompatibility || compatibility.current[active.current])) {if(!automatic&&s.item.type==='series')onSetting({seriesSources:{...latest.current.state.settings.seriesSources,[s.item.id]:sourcePreference(input)}});return true;}
    if (automatic && opening.current) return;
    if (automatic && recoveryAttempts.current >= 3) {
      setStatus("");
      setError("Automatic source attempts stopped. Try a source manually or wait for your provider to recover.");
      recoveryFailed.current = true;
      return;
    }
    if (automatic) recoveryAttempts.current++;
    else if (!same) {
      recoveryAttempts.current = 0;
      recoveryFailed.current = false;
    }
    opening.current = true;
    const id = ++generation.current;
    const oldSlot = active.current;
    const had = !!sourceRef.current;
    const targetSlot = had ? 1 - oldSlot : oldSlot;
    if (had) clearSlot(targetSlot);
    setError("");
    setCloudCandidate(null);
    setOperation(change?.rate!==undefined?'speed':change?.position!==undefined?'seek':change?.audio!==undefined?'audio':change?.reason==='quality'?'quality':'source');
    if(change?.position!==undefined){videos.current[oldSlot]?.pause();lastSample.current=null;}
    setSwitching(had);
    if (!had) setStatus(providerOnly
      ? (input.url ? "Checking the provider stream…" : canRecoverTorBox ? "Checking the TorBox cache…" : "Finding torrent peers…")
      : "Opening source…");
    clearTimeout(stall.current);
    try {
      let source;
      try { source = await resolve(input); }
      catch (error) {
        if (!input.url || !input.infoHash || !canRecoverTorBox || id !== generation.current) throw error;
        source = await resolve({...input,url:undefined});
      }
      if (id !== generation.current) return;
      const canPlayAudio=(mime:string)=>videos.current[targetSlot]?.canPlayType(mime);
      const riskyAudio=needsAudioConversion(hintedAudio(input)||hintedAudio(source),canPlayAudio);
      const fastRemux=(browser||(!linux&&!!window.MediaSource)) && (source.browserRemux || (browser&&forceCompatibility) || (!forceCompatibility&&(riskyAudio||needsContainerRemux(input)||needsContainerRemux(source)||prefersNative(input))));
      if (fastRemux && !hlsSource(source)) source = {...source,browserRemux:true};
      const isHls = hlsSource(source);
      const browserType = source.contentType;
      const useRelay = !!source.providerRelay;
      const requested = !!window.ember && !source.browserRemux && (forceCompatibility ||
        ((volumeRef.current > 100 || riskyAudio) && !isHls) || prefersNative(input) || prefersNative(source) ||
        (!useRelay && !!source.behaviorHints?.proxyHeaders?.request));
      let infoPromise = source.browserRemux ? Promise.resolve(null) : !isHls || requested ? probe(source) : Promise.resolve(null);
      let info = linux && !isHls
        ? await Promise.race<MediaInfo | null>([infoPromise, sleep(1700).then(() => null)])
        : requested ? await Promise.race<MediaInfo|null>([infoPromise,sleep(1200).then(()=>null)]) : null;
      if (id !== generation.current) return;
      const directType = browserType && browserType !== "application/octet-stream"
        ? videos.current[targetSlot]?.canPlayType(browserType) : undefined;
      let converted = requested || (linux && !isHls && (
        directType === "" || needsAudioConversion(defaultAudio(info)?.codec,canPlayAudio) || !!info?.hdr || ["hevc", "av1"].includes(info?.video || "")
      ));
      
      const target = () => {
        const position = change?.position ?? time.current.position;
        return info?.duration ? Math.min(position, Math.max(0, info.duration - 0.15)) : position;
      };
      let v: HTMLVideoElement;
      try {
        v = await loadVideo(source, targetSlot, id, target(), info, converted, change || {});
      } catch (directError) {
        if (browser) {
          if (isHls || (source.browserRemux && (forceCompatibility || riskyAudio))) throw directError;
          // Some providers permit native media playback but forbid browser fetch.
          // A container hint alone must not prevent otherwise playable AAC video.
          source = {...source,browserRemux:!source.browserRemux};
          if (!had) setStatus("Opening video…");
          v = await loadVideo(source, targetSlot, id, target(), info, false, change || {});
        } else {
        if (converted || !window.ember || id !== generation.current) throw directError;
        source={...source,browserRemux:false};
        converted = true;
        if (!had) setStatus("Opening video…");
        info = info || await Promise.race<MediaInfo|null>([probe(source),sleep(1200).then(()=>null)]);
        if (id !== generation.current) return;
        v = await loadVideo(source, targetSlot, id, target(), info, true, change || {});
        }
      }
      if (id !== generation.current) return;
      if (had && change?.position === undefined && !converted && !source.browserRemux && !pauseRef.current && Math.abs(v.currentTime - time.current.position) > 0.8) {
        v.currentTime = time.current.position;
        const until = performance.now() + 2500;
        while ((v.seeking || v.readyState < 2) && performance.now() < until) {
          await sleep(70);
          if (id !== generation.current) return;
        }
        if (v.seeking || v.readyState < 2) throw Error("The replacement source could not catch up.");
      }
      if (!pauseRef.current) {
        try {
          if (linux) {
            await Promise.race([v.play(), sleep(3500).then(() => { throw Error("The video did not start."); })]);
          } else await v.play();
        } catch {
          if (id !== generation.current) return;
          if (had) throw Error("The replacement stream could not start.");
          setPaused(true);
          pauseRef.current = true;
        }
      }
      if (id !== generation.current) return;
      if (pauseRef.current) v.pause();
      active.current = targetSlot;
      setSlot(targetSlot);
      applyVolume(targetSlot);
      v.muted = false;
      if (browser && !pauseRef.current && v.paused) {
        try { await v.play(); }
        catch { setPaused(true); pauseRef.current = true; }
      }
      if (had) clearSlot(oldSlot);
      if (!hls.current[targetSlot]) {
        const nativeTracks = browser ? browserAudioTracks(v) : [];
        const detected = nativeTracks.map((track,id) => ({id,type:"audio",lang:track.language,title:track.label}));
        const preferred = findAudioTrack(detected, preferredAudio());
        if (preferred) nativeTracks.forEach((track,id) => { track.enabled = id === preferred.id; });
        const enabled = nativeTracks.findIndex(track => track.enabled);
        setTracks(remuxTracks.current[targetSlot] || info?.tracks || detected);
        setActiveAudioTrack(compatibility.current[targetSlot]?.audio ?? defaultAudio(info)?.id ?? (enabled >= 0 ? enabled : undefined));
      }
      readyAudio(targetSlot);
      health(v.readyState >= 2);
      setPaused(v.paused);pauseRef.current=v.paused;
      time.current = absoluteTime(targetSlot);
      setDuration(time.current.duration);
      setPosition(time.current.position);
      sourceRef.current = source;
      frameWatch.current = {key:source.key,position:time.current.position};
      void window.ember?.torrentRetain?.(source.url);
      setSelected(source);setSourceLoaded(true);stalledAt.current=0;
      if(!automatic&&!change&&s.item.type==='series')onSetting({quality:input.quality||quality,seriesSources:{...latest.current.state.settings.seriesSources,[s.item.id]:sourcePreference(input)}});
      setStatus("");
      setSwitching(false);
      opening.current = false;
      recoveryFailed.current = false;
      failed.current.delete(source.key);
      if(source.browserRemux && window.ember){
        infoPromise=probe(source);
        void infoPromise.then(available=>{if(id!==generation.current||!available)return;
          setTracks([...(remuxTracks.current[targetSlot]||[]),...available.tracks.filter(track=>track.type==='sub')]);
        });
      }
      
      if (linux && !isHls) {
        const staged = compatibility.current[targetSlot];
        void infoPromise.then(available => {
          if (id !== generation.current || !available) return;
          setTracks(available.tracks);
          if (staged) {
            staged.duration = available.duration;
            if (available.duration) {
              time.current.duration = available.duration;
              setDuration(available.duration);
            }
            // With a late probe the encoder used the first audio stream.
            staged.audio ??= available.tracks.find(t => t.type === "audio")?.id;
          }
          setActiveAudioTrack(staged?.audio ?? defaultAudio(available)?.id);
        });
      }
      if (same) return true;
      setSkipSegments([]);
      subGeneration.current++;
      setSubs([]);
      if (subRef.current?.embedded) {
        subRef.current = null;
        setSubSelection(null);
        setSubText("");
      }
      // Start local track selection as soon as the probe is ready. A slow add-on
      // must not delay audio recovery or extraction of an embedded caption.
      const selectionToken=subGeneration.current;
      const addonSubs = subtitles(latest.current.state.addons, s.item.type, s.vid, source).catch(() => []);
      void infoPromise.then(available=>{
        if(id!==generation.current || selectionToken!==subGeneration.current || subRef.current) return;
        const wanted=latest.current.state.settings.subtitleLanguage;
        const track=available?.tracks.find(t=>t.type==="sub"&&!t.bitmap&&lang(t.lang)===lang(wanted));
        if(wanted!=="off"&&track)void selectSub({...track,embedded:true},false,source);
      });
      void addonSubs.then(async list=>{
        if(id!==generation.current)return;
        setSubs(list);
        await infoPromise;
        if(id!==generation.current||selectionToken!==subGeneration.current||subRef.current)return;
        const wanted=latest.current.state.settings.subtitleLanguage;
        const sub=list.find((entry:any)=>lang(entry.lang)===lang(wanted));
        if(wanted!=="off"&&sub)void selectSub(sub,false,source);
      });
      if (linux && !isHls) {
        void infoPromise.then(available => {
          if (id !== generation.current || !available || opening.current) return;
          const preferred = findAudioTrack(available.tracks, preferredAudio());
          const currentTrack = compatibility.current[targetSlot]?.audio ?? defaultAudio(available)?.id;
          if ((preferred && preferred.id !== currentTrack) || (!compatibility.current[targetSlot] && needsAudioConversion((preferred||defaultAudio(available))?.codec,canPlayAudio))) {
            void choose(source, true, false, {audio:preferred?.id});
          }
        });
      }
      if (!linux && !converted && !isHls && !source.browserRemux) {
        void infoPromise.then(available => {
          if (id !== generation.current || !available) return;
          setTracks(available.tracks);
          setActiveAudioTrack(defaultAudio(available)?.id);
          const preferred = findAudioTrack(available.tracks, preferredAudio());
          const riskyVideo = available.hdr || ["hevc", "av1"].includes(available.video || "");
          if ((riskyVideo || needsAudioConversion((preferred||defaultAudio(available))?.codec,canPlayAudio) || (preferred && preferred.id !== defaultAudio(available)?.id)) && !opening.current) {
            void choose(source, true, false, {audio:preferred?.id});
          }
        });
      }
      return true;
    } catch (e: any) {
      if (id !== generation.current) return;
      opening.current = false;
      clearSlot(targetSlot);
      void window.ember?.torrentRetain?.(sourceRef.current?.url);
      setSwitching(false);
      const message = typeof e === "string" ? e : e.message;
      if (message === "DOWNLOAD_NOT_CACHED") {
        setStatus("");
        setError("This release isn’t cached on TorBox yet.");
        setCloudCandidate(input);
        setDrawer("sources");
        return false;
      }
      if (had && !automatic) {
        if((change?.position!==undefined||linux)&&!pauseRef.current)void videos.current[oldSlot]?.play().catch(()=>{});
        time.current = absoluteTime(oldSlot);
        setPosition(time.current.position);
        onNotice((change?.position!==undefined?"Could not seek. ":"Could not switch playback. ") + (typeof e === "string" ? e : e.message));
        return false;
      }
      failed.current.add(input.key);
      const alternative = candidates(quality).find((x:any) => x.url || x.infoHash);
      if (alternative && (!providerOnly || automatic) && recoveryAttempts.current < 3) {
        void choose(alternative, !!latest.current.state.settings.native, true);
        return;
      }
      recoveryFailed.current = true;
      setStatus("");
      setError(message);
    }
  }
  const chooseRef = useRef(choose);
  chooseRef.current = choose;
  useEffect(() => {
    if (s.loading) return;
    if ((s.showSources || s.video?.showSources)) {
      setStatus("");
      return;
    }
    const first =
      candidates(quality).find(
        (x: any) => x.url || x.infoHash,
      ) ||
      (!providerOnly && state.settings.qualityFallback
        ? all.find((x: any) => x.url || x.infoHash)
        : null);
    if (first) void choose(first, !!state.settings.native, true);
    else {
      setStatus("");
      if (providerOnly) setDrawer("sources");
      setError(sourceHelp || (providerOnly && all.length
        ? "No ready sources match automatic selection. Select a source below."
        : "No playable sources found. Check your stream addon configuration."));
    }
  }, [s.loading]);
  useEffect(() => {
    const timer = setInterval(() => store(), 10000);
    return () => {
      mounted.current = false;
      generation.current++;
      subGeneration.current++;
      clearInterval(timer);
      clearTimeout(stall.current);
      store();
      clearSlot(0);
      clearSlot(1);
      clearTimeout(tapTimer.current);
      clearTimeout(holdTimer.current);clearInterval(holdTick.current);hold.current=null;nativeSpeed.current=1;
      clearTimeout(seekTimer.current);
      void audioContext.current?.close().catch(() => {});
      void window.ember?.nativeCancel();
      void window.ember?.nativeCommand(["quit"]);
      void window.ember?.torrentRetain?.();
    };
  }, []);
  function fallback() {
    const source = sourceRef.current;
    if (
      !source ||
      opening.current ||
      recoveryFailed.current ||
      !mounted.current
    )
      return;
    if (window.ember && !compatibility.current[active.current]) {
      void chooseRef.current(source, true, true, {});
      return;
    }
    failed.current.add(source.key);
    const alternative = candidates(latest.current.state.settings.quality).find((x: any) => x.url || x.infoHash);
    if (alternative)
      void chooseRef.current(alternative, !!latest.current.state.settings.native, true);
    else {
      setError("This stream stopped responding. Choose another source.");
    }
  }
  function finish() {
    store(true);
    if (next && !nextStarted.current && (!latest.current.party?.snapshot || latest.current.party.isHost)) {
      nextStarted.current = true;
      onNext();
    }
  }
  function toggle() {
    const p=latest.current.party;
    if(p?.snapshot){void audioContext.current?.resume();const v=videos.current[active.current];const play=p.snapshot.room.paused||partyPlayBlocked.current;if(play){partyPlayBlocked.current=false;void v?.play().catch(()=>{partyPlayBlocked.current=true})}void p.command(play?'play':'pause');return;}
    const v = videos.current[active.current];
    if (v?.paused) void v.play().catch(() => {});
    else v?.pause();
  }
  function seek(n:number,remote=false){
    const p=latest.current.party;if(p?.snapshot&&!remote){void p.command('seek',{position:n});return;}
    const index = active.current;
    const v = videos.current[index];
    const stream = compatibility.current[index];
    clearTimeout(seekTimer.current);
    seekTimer.current = undefined;
    if(!v||!sourceRef.current||!Number.isFinite(n))return;
    n=Math.max(0,Math.min(n,Number.isFinite(time.current.duration)&&time.current.duration>0?time.current.duration-.15:n));
    lastSample.current=null;
    if(!stream){v.currentTime=n;time.current.position=n;}
    else if (!opening.current && [...Array(v.buffered.length).keys()].some(i =>
        localPosition(n,stream.start,stream.rate||1) >= v.buffered.start(i) && localPosition(n,stream.start,stream.rate||1) < v.buffered.end(i) - 0.15 && n>=stream.start)) {
      v.currentTime = localPosition(n,stream.start,stream.rate||1);
    } else {
      seekTimer.current = setTimeout(() => {
        seekTimer.current = undefined;
        if (!mounted.current || index !== active.current) return;
        void chooseRef.current(sourceRef.current, true, false, {
          position:n,audio:stream.audio,bitmap:stream.bitmap,height:stream.height,
        });
      }, 260);
    }
    time.current.position=n;
    setPosition(n);
  }
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches("input,select,textarea,button"))
        return;
      if (e.code === "Space") {
        e.preventDefault();
        toggle();
      }
      if (e.key === "ArrowLeft") {e.preventDefault();seek(Math.max(0,time.current.position-5));}
      if (e.key === "ArrowRight") {e.preventDefault();seek(time.current.position+5);}
      if (e.key === "Escape") {
        if (drawer) setDrawer("");
        else {
          store();
          onClose();
        }
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [drawer]);
  useEffect(()=>{
    const timer=setInterval(()=>{
      const p=latest.current.party,v=videos.current[active.current];if(!v)return;
      const room=p?.snapshot?.room;let ahead=0;
      for(let i=0;i<v.buffered.length;i++)if(v.currentTime>=v.buffered.start(i)-.1&&v.currentTime<=v.buffered.end(i))ahead=Math.max(ahead,v.buffered.end(i)-v.currentTime);
      const previousSample=playbackSample.current;
      const sample=playbackHealth(previousSample,{slot:active.current,position:v.currentTime,now:Date.now(),paused:v.paused,opening:opening.current||!sourceRef.current||hold.current?.direction===-1,waitingAt:stalledAt.current});
      playbackSample.current=sample;
      if(sample.buffering){
        if(!stalledAt.current)stalledAt.current=Date.now();health(false);
        if(!stall.current)stall.current=setTimeout(()=>{stall.current=undefined;if(!healthy.current&&!videos.current[active.current]?.paused)fallback()},25000);
      }else if(!previousSample||sample.position!==previousSample.position||(v.paused&&(!room?.waiting||v.readyState>=3||ahead>=.25))||opening.current)health(true);
      else {healthy.current=true;setBuffering(false);}

      const ready=partyReady({loaded:sourceRef.current,opening:opening.current,seeking:v.seeking,blocked:partyPlayBlocked.current,readyState:v.readyState,ahead,ended:time.current.duration>0&&time.current.duration-time.current.position<1,stalled:stalledAt.current>0&&Date.now()-stalledAt.current>1200});
      p?.report({ready,duration:finiteTime(time.current.duration),position:finiteTime(time.current.position),key:mediaKey(partyMedia(s))});
      if(!room){if(!hold.current)v.playbackRate=1;lastPartyRoom.current=null;return;}
      // Muted startup owns the media element until its first frame is ready.
      // Pausing it here cancels play(), which used to masquerade as a codec error.
      if(opening.current || !sourceRef.current)return;
      if(mediaKey(room.media)!==mediaKey(partyMedia(s))){v.pause();return;}
      const now=Date.now(),serverNow=p.serverNow(),previous=lastPartyRoom.current;
      const playing=p.connected&&!room.paused&&!room.waiting,target=partyPosition(room,serverNow);
      const action=!previous||previous.epoch!==room.epoch||previous.paused!==room.paused||Math.abs(partyPosition(previous,serverNow)-target)>0.650001;
      if(action||now-lastPartyCheck.current>=60000)pendingPartySync.current=true;
      if(pendingPartySync.current&&!opening.current&&!seekTimer.current&&sourceRef.current&&Number.isFinite(target)){
        const correction=driftCorrection(absoluteTime(active.current).position,target,playing);
        if(correction.seek!==null){lastPartySeek.current=now;seek(correction.seek,true)}
        lastPartyCheck.current=now;pendingPartySync.current=false;
      }
      lastPartyRoom.current=room;v.playbackRate=1;pauseRef.current=!playing;
      if(!playing){if(!v.paused)v.pause();}else if(ready&&v.paused)void v.play().catch(()=>{partyPlayBlocked.current=true;if(now-partyNoticeAt.current>8000){partyNoticeAt.current=now;onNotice('Tap Play to allow this browser to start the party video.')}});
    },500);
    return()=>{clearInterval(timer);latest.current.party?.report({ready:false,duration:0,position:0,key:''})};
  },[]);
  async function selectSub(sub: any, remember = true, source = sourceRef.current, windowStart?: number) {
    const token = ++subGeneration.current;
    try {
      const current = compatibility.current[active.current];
      if (sub.bitmap || current?.bitmap !== undefined) {
        const switched = await chooseRef.current(source, true, false, {
          audio:current?.audio, bitmap:sub.bitmap ? sub.id : null, height:current?.height,
        });
        if (switched === false) return;
      }
      Array.from(videos.current[active.current]?.textTracks||[]).forEach((track,index)=>{track.mode=sub.browserTrack===index?'hidden':'disabled'});
      setBrowserCaption('');
      const start = sub.embedded && !sub.bitmap && sub.browserTrack===undefined
        ? windowStart ?? Math.max(0, Math.floor((time.current.position-3) / 24) * 24) : undefined;
      const raw = sub.bitmap || sub.browserTrack!==undefined ? "" : sub.embedded
        ? await window.ember?.mediaSubtitle(mediaInput(source), sub.id, start)
        : sub.text || await request(sub.url);
      if (token !== subGeneration.current || !mounted.current) return;
      const chosen = {...sub, raw, start};
      subRef.current = chosen;
      setSubSelection(chosen);
      setSubText(raw || "");
      if (remember && sub.lang) {
        onSetting({subtitleLanguage:lang(sub.lang)});
        setSubLanguage(lang(sub.lang));
      }
    } catch {
      if (token === subGeneration.current && windowStart === undefined)
        onNotice("Could not load that subtitle. The current track has been kept.");
    }
  }
  useEffect(()=>{
    const list=videos.current[slot]?.textTracks;
    if(!list)return;
    function update(){
      const tracks=Array.from(list!);
      setBrowserSubs(tracks.map((track,index)=>({id:"browser:"+index,browserTrack:index,lang:track.language||"und",name:track.label||"Embedded track "+(index+1),provider:"Embedded in video"})));
      tracks.forEach((track,index)=>{track.mode=subRef.current?.browserTrack===index?"hidden":"disabled"});
    }
    update();
    list.addEventListener("addtrack",update);
    list.addEventListener("removetrack",update);
    return ()=>{list.removeEventListener("addtrack",update);list.removeEventListener("removetrack",update)};
  },[slot,selected]);
  function turnSubsOff() {
    Array.from(videos.current[active.current]?.textTracks||[]).forEach(t=>{t.mode='disabled'});setBrowserCaption('');
    subGeneration.current++;
    const current = compatibility.current[active.current];
    if (current?.bitmap !== undefined) void chooseRef.current(sourceRef.current, true, false, {
      audio:current.audio,bitmap:null,height:current.height,
    });
    subRef.current = null;
    setSubSelection(null);
    setSubText("");
    onSetting({subtitleLanguage:"off"});
  }
  const subtitleWindow = Math.max(0, Math.floor((position-3) / 24) * 24);
  useEffect(() => {
    const sub = subRef.current;
    if (sub?.start !== undefined && sub.start !== subtitleWindow) {
      void selectSub(sub, false, sourceRef.current, subtitleWindow);
    }
  }, [subtitleWindow, selected]);
  const delayKey=subtitlePreferenceKey(s.item,subSelection);
  const subtitleDelay=Number(state.settings.subtitleDelays?.[delayKey]||0);
  const appearance=state.settings.subtitleAppearance||{};
  const captionStyle:React.CSSProperties={transform:`translateY(-${Math.max(0,Math.min(35,Number(appearance.height)||0))}vh)`,...(appearance.scale?{fontSize:`calc(clamp(19px,2.1vw,32px) * ${appearance.scale})`}:{}),...(appearance.color?{color:appearance.color}:{}),...(appearance.outline?{textShadow:`-1px -1px 1px ${appearance.outline},1px -1px 1px ${appearance.outline},-1px 1px 1px ${appearance.outline},1px 1px 1px ${appearance.outline},0 2px 4px ${appearance.outline}`}:{}),...(appearance.background?{backgroundColor:appearance.background}: {})};
  const cueRows = useMemo(() => {
    const start = 0; // Native extraction preserves absolute source timestamps.
    return subtitleCues(subText).map(cue => ({...cue, start:cue.start + start, end:cue.end + start}));
  }, [subText, subSelection?.start]);
  useEffect(()=>{
    const track=subSelection?.browserTrack;
    if(track===undefined){setBrowserCaption('');return;}
    const v=videos.current[active.current],tt=v?.textTracks[track];
    setBrowserCaption(Array.from(tt?.cues||[]).filter(c=>v!.currentTime-subtitleDelay>=c.startTime&&v!.currentTime-subtitleDelay<c.endTime).map(c=>(c as VTTCue).text).join('\n').replace(/<[^>]+>/g,''));
  },[position,subSelection,subtitleDelay]);
  const textCaption = useMemo(
    () =>
      cueRows
        .filter((c) => position-subtitleDelay >= c.start && position-subtitleDelay < c.end)
        .map((c) => c.text)
        .join("\n"),
    [cueRows, position, subtitleDelay],
  );
  const caption=browserCaption||textCaption;

  useEffect(() => {
    if (
      !next ||
      !state.settings.prefetch ||
      prefetched.current ||
      !duration ||
      position < duration * 0.5 ||
      buffering
    )
      return;
    prefetched.current = true;
    onPrefetch(next).catch(() => {});
  }, [position, duration, buffering]);
  useEffect(() => {
    if (state.settings.smartSkip === "off") {
      setSkipSegments([]);
      return;
    }
    if (!duration || !selected) return;
    let alive = true;
    (async () => {
      const key = await releaseKey(s, selected, duration);
      let saved: any[] = [];
      try {
        saved = JSON.parse(localStorage.getItem(key) || "[]");
      } catch {}
      const result = await segmentDetails(s.item, s.video, duration);
      const list = normalizeSegments(
        [...saved.filter((x) => x.verified), ...result.segments],
        duration,
      );
      if (alive) {
        setSkipSegments(list);
        setSkipStatus(
          list.length
            ? `Loaded ${list.length} segment timings · ${state.settings.skipTrust === "verified" ? "manual verification required" : "community timing enabled"}`
            : "No segment timings returned for this episode." +
                (result.errors.length ? " " + result.errors.join(" · ") : ""),
        );
      }
    })();
    return () => {
      alive = false;
    };
  }, [Math.round(duration), selected?.key, state.settings.smartSkip]);
  useEffect(() => {
    if (
      !completed.current &&
      !!selected &&
      duration > 0 &&
      (position / duration >= .90 || skipSegments.some(
        (seg) =>
          seg.type === "outro" &&
          seg.start >= duration * 0.5 &&
          position >= seg.start,
      ))
    ) {
      completed.current = true;
      store(true);
    }
  }, [position, duration, skipSegments]);
  const activeSkip = skipSegments.find(
      (x) => position >= x.start && position < x.end,
    ),
    showNext =
      !!next &&
      (activeSkip?.type === "outro" ||
        (duration > 0 && duration - position < 45));
  useEffect(() => {
    if (
      !selected ||
      (latest.current.party?.snapshot && !latest.current.party.isHost) ||
      switching ||
      state.settings.smartSkip === "off" ||
      !automaticSegment(activeSkip, state.settings.skipTrust || "community")
    )
      return;
    if (
      (activeSkip.type === "intro" && state.settings.autoSkipIntro) ||
      (activeSkip.type === "recap" && state.settings.autoSkipRecap)
    )
      seek(activeSkip.end);
    if (
      activeSkip.type === "outro" &&
      state.settings.autoNextOutro &&
      next &&
      !nextStarted.current
    ) {
      nextStarted.current = true;
      store();
      onNext();
    }
  }, [
    activeSkip,
    state.settings.autoSkipIntro,
    state.settings.autoSkipRecap,
    state.settings.autoNextOutro,
    state.settings.skipTrust,
    state.settings.smartSkip,
  ]);
  async function verify(seg: any) {
    const list = skipSegments.map((x) =>
      x === seg ? { ...x, verified: true } : x,
    );
    setSkipSegments(list);
    localStorage.setItem(
      await releaseKey(s, selected, duration),
      JSON.stringify(list),
    );
  }
  function switchAudioTrack(track: {id:number}) {
    const index = active.current;
    const h = hls.current[index];
    if (h) {
      h.audioTrack = track.id;
      return;
    }
    if (sourceRef.current?.browserRemux) {
      void chooseRef.current(sourceRef.current, true, false, {audio:track.id});
      return;
    }
    if (browser) {
      const nativeTracks = browserAudioTracks(videos.current[index]);
      if (nativeTracks[track.id]) {
        nativeTracks.forEach((entry,id) => { entry.enabled = id === track.id; });
        setActiveAudioTrack(track.id);
      }
      return;
    }
    const stream = compatibility.current[index];
    if (sourceRef.current && stream?.audio !== track.id)
      void chooseRef.current(sourceRef.current, true, false, {audio:track.id,bitmap:stream?.bitmap,height:stream?.height});
  }
  async function changeAudio(value: string) {
    setAudio(value);
    latest.current.audio = value;
    onSetting({seriesAudio:{...state.settings.seriesAudio,[s.item.id]:value}});
    const source = sourceRef.current;
    if (!source) return;
    const pref = value === "auto" ? original(s.item) : value;
    const available = hls.current[active.current] ? null : await probe(source);
    if (sourceRef.current !== source || latest.current.audio !== value) return;
    const track = findAudioTrack(available?.tracks ?? tracks,pref) ?? (value === "auto" ? defaultAudio(available) : null);
    if (track) switchAudioTrack(track);
    else if (value !== "auto") {
      const alternative = labeledAudioSource(providerOnly ? candidates(0, new Set()) : all,pref,source.key);
      if (alternative) void chooseRef.current(alternative, !!state.settings.native, false);
      else onNotice("This source has no " + languageName(pref) + " audio track.");
    }
  }
  async function downloadSelected(candidate?:any){
    const original=candidate||all.find((x:any)=>x.key===selected?.key)||selected;
    if(!original){onNotice('Choose a source first.');return;}
    try{const source=browser&&!original.url?await resolve(original):original;
      await startDownload(source,`${s.item.name}${s.video?' - S'+s.video.season+'E'+s.video.episode:''}`);setDrawer('downloads');
    }catch(e){onNotice(String(e).replace(/^Error: /,''))}
  }
  const embedded = tracks
    .filter((t) => t.type === "sub")
    .map((t) => ({
      ...t,
      embedded: true,
      lang: lang(t.lang || "und"),
      provider: "Embedded in video",
    }));
  const subtitleList = [...embedded, ...browserSubs, ...subs],
    languages = [
      ...new Set(subtitleList.map((t) => lang(t.lang || "und"))),
    ].sort();
  const [allLanguages,setAllLanguages] = useState(false);
  const [allTracks,setAllTracks] = useState(false);
  const languageTracks = subtitleList.filter(track => lang(track.lang || "und") === subLanguage);
  const missingEpisodes = useEpisodeAvailability(episodeList,state.addons,selectedSeason,s.item.videos,drawer==="episodes");
  const disabledEpisode = (v:any) => Date.parse(v.released||v.firstAired)>Date.now() || missingEpisodes.has(v.id);
  useEffect(()=>{setAllTracks(false)},[subLanguage,drawer]);
  useEffect(()=>{setAllLanguages(false)},[drawer]);
  const preferredKey=selected?.key || (state.settings.seriesSources?.[s.item.id] ? candidates(quality)[0]?.key : undefined);
  useEffect(()=>{
    if(drawer==="sources") container.current?.querySelector(".source.selected")?.scrollIntoView({block:"center"});
  },[drawer,preferredKey,s.candidates.length]);
  return (
    <div
      className={"player " + (!controlsVisible ? "controls-hidden" : "")}
      ref={container}
      onContextMenu={event=>{event.preventDefault();setContextMenu({x:Math.max(8,Math.min(event.clientX,innerWidth-180)),y:Math.max(8,Math.min(event.clientY,innerHeight-58))})}}
      onPointerMove={e=>{if(e.pointerType==='mouse'){keyboardFocus.current=false;wake();}}}
      onPointerDown={()=>{keyboardFocus.current=false;activity.current=Date.now();}}
      onPointerUp={e=>finishSurface(e)}
      onPointerCancel={e=>finishSurface(e,true)}
      onLostPointerCapture={e=>finishSurface(e,true)}
      onKeyDownCapture={(e) => {
        if (e.key === "Tab") keyboardFocus.current = true;
        else if (e.key === "Escape") keyboardFocus.current = false;
        wake();
      }}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget))
          keyboardFocus.current = false;
      }}
    >
      {contextMenu&&<div className="player-context-menu" role="menu" style={{position:'fixed',left:contextMenu.x,top:contextMenu.y,zIndex:10000,padding:6,borderRadius:10,background:'#15171d',border:'1px solid #ffffff26',boxShadow:'0 8px 24px #0008'}}><button className="glass" role="menuitem" disabled={!selected} onClick={()=>{setContextMenu(null);void downloadSelected()}}><Download size={16}/> Download video</button></div>}
      {[0, 1].map((i) => (
        <video
          key={i}
          ref={(v) => {
            videos.current[i] = v;
          }}
          className={i === slot ? "activevideo" : "standbyvideo"}
          onPointerDown={beginHold}
          onPointerMove={e=>{if(!hold.current && Math.hypot(e.clientX-holdOrigin.current.x,e.clientY-holdOrigin.current.y)>24)clearTimeout(holdTimer.current)}}
          onClick={e=>{if(e.detail===0)surfaceTap(e.clientX)}}
          onContextMenu={e=>e.preventDefault()}
          onSeeking={() => { lastSample.current=null; }}
          onTimeUpdate={() => {
            if (i !== active.current || opening.current || seekTimer.current || hold.current?.direction===-1 || !sourceRef.current)
              return;
            const v = videos.current[i]!;
            const previousPosition = time.current.position;
            time.current = absoluteTime(i);
            const sample={position:time.current.position,at:performance.now()};
            if(!v.seeking && !v.paused) coverage.current=mergeRanges([...coverage.current,...playbackRange(lastSample.current,sample,v.playbackRate*(compatibility.current[i]?.rate||1))],time.current.duration);
            lastSample.current=sample;
            if (!seekTimer.current && !dragging.current) setPosition(time.current.position);
            setDuration(time.current.duration);
            if(sourceRef.current && !opening.current && !compatibility.current[i] && !hls.current[i]){
              const watch=frameWatch.current;
              if(watch.key!==sourceRef.current.key)frameWatch.current={key:sourceRef.current.key,position:v.currentTime};
              else if(missingVideoFrames(v,v.currentTime-watch.position)||missingAudioFrames(v,v.currentTime-watch.position)){
                frameWatch.current={key:sourceRef.current.key,position:Infinity};
                if(browser)void chooseRef.current(sourceRef.current,true,false,{});else fallback();
              }
            }
            if(!v.paused && time.current.position>previousPosition)health(true);
            if (Date.now() - lastSave.current > 10000) {
              store();
              lastSave.current = Date.now();
            }
          }}
          onPlaying={() => {
            if (i !== active.current || opening.current) return;
            stalledAt.current=0;clearTimeout(stall.current);
            setStatus("");
            setPaused(false);
            pauseRef.current = false;
            health(true);
          }}
          onPause={() => {
            if (i !== active.current || opening.current || seekTimer.current || hold.current?.direction===-1 || !sourceRef.current)
              return;
            setPaused(true);
            pauseRef.current = true;
            clearTimeout(stall.current);
            store();
          }}
          onWaiting={() => {
            if (
              i !== active.current ||
              videos.current[i]?.paused
            )
              return;
            if(!stalledAt.current)stalledAt.current=Date.now();
            clearTimeout(stall.current);
            stall.current = setTimeout(fallback, 25000);
          }}
          onSeeked={() => {
            if (
              i === active.current &&
              videos.current[i]!.readyState >= 3
            )
              health(true);
          }}
          onError={() => {
            if (i === active.current && sourceRef.current)
              fallback();
          }}
          onEnded={() => {
            if (i === active.current) finish();
          }}
        ></video>
      ))}
      {!sourceLoaded&&!error&&<div className="playerloading" aria-label="Loading video"><img className="loadinglogo" src={s.item.logo?artwork(s.item.logo):emberLogo} onError={e=>{e.currentTarget.onerror=null;e.currentTarget.src=emberLogo}} alt={s.item.logo?s.item.name:"Ember"}/></div>}
      {caption && (
        <div className="captionlayer" aria-live="off" dir="auto" style={captionStyle}>
          {caption}
        </div>
      )}
      {!drawer&&!error&&sourceLoaded&&<button className="centerplay" aria-label={paused?"Play video":"Pause video"} onClick={toggle}>{paused?<Play fill="currentColor"/>:<Pause fill="currentColor"/>}</button>}
      {drawer&&<button className="player-scrim" aria-label="Close player panel" onClick={()=>setDrawer("")}/>}
      <div className="playertop">
        <button
          className="glass"
          onClick={() => {
            store();
            onClose();
          }}
        >
          <ArrowLeft size={18} />
          Back
        </button>
        <div>
          <b>{s.item.name}</b>
          <small>
            {s.video
              ? `Season ${s.video.season} · Episode ${s.video.episode} — ${s.video.title || s.video.name || ""}`
              : "NOW PLAYING"}
          </small>
        </div>
      </div>
      <PlayerNotices message={error || (party?.snapshot&&(!party.connected||party.snapshot.room.waiting)
        ? !party.connected?'Reconnecting to party…':party.snapshot.members.filter((m:any)=>!m.ready||m.mismatch).map((m:any)=>m.client===party.client?(m.mismatch?'Your release has a different runtime':'Buffering…'):`${m.name} is ${m.mismatch?'using a different release':'buffering'}`).join(' · ')
        : switching ? operation==='quality'?'Preparing the new quality…':operation==='audio'?'Changing audio…':operation==='speed'?'Changing speed…':operation==='seek'?'Buffering…':'Changing source…'
        : status || (buffering&&selected&&!paused?'Buffering…':''))}/>
      {error&&<div className="player-error-actions"><button className="glass" onClick={()=>setDrawer('sources')}>Choose source</button>{compatibilitySource&&<button className="glass" onClick={()=>choose(compatibilitySource,true)}>Use compatibility playback</button>}</div>}
      {activeSkip &&
        ["intro", "recap", "outro"].includes(activeSkip.type) &&
        state.settings.smartSkip !== "off" && (
          <button
            className="glass skipbutton"
            onClick={() => seek(activeSkip.end)}
          >
            Skip {activeSkip.type}
            <ChevronRight size={16} />
          </button>
        )}
      {showNext && (!party?.snapshot||party.isHost) && (
        <button
          className="nextcard"
          onClick={() => {
            store();
            onNext();
          }}
        >
          <Artwork item={{...next,seriesId:s.item.id,series:s.item,type:s.item.type,name:next.title || s.item.name}} kind="thumbnail"/>
          <span>
            <small>
              UP NEXT · S{next.season} E{next.episode}
            </small>
            <b>{next.title || next.name || "Next episode"}</b>
            {next.overview && <em>{next.overview}</em>}
          </span>
          <Play size={20} />
        </button>
      )}
      <div className="playerbottom">
        <div className="seekwrap" onPointerLeave={()=>{if(!dragging.current)setSeekPreview(null)}}>
          {seekPreview!==null&&duration>0&&<output className="seek-tooltip" style={{left:`${Math.max(4,Math.min(96,100*seekPreview/duration))}%`}}>{fmt(seekPreview)}</output>}
          <div className="seekbase">
            <span
              className="played"
              style={{ width: (100 * position) / (duration || 1) + "%" }}
            />
            {skipSegments.map((x, i) => (
              <span
                key={i}
                className={"segment " + x.type}
                title={x.type}
                style={{
                  left: (100 * x.start) / (duration || 1) + "%",
                  width: (100 * (x.end - x.start)) / (duration || 1) + "%",
                }}
              />
            ))}
          </div>
          <input
            className="seek"
            aria-label="Playback position"
            type="range"
            min="0"
            max={Number.isFinite(duration) ? duration : 1}
            step="0.1"
            value={finiteTime(position)}
            onPointerMove={e=>{const box=e.currentTarget.getBoundingClientRect();setSeekPreview(timelinePoint(e.clientX,box.left,box.width,duration))}}
            onPointerDown={e=>{dragging.current=true;const box=e.currentTarget.getBoundingClientRect();dragValue.current=timelinePoint(e.clientX,box.left,box.width,duration)??position;setSeekPreview(dragValue.current);e.currentTarget.setPointerCapture(e.pointerId)}}
            onPointerUp={()=>{dragging.current=false;seek(dragValue.current);setSeekPreview(null)}}
            onPointerCancel={()=>{dragging.current=false;setSeekPreview(null);setPosition(time.current.position)}}
            onChange={e=>{const n=Number(e.target.value);dragValue.current=n;setSeekPreview(n);if(dragging.current)setPosition(n);else seek(n)}}
          />
        </div>
        <div className="playercontrols">
          <button
            className="icon"
            aria-label={paused ? "Play" : "Pause"}
            onClick={toggle}
          >
            {paused ? <Play /> : <Pause />}
          </button>
          <button
            className="icon"
            aria-label="Next episode"
            disabled={!next || (!!party?.snapshot&&!party.isHost)}
            onClick={() => {
              store();
              onNext();
            }}
          >
            <SkipForward />
          </button>
          <button className="icon seekstep" aria-label="Back 10 seconds" onClick={()=>seek(time.current.position-10)}><RotateCcw/><small>10</small></button>
          <button className="icon seekstep" aria-label="Forward 10 seconds" onClick={()=>seek(time.current.position+10)}><RotateCw/><small>10</small></button>
          <div className="volumecontrol" onMouseEnter={()=>setVolumeOpen(true)} onMouseLeave={()=>setVolumeOpen(false)} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setVolumeOpen(false)}}>
            <button className="icon" aria-label={volume===0?'Unmute':'Mute'} onClick={()=>void changeVolume(volume===0?lastVolume.current:0)}>{volume===0?<VolumeX size={20}/>:<Volume2 size={20}/>}</button>
            <button className="volumelevel" aria-label="Adjust volume" aria-expanded={volumeOpen} onClick={()=>setVolumeOpen(v=>!v)}>{volume}%<ChevronDown size={12}/></button>
            {volumeOpen&&<div className="volumepopover"><label>Volume <output>{volume}%</output><input aria-label="Volume" type="range" min="0" max="200" step="1" value={volume} onChange={e=>void changeVolume(Number(e.target.value))}/></label><div className="volumepresets">{[0,50,100,150,200].map(n=><button key={n} aria-pressed={volume===n} onClick={()=>void changeVolume(n)}>{n}%</button>)}</div></div>}
          </div>
          <span className="time">
            {fmt(position)} <em>/ {fmt(duration)}</em>
          </span>
          <div className="spacer" />
          <div className="playerextras">
          <select
            aria-label="Video quality"
            value={quality}
            onChange={(e) => {
              const q = Number(e.target.value);
              setQuality(q);
              onSetting({ quality: q });
              const choices = candidates(q, new Set(), false);
              const source = choices.find((x: any) => x.url || x.infoHash);
              if (source) void choose(source, undefined, false, {reason:'quality'});
            }}
          >
            <option value={0}>Auto</option>
            {qualityOptions
              .sort((a, b) => b - a)
              .map((q) => (
                <option key={q} value={q}>
                  {q}p
                </option>
              ))}
          </select>
          <button className="icon" title="Audio" aria-label="Audio" onClick={()=>setDrawer(drawer==='audio'?'':'audio')}><Languages/></button>
          <button
            className="icon"
            aria-label="Subtitles"
            title="Subtitles"
            onClick={() => setDrawer(drawer === "subtitles" ? "" : "subtitles")}
          >
            <Subtitles />
          </button>
          <button className="icon" aria-label="Watch party" title="Watch party" onClick={()=>setDrawer(drawer==='party'?'':'party')}><Users size={21}/></button>
          <button
            className="icon"
            aria-label="Player settings"
            title="Player settings"
            onClick={() => setDrawer(drawer === "settings" ? "" : "settings")}
          >
            <Settings size={21} />
          </button>
          <button
            className="icon"
            aria-label={s.item.type === "series" ? "Episodes" : "Playback"}
            title={s.item.type === "series" ? "Episodes" : "Playback"}
            onClick={() => setDrawer(drawer === "episodes" ? "" : "episodes")}
          >
            <ListVideo size={22} />
          </button>
          <button
            className="icon"
            aria-label="Fullscreen"
            onClick={() =>
              document.fullscreenElement
                ? document.exitFullscreen()
                : container.current?.requestFullscreen()
            }
          >
            <Maximize />
          </button>
          </div>
          <button className="icon player-more" aria-label="More player controls" onClick={()=>setDrawer(drawer==='more'?'':'more')}><MoreVertical/></button>
        </div>

      </div>
      {(holdDirection!==0||(compatibility.current[slot]?.rate||1)>1)&&<div className="hold-speed" role="status">{holdDirection===-1?'2× rewind':'2× speed'}{holdDirection===-1&&seekPreview!==null?' · '+fmt(seekPreview):''}</div>}
      {drawer && (
        <div
          role="dialog" aria-label="Player panel"
          className={
            "playerdrawer " + (drawerClosing ? "panel-closing " : "") +
            (drawer === "subtitles"
              ? "subdrawer"
              : drawer === "episodes"
                ? "episodesdrawer"
                : "")
          }
        >
          <div className="sectionhead">
            <h2>
              {drawer === 'downloads' ? 'Downloads' : drawer === 'more' ? 'Player controls' : drawer === "party" ? "Watch party" : drawer === "sources"
                ? "Your sources"
                : drawer === "episodes"
                  ? "Episodes"
                  : drawer === "settings"
                    ? "Player settings"
                    : drawer === "audio" ? "Audio" : "Subtitles"}
            </h2>
            <button
              className="icon"
              aria-label="Close drawer"
              onClick={() => setDrawer("")}
            >
              <X />
            </button>
          </div>
          {drawer === 'more' ? <div className="player-more-menu"><button className="glass" disabled={!selected} onClick={()=>void downloadSelected()}>Download video</button>{[['downloads','Downloads'],['sources','Sources and quality'],['audio','Audio'],['subtitles','Subtitles'],['episodes','Episodes'],['party','Watch party'],['settings','Player settings']].map(([key,label])=><button className="glass" key={key} onClick={()=>setDrawer(key)}>{label}</button>)}<button className="glass" onClick={()=>{setDrawer('');void (document.fullscreenElement?document.exitFullscreen():container.current?.requestFullscreen())}}>Fullscreen</button></div> : drawer === 'downloads' ? <DownloadsPanel/> : drawer === "party" ? <WatchPartyPanel party={party} canCreate={s.item.id!=="ember:direct"}/> : drawer === "settings" ? (
            <>
              <button className="glass" disabled={!selected} onClick={()=>void downloadSelected()}>Download video</button>
              <button className="glass" onClick={()=>setDrawer("downloads")}>Downloads</button>
              <PlaybackSettings
                settings={state.settings}
                onSetting={onSetting}
                compact
              />
              <section className="segmentsettings">
                {" "}
                <h3>Smart Skip</h3>
                <small>{skipStatus}</small>
                {skipSegments.map((seg, i) => (
                  <div className="panel" key={i}>
                    <p>
                      {seg.type} {fmt(seg.start)}–{fmt(seg.end)} ·{" "}
                      {seg.provider}
                    </p>
                    {(
                      <button className="glass" onClick={() => seek(seg.end)}>
                        Skip
                      </button>
                    )}
                    {!seg.verified && (
                      <button className="glass" onClick={() => verify(seg)}>
                        I checked these timings
                      </button>
                    )}
                  </div>
                ))}
              </section>
            </>
          ) : drawer === "episodes" ? (
            <>
              <div className="actions">
                <button className="glass" onClick={() => setDrawer("sources")}>
                  Current sources
                </button>
                {selected && (
                  <button
                    className="glass"
                    onClick={() => choose(selected, true)}
                  >
                    Use compatibility playback
                  </button>
                )}
              </div>
              <label className="seasonselect">
                Season
                <select
                  aria-label="Episode season"
                  value={selectedSeason}
                  onChange={(e) => setSelectedSeason(Number(e.target.value))}
                >
                  {seasons.map((n) => (
                    <option value={n} key={n}>
                      Season {n}
                    </option>
                  ))}
                </select>
              </label>
              <div className="episode-list" ref={episodeList}>
                {(s.item.videos || [])
                  .filter(
                    (v: any) => Number(v.season) === Number(selectedSeason),
                  )
                  .map((v: any) => (
                    <div
                      className={
                        "episoderow " + (v.id === s.vid ? "current" : "")
                      }
                      key={v.id} data-episode-id={Date.parse(v.released||v.firstAired)>Date.now()?undefined:v.id}
                    >
                      <button
                        disabled={disabledEpisode(v)||!!party?.snapshot&&!party.isHost}
                        aria-current={v.id === s.vid ? "true" : undefined}
                        onClick={() => {
                          store();
                          onEpisode(v);
                        }}
                      >
                        <EpisodeThumb series={s.item} episode={v} progress={episodeRecord(v)} />
                        <span>
                          <small>
                            S{v.season} E{v.episode}
                          </small>
                          <b>{v.title || v.name || "Episode " + v.episode}</b>{v.overview&&<em className="episodeoverview">{v.overview}</em>}
                          {watchIndicator(episodeRecord(v)).watched && (
                            <small className="watchedbadge">
                              <CheckCircle size={11} /> Watched
                            </small>
                          )}
                        </span>
                      </button>
                      <button
                        disabled={disabledEpisode(v)||!!party?.snapshot&&!party.isHost} className="icon"
                        aria-label={
                          "Sources for S" + v.season + " E" + v.episode
                        }
                        onClick={() =>
                          v.id === s.vid
                            ? setDrawer("sources")
                            : onEpisode({ ...v, showSources: true })
                        }
                      >
                        <SlidersHorizontal size={16} />
                      </button>
                    </div>
                  ))}
              </div>
              <button
                className="textbutton"
                onClick={() => setDrawer("settings")}
              >
                Skip and playback settings
              </button>
            </>
          ) : drawer === "sources" ? (
            <>
              {state.settings.seriesSources?.[s.item.id]&&<div className="sourcepreference"><small>Preferred for this series: {state.settings.seriesSources[s.item.id].addon} · {state.settings.seriesSources[s.item.id].group||state.settings.seriesSources[s.item.id].name} · {state.settings.seriesSources[s.item.id].quality||'Auto'}p</small><button className="textbutton" onClick={()=>onSetting({seriesSources:{...state.settings.seriesSources,[s.item.id]:null}})}>Reset source preference</button></div>}
              {providerOnly && (error || status) && <p role="status">{error || status}</p>}
              {sourceHelp && error !== sourceHelp && <p>{sourceHelp}</p>}
              {cloudCandidate && <button className="glass" onClick={async () => {
                const source = cloudCandidate;
                const id = generation.current;
                setCloudCandidate(null);
                setError("");
                setStatus("Sending release to TorBox…");
                try {
                  await resolve(source, true);
                  if (id === generation.current) setError("TorBox accepted the release. Select it again once it is ready in TorBox.");
                } catch (error) {
                  if (id === generation.current) setError(typeof error === "string" ? error : (error as Error).message);
                } finally { if (id === generation.current) setStatus(""); }
              }}>Prepare this release in TorBox</button>}
              {providerOnly && (!hasHttpSources || !all.length) && onOpenAddons && (
                <div className="actions"><button className="glass" onClick={onOpenAddons}>Open Addons</button></div>
              )}
              {canRecoverTorBox && hasRawTorrents && <small>TorBox handles torrent sources in the cloud.</small>}
              {all.map((source: any) => {
                const transport = sourceTransport(source);
                return (
                <div className="source-download-row" key={source.key}><button
                  className={
                    "source " + (source.key === preferredKey ? "selected" : "")
                  }
                  key={source.key}
                  onClick={() => {
                    if (transport === "external") {
                      if (browser) window.open(source.externalUrl, "_blank", "noopener,noreferrer");
                      else window.ember?.openExternal(source.externalUrl);
                    } else if (providerOnly) {
                      void choose(source).then(opened => {
                        if (opened) setDrawer(previous => previous === "sources" ? "" : previous);
                      });
                    } else {
                      void choose(source);
                      setDrawer("");
                    }
                  }}
                >
                  <span className="sourcequality">
                    {source.quality ? source.quality + "p" : "AUTO"}
                  </span>
                  <div>
                    <b>{source.name || source.addon}</b>
                    <p>{source.label}</p>
                    <small>
                      {source.addon} ·{" "}
                      {transport === "torrent"
                        ? (browser ? "Stream via TorBox" : "Peer-to-peer torrent")
                        : transport === "http" ? (source.cached ? "Cached HTTP stream" : "HTTP stream")
                          : transport === "external" ? "Open provider website" : "Unsupported source"}
                    </small>
                  </div>
                  <Play size={16} />
                </button>{["http","torrent"].includes(transport)&&<button className="icon source-download" title="Download this source" aria-label={`Download ${source.name||source.addon}`} onClick={()=>void downloadSelected(source)}><Download size={18}/></button>}</div>
                );
              })}
              {selected && window.ember?.platform === "win32" && (
                <button className="glass" onClick={async () => {
                  const desktop = window.ember;
                  if (!desktop) return;
                  const video = videos.current[active.current];
                  const wasPlaying = !!video && !video.paused;
                  try {
                    video?.pause();
                    await desktop.native(selected.url, time.current.position, selected.behaviorHints?.proxyHeaders?.request);
                    await desktop.nativeCommand(["set_property", "volume", volumeRef.current]);
                  } catch {
                    if (wasPlaying) void video?.play().catch(() => {});
                    onNotice("Could not open the source in external mpv.");
                  }
                }}>Open in external mpv</button>
              )}
              {!all.length && <p>No sources returned.</p>}
            </>
          ) : drawer === "audio" ? (
            <>
              <label>
                Audio for this series
                <select
                  value={audio}
                  onChange={(e) => changeAudio(e.target.value)}
                >
                  {[
                    ...new Set([
                      "auto",
                      "en",
                      "ja",
                      "ko",
                      "zh",
                      "hi",
                      "ur",
                      "es",
                      "fr",
                      "de",
                      "ar",
                      ...tracks
                        .filter((t) => t.type === "audio")
                        .map((t) => audioLanguage(t.lang || t.title || t.name) || "und"),
                    ]),
                  ].map((v) => (
                    <option key={v} value={v}>
                      {v === "auto"
                        ? "Original / track default"
                        : languageName(v)}
                    </option>
                  ))}
                </select>
                <small>Ember remembers this language for the series.</small>
              </label>
              {browser && !tracks.some(t => t.type === "audio") && <small>Track switching is available when HLS or your browser exposes audio tracks.</small>}
              {tracks.some(t => t.type === "audio") && (
                <div className="actions" aria-label="Audio tracks">
                  {tracks.filter(t => t.type === "audio").map((track, index) => (
                    <button className="glass" key={track.id}
                      aria-pressed={activeAudioTrack === track.id} onClick={() => switchAudioTrack(track)}>
                      {track.title || track.name || languageName(audioLanguage(track.lang) || track.lang || "und")}
                      {" · Track " + (index + 1)}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="actions">
                <button className="glass" onClick={turnSubsOff}>
                  Turn subtitles off
                </button>
                <label className="filebutton">
                  <Upload size={16} />
                  Load file
                  <input
                    type="file"
                    accept=".srt,.vtt"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f)
                        void selectSub({
                          id: "file:" + f.name,
                          name: f.name,
                          lang: subLanguage,
                          text: await f.text(),
                        });
                    }}
                  />
                </label>
              </div>
              <div className="subtitlepicker">
                <nav aria-label="Subtitle languages">
                  {(allLanguages?languages:languages.slice(0,5)).map((l) => (
                    <button
                      key={l}
                      className={l === subLanguage ? "selected" : ""}
                      onClick={() => setSubLanguage(l)}
                    >
                      {languageName(l)}
                      <small>
                        {
                          subtitleList.filter(
                            (t) => lang(t.lang || "und") === l,
                          ).length
                        }
                      </small>
                    </button>
                  ))}
                  {languages.length>5&&<button aria-expanded={allLanguages} onClick={()=>setAllLanguages(!allLanguages)}>{allLanguages?"Show fewer languages":"Show all "+languages.length+" languages"}</button>}
                  {!languages.length && <p>No languages yet.</p>}
                </nav>
                <div className="subtitletracks" aria-label="Subtitle tracks">
                  {(allTracks?languageTracks:languageTracks.slice(0,5))
                    .map((sub, i) => (
                      <button
                        className={
                          "subrow " +
                          ((sub.id || sub.url) ===
                          (subSelection?.id || subSelection?.url)
                            ? "selected"
                            : "")
                        }
                        key={(sub.url || sub.id) + ":" + i}
                        onClick={() => void selectSub(sub)}
                      >
                        <Subtitles size={17} />
                        <span>
                          <b>
                            {sub.name ||
                              sub.title ||
                              sub.filename ||
                              `Track ${i + 1}`}
                          </b>
                          <small>
                            {sub.provider || "Stream provider"}
                            {sub.embedded ? " · Exact video release" : ""}
                          </small>
                        </span>
                      </button>
                    ))}
                  {languageTracks.length>5&&<button aria-expanded={allTracks} onClick={()=>setAllTracks(!allTracks)}>{allTracks?"Show fewer tracks":"Show all "+languageTracks.length+" tracks"}</button>}
                  {!subtitleList.some(
                    (t) => lang(t.lang || "und") === subLanguage,
                  ) && <p>No tracks in this language.</p>}
                </div>
              </div>
              <section className="subtitleadjustments"><h3>Subtitle timing</h3><label>Delay <output>{subtitleDelay.toFixed(1)} s</output><input aria-label="Subtitle delay" type="range" min="-30" max="30" step="0.1" value={subtitleDelay} disabled={!subSelection||subSelection.bitmap} onChange={e=>onSetting({subtitleDelays:{...state.settings.subtitleDelays,[delayKey]:Number(e.target.value)}})}/></label><small>Negative shows earlier; positive shows later. Saved for this subtitle track/release and title across episodes.</small>{subSelection?.bitmap&&<small>Embedded image subtitles cannot be styled or delayed here. Choose a text subtitle.</small>}<h3>Appearance for your profile</h3><label>Height <output>{appearance.height||0}%</output><input aria-label="Subtitle height" type="range" min="0" max="35" step="1" value={appearance.height||0} onChange={e=>onSetting({subtitleAppearance:{...appearance,height:Number(e.target.value)}})}/></label><label>Scale <output>{Math.round((appearance.scale||1)*100)}%</output><input aria-label="Subtitle scale" type="range" min="0.6" max="2" step="0.05" value={appearance.scale||1} onChange={e=>onSetting({subtitleAppearance:{...appearance,scale:Number(e.target.value)}})}/></label>{[['color','Text color','#fafafa'],['outline','Outline color','#000000']].map(([key,label,value])=><label key={key}>{label}<input aria-label={label} type="color" value={appearance[key]||value} onChange={e=>onSetting({subtitleAppearance:{...appearance,[key]:e.target.value}})}/></label>)}<label>Background<select aria-label="Subtitle background" value={appearance.background||''} onChange={e=>onSetting({subtitleAppearance:{...appearance,background:e.target.value}})}><option value="">Transparent (default)</option><option value="#00000080">Soft black</option><option value="#000000">Black</option><option value="#ffffffcc">Light</option></select></label><button className="glass" onClick={()=>onSetting({subtitleAppearance:{}})}>Reset appearance</button><button className="glass" disabled={!subSelection} onClick={()=>onSetting({subtitleDelays:{...state.settings.subtitleDelays,[delayKey]:0}})}>Reset delay</button></section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
export function EpisodeThumb({ episode: v, progress, series }: any) {
  const indicator = watchIndicator(progress);
  return (
    <span className="episodethumbwrap">
      <Artwork item={{...v,seriesId:series?.id,series,type:"series",name:v.title || v.name || "Episode"}} kind="thumbnail" className="episodethumb"/>
      {indicator.percent > 0 && (
        <span
          className="episodeprogress"
          aria-label={Math.round(indicator.percent) + " percent watched"}
        >
          <i style={{ width: indicator.percent + "%" }} />
        </span>
      )}
    </span>
  );
}



