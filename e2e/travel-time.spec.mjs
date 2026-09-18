import { expect, test } from '@playwright/test';
import { newGame, readStore } from './helpers.mjs';

const nav = (page, label) => page.getByRole('navigation', { name: '游戏导航' }).getByRole('button', { name: label, exact: true });

test('life actions charge map commute once and persist the functional destination', async ({ page }) => {
  await page.goto('/Daoist-Delivery/');
  await newGame(page, 'classic', '路程测试');
  const before = await readStore(page);

  await nav(page, '更多导航').click();
  await page.locator('#more-navigation').getByRole('button', { name: '凡俗生活', exact: true }).click();
  const rest = page.getByRole('button', { name: /^休息一下/ });
  await expect(rest).toContainText(/路程 .* km/);
  await expect(rest).not.toContainText(/^60 分钟$/);

  await rest.click();
  const arrived = await readStore(page);
  expect(arrived.game.position.locationId).toBe('home');
  expect(arrived.game.minute).toBeGreaterThan(before.game.minute + 60);

});

test('opening a map landmark is still free until an action is executed there', async ({ page }) => {
  await page.goto('/Daoist-Delivery/');
  await newGame(page, 'classic', '地标测试');
  const before = await readStore(page);
  const mountain = page.getByRole('button', { name: /^青云山脚，/ });
  await mountain.focus();
  await page.keyboard.press('Enter');
  const opened = await readStore(page);
  expect(opened.game).toEqual(before.game);

  const meditate = page.getByRole('button', { name: /^吐纳一小时/ });
  await expect(meditate).toContainText(/路程 .* km/);
  await meditate.click();
  const after = await readStore(page);
  expect(after.game.position.locationId).toBe('mountain');
  expect(after.game.minute).toBeGreaterThan(before.game.minute + 60);
});
