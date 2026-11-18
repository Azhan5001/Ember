import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../web/_worker.js';

test('HTML and build metadata are revalidated after deploying a new release', async () => {
  for (const path of ['/', '/settings', '/ember-build.json']) {
    const env = {ASSETS:{fetch:async()=>new Response('0.7.1',{headers:{
      'Content-Type':path.endsWith('json')?'application/json':'text/html',
      'Cache-Control':'public, max-age=3600', ETag:'old'
    }})}};
    const response = await worker.fetch(new Request('https://ember.example'+path),env);
    assert.equal(response.headers.get('X-Ember-Build'),'0.7.1');
    assert.match(response.headers.get('Cache-Control'),/no-store/);
    assert.equal(response.headers.get('ETag'),null);
    assert.equal(await response.text(),'0.7.1');
  }
});
test('TorBox lookup still rejects missing credentials and foreign origins', async () => {
  const foreign = await worker.fetch(new Request('https://ember.example/api/torbox',{
    method:'POST', headers:{Origin:'https://elsewhere.example'},body:'{}'
  }),{});
  assert.equal(foreign.status,403);
  const missing = await worker.fetch(new Request('https://ember.example/api/torbox',{
    method:'POST',headers:{Origin:'https://ember.example'},body:'{}'
  }),{});
  assert.equal(missing.status,401);
});
