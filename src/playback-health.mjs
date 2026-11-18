// Range length is not evidence of a stall: live streams can expose tiny buffered ranges.
export function playbackHealth(previous, sample) {
 const reset=!previous || previous.slot!==sample.slot || sample.opening || sample.paused || sample.position!==previous.position;
 const progressedAt=reset?sample.now:previous.progressedAt;
 const age=Math.max(0,sample.now-progressedAt);
 const waiting=sample.waitingAt>0&&sample.now-sample.waitingAt>=650;
 return {slot:sample.slot,position:sample.position,progressedAt,
  buffering:!sample.paused&&!sample.opening&&(waiting?age>=650:age>=1800)};
}
export const mediaPosition=(start,local,rate=1)=>Math.max(0,(Number(start)||0)+(Number(local)||0)*rate);
export const localPosition=(absolute,start,rate=1)=>Math.max(0,(absolute-(Number(start)||0))/rate);
