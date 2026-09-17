import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptDeliveryOffer, deliveryOffers } from '../.test-dist/deliveryBoard.js';
import { createInitialState, runAction } from '../.test-dist/engine.js';

test('delivery board is stable for the same state and exposes distinct task destinations', () => {
  const game = createInitialState(123456);
  const first = deliveryOffers(game);
  const second = deliveryOffers(game);
  assert.equal(first.length, 4);
  assert.deepEqual(second, first);
  assert.equal(new Set(first.map((offer) => offer.dropoffId)).size, first.length);
  assert.ok(first.every((offer) => offer.pickupId && offer.dropoffId));
});

test('successful player actions refresh the visible task board', () => {
  const game = createInitialState(987654);
  const before = deliveryOffers(game).map((offer) => offer.id);
  const acted = runAction(game, 'charge-bike');
  assert.notEqual(acted, game);
  const after = deliveryOffers(acted).map((offer) => offer.id);
  assert.notDeepEqual(after, before);
});

test('accepting a map task selects that exact offer and charges only acceptance time', () => {
  const game = createInitialState(314159);
  const offers = deliveryOffers(game);
  const selected = offers[2];
  const next = acceptDeliveryOffer(game, selected.id);
  assert.equal(next.activeOrder?.id, selected.id);
  assert.equal(next.activeOrder?.merchant, selected.merchant);
  assert.equal(next.activeOrder?.customer, selected.customer);
  assert.equal(next.minute, game.minute + 2);
  assert.equal(deliveryOffers(next).length, 0);
  assert.match(next.log[0].text, /取餐并入配送流程/);
});

test('invalid or stale task ids cannot mutate the world', () => {
  const game = createInitialState(271828);
  assert.equal(acceptDeliveryOffer(game, 'offer-stale'), game);
});

test('cancelling a selected order reveals a refreshed task board', () => {
  const game = createInitialState(13579);
  const selected = deliveryOffers(game)[0];
  const accepted = acceptDeliveryOffer(game, selected.id);
  const cancelled = runAction(accepted, 'cancel-order');
  const refreshed = deliveryOffers(cancelled);
  assert.equal(cancelled.activeOrder, null);
  assert.equal(refreshed.length, 4);
  assert.ok(refreshed.every((offer) => offer.id !== selected.id));
});
