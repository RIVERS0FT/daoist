import { test, expect } from '@playwright/test';
import { newGame, continueRecent, readStore, replaceWorld, menu, disk } from './helpers.mjs';
const nav = (page, label) => page.getByRole('navigation', { name: '游戏导航' }).getByRole('button', { name: label, exact: true });
async function ready(page, name = '城市骑手') { await page.goto('./'); await newGame(page, 'classic', name); }
async function orderAt(page, { empty = false, legacy = false, target = 'dropoff-sail' } = {}) {
  const s = await readStore(page);
  const order = await page.evaluate(async (id) => {
    const { DELIVERY_PICKUPS, DELIVERY_DROPOFFS } = await import('/Daoist-Delivery/src/game/deliveryLocations.ts');
    const pickup = DELIVERY_PICKUPS.find((p) => p.id === 'pickup-bakery'), dropoff = DELIVERY_DROPOFFS.find((p) => p.id === id);
    return { id: 'map-order', merchant: pickup.name, customer: dropoff.name, pickupId: pickup.id, dropoffId: dropoff.id,
      distanceKm: 5, reward: 30, estimatedMinutes: 40, acceptedAtDay: 1, acceptedAtMinute: 420, strange: false };
  }, target);
  s.game.activeOrder = order; s.game.pendingEventId = null; s.game.energy = 88; s.game.bikeBattery = empty ? 0 : 82; s.game.seed = 5678;
  if (legacy) { delete s.game.position; delete s.game.activeOrder.pickupId; delete s.game.activeOrder.dropoffId; }
  await replaceWorld(page, { version: 4, game: s.game, play: s.play });
  return order;
}
async function finish(page, pushing = false) {
  await nav(page, '跑单').click(); await page.getByRole('button', { name: pushing ? /^推车送达/ : /^完成配送/ }).click();
  await nav(page, '地图').click(); return readStore(page);
}
test('task points are absent without an order; locating and browsing never move the rider', async ({ page }, info) => {
  const outside = []; page.on('request', (r) => { if (!r.url().startsWith('http://127.0.0.1:4173/')) outside.push(r.url()); });
  await ready(page); const before = await readStore(page);
  await expect(page.locator('.delivery-pin')).toHaveCount(0); await expect(page.locator('.route-pin')).toHaveCount(0);
  await expect(page.getByTestId('player-marker')).toHaveAttribute('data-location-id', 'station');
  await expect(page.getByRole('button', { name: '定位配送终点' })).toBeDisabled();
  await page.getByRole('button', { name: '地点', exact: true }).click();
  await page.locator('.place-directory').getByRole('button', { name: /青云山脚/ }).click(); await nav(page, '地图').click();
  await page.getByRole('button', { name: '放大地图' }).click(); await page.getByRole('button', { name: '缩小地图' }).click();
  await page.getByRole('button', { name: '定位玩家' }).click();
  await expect(page.getByTestId('player-marker')).toBeInViewport();
  const size = await page.locator('.city-artwork').getAttribute('viewBox'); expect(size).toBe('0 0 2400 1600');
  const title = await page.locator('.map-title').boundingBox(), location = await page.locator('.map-location').boundingBox();
  expect(location.y).toBeGreaterThanOrEqual(title.y + title.height);
  expect(await readStore(page)).toEqual(before); expect(outside).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('expanded-map-idle.png'), fullPage: true });
});
test('only the active order has pins; completion clears them and persists the rider at its destination', async ({ page }, info) => {
  await ready(page); const order = await orderAt(page);
  await expect(page.locator('.delivery-pin')).toHaveCount(2);
  await expect(page.getByTestId('delivery-pickup')).toHaveAttribute('data-location-id', order.pickupId);
  await expect(page.getByTestId('delivery-dropoff')).toHaveAttribute('data-location-id', order.dropoffId);
  await expect(page.getByTestId('player-marker')).toHaveAttribute('data-location-id', 'station');
  await page.getByRole('button', { name: '定位配送终点' }).click();
  await expect(page.getByTestId('delivery-dropoff')).toBeInViewport();
  const pin = await page.getByTestId('delivery-dropoff').boundingBox(), card = await page.locator('.map-task').boundingBox();
  expect(pin.x < card.x + card.width && pin.x + pin.width > card.x && pin.y < card.y + card.height && pin.y + pin.height > card.y).toBe(false);
  const before = await readStore(page); await page.getByTestId('delivery-dropoff').click();
  await expect(page.locator('#drawer-heading')).toHaveText('配送任务'); expect((await readStore(page)).game).toEqual(before.game);
  await nav(page, '地图').click(); await page.screenshot({ path: info.outputPath('expanded-map-order.png'), fullPage: true });
  const arrived = await finish(page); expect(arrived.game.position.locationId).toBe(order.dropoffId);
  await expect(page.locator('.delivery-pin')).toHaveCount(0); await expect(page.locator('.delivery-line')).toHaveCount(0);
  await expect(page.getByTestId('player-marker')).toHaveAttribute('data-location-id', order.dropoffId);
  await page.getByRole('button', { name: '定位玩家' }).click(); await expect(page.getByTestId('player-marker')).toBeInViewport();
  await expect(page.locator('.map-location')).toContainText(order.customer);
  expect((await disk(page))[`slot:${arrived.id}`].session.game.position).toEqual(arrived.game.position);
  await page.screenshot({ path: info.outputPath('expanded-map-arrival.png'), fullPage: true });
  await page.reload(); await continueRecent(page); await nav(page, '地图').click();
  expect((await readStore(page)).game.position).toEqual(arrived.game.position); await expect(page.locator('.delivery-pin')).toHaveCount(0);
});
test('zero power cannot move the rider; cancellation stays put while explicit pushing arrives', async ({ page }) => {
  await ready(page); await orderAt(page, { empty: true }); const before = await readStore(page);
  await nav(page, '跑单').click(); await expect(page.getByRole('button', { name: /^完成配送/ })).toBeDisabled();
  await page.evaluate(async () => { const { useGameStore } = await import('/Daoist-Delivery/src/game/store.ts'); useGameStore.getState().act('complete-order'); });
  expect((await readStore(page)).game).toEqual(before.game);
  await page.getByRole('button', { name: /^取消当前订单/ }).click(); await nav(page, '地图').click();
  await expect(page.locator('.delivery-pin')).toHaveCount(0); expect((await readStore(page)).game.position).toEqual(before.game.position);
  const order = await orderAt(page, { empty: true }); const arrived = await finish(page, true);
  expect(arrived.game.position.locationId).toBe(order.dropoffId); expect(arrived.game.bikeBattery).toBe(0);
  await expect(page.locator('.delivery-pin')).toHaveCount(0);
});
test('old v4 slots acquire an initial position and separate slots retain separate last arrivals', async ({ page }) => {
  await ready(page, '港区骑手'); const order = await orderAt(page, { legacy: true });
  await expect(page.getByTestId('player-marker')).toHaveAttribute('data-location-id', 'station');
  await expect(page.getByTestId('delivery-dropoff')).toHaveAttribute('data-location-id', 'dropoff-sail');
  const first = await finish(page); expect(first.game.position.locationId).toBe(order.dropoffId ?? 'dropoff-sail');
  await menu(page); await newGame(page, 'classic', '山麓骑手');
  expect((await readStore(page)).game.position.locationId).toBe('station');
  await orderAt(page, { target: 'dropoff-forest' }); const second = await finish(page);
  expect(second.game.position.locationId).toBe('dropoff-forest'); expect(second.id).not.toBe(first.id);
  await menu(page); await page.getByRole('button', { name: '进入存档：港区骑手', exact: true }).click();
  expect((await readStore(page)).game.position).toEqual(first.game.position);
  await page.reload(); await continueRecent(page); expect((await readStore(page)).game.position).toEqual(first.game.position);
});
