export function partyMedia(s){if(!s||s.item?.id==='ember:direct')return null;const {item,video,vid}=s;return {id:item.id,type:item.type,name:item.name,vid,season:video?.season||null,episode:video?.episode||null,title:video?.title||video?.name||null};}
export const mediaKey=m=>m?`${m.type}:${m.id}:${m.vid}`:'';
export function partyPosition(r,now){return r?Math.max(0,r.position+(!r.paused&&!r.waiting?Math.max(0,(now-Date.parse(r.anchor_at))/1000):0)):0;}
export function driftCorrection(actual,target,playing){return Number.isFinite(actual)&&Number.isFinite(target)&&Math.abs(target-actual)>0.650001?{seek:target,rate:1}:{seek:null,rate:1};}
