import { test, expect } from '@playwright/test';
import { newGame, continueRecent, menu, readStore, replaceWorld } from './helpers.mjs';
const log = (page) => page.getByRole('complementary', { name: '行为与事件日志' });
const body = (page) => page.getByRole('log', { name: '行为与事件记录' });
const nav = (page, label) => page.getByRole('navigation', { name: '游戏导航' }).getByRole('button', { name: label, exact: true });
async function ready(page, mode = 'classic') { await page.goto('./'); await newGame(page, mode); }
async function expand(page) { if (await page.getByRole('button', { name: '展开日志', exact: true }).count()) await page.getByRole('button', { name: '展开日志', exact: true }).click(); }
async function restore(page, change) { const current = await readStore(page); const session = { version: 5, game: current.game, play: current.play }; change(session); await replaceWorld(page, session); }
async function noOverlap(first, second) {
  const a = await first.boundingBox(), b = await second.boundingBox();
  expect(a && b).toBeTruthy();
  expect(a.x + a.width <= b.x + 1 || b.x + b.width <= a.x + 1 || a.y + a.height <= b.y + 1 || b.y + b.height <= a.y + 1).toBe(true);
}

test('one bottom-right log, accessible folding and browsing do not change the world', async ({ page }, info) => {
  const outside = [], errors = [];
  page.on('request', (request) => { if (!request.url().startsWith('http://127.0.0.1:4173/')) outside.push(request.url()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await ready(page); const before = await readStore(page);
  await expect(log(page)).toHaveCount(1); await expect(body(page)).toBeVisible();
  await noOverlap(log(page), page.locator('.nav-dock'));
  await noOverlap(log(page), page.locator('.map-task'));
  const rect = await log(page).boundingBox();
  expect(page.viewportSize().width - rect.x - rect.width).toBeLessThanOrEqual(30);
  expect(rect.y).toBeGreaterThan(page.viewportSize().height / 2);
  await page.getByRole('button', { name: '收起日志' }).focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '展开日志' })).toBeFocused();
  await page.keyboard.press('Enter'); await expect(body(page)).toBeVisible();
  for (const label of ['跑单', '修炼', '人物', '奇遇']) {
    await nav(page, label).click(); await noOverlap(log(page), page.locator('.game-drawer'));
    await expect(page.locator('.last-result, .scene-memories, .game-drawer .log-list')).toHaveCount(0);
  }
  await nav(page, '更多导航').click(); await expect(page.locator('#more-navigation')).not.toContainText('今日见闻');
  await page.keyboard.press('Escape');
  expect(await readStore(page)).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(outside).toEqual([]); expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath('activity-log-panel.png'), fullPage: true });
});

test('authored event choice appears only in the log and survives reload and save changes', async ({ page }) => {
  await ready(page);
  await restore(page, (s) => { s.game.pendingEventId = 'old-lady-1'; });
  const choice = await page.locator('.event-choices button:enabled').first().locator('span').textContent();
  await page.locator('.event-choices button:enabled').first().click();
  const resolved = await readStore(page), last = resolved.game.log[0];
  expect(last.text).toContain(choice);
  await expect(log(page).getByText(last.text, { exact: true })).toHaveCount(1);
  await expect(page.getByText(last.text, { exact: true })).toHaveCount(1);
  await page.reload(); await continueRecent(page);
  expect((await readStore(page)).game.log).toEqual(resolved.game.log);
  await expect(log(page).getByText(last.text, { exact: true })).toHaveCount(1);
  await menu(page); await newGame(page, 'classic', '另一位修士');
  await expect(log(page)).not.toContainText(last.text);
  await menu(page);
  await page.getByRole('button', { name: '进入存档：测试仙途', exact: true }).click();
  await expect(log(page).getByText(last.text, { exact: true })).toHaveCount(1);
});

for (const mode of ['classic', 'generative']) {
  test(`${mode}: resolved encounter history is only visible in the log`, async ({ page }) => {
    await ready(page, mode); await nav(page, '奇遇').click();
    await page.getByRole('button', { name: mode === 'classic' ? /^探索经典奇遇/ : /^生成下一段奇遇/ }).click();
    await expect(page.locator('.generated-scene')).toBeVisible();
    await page.getByRole('button', { name: /^到此为止/ }).click();
    const s = await readStore(page), memory = s.play.history.at(-1);
    expect(s.game.log[0].text).toContain(memory.choice);
    await expect(log(page).getByText(s.game.log[0].text, { exact: true })).toHaveCount(1);
    await expect(page.locator('.scene-memories, .last-result')).toHaveCount(0);
    await expect(page.locator('.drawer-body')).not.toContainText(memory.result);
  });
}

