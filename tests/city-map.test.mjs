import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { MAP_PLACES, PLACE_MAP, PANEL_TITLES, MAP_WIDTH, MAP_HEIGHT, orderMapPoints } = require('../.test-dist/cityMap.js');
const { DELIVERY_PICKUPS, DELIVERY_DROPOFFS } = require('../.test-dist/deliveryLocations.js');
test('expanded atlas keeps only functional landmarks permanently on the map', () => {
  assert.equal(MAP_WIDTH, 2400); assert.equal(MAP_HEIGHT, 1600);
  assert.equal(MAP_PLACES.length, 10); assert.equal(PLACE_MAP.size, MAP_PLACES.length);
  assert.ok(!PLACE_MAP.has('community') && !PLACE_MAP.has('software'));
  for (const p of MAP_PLACES) {
    assert.ok(p.name && p.description && PANEL_TITLES[p.panel]);
    assert.ok(p.x > 0 && p.x < MAP_WIDTH && p.y > 0 && p.y < MAP_HEIGHT);
    assert.ok(!('effects' in p) && !('action' in p));
  }
});
test('64 distinct task-only locations cover the enlarged city and have stable, unique IDs', () => {
  assert.equal(DELIVERY_PICKUPS.length, 24); assert.equal(DELIVERY_DROPOFFS.length, 40);
  const all = [...DELIVERY_PICKUPS, ...DELIVERY_DROPOFFS];
  assert.equal(new Set(all.map((p) => p.id)).size, all.length);
  assert.equal(new Set(all.map((p) => p.name)).size, all.length);
  assert.equal(new Set(all.map((p) => `${p.x},${p.y}`)).size, all.length);
  assert.ok(new Set(all.map((p) => p.district)).size >= 10);
  assert.ok(all.some((p) => p.x > 2000) && all.some((p) => p.y > 1400));
  for (const p of all) {
    assert.ok(p.x >= 100 && p.x <= MAP_WIDTH - 100 && p.y >= 100 && p.y <= MAP_HEIGHT - 100);
    assert.ok(!PLACE_MAP.has(p.id), 'delivery stops must not be in the permanent landmark list');
  }
});
test('legacy addresses resolve deterministically to distinct stops without changing orders', () => {
  const cases = [['老王牛肉面', '东城医院住院部', 'pickup-noodles', 'dropoff-hospital'], ['月桂咖啡', '青云山脚 17 号', 'pickup-coffee', 'dropoff-mountain-17'], ['七号便利店', '老城区梧桐里', 'pickup-seven', 'dropoff-wutong']];
  for (const [merchant, customer, pickup, dropoff] of cases) {
    const order = Object.freeze({ merchant, customer }); const points = orderMapPoints(order);
    assert.equal(points.pickup.id, pickup); assert.equal(points.dropoff.id, dropoff);
    assert.deepEqual(orderMapPoints(order), points);
  }
  assert.equal(orderMapPoints({ merchant: '旧档未知商家', customer: '旧档未知地址' }).pickup.id, 'station');
});
