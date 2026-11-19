import test from 'node:test';import assert from 'node:assert/strict';import {ratingSummary}from'../src/ratings-core.mjs';import worker from'../web/_worker.js';
test('IMDb addon scores, vote counts and review links are parsed without treating the result as video',()=>{
 assert.deepEqual(ratingSummary({streams:[{name:'IMDb Rating',description:'⭐ IMDb: 9.3/10\n(3,266,040 votes)',externalUrl:'https://www.imdb.com/title/tt0111161/'}]}),{score:9.3,votes:3266040,reviewUrl:'https://www.imdb.com/title/tt0111161/'});
 assert.equal(ratingSummary({streams:[{description:'Rating not available'}]}),null);
 assert.equal(ratingSummary({streams:[{description:'8.2/10 (45.2k votes)',externalUrl:'javascript:alert(1)'}]}).reviewUrl,'');
});
test('the trailer wrapper can be framed by Ember and sends its origin to YouTube',async()=>{
 const response=await worker.fetch(new Request('https://ember.example/trailer.html?id=idlLFNNpZiI'),{ASSETS:{fetch:async()=>new Response('trailer',{headers:{'X-Frame-Options':'DENY','Content-Type':'text/html'}})}});
 assert.equal(response.headers.get('X-Frame-Options'),'SAMEORIGIN');assert.equal(response.headers.get('Referrer-Policy'),'strict-origin-when-cross-origin');
});
