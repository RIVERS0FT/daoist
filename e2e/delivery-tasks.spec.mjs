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
  await offer.click();

  const card = page.getByTestId('delivery-offer-card');
  await expect(card).toBeVisible();
  await expect(card.locator('[aria-label="配送要求"]')).toBeVisible();
  await expect(card.getByText(/取餐 .*取餐已并入配送执行/)).toBeVisible();
  await card.getByRole('button', { name: '接取任务 · 2 分钟', exact: true }).click();

  await expect(page.getByTestId('delivery-offer')).toHaveCount(0);
  await expect(page.getByTestId('delivery-dropoff')).toHaveCount(1);
  await expect(page.getByTestId('delivery-pickup')).toHaveCount(0);
  const state = await readStore(page);
  expect(state.game.activeOrder?.id).toBe(selectedId);
  expect(state.game.minute).toBe(7 * 60 + 2);

  await page.getByTestId('delivery-dropoff').click();
  await expect(page.getByRole('button', { name: /执行配送/ })).toBeVisible();
  await expect(page.getByText('取餐与送达合并为一次配送执行。')).toBeVisible();
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
