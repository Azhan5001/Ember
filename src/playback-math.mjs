export const finiteTime=n=>Number.isFinite(Number(n))?Math.max(0,Number(n)):0;
export function timelinePoint(x,left,width,duration){return width>0&&Number.isFinite(x)&&Number.isFinite(duration)&&duration>0?Math.max(0,Math.min(duration,(x-left)/width*duration)):null}
export function partyReady({loaded,opening,seeking,blocked,readyState,ahead,ended,stalled}){return !!loaded&&!opening&&!seeking&&!blocked&&!stalled&&readyState>=2}
export function subtitlePreferenceKey(item,sub){if(!sub)return '';const label=String(sub.title||sub.name||sub.filename||'').toLowerCase().replace(/s\d+e\d+|\b\d+x\d+\b|episode[ ._-]*\d+/g,'episode');return [item.type,item.id,sub.embedded?'embedded:'+sub.id:sub.provider||'file',sub.lang||'und',label].join('|')}
