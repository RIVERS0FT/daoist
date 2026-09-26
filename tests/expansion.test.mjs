import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/js/city-data.js';
import '../public/js/data.js';
import '../public/js/sects.js';
import '../public/js/engine.js';
import '../public/js/sect-engine.js';
import '../public/js/sect-stories.js';
import '../public/js/storage.js';
import '../public/js/progression.js';
const G=globalThis.NightCourier;
// 路网与计时专项夹具明确开放地点；真实新档另测。
const fresh=(seed=12345)=>Object.assign(G.newGame('扩城测试','classic',seed),{unlockedPlaces:G.PLACES.map(p=>p.id)});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const start=(s,kind,params={})=>{const r=G.perform(s,kind,params);assert.ok(r.ok,r.error);return r.state;};
const restore=s=>G.sanitizeSave(JSON.parse(JSON.stringify(s)));


test('充电从 30 缩至 10 游戏分钟，¥8 不变，期间不瞬间补满',()=>{
  let s=fresh();s.vehicle.battery=0;const now=s.minutes;s=start(s,'charge');
  assert.equal(G.CHARGE.minutes,10);assert.equal(G.CHARGE.cost,8);assert.equal(s.activity.duration,10);
  assert.equal(s.player.money,112);assert.equal(s.minutes,now);assert.equal(s.vehicle.battery,0);
  s=G.advance(s,5);near(s.vehicle.battery,40);assert.ok(s.activity);
  s=G.advance(s,4.9);near(s.vehicle.battery,79.2);assert.ok(s.activity);
  s=G.advance(s,.1);near(s.vehicle.battery,80);assert.equal(s.activity,null);near(s.minutes,now+10);
  assert.equal(s.player.money,112);assert.equal(s.logs.filter(l=>l.text.includes('充电完成')).length,1);
});
test('半电及升级电池均按开始时缺口逐步充满',()=>{
  for(const level of [0,3,5]){
    let s=fresh();s.vehicle.levels.battery=level;const cap=G.limits(s).battery;s.vehicle.battery=cap/2;
    s=start(s,'charge');s=G.advance(s,2.5);near(s.vehicle.battery,cap*.625);
    s=G.advance(s,7.5);near(s.vehicle.battery,cap);assert.equal(s.player.money,112);
  }
});
test('满电、现金不足或忙碌时充电失败不部分扣费',()=>{
  for(let i=0;i<3;i++){
    let s=fresh();if(i!==0)s.vehicle.battery=0;if(i===1)s.player.money=7;if(i===2)s=start(s,'rest');
    const text=JSON.stringify(s),r=G.perform(s,'charge');assert.equal(r.ok,false);assert.equal(r.state,s);assert.equal(JSON.stringify(s),text);
  }
});
test('道路中途可原地充电，停止只保留已充电量且不退款',()=>{
  let s=start(fresh(),'travel',{target:'temple'});s=G.advance(s,.5);s=start(s,'stop');
  assert.equal(s.position,null);const point=G.playerPoint(s),distance=s.stats.distance;s.vehicle.battery=0;
  s=start(s,'charge');s=G.advance(s,3);near(s.vehicle.battery,24);s=start(s,'stop');
  s=G.advance(s,10);near(s.vehicle.battery,24);assert.equal(s.player.money,112);assert.deepEqual(G.playerPoint(s),point);assert.equal(s.stats.distance,distance);
});
test('新充电行动多次读档保留精度、费用及进度，剩余时间不被再次压缩',()=>{
  let s=fresh();s.vehicle.battery=0;s=start(s,'charge');s=G.advance(s,2.375);
  for(let i=0;i<4;i++)s=restore(s);
  near(s.vehicle.battery,19);near(s.activity.elapsed,2.375);near(G.activityRemaining(s),7.625);
  s=G.advance(s,7.625);near(s.vehicle.battery,80);assert.equal(s.activity,null);assert.equal(s.player.money,112);
});

