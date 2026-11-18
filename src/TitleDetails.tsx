import React,{useState,useEffect,useRef} from 'react';
import {Play,Plus,Check,X,CheckCircle2,Star,ExternalLink} from 'lucide-react';
import Artwork from './Artwork';
import {watchIndicator} from './progress-state.mjs';
import {plainText,trailerId} from './metadata-core.mjs';
const dateLabel=(raw:any)=>{const d=new Date(raw);return raw&&Number.isFinite(d.valueOf())?d.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}):'Release date unavailable'};
export default function TitleDetails({item,season,setSeason,progress,inLibrary,onLibrary,onPlay,onClose,openWebsite}:any){
 const dialog=useRef<HTMLElement>(null),closeRef=useRef(onClose);closeRef.current=onClose;
 useEffect(()=>{
  const oldFocus=document.activeElement as HTMLElement,overflow=document.body.style.overflow;document.body.style.overflow='hidden';
  dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
  const keyboard=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){e.preventDefault();closeRef.current();return;}
   if(e.key!=='Tab')return;
   const controls=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),select,a[href],iframe')||[]),first=controls[0],last=controls.at(-1);
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
  };
  window.addEventListener('keydown',keyboard);return()=>{document.body.style.overflow=overflow;window.removeEventListener('keydown',keyboard);oldFocus?.focus({preventScroll:true})};
 },[]);
 const [trailer,setTrailer]=useState(false),yt=trailerId(item);
 const episodes=(item.videos||[]).filter((v:any)=>Number(v.season)===season).sort((a:any,b:any)=>a.episode-b.episode);
 const seasons=[...new Set<number>((item.videos||[]).filter((v:any)=>Number(v.season)>0).map((v:any)=>Number(v.season)))].sort((a,b)=>a-b);
 const rating=item.imdbRating||item.rating, ratingSource=item.imdbRating?'IMDb':item.ratingProvider||'Rating';
 const votes=item.imdbRating?item.imdbVotes||item.imdbVoteCount:item.vote_count||item.votes;
 const imdb=String(item.imdb_id||item.id).match(/^tt\d+$/)?.[0];
 const resume=Object.values(progress).filter((p:any)=>p.item?.id===item.id&&!p.hidden&&!p.watched&&p.position>0).sort((a:any,b:any)=>b.updatedAt-a.updatedAt)[0] as any;
 const first=(item.videos||[]).find((v:any)=>v.season>0 && (!v.released||Date.parse(v.released)<=Date.now()));
 return <div className="overlay title-overlay" onClick={onClose}><article ref={dialog} className="detail title-details" role="dialog" aria-modal="true" aria-label={item.name} onClick={e=>e.stopPropagation()}>
  <div className="detailart"><Artwork item={item} kind="background" loading="eager"/></div>
  <button className="close icon" aria-label="Close details" onClick={onClose}><X/></button>
  <div className="detailbody"><span className="eyebrow">{item.type==='series'?'SERIES':'MOVIE'} · {item.releaseInfo||item.year||'Date unavailable'}</span>
  <h1>{item.name}</h1><div className="title-facts">{Number(rating)>0&&<span className="rating"><Star size={15} fill="currentColor"/><b>{Number(rating).toFixed(1)}</b> {ratingSource}{Number(String(votes).replaceAll(',',''))>0&&<small> · {Number(String(votes).replaceAll(',','')).toLocaleString()} ratings</small>}</span>}{[item.runtime,item.status,item.country,item.network].filter(Boolean).map((v:any)=><span key={String(v)}>{String(v)}</span>)}</div>
  <div className="tags">{item.genres?.map((g:string)=><span key={g}>{g}</span>)}</div>
  <p className="title-synopsis">{plainText(item.description)||'A synopsis is not available yet.'}</p>
  <div className="actions"><button className="primary" onClick={()=>onPlay(item,resume?.video||first)} disabled={item.type==='series'&&!first}><Play size={18} fill="currentColor"/>{resume?'Resume':'Play'}</button><button className="glass" onClick={()=>onLibrary(item)}>{inLibrary?<Check size={18}/>:<Plus size={18}/>}My library</button>{yt&&<button className="glass" onClick={()=>setTrailer(!trailer)}><Play size={18}/>{trailer?'Close trailer':'Watch trailer'}</button>}{imdb&&<button className="glass" onClick={()=>openWebsite(`https://www.imdb.com/title/${imdb}/`)}><ExternalLink size={16}/>IMDb & reviews</button>}</div>
  {trailer&&yt&&<div className="title-trailer"><iframe title={`${item.name} trailer`} src={window.ember?.trailerURL?.(yt)||`https://www.youtube.com/embed/${yt}?rel=0&playsinline=1&origin=${encodeURIComponent(location.origin)}`} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen/><button className="textbutton" onClick={()=>openWebsite(`https://www.youtube.com/watch?v=${yt}`)}>Open trailer on YouTube</button></div>}
  <dl className="title-credits">{[['Starring',item.cast?.slice(0,8)?.map(plainText)?.join(' · ')],['Director',item.director?.map(plainText)?.join(' · ')],['Language',item.language||item.original_language],['Awards',item.awards]].filter(([,v])=>v).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  {seasons.length>0&&<section className="detail-episodes"><div className="sectionhead"><div><span className="eyebrow">KEEP EXPLORING</span><h2>Episodes</h2></div><label>Season<select aria-label="Series season" value={season} onChange={e=>setSeason(Number(e.target.value))}>{seasons.map(n=><option key={n} value={n}>Season {n}</option>)}</select></label></div>
  <div className="episode-list">{episodes.map((v:any)=>{const p=progress[item.type+':'+v.id],indicator=watchIndicator(p),future=v.released&&Date.parse(v.released)>Date.now();return <button className="detail-episode" key={v.id} onClick={()=>onPlay(item,v)} disabled={!!future}>
    <div className="episode-art"><Artwork item={{...v,seriesId:item.id,series:item,type:item.type,name:v.title||v.name||item.name}} kind="thumbnail"/><span className="episode-play"><Play size={20} fill="currentColor"/></span>{indicator.percent>0&&<progress max={100} value={indicator.percent}/>}</div>
    <div className="episode-copy"><div className="episode-kicker"><span>EPISODE {v.episode}</span>{indicator.watched&&<span className="watchedbadge"><CheckCircle2 size={13}/>Watched</span>}</div><h3>{v.title||v.name||`Episode ${v.episode}`}</h3><div className="episode-facts"><time>{dateLabel(v.released||v.firstAired)}</time>{Number(v.rating)>0&&<span>★ {Number(v.rating).toFixed(1)}{v.ratingProvider?' · '+v.ratingProvider:''}</span>}{p?.position>0&&!indicator.watched&&<span>{Math.round(indicator.percent)}% watched</span>}{future&&<span>Upcoming</span>}</div><p>{plainText(v.description||v.overview)||'Episode synopsis unavailable.'}</p></div>
  </button>})}</div></section>}
  {item.metadataSource&&<p className="metadata-credit">Additional series and episode data: <button className="textbutton" onClick={()=>openWebsite(item.metadataSource)}>TVmaze · CC BY-SA</button></p>}
  </div></article></div>;
}
