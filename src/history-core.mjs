// Viewing coverage is separate from resume position. Seeking and replaying a
// section cannot inflate the percentage watched.
export const titleKey = item => `${item.type}:${item.id}`;
export function mergeRanges(ranges, duration) {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const sorted = ranges.filter(r => Array.isArray(r) && r.length === 2 && r.every(Number.isFinite))
    .map(([a,b]) => [Math.max(0,a),Math.min(duration,b)]).filter(([a,b]) => b > a).sort((a,b) => a[0]-b[0]);
  const out = [];
  for (const r of sorted) {
    const last = out.at(-1);
    if (last && r[0] <= last[1] + .05) last[1] = Math.max(last[1],r[1]);
    else out.push([...r]);
  }
  return out;
}
export function playbackRange(previous, current, rate = 1) {
  if (!previous || !current) return [];
  const delta = current.position - previous.position, elapsed = (current.at - previous.at)/1000;
  return elapsed > 0 && elapsed <= 5 && delta > 0 && delta <= elapsed*Math.max(1,rate)+.75
    ? [[previous.position,current.position]] : [];
}
export function recordHistory(history = {}, event) {
  if (!event.item?.id || event.item.id === 'ember:direct' || !event.ranges?.length) return history;
  const key = titleKey(event.item), old = history[key];
  const episode = String(event.vid || event.item.id);
  const previous = old?.episodes?.[episode];
  const duration = Number(event.duration);
  const ranges = mergeRanges([...(previous?.ranges || []),...event.ranges],duration);
  if (!ranges.length) return history;
  const fraction = ranges.reduce((sum,[a,b])=>sum+b-a,0)/duration;
  const episodes = {...old?.episodes,[episode]:{ranges,duration,fraction,completed:fraction >= .90}};
  const count = Object.values(episodes).filter(e=>e.completed).length;
  const qualified = Object.values(episodes).some(e => e.fraction >= .05);
  const {videos,...item} = event.item;
  return {...history,[key]:{...old,item:{...old?.item,...item},episodes,
    qualifiedAt:old?.qualifiedAt || (qualified ? event.updatedAt : null),
    lastWatched:event.updatedAt,completedEpisodes:count,
    fraction:Math.max(old?.fraction || 0,fraction)}};
}
export const historyItems = history => Object.values(history || {}).filter(h=>h.qualifiedAt || Object.values(h.episodes || {}).some(e=>e.fraction >= .05)).sort((a,b)=>b.lastWatched-a.lastWatched);
/** @param {any} state @param {boolean} keepContinue @param {string|null} key */
export function eraseHistory(state, keepContinue = false, key = null) {
  const history = {...state.history};
  if (key) delete history[key];
  else for (const id of Object.keys(history)) delete history[id];
  const progress = keepContinue ? state.progress : Object.fromEntries(Object.entries(state.progress || {})
    .filter(([,p])=>key && titleKey(p.item)!==key));
  return {...state,history,progress,...(!keepContinue?{_progressDeleted:{...state._progressDeleted,...Object.fromEntries(Object.entries(state.progress||{}).filter(([,p])=>!key||titleKey(p.item)===key).map(([id])=>[id,Date.now()]))}}:{})};
}
