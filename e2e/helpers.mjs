import { expect } from '@playwright/test';
export async function newGame(page, mode = 'classic', name = '测试仙途') {
  await expect(page.locator('.start-screen')).toBeVisible();
  await page.getByRole('button', { name: '新建存档', exact: false }).click();
  await page.getByLabel('存档名称', { exact: true }).fill(name);
  await page.getByRole('radio', { name: mode === 'classic' ? /^经典剧情/ : /^AI 生成式剧情/ }).check();
  await page.getByRole('button', { name: '开始这一世', exact: true }).click();
  await expect(page.locator('.game-shell')).toBeVisible();
}
export async function continueRecent(page) {
  await expect(page.locator('.start-screen')).toBeVisible();
  await page.getByRole('button', { name: /^继续最近的仙途/ }).click();
  await expect(page.locator('.game-shell')).toBeVisible();
}
export async function menu(page) {
  await page.getByRole('button', { name: '更多导航', exact: true }).click();
  await page.getByRole('button', { name: '存档 / 返回开始页', exact: true }).click();
  await expect(page.locator('.start-screen')).toBeVisible();
}
export async function readStore(page) {
  // Clicking a save starts an IndexedDB read. Wait for the slot transition, not a fixed delay.
  await expect(page.locator('.game-shell')).toBeVisible();
  await expect.poll(() => page.evaluate(async () => {
    const { useGameStore } = await import('/Daoist-Delivery/src/game/store.ts');
    const s = useGameStore.getState(); return s.screen === 'playing' && !s.slotBusy;
  })).toBe(true);
  return page.evaluate(async () => {
    const { useGameStore } = await import('/Daoist-Delivery/src/game/store.ts');
    await useGameStore.getState().flushSaves();
    const s = useGameStore.getState(); return { id: s.activeSlotId, game: s.game, play: s.play };
  });
}
export async function disk(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const r = indexedDB.open('daoist-delivery', 1); r.onerror = () => reject(r.error);
    r.onsuccess = () => { const db = r.result, tx = db.transaction('saves', 'readonly'), store = tx.objectStore('saves'), values = store.getAll(), keys = store.getAllKeys(); keys.onsuccess = () => resolve(Object.fromEntries(keys.result.map((key, i) => [key, values.result[i]]))); tx.oncomplete = () => db.close(); tx.onerror = () => { db.close(); reject(tx.error); }; };
  }));
}
export async function replaceWorld(page, session) {
  await page.evaluate(async (value) => {
    const { useGameStore } = await import('/Daoist-Delivery/src/game/store.ts'), s = useGameStore.getState(); await s.flushSaves();
    await new Promise((resolve, reject) => {
      const r = indexedDB.open('daoist-delivery', 1); r.onerror = () => reject(r.error);
      r.onsuccess = () => { const db = r.result, tx = db.transaction('saves', 'readwrite'), store = tx.objectStore('saves'), key = `slot:${s.activeSlotId}`, q = store.get(key);
        q.onsuccess = () => store.put({ ...q.result, session: value, revision: q.result.revision + 1 }, key);
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
  }, session);
  await page.reload(); await continueRecent(page);
}
