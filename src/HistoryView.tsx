import React,{useEffect,useRef,useState} from 'react';
import {X,Trash2} from 'lucide-react';
import Artwork from './Artwork';
import {historyItems,titleKey} from './history-core.mjs';

export function HistoryView({history,open,onErase}:any) {
  const [filter,setFilter]=useState('all');
  const [search,setSearch]=useState('');
  const [target,setTarget]=useState<any>(undefined);
  const [keep,setKeep]=useState(false);
  const dialog=useRef<HTMLDialogElement>(null);
  const all:any[]=historyItems(history);
  const items=all.filter(h=>(filter==='all'||h.item.type===filter)&&h.item.name.toLowerCase().includes(search.toLowerCase()));
  useEffect(()=>{if(target!==undefined)dialog.current?.showModal();else dialog.current?.close();},[target]);
  function confirm(value:any){setKeep(false);setTarget(value);}
  return <section className="section historypage">
    <div className="sectionhead"><h1>Watch history<span>.</span></h1><button className="glass" disabled={!Object.keys(history||{}).length} onClick={()=>confirm(null)}><Trash2 size={18}/>Clear history</button></div>
    <p className="historyintro">Your viewing history shapes your recommendations. Movies appear after 5% watched; series appear after 5% of any one episode. Removing Continue Watching never removes history.</p>
    <div className="historyfilters"><label>Find a title<input aria-label="Search history" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search your history"/></label><label>Show<select aria-label="History type" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Movies and series</option><option value="movie">Movies</option><option value="series">Series</option></select></label><span>{all.length} titles</span></div>
    {items.length ? <div className="postergrid">{items.map(h=><div className="historycard" key={titleKey(h.item)}><button className="poster" onClick={()=>open(h.item)}><div className="posterimage"><Artwork item={h.item}/></div><b>{h.item.name}</b><small>{h.item.type==='series'?`${h.completedEpisodes} episodes watched`:`${Math.round(h.fraction*100)}% watched`} · {new Date(h.lastWatched).toLocaleDateString()}</small></button><button className="historyremove icon" aria-label={'Remove '+h.item.name+' from history'} onClick={()=>confirm(h)}><X size={16}/></button></div>)}</div> : <div className="empty"><h2>{all.length?'No matching titles':'Your story starts here'}</h2><p>{all.length?'Try another search or filter.':'Titles you watch from this update onward will appear here when they reach the thresholds above.'}</p></div>}
    <dialog className="historydialog" ref={dialog} onCancel={()=>setTarget(undefined)} aria-labelledby="history-confirm-title" aria-describedby="history-confirm-description"><h2 id="history-confirm-title">{target ? `Remove ${target.item.name}?` : 'Clear all watch history?'}</h2><p id="history-confirm-description">This will affect your recommendations and remove {target?'this title from':'all titles from'} Continue Watching. {target?'Its viewing history':'All viewing history, including partially watched titles'} will be deleted.</p><label className="settingline"><input type="checkbox" checked={keep} onChange={e=>setKeep(e.target.checked)}/>Keep Continue Watching</label><div className="actions"><button className="glass" autoFocus onClick={()=>setTarget(undefined)}>Cancel</button><button className="primary" onClick={()=>{onErase(keep,target?titleKey(target.item):null);setTarget(undefined);}}>Delete history</button></div></dialog>
  </section>;
}
