import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
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
 s.flags.systemAwakened=true;s.flags.firstOrder=true;s.stats.delivered=[0,0,10,12,14,16,18,20,30,42,48,54,68,84,102,112,122][n];
 s.player.realm=[0,0,0,1,1,1,1,2,3,4,4,5,6,7,8,8,9][n];s.claimed=['q1'];
 if(n>=5){s.bonds.lin.met=true;s.bonds.chen.met=true;}
 for(let i=2;i<n;i++)for(const id of G.CHAPTER_OUTLINES[i-1].events)s.flags[G.EVENTS.find(e=>e.id===id).flag]=true;
 return s;
}

test('十六个真实行政边界分区保留所有地点，岛屿不虚构配送通道',()=>{
 assert.equal(G.MAP_REGIONS.length,16);assert.equal(G.CHAPTER_OUTLINES.length,16);
 assert.deepEqual(G.MAP_REGIONS.map(r=>r.osmRelation).sort((a,b)=>a-b),[371650,398348,398350,398351,398353,398374,398886,398899,1278188,1278189,1673543,3292750,3292751,3292756,3292760,3293722]);
 for(const r of G.MAP_REGIONS){
  assert.ok(r.polygons.every(p=>p.every(ring=>ring.length>=4)));assert.equal(G.regionAt({x:r.seed[0],y:r.seed[1]}),r);
  const places=G.PLACES.filter(p=>G.placeRegion(p.id)===r);
  if(r.chapter===16){assert.equal(places.length,0);continue;}
  assert.ok(places.some(p=>Number.isFinite(G.routeMeters(G.place('home'),p.id,r.chapter))),r.name);
 }
 for(const p of G.PLACES)assert.ok(G.placeRegion(p.id));
 for(const p of G.PLACES.filter(p=>!p.regional))assert.equal(G.placeRegion(p.id).chapter,1);
 assert.equal(G.regionAt({x:-100000,y:0}),null);
 const unreachable=G.PLACES.filter(p=>!Number.isFinite(G.routeMeters(G.place('home'),p.id,16)));
 assert.deepEqual(unreachable.map(p=>p.id),['region-m14-6']);
 assert.equal(Number.isFinite(G.routeMeters(G.place('home'),'region-m14-6')),true,'无状态制图工具仍可检查原始路网');
});

test('每章配置包含三幕、支线素材、固定节点、出入口和禁透范围，人物均存在',()=>{
 for(const c of G.CHAPTER_OUTLINES){
  assert.equal(c.beats.length,3);assert.ok(c.entry&&c.exit&&c.conflict&&c.setting);assert.ok(c.side.length>=3&&c.facts.length&&c.withheld.length);
  for(const id of c.cast)assert.ok(G.NPCS.some(n=>n.id===id));for(const id of c.events)assert.ok(G.EVENTS.some(e=>e.id===id));
 }
});

for(const n of [3,5,10,15])for(const mode of ['classic','ai'])for(const index of [0,1,2])test(`第${n}章 ${mode} 选项${index+1}：经典剧情实际结算后才能开放下一区`,()=>{
 let s=stage(n);s.mode=mode;G.syncFeatureUnlocks(s,true);s.unlockNotices=[];const event=G.EVENTS.find(e=>e.id===G.CHAPTER_OUTLINES[n-1].events[0]);
 assert.equal(event.choices.length,3);assert.ok(event.ready(s));
 assert.equal(event.ready(stage(n-1)),false);
 s=G.perform(s,'rest').state;assert.ok(s.activity);
 s=G.advance(s,G.activityRemaining(s));assert.equal(s.pending.templateId,event.id);assert.equal(s.pending.source,'classic');
 assert.equal(G.chapterNumber(s),n);assert.equal(G.storyEventComplete(s,event.id),false);
 const pending=G.sanitizeSave(G.clone(s));assert.equal(pending.pending.templateId,event.id);
 const before=G.clone(pending),fake={title:'覆盖',text:'覆盖',choices:[0,1,2].map(()=>({label:'覆盖',result:'覆盖',effects:{qi:99}}))};
 assert.equal(G.applyAIEvent(pending,pending.pending.id,fake),pending);assert.deepEqual(pending,before);
 const bad=G.perform(pending,'choose',{eventId:'missing',index});assert.equal(bad.ok,false);assert.deepEqual(pending,before);
 const id=pending.pending.id,qi=pending.player.qi;s=G.perform(pending,'choose',{eventId:id,index}).state;
 assert.equal(s.player.qi,qi+event.choices[index].effects.qi);assert.equal(G.storyEventComplete(s,event.id),true);assert.equal(s.eventResult.text,event.choices[index].result);
 const restored=G.sanitizeSave(G.clone(s));assert.equal(restored.player.qi,s.player.qi);
 const replay=G.perform(restored,'choose',{eventId:id,index});assert.equal(replay.ok,false);assert.equal(replay.state,restored);
 const locked=stage(16);locked.flags[event.flag]=true;locked.pending={templateId:event.id};
 assert.ok(G.chapterNumber(locked)<=n,'境界与单量再高，待选的本章仍阻断后章');
});

test('按连续章节逐区开放，高境界不能跳过固定剧情，待选和进行中均不算完成',()=>{
 for(let n=1;n<=16;n++){
  const s=stage(n),copy=G.clone(s);assert.equal(G.chapterNumber(s),n);
  assert.equal(G.openRegionCount(s),n);assert.deepEqual(s,copy);
  assert.equal(G.chapterNumber(G.sanitizeSave(s)),n);
 }
 const s=stage(2);s.player.realm=9;s.stats.delivered=200;assert.equal(G.chapterNumber(s),2);
 const next=stage(3);next.pending={templateId:'story-street-vein'};assert.equal(G.chapterNumber(next),2);
 next.pending=null;next.activity={params:{event:{templateId:'story-street-vein'}}};assert.equal(G.chapterNumber(next),2);
});

