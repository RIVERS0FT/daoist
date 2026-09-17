import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const play = require('../.test-dist/play.js');
const content = require('../.test-dist/generation.js');
const { createGameStore } = require('../.test-dist/store.js');
const { availableEndings } = require('../.test-dist/endings.js');
const city = { title: '桥下的纸鹤', description: '纸鹤在同一块石砖上停留，路边的店主正在收拾东西。你可以先观察，也可以帮忙做一份小零工。', choices: [
  { label: '观察纸鹤落点', result: '你记下落点，没有贸然触碰任何东西。', approach: 'observe' },
  { label: '完成附近的一份零工', result: '你把货物送到街角，收到了约定的工钱。', approach: 'work' },
] };
const social = { title: '熟人的近况', description: '你们聊到最近的生活，决定先把眼前的小事做好，不急着改变这段关系。', choices: [
  { label: '认真听完对方的话', result: '你们慢慢说完了近况，都觉得轻松了一点。', approach: 'listen' },
  { label: '一起吃一顿热饭', result: '你们吃了一顿普通的饭，再各自回到日常。', approach: 'share-meal' },
] };
function started(focus = 'city') {
  let s = play.createSession(12345);
  s.play.mode = 'generative';
  if (focus === 'social') s.game.relationships.lin_xiaoman = { ...s.game.relationships.lin_xiaoman, met: true, route: 'friend' };
  return play.beginExploration(s, focus, focus === 'social' ? 'lin_xiaoman' : undefined, '遇见一段新的故事');
}
function generated(focus = 'city') { const s = started(focus); return play.receiveGeneratedScene(s, s.play.pending.id, focus === 'social' ? social : city); }
const snapshot = (store) => ({ version: 5, game: store.getState().game, play: store.getState().play });
async function storeWith(deps = {}, mode = 'classic') {
  const rows = new Map();
  const store = createGameStore({
    list: deps.list ?? (async () => structuredClone([...rows.values()])),
    save: async (slot, revision) => {
      await deps.save?.(slot, revision);
      const next = structuredClone({ ...slot, revision: (revision ?? 0) + 1 }); rows.set(slot.id, next); return next;
    },
    ...(deps.generate ? { generate: deps.generate } : {}), ...(deps.test ? { test: deps.test } : {}),
  });
  await store.getState().hydrate();
  if (mode !== null) await store.getState().newGame('测试仙途', mode);
  return store;
}
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }

