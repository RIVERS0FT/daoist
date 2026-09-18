import { test, expect } from '@playwright/test';
import { newGame, continueRecent } from './helpers.mjs';
const endpoint = 'https://relay.example/narrative';
const scene = { title: '桥下的纸鹤', description: '纸鹤反复落在同一块砖上，你可以记录它的落点，也可以帮助路边送货员做一份零工。', choices: [
  { label: '观察纸鹤落点', result: '你记下了落点，没有触碰任何陌生的东西。', approach: 'observe' },
  { label: '完成附近的零工', result: '你完成了约定的零工，收到了说好的报酬。', approach: 'work' },
] };
async function ready(page, mode = 'classic') {
  await page.goto('./'); await newGame(page, mode);
  await page.getByRole('navigation', { name: '游戏导航' }).getByRole('button', { name: '奇遇', exact: true }).click();
}
async function configure(page) {
  await page.getByText(/^AI 服务设置/).click();
  await page.getByLabel(/^生成服务地址/).fill(endpoint);
  await page.getByLabel(/^relay 访问口令/).fill('test-relay-token-only');
  await page.getByRole('checkbox', { name: /^同意向此服务/ }).check();
  await page.getByRole('button', { name: '保存接入设置', exact: true }).click();
}
async function saved(page) {
  return page.evaluate(async () => { const { useGameStore } = await import('/Daoist-Delivery/src/game/store.ts'); const id = useGameStore.getState().activeSlotId; return new Promise((resolve, reject) => {
    const r = indexedDB.open('daoist-delivery', 1);
    r.onerror = () => reject(r.error);
    r.onsuccess = () => { const db = r.result; const tx = db.transaction('saves', 'readonly'); const q = tx.objectStore('saves').get(`slot:${id}`); q.onsuccess = () => { resolve(q.result?.session); db.close(); }; q.onerror = () => { db.close(); reject(q.error); }; };
  }); });
}
async function mockRelay(page, callback) {
  await page.route(endpoint, async (route) => {
    const headers = { 'access-control-allow-origin': 'http://127.0.0.1:4173', 'access-control-allow-headers': 'Content-Type, Authorization', 'access-control-allow-methods': 'POST, OPTIONS' };
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return; }
    await callback(route, headers, route.request().postDataJSON());
  });
}

test('classic exploration is playable with zero AI calls and no horizontal overflow', async ({ page }, info) => {
  let calls = 0; const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await mockRelay(page, async (route, headers) => { calls++; await route.fulfill({ status: 500, headers }); });
  await ready(page);
  await page.getByRole('button', { name: /^探索经典奇遇/ }).click();
  await expect(page.getByText('经典人工奇遇', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: /^到此为止/ }).click();
  await expect(page.locator('.clock-block strong')).toContainText('07:30');
  expect(calls).toBe(0); expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('classic.png'), fullPage: true });
});
test('AI scene choices persist across reload and finish offline without switching mode', async ({ page }, info) => {
  let generations = 0;
  await mockRelay(page, async (route, headers, body) => {
    if (body.type === 'health') { await route.fulfill({ headers, json: { protocol: 1, ready: true, capabilities: ['scene-v1'] } }); return; }
    generations++; await route.fulfill({ headers, json: { protocol: 1, scene } });
  });
  await ready(page, 'generative'); await configure(page);
  await page.getByRole('button', { name: '测试连接', exact: true }).click();
  await expect(page.getByRole('region', { name: '游玩模式与自由奇遇', exact: true }).getByRole('status')).toContainText('relay 可达'); expect(generations).toBe(0);
  await page.getByLabel(/^虚构行动/).fill('看看桥下的纸鹤，但不强行改变任何人的关系。');
  await page.getByRole('button', { name: /^生成下一段奇遇/ }).click();
  await expect(page.getByRole('heading', { name: scene.title, exact: true })).toBeVisible();
  await expect.poll(async () => (await saved(page))?.play?.scene?.title).toBe(scene.title);
  await expect(page.getByRole('region', { name: '当前自由奇遇' })).toBeFocused();
  const bounds = await page.locator('.drawer-body').boundingBox();
  const heading = await page.getByRole('heading', { name: scene.title, exact: true }).boundingBox();
  expect(heading.y).toBeGreaterThanOrEqual(bounds.y);
  expect(heading.y + heading.height).toBeLessThan(bounds.y + bounds.height);
  await page.screenshot({ path: info.outputPath('map-ai-scene.png'), fullPage: true });
  await page.reload(); await continueRecent(page); await expect(page.getByRole('heading', { name: scene.title, exact: true })).toBeVisible(); expect(generations).toBe(1);
  await expect(page.getByRole('group', { name: '游玩模式', exact: true })).toHaveCount(0);
  await page.unroute(endpoint);
  await page.context().setOffline(true);
  await page.getByRole('button', { name: /^到此为止/ }).click();
  await expect(page.locator('.clock-block strong')).toContainText('07:30');
  await expect.poll(async () => (await saved(page))?.play?.history?.length).toBe(1);
  expect((await saved(page)).play.mode).toBe('generative');
  expect(JSON.stringify(await saved(page))).not.toContain('test-relay-token-only');
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('test-relay-token-only');
  expect(generations).toBe(1); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('ai-to-classic.png'), fullPage: true });
});
test('AI service error transparently falls back to authored choices', async ({ page }) => {
  await mockRelay(page, async (route, headers) => { await route.fulfill({ status: 503, headers, json: { error: 'unavailable' } }); });
  await ready(page, 'generative'); await configure(page);
  await page.getByRole('button', { name: /^生成下一段奇遇/ }).click();
  await expect(page.getByRole('region', { name: '游玩模式与自由奇遇', exact: true }).getByRole('status')).toContainText('503');
  await expect(page.getByText('经典人工奇遇', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: /^到此为止/ }).click();
  await page.getByRole('navigation', { name: '游戏导航' }).getByRole('button', { name: '地图', exact: true }).click();
  await expect(page.getByTestId('delivery-offer')).toHaveCount(4);
});
test('unconfigured generation is honest and classic fallback remains playable', async ({ page }) => {
  await ready(page, 'generative');
  await expect(page.getByText(/^AI 尚未就绪/)).toBeVisible();
  await page.getByRole('button', { name: /^生成下一段奇遇/ }).click();
  await expect(page.getByRole('region', { name: '游玩模式与自由奇遇', exact: true }).getByRole('status')).toContainText('尚未配置');
  await expect(page.getByText('经典人工奇遇', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: /^到此为止/ }).click();
  await expect(page.locator('.clock-block strong')).toContainText('07:30');
});
