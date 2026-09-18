import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceTime, createInitialState, migrateGameState } from '../.test-dist/engine.js';
import { deliveryOffers, deliverDeliveryOffer } from '../.test-dist/deliveryBoard.js';
import { deliveryCoinReward, redeemSystemExchange, systemExchangePlan } from '../.test-dist/system.js';

test('successful deliveries award deterministic delivery coins', () => {
  const game = createInitialState(510510);
  const offer = deliveryOffers(game)[0];
  const reward = deliveryCoinReward(offer);
  assert.ok(reward >= 1 && reward <= 4);
  const next = deliverDeliveryOffer(game, offer.id);
  assert.equal(next.deliveryCoins, reward);
  assert.equal(next.completedOrders, 1);
  assert.ok(next.log[0].text.includes('外卖币 +' + reward));
});

test('system exchange spends coins, advances time and grants existing cultivation items', () => {
  const game = { ...createInitialState(10101), deliveryCoins: 20 };
  const next = redeemSystemExchange(game, 'herb-bundle', advanceTime);
  assert.equal(next.deliveryCoins, 14);
  assert.equal(next.cultivation.inventory.herb, 2);
  assert.equal(next.minute, game.minute + 5);
  assert.ok(next.log[0].text.includes('系统兑换'));
});

test('system exchange rejects insufficient, locked and capped purchases without mutation', () => {
  const game = createInitialState(20202);
  assert.equal(redeemSystemExchange(game, 'herb-bundle', advanceTime), game);

  const coins = { ...game, deliveryCoins: 100 };
  assert.match(systemExchangePlan(coins, 'tea-token').reason ?? '', /5 单/);
  assert.equal(redeemSystemExchange(coins, 'tea-token', advanceTime), coins);

  const capped = {
    ...coins,
    cultivation: { ...coins.cultivation, inventory: { ...coins.cultivation.inventory, herb: 98 } },
  };
  assert.equal(redeemSystemExchange(capped, 'herb-bundle', advanceTime), capped);
});

test('legacy v2 worlds without delivery coins migrate with a zero balance and malformed balances are protected', () => {
  const legacy = structuredClone(createInitialState(30303));
  delete legacy.deliveryCoins;
  const migrated = migrateGameState(legacy);
  assert.ok(migrated);
  assert.equal(migrated.deliveryCoins, 0);

  const malformed = { ...createInitialState(40404), deliveryCoins: -1 };
  assert.equal(migrateGameState(malformed), null);
});