test('充电跨越房租到期仍先扣租，破产不执行完成回调',()=>{
  let s=fresh();s.minutes=6*1440-5;s.player.money=8;s.vehicle.battery=0;s=start(s,'charge');
  s=G.advance(s,10);assert.equal(s.minutes,6*1440);assert.equal(s.gameOver.reason,'rent');
  near(s.vehicle.battery,40);assert.equal(s.logs.filter(l=>l.text.includes('充电完成')).length,0);
});
test('10 分钟充电不随时间切片改变收益、随机数或订单',()=>{
  let s=fresh();s.vehicle.battery=0;s=start(s,'charge');const a=G.advance(s,10);let b=G.clone(s);
  for(let i=0;i<1000;i++)b=G.advance(b,.01);
  near(a.minutes,b.minutes);near(a.vehicle.battery,b.vehicle.battery);assert.equal(a.seed,b.seed);
  assert.deepEqual(a.orders,b.orders);assert.equal(b.activity,null);
});

// Golden digests computed from main a4e26ad before editing, using exact id/name/
// coordinates and the complete Dijkstra routes. Protect real v5 in-flight saves.




test('返回路线不能修改寻路缓存，任意目的地均只沿共享道路边移动',()=>{
  const a=G.route('home','lingxi-20'),expected=G.clone(a);a.points[0].x=-1;a.meters=0;
  assert.deepEqual(G.route('home','lingxi-20'),expected);
  const lookup=new Map(G.ROAD_NODES.map((n,i)=>[`${n.x}:${n.y}`,i]));
  const edges=new Set(G.ROAD_EDGES.flatMap(({from,to})=>[`${from}:${to}`,`${to}:${from}`]));
  for(const p of G.PLACES)for(const q of G.PLACES){
    const r=G.route(p.id,q.id);
    for(let i=1;i<r.points.length;i++)assert.ok(edges.has(`${lookup.get(`${r.points[i-1].x}:${r.points[i-1].y}`)}:${lookup.get(`${r.points[i].x}:${r.points[i].y}`)}`));
  }
});
for(const district of ['yunport','eastlake','south','lingxi','southbank'].map(id=>({id,name:id})))test(`${district.name}配送实际移动，途中读档、抵达和奖励只结算一次`,()=>{
  let s=fresh(),target=G.PLACES.filter(p=>p.id.startsWith(district.id+'-')).at(-1).id;
  const plan=G.travelPlan(s,target);s.orders=[{id:`expansion-${district.id}`,title:'新区热饭',desc:'交到门口。',condition:'ordinary',target,expiresAt:s.minutes+plan.minutes+20,reward:50,coins:4,npc:null}];
  s=start(s,'deliver',{id:s.orders[0].id});assert.equal(s.stats.delivered,0);assert.equal(s.player.money,120);
  s=G.advance(s,plan.minutes/2);assert.equal(s.position,null);assert.ok(s.activity.travelled>0);
  const midpoint=G.playerPoint(s);s=restore(s);assert.deepEqual(G.playerPoint(s),midpoint);
  s=G.advance(s,G.activityRemaining(s));assert.equal(s.position,target);assert.equal(s.pending.delivery.target,target);assert.equal(s.player.money,120);
  const eventId=s.pending.id;s=start(s,'choose',{eventId,index:0});assert.equal(s.stats.delivered,1);assert.equal(s.player.money,170);
  assert.equal(G.perform(s,'choose',{eventId,index:0}).ok,false);assert.equal(s.player.money,170);
  near(s.stats.distance,plan.meters);near(s.vehicle.battery,80-plan.battery);
});

test('新区远距离移动仍依据距离消耗资源，切片后与一次推进一致',()=>{
  let s=start(fresh(),'travel',{target:'lingxi-20'});const total=G.activityRemaining(s),a=G.advance(s,total);let b=G.clone(s);
  for(let i=0;i<500;i++)b=G.advance(b,total/500);
  near(a.minutes,b.minutes);near(a.stats.distance,b.stats.distance);near(a.vehicle.battery,b.vehicle.battery);
  assert.deepEqual(G.playerPoint(a),G.playerPoint(b));assert.equal(b.position,'lingxi-20');assert.equal(a.seed,b.seed);
});
