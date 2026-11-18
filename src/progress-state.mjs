export function updateWatch(old, event) {
  if (old?.updatedAt > event.updatedAt) return old;
  return {
    ...old,
    ...event,
    watched:
      event.watched === false
        ? false
        : !!(
            old?.watched ||
            event.watched ||
            (event.duration > 0 && event.position / event.duration >= 0.90)
          ),
  };
}
export function mergeProgressState(stored, incoming) {
  const progress = { ...stored?.progress, ...incoming?.progress };
  for (const [id, old] of Object.entries(stored?.progress || {})) {
    const ownerChanged=incoming?._sync?.owner && incoming._sync.owner!==stored?._sync?.owner;
    const newRevision=incoming?._sync?.revisions?.['progress:'+id] || 0;
    const oldRevision=stored?._sync?.revisions?.['progress:'+id] || 0;
    if(ownerChanged || newRevision>oldRevision){if(!incoming?.progress?.[id])delete progress[id];continue;}
    if(!incoming?.progress?.[id] && newRevision>0){delete progress[id];continue;}
    if(old.updatedAt > (incoming?.progress?.[id]?.updatedAt || 0))progress[id]=old;
  }
  return { ...incoming, progress };
}
export function continueItems(progress, now=Date.now()) {
  const seen=new Set(), records=Object.values(progress||{}).filter(p=>p.item?.id).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
  return records.flatMap(p=>{
    const key=p.item.type+':'+p.item.id;if(seen.has(key))return [];seen.add(key);
    if(p.hidden)return [];
    if(!watchIndicator(p).watched && p.position>0)return [p];
    if(p.item.type!=='series')return [];
    const videos=(p.item.videos||[]).filter(v=>Number(v.season)>0).slice().sort((a,b)=>a.season-b.season||a.episode-b.episode);
    const index=videos.findIndex(v=>v.id===p.vid);if(index<0)return [];
    const next=videos.slice(index+1).find(v=>!watchIndicator(progress['series:'+v.id]).watched);
    if(!next || next.released&&Date.parse(next.released)>now)return [];
    const saved=progress['series:'+next.id];if(saved?.hidden)return [];
    return [{...p,...saved,item:p.item,video:next,vid:next.id,watched:false,position:saved?.position||0,duration:saved?.duration||0,upNext:!saved?.position,updatedAt:p.updatedAt}];
  });
}
export function watchIndicator(p) {
  return {
    watched: !!p?.watched || (p?.duration > 0 && p.position / p.duration >= .90),
    percent: p?.watched
      ? 0
      : Math.min(
          100,
          Math.max(0, (100 * (p?.position || 0)) / (p?.duration || 1)),
        ),
  };
}
