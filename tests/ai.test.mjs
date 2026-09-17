import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { requestScene, testAiConnection, normalizeRelayEndpoint, RequestGate } = require('../.test-dist/ai.js');
const { createSession, beginExploration } = require('../.test-dist/play.js');
const settings = { endpoint: 'https://relay.example/narrative', consent: true };
const signal = () => new AbortController().signal;
function session() { const s = createSession(7); s.play.mode = 'generative'; return beginExploration(s, 'city'); }

test('classic mode guards all AI adapter entry points', async () => {
  let calls = 0; const spy = async () => { calls++; throw new Error('must not fetch'); };
  await requestScene(createSession(7), settings, '', signal(), spy);
  await testAiConnection('classic', settings, '', signal(), spy); assert.equal(calls, 0);
});
test('missing endpoint or consent makes zero requests', async () => {
  let calls = 0; const spy = async () => { calls++; throw new Error('must not fetch'); };
  await requestScene(session(), { ...settings, endpoint: '' }, '', signal(), spy);
  await requestScene(session(), { ...settings, consent: false }, '', signal(), spy); assert.equal(calls, 0);
});
test('unsafe URLs and embedded secrets are rejected', () => {
  for (const url of ['http://external.example/narrative', 'javascript:alert(1)', '/relative', 'https://name:password@relay.example', 'https://relay.example?key=secret', 'https://relay.example#key']) assert.throws(() => normalizeRelayEndpoint(url));
  assert.equal(normalizeRelayEndpoint('http://127.0.0.1:8787/narrative'), 'http://127.0.0.1:8787/narrative');
});
test('HTTP errors, malformed responses and legacy narration are not AI success', async () => {
  for (const response of [new Response('{}', { status: 429 }), new Response('not-json'), new Response(JSON.stringify({ text: 'legacy-only' })), new Response('x'.repeat(40000))]) {
    const result = await requestScene(session(), settings, '', signal(), async () => response); assert.equal(result.ok, false);
  }
});
test('client request is minimal, refuses redirects and omits browser credentials', async () => {
  let options;
  const result = await requestScene(session(), settings, 'relay-only-token', signal(), async (_url, init) => { options = init; return new Response(JSON.stringify({ protocol: 1, scene: {} })); });
  assert.equal(result.ok, true); assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
  assert.equal(options.referrerPolicy, 'no-referrer'); assert.equal(options.headers.authorization, 'Bearer relay-only-token');
  assert.ok(!options.body.includes('relay-only-token')); assert.ok(!options.body.includes('relationships'));
});
test('timeout aborts a hanging request instead of freezing gameplay', async () => {
  const result = await requestScene(session(), settings, '', signal(), async (_url, { signal: s }) => new Promise((_resolve, reject) => s.addEventListener('abort', () => reject(new Error('aborted')), { once: true })), 5);
  assert.equal(result.ok, false); assert.match(result.error, /超时|取消/);
});
test('health check validates capabilities and readiness', async () => {
  const bad = await testAiConnection('generative', settings, '', signal(), async () => new Response(JSON.stringify({ protocol: 1, ready: false, capabilities: ['scene-v1'] })));
  assert.equal(bad.ok, false);
  const good = await testAiConnection('generative', settings, '', signal(), async () => new Response(JSON.stringify({ protocol: 1, ready: true, capabilities: ['scene-v1'] })));
  assert.equal(good.ok, true);
});
test('request gate invalidates stale promises as well as aborting network', () => {
  const gate = new RequestGate(), a = gate.begin(), b = gate.begin();
  assert.equal(gate.current(a), false); assert.equal(a.signal.aborted, true); assert.equal(gate.current(b), true);
  gate.cancel(); assert.equal(gate.current(b), false);
});
