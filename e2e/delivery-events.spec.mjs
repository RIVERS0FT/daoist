import { expect, test } from '@playwright/test';
import { newGame, readStore, replaceWorld } from './helpers.mjs';

test('delivery event renders three meaningful choices and settles only the selected branch', async ({ page }) => {
  await page.goto('/Daoist-Delivery/');
  await newGame(page, 'classic', '配送事件测试');
  const current = await readStore(page);
  await replaceWorld(page, {
    version: 5,
    game: {
      ...current.game,
      pendingEventId: 'delivery-wrong-building',
      energy: 80,
      reputation: 5,
      stress: 12,
    },
    play: current.play,
  });

  await expect(page.locator('.event-panel')).toBeVisible();
  await expect(page.getByRole('heading', { name: '7 栋还是 17 栋', exact: true })).toBeVisible();
  const choices = page.locator('.event-choices button');
  await expect(choices).toHaveCount(3);
  await expect(choices.nth(0)).toContainText('再送到 17 栋');
  await expect(choices.nth(1)).toContainText('请顾客下楼到中间碰面');
  await expect(choices.nth(2)).toContainText('按平台地址完成并提交证据');

  const before = await readStore(page);
  await page.getByRole('button', { name: /请顾客下楼到中间碰面/ }).click();

  const after = await readStore(page);
  expect(after.game.pendingEventId).toBeNull();
  expect(after.game.minute).toBe(before.game.minute + 7);
  expect(after.game.energy).toBe(before.game.energy);
  expect(after.game.reputation).toBe(before.game.reputation + 1);
  await expect(page.getByRole('heading', { name: '这一页，已经写下。' })).toBeVisible();
});

test('resource requirement disables an unaffordable delivery-event choice', async ({ page }) => {
  await page.goto('/Daoist-Delivery/');
  await newGame(page, 'classic', '配送门槛测试');
  const current = await readStore(page);
  await replaceWorld(page, {
    version: 5,
    game: { ...current.game, pendingEventId: 'delivery-leaking-soup', money: 5 },
    play: current.play,
  });

  await expect(page.getByRole('heading', { name: '汤洒了一点', exact: true })).toBeVisible();
  const compensate = page.getByRole('button', { name: /自己补 ¥12 表示歉意/ });
  await expect(compensate).toBeDisabled();
  await expect(compensate).toContainText('需要 ¥12');
  await expect(page.locator('.event-choices button:enabled')).toHaveCount(2);
});
