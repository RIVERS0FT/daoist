import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { MAP_PLACES, PLACE_MAP, PANEL_TITLES, MAP_WIDTH, MAP_HEIGHT, orderMapPoints } = require('../.test-dist/cityMap.js');
test('map places have unique in-bounds coordinates and valid view-only entries', () => {
  assert.equal(MAP_PLACES.length, 12);
  assert.equal(PLACE_MAP.size, MAP_PLACES.length);
  for (const p of MAP_PLACES) {
    assert.ok(p.name && p.description && PANEL_TITLES[p.panel]);
    assert.ok(p.x > 0 && p.x < MAP_WIDTH && p.y > 0 && p.y < MAP_HEIGHT);
    assert.ok(!('effects' in p) && !('action' in p));
  }
});
test('delivery markers map canonical addresses deterministically without changing orders', () => {
  const cases = [['老王牛肉面', '东城医院住院部', 'noodles', 'hospital'], ['月桂咖啡', '青云山脚 17 号', 'riverside', 'mountain'], ['七号便利店', '老城区梧桐里', 'station', 'home']];
  for (const [merchant, customer, pickup, dropoff] of cases) {
    const order = Object.freeze({ merchant, customer }); const points = orderMapPoints(order);
    assert.equal(points.pickup.id, pickup); assert.equal(points.dropoff.id, dropoff);
    assert.deepEqual(orderMapPoints(order), points);
  }
  assert.equal(orderMapPoints({ merchant: '未来商家', customer: '未来地址' }).pickup.id, 'station');
});
