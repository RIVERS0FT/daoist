import { test, expect } from '@playwright/test';
import { newGame, readStore, replaceWorld } from './helpers.mjs';
const camera = page => page.locator('.map-world').evaluate(el => ({ x:Number(el.dataset.x), y:Number(el.dataset.y), scale:Number(el.dataset.scale) }));
const rect = page => page.getByTestId('map-viewport').boundingBox();
const nav=(page,label)=>page.getByRole('navigation',{name:'游戏导航'}).getByRole('button',{name:label,exact:true});
async function ready(page){await page.goto('./');await newGame(page);await expect.poll(async()=>Number((await camera(page)).scale)).toBe(.65);}
async function wheelAt(page,x,y,deltaY,extra={}){await page.getByTestId('map-viewport').dispatchEvent('wheel',{clientX:x,clientY:y,deltaY,deltaMode:0,cancelable:true,...extra});}
async function pointer(page,type,id,x,y){await page.getByTestId('map-viewport').dispatchEvent(type,{pointerId:id,pointerType:'touch',clientX:x,clientY:y,button:0,bubbles:true});}

test('wheel zoom stays anchored after a manual pan without modifying any game state',async({page})=>{
 await ready(page);const before=await readStore(page),r=await rect(page),v=page.getByTestId('map-viewport');
 await v.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowDown');
 await expect(v).toHaveAttribute('data-following','false');const a=await camera(page),x=r.x+r.width*.48,y=r.y+r.height*.46;
 const world={x:(x-r.x-a.x)/a.scale,y:(y-r.y-a.y)/a.scale};await wheelAt(page,x,y,-120);
 await expect.poll(async()=>(await camera(page)).scale).toBeGreaterThan(a.scale);
 const b=await camera(page);expect(Math.hypot(world.x*b.scale+b.x-(x-r.x),world.y*b.scale+b.y-(y-r.y))).toBeLessThan(2);
 expect(await readStore(page)).toEqual(before);
});
test('dragging from a landmark suppresses its click but keyboard activation is preserved',async({page})=>{
 await ready(page);const before=await readStore(page),pin=page.getByRole('button',{name:/^骑手驿站，/}),box=await pin.boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+20);await page.mouse.down();await page.mouse.move(box.x+box.width/2+65,box.y+65,{steps:8});await page.mouse.up();
 await expect(page.locator('.game-drawer')).toHaveCount(0);expect(await readStore(page)).toEqual(before);
 await pin.focus();await page.keyboard.press('Enter');await expect(page.locator('.game-drawer')).toBeVisible();
});
test('pinch to one-finger transitions and cancellation keep continuous transforms',async({page})=>{
 await ready(page);const g=await readStore(page),r=await rect(page),x=r.x+r.width/2,y=r.y+r.height/2;
 await pointer(page,'pointerdown',71,x-40,y);await pointer(page,'pointerdown',72,x+40,y);
 await pointer(page,'pointermove',71,x-60,y);await pointer(page,'pointermove',72,x+60,y);
 await expect.poll(async()=>(await camera(page)).scale).toBeGreaterThan(.65);
 await pointer(page,'pointerup',72,x+60,y);const a=await camera(page);
 await pointer(page,'pointermove',71,x-50,y+8);await expect.poll(async()=>(await camera(page)).x).toBeGreaterThan(a.x);
 const b=await camera(page);expect(Math.abs(b.x-a.x-10)).toBeLessThan(2);expect(Math.abs(b.y-a.y-8)).toBeLessThan(2);expect(b.scale).toBe(a.scale);
 await pointer(page,'pointercancel',71,x-50,y+8);await pointer(page,'pointermove',71,x+100,y+100);expect(await camera(page)).toEqual(b);
 expect(await readStore(page)).toEqual(g);
});
test('native Chromium touch input actually pinches the map rather than the page',async({page,browserName})=>{
 test.skip(browserName!=='chromium','Native CDP touch injection is Chromium-only; WebKit has pointer lifecycle coverage.');
 await ready(page);const g=await readStore(page),r=await rect(page),x=r.x+r.width/2,y=r.y+r.height/2;
 const cdp=await page.context().newCDPSession(page);
 const points=spread=>[{x:x-spread,y,id:1},{x:x+spread,y,id:2}];
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(35)});
 for(const spread of [42,50,60])await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(spread)});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await expect.poll(async()=>(await camera(page)).scale).toBeGreaterThan(.85);
 expect(await page.evaluate(()=>visualViewport.scale)).toBe(1);expect(await readStore(page)).toEqual(g);await cdp.detach();
});
test('accessible controls fit the whole city and trackpad preference pans without zooming',async({page},info)=>{
 await ready(page);const g=await readStore(page);await page.locator('.camera-access summary').click();await page.getByRole('button',{name:'显示全图',exact:true}).click();
 const r=await rect(page);await expect.poll(async()=>(await camera(page)).scale*2400).toBeLessThanOrEqual(r.width);
 await page.getByLabel('滚轮行为',{exact:true}).selectOption('pan');await page.locator('.camera-access summary').click();
 await page.getByRole('button',{name:'放大地图',exact:true}).click();await page.getByRole('button',{name:'定位玩家',exact:true}).click();
 const a=await camera(page);await wheelAt(page,r.x+r.width/2,r.y+r.height/2,50,{deltaX:30});await page.waitForTimeout(130);
 const b=await camera(page);expect(b.scale).toBe(a.scale);expect(await readStore(page)).toEqual(g);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('camera-overview.png'),fullPage:true});
});
test('map gestures do not capture panel scroll and stored player restores independently',async({page})=>{
 await ready(page);await nav(page,'修炼').click();await page.getByRole('button',{name:'药符',exact:true}).click();const a=await camera(page);
 const body=page.locator('.drawer-body');await body.evaluate(el=>{el.scrollTop=300;});await expect.poll(()=>body.evaluate(el=>el.scrollTop)).toBeGreaterThan(100);
 expect(await camera(page)).toEqual(a);await nav(page,'地图').click();await page.getByRole('button',{name:'定位玩家',exact:true}).click();
 const g=await readStore(page);await page.getByTestId('map-viewport').focus();await page.keyboard.press('ArrowLeft');
 const s={version:5,game:{...g.game,position:{version:1,locationId:'dropoff-forest'}},play:g.play};await replaceWorld(page,s);
 await expect(page.getByTestId('player-marker')).toHaveAttribute('data-location-id','dropoff-forest');
 await expect(page.getByTestId('map-viewport')).toHaveAttribute('data-following','true');await expect(page.getByTestId('player-marker')).toBeInViewport();
});

test('overview combines nearby landmarks into clickable groups without changing game state',async({page},info)=>{
 await ready(page);const before=await readStore(page);
 await page.locator('.camera-access summary').click();await page.getByRole('button',{name:'显示全图',exact:true}).click();await page.locator('.camera-access summary').click();
 await expect(page.locator('.landmark-cluster').first()).toBeVisible();
 const boxes=await page.locator('.map-pin:not(.delivery-pin)').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
  const a=boxes[i],b=boxes[j];expect(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y).toBe(false);
 }
 await page.screenshot({path:info.outputPath('camera-clustered-atlas.png'),fullPage:true});
 const small=await camera(page);await page.locator('.landmark-cluster').first().click();await expect.poll(async()=>(await camera(page)).scale).toBeGreaterThan(small.scale);
 expect(await readStore(page)).toEqual(before);
});
