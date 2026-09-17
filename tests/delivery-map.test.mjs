import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createInitialState, runAction, advanceTime } = require('../.test-dist/engine.js');
const { createSession, migrateSession } = require('../.test-dist/play.js');
const { DELIVERY_PICKUPS, DELIVERY_DROPOFFS, initialPosition, normalizePosition, playerMapPoint, orderMapPoints } = require('../.test-dist/deliveryLocations.js');
function pending() {
  const s = createInitialState(5678), pickup = DELIVERY_PICKUPS[20], dropoff = DELIVERY_DROPOFFS[32];
  s.activeOrder = { id: 'atlas-test', merchant: pickup.name, customer: dropoff.name, pickupId: pickup.id, dropoffId: dropoff.id,
    distanceKm: 5, reward: 30, estimatedMinutes: 40, acceptedAtDay: 1, acceptedAtMinute: 420, strange: false };
  return s;
}
test('new orders use all 24 merchants and 40 destinations with deterministic saved IDs', () => {
  const merchants = new Set(), customers = new Set();
  for (let i = 1; i <= 1024; i++) {
    const s = createInitialState(Math.imul(i, 0x9e3779b1) >>> 0), a = runAction(s, 'accept-order'), b = runAction(s, 'accept-order');
    assert.deepEqual(a, b); assert.deepEqual(a.position, s.position);
    const order = a.activeOrder, points = orderMapPoints(order);
    assert.equal(order.merchant, points.pickup.name); assert.equal(order.customer, points.dropoff.name);
    assert.equal(order.pickupId, points.pickup.id); assert.equal(order.dropoffId, points.dropoff.id);
    assert.ok(order.distanceKm >= 1.2 && order.distanceKm <= 7.2);
    merchants.add(order.pickupId); customers.add(order.dropoffId);
  }
  assert.equal(merchants.size, 24); assert.equal(customers.size, 40);
});
test('only successful riding or explicit pushing commits the destination once', () => {
  for (const action of ['complete-order', 'push-order']) {
    const s = pending(), before = structuredClone(s), target = orderMapPoints(s.activeOrder).dropoff;
    if (action === 'push-order') { s.bikeBattery = 0; s.bike.condition = 0; }
    const next = runAction(s, action);
    assert.equal(next.position.locationId, target.id); assert.deepEqual(playerMapPoint(next.position), target);
    assert.equal(next.completedOrders, 1); assert.equal(next.activeOrder, null);
    assert.deepEqual(s.position, before.position);
    assert.strictEqual(runAction(next, action), next, 'completion cannot move or reward twice');
    assert.deepEqual(migrateSession({ version: 4, game: next, play: createSession().play }).game.position, next.position);
  }
});
test('empty battery, insufficient condition or energy, cancellation and stories do not teleport', () => {
  for (const change of [(s) => { s.bikeBattery = 0; }, (s) => { s.bike.condition = 0; }, (s) => { s.bikeBattery = 1; }, (s) => { s.pendingEventId = 'old-lady-1'; }, (s) => { s.gameOver = true; }]) {
    const s = pending(); change(s); assert.strictEqual(runAction(s, 'complete-order'), s);
  }
  const s = pending(); s.energy = 0; assert.strictEqual(runAction(s, 'push-order'), s);
  const cancelled = runAction(s, 'cancel-order'); assert.deepEqual(cancelled.position, s.position); assert.equal(cancelled.activeOrder, null);
  for (const action of ['charge-bike', 'rest', 'sleep', 'meditate-1h']) assert.deepEqual(runAction(s, action).position, s.position);
  assert.deepEqual(advanceTime(s, 12).position, s.position);
});
test('a fatal midnight does not count as a successful arrival', () => {
  const s = pending(); s.day = 6; s.minute = 1439; s.money = 0; s.health = 1; s.energy = 0;
  const next = runAction(s, 'complete-order'); assert.equal(next.gameOver, true);
  assert.deepEqual(next.position, s.position); assert.equal(next.completedOrders, 0);
});
test('v1–v4 missing-position saves preserve progress and active legacy addresses', () => {
  for (const version of [1, 2, 3, 4]) {
    const s = createSession(5678, 'generative'); s.game = pending(); s.game.day = 18;
    s.game.flags.kept = true; s.game.bike.speed = 3; s.game.relationships.zhou_ye.route = 'close-friend';
    delete s.game.position; delete s.game.activeOrder.pickupId; delete s.game.activeOrder.dropoffId;
    s.game.activeOrder.merchant = '月桂咖啡'; s.game.activeOrder.customer = '河畔公寓 12F';
    const raw = version <= 2 ? { ...s.game, version } : { ...s, version }, copy = structuredClone(raw);
    const loaded = migrateSession(raw); assert.ok(loaded); assert.deepEqual(raw, copy);
    assert.deepEqual(loaded.game.position, initialPosition());
    assert.equal(loaded.game.money, s.game.money); assert.equal(loaded.game.day, 18);
    assert.equal(loaded.game.bike.speed, 3); assert.equal(loaded.game.flags.kept, true);
    assert.equal(loaded.game.relationships.zhou_ye.route, 'close-friend');
    assert.deepEqual(loaded.game.activeOrder, s.game.activeOrder);
    assert.equal(loaded.play.mode, version > 2 ? 'generative' : 'classic');
    assert.equal(runAction(loaded.game, 'complete-order').position.locationId, 'dropoff-riverside-12');
  }
});
test('saved positions round-trip while malformed and future location schemas are protected', () => {
  const s = createSession(99); s.game.position = { version: 1, locationId: 'dropoff-observatory' };
  assert.deepEqual(migrateSession(JSON.parse(JSON.stringify(s))), s);
  for (const raw of [null, [], 'station', { version: 9, locationId: 'station' }, { version: 1, locationId: 'future-city' }, { version: 1, x: Infinity, y: -42 }]) {
    assert.equal(normalizePosition(raw), null);
    assert.equal(migrateSession({ ...s, game: { ...s.game, position: raw } }), null);
  }
  assert.deepEqual(normalizePosition(undefined), initialPosition());
});
