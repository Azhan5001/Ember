import test from 'node:test';import assert from 'node:assert/strict';import {CatalogCache} from '../src/catalog-cache.mjs';
test('revisiting Home reuses fresh results; explicit refresh fetches again',async()=>{
 const cache=new CatalogCache();let calls=0;const load=async()=>[{id:++calls}];
 assert.deepEqual(await cache.get('home',load),[{id:1}]);
 assert.deepEqual(await cache.get('home',load),[{id:1}]);assert.equal(calls,1);
 assert.deepEqual(await cache.get('home',load,true),[{id:2}]);
});
test('overlapping catalog requests share one in-flight operation',async()=>{
 const cache=new CatalogCache();let calls=0,release;const load=()=>{calls++;return new Promise(r=>release=r);};
 const a=cache.get('x',load),b=cache.get('x',load);await Promise.resolve();release([{id:'same'}]);
 assert.deepEqual(await a,await b);assert.equal(calls,1);
});
test('failed refresh retains stale metadata and permits a later retry',async()=>{
 const cache=new CatalogCache({ttl:-1});await cache.get('x',()=>['cached']);
 await assert.rejects(cache.get('x',()=>{throw Error('offline');}));assert.deepEqual(cache.peek('x'),['cached']);
 assert.deepEqual(await cache.get('x',()=>['back']),['back']);
});
