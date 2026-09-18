import { expect, test } from '@playwright/test';
import { newGame, readStore, replaceWorld } from './helpers.mjs';

test('system page has story missions and instant remote exchange', async ({ page }) => {
  await page.goto('/Daoist-Delivery/');
  await newGame(page, 'classic', '系统测试');
  const current = await readStore(page);
  await replaceWorld(page, {
    version: 5,
    game: {
      ...current.game,
      completedOrders: 1,
      deliveryCoins: 12,
      position: { version: 1, locationId: 'home' },
    },
    play: current.play,
  });

  await page.getByRole('button', { name: '更多导航', exact: true }).click();
  await page.getByRole('button', { name: '外卖系统', exact: true }).click();
  await expect(page.locator('.system-story')).toContainText('第二章 · 第一程');
  await expect(page.getByText('系统直发 · 0 分钟', { exact: true })).toBeVisible();
  await expect(page.locator('.system-balance')).toContainText('12');

  const mission = page.locator('.system-task').filter({ hasText: '完成第一单' }).first();
  await expect(mission.getByRole('button', { name: '领取', exact: true })).toBeEnabled();
  await mission.getByRole('button', { name: '领取', exact: true }).click();
  await expect(page.locator('.system-balance')).toContainText('15');

  const afterClaim = await readStore(page);
  expect(afterClaim.game.minute).toBe(current.game.minute);
  expect(afterClaim.game.position.locationId).toBe('home');
  expect(afterClaim.game.flags['system_mission_claimed_first-delivery']).toBe(true);

  const herb = page.locator('.system-item').filter({ hasText: '青息草小包' });
  await herb.getByRole('button', { name: '兑换', exact: true }).click();
  await expect(page.locator('.system-balance')).toContainText('9');

  const stored = await readStore(page);
  expect(stored.game.cultivation.inventory.herb).toBe(2);
  expect(stored.game.deliveryCoins).toBe(9);
  expect(stored.game.minute).toBe(current.game.minute);
  expect(stored.game.position.locationId).toBe('home');
});
