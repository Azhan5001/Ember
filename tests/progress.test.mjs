import test from 'node:test';import assert from 'node:assert/strict';import {mergeProgressState,continueItems,watchIndicator} from '../src/progress-state.mjs';
test('newer durable checkpoint survives a delayed full-state write',()=>{
 const newer={position:45,updatedAt:20};const merged=mergeProgressState({progress:{x:newer}},{progress:{x:{position:2,updatedAt:10}}});assert.equal(merged.progress.x,newer);
});
test('continue watching picks latest unfinished episode and preserves per-episode indicators',()=>{
 const item={id:'show',type:'series'};const progress={a:{item,vid:'a',position:20,duration:80,updatedAt:1},b:{item,vid:'b',position:40,duration:80,updatedAt:2}};
 assert.equal(continueItems(progress)[0].vid,'b');assert.equal(continueItems(progress).length,1);assert.equal(watchIndicator(progress.a).percent,25);
});

test('new releases lead the queue until opened and completed titles stay at the end',()=>{
 const first={id:'one',season:1,episode:1},second={id:'two',season:1,episode:2,released:'2026-01-15'};
 const series={id:'show',type:'series',videos:[first,second]};
 const progress={
  first:{item:series,vid:first.id,watched:true,updatedAt:Date.parse('2026-01-10')},
  active:{item:{id:'active',type:'movie'},position:10,duration:100,updatedAt:Date.parse('2026-01-18')},
  done:{item:{id:'done',type:'movie'},watched:true,updatedAt:Date.parse('2026-01-19')}
 };
 const before=continueItems(progress,Date.parse('2026-01-12'));
 assert.equal(before[0].item.id,'active');
 assert.equal(before.find(p=>p.item.id==='show').caughtUp,true);
 const after=continueItems(progress,Date.parse('2026-01-20'));
 assert.equal(after[0].newEpisode,true);
 assert.equal(after[0].vid,'two');
 assert.equal(after.at(-1).item.id,'done');
 progress.first.openedEpisode='two';
 assert.equal(continueItems(progress).some(p=>p.newEpisode),false);
});
