import DownloadsPanel from './DownloadsPanel';
import TitleDetails from './TitleDetails';
import {useWatchParty} from './use-watch-party';
import WatchPartyPanel from './WatchPartyPanel';
import {mediaKey,partyMedia} from './party-core.mjs';
import {useAppNavigation} from "./use-app-navigation";
import {torrentioConfiguration,torrentioConfigure} from "./source-config.mjs";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {recordHistory,historyItems,eraseHistory,titleKey} from "./history-core.mjs";
import {recommend} from "./recommendation-core.mjs";
import {HistoryGate,HistoryPrivacy} from "./HistoryPrivacy";
import {historyAccessKey,historyLock} from "./history-lock.mjs";
import {HistoryView} from "./HistoryView";
import { continueItems } from "./progress-state.mjs";
import PlaybackSettings from "./PlaybackSettings";
import { Spotlight, ContinueRow, CatalogRow } from "./MediaRows";
import Artwork, { ArtworkProviders } from "./Artwork";
import { genreOptions, matchesGenres, sortItems, SORTS } from "./catalog-core.mjs";
import { traktRequest, recommendations } from "./trakt";
import React, { useState, useEffect, useRef, useMemo, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import {
  Flame,
  Search,
  Home,
  History,
  Menu,
  Library,
  Puzzle,
  Settings,
  Play,
  Plus,
  Check,
  X,
  ChevronRight,
  ArrowLeft,
  Volume2,
  Maximize,
  Minus,
  Square,
  SkipForward,
  Pause,
  SlidersHorizontal,
  Monitor,
  Download,
  Upload,
  RefreshCw,
  LogOut,
  Film,
  Clapperboard,
  Subtitles,
  Heart,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
const Player = lazy(() => import("./Player"));
import {
  install,
  catalogs,
  metadata,
  streams,
  subtitles,
  request,
  Item,
  Addon,
} from "./api";
import {
  rankSources,
  nextEpisode,
  updateProgress,
  normalize,
} from "./core.mjs";
import { load, save } from "./store";
import CloudAccount from "./CloudAccount";
import ProfileChooser from "./ProfileChooser";
import {editProfile,snapshot,profileScope} from "./profile-core.mjs";
import {savePlaybackTorBoxKey, playbackTorBoxKey} from "./web-playback";
import "./style.css";
function openWebsite(raw: string) {
  const url = new URL(raw);
  if (!["https:", "http:"].includes(url.protocol)) throw Error("Use a website URL.");
  if (window.ember) window.ember.openExternal(url.href);
  else window.open(url.href, "_blank", "noopener,noreferrer");
}
function App() {
  const [state, setState] = useState<any>(null);
  const [accountMenu,setAccountMenu]=useState(false);
  const logoutRef=useRef<(()=>void)|null>(null);
  const accountMenuRef=useRef<HTMLDivElement>(null);
  const [mobileMenu,setMobileMenu]=useState(false);
  const [page, setPage] = useState("Home");
  const [type, setType] = useState("all");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [detail, setDetail] = useState<Item | null>(null);
  const [session, setSession] = useState<any>(null);
  const searchInput=useRef<HTMLInputElement>(null);
  const pageScroll=useRef<Record<string,number>>({});
  useEffect(()=>{
    const previous=history.scrollRestoration;history.scrollRestoration='manual';
    window.scrollTo({top:pageScroll.current[page]||0,behavior:'instant'});
    const remember=()=>{pageScroll.current[page]=window.scrollY};
    window.addEventListener('scroll',remember,{passive:true});
    return ()=>{window.removeEventListener('scroll',remember);history.scrollRestoration=previous};
  },[page]);
  useEffect(()=>{
    if(page!=='Discover'||detail||session)return;
    const typeToSearch=(e:KeyboardEvent)=>{
      if(e.defaultPrevented||e.isComposing||e.ctrlKey||e.metaKey||e.altKey||e.key.length!==1||e.key===' '||document.querySelector('[role="dialog"],.dialog,.profilechooser'))return;
      const target=e.target as HTMLElement;
      if(target.closest('input,textarea,select,[contenteditable="true"]'))return;
      e.preventDefault();searchInput.current?.focus();setQuery(q=>q+e.key);setType('all');
    };
    window.addEventListener('keydown',typeToSearch);return ()=>window.removeEventListener('keydown',typeToSearch);
  },[page,detail,session]);
  const [addonUrl, setAddonUrl] = useState("");
  const [modal, setModal] = useState("");
  const [traktCode, setTraktCode] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [account, setAccount] = useState<any>(null);
  const [unlocked,setUnlocked]=useState(false);
  const party=useWatchParty(account,state,session);
  const [partyOpen,setPartyOpen]=useState(false);
  const partyLoading=useRef('');
  useEffect(()=>{
    const room=party.snapshot?.room;if(!room||party.isHost||!unlocked)return;
    const key=mediaKey(room.media);if(key===mediaKey(partyMedia(session))||partyLoading.current===key)return;
    partyLoading.current=key;setPartyOpen(false);const media=room.media;
    void metadata(stateRef.current.addons,{id:media.id,type:media.type,name:media.name}).then(item=>play(item,media.type==='series'?{id:media.vid,season:media.season,episode:media.episode,title:media.title}:undefined)).catch(()=>setNotice('Could not load the party title. Check your catalog addons.')).finally(()=>{partyLoading.current=''});
  },[party.snapshot?.room.epoch,party.snapshot?.room.id,unlocked]);
  const [chooser,setChooser] = useState(true);
  const [direct, setDirect] = useState("");
  const [torboxKey, setTorboxKey] = useState(playbackTorBoxKey);
  const [genres, setGenres] = useState<string[]>([]);
  const [sort, setSort] = useState("default");
  const [filtersOpen,setFiltersOpen]=useState(false),[draftGenres,setDraftGenres]=useState<string[]>([]),[draftSort,setDraftSort]=useState("default");
  const toggleFilters=()=>{if(!filtersOpen){setDraftGenres(genres);setDraftSort(sort)}setFiltersOpen(!filtersOpen)};
  const [catalogResult,setCatalogResult] = useState<any>(null);
  const [moreBusy,setMoreBusy] = useState(false);
  const [detailSeason, setDetailSeason] = useState(1);
  const [rows, setRows] = useState<any[]>([]);
  const [catalogError, setCatalogError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [installing, setInstalling] = useState(false);
  const prepared = useRef<any>(null);
  const fetchId = useRef(0);
  const lastCatalogRefresh = useRef(0);
  const playId = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [directoryTick,setDirectoryTick]=useState(0);
  useEffect(()=>{
    const refresh=()=>setDirectoryTick(t=>t+1);
    const timer=setInterval(refresh,15*60*1000);
    window.addEventListener('focus',refresh);
    return ()=>{clearInterval(timer);window.removeEventListener('focus',refresh)};
  },[]);
  const hydratedProgress=useRef(new Map<string,number>());
  useEffect(()=>{
    if(!state||page!=='Home'||session)return;
    const scope=String(state._people?.owner)+':'+state._people?.activeId;
    const candidates=(Object.values(state.progress||{}) as any[]).filter(p=>p.item?.type==='series'&&!p.hidden).sort((a,b)=>b.updatedAt-a.updatedAt);
    let started=0;
    for(const p of candidates){
      const key=scope+':'+p.item.id;if((hydratedProgress.current.get(key)||0)>Date.now())continue;
      if(started++>=4)break;
      hydratedProgress.current.set(key,Date.now()+15*60*1000);
      void metadata(state.addons,p.item).then(item=>{
        const latest=stateRef.current;if(!item.videos?.length||scope!==String(latest?._people?.owner)+':'+latest?._people?.activeId)return;
        setState((old:any)=>({...old,progress:Object.fromEntries(Object.entries(old.progress).map(([id,value]:any)=>[id,value.item?.id===item.id?{...value,item}:value]))}));
      });
    }
  },[directoryTick,state?.progress,page,!!session,state?._people?.activeId]);
  const navigateBack = useAppNavigation({page, detail, session, modal}, previous => {
    playId.current++;
    prepared.current = null;
    setPage(previous.page);
    setDetail(previous.detail);
    setSession(previous.session);
    setModal(previous.modal);
    setAccountMenu(false);
    setMobileMenu(false);
  }, JSON.stringify([state?._people?.owner, state?._people?.activeId]));

  useEffect(() => {
    load().then(setState).catch(() => setNotice("Your saved profile could not be opened. It has not been replaced. Close Ember and check the migration report."));
  }, []);
  useEffect(()=>{playId.current++;prepared.current=null;setSession(null);},[state?._people?.owner,state?._people?.activeId]);
  useEffect(() => {
    if (!state || !window.ember) return;
    const receive = (u: string) => {
      setAddonUrl(u);
      setPage("Addons");
      setNotice("Addon link received. Press Install to confirm.");
    };
    const off = window.ember.addonLink(receive);
    window.ember.takeLinks().then((a) => a.forEach(receive));
    return off;
  }, [!!state]);
  useEffect(() => {
    if (state)
      save(state).catch(() =>
        setNotice("Could not save your changes. Check available disk space."),
      );
  }, [state]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(()=>{
    if(page !== "Home" || state?.settings.experimentalHome === false)return;
    let frame=0;
    const update=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>document.documentElement.style.setProperty("--hero-collapse",String(Math.min(1,window.scrollY/360))));};
    update();window.addEventListener("scroll",update,{passive:true});
    return()=>{window.removeEventListener("scroll",update);cancelAnimationFrame(frame);document.documentElement.style.removeProperty("--hero-collapse");};
  },[page,state?.settings.experimentalHome]);
  useEffect(()=>{
    if(!accountMenu)return;
    const outside=(e:PointerEvent)=>{if(!accountMenuRef.current?.contains(e.target as Node))setAccountMenu(false)};
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){setAccountMenu(false);accountMenuRef.current?.querySelector<HTMLButtonElement>('button')?.focus()}};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)};
  },[accountMenu]);
  const patch = (p: any) => setState((s: any) => ({ ...s, ...p }));
  const setting = (p: any) =>
    setState((s: any) => ({ ...s, settings: { ...s.settings, ...p } }));
  useEffect(() => {
    if (!state || session || !["Home", "Discover"].includes(page)) {
      setBusy(false);
      return;
    }
    const id = ++fetchId.current;
    const force = refresh !== lastCatalogRefresh.current;
    lastCatalogRefresh.current = refresh;
    const timer = setTimeout(
      async () => {
        setBusy(true);
        try {
          const publish = (result: any) => {
            if (id !== fetchId.current) return;
            setRows([...result.rows]); setItems(result.items);
            setCatalogResult(result); setCatalogError(!!result.errors);
            if (result.items.length) setBusy(false);
          };
          const r = await catalogs(state.addons, page === "Home" ? "all" : type, page === "Home" ? "" : query, {
            force, lazy: page === "Home", genres: page === "Home" ? [] : genres,
            sort: page === "Home" ? "default" : sort,
            active: () => id === fetchId.current,
            onUpdate: publish,
          });
          if (
            !query &&
            type !== "all" &&
            !genres.length && sort === "default" &&
            state.settings.traktToken &&
            state.settings.traktClientId
          ) {
            try {
              const rec = await recommendations(
                state.settings.traktClientId,
                state.settings.traktToken,
                type,
              );
              r.items = [
                ...rec,
                ...r.items.filter(
                  (i: Item) => !rec.some((j: Item) => j.id === i.id),
                ),
              ];
            } catch {}
          }
          if (id !== fetchId.current) return;
          setItems(r.items);
          if (r.errors && !r.items.length)
            setNotice(
              "Catalog connection issue. Retry or check your addon configuration.",
            );
        } finally {
          if (id === fetchId.current) setBusy(false);
        }
      },
      query ? 400 : 0,
    );
    return () => {
      clearTimeout(timer);
      fetchId.current++;
    };
  }, [state?.addons, type, query, page, refresh, !!session, genres, sort]);
  useEffect(() => {
    if (!traktCode) return;
    let stopped = false;
    const expires = Date.now() + traktCode.expires_in * 1000;
    let timer: any;
    const poll = async () => {
      if (stopped) return;
      if (Date.now() > expires) {
        setTraktCode(null);
        setNotice("Trakt code expired. Connect again.");
        return;
      }
      try {
        const r = await traktRequest(
          state.settings.traktClientId,
          "/oauth/device/token",
          "POST",
          {
            code: traktCode.device_code,
            client_id: state.settings.traktClientId,
          },
        );
        if (stopped) return;
        setting({ traktToken: r.access_token });
        setTraktCode(null);
        setNotice("Trakt connected. Recommendations will appear on Discover.");
      } catch (e: any) {
        if (stopped) return;
        if (e.status === 400 || e.status === 429)
          timer = setTimeout(poll, (traktCode.interval || 5) * 1000);
        else {
          setTraktCode(null);
          setNotice(e.message);
        }
      }
    };
    timer = setTimeout(poll, (traktCode.interval || 5) * 1000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [traktCode]);
  async function open(item: Item, preferredSeason?:number) {
    setDetailSeason(
      preferredSeason || Number(item.videos?.find((v: any) => v.season > 0)?.season) || 1,
    );
    setDetail(item);
    const m = await metadata(state.addons, item);
    setDetail((d) => (d?.id === item.id ? m : d));
    setDetailSeason(
      preferredSeason || Number(m.videos?.find((v: any) => v.season > 0)?.season) || 1,
    );
  }
  async function play(item: Item, video?: any, showSources=!!video?.showSources) {
    const id = ++playId.current;
    const scope=profileScope(stateRef.current);
    const metadataRefresh=item.type==='series'?metadata(state.addons,item):Promise.resolve(item);
    if(item.type === "series" && !item.videos?.length) { item=await metadataRefresh; if(id!==playId.current)return; }
    video=item.videos?.find((v:any)=>v.id===video?.id)||video;
    const vid = video?.id || item.id;
    if(Date.parse(video?.released||video?.firstAired)>Date.now())return;
    const started = performance.now();
    const sources =
      item.id === "ember:direct"
        ? [normalize({ name: "Direct stream", url: direct }, "Direct")]
        : await prepare(item, vid);
    if (id !== playId.current || scope!==profileScope(stateRef.current)) return;
    if(video && !sources.length){setNotice("No sources available for this episode.");return;}
    if(video){
      setState((old:any)=>{
        const previous=continueItems(old.progress).find((p:any)=>p.item.id===item.id && p.newEpisode && p.vid===vid);
        if(!previous)return old;
        const entry=Object.entries(old.progress).find(([,p]:any)=>p.item?.id===item.id&&p.updatedAt===previous.updatedAt);
        if(!entry)return old;
        return {...old,progress:{...old.progress,[entry[0]]:{...old.progress[entry[0]],openedEpisode:vid}}};
      });
    }
    setDetail(null);
    prepared.current = null;
    setSession({
      profileScope:scope,
      showSources,
      item,
      video,
      vid,
      candidates: sources,
      loading: false,
      started,
      sourceMs: performance.now() - started,
    });
    void metadataRefresh.then(updated=>{
      if(id!==playId.current)return;
      setSession((current:any)=>current?.vid===vid?{...current,item:updated,video:updated.videos?.find((v:any)=>v.id===vid)||current.video}:current);
    });
  }
  function prepare(item: Item, vid: string) {
    const key = JSON.stringify([
      item.type,
      vid,
      state.addons.filter((a: Addon) => a.enabled).map((a: Addon) => a.base),
    ]);
    if (prepared.current?.key === key && prepared.current.expires > Date.now())
      return prepared.current.promise;
    const promise = streams(state.addons, item.type, vid);
    prepared.current = { key, promise, expires: Date.now() + 120000 };
    return promise;
  }
  function removeContinue(item: Item) {
    const progress = { ...state.progress };
    for (const [k, v] of Object.entries(progress) as any)
      if (v.item?.id === item.id)
        progress[k] = { ...v, hidden: true, updatedAt: Date.now() };
    patch({ progress });
  }

  function progress(
    s: any,
    position: number,
    duration: number,
    watched?: boolean,
    ranges: number[][] = [],
  ) {
    const id = s.item.type + ":" + s.vid;
    const value = {
      item: s.item,
      video: s.video,
      vid: s.vid,
      position,
      duration,
      watched,
      hidden: false,
      updatedAt: Date.now(),
    };
    const prev=stateRef.current;
    if(s.profileScope!==profileScope(prev))return;
    const next={...prev,history:recordHistory(prev.history,{...value,ranges}),progress:{...prev.progress,[id]:updateProgress(prev.progress[id],value)}};
    stateRef.current=next;
    setState(next);
    void save(next).catch(()=>setNotice("Could not save your viewing history. Check available storage."));
  }
  function toggleLibrary(item: Item) {
    const has = state.library.some((i: Item) => i.id === item.id);
    patch({
      library: has
        ? state.library.filter((i: Item) => i.id !== item.id)
        : [item, ...state.library],
    });
    setNotice(has ? "Removed from your library" : "Added to your library");
  }
  async function add() {
    try {
      setInstalling(true);
      const a = await install(addonUrl);
      patch({
        addons: [
          ...state.addons.filter(
            (b: Addon) =>
              b.base !== a.base &&
              !(
                b.base === "https://torrentio.strem.fun" &&
                b.manifest.id === a.manifest.id
              ),
          ),
          a,
        ],
      });
      setAddonUrl("");
      setNotice(a.manifest.name + " installed");
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setInstalling(false);
    }
  }
  function exportData() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify({backupVersion:4,...snapshot(state)}, null, 2)], { type: "application/json" }),
    );
    a.download = "ember-backup.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setNotice("Backed up this profile. The file may contain addon URLs and tokens; keep it private.");
  }
  const picks = useMemo(()=>recommend(items,state?.history).map((i:any)=>state?.settings?.historyLock?.mode && state.settings.historyLock.mode!=='off' ? {...i,recommendationReason:"Picked from your viewing preferences"} : i),[items,state?.history,state?.settings?.historyLock]);
  if (!state)
    return (
      <div className="boot">
        <Flame size={48} />
        <h1>
          ember<span>.</span>
        </h1>
        <p>{notice || "Preparing your cinema"}</p>
      </div>
    );
  const recent: any[] = continueItems(state.progress);

  const visible = sortItems((page === "Library" ? state.library : items).filter(
    (i: Item) => (type === "all" || i.type === type) && matchesGenres(i, genres),
  ),"default");
  return (
    <ArtworkProviders.Provider value={state.addons}>
    <div className={"app" + (state.settings.experimentalHome !== false ? " experimental" : "") + (page === "Home" ? " home" : "") + (window.ember && window.ember.platform!=="android" ? " desktopchrome" : "") + (state.settings.highContrast ? " highcontrast" : "") + (state.settings.reduceMotion ? " reducedmotion" : "")} style={{"--ui-scale":Math.min(1.6,Math.max(0.8,Number(state.settings.uiScale ?? 1.32))),"--font-scale":Math.min(1.6,Math.max(0.8,Number(state.settings.textScale ?? 1)))} as React.CSSProperties}>
      {window.ember && window.ember.platform!=="android" && <div className="apptitlebar">
        <div className="windowdrag" data-tauri-drag-region><Flame size={17} fill="currentColor" data-tauri-drag-region/><b data-tauri-drag-region>ember<span>.</span></b><span className="windowcontext" data-tauri-drag-region>YOUR PERSONAL CINEMA</span></div>
        <span className="windowpage">{page}</span>
        <div className="windowbuttons"><button aria-label="Minimize window" onClick={()=>void getCurrentWindow().minimize()}><Minus size={16}/></button><button aria-label="Maximize or restore window" onClick={()=>void getCurrentWindow().toggleMaximize()}><Square size={13}/></button><button className="windowclose" aria-label="Close window" onClick={()=>void getCurrentWindow().close()}><X size={16}/></button></div>
      </div>}
      <aside aria-label="Main navigation" onMouseLeave={e=>{if(e.currentTarget.contains(document.activeElement) && !(document.activeElement as HTMLElement).matches(":focus-visible"))(document.activeElement as HTMLElement).blur()}}>
        <a
          className="brand"
          onClick={() => {
            setPage("Home");
            setQuery("");
            setType("all");
          }}
        >
          <Flame fill="currentColor" />
          <b>
            ember<span>.</span>
          </b>
        </a>
        <div className="navlabel">YOUR SPACE</div><div className="navcenter">
        {[
          [Home, "Home"],
          [Search, "Discover"],
          [Library, "Library"],
          [Puzzle, "Addons"],
        ].map(([Icon, label]: any) => (
          <button
            key={label}
            className={"nav " + (label === "Addons" ? "addonnav " : "") + (page === label ? "active" : "")}
            onClick={() => {
              setPage(label);
              if (label === "Home") {
                setQuery("");
                setType("all");
                setItems([]);
                setRows([]);
              }
              setGenres([]); setSort("default");
            }}
          >
            <Icon size={20} />
            <span className="navtext">{label}</span>
          </button>
        ))}
        </div><div className="sidebottom">
          <button className="nav" onClick={() => setModal("direct")}>
            <Play size={18} />
            <span className="navtext">Open stream</span>
          </button>
          <button
            className={"nav " + (page === "Settings" ? "active" : "")}
            onClick={() => setPage("Settings")}
          >
            <Settings size={19} />
            <span className="navtext">Settings</span>
          </button>
        </div>
        <button className="nav mobilemore" aria-label="More navigation" aria-expanded={mobileMenu} onClick={()=>setMobileMenu(v=>!v)}><Menu size={22}/><span>More</span></button>
      </aside>
      {mobileMenu && <><button className="mobilemenubackdrop" aria-label="Close navigation menu" onClick={()=>setMobileMenu(false)}/><div className="mobilemenu" role="group" aria-label="More navigation options" onKeyDown={e=>{if(e.key==='Escape')setMobileMenu(false)}}><button onClick={()=>{setPage("Downloads");setMobileMenu(false)}}>Downloads</button><button onClick={()=>{setPartyOpen(true);setMobileMenu(false)}}>Watch party</button><button onClick={()=>{setPage('History');setMobileMenu(false)}}>View history</button><button onClick={()=>{setPage("Addons");setMobileMenu(false)}}><Puzzle size={20}/>Addons</button><button onClick={()=>{setModal("direct");setMobileMenu(false)}}><Play size={20}/>Open stream</button><button onClick={()=>{setPage("Settings");setMobileMenu(false)}}><Settings size={20}/>Settings</button></div></>}
      <CloudAccount logoutRef={logoutRef} state={state} setState={setState} onAccount={(a:any)=>{setAccount(a);const current=stateRef.current,owner=current?._people?.owner;const p=a?.id===owner?current._people.accounts[owner]?.profiles.find((p:any)=>p.id===current._people.activeId):null;setUnlocked(!!p&&!p.pin);setChooser(!p||!!p.pin)}} onNotice={setNotice} visible={page === "Settings"}/>
{partyOpen&&<div className="party-modal" role="dialog" aria-modal="true" aria-label="Watch party"><div className="party-dialog"><div className="sectionhead"><h2>Watch party</h2><button className="icon" aria-label="Close watch party" onClick={()=>setPartyOpen(false)}><X/></button></div><WatchPartyPanel party={party} canCreate={!!session}/></div></div>}
{chooser && <ProfileChooser state={state} setState={setState} account={account} allowClose={unlocked} onClose={()=>{setUnlocked(true);setChooser(false)}} onAuth={()=>{setChooser(false);setPage("Settings")}}/>}
      <main inert={chooser?true:undefined}>
        <header>
          <div className="breadcrumbs">
            YOUR PERSONAL CINEMA <span>/</span> {page}
          </div>
          {(page !== "Home" || state.settings.experimentalHome === false) && <label className="search">
            <Search size={18} />
            <input
              ref={searchInput}
              aria-label="Search movies and series"
              placeholder="Find your next obsession"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setType("all");
                setPage("Discover");
              }}
            />
            {query && (
              <button onClick={() => setQuery("")}>
                <X size={16} />
              </button>
            )}
            <kbd>⌕</kbd>
          </label>}
          <div className="accountmenuanchor" ref={accountMenuRef}><button
            className="icon"
            aria-label="Account"
            aria-expanded={accountMenu}
            aria-haspopup="menu"
            onClick={() => setAccountMenu(v=>!v)}
          >
            <div className="miniavatar">{state._people?.owner && state._people?.activeId !== "guest" ? <img src={"/avatars/"+String((state._people.accounts[state._people.owner]?.profiles.find((p:any)=>p.id===state._people.activeId)?.avatar||0)+1).padStart(2,"0")+".svg"} alt=""/> : state.profile[0]}</div>
          </button>
          {accountMenu&&<div className="accountmenu" role="menu" aria-label="Account menu"><strong>{state.profile}</strong><button role="menuitem" onClick={()=>{setPartyOpen(true);setAccountMenu(false)}}>Watch party</button><button role="menuitem" onClick={()=>{setChooser(true);setAccountMenu(false)}}>Manage profiles</button>{account&&<button role="menuitem" onClick={()=>{setAccountMenu(false);logoutRef.current?.()}}>Log out</button>}{!window.ember&&<a role="menuitem" href="./downloads/index.html">Download app</a>}{[["Downloads","Downloads"],["Settings","Settings"],["History","View history"]].map(([destination,label])=><button key={destination} role="menuitem" onClick={()=>{setPage(destination);setAccountMenu(false)}}>{label}</button>)}</div>}
          </div>
        </header>
        {page === "Downloads" && !session && <DownloadsPanel/>}
        {page === "History" && !session && <HistoryGate key={historyAccessKey(state)} state={state}><HistoryView history={state.history} open={open} onErase={(keep:boolean,key:string|null)=>setState((previous:any)=>eraseHistory(previous,keep,key))}/></HistoryGate>}
        {!session &&
          (page === "Home" || page === "Discover" || page === "Library") && (
            <>
              {page !== "Home" && (
                <div className="tabs">
                  <button
                    className={type === "all" ? "selected" : ""}
                    onClick={() => setType("all")}
                  >
                    All
                  </button>
                  <button
                    className={type === "movie" ? "selected" : ""}
                    onClick={() => setType("movie")}
                  >
                    Movies
                  </button>
                  <button
                    className={type === "series" ? "selected" : ""}
                    onClick={() => setType("series")}
                  >
                    Series
                  </button>
                  <span className="pill">
                    <i /> YOUR SCREEN. YOUR RULES.
                  </span>
                </div>
              )}
              {page === "Home" && !query && (
                <Spotlight
                  items={items}
                  open={open}
                  play={play}
                  toggleLibrary={toggleLibrary}
                />
              )}
              {page === "Home" && !query && (
                <ContinueRow
                  open={open}
                  recent={recent}
                  play={play}
                  remove={removeContinue}
                />
              )}
              {page === "Home" && !!picks.length && <CatalogRow row={{name:historyItems(state.history).length ? "Picked for you" : "Discover your taste",items:picks,loaded:true}} open={open}/>}
              {catalogError && page !== "Library" && (
                <div className="panel">
                  <h3>Catalog connection issue</h3>
                  <button
                    className="glass"
                    onClick={() => setRefresh((n) => n + 1)}
                  >
                    Retry catalogs
                  </button>
                </div>
              )}
              {page === "Home" ? (
                rows.map((row) => (
                  <CatalogRow key={row.url || row.name} row={row} open={open} />
                ))
              ) : (
                <>
                  <section className="section">
                    <div className="sectionhead">
                      <h2>
                        {page === "Library"
                          ? "Your collection"
                          : query
                            ? `Results for “${query}”`
                            : "Find your next favorite"}
                        <span>.</span>
                      </h2>
                      <span>
                        {busy ? "DISCOVERING…" : `${visible.length} TITLES`}
                      </span>
                    </div>
                    <div className="discovertools"><button className="glass" aria-expanded={filtersOpen} aria-controls="catalog-filters" onClick={toggleFilters}><SlidersHorizontal size={18}/>Genres <b>{genres.length || "All"}</b></button><button className="glass" aria-expanded={filtersOpen} aria-controls="catalog-filters" onClick={toggleFilters}>Sort by <b>{SORTS[sort as keyof typeof SORTS]}</b></button></div>
                    {filtersOpen&&<section id="catalog-filters" className="catalogfilters" aria-label="Genres and sorting"><div className="sectionhead"><h2>Refine your catalog</h2><button className="icon" aria-label="Close filters" onClick={()=>setFiltersOpen(false)}><X/></button></div><h3>Genres</h3><p>Titles must match every selection. Adult and nudity filters depend on labels supplied by your addons.</p><div className="filterchips"><button aria-pressed={!draftGenres.length} onClick={()=>setDraftGenres([])}>All genres</button>{genreOptions(state.addons).map((g:string)=><button key={g} aria-pressed={draftGenres.includes(g)} onClick={()=>setDraftGenres(old=>old.includes(g)?old.filter(x=>x!==g):[...old,g])}>{g}</button>)}</div>{page!=="Library"&&<><h3>Sort by</h3><div className="filterchips">{Object.entries(SORTS).map(([v,label])=><button key={v} aria-pressed={draftSort===v} onClick={()=>setDraftSort(v)}>{label}</button>)}</div></>}<div className="actions"><button className="primary" onClick={()=>{setGenres(draftGenres);setSort(draftSort);setFiltersOpen(false)}}>Apply filters</button><button className="glass" onClick={()=>{setDraftGenres([]);setDraftSort("default")}}>Reset</button></div></section>}
                    {genres.length > 0 && <div className="activegenres">{genres.map(g=><button className="glass" key={g} aria-label={`Remove ${g} filter`} onClick={()=>setGenres(old=>old.filter(x=>x!==g))}>{g}<X size={12}/></button>)}<button className="textbutton" onClick={()=>setGenres([])}>Clear genres</button></div>}
                    {(genres.length > 0 || sort !== "default") && <p className="filterhint">{genres.length > 1 ? "Matches every selected genre (AND). " : ""}{sort !== "default" ? "Uses matching provider feeds and available metadata; provider rankings are not a universal score. " : ""}Country, language and genre metadata are combined across providers. Unranked titles follow ranked titles; load more to extend the results.</p>}
                    {busy && !visible.length ? (
                      <div className="postergrid">
                        {Array.from({ length: 6 }, (_, i) => (
                          <div className="skeleton" key={i} />
                        ))}
                      </div>
                    ) : (
                      <div className="postergrid">
                        {visible.map((item: Item) => (
                          <button
                            className="poster"
                            key={item.type + item.id}
                            onClick={() => open(item)}
                          >
                            <div className="posterimage">
                              <Artwork item={item}/>
                              <span className="posterplay">
                                <Play fill="currentColor" />
                              </span>
                              {item.imdbRating && (
                                <span className="posterrating">
                                  ★ {item.imdbRating}
                                </span>
                              )}
                            </div>
                            <b>{item.name}</b>
                            <small>
                              {item.releaseInfo || item.year || item.type}
                            </small>
                          </button>
                        ))}
                      </div>
                    )}
                    {page === "Discover" && (catalogResult?.hasMore || catalogResult?.hasCheckMore) && <button className="glass moretitles" disabled={moreBusy} onClick={async()=>{setMoreBusy(true);try{if(catalogResult.hasMore) await catalogResult.loadMore();else await catalogResult.checkMore();}finally{setMoreBusy(false);}}}>{moreBusy ? "Loading…" : catalogResult.hasMore ? "Load more" : "Check more titles"}</button>}
                    {!busy && !visible.length && (
                      <div className="empty">
                        <Clapperboard size={38} />
                        <h3>
                          {page === "Library"
                            ? "Make room for your favorites"
                            : "Nothing here yet"}
                        </h3>
                        <p>
                          {page === "Library"
                            ? "Add a title to your collection from its details."
                            : "Install a catalog addon or try another search."}
                        </p>
                      </div>
                    )}
                  </section>
                </>
              )}
              <footer>
                <Flame size={16} /> MADE FOR THE WAY YOU WATCH{" "}
                <span>EMBER / 0.7.6</span>
              </footer>
            </>
          )}
        {page === "Addons" && (
          <section className="settings">
            <span className="eyebrow">MAKE IT YOURS</span>
            <h1>
              A world of possibilities<span>.</span>
            </h1>
            <p className="muted">
              Bring your catalogs, streams and subtitles together.
            </p>
            <div className="panel">
              <h3>Install an addon</h3>
              <p>Paste the configured manifest URL from your addon provider.</p>
              <div className="inputrow">
                <input
                  aria-label="Addon manifest URL"
                  type={window.ember ? "text" : "password"}
                  autoComplete="off"
                  value={addonUrl}
                  onChange={(e) => setAddonUrl(e.target.value)}
                  placeholder="https://your-addon.com/manifest.json"
                />
                <button
                  className="primary"
                  disabled={installing || !addonUrl}
                  onClick={add}
                >
                  <Plus size={18} />
                  Install
                </button>
              </div>
              <div className="actions">
                <button className="glass" onClick={() => { try { const url = new URL(addonUrl.replace(/^stremio:/,"https:")); url.pathname = url.pathname.replace(/\/manifest\.json$/, "") + "/configure"; openWebsite(url.href); } catch { setNotice("Paste an addon manifest URL first."); } }}>Configure pasted addon</button>
                {window.ember && <button
                  className="glass"
                  onClick={async () =>
                    setNotice(
                      (await window.ember?.registerLinks())
                        ? "Registered. Choose Ember when your browser asks."
                        : "Choose Ember in Windows default-app settings.",
                    )
                  }
                >
                  Use Ember for browser installs
                </button>}
                <button
                  className="glass"
                  onClick={() => openWebsite(torrentioConfigure)}
                >
                  Configure Torrentio
                </button>
              </div>
              <small>
                Configured URLs may contain private access tokens. Ember keeps
                them in your profile.
              </small>
            </div>
            {!window.ember && <div className="panel">
              <h3>TorBox playback</h3>
              <p>Use your TorBox API key if Torrentio returns torrent hashes. Ember asks TorBox for cached releases and streams from the provider.</p>
              <div className="inputrow">
                <input aria-label="TorBox API key" type="password" autoComplete="off" value={torboxKey}
                  placeholder="TorBox API key" onChange={event => setTorboxKey(event.target.value)} />
                <button className="primary" onClick={async () => {
                  try {
                    await savePlaybackTorBoxKey(torboxKey);
                    setNotice(torboxKey.trim() ? "TorBox key saved on this device." : "TorBox key cleared.");
                  } catch (error) { setNotice((error as Error).message); }
                }}>Save key</button>
              </div>
              <small>Get the key in TorBox Settings. Ember saves it on this device and uses it during TorBox lookups.</small>
            </div>}
            <h2>
              Installed <span className="count">{state.addons.length}</span>
            </h2>
            {state.addons.map((a: Addon) => (
              <div className="addon panel" key={a.base}>
                <div className="addonicon">
                  <Puzzle />
                </div>
                <div className="grow">
                  <h3>{a.manifest.name}</h3>
                  {!window.ember && torrentioConfiguration(a) === "torbox" && <small>TorBox configuration detected</small>}
                  {!window.ember && torrentioConfiguration(a) === "plain" && <small>Returns torrent hashes. You can use these with the TorBox key above.</small>}
                  <p>{a.manifest.description}</p>
                  {a.manifest.behaviorHints?.configurationRequired && <button className="textbutton" onClick={()=>openWebsite(a.base+"/configure")}>Configuration required · Configure addon</button>}
                  <div className="tags">
                    {a.manifest.resources.map((r: any) => (
                      <span key={typeof r === "string" ? r : r.name}>
                        {typeof r === "string" ? r : r.name}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  className={"toggle " + (a.enabled ? "on" : "")}
                  aria-label={"Enable " + a.manifest.name}
                  onClick={() =>
                    patch({
                      addons: state.addons.map((b: Addon) =>
                        b.base === a.base ? { ...b, enabled: !b.enabled } : b,
                      ),
                    })
                  }
                />
                <button
                  className="icon"
                  aria-label={"Remove " + a.manifest.name}
                  onClick={() => {
                    if (confirm("Remove " + a.manifest.name + "?"))
                      patch({
                        addons: state.addons.filter(
                          (b: Addon) => b.base !== a.base,
                        ),
                      });
                  }}
                >
                  <X size={19} />
                </button>
              </div>
            ))}
            <div className="hint">
              <AlertCircle size={19} />
              <p>
                Catalog addons find titles. Stream addons provide playback
                sources. Install both for a complete experience.
              </p>
            </div>
          </section>
        )}
        {page === "Settings" && (
          <section className="settings">
            <span className="eyebrow">THE FINER DETAILS</span>
            <h1>
              Your cinema, your way<span>.</span>
            </h1>
            <div id="account-settings"/><HistoryPrivacy key={historyAccessKey(state)} state={state} onSetting={setting}/><div className="panel"><h3>Profiles</h3><p>Choose, add or edit profiles. Each profile has its own library, history, recommendations, progress and playback settings.</p><button className="glass" onClick={()=>setChooser(true)}>Manage profiles</button></div><div className="panel"><h3>Experimental layout</h3><label className="settingline">Use cinematic home and compact sidebar<input type="checkbox" checked={state.settings.experimentalHome !== false} onChange={e=>setting({experimentalHome:e.target.checked})}/></label></div>
            <div className="panel accessibility"><h3>Accessibility & display</h3>
              <label>Interface scale <output>{Math.round(100*Number(state.settings.uiScale ?? 1.32))}%</output><input aria-label="Interface scale" type="range" min="0.8" max="1.6" step="0.01" value={state.settings.uiScale ?? 1.32} onChange={e=>setting({uiScale:Number(e.target.value)})}/></label>
              <label>Text adjustment <output>{Math.round(100*Number(state.settings.textScale ?? 1))}%</output><input aria-label="Text adjustment" type="range" min="0.8" max="1.6" step="0.01" value={state.settings.textScale ?? 1} onChange={e=>setting({textScale:Number(e.target.value)})}/></label>
              <label className="settingline">High contrast<input type="checkbox" checked={!!state.settings.highContrast} onChange={e=>setting({highContrast:e.target.checked})}/></label>
              <label className="settingline">Reduce motion<input type="checkbox" checked={!!state.settings.reduceMotion} onChange={e=>setting({reduceMotion:e.target.checked})}/></label>
            </div>
            <div className="settinggrid">
              <div className="panel">
                <h3>Profile & playback</h3>
                <label>
                  Display name
                  <input
                    value={state.profile}
                    maxLength={30}
                    onChange={(e) =>
                      setState((s:any)=>s._people?.owner ? editProfile(s,s._people.owner,s._people.activeId,{name:e.target.value || "You"}) : {...s,profile:e.target.value || "Guest"})
                    }
                  />
                </label>
                <label>
                  Preferred quality
                  <select
                    value={state.settings.quality}
                    onChange={(e) =>
                      setting({ quality: Number(e.target.value) })
                    }
                  >
                    {[0, 2160, 1080, 720, 480].map((q) => (
                      <option key={q} value={q}>
                        {q ? q + "p" : "Auto — best available"}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Default subtitle language
                  <select
                    value={state.settings.subtitleLanguage}
                    onChange={(e) =>
                      setting({ subtitleLanguage: e.target.value })
                    }
                  >
                    {[
                      "off",
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
                    ].map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="settingline">
                  Allow resolution fallback
                  <input
                    type="checkbox"
                    checked={state.settings.qualityFallback}
                    onChange={(e) =>
                      setting({ qualityFallback: e.target.checked })
                    }
                  />
                </div>
                <div className="settingline">
                  Prefetch next episode sources
                  <input
                    type="checkbox"
                    checked={state.settings.prefetch}
                    onChange={(e) => setting({ prefetch: e.target.checked })}
                  />
                </div>
                <PlaybackSettings
                  settings={state.settings}
                  onSetting={setting}
                />
                {window.ember ? <>
                <div className="settingline">
                  Prefer in-app compatibility mode
                  <input
                    type="checkbox"
                    checked={state.settings.native}
                    onChange={(e) => setting({ native: e.target.checked })}
                  />
                </div>
                <small>
                  Compatibility mode converts the source for playback inside Ember.
                  Automatic mode uses direct playback when the format is supported.
                </small>
                </> : <small>Web playback uses the browser's supported video and audio formats.</small>}
              </div>
              <div className="panel">
                <h3>Your data belongs to you</h3>
                <p>
                  Progress is saved on this device. Export a backup before
                  moving or reinstalling.
                </p>
                <button className="glass" onClick={exportData}>
                  <Download size={16} />
                  Export backup
                </button>
                <label className="filebutton">
                  <Upload size={16} />
                  Import backup
                  <input
                    type="file"
                    accept=".json"
                    onChange={async (e) => {
                      try {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const d = JSON.parse(await file.text());
                        if (
                          !Array.isArray(d.addons) ||
                          !d.progress ||
                          !Array.isArray(d.library)
                        )
                          throw Error("Invalid Ember backup");
                        for (const a of d.addons)
                          if (!a.base || !a.manifest?.id)
                            throw Error("Invalid addon data");
                        if (confirm("Replace this profile with the backup?"))
                          setState((s:any)=>{
                            let next={...s,profile:String(d.profile || s.profile).slice(0,30),settings:{...s.settings,...d.settings},addons:d.addons,library:d.library,progress:d.progress,history:d.history || {}};
                            if(s._people?.owner)next=editProfile(next,s._people.owner,s._people.activeId,{name:next.profile});
                            return next;
                          });
                      } catch (e: any) {
                        setNotice(e.message);
                      }
                    }}
                  />
                </label>
                <p>
                  <b>{Object.keys(state.progress).length}</b> titles tracked ·{" "}
                  <b>{state.library.length}</b> saved
                </p>
              </div>
              <div className="panel wide">
                <h3>
                  Trakt recommendations <span className="badge">OPTIONAL</span>
                </h3>
                <p>
                  Connect your account for recommendations. Your watch history
                  stays in Ember. To personalize Trakt from Ember activity, use
                  Send watched history below.
                </p>
                <input
                  aria-label="Trakt client ID"
                  placeholder="Your registered Trakt app client ID"
                  value={state.settings.traktClientId || ""}
                  onChange={(e) => setting({ traktClientId: e.target.value })}
                />
                <div className="actions">
                  {state.settings.traktToken ? (
                    <>
                      <button
                        className="glass"
                        onClick={async () => {
                          try {
                            const movies: any[] = [],
                              episodes: any[] = [];
                            for (const p of Object.values(
                              state.progress,
                            ) as any[]) {
                              if (!p.watched || !p.item.id.startsWith("tt"))
                                continue;
                              if (p.video)
                                episodes.push({
                                  ids: { imdb: p.item.id },
                                  seasons: [
                                    {
                                      number: p.video.season,
                                      episodes: [
                                        {
                                          number: p.video.episode,
                                          watched_at: new Date(
                                            p.updatedAt,
                                          ).toISOString(),
                                        },
                                      ],
                                    },
                                  ],
                                });
                              else
                                movies.push({
                                  ids: { imdb: p.item.id },
                                  watched_at: new Date(
                                    p.updatedAt,
                                  ).toISOString(),
                                });
                            }
                            await traktRequest(
                              state.settings.traktClientId,
                              "/sync/history",
                              "POST",
                              { movies, shows: episodes },
                              state.settings.traktToken,
                            );
                            setNotice("Watched history sent to Trakt");
                          } catch (e: any) {
                            setNotice(e.message);
                          }
                        }}
                      >
                        <RefreshCw size={16} />
                        Send watched history
                      </button>
                      <button
                        className="glass"
                        onClick={() => setting({ traktToken: "" })}
                      >
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <button
                      className="primary"
                      disabled={!state.settings.traktClientId || !!traktCode}
                      onClick={async () => {
                        try {
                          setTraktCode(
                            await traktRequest(
                              state.settings.traktClientId,
                              "/oauth/device/code",
                              "POST",
                              { client_id: state.settings.traktClientId },
                            ),
                          );
                        } catch (e: any) {
                          setNotice(e.message);
                        }
                      }}
                    >
                      Connect Trakt
                    </button>
                  )}
                </div>
                {traktCode && (
                  <p>
                    Visit{" "}
                    <a
                      href={traktCode.verification_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {traktCode.verification_url}
                    </a>{" "}
                    and enter <b>{traktCode.user_code}</b>. Waiting for
                    authorization…
                  </p>
                )}
                <small>
                  Ember uses Trakt but is not endorsed or certified by Trakt.
                  This prototype reconnects when the access token expires.
                </small>
              </div>
              <div className="panel wide">
                <h3>About Ember</h3>
                <p>
                  Ember 0.6.0 · Independent client for the Stremio addon
                  protocol. Not affiliated with Stremio or Netflix.
                </p>
                <p>
                  HTTP streams, catalog addons, subtitle addons,
                  automatic/manual sources, next episode, local history, and
                  optional cloud progress are implemented. Torrent playback is
                  available in the desktop app. Trakt requires your registered
                  app client ID. The native player opens a separate window.
                </p>
              </div>
            </div>
          </section>
        )}
      </main>
      {notice && (
        <div className="toast" role="status">
          <AlertCircle size={18} />
          {notice}
          <button onClick={() => setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {detail && <TitleDetails addons={state.addons} key={detail.id} item={detail} season={detailSeason} setSeason={setDetailSeason} progress={state.progress} inLibrary={state.library.some((i:Item)=>i.id===detail.id)} onLibrary={toggleLibrary} onPlay={play} onClose={()=>navigateBack(()=>setDetail(null))} openWebsite={openWebsite}/>}
      {modal === "direct" && (
        <div className="overlay">
          <div className="dialog panel">
            <button className="close icon" onClick={() => navigateBack(() => setModal(""))}>
              <X />
            </button>
            <h2>Open a stream</h2>
            <p>Paste a direct HTTP(S) video or HLS URL.</p>
            <input
              autoFocus
              placeholder="https://example.com/video.mp4"
              value={direct}
              onChange={(e) => setDirect(e.target.value)}
            />
            <div className="actions">
              <button
                className="primary"
                onClick={() => {
                  try {
                    const u = new URL(direct);
                    if (!["http:", "https:"].includes(u.protocol))
                      throw Error();
                    setModal("");
                    play({
                      id: "ember:direct",
                      type: "movie",
                      name: u.pathname.split("/").pop() || "Direct stream",
                    });
                  } catch {
                    setNotice("Enter a valid HTTP(S) URL");
                  }
                }}
              >
                <Play size={18} />
                Play
              </button>
            </div>
          </div>
        </div>
      )}
      {session && (
        <Suspense fallback={<div className="boot">Opening player…</div>}>
          <Player
            party={party}
            key={session.vid}
            session={session}
            state={state}
            onClose={() => {
              void party.leave();
              navigateBack(() => {
                playId.current++;
                prepared.current = null;
                setSession(null);
              });
            }}
            onOpenAddons={() => {
              playId.current++;
              prepared.current = null;
              setSession(null);
              setPage("Addons");
            }}
            onProgress={progress}
            onNext={() => {
              if(party.snapshot&&!party.isHost)return;
              const next = nextEpisode(session.item.videos || [], session.vid);
              if (next) play(session.item, next);
            }}
            onNotice={setNotice}
            onSetting={setting}
            onEpisode={(v:any)=>{if(!party.snapshot||party.isHost)void play(session.item,v);else setNotice("The party host chooses episodes.")}}
            onPrefetch={(v: any) => prepare(session.item, v.id)}
          />
        </Suspense>
      )}
    </div>
    </ArtworkProviders.Provider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

