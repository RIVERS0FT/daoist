import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState, migrateGameState } from '../.test-dist/engine.js';
import { deliveryOffers, deliverDeliveryOffer } from '../.test-dist/deliveryBoard.js';
import {
  claimSystemAchievement,
  claimSystemMission,
  currentSystemChapter,
  deliveryCoinReward,
  redeemSystemExchange,
  systemAchievementState,
  systemExchangePlan,
  systemMissionState,
} from '../.test-dist/system.js';

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

test('system exchange is remote, instant and does not change time or position', () => {
  const game = { ...createInitialState(10101), deliveryCoins: 20, position: { version: 1, locationId: 'home' } };
  const next = redeemSystemExchange(game, 'herb-bundle');
  assert.equal(next.deliveryCoins, 14);
  assert.equal(next.cultivation.inventory.herb, 2);
  assert.equal(next.day, game.day);
  assert.equal(next.minute, game.minute);
  assert.deepEqual(next.position, game.position);
  assert.ok(next.log[0].text.includes('系统兑换'));
  assert.ok(next.log[0].text.includes('直接发放'));
});

test('system exchange rejects insufficient, locked and capped purchases without mutation', () => {
  const game = createInitialState(20202);
  assert.equal(redeemSystemExchange(game, 'herb-bundle'), game);

  const coins = { ...game, deliveryCoins: 100 };
  assert.match(systemExchangePlan(coins, 'tea-token').reason ?? '', /5 单/);
  assert.equal(redeemSystemExchange(coins, 'tea-token'), coins);

  const capped = {
    ...coins,
    cultivation: { ...coins.cultivation, inventory: { ...coins.cultivation.inventory, herb: 98 } },
  };
  assert.equal(redeemSystemExchange(capped, 'herb-bundle'), capped);
});

test('system story chapters unlock from real delivery, cultivation, relationship and anomaly progress', () => {
  const base = createInitialState(30303);
  assert.equal(currentSystemChapter(base).chapter.id, 'boot');

  const delivered = { ...base, completedOrders: 1 };
  assert.equal(currentSystemChapter(delivered).chapter.id, 'first-mile');

  const cultivated = { ...delivered, qi: 20 };
  assert.equal(currentSystemChapter(cultivated).chapter.id, 'two-paths');

  const relationships = structuredClone(cultivated);
  relationships.relationships.zhou_ye.met = true;
  relationships.relationships.wang_shu.met = true;
  assert.equal(currentSystemChapter(relationships).chapter.id, 'human-karma');

  const strange = { ...relationships, darkQi: 1 };
  assert.equal(currentSystemChapter(strange).chapter.id, 'unfiled');

  const late = { ...strange, realmLevel: 9 };
  assert.equal(currentSystemChapter(late).chapter.id, 'foundation');
});

test('system missions claim once with zero time and persist through flags', () => {
  const game = { ...createInitialState(40404), completedOrders: 1, deliveryCoins: 2 };
  const before = systemMissionState(game, 'first-delivery');
  assert.equal(before.complete, true);
  assert.equal(before.claimed, false);

  const next = claimSystemMission(game, 'first-delivery');
  assert.equal(next.deliveryCoins, 5);
  assert.equal(next.minute, game.minute);
  assert.deepEqual(next.position, game.position);
  assert.equal(systemMissionState(next, 'first-delivery').claimed, true);
  assert.strictEqual(claimSystemMission(next, 'first-delivery'), next);
});

test('hidden achievements reveal only after their world condition and claim once', () => {
  const game = createInitialState(50505);
  assert.equal(systemAchievementState(game, 'night-whisper').complete, false);
  assert.strictEqual(claimSystemAchievement(game, 'night-whisper'), game);

  const unlocked = { ...game, darkQi: 1 };
  assert.equal(systemAchievementState(unlocked, 'night-whisper').complete, true);
  const next = claimSystemAchievement(unlocked, 'night-whisper');
  assert.equal(next.deliveryCoins, game.deliveryCoins + 4);
  assert.equal(next.minute, game.minute);
  assert.equal(systemAchievementState(next, 'night-whisper').claimed, true);
});

test('legacy v2 worlds without delivery coins migrate with a zero balance and malformed balances are protected', () => {
  const legacy = structuredClone(createInitialState(60606));
  delete legacy.deliveryCoins;
  const migrated = migrateGameState(legacy);
  assert.ok(migrated);
  assert.equal(migrated.deliveryCoins, 0);

  const malformed = { ...createInitialState(70707), deliveryCoins: -1 };
  assert.equal(migrateGameState(malformed), null);
});
