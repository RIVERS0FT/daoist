import { expect, test } from '@playwright/test';
import { newGame, readStore } from './helpers.mjs';

async function zoomOutFully(page) {
  const button = page.getByRole('button', { name: '缩小地图', exact: true });
  for (let i = 0; i < 20 && await button.isEnabled(); i += 1) await button.click();
}

async function clickableOffer(page) {
  const offers = page.getByTestId('delivery-offer');
  const find = async () => {
    for (let index = 0; index < await offers.count(); index += 1) {
      const offer = offers.nth(index);
      const hit = await offer.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return Boolean(target && (target === element || element.contains(target)));
      });
      if (hit) return offer;
    }
    return null;
  };
  let offer = await find();
  if (!offer) {
    await zoomOutFully(page);
    offer = await find();
  }
  expect(offer, 'at least one map delivery task should be pointer-accessible').not.toBeNull();
  return offer;
}

test('delivery tasks are chosen from map and pickup is merged into one delivery action', async ({ page }) => {
  await page.goto('/Daoist-Delivery/');
  await newGame(page, 'classic', '地图骑手');

  const offers = page.getByTestId('delivery-offer');
  await expect(offers).toHaveCount(4);
  const offer = await clickableOffer(page);
  const selectedId = await offer.getAttribute('data-offer-id');
  const selectedDropoff = await offer.getAttribute('data-location-id');
  await offer.click();

  const card = page.getByTestId('delivery-offer-card');
  await expect(card).toBeVisible();
  await expect(card.locator('[aria-label="配送要求"]')).toBeVisible();
  await expect(card.getByText(/取餐 .*取餐已并入配送执行/)).toBeVisible();
  const before = await readStore(page);
  await card.getByRole('button', { name: '配送', exact: true }).click();

  const state = await readStore(page);
  expect(state.game.activeOrder).toBeNull();
  expect(state.game.completedOrders).toBe(before.game.completedOrders + 1);
  expect(state.game.position.locationId).toBe(selectedDropoff);
  expect(state.game.minute).toBeGreaterThan(before.game.minute);
  expect(state.game.minute).not.toBe(before.game.minute + 2);
  expect(state.game.log.some((entry) => entry.text.includes('送达'))).toBe(true);
  await expect(page.getByTestId('delivery-pickup')).toHaveCount(0);
  await expect(page.getByTestId('delivery-dropoff')).toHaveCount(0);
  expect(selectedId).toBeTruthy();
});

test('task board refreshes after a player action', async ({ page }) => {
  await page.goto('/Daoist-Delivery/');
  await newGame(page, 'classic', '刷新测试');
  const before = await page.getByTestId('delivery-offer').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-offer-id')));

  await page.evaluate(async () => {
    const { useGameStore } = await import('/Daoist-Delivery/src/game/store.ts');
    useGameStore.getState().act('charge-bike');
    await useGameStore.getState().flushSaves();
  });

  await expect(page.getByTestId('delivery-offer')).toHaveCount(4);
  const after = await page.getByTestId('delivery-offer').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-offer-id')));
  expect(after).not.toEqual(before);
});
