import { test, expect } from '@playwright/test';
import { newGame } from './helpers.mjs';

test('bottom navigation stays transparent with the live map behind it', async ({ page }) => {
  await page.goto('./');
  await newGame(page);

  await expect(page.locator('.map-task')).toHaveCount(0);
  const dock = page.getByRole('navigation', { name: '游戏导航' });
  const dockStyle = await dock.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      boxShadow: style.boxShadow,
      pointerEvents: style.pointerEvents,
      borderTopColor: style.borderTopColor,
    };
  });
  expect(dockStyle.backgroundColor).toBe('rgba(0, 0, 0, 0)');
  expect(dockStyle.boxShadow).toBe('none');
  expect(dockStyle.pointerEvents).toBe('none');
  expect(dockStyle.borderTopColor).toBe('rgba(0, 0, 0, 0)');

  const mapButton = dock.getByRole('button', { name: '地图', exact: true });
  const buttonStyle = await mapButton.evaluate((element) => {
    const style = getComputedStyle(element);
    return { backgroundColor: style.backgroundColor, pointerEvents: style.pointerEvents };
  });
  expect(buttonStyle.backgroundColor).toBe('rgba(0, 0, 0, 0)');
  expect(buttonStyle.pointerEvents).toBe('auto');

  const viewport = await page.getByTestId('map-viewport').boundingBox();
  const dockBox = await dock.boundingBox();
  expect(viewport.y + viewport.height).toBeGreaterThanOrEqual(dockBox.y + dockBox.height);

  const buttons = dock.getByRole('button');
  const first = await buttons.nth(0).boundingBox(), second = await buttons.nth(1).boundingBox();
  const gapX = (first.x + first.width + second.x) / 2, gapY = first.y + first.height / 2;
  const gapTarget = await page.evaluate(({ x, y }) => {
    const target = document.elementFromPoint(x, y);
    return Boolean(target?.closest('.map-viewport'));
  }, { x: gapX, y: gapY });
  expect(gapTarget).toBe(true);
});
