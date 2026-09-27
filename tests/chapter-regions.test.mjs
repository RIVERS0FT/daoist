import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/js/city-data.js';
import '../public/js/city-region-data.js';
import '../public/vendor/fflate/fflate.js';
import '../public/js/city-routes.js';
import '../public/js/data.js';
import '../public/js/chapters.js';
import '../public/js/sects.js';
import '../public/js/engine.js';
import '../public/js/sect-engine.js';
import '../public/js/sect-stories.js';
import '../public/js/storage.js';
import '../public/js/progression.js';
const G=NightCourier;
function stage(n){
 const s=G.newGame('区域边界','classic',42);if(n===1)return s;
 s.flags.systemAwakened=true;s.flags.firstOrder=true;s.stats.delivered=[0,0,10,12,12,18,30,42,54,68,84,102,122][n];
 s.player.realm=[0,0,0,1,1,2,3,4,5,6,7,8,9][n];s.claimed=['q1'];
 if(n>=3)s.flags.storyStreetVein=true;
 if(n>=4){s.flags.storySecondCity=true;s.bonds.lin.met=true;s.bonds.chen.met=true;}
 if(n>=6)s.flags.storyLanternNetwork=true;if(n>=7)s.flags.storySystemDoubt=true;if(n>=8)s.flags.storySystemTruth=true;
 for(let i=8;i<n;i++)for(const id of G.CHAPTER_OUTLINES[i-1].events)s.flags[G.EVENTS.find(e=>e.id===id).flag]=true;
 return s;
}

test('十二个区域完整覆盖全市，原地点坐标不变，每章有道路可达的新增区域地址',()=>{
 assert.equal(G.MAP_REGIONS.length,12);assert.equal(G.CHAPTER_OUTLINES.length,12);
 for(const r of G.MAP_REGIONS){
  assert.ok(r.polygon.length>=3);assert.equal(G.regionAt({x:r.seed[0],y:r.seed[1]}),r);
  const places=G.PLACES.filter(p=>G.placeRegion(p.id)===r);assert.ok(places.length,r.name);
  assert.ok(places.some(p=>Number.isFinite(G.routeMeters(G.place('home'),p.id,r.chapter))),r.name);
 }
 for(const p of G.PLACES)assert.ok(G.placeRegion(p.id));
 for(const p of G.PLACES.filter(p=>!p.regional))assert.equal(G.placeRegion(p.id).chapter,1);
 const [l,t,r,b]=G.CITY_REGION.bounds;for(let x=l;x<=r;x+=1700)for(let y=t;y<=b;y+=1700)assert.ok(G.regionAt({x,y}));
});

test('每章配置包含三幕、支线素材、固定节点、出入口和禁透范围，人物均存在',()=>{
 for(const c of G.CHAPTER_OUTLINES){
  assert.equal(c.beats.length,3);assert.ok(c.entry&&c.exit&&c.conflict&&c.setting);assert.ok(c.side.length>=3&&c.facts.length&&c.withheld.length);
  for(const id of c.cast)assert.ok(G.NPCS.some(n=>n.id===id));for(const id of c.events)assert.ok(G.EVENTS.some(e=>e.id===id));
 }
});

test('按连续章节逐区开放，高境界不能跳过固定剧情，待选和进行中均不算完成',()=>{
 for(let n=1;n<=12;n++){
  const s=stage(n),copy=G.clone(s);assert.equal(G.chapterNumber(s),n);
  assert.equal(G.MAP_REGIONS.filter(r=>G.regionUnlocked(s,r.id)).length,n);assert.deepEqual(s,copy);
  assert.equal(G.chapterNumber(G.sanitizeSave(s)),n);
 }
 const s=stage(2);s.player.realm=9;s.stats.delivered=200;assert.equal(G.chapterNumber(s),2);
 const next=stage(3);next.pending={templateId:'story-street-vein'};assert.equal(G.chapterNumber(next),2);
 next.pending=null;next.activity={params:{event:{templateId:'story-street-vein'}}};assert.equal(G.chapterNumber(next),2);
});

