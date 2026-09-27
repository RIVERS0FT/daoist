import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/js/city-data.js';
import '../public/vendor/fflate/fflate.js';
import '../public/js/city-routes.js';
import '../public/js/data.js';
import '../public/js/chapters.js';
import '../public/js/sects.js';
import '../public/js/engine.js';
import '../public/js/sect-engine.js';
import '../public/js/sect-stories.js';
import '../public/js/clock.js';
import '../public/js/storage.js';
const G=globalThis.NightCourier;
// 路网与计时专项夹具明确开放地点；真实新档另测。
const fresh=()=>Object.assign(G.newGame('远行','classic',123456),{unlockedPlaces:G.PLACES.filter(p=>!p.regional).map(p=>p.id)});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function runClock(s,speed=1){
  const c=new G.GameClock(dt=>{s=G.advance(s,dt);if(s.pending||s.ending||s.gameOver)c.pause('event');});
  c.setSpeed(speed);c.release('manual');c.frame(0);
  return {c,get state(){return s;}};
}




test('原城区与全市配送地址只沿真实共享道路边移动',()=>{
  for(const from of ['home','southbank-10'])for(const place of G.PLACES){
    const r=G.route(from,place.id);assert.ok(Number.isFinite(r.meters));
    assert.deepEqual(r.points.at(-1),{x:place.x,y:place.y});
    for(let i=1;i<r.points.length;i++){
      const a=r.points[i-1],b=r.points[i];assert.ok(Math.hypot(b.x-a.x,b.y-a.y)>0);
      const middle={x:(a.x+b.x)/2,y:(a.y+b.y)/2};assert.ok(G.roadAnchors(middle).length);
    }
  }
  assert.throws(()=>G.route({x:-10,y:-10},'home'));
});

test('新城路途中存档往返保持位置、剩余路径和小数消耗',()=>{
  let s=G.perform(fresh(),'travel',{target:'southbank-10'}).state;
  s=G.advance(s,G.activityRemaining(s)*.43);const copy=G.sanitizeSave(G.clone(s));
  assert.deepEqual(copy.location,s.location);assert.deepEqual(copy.activity,s.activity);
  assert.deepEqual(copy.vehicle,s.vehicle);assert.deepEqual(copy.player,s.player);
});
test('前台和后台时间戳交错只推进一次，旧回调不会回退基准',()=>{
  let total=0;const c=new G.GameClock(t=>total+=t);c.release('manual');
  for(const t of [0,250,250,240,1000,1000,1250])c.frame(t);
  near(total,1.25);assert.equal(c.paused,false);
});
test('长后台间隔分批处理并保留余量，不超过引擎增量上限',()=>{
  const chunks=[];const c=new G.GameClock(t=>chunks.push(t));c.release('manual');c.setSpeed(10);c.frame(0);c.frame(600000);
  assert.equal(chunks.length,4);assert.ok(c.pendingMinutes>0);assert.equal(c.paused,false);
  for(let i=0;i<25&&c.pendingMinutes;i++)c.frame(600000);
  near(chunks.reduce((a,b)=>a+b,0),6000);near(c.pendingMinutes,0);assert.ok(chunks.every(x=>x<=60));
});
test('非有限时间戳不破坏时钟，下一次有效回调仍正确计时',()=>{
  let total=0;const c=new G.GameClock(t=>total+=t);c.release('manual');c.frame(0);
  for(const t of [NaN,Infinity,-Infinity])c.frame(t);
  c.frame(2000);near(total,2);assert.equal(c.paused,false);
});
test('手动暂停会丢弃待推进余量，恢复后不计暂停期间时间',()=>{
  let total=0;const c=new G.GameClock(t=>total+=t);c.release('manual');c.frame(0);c.frame(600000);
  near(total,240);c.pause();assert.equal(c.pendingMinutes,0);c.frame(900000);c.release('manual');c.frame(1000000);c.frame(1001000);near(total,241);
});
test('后台移动与相同游戏时间的前台移动获得相同位置和消耗',()=>{
  const initial=G.perform(fresh(),'travel',{target:'southbank-10'}).state;
  const bg=runClock(G.clone(initial));bg.c.frame(6000);
  let fg=G.clone(initial);for(let i=0;i<60;i++)fg=G.advance(fg,.1);
  near(bg.state.minutes,fg.minutes);near(bg.state.stats.distance,fg.stats.distance);
  near(bg.state.vehicle.battery,fg.vehicle.battery);near(bg.state.player.stamina,fg.player.stamina);
  near(G.playerPoint(bg.state).x,G.playerPoint(fg).x);near(G.playerPoint(bg.state).y,G.playerPoint(fg).y);
});
test('后台抵达待选配送剧情就停，不越过事件或提前发放奖励',()=>{
  let s=fresh();s=G.perform(s,'deliver',{id:s.orders[0].id}).state;
  const t=runClock(s,10);t.c.frame(600000);
  assert.ok(t.state.pending?.delivery);assert.equal(t.state.stats.delivered,0);assert.equal(t.c.paused,true);assert.equal(t.c.pendingMinutes,0);
  const at=t.state.minutes;t.c.frame(900000);near(t.state.minutes,at);
});
test('后台跨房租日仍先扣租，现金不足准确停在午夜',()=>{
  const s=fresh();s.minutes=6*1440-1;s.player.money=0;s.orderRefreshAt=6*1440;
  const t=runClock(s);t.c.frame(600000);
  assert.equal(t.state.gameOver.reason,'rent');near(t.state.minutes,6*1440);assert.equal(t.c.pendingMinutes,0);
});

// Golden values from the 99-place release b71b00d; protect all newly published IDs too.
