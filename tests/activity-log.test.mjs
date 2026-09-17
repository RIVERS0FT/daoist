import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createInitialState, resolveEventChoice, runAction } = require('../.test-dist/engine.js');
const { EVENT_MAP } = require('../.test-dist/content.js');
const { createSession, beginExploration, fallbackExploration, receiveGeneratedScene, resolveScene, migrateSession } = require('../.test-dist/play.js');
const scene = {
  title: '街角的新委托', description: '路旁的摊主正在整理纸箱，请你帮忙查看街角留下的几只纸鹤。',
  choices: [
    { label: '记下纸鹤的位置', result: '你记下了纸鹤的位置，再回到熟悉的街道。', approach: 'observe' },
    { label: '先回去休息', result: '你在长椅上歇了一会儿，没有继续调查。', approach: 'rest' },
  ],
};

test('ordinary actions and authored choices write to the existing bounded world log', () => {
  const original = createInitialState(123);
  const rested = runAction(original, 'rest');
  assert.ok(rested.log.some((entry) => entry.text.includes('休息一小时')));
  const event = EVENT_MAP.get('old-lady-1');
  const choice = event.choices.find((item) => !item.requires && !item.relationshipRequires);
  const waiting = { ...rested, pendingEventId: event.id };
  const resolved = resolveEventChoice(waiting, choice.id);
  assert.equal(resolved.pendingEventId, null);
  assert.ok(resolved.log[0].text.includes(choice.label));
  assert.ok(resolved.log[0].text.includes(choice.result));
  assert.equal(resolveEventChoice(resolved, choice.id), resolved);
  assert.deepEqual(original.log.length, 1);
});

for (const mode of ['classic', 'generative']) {
  test(`${mode}: a scene, choice and result are recorded once without losing internal story memory`, () => {
    const started = beginExploration(createSession(123, mode), 'city');
    const opened = mode === 'classic' ? fallbackExploration(started) : receiveGeneratedScene(started, started.play.pending.id, scene);
    assert.ok(opened.play.scene);
    const id = opened.play.scene.id, choice = opened.play.scene.choices[0];
    assert.equal(opened.game.log.filter((entry) => entry.id === `${id}-scene`).length, 1);
    assert.equal(fallbackExploration(opened), opened);
    assert.equal(receiveGeneratedScene(opened, id, scene), opened);
    const resolved = resolveScene(opened, choice.id);
    const logs = resolved.game.log.filter((entry) => entry.id === `${id}-result`);
    assert.equal(logs.length, 1);
    assert.ok(logs[0].text.includes(choice.label));
    assert.ok(logs[0].text.includes(choice.result));
    assert.equal(resolveScene(resolved, choice.id), resolved);
    assert.equal(resolved.play.history.length, 1);
    assert.equal(resolved.play.history[0].choice, choice.label);
    assert.deepEqual(migrateSession(JSON.parse(JSON.stringify(resolved))).game.log, resolved.game.log);
    assert.equal(createSession(123, mode).game.log.length, 1);
  });
}

test('restoring a pending AI request creates one labelled fallback event without paying twice', () => {
  const started = beginExploration(createSession(123, 'generative'), 'city');
  const restored = migrateSession(JSON.parse(JSON.stringify(started)));
  assert.equal(restored.game.minute, started.game.minute);
  assert.equal(restored.game.energy, started.game.energy);
  assert.match(restored.game.log[0].text, /人工回退奇遇/);
  assert.deepEqual(migrateSession(JSON.parse(JSON.stringify(restored))).game.log, restored.game.log);
});

test('old logs stay in their save, capped logs stay bounded, and UI has one history renderer', () => {
  const original = createSession(123);
  original.game.log = Array.from({ length: 80 }, (_, i) => ({ id: `old-${i}`, day: 1, minute: 420, text: `旧记录 ${i}` }));
  const loaded = migrateSession(JSON.parse(JSON.stringify(original)));
  assert.deepEqual(loaded.game.log, original.game.log);
  const next = fallbackExploration(beginExploration(loaded, 'city'));
  assert.equal(next.game.log.length, 80);
  for (const file of ['src/App.tsx', 'src/components/GamePanels.tsx', 'src/components/PlayModePanel.tsx']) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /JournalPanel|className="last-result"|className="scene-memories"|game\.log\[/);
  }
  assert.match(readFileSync('src/components/ActivityLog.tsx', 'utf8'), /state\.game\.log/);
});