test('生成订单和实际路线仅经过开放区域；新增章节会独立使用寻路缓存',()=>{
 for(let n=1;n<=16;n++){
  const s=stage(n);s.orders=[];G.refreshOrders(s);assert.ok(s.orders.length);
  for(const o of s.orders){assert.ok(G.regionPlaceOpen(s,o.target));assert.ok(G.routeRegionOpen(s,G.routeFrom(s,o.target)));}
  const target=G.PLACES.find(p=>G.placeRegion(p.id).chapter===n&&Number.isFinite(G.routeMeters(G.place('home'),p.id,n)));
  if(n===16){assert.equal(target,undefined);continue;}
  const route=G.routeFrom(s,target.id);assert.ok(G.routeRegionOpen(s,route));
  for(let i=1;i<route.points.length;i++)for(const t of [.1,.5,.9]){const a=route.points[i-1],b=route.points[i];assert.ok(G.regionAt({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}).chapter<=n);}
  if(n>1){assert.throws(()=>G.routeFrom(stage(n-1),target.id),/未开放/);assert.equal(G.routeMeters(G.place('home'),target.id,n-1),Infinity);}
 }
});

function geometryAPI(regions){
 const context=vm.createContext({NightCourier:{CITY_REGION:{administrative:{districts:regions}},PLACES:[]}});
 vm.runInContext(readFileSync(new URL('../public/js/chapters.js',import.meta.url),'utf8'),context);return context.NightCourier;
}
const shape=(id,chapter,polygons)=>({id,name:id,chapter,polygons,bounds:[0,0,100,100],seed:polygons[0][0][0]});
const square=(l,t,r,b)=>[[l,t],[r,t],[r,b],[l,b],[l,t]];
test('凹区内同区两端不能借道锁定凹口；完整道路段不能只检查端点',()=>{
 const g=geometryAPI([shape('open',1,[[[[0,0],[10,0],[10,3],[3,3],[3,7],[10,7],[10,10],[0,10],[0,0]]]]),shape('locked',8,[[square(3,3,10,7)]])]);
 const p={x:8,y:2},q={x:8,y:8};assert.equal(g.regionAt(p),g.regionAt(q));assert.equal(g.segmentChapter(p,q),8);
 assert.equal(g.segmentChapter({x:2,y:2},{x:2,y:8}),1);
 assert.equal(g.segmentChapter({x:3,y:3},{x:3,y:7}),1,'共界沿线归较早开放区');
});
test('多面体岛屿、洞与市外空白都使用真实归属，不按最近中心补区域',()=>{
 const g=geometryAPI([shape('islands',1,[[square(0,0,10,10),square(3,3,7,7)],[square(20,0,30,10)]])]);
 assert.equal(g.regionAt({x:1,y:1}).id,'islands');assert.equal(g.regionAt({x:25,y:5}).id,'islands');
 assert.equal(g.regionAt({x:5,y:5}),null);assert.equal(g.regionAt({x:15,y:5}),null);
 assert.equal(g.segmentChapter({x:1,y:5},{x:9,y:5}),Infinity);
 assert.equal(g.segmentChapter({x:9,y:1},{x:21,y:1}),Infinity);
 assert.equal(g.regionAt({x:NaN,y:1}),null);
});
test('很窄的锁定区也必须整段求交，不以固定采样点代替边界',()=>{
 const g=geometryAPI([shape('open',1,[[square(0,0,100,10),square(31,0,31.1,10)]]),shape('locked',9,[[square(31,0,31.1,10)]])]);
 assert.equal(g.segmentChapter({x:1,y:5},{x:99,y:5}),9);
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
 const frontier=G.place('region-m14-6');const trapped=stage(16);trapped.unlockedPlaces.push(frontier.id);
 const denied=G.perform(trapped,'travel',{target:frontier.id});assert.equal(denied.ok,false);assert.equal(denied.state,trapped);assert.match(denied.error,/不能途经/);
 const forged=G.perform(trapped,'travel',{target:'garage'}).state;
 forged.activity.target=frontier.id;forged.activity.route=G.route('home',frontier.id);assert.equal(G.routeRegionOpen(trapped,forged.activity.route),false);
 assert.throws(()=>G.sanitizeSave(forged),/路线穿过尚未开放/);
 let moving=stage(1);moving.unlockedPlaces.push('temple');moving=G.perform(moving,'travel',{target:'temple'}).state;moving=G.advance(moving,.25);
 const restored=G.sanitizeSave(moving);assert.deepEqual(restored.location,moving.location);assert.deepEqual(restored.activity.route,moving.activity.route);
});

test('v25 使用独立存储键，v24 文件拒绝且旧存储不读取、不覆盖、不删除',()=>{
 const old={...stage(1),schemaVersion:24};const before=JSON.stringify(old);assert.throws(()=>G.sanitizeSave(old),/仅支持 v25/);assert.equal(JSON.stringify(old),before);
 const entries=new Map([['night-courier:saves:v24','original'],['night-courier:saves:v24:backup','backup']]),reads=[];
 const store=G.createStore({getItem:k=>{reads.push(k);return entries.get(k)||null;},setItem:(k,v)=>entries.set(k,v)});
 store.load();store.upsert(stage(1));assert.ok(reads.every(k=>!k.includes('v24')));assert.equal(entries.get('night-courier:saves:v24'),'original');assert.equal(entries.get('night-courier:saves:v24:backup'),'backup');
});
