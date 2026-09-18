import assert from 'node:assert/strict';
import test from 'node:test';
import { deliverDeliveryOffer, deliveryOffers } from '../.test-dist/deliveryBoard.js';
import { createInitialState, runAction } from '../.test-dist/engine.js';
import { deliveryRouteDistanceKm } from '../.test-dist/travel.js';

test('delivery board is stable for the same state and exposes distinct task destinations', () => {
  const game = createInitialState(123456);
  const first = deliveryOffers(game);
  const second = deliveryOffers(game);
  assert.equal(first.length, 4);
  assert.deepEqual(second, first);
  assert.equal(new Set(first.map((offer) => offer.dropoffId)).size, first.length);
  assert.ok(first.every((offer) => offer.pickupId && offer.dropoffId));
  assert.ok(first.every((offer) => offer.distanceKm === deliveryRouteDistanceKm(game, offer)));
});

test('successful player actions refresh the visible task board', () => {
  const game = createInitialState(987654);
  const before = deliveryOffers(game).map((offer) => offer.id);
  const acted = runAction(game, 'charge-bike');
  assert.notEqual(acted, game);
  const after = deliveryOffers(acted).map((offer) => offer.id);
  assert.notDeepEqual(after, before);
});

test('dispatching a map task completes that exact delivery with no separate acceptance time', () => {
  const game = createInitialState(314159);
  const selected = deliveryOffers(game)[2];
  const next = deliverDeliveryOffer(game, selected.id);
  assert.equal(next.activeOrder, null);
  assert.equal(next.completedOrders, game.completedOrders + 1);
  assert.equal(next.position.locationId, selected.dropoffId);
  assert.ok(next.minute > game.minute);
  assert.notEqual(next.minute, game.minute + 2);
  assert.ok(next.log.some((entry) => entry.text.includes(selected.customer) && entry.text.includes('送达')));
});

test('invalid, stale or unaffordable map tasks cannot mutate the world', () => {
  const game = createInitialState(271828);
  assert.equal(deliverDeliveryOffer(game, 'offer-stale'), game);
  const selected = deliveryOffers(game)[0];
  const empty = { ...game, bikeBattery: 0 };
  assert.equal(deliverDeliveryOffer(empty, selected.id), empty);
});
