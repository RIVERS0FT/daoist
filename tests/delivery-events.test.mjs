import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { DELIVERY_CHOICE_EVENTS } = require('../.test-dist/deliveryEvents.js');
const { EVENT_MAP } = require('../.test-dist/content.js');
const { createInitialState, resolveEventChoice } = require('../.test-dist/engine.js');

test('delivery choice event pool contains varied three-option authored events', () => {
  assert.ok(DELIVERY_CHOICE_EVENTS.length >= 12);
  const ids = new Set();
  for (const event of DELIVERY_CHOICE_EVENTS) {
    assert.equal(event.contexts.includes('delivery'), true, event.id);
    assert.ok(event.choices.length >= 3, event.id);
    assert.equal(new Set(event.choices.map((choice) => choice.id)).size, event.choices.length, event.id);
    assert.ok(event.description.length >= 20, event.id);
    assert.equal(ids.has(event.id), false, event.id);
    ids.add(event.id);
  }
});

test('new delivery events are registered in the canonical event map', () => {
  for (const event of DELIVERY_CHOICE_EVENTS) assert.strictEqual(EVENT_MAP.get(event.id), event);
});

test('delivery choice outcomes are distinct and settle only the selected branch', () => {
  const game = createInitialState(1234);
  game.pendingEventId = 'delivery-wrong-building';
  const originalMinute = game.minute;
  const originalEnergy = game.energy;
  const originalReputation = game.reputation;

  const redeliver = resolveEventChoice(game, 'redeliver');
  assert.equal(redeliver.pendingEventId, null);
  assert.equal(redeliver.minute, originalMinute + 15);
  assert.equal(redeliver.energy, originalEnergy - 4);
  assert.equal(redeliver.reputation, originalReputation + 2);

  const halfwaySource = { ...game, pendingEventId: 'delivery-wrong-building' };
  const halfway = resolveEventChoice(halfwaySource, 'meet-halfway');
  assert.equal(halfway.minute, originalMinute + 7);
  assert.equal(halfway.energy, originalEnergy);
  assert.equal(halfway.reputation, originalReputation + 1);

  const platformSource = { ...game, pendingEventId: 'delivery-wrong-building' };
  const platform = resolveEventChoice(platformSource, 'platform');
  assert.equal(platform.minute, originalMinute + 4);
  assert.equal(platform.stress, game.stress + 4);
});

test('resource-gated delivery choice cannot spend money it does not have', () => {
  const game = createInitialState(5678);
  game.pendingEventId = 'delivery-leaking-soup';
  game.money = 5;
  const blocked = resolveEventChoice(game, 'compensate');
  assert.ok(blocked.pendingEventId);
  assert.equal(blocked.money, 5);
  assert.ok(blocked.log[0].text.includes('无法选择'));

  const affordable = { ...game, money: 12, pendingEventId: 'delivery-leaking-soup' };
  const paid = resolveEventChoice(affordable, 'compensate');
  assert.equal(paid.pendingEventId, null);
  assert.equal(paid.money, 0);
  assert.equal(paid.reputation, affordable.reputation + 1);
});

test('night anomaly choices can reveal clues without forcing the risky path', () => {
  const game = createInitialState(9012);
  game.minute = 22 * 60;
  game.completedOrders = 9;
  game.pendingEventId = 'delivery-three-doors';

  const careful = resolveEventChoice(game, 'mark');
  assert.equal(careful.flags.three_doors_solved, true);
  assert.equal(careful.insight, game.insight + 2);
  assert.equal(careful.qi, game.qi + 3);

  const waitSource = { ...game, pendingEventId: 'delivery-three-doors' };
  const waited = resolveEventChoice(waitSource, 'wait');
  assert.equal(waited.flags.three_doors_solved, undefined);
  assert.equal(waited.insight, game.insight + 1);
  assert.equal(waited.darkQi, game.darkQi);
});

test('zhou delivery event is eligible only after meeting him and preserves route', () => {
  const event = EVENT_MAP.get('delivery-zhou-battery');
  const game = createInitialState(3456);
  assert.equal(event.condition(game), false);
  game.relationships.zhou_ye = { ...game.relationships.zhou_ye, met: true, route: 'friend' };
  game.bikeBattery = 50;
  assert.equal(event.condition(game), true);

  game.pendingEventId = event.id;
  const next = resolveEventChoice(game, 'lend');
  assert.equal(next.relationships.zhou_ye.route, 'friend');
  assert.equal(next.relationships.zhou_ye.trust, game.relationships.zhou_ye.trust + 5);
  assert.equal(next.bikeBattery, 40);
});
