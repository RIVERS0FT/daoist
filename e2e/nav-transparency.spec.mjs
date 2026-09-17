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
  const world = await page.locator('.map-world').boundingBox();
  expect(viewport.y + viewport.height).toBeGreaterThanOrEqual(dockBox.y + dockBox.height);
  expect(world.y).toBeLessThan(dockBox.y + dockBox.height);
  expect(world.y + world.height).toBeGreaterThan(dockBox.y);
});
