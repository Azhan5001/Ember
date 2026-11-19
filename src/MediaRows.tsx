import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Play, Plus, X, Film } from "lucide-react";
import Artwork from "./Artwork";
export function Rail({ children, label, className = "" }: any) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  const update = () => {
    const v = ref.current;
    if (!v) return;
    if (className.includes("catalogstrip")) {
      const scale = Number.parseFloat(getComputedStyle(v).getPropertyValue("--ui-scale")) || 1.2;
      const full = Math.max(1, Math.floor((v.clientWidth - 48) / (175*scale)));
      const width = Math.max(110*scale, (v.clientWidth - 48 - full * 20*scale) / full);
      v.style.setProperty("--rail-card-width", width + "px");
    }
    setOverflow(v.scrollWidth > v.clientWidth + 2);
  };
  const move = (direction: number) => {
    const v = ref.current;
    if (!v) return;
    const max = v.scrollWidth - v.clientWidth,
      first = v.firstElementChild as HTMLElement | null;
    const gap = Number.parseFloat(getComputedStyle(v).columnGap) || 0;
    const step = (first?.getBoundingClientRect().width || 155) + gap;
    const page = Math.max(1, Math.floor(v.clientWidth / step));
    const index = Math.round(v.scrollLeft / step);
    const target =
      direction > 0
        ? v.scrollLeft >= max - 3
          ? 0
          : Math.min(max, (index + page) * step)
        : v.scrollLeft <= 3
          ? max
          : Math.max(0, (index - page) * step);
    v.scrollTo({
      left: target,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  };
  useEffect(() => {
    update();
    const o = new ResizeObserver(update);
    if (ref.current) {
      o.observe(ref.current);
      if (ref.current.firstElementChild)
        o.observe(ref.current.firstElementChild);
    }
    return () => o.disconnect();
  }, [children]);
  return (
    <div className="rail" aria-roledescription="carousel" aria-label={label}>
      <div ref={ref} className={"railcontent " + className} onScroll={update}>
        {children}
      </div>
      <button
        className="railarrow left"
        disabled={!overflow}
        aria-label={"Scroll " + label + " left"}
        onClick={() => move(-1)}
      >
        <ChevronLeft size={23} />
      </button>
      <button
        className="railarrow right"
        disabled={!overflow}
        aria-label={"Scroll " + label + " right"}
        onClick={() => move(1)}
      >
        <ChevronRight size={23} />
      </button>
    </div>
  );
}
export function Spotlight({ items, open, play, toggleLibrary }: any) {
  const list = items.filter((i: any) => i.background).slice(0, 8);
  const [index, setIndex] = useState(0),
    [hold, setHold] = useState(false);
  const key = list.map((i: any) => i.id).join("|");
  useEffect(() => setIndex(0), [key]);
  useEffect(() => {
    if (
      hold ||
      list.length < 2 ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const timer = setInterval(() => {
      if (!document.hidden) setIndex((i) => (i + 1) % list.length);
    }, 8500);
    return () => clearInterval(timer);
  }, [hold, key, index]);
  const [collapsed,setCollapsed]=useState(false);
  useEffect(()=>{const onScroll=()=>{if(window.scrollY>32)setCollapsed(true)};window.addEventListener('scroll',onScroll,{passive:true});onScroll();return()=>window.removeEventListener('scroll',onScroll)},[]);
  const hero = list[index % list.length] || items[0];
  if (!hero) return null;
  return (
    <section
      className={"hero spotlight"+(collapsed?" spotlight-collapsed":"")}
      aria-roledescription="carousel"
      aria-label="Featured titles"
      onMouseEnter={() => setHold(true)}
      onMouseLeave={() => setHold(false)}
      onFocusCapture={() => setHold(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setHold(false);
      }}
    >
      <div
        key={hero.id}
        className="heroscene"
      >
        <Artwork item={hero} kind="background" preferred={hero.backdrop_path?.startsWith("/") ? "https://image.tmdb.org/t/p/original"+hero.backdrop_path : undefined} loading="eager" className="herobackdrop"/>
        <div className="heroshade"/>
        <div className="herocopy">
          <span className="eyebrow">
            <span />
            IN THE SPOTLIGHT
          </span>
          <div className="titlemark"><h1>{hero.name}</h1><Artwork item={hero} kind="logo" loading="eager" className="herologo"/></div>
          <div className="metadata">
            <span className="rating">★ {hero.imdbRating || "FEATURED"}</span>
            <span>{hero.releaseInfo || hero.year}</span>
            <span>{hero.genres?.slice(0, 2).join(" • ")}</span>
          </div>
          <p>{hero.description || "Your next great watch starts here."}</p>
          <div className="actions">
            <button
              className="primary"
              onClick={() => (hero.type === "series" ? open(hero) : play(hero))}
            >
              <Play size={18} fill="currentColor" />
              Watch now
            </button>
            <button className="glass" onClick={() => open(hero)}>
              More details
              <ChevronRight size={17} />
            </button>
            <button
              className="glass icon"
              aria-label="Add spotlight to library"
              onClick={() => toggleLibrary(hero)}
            >
              <Plus />
            </button>
          </div>
        </div>
      </div>
      <div className="herobottom">
        <span>
          {String(index + 1).padStart(2, "0")} <em>/ YOUR NEXT GREAT WATCH</em>
        </span>
        <div className="heronav">
          <button
            className="glass icon"
            aria-label="Previous featured title"
            disabled={list.length < 2}
            onClick={() => setIndex((i) => (i - 1 + list.length) % list.length)}
          >
            <ChevronLeft size={18} />
          </button>
          <div className="herodots">
            {list.map((i: any, n: number) => (
              <button
                key={i.id}
                aria-label={"Show " + i.name}
                aria-current={n === index}
                onClick={() => setIndex(n)}
              />
            ))}
          </div>
          <button
            className="glass icon"
            aria-label="Next featured title"
            disabled={list.length < 2}
            onClick={() => setIndex((i) => (i + 1) % list.length)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </section>
  );
}
export function ContinueRow({ recent, play, open, remove }: any) {
  const [expanded, setExpanded] = useState(false);
  if (!recent.length) return null;
  const cards = recent.map((p: any) => (
    <div className="continuewrap" key={p.item.id + ":" + p.vid}>
      <button
        className="continue"
        onClick={() => p.newEpisode ? open(p.item,p.video?.season) :
          play(
            p.item,
            p.video ||
              p.item.videos?.find((v: any) => v.id === p.vid) ||
              (p.vid && p.vid !== p.item.id ? { id: p.vid } : undefined),
          )
        }
      >
        <Artwork item={p.item} kind="background" preferred={p.video?.thumbnail}/>
        <div className="continuecopy">
          <Play size={22} />
          <b>{p.item.name}</b>
          <small>
            {p.video ? `S${p.video.season} · E${p.video.episode} — ` : ""}
            {p.newEpisode ? "New episode" : p.caughtUp ? (p.item.type==="series"?"Caught up":"Watched") : p.upNext ? "Up next" : Math.floor(p.position / 60)+" min watched"}
          </small>
        </div>
        <progress max={p.duration || 1} value={p.position} />
      </button>
      <button
        className="removecontinue"
        aria-label={"Remove " + p.item.name + " from continue watching"}
        onClick={() => remove(p.item)}
      >
        <X size={16} />
      </button>
    </div>
  ));
  return (
    <section className="section">
      <div className="sectionhead">
        <h2>
          Pick up where you left off<span>.</span>
        </h2>
        <button className="textbutton" onClick={() => setExpanded((x) => !x)}>
          {expanded ? "Show less" : "See all"} <ChevronRight size={16} />
        </button>
      </div>
      {expanded ? (
        <div className="continueall">{cards}</div>
      ) : (
        <Rail label="continue watching" className="continuerail">
          {cards}
        </Rail>
      )}
    </section>
  );
}
export function CatalogRow({ row, open }: any) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false),
    [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const o = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), {
      rootMargin: "250px",
    });
    if (ref.current) o.observe(ref.current);
    return () => o.disconnect();
  }, []);
  useEffect(() => { if (visible && !row.loaded && !row.loading) void row.load?.(); }, [visible,row.url,row.loaded]);
  const cards =
    visible &&
    (expanded ? row.items : row.items.slice(0,40)).map((i: any) => (
      <button className="poster" key={i.type + i.id} onClick={() => open(i)}>
        <div className="posterimage">
          <Artwork item={i}/>
        </div>
        <b>{i.name}</b>
        <small>{i.year || i.releaseInfo}</small>

      </button>
    ));
  if(row.loaded && !row.loading && !row.error && !row.items.length&&!row.showEmpty)return null;
  return (
    <section className="section catalogrow" ref={ref}>
      <div className="sectionhead">
        <h2>{row.name}</h2>
        <button className="textbutton" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show less" : "See all"}
          <ChevronRight size={16} />
        </button>
      </div>
      {visible && (!row.loaded || row.loading) && !row.items.length && <div className="catalogstatus">Loading catalog…</div>}
      {visible && row.error && <button className="glass" onClick={()=>{row.loaded=false;void row.load();}}>Retry this catalog</button>}
      {visible && row.loaded && !row.loading && !row.error && !row.items.length && <div className="catalogstatus">{row.view==='weekly'?'No new anime premieres in these catalog pages this week.':'No titles in these catalog pages yet.'}</div>}
      {expanded ? (
        <div className="catalogexpanded">{cards}</div>
      ) : (
        <Rail label={row.name} className="catalogstrip">
          {cards}
        </Rail>
      )}
      {expanded && row.pageable && !row.exhausted && <button className="glass" disabled={row.loading} onClick={()=>row.load(true)}>{row.loading ? "Loading…" : "Load more"}</button>}
    </section>
  );
}

