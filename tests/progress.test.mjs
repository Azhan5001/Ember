import test from 'node:test';import assert from 'node:assert/strict';import {mergeProgressState,continueItems,watchIndicator} from '../src/progress-state.mjs';
test('newer durable checkpoint survives a delayed full-state write',()=>{
 const newer={position:45,updatedAt:20};const merged=mergeProgressState({progress:{x:newer}},{progress:{x:{position:2,updatedAt:10}}});assert.equal(merged.progress.x,newer);
});
test('continue watching picks latest unfinished episode and preserves per-episode indicators',()=>{
 const item={id:'show',type:'series'};const progress={a:{item,vid:'a',position:20,duration:80,updatedAt:1},b:{item,vid:'b',position:40,duration:80,updatedAt:2}};
 assert.equal(continueItems(progress)[0].vid,'b');assert.equal(continueItems(progress).length,1);assert.equal(watchIndicator(progress.a).percent,25);
});
