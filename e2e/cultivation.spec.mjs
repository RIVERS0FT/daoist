import {test,expect} from '@playwright/test';
import {newGame,readStore,replaceWorld,continueRecent,menu,disk} from './helpers.mjs';
const nav=(page,label)=>page.getByRole('navigation',{name:'游戏导航'}).getByRole('button',{name:label,exact:true});
async function ready(page){await page.goto('./');await newGame(page,'classic','修仙测试');}
async function seed(page,level=0){
 const s=await readStore(page);s.game.realmLevel=level;s.game.qi=900;s.game.seed=42;s.game.energy=100;s.game.health=100;s.game.stress=12;s.game.pendingEventId=null;
 s.game.cultivation.manuals.breath=100;s.game.cultivation.preparation=100;s.game.cultivation.mana=30+level*5;
 await replaceWorld(page,{version:5,game:s.game,play:s.play});return readStore(page);
}
test('cultivation tabs and breakthrough previews never advance time or send AI requests',async({page},info)=>{
 const external=[];page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4173/'))external.push(r.url());});
 await ready(page);const before=await readStore(page);await nav(page,'修炼').click();
 for(const name of ['功法','药符','破境','修行'])await page.getByRole('button',{name,exact:true}).click();
 expect(await readStore(page)).toEqual(before);expect(external).toEqual([]);
 await expect(page.getByRole('button',{name:/^吐纳一小时/})).toBeEnabled();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('cultivation-practice.png'),fullPage:true});
});
test('learning, changing and training a manual autosaves across reload and keeps a separate slot untouched',async({page},info)=>{
 await ready(page);await nav(page,'修炼').click();await page.getByRole('button',{name:'功法',exact:true}).click();
 await page.getByRole('button',{name:/^研习轻身行气诀/}).click();await readStore(page);
 await page.getByRole('button',{name:/^主修轻身行气诀/}).click();await readStore(page);
 await page.getByRole('button',{name:'修行',exact:true}).click();await page.getByRole('button',{name:/^行功练习/}).click();const first=await readStore(page);
 expect(first.game.cultivation.main).toBe('wind');expect(first.game.cultivation.manuals.wind).toBe(8);
 await page.screenshot({path:info.outputPath('cultivation-manual.png'),fullPage:true});
 await page.reload();await continueRecent(page);expect((await readStore(page)).game.cultivation).toEqual(first.game.cultivation);
 await menu(page);await newGame(page,'generative','另一条仙途');expect((await readStore(page)).game.cultivation.main).toBe('breath');
 await menu(page);await page.getByRole('button',{name:'进入存档：修仙测试',exact:true}).click();expect((await readStore(page)).game.cultivation).toEqual(first.game.cultivation);
});
test('entry breakthrough is guaranteed when prepared and is safely saved before another action',async({page},info)=>{
 await ready(page);const before=await seed(page);await nav(page,'修炼').click();await page.getByRole('button',{name:'破境',exact:true}).click();
 await expect(page.getByLabel('突破成功率')).toContainText('100%');expect((await readStore(page)).game).toEqual(before.game);
 await page.screenshot({path:info.outputPath('cultivation-breakthrough.png'),fullPage:true});
 await page.getByRole('button',{name:/^确认稳妥突破/}).click();const after=await readStore(page);
 expect(after.game.realmLevel).toBe(1);expect(after.game.qi).toBe(before.game.qi-30);expect(after.game.minute).toBe(before.game.minute+240);
 await page.reload();await continueRecent(page);expect((await readStore(page)).game).toEqual(after.game);
});
test('foundation trial locks outside actions, survives refresh and unlocks a real foundation breakthrough',async({page},info)=>{
 await ready(page);const before=await seed(page,9);await nav(page,'修炼').click();await page.getByRole('button',{name:'破境',exact:true}).click();
 await expect(page.getByRole('button',{name:/^确认稳妥突破/})).toBeDisabled();await page.getByRole('button',{name:/^开始内景筑基试炼/}).click();await readStore(page);
 await page.locator('.foundation-trial .action-button').first().click();const stage=await readStore(page);expect(stage.game.cultivation.trial.stage).toBe(1);
 await nav(page,'地图').click();await expect(page.getByTestId('delivery-offer')).toHaveCount(0);
 await page.reload();await continueRecent(page);await expect(page.locator('.foundation-trial')).toBeVisible();expect((await readStore(page)).game.cultivation.trial).toEqual(stage.game.cultivation.trial);
 await page.screenshot({path:info.outputPath('cultivation-trial.png'),fullPage:true});
 await page.locator('.foundation-trial .action-button').first().click();await readStore(page);await page.locator('.foundation-trial .action-button').first().click();const done=await readStore(page);
 expect(done.game.cultivation.trialPassed).toBe(true);expect(done.game.position).toEqual(before.game.position);
 await page.getByRole('button',{name:'破境',exact:true}).click();await page.getByRole('button',{name:/^确认稳妥突破/}).click();const result=await readStore(page);
 expect(result.game.realmLevel).toBe(10);await expect(page.locator('.realm-button')).toContainText('筑基初期');await expect(page.getByRole('button',{name:/^已达境界上限/})).toBeDisabled();
});
test('upgrading an old v4 slot makes an exact one-time backup without resetting its world',async({page})=>{
 await ready(page);const s=await readStore(page);delete s.game.cultivation;s.game.realmLevel=7;s.game.qi=324;s.game.money=823;
 const raw={version:4,game:s.game,play:s.play};await replaceWorld(page,raw);const loaded=await readStore(page),rows=await disk(page);
 expect(rows[`slot:${s.id}`].session.version).toBe(5);expect(rows[`backup:pre-v5:${s.id}`].session).toEqual(raw);
 expect(loaded.game.realmLevel).toBe(7);expect(loaded.game.qi).toBe(324);expect(loaded.game.money).toBe(823);expect(loaded.game.cultivation.manuals.breath).toBeGreaterThanOrEqual(44);
 const backup=rows[`backup:pre-v5:${s.id}`];await page.reload();await continueRecent(page);await readStore(page);expect((await disk(page))[`backup:pre-v5:${s.id}`]).toEqual(backup);
});
