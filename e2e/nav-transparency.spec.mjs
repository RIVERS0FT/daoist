import { test, expect } from '@playwright/test';
import { newGame } from './helpers.mjs';

test('bottom navigation stays transparent and only buttons capture map input', async ({ page }) => {
  await page.goto('./');
  await newGame(page);

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
});