test('mode is chosen at creation and no runtime switching API remains', () => {
  const s = play.createSession(12345), next = play.createSession(12345, 'generative');
  assert.equal(s.play.mode, 'classic'); assert.equal(next.play.mode, 'generative'); assert.deepEqual(s.game, next.game);
  assert.equal(play.switchMode, undefined);
});
test('v1 save migrates without losing money, time, flags or delivery progress', () => {
  const old = { ...play.createSession(42).game, version: 1, day: 18, minute: 920, money: 779, completedOrders: 36, flags: { old_coin: true } };
  delete old.relationships; delete old.endingId;
  const migrated = play.migrateSession(old);
  assert.equal(migrated.version, 5); assert.equal(migrated.play.mode, 'classic');
  for (const key of ['day', 'minute', 'money', 'completedOrders']) assert.equal(migrated.game[key], old[key]);
  assert.deepEqual(migrated.game.flags, old.flags); assert.equal(Object.keys(migrated.game.relationships).length, 5);
});
test('v2 save retains locked NPC routes and reached endings', () => {
  const old = play.createSession(42).game;
  old.relationships.lin_xiaoman.route = 'estranged'; old.endingId = 'city-lights'; old.gameOver = true;
  const migrated = play.migrateSession(old);
  assert.equal(migrated.game.relationships.lin_xiaoman.route, 'estranged');
  assert.equal(migrated.game.endingId, 'city-lights'); assert.equal(migrated.game.gameOver, true);
});
test('future/invalid saves are rejected rather than overwritten', () => {
  assert.equal(play.migrateSession({ version: 99 }), null);
  assert.equal(play.migrateSession(null), null);
  assert.equal(play.migrateSession({ version: 3, game: { version: 999 } }), null);
});
test('AI scene has local IDs, guaranteed exit and immutable costs', () => {
  const s = generated();
  assert.equal(s.play.scene.source, 'ai'); assert.equal(s.play.scene.id, 'encounter-1');
  assert.equal(s.play.scene.choices.at(-1).id, 'depart'); assert.equal(s.game.minute, 435);
  assert.equal(content.PROFILES.work.money, 0); assert.equal(content.PROFILES.work.gains.money, 12);
});
test('invalid model data cannot inject world values, route locks or execution', () => {
  const s = started();
  const invalid = [null, {}, { ...city, money: 9999 }, { ...city, flags: { instant_ending: true } }, { ...city, endingId: 'any' },
    { ...city, title: '<script>bad</script>' }, { ...city, description: 'x'.repeat(1201) },
    { ...city, choices: [city.choices[0]] }, { ...city, choices: [city.choices[0], city.choices[0]] },
    { ...city, choices: [{ ...city.choices[0], effects: [] }, city.choices[1]] },
    { ...city, choices: [{ ...city.choices[0], approach: 'set-romance' }, city.choices[1]] }];
  for (const raw of invalid) assert.equal(content.validateScene(raw, s.play.pending), null);
  const fallback = play.receiveGeneratedScene(s, s.play.pending.id, { ...city, flags: { changed: true } });
  assert.equal(fallback.play.scene.source, 'authored'); assert.deepEqual(fallback.game.flags, s.game.flags);
});
test('generated and authored scenes survive JSON save/load without rerolling', () => {
  for (const s of [generated(), play.fallbackExploration(started()), generated('social')]) {
    const restored = play.migrateSession(JSON.parse(JSON.stringify(s)));
    assert.deepEqual(restored.play.scene, s.play.scene); assert.equal(restored.game.seed, s.game.seed);
    assert.equal(restored.game.minute, s.game.minute);
  }
});
test('four provider options plus local exit survive save restoration', () => {
  const s = started(); const raw = { ...city, choices: [...city.choices, { label: '暂时休息一会', result: '你把紧绷的肩膀慢慢放松了下来。', approach: 'rest' }, { label: '调查墙边的痕迹', result: '你看清了残留的灵气纹路后退了回来。', approach: 'investigate' }] };
  const next = play.receiveGeneratedScene(s, s.play.pending.id, raw);
  assert.equal(next.play.scene.choices.length, 5);
  assert.deepEqual(play.migrateSession(JSON.parse(JSON.stringify(next))).play.scene, next.play.scene);
});
test('reload of an in-flight request falls back without a second time charge', () => {
  const s = started(), restored = play.migrateSession(JSON.parse(JSON.stringify(s)));
  assert.equal(restored.game.minute, 435); assert.equal(restored.game.energy, s.game.energy);
  assert.equal(restored.play.pending, null); assert.equal(restored.play.scene.source, 'authored');
});
test('choice is resolved exactly once and memories preserve the result', () => {
  const s = generated(), next = play.resolveScene(s, 'option-1');
  assert.equal(next.game.money, s.game.money + 12); assert.equal(next.game.minute, s.game.minute + 30);
  assert.equal(next.play.scene, null); assert.equal(next.play.history.length, 1);
  assert.strictEqual(play.resolveScene(next, 'option-1'), next);
});
test('unaffordable options do nothing and exit works even with negative cash', () => {
  const s = generated('social'); s.game.money = -10; s.game.energy = 0;
  assert.strictEqual(play.resolveScene(s, 'option-1'), s);
  const exit = play.resolveScene(s, 'depart'); assert.equal(exit.game.money, -10); assert.equal(exit.game.minute, s.game.minute + 5);
});
test('social scenes respect existing friendship and do not force romance or flags', () => {
  const s = generated('social'), next = play.resolveScene(s, 'option-0');
  assert.equal(next.game.relationships.lin_xiaoman.route, 'friend');
  assert.equal(next.game.relationships.lin_xiaoman.romance, 0);
  assert.equal(next.game.relationships.lin_xiaoman.trust, 1); assert.deepEqual(next.game.flags, s.game.flags);
});
test('unmet or estranged NPCs cannot be pulled into generated social stories', () => {
  const s = play.createSession(1);
  assert.strictEqual(play.beginExploration(s, 'social', 'lin_xiaoman'), s);
  s.game.relationships.lin_xiaoman.met = true; s.game.relationships.lin_xiaoman.route = 'estranged';
  assert.strictEqual(play.beginExploration(s, 'social', 'lin_xiaoman'), s);
});
test('ended games and existing events cannot start exploration', () => {
  const s = play.createSession(1); s.game.gameOver = true;
  assert.strictEqual(play.beginExploration(s, 'city'), s);
  s.game.gameOver = false; s.game.pendingEventId = 'ghost-order';
  assert.strictEqual(play.beginExploration(s, 'city'), s);
});
test('a fatal midnight prevents posthumous rewards', () => {
  let s = started(); s.game.day = 6; s.game.minute = 1435; s.game.money = 0; s.game.health = 1; s.game.energy = 10; s.game.rentDueDay = 7;
  s = play.receiveGeneratedScene(s, s.play.pending.id, city);
  const next = play.resolveScene(s, 'option-1');
  assert.equal(next.game.gameOver, true); assert.equal(next.game.money, 0); assert.equal(next.game.totalIncome, 0);
  assert.equal(next.play.scene, null);
});
test('minimal generation context omits the save, log, endpoint and wallet', () => {
  const s = started(); s.game.flags.secret = 'do-not-send'; s.game.log[0].text = 'private-log';
  const payload = JSON.stringify(play.generationPayload(s));
  assert.ok(!payload.includes('do-not-send')); assert.ok(!payload.includes('private-log')); assert.ok(!payload.includes('money'));
  assert.ok(payload.includes('遇见一段新的故事'));
});
test('mode alone cannot alter available endings', () => {
  const s = play.createSession(1); s.game.day = 30;
  assert.deepEqual(availableEndings(s.game), availableEndings({ ...play.createSession(1, 'generative').game, day: 30 }));
  assert.ok(availableEndings(s.game).length > 0);
});
test('classic store never invokes AI, including after event choices', async () => {
  let calls = 0; const store = await storeWith({ generate: async () => { calls++; return { ok: true, data: city }; }, test: async () => { calls++; return { ok: true, data: null }; } });
  await store.getState().explore('city'); store.getState().chooseEvent('depart'); store.getState().act('rest'); await store.getState().testAi();
  assert.equal(calls, 0); assert.equal(store.getState().play.mode, 'classic');
});
test('returning to the menu cancels AI, saves fallback, and ignores late data', async () => {
  const wait = deferred(), store = await storeWith({ generate: () => wait.promise }, 'generative');
  const running = store.getState().explore('city');
  await store.getState().returnToStart(); const expected = structuredClone(snapshot(store));
  wait.resolve({ ok: true, data: city }); await running;
  assert.deepEqual(snapshot(store), expected); assert.equal(expected.game.minute, 435);
  assert.equal(expected.play.scene.source, 'authored'); assert.equal(expected.play.mode, 'generative');
  assert.equal(store.getState().screen, 'start');
});
test('a new slot cannot receive a previous slot response even when encounter IDs repeat', async () => {
  const wait = deferred(), store = await storeWith({ generate: () => wait.promise }, 'generative');
  const oldId = store.getState().activeSlotId, running = store.getState().explore('city');
  await store.getState().returnToStart(); await store.getState().newGame('新的经典仙途', 'classic');
  const expected = structuredClone(snapshot(store));
  wait.resolve({ ok: true, data: city }); await running; assert.deepEqual(snapshot(store), expected);
  assert.notEqual(store.getState().activeSlotId, oldId); assert.equal(store.getState().slots.length, 2);
});
test('double click cannot duplicate requests or exploration charges', async () => {
  const wait = deferred(); let calls = 0;
  const store = await storeWith({ generate: () => { calls++; return wait.promise; } }, 'generative');
  const running = store.getState().explore('city');
  await store.getState().explore('city'); store.getState().act('sleep'); store.getState().chooseEnding('city-lights');
  assert.equal(calls, 1); assert.equal(store.getState().game.minute, 435);
  wait.resolve({ ok: true, data: city }); await running; assert.equal(store.getState().play.scene.source, 'ai');
});
test('service failure is playable without retries and does not change locked mode', async () => {
  let calls = 0; const store = await storeWith({ generate: async () => { calls++; throw new Error('down'); } }, 'generative');
  await store.getState().explore('city'); assert.equal(store.getState().aiStatus, 'fallback');
  assert.equal(store.getState().play.scene.source, 'authored'); assert.equal(store.getState().play.mode, 'generative');
  store.getState().chooseEvent('depart'); assert.equal(store.getState().game.minute, 440); assert.equal(calls, 1);
});
test('writes are serialized per slot and relay tokens never enter saved data', async () => {
  const written = []; let active = 0, maxActive = 0;
  const store = await storeWith({ save: async (value) => { active++; maxActive = Math.max(active, maxActive); await new Promise((r) => setTimeout(r, 1)); written.push(structuredClone(value)); active--; } }, 'generative');
  store.getState().configureAi({ endpoint: 'https://relay.example/narrative', consent: true }, 'secret-relay-password');
  store.getState().act('upgrade-bike-speed'); store.getState().act('upgrade-bike-battery');
  await store.getState().returnToStart(); await store.getState().newGame('新存档', 'classic');
  assert.equal(maxActive, 1); assert.equal(written.at(-1).session.game.minute, 420); assert.ok(!JSON.stringify(written).includes('secret-relay-password'));
  const first = store.getState().slots.find((slot) => slot.id !== store.getState().activeSlotId);
  assert.equal(first.session.game.bike.speed, 1); assert.equal(first.session.game.bike.battery, 1);
});
test('unreadable slots remain protected while new games use independent IDs', async () => {
  const written = [], bad = { version: 1, id: 'future', name: 'Future', createdAt: 0, updatedAt: 0, revision: 1, session: null, error: 'future version' };
  const store = await storeWith({ list: async () => [bad], save: async (value) => { written.push(value); } }, null);
  await store.getState().openSlot('future'); assert.equal(store.getState().screen, 'start'); assert.equal(written.length, 0);
  store.getState().act('sleep'); await store.getState().explore('city'); assert.equal(written.length, 0);
  await store.getState().newGame('新一世', 'classic'); assert.equal(written.length, 1); assert.notEqual(written[0].id, 'future');
});
test('no gameplay or network request is permitted before choosing a save', async () => {
  let calls = 0; const store = await storeWith({ generate: async () => { calls++; } }, null);
  const before = snapshot(store); store.getState().act('accept-order'); await store.getState().explore('city'); await store.getState().testAi();
  assert.deepEqual(snapshot(store), before); assert.equal(calls, 0); assert.equal(store.getState().setMode, undefined);
});
test('multiple slots preserve distinct modes, vehicle levels and money after switching', async () => {
  const store = await storeWith(), firstId = store.getState().activeSlotId;
  store.getState().act('upgrade-bike-speed'); await store.getState().returnToStart();
  await store.getState().newGame('AI仙途', 'generative'); assert.equal(store.getState().game.bike.speed, 0);
  assert.equal(store.getState().game.money, 1263); await store.getState().returnToStart();
  await store.getState().openSlot(firstId); assert.equal(store.getState().play.mode, 'classic');
  assert.equal(store.getState().game.bike.speed, 1); assert.equal(store.getState().game.money, 1083);
  assert.equal(store.getState().slots.length, 2);
});
test('save failure keeps the current game and never silently leaves unsaved progress', async () => {
  const store = await storeWith({ save: async (_slot, revision) => { if (revision !== null) throw new Error('disk full'); } });
  store.getState().act('upgrade-bike-speed'); await store.getState().flushSaves();
  assert.equal(store.getState().saveStatus, 'error'); await store.getState().returnToStart();
  assert.equal(store.getState().screen, 'playing'); assert.equal(store.getState().game.bike.speed, 1);
  await store.getState().returnToStart(true); assert.equal(store.getState().screen, 'start');
  assert.equal(store.getState().slots[0].session.game.bike.speed, 0);
});
test('creation double click cannot duplicate a slot', async () => {
  const store = await storeWith({}, null), first = store.getState().newGame('一', 'classic');
  await store.getState().newGame('二', 'generative'); await first; assert.equal(store.getState().slots.length, 1);
  assert.equal(store.getState().play.mode, 'classic');
});
test('200 exploration cycles retain bounded state and memory', () => {
  let s = play.createSession(7654);
  for (let i = 0; i < 200; i++) {
    s.game = { ...s.game, energy: 100, health: 100, money: 5000, gameOver: false };
    s = play.fallbackExploration(play.beginExploration(s, i % 2 ? 'city' : 'cultivation'));
    s = play.resolveScene(s, 'depart');
    assert.ok(s.game.minute >= 0 && s.game.minute < 1440); assert.ok(s.play.history.length <= 12); assert.ok(s.game.log.length <= 80);
  }
  assert.equal(s.play.sequence, 200); assert.equal(s.play.history.length, 12);
});

test('cultivation store commands share pending scene locks and cannot double-consume a saved trial stage', async () => {
  const store=await storeWith();store.getState().cultivate({type:'train'});store.getState().cultivate({type:'train'});await store.getState().flushSaves();
  assert.equal(store.getState().game.cultivation.manuals.breath,8);
  await store.getState().explore('city');const before=snapshot(store);store.getState().cultivate({type:'train'});assert.deepEqual(snapshot(store),before);
});
test('a blocked autosave keeps cultivation in memory and blocks further costly commands', async () => {
  const store=await storeWith({save:async (_slot,rev)=>{if(rev!==null)throw new Error('full');}});
  store.getState().cultivate({type:'train'});await store.getState().flushSaves();const before=snapshot(store);
  store.getState().cultivate({type:'train'});assert.deepEqual(snapshot(store),before);assert.equal(store.getState().saveStatus,'error');
});
