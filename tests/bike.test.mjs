import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createInitialState, runAction, migrateGameState } = require('../.test-dist/engine.js');
const { createSession, migrateSession } = require('../.test-dist/play.js');
const { bikeStats, deliveryCosts, pushingCosts, ridingBlockReason, MAX_BIKE_LEVEL, BIKE_UPGRADES, upgradeCost } = require('../.test-dist/bike.js');
function delivery() {
  const s = createInitialState(5678);
  s.activeOrder = { id: 'test-order', merchant: '老王牛肉面', customer: '幸福家园', distanceKm: 5, reward: 30, estimatedMinutes: 40, acceptedAtDay: 1, acceptedAtMinute: 420, strange: false };
  return s;
}
test('zero battery blocks both accepting and riding without changing time, RNG, income or order', () => {
  for (const value of [0, 0.1]) {
    const s = delivery(); s.bikeBattery = value; const copy = structuredClone(s);
    assert.strictEqual(runAction(s, 'complete-order'), s); assert.deepEqual(s, copy);
  }
  const s = createInitialState(12); s.bikeBattery = 0;
  assert.strictEqual(runAction(s, 'accept-order'), s);
});
test('battery and durability must cover the entire ride; exact boundaries consume to zero', () => {
  for (const kind of ['battery', 'wear']) {
    const s = delivery(), cost = deliveryCosts(s.activeOrder, s.bike);
    if (kind === 'battery') s.bikeBattery = cost.battery - 0.1; else s.bike.condition = cost.wear - 0.1;
    assert.strictEqual(runAction(s, 'complete-order'), s); assert.ok(ridingBlockReason(s));
  }
  const s = delivery(), cost = deliveryCosts(s.activeOrder, s.bike);
  s.bikeBattery = cost.battery; s.bike.condition = cost.wear;
  const next = runAction(s, 'complete-order');
  assert.equal(next.bikeBattery, 0); assert.equal(next.bike.condition, 0); assert.equal(next.completedOrders, 1);
  assert.equal(next.money, s.money + s.activeOrder.reward); assert.equal(next.activeOrder, null);
  assert.strictEqual(runAction(next, 'complete-order'), next);
});
test('pushing is an explicit, slower stamina-paid recovery and never rides on empty', () => {
  const s = delivery(); s.bikeBattery = 0; s.bike.condition = 0;
  const cost = pushingCosts(s), next = runAction(s, 'push-order');
  assert.equal(next.minute, s.minute + cost.minutes); assert.equal(next.energy, s.energy - cost.energy);
  assert.equal(next.bikeBattery, 0); assert.equal(next.bike.condition, 0); assert.equal(next.completedOrders, 1);
  assert.equal(next.money, s.money + cost.income);
  s.energy = cost.energy - 1; assert.strictEqual(runAction(s, 'push-order'), s);
});
test('cancelling an unaffordable recovery does not require money or charge the vehicle', () => {
  const s = delivery(); s.money = 0; s.energy = 0; s.bikeBattery = 0;
  const next = runAction(s, 'cancel-order');
  assert.equal(next.activeOrder, null); assert.equal(next.minute, s.minute + 5); assert.equal(next.money, 0);
  assert.equal(next.completedOrders, 0); assert.equal(next.reputation, Math.max(0, s.reputation - 2));
});
test('speed upgrades affect active orders; efficiency and durability reduce real consumption', () => {
  const a = delivery(), b = structuredClone(a); b.bike.speed = 3; b.bike.efficiency = 3; b.bike.durability = 3;
  const original = runAction(a, 'complete-order'), upgraded = runAction(b, 'complete-order');
  assert.ok(upgraded.minute < original.minute); assert.ok(upgraded.bikeBattery > original.bikeBattery);
  assert.ok(upgraded.bike.condition > original.bike.condition); assert.equal(upgraded.money, original.money);
});
test('all upgrade axes have costs, time, level caps and no free battery or repair', () => {
  for (const item of BIKE_UPGRADES) {
    const s = createInitialState(99), cost = upgradeCost(s.bike, item.id);
    const next = runAction(s, `upgrade-bike-${item.id}`);
    assert.equal(next.bike[item.id], 1); assert.equal(next.money, s.money - cost); assert.equal(next.minute, s.minute + 45);
    assert.equal(next.bikeBattery, s.bikeBattery); assert.equal(next.bike.condition, s.bike.condition);
    s.money = cost - 1; assert.strictEqual(runAction(s, `upgrade-bike-${item.id}`), s);
    s.money = 50000; s.bike[item.id] = MAX_BIKE_LEVEL; assert.strictEqual(runAction(s, `upgrade-bike-${item.id}`), s);
  }
});
test('upgraded batteries fill and clamp at their real capacity, not 100', () => {
  const s = createInitialState(88); s.bike.battery = 3; s.bikeBattery = 0;
  const next = runAction(s, 'charge-bike'); assert.equal(next.bikeBattery, 220); assert.equal(next.money, s.money - 6);
  assert.strictEqual(runAction(next, 'charge-bike'), next);
  const restored = migrateGameState({ ...next, bikeBattery: 9999 }); assert.equal(restored.bikeBattery, 220);
});
test('repair recovers a broken upgraded vehicle and cannot overspend', () => {
  const s = createInitialState(88); s.bike.condition = 0; s.bike.durability = 2;
  const next = runAction(s, 'repair-bike'); assert.equal(next.bike.condition, 150); assert.equal(next.money, s.money - 45);
  assert.equal(next.minute, s.minute + 30); assert.strictEqual(runAction(next, 'repair-bike'), next);
  s.money = 44; assert.strictEqual(runAction(s, 'repair-bike'), s);
});
test('upgrade payments happen before crossing rent midnight', () => {
  const s = createInitialState(88); s.day = 6; s.minute = 1430; s.money = 180;
  const next = runAction(s, 'upgrade-bike-speed'); assert.equal(next.money, 0); assert.equal(next.bike.speed, 1); assert.equal(next.day, 7);
});
test('v1/v2/v3 saves acquire a base vehicle without losing progress, modes or memories', () => {
  for (const version of [1, 2, 3]) {
    const s = createSession(66, 'generative'); s.game.day = 21; s.game.money = 765; s.game.bikeBattery = 17;
    s.game.flags.kept = true; s.game.relationships.zhou_ye.route = 'close-friend'; delete s.game.bike;
    const raw = version === 3 ? { ...s, version: 3 } : { ...s.game, version };
    const next = migrateSession(raw); assert.equal(next.version, 5); assert.equal(next.game.day, 21); assert.equal(next.game.money, 765);
    assert.equal(next.game.bikeBattery, 17); assert.equal(next.game.bike.speed, 0); assert.equal(next.game.bike.condition, 100);
    assert.equal(next.game.relationships.zhou_ye.route, 'close-friend'); assert.equal(next.game.flags.kept, true);
    assert.equal(next.play.mode, version === 3 ? 'generative' : 'classic');
  }
});
test('v4 upgrades round-trip and future vehicle schemas are protected', () => {
  const s = createSession(99); s.game.bike = { version: 1, speed: 2, battery: 4, durability: 3, efficiency: 1, condition: 142 }; s.game.bikeBattery = 201;
  assert.deepEqual(migrateSession(JSON.parse(JSON.stringify(s))), s);
  s.game.bike.version = 99; assert.equal(migrateSession(s), null);
});
test('malformed upgrade numbers are bounded and never yield negative capacities', () => {
  const s = createInitialState(99); s.bike = { version: 1, speed: Infinity, battery: -8, durability: 500, efficiency: 5.9, condition: -3 };
  const next = migrateGameState(s); assert.equal(next.bike.speed, 0); assert.equal(next.bike.battery, 0); assert.equal(next.bike.durability, 5);
  assert.equal(next.bike.efficiency, 5); assert.equal(next.bike.condition, 0); assert.equal(bikeStats(next.bike).capacity, 100);
});