test('new entries follow the bottom but do not interrupt reading history or reopen a folded log', async ({ page }) => {
  await ready(page);
  await restore(page, (s) => { s.game.log = Array.from({ length: 80 }, (_, i) => ({ id: `history-${i}`, day: 1, minute: 420, text: `历史记录 ${i}：一段较长的行动说明，用于验证滚动位置不会被新消息打断。` })); });
  const before = await readStore(page);
  expect(await body(page).evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight < 20)).toBe(true);
  await body(page).evaluate((el) => { el.scrollTop = el.scrollHeight / 2; el.dispatchEvent(new Event('scroll')); });
  const anchor = await body(page).evaluate((el) => { const row = [...el.querySelectorAll('li')].find((r) => r.getBoundingClientRect().bottom > el.getBoundingClientRect().top + 1); return { key: row.dataset.logKey, top: row.getBoundingClientRect().top - el.getBoundingClientRect().top }; });
  await page.evaluate(async () => { const { useGameStore } = await import('/Daoist-Delivery/src/game/store.ts'); useGameStore.getState().act('rest'); });
  await expect(page.getByRole('button', { name: '查看最新' })).toBeVisible();
  const offset = await body(page).evaluate((el, key) => { const row = [...el.querySelectorAll('li')].find((r) => r.dataset.logKey === key); return row.getBoundingClientRect().top - el.getBoundingClientRect().top; }, anchor.key);
  expect(Math.abs(offset - anchor.top)).toBeLessThan(3);
  await page.getByRole('button', { name: '查看最新' }).click();
  expect(await body(page).evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight < 20)).toBe(true);
  await page.getByRole('button', { name: '收起日志' }).click();
  await page.evaluate(async () => { const { useGameStore } = await import('/Daoist-Delivery/src/game/store.ts'); const s = useGameStore.getState(); if (s.game.pendingEventId) { const { EVENT_MAP } = await import('/Daoist-Delivery/src/game/content.ts'); s.chooseEvent(EVENT_MAP.get(s.game.pendingEventId).choices.find(c => !c.requires && !c.relationshipRequires).id); } else s.act('rest'); });
  await expect(page.getByRole('button', { name: '展开日志' })).toBeVisible();
  await expect(log(page).getByText('有新记录', { exact: true })).toBeVisible();
  await expand(page); await expect(log(page).getByText('有新记录', { exact: true })).toHaveCount(0);
  const after = await readStore(page); expect(after.game.log.length).toBe(80); expect(after.game.minute).toBeGreaterThan(before.game.minute);
});

test('short landscape keeps expanded log, navigation and action controls separate', async ({ page }, info) => {
  await page.setViewportSize({ width: 844, height: 390 }); await ready(page);
  await expect(page.getByRole('button', { name: '展开日志' })).toBeVisible();
  await expand(page); await nav(page, '奇遇').click();
  await noOverlap(log(page), page.locator('.game-drawer')); await noOverlap(log(page), page.locator('.nav-dock'));
  await page.getByRole('button', { name: /^探索经典奇遇/ }).click();
  await page.getByRole('button', { name: /^到此为止/ }).click();
  await expect(log(page)).toContainText('到此为止');
  await page.screenshot({ path: info.outputPath('activity-log-landscape.png'), fullPage: true });
});


test('map offer preview and acceptance stay usable above the log', async ({ page }) => {
  await ready(page);
  const before = await readStore(page);
  const offer = page.locator('.delivery-pin.offer').first();
  await offer.focus(); await offer.press('Enter');
  await expect(page.getByTestId('delivery-offer-card')).toBeVisible();
  await noOverlap(log(page), page.getByTestId('delivery-offer-card'));
  expect(await readStore(page)).toEqual(before);
  await page.getByRole('button', { name: '接取任务 · 2 分钟', exact: true }).click();
  await nav(page, '跑单').click();
  await expect(page.locator('.order-card')).toBeVisible();
  await noOverlap(log(page), page.locator('.game-drawer'));
  await expect(log(page)).toContainText('接');
});
