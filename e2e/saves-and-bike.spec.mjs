import { test, expect } from '@playwright/test';
import { newGame, continueRecent, menu, readStore, disk, replaceWorld } from './helpers.mjs';
const nav = (page, name) => page.getByRole('navigation', { name: '游戏导航' }).getByRole('button', { name, exact: true });
async function rawLegacy(page, value) {
  await page.evaluate((raw) => new Promise((resolve, reject) => {
    const r = indexedDB.open('daoist-delivery', 1); r.onerror = () => reject(r.error);
    r.onsuccess = () => { const db = r.result, tx = db.transaction('saves', 'readwrite'); tx.objectStore('saves').put(raw, 'autosave'); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(tx.error); }; };
  }), value);
}
test('start page keeps help collapsed, requires a character name and offers creation-only modes', async ({ page }, info) => {
  await page.goto('./'); await expect(page.locator('.start-screen')).toBeVisible();
  await expect(page.locator('.game-shell')).toHaveCount(0); await expect(page.getByRole('button', { name: /手动保存/ })).toHaveCount(0);
  await expect(page.locator('.start-help')).not.toHaveAttribute('open', '');
  await page.getByRole('button', { name: '新建角色', exact: true }).click();
  await expect(page.getByRole('radio')).toHaveCount(2);
  await expect(page.getByRole('button', { name: '开始这一世', exact: true })).toBeDisabled();
  await page.getByLabel('角色名称', { exact: true }).fill('界面测试');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('start-page.png'), fullPage: true });
  await page.getByRole('button', { name: '开始这一世', exact: true }).click();
  await expect(page.getByRole('banner', { name: '顶部状态栏' }).getByRole('heading', { name: '界面测试', exact: true })).toBeVisible();
  await nav(page, '奇遇').click(); await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.locator('.mode-locked')).toContainText('本存档固定');
});
test('two slots keep independent modes, upgrades and automatically saved progress', async ({ page }, info) => {
  await page.goto('./'); await newGame(page, 'classic', '跑单人生');
  await nav(page, '跑单').click(); await page.getByRole('button', { name: /^升级速度/ }).click();
  const first = await readStore(page); expect(first.game.bike.speed).toBe(1); expect(first.game.money).toBe(1083);
  await page.screenshot({ path: info.outputPath('vehicle-upgrades.png'), fullPage: true });
  await menu(page); await newGame(page, 'generative', '生成式仙途');
  const second = await readStore(page); expect(second.id).not.toBe(first.id); expect(second.game.bike.speed).toBe(0); expect(second.play.mode).toBe('generative');
  await menu(page); await expect(page.locator('.save-card')).toHaveCount(2);
  await page.getByRole('button', { name: '进入存档：跑单人生', exact: true }).click();
  const restored = await readStore(page); expect(restored.game).toEqual(first.game); expect(restored.play.mode).toBe('classic');
  await expect(page.getByRole('banner', { name: '顶部状态栏' }).getByRole('heading', { name: '跑单人生', exact: true })).toBeVisible();
  await page.reload(); await expect(page.locator('.start-screen')).toBeVisible(); await continueRecent(page);
  expect((await readStore(page)).game.bike.speed).toBe(1);
});
test('zero battery and insufficient range disable riding; upgraded charging restores the right capacity', async ({ page }) => {
  await page.goto('./'); await newGame(page);
  const s = await readStore(page); s.game.bikeBattery = 0; s.game.bike.battery = 2;
  s.game.activeOrder = { id: 'ride-test', merchant: '老王牛肉面', customer: '幸福家园 4 栋 404', distanceKm: 5, reward: 30, estimatedMinutes: 40, acceptedAtDay: 1, acceptedAtMinute: 420, strange: false };
  await replaceWorld(page, { version: 4, game: s.game, play: s.play }); await nav(page, '跑单').click();
  await expect(page.getByRole('button', { name: /^完成配送/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /^推车送达/ })).toBeEnabled();
  const before = await readStore(page);
  await page.evaluate(async () => { const { useGameStore } = await import('/Daoist-Delivery/src/game/store.ts'); useGameStore.getState().act('complete-order'); });
  expect((await readStore(page)).game).toEqual(before.game);
  await page.getByRole('button', { name: /^换电补满/ }).click(); expect((await readStore(page)).game.bikeBattery).toBe(180);
  await expect(page.getByRole('button', { name: /^完成配送/ })).toBeEnabled();
  await page.getByRole('button', { name: /^完成配送/ }).click();
  const completed = await readStore(page); expect(completed.game.completedOrders).toBe(1); expect(completed.game.bikeBattery).toBe(168);
});
test('legacy v3 migrates once, preserves its original backup, NPC route and AI mode', async ({ page }) => {
  await page.goto('./'); await expect(page.locator('.start-screen')).toBeVisible();
  const legacy = await page.evaluate(async () => { const { createSession } = await import('/Daoist-Delivery/src/game/play.ts'); const s = createSession(123, 'generative'); s.version = 3; delete s.game.bike; s.game.day = 19; s.game.money = 765; s.game.bikeBattery = 12; s.game.flags.legacy_flag = true; s.game.relationships.zhou_ye.route = 'close-friend'; return s; });
  await rawLegacy(page, legacy); await page.reload();
  await expect(page.locator('.save-card')).toHaveCount(1); await continueRecent(page);
  const loaded = await readStore(page); expect(loaded.game.money).toBe(765); expect(loaded.game.day).toBe(19); expect(loaded.game.bike.speed).toBe(0); expect(loaded.play.mode).toBe('generative');
  expect(loaded.game.relationships.zhou_ye.route).toBe('close-friend'); expect((await disk(page)).autosave).toEqual(legacy);
  await nav(page, '跑单').click(); await page.getByRole('button', { name: /^升级速度/ }).click();
  await readStore(page); await page.reload(); await expect(page.locator('.save-card')).toHaveCount(1); await continueRecent(page);
  expect((await readStore(page)).game.bike.speed).toBe(1); expect((await disk(page)).autosave).toEqual(legacy);
});
test('future legacy saves are protected and do not prevent creating a separate game', async ({ page }) => {
  await page.goto('./'); await expect(page.locator('.start-screen')).toBeVisible();
  const future = { version: 999, progress: 'do not overwrite' }; await rawLegacy(page, future); await page.reload();
  await expect(page.locator('.save-card')).toContainText('原存档未被覆盖');
  await newGame(page, 'classic', '独立新档'); await nav(page, '跑单').click(); await page.getByRole('button', { name: /^升级速度/ }).click();
  await readStore(page); expect((await disk(page)).autosave).toEqual(future);
});
test('a second tab cannot overwrite a newer revision or silently change the slot mode', async ({ page, context }) => {
  await page.goto('./'); await newGame(page, 'classic', '共享存档'); const initial = await readStore(page);
  const other = await context.newPage(); await other.goto('./'); await continueRecent(other);
  await nav(other, '跑单').click(); await other.getByRole('button', { name: /^升级电池容量/ }).click(); await readStore(other);
  await nav(page, '跑单').click(); await page.getByRole('button', { name: /^升级速度/ }).click();
  await expect(page.locator('.storage-alert')).toContainText('其他页面更新');
  const stored = (await disk(page))[`slot:${initial.id}`]; expect(stored.session.game.bike.speed).toBe(0); expect(stored.session.game.bike.battery).toBe(1);
  await other.close();
});
test('transient storage failures retry automatically without losing the upgrade', async ({ page }) => {
  await page.goto('./'); await newGame(page); await nav(page, '跑单').click();
  await page.evaluate(() => { const original = IDBObjectStore.prototype.put; let failed = false; IDBObjectStore.prototype.put = function(value, key) { if (!failed && String(key).startsWith('slot:')) { failed = true; throw new DOMException('Test quota', 'QuotaExceededError'); } return original.call(this, value, key); }; });
  await page.getByRole('button', { name: /^升级速度/ }).click();
  await expect(page.locator('.storage-alert')).toContainText('自动保存失败');
  await expect(page.locator('.save-indicator')).toContainText('已保存', { timeout: 10000 });
  const current = await readStore(page); expect((await disk(page))[`slot:${current.id}`].session.game.bike.speed).toBe(1);
});
