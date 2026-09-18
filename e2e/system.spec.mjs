import { expect, test } from '@playwright/test';
import { newGame, readStore, replaceWorld } from './helpers.mjs';

test('system page shows balance and persists an exchange', async ({ page }) => {
  await page.goto('/Daoist-Delivery/');
  await newGame(page, 'classic', '系统测试');
  const current = await readStore(page);
  await replaceWorld(page, { ...current, game: { ...current.game, deliveryCoins: 12 } });

  await page.getByRole('button', { name: '更多导航', exact: true }).click();
  await page.getByRole('button', { name: '外卖系统', exact: true }).click();
  await expect(page.getByRole('heading', { name: '外卖币兑换', exact: true })).toBeVisible();
  await expect(page.locator('.system-balance')).toContainText('12');

  const herb = page.locator('.system-item').filter({ hasText: '青息草小包' });
  await herb.getByRole('button', { name: '兑换', exact: true }).click();
  await expect(page.locator('.system-balance')).toContainText('6');

  const stored = await readStore(page);
  expect(stored.game.cultivation.inventory.herb).toBe(2);
  expect(stored.game.deliveryCoins).toBe(6);
  expect(stored.game.minute).toBe(current.game.minute + 5);
});
