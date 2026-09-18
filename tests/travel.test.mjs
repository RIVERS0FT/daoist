import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createInitialState, gameActionPlan, runAction, runSystemExchange, socializeNpc, socializePlan, systemActionPlan } = require('../.test-dist/engine.js');
const { normalizePosition, playerMapPoint } = require('../.test-dist/deliveryLocations.js');
const { deliveryOffers } = require('../.test-dist/deliveryBoard.js');
const { mapDistanceKm, travelPlan } = require('../.test-dist/travel.js');

test('map travel time grows with geometric distance and is zero at the destination', () => {
  const game = createInitialState(111);
  const home = travelPlan(game, 'home');
  const mountain = travelPlan(game, 'mountain');
  assert.ok(home.distanceKm > 0);
  assert.ok(mountain.distanceKm > home.distanceKm);
  assert.ok(mountain.minutes > home.minutes);
  const atHome = { ...game, position: { version: 1, locationId: 'home' } };
  assert.equal(travelPlan(atHome, 'home').distanceKm, 0);
  assert.equal(travelPlan(atHome, 'home').minutes, 0);
  assert.ok(mapDistanceKm(playerMapPoint(game.position), playerMapPoint(atHome.position)) > 0);
});

test('location-bound actions add commute once and persist the arrival', () => {
  const game = createInitialState(222);
  const plan = gameActionPlan(game, 'rest');
  const first = runAction(game, 'rest');
  assert.equal(first.position.locationId, 'home');
  assert.equal(first.minute, game.minute + plan.totalMinutes);
  const settled = { ...first, pendingEventId: null };
  assert.equal(gameActionPlan(settled, 'rest').travelMinutes ?? gameActionPlan(settled, 'rest').minutes, 0);
  const second = runAction(settled, 'rest');
  assert.equal(second.position.locationId, 'home');
  assert.equal(second.minute, settled.minute + 60);
});

test('socializing travels to the npc location before the meeting time', () => {
  const game = createInitialState(333);
  game.relationships.lin_xiaoman = { ...game.relationships.lin_xiaoman, met: true, route: 'friend' };
  const plan = socializePlan(game, 'lin_xiaoman');
  const next = socializeNpc(game, 'lin_xiaoman');
  assert.equal(next.position.locationId, 'hospital');
  assert.equal(next.minute, game.minute + plan.totalMinutes);
  assert.ok(plan.totalMinutes > 45);
});

test('system exchange travels to the rider station and then spends five minutes', () => {
  const game = { ...createInitialState(444), deliveryCoins: 20, position: { version: 1, locationId: 'home' } };
  const plan = systemActionPlan(game, 'herb-bundle');
  const next = runSystemExchange(game, 'herb-bundle');
  assert.equal(next.position.locationId, 'station');
  assert.equal(next.minute, game.minute + plan.totalMinutes);
  assert.equal(next.deliveryCoins, 14);
  assert.equal(next.cultivation.inventory.herb, 2);
  assert.equal(plan.totalMinutes, plan.travelMinutes + 5);
});

test('functional map locations are valid saved positions and position changes refresh delivery routes', () => {
  const position = normalizePosition({ version: 1, locationId: 'rooftop' });
  assert.deepEqual(position, { version: 1, locationId: 'rooftop' });
  const station = createInitialState(555);
  const home = { ...station, position: { version: 1, locationId: 'home' } };
  const stationOffers = deliveryOffers(station);
  const homeOffers = deliveryOffers(home);
  assert.notDeepEqual(homeOffers.map((offer) => offer.id), stationOffers.map((offer) => offer.id));
  assert.ok(homeOffers.every((offer) => offer.distanceKm > 0));
});
