import { test, expect } from '@playwright/test';
import { newGame } from './helpers.mjs';

const nav = (page, label) => page.getByRole('navigation', { name: '游戏导航' }).getByRole('button', { name: label, exact: true });

test('drawer titles do not repeat the player name and keep place context', async ({ page }) => {
  await page.goto('./');
  await newGame(page);

  await expect(page.getByRole('banner', { name: '顶部状态栏' }).getByRole('heading', { name: '测试仙途', exact: true })).toBeVisible();

  await nav(page, '关系').click();
  const drawerHeading = page.locator('.drawer-heading');
  await expect(drawerHeading).not.toContainText('测试仙途');
  await expect(drawerHeading.locator('.eyebrow')).toBeHidden();
  await expect(page.locator('#drawer-heading')).toHaveText('人间关系');
  expect(await page.locator('#drawer-heading').evaluate((element) => getComputedStyle(element).marginTop)).toBe('0px');

  await page.getByRole('button', { name: '关闭面板，返回地图' }).click();
  const mountain = page.getByRole('button', { name: /^青云山脚，/ });
  await mountain.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.drawer-heading .eyebrow')).toBeVisible();
  await expect(page.locator('.drawer-heading .eyebrow')).toHaveText('青云山脚');
  await expect(page.locator('#drawer-heading')).toHaveText('夜间修行');
});
