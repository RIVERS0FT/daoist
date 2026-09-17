import { test, expect } from '@playwright/test';
import { newGame, continueRecent, replaceWorld } from './helpers.mjs';
async function ready(page) { await page.goto('./'); await newGame(page); }
const nav = (page, label) => page.getByRole('navigation', { name: '游戏导航' }).getByRole('button', { name: label, exact: true });
async function world(page) {
  return page.evaluate(async () => { const { useGameStore } = await import('/Daoist-Delivery/src/game/store.ts'); await useGameStore.getState().flushSaves(); const s = useGameStore.getState(); return JSON.parse(JSON.stringify({ version: 4, game: s.game, play: s.play })); });
}
async function restore(page, change) {
  const session = await world(page); change(session); await replaceWorld(page, session);
}
async function resolvePendingEvent(page) {
  if ((await world(page)).game.pendingEventId) await page.locator('.event-choices button:enabled').first().click();
}
async function pointerAccessibleOffer(page) {
  const offers = page.getByTestId('delivery-offer');
  const find = async () => {
    for (let index = 0; index < await offers.count(); index += 1) {
      const offer = offers.nth(index);
      const hit = await offer.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return Boolean(target && (target === element || element.contains(target)));
      });
      if (hit) return offer;
    }
    return null;
  };
  let offer = await find();
  if (!offer) {
    await page.locator('.camera-access summary').click();
    await page.getByRole('button', { name: '显示全图', exact: true }).click();
    await page.locator('.camera-access summary').click();
    offer = await find();
  }
  expect(offer, 'at least one map delivery task should be pointer-accessible after browsing the map').not.toBeNull();
  return offer;
}
test('map landing keeps status at top, transparent controls over the atlas, log at right and navigation at bottom left without external calls', async ({ page }, info) => {
  const outside = [], errors = [];
  page.on('request', (request) => { if (!request.url().startsWith('http://127.0.0.1:4173/')) outside.push(request.url()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await ready(page);
  await expect(page.locator('.game-drawer')).toHaveCount(0);
  await expect(page.getByTestId('map-viewport')).toBeVisible();
  await expect(page.getByTestId('delivery-offer')).toHaveCount(4);
  await expect(page.getByRole('banner', { name: '顶部状态栏' }).getByRole('heading', { name: '测试仙途', exact: true })).toBeVisible();
  await expect(page.locator('.map-log-overlay')).toBeVisible();
  await expect(page.locator('.last-result')).toHaveCount(0);
  const header = await page.getByRole('banner', { name: '顶部状态栏' }).boundingBox();
  const dock = await page.getByRole('navigation', { name: '游戏导航' }).boundingBox();
  const stage = await page.locator('.map-stage').boundingBox();
  const viewport = await page.getByTestId('map-viewport').boundingBox();
  expect(header.y).toBe(0); expect(dock.x).toBeLessThan(40); expect(dock.y + dock.height).toBeGreaterThan(page.viewportSize().height - 40);
  expect(Math.abs(viewport.y - stage.y)).toBeLessThanOrEqual(1);
  for (const label of ['金钱', '灵气', '精力', '健康', '压力', '电量']) await expect(page.locator('.status-meters').getByText(label, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  expect(outside).toEqual([]); expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath('map-home.png'), fullPage: true });
});
test('navigation and map browsing never advance time, change saves or invoke AI', async ({ page }, info) => {
  await ready(page); const before = await world(page);
  for (const label of ['跑单', '修炼', '关系', '奇遇']) { await nav(page, label).click(); await expect(page.locator('.game-drawer')).toBeVisible(); }
  for (const label of ['凡俗生活', '角色状态', '命运分岔', '帮助', '设置']) {
    await nav(page, '更多导航').click(); await page.locator('#more-navigation').getByRole('button', { name: label, exact: true }).click();
    await expect(page.locator('#drawer-heading')).toHaveText(label);
  }
  await nav(page, '更多导航').click(); await expect(page.locator('#more-navigation').getByRole('button', { name: '今日见闻', exact: true })).toHaveCount(0); await page.locator('#more-navigation').getByRole('button', { name: '帮助', exact: true }).click();
  await expect(page.getByRole('region', { name: '玩法帮助' })).toBeVisible();
  await expect(page.getByText('只在这里说明规则。', { exact: true })).toBeVisible();
  await nav(page, '地图').click();
  await page.getByRole('button', { name: '地点', exact: true }).click();
  await expect(page.locator('.place-directory > button')).toHaveCount(10);
  await page.locator('.place-directory').getByRole('button', { name: /青云山脚/ }).click();
  await expect(page.locator('#drawer-heading')).toHaveText('夜间修行');
  await page.getByRole('button', { name: '关闭面板，返回地图' }).click();
  await page.getByRole('button', { name: '放大地图' }).click(); await page.getByRole('button', { name: '定位玩家' }).click();
  expect(await world(page)).toEqual(before);
  await nav(page, '跑单').focus(); await page.keyboard.press('Enter'); await expect(page.locator('.game-drawer')).toBeFocused();
  await page.keyboard.press('Escape'); await expect(nav(page, '跑单')).toBeFocused();
  await nav(page, '更多导航').click(); await expect(page.locator('#more-navigation button').first()).toBeFocused();
  await page.keyboard.press('Escape'); await expect(nav(page, '更多导航')).toBeFocused();
  await nav(page, '修炼').click(); await page.screenshot({ path: info.outputPath('map-cultivation.png'), fullPage: true });
});
test('relationship panel only renders people already met', async ({ page }) => {
  await ready(page); await restore(page, (s) => {
    for (const relationship of Object.values(s.game.relationships)) {
      relationship.met = false; relationship.route = 'unmet'; relationship.affinity = 0; relationship.trust = 0; relationship.bond = 0; relationship.romance = 0;
    }
    s.game.relationships.zhou_ye = { met: true, affinity: 24, trust: 31, bond: 12, romance: 0, route: 'friend', lastSeenDay: 1 };
  });
  await nav(page, '关系').click();
  await expect(page.locator('.npc-card')).toHaveCount(1);
  await expect(page.locator('.npc-card')).toContainText('周野');
  await expect(page.locator('.relationships-panel')).not.toContainText('尚未相遇');
  await expect(page.locator('.relationships-panel')).not.toContainText('林小满');
});
test('map task preview accepts the exact order and active route has only a dropoff pin', async ({ page }, info) => {
  await ready(page);
  const offers = page.getByTestId('delivery-offer'); await expect(offers).toHaveCount(4);
  const offer = await pointerAccessibleOffer(page);
  const selectedId = await offer.getAttribute('data-offer-id');
  await offer.click();
  await expect(page.getByTestId('delivery-offer-card')).toBeVisible();
  await page.getByRole('button', { name: '接取任务 · 2 分钟', exact: true }).click();
  await resolvePendingEvent(page);
  const accepted = await world(page); expect(accepted.game.activeOrder).not.toBeNull(); expect(accepted.game.activeOrder.id).toBe(selectedId);
  await expect(page.locator('.delivery-line')).toHaveCount(1); await expect(page.getByTestId('delivery-pickup')).toHaveCount(0); await expect(page.getByTestId('delivery-dropoff')).toHaveCount(1);
  await page.screenshot({ path: info.outputPath('map-delivery-route.png'), fullPage: true });
  await page.getByTestId('delivery-dropoff').click(); await page.getByRole('button', { name: /^执行配送/ }).click();
  expect((await world(page)).game.activeOrder).toBeNull(); await expect(page.locator('.delivery-line')).toHaveCount(0);
  expect((await world(page)).game.completedOrders).toBe(1);
});
test('pending stories can be closed, reopened and cannot be bypassed from map panels', async ({ page }) => {
  await ready(page); await restore(page, (s) => { s.game.pendingEventId = 'old-lady-1'; });
  await expect(page.locator('.event-panel')).toBeVisible();
  await page.getByRole('button', { name: '关闭面板，返回地图' }).click(); await expect(page.getByRole('button', { name: '继续处理', exact: true })).toBeVisible();
  await expect(page.getByTestId('delivery-offer')).toHaveCount(0);
  await nav(page, '修炼').click(); await expect(page.getByRole('button', { name: /^吐纳一小时/ })).toBeDisabled();
  await page.getByRole('button', { name: '有待处理的内容，点击继续' }).click();
  await page.locator('.event-choices button:enabled').first().click();
  await expect(page.getByRole('heading', { name: '这一页，已经写下。' })).toBeVisible();
  expect((await world(page)).game.pendingEventId).toBeNull();
});
test('v3 world and mode survive new UI; relationships and endings remain reachable', async ({ page }) => {
  await ready(page); await restore(page, (s) => {
    s.version = 3; delete s.game.bike; s.game.day = 31; s.game.money = 2567; s.game.realmLevel = 2; s.game.qi = 86; s.play.mode = 'generative';
    s.game.relationships.zhou_ye = { met: true, affinity: 60, trust: 60, bond: 50, romance: 0, route: 'close-friend', lastSeenDay: 30 };
  });
  await expect(page.locator('.clock-block strong')).toContainText('第 31 天'); await expect(page.locator('.realm-button')).toContainText('炼气二层');
  await nav(page, '关系').click(); const npc = page.locator('.npc-card').filter({ has: page.getByRole('heading', { name: '周野', exact: true }) });
  await expect(npc).toContainText('挚友'); await expect(npc.getByRole('button', { name: /^联系/ })).toBeEnabled();
  await nav(page, '更多导航').click(); await page.locator('#more-navigation').getByRole('button', { name: /命运分岔/ }).click();
  await expect(page.locator('.ending-grid button').first()).toBeEnabled(); await page.locator('.ending-grid button').first().click();
  await expect(page.locator('.ending-result')).toBeVisible(); expect((await world(page)).game.gameOver).toBe(true);
  await page.reload(); await continueRecent(page); await expect(page.locator('.ending-result')).toBeVisible(); expect((await world(page)).play.mode).toBe('generative');
});
test('short landscape keeps navigation and scrollable panel controls reachable', async ({ page }, info) => {
  await page.setViewportSize({ width: 844, height: 390 }); await ready(page); await nav(page, '奇遇').click();
  await expect(page.getByRole('button', { name: '关闭面板，返回地图' })).toBeVisible();
  await page.getByRole('button', { name: '关闭面板，返回地图' }).click();
  await nav(page, '奇遇').click();
  await page.getByRole('button', { name: /^探索经典奇遇/ }).click(); await page.getByRole('button', { name: /^到此为止/ }).click();
  const dock = await page.getByRole('navigation', { name: '游戏导航' }).boundingBox(); expect(dock.y + dock.height).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('map-landscape.png'), fullPage: true });
});
