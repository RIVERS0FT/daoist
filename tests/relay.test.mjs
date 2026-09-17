import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRelayServer, sanitizeContext } from '../server/relay.mjs';
const token = 'test-only-relay-access-token-123456';
const origin = 'https://game.example';
const context = { focus: 'city', intent: '调查纸鹤', day: 1, minute: 435, weather: 'clear', realmLevel: 0, memories: [] };
const scene = { title: '巷口纸鹤', description: '纸鹤落在路边的旧石砖上，送货员正在搬东西，你停下脚步看了一会。', choices: [
  { label: '先观察纸鹤落点', result: '你记下了落点，没有急着做进一步的决定。', approach: 'observe' },
  { label: '接下附近的一份零工', result: '你完成约定的零工，收到了对方付的工钱。', approach: 'work' },
] };
async function setup(t, fetcher, config = {}) {
  const server = createRelayServer({ token, model: 'test-model', providerKey: 'test-provider-secret', baseUrl: 'https://provider.example/v1', origins: [origin], ...config }, fetcher);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}/narrative`;
  return (body, headers = {}) => fetch(url, { method: 'POST', headers: { origin, authorization: `Bearer ${token}`, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
}
const okProvider = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(scene) } }] }));

test('relay requires a separate access token and fixed safe upstream', () => {
  assert.throws(() => createRelayServer({ token: 'short', origins: [origin] }));
  assert.throws(() => createRelayServer({ token, origins: ['*'] }));
  assert.throws(() => createRelayServer({ token, origins: [origin], baseUrl: 'http://external.example/v1' }));
  assert.throws(() => createRelayServer({ token, origins: [origin], baseUrl: 'https://name:secret@provider.example/v1' }));
});
test('relay health check does not invoke the provider', async (t) => {
  let calls = 0; const post = await setup(t, async () => { calls++; return okProvider(); });
  const response = await post({ protocol: 1, type: 'health' });
  assert.equal(response.status, 200); assert.equal((await response.json()).ready, true); assert.equal(calls, 0);
});
test('bad Origin and missing authentication cannot spend provider tokens', async (t) => {
  let calls = 0; const post = await setup(t, async () => { calls++; return okProvider(); });
  assert.equal((await post({ protocol: 1, type: 'scene', context }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await post({ protocol: 1, type: 'scene', context }, { authorization: '' })).status, 401);
  assert.equal(calls, 0);
});
test('relay calls the configured provider and returns a validated generated scene', async (t) => {
  let request;
  const post = await setup(t, async (url, options) => { request = { url, options }; return okProvider(); });
  const response = await post({ protocol: 1, type: 'scene', context });
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { protocol: 1, scene });
  assert.equal(request.url, 'https://provider.example/v1/chat/completions');
  assert.equal(request.options.headers.authorization, 'Bearer test-provider-secret');
  assert.equal(request.options.redirect, 'error'); assert.ok(!request.options.body.includes(token));
});
test('relay rejects extra context and client-chosen upstream', async (t) => {
  assert.equal(sanitizeContext({ ...context, apiUrl: 'https://evil.example' }), null);
  const post = await setup(t, okProvider);
  assert.equal((await post({ protocol: 1, type: 'scene', context, upstream: 'http://127.0.0.1' })).status, 400);
  assert.equal((await post({ protocol: 1, type: 'scene', context: { ...context, memories: new Array(5).fill({ title: '', choice: '', result: '' }) } })).status, 400);
});
test('provider errors never reflect secrets to the browser', async (t) => {
  const post = await setup(t, async () => { throw new Error('test-provider-secret'); });
  const response = await post({ protocol: 1, type: 'scene', context });
  assert.equal(response.status, 502); assert.ok(!(await response.text()).includes('test-provider-secret'));
});
test('invalid generated effects and provider refusal fail closed', async (t) => {
  const post = await setup(t, async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ ...scene, effects: [{ money: 1000 }] }) } }] })));
  assert.equal((await post({ protocol: 1, type: 'scene', context })).status, 502);
});
test('relay enforces provider budgets without automatic retries', async (t) => {
  let calls = 0; const post = await setup(t, async () => { calls++; return okProvider(); }, { maxPerMinute: 1 });
  assert.equal((await post({ protocol: 1, type: 'scene', context })).status, 200);
  assert.equal((await post({ protocol: 1, type: 'scene', context })).status, 429); assert.equal(calls, 1);
});