test('生成订单和实际路线仅经过开放区域；新增章节会独立使用寻路缓存',()=>{
 for(let n=1;n<=12;n++){
  const s=stage(n);s.orders=[];G.refreshOrders(s);assert.ok(s.orders.length);
  for(const o of s.orders){assert.ok(G.regionPlaceOpen(s,o.target));assert.ok(G.routeRegionOpen(s,G.routeFrom(s,o.target)));}
  const target=G.PLACES.find(p=>G.placeRegion(p.id).chapter===n&&Number.isFinite(G.routeMeters(G.place('home'),p.id,n)));
  const route=G.routeFrom(s,target.id);assert.ok(G.routeRegionOpen(s,route));
  for(let i=1;i<route.points.length;i++)for(const t of [.1,.5,.9]){const a=route.points[i-1],b=route.points[i];assert.ok(G.regionAt({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}).chapter<=n);}
  if(n>1){assert.throws(()=>G.routeFrom(stage(n-1),target.id),/未开放/);assert.equal(G.routeMeters(G.place('home'),target.id,n-1),Infinity);}
 }
});

test('道路中段穿过第三个未开放区域时整条边锁定，不能只检查两端',()=>{
 const p={x:-50000,y:-60000},q={x:-22000,y:17000};
 assert.equal(Math.max(G.regionAt(p).chapter,G.regionAt(q).chapter),7);
 assert.equal(G.segmentChapter(p,q),9);
});

test('锁定区指令无扣费，篡改位置、票据与跨界路线拒绝，途中读档保持位置',()=>{
 const s=stage(1),target=G.PLACES.find(p=>G.placeRegion(p.id).chapter===2);s.unlockedPlaces.push(target.id);
 for(const action of ['travel','deliver']){
  const input=G.clone(s);if(action==='deliver')input.orders[0].target=target.id;
  const before=G.clone(input),r=G.perform(input,action,action==='travel'?{target:target.id}:{id:input.orders[0].id});
  assert.equal(r.ok,false);assert.match(r.error,/未开放/);assert.deepEqual(input,before);assert.equal(r.state,input);
 }
 assert.throws(()=>G.sanitizeSave(s),/尚未开放/);
 const outside=stage(1);outside.position=target.id;outside.location={x:target.x,y:target.y};assert.throws(()=>G.sanitizeSave(outside),/尚未开放/);
 const ticket=stage(1);ticket.orders[0].target=target.id;assert.throws(()=>G.sanitizeSave(ticket),/尚未开放/);
 // Both destinations are in the open region, but some real corridors leave it.
 const frontier=G.PLACES.find(p=>G.placeRegion(p.id).chapter===1&&!Number.isFinite(G.routeMeters(G.place('home'),p.id,1)));
 assert.ok(frontier);const trapped=stage(1);trapped.unlockedPlaces.push(frontier.id);
 const denied=G.perform(trapped,'travel',{target:frontier.id});assert.equal(denied.ok,false);assert.equal(denied.state,trapped);assert.match(denied.error,/不能途经/);
 const forged=G.perform(trapped,'travel',{target:'garage'}).state;
 forged.activity.target=frontier.id;forged.activity.route=G.route('home',frontier.id);assert.equal(G.routeRegionOpen(trapped,forged.activity.route),false);
 assert.throws(()=>G.sanitizeSave(forged),/路线穿过尚未开放/);
 let moving=stage(1);moving.unlockedPlaces.push('temple');moving=G.perform(moving,'travel',{target:'temple'}).state;moving=G.advance(moving,.25);
 const restored=G.sanitizeSave(moving);assert.deepEqual(restored.location,moving.location);assert.deepEqual(restored.activity.route,moving.activity.route);
});

test('v24 使用独立存储键，v23 文件拒绝且旧存储不读取、不覆盖、不删除',()=>{
 const old={...stage(1),schemaVersion:23};const before=JSON.stringify(old);assert.throws(()=>G.sanitizeSave(old),/仅支持 v24/);assert.equal(JSON.stringify(old),before);
 const entries=new Map([['night-courier:saves:v23','original'],['night-courier:saves:v23:backup','backup']]),reads=[];
 const store=G.createStore({getItem:k=>{reads.push(k);return entries.get(k)||null;},setItem:(k,v)=>entries.set(k,v)});
 store.load();store.upsert(stage(1));assert.ok(reads.every(k=>!k.includes('v23')));assert.equal(entries.get('night-courier:saves:v23'),'original');assert.equal(entries.get('night-courier:saves:v23:backup'),'backup');
});
