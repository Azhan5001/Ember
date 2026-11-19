import React,{useState} from 'react';
export default function GenreFilter({options,selected,onChange}:{options:string[];selected:string[];onChange:(values:string[])=>void}){
 const [expanded,setExpanded]=useState(false),[query,setQuery]=useState('');
 const list=expanded?options.filter(g=>g.toLocaleLowerCase().includes(query.toLocaleLowerCase())):options;
 return <><div className="genreheading"><h3>Genres and tags</h3><button className="textbutton" aria-expanded={expanded} onClick={()=>{setExpanded(!expanded);setQuery('')}}>{expanded?'Show less':'Show more'}</button></div>
 {expanded&&<input className="genresearch" aria-label="Search genres and tags" placeholder="Search genres and tags…" value={query} onChange={e=>setQuery(e.target.value)}/>}
 <div className={'filterchips genrechips '+(expanded?'expanded':'collapsed')} tabIndex={expanded?0:undefined} aria-label="Genre choices"><button aria-pressed={!selected.length} onClick={()=>onChange([])}>All genres</button>{list.map(g=><button key={g} aria-pressed={selected.includes(g)} onClick={()=>onChange(selected.includes(g)?selected.filter(x=>x!==g):[...selected,g])}>{g}</button>)}{!list.length&&<p>No matching tags.</p>}</div></>;
}
