export function automaticSegment(segment, policy='community') {
  if (!segment || segment.match==='out-of-range') return false;
  if (segment.verified) return true;
  if (policy==='verified') return false;
  return segment.confidence == null || segment.confidence >= 0.6;
}
export function normalizeSegments(list,duration) {
  const ranked=list.map(x=>({...x,start:Number(x.start),end:Math.min(Number(x.end),duration)})).filter(x=>['intro','recap','outro'].includes(x.type)&&Number.isFinite(x.start)&&Number.isFinite(x.end)&&x.start>=0&&x.end>x.start&&x.start<duration&&x.match!=='out-of-range');
  const score=x=>(x.verified?10:0)+(x.match==='exact'?2:x.match==='shifted'?1:0)+(Number(x.confidence)||0);
  ranked.sort((a,b)=>score(b)-score(a));const seen=new Set();return ranked.filter(s=>{if(seen.has(s.type))return false;seen.add(s.type);return true;}).sort((a,b)=>a.start-b.start);
}
