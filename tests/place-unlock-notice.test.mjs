import {ackUnlocks} from './unlock-helpers.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/js/data.js';
import '../public/js/sects.js';
import '../public/js/engine.js';
import '../public/js/sect-engine.js';
import '../public/js/sect-stories.js';
import '../public/js/storage.js';
import '../public/js/progression.js';
const G=globalThis.NightCourier;
const act=(s,a,p={})=>{const r=G.perform(s,a,p);assert.ok(r.ok,r.error);return r.state;};
const read=s=>G.sanitizeSave(G.clone(s));
const choose=s=>act(s,'choose',{eventId:s.pending.id,index:0});
const ackResult=s=>act(s,'ackResult',{id:s.eventResult.id});
const ackPlace=s=>act(s,'ackPlaceUnlock',{id:s.placeUnlock.place});
function fixture(template='first-order',target='clinic'){
  const s=G.newGame('新街灯火','classic',99881),e=G.EVENTS.find(e=>e.id===template);
  s.flags.firstOrder=true;s.position=target;s.orders=[];s.player.money=500;
  s.pending={...G.clone(e),id:'unlock-fixture',templateId:e.id,source:'classic',aiStatus:'skip',
    delivery:{id:'unlock-order',target,title:'新街热饭',desc:'送到这里',condition:'ordinary',expiresAt:s.minutes+30,reward:30,coins:2,npc:null}};
  return s;
}
function reject(s,a,p={}){const before=G.clone(s),r=G.perform(s,a,p);assert.equal(r.ok,false);assert.equal(r.state,s);assert.deepEqual(s,before);}
function gameplay(s){const c=G.clone(s);delete c.placeUnlock;delete c.revision;delete c.updatedAt;return c;}

test('新档与初始出租屋、修车铺不会出现解锁弹窗',()=>{
  assert.equal(G.newGame('起点').placeUnlock,null);
  for(const target of G.STARTING_PLACES){const s=choose(fixture('first-order',target));assert.equal(s.placeUnlock,null);assert.equal(s.stats.delivered,1);}
});
test('首次结算后创建独立解锁提示，选择结果优先且不提前结算',()=>{
  const before=fixture();assert.equal(before.placeUnlock,null);assert.equal(read(before).placeUnlock,null);
  const s=choose(before);assert.equal(before.unlockedPlaces.includes('clinic'),false);
  assert.deepEqual(s.placeUnlock,{place:'clinic',at:s.minutes});assert.equal(s.stats.delivered,1);assert.ok(s.eventResult);
  reject(s,'ackPlaceUnlock',{id:'clinic'});assert.equal(G.advance(s,100),s);
});
test('耗时选项完成才解锁；途中读取仍无通知，完成时间精确冻结',()=>{
  let s=choose(fixture('last-bus'));assert.equal(s.placeUnlock,null);s=G.advance(s,2);s=read(s);
  assert.equal(s.placeUnlock,null);assert.equal(s.stats.delivered,0);const at=s.minutes,remaining=G.activityRemaining(s);
  s=G.advance(s,100);assert.equal(s.minutes,at+remaining);assert.equal(s.placeUnlock.place,'clinic');assert.equal(s.stats.delivered,1);
});
test('跨午夜破产先于选择结算，不创建结果、通知或地点权限',()=>{
  let s=fixture('last-bus');s.minutes=6*1440-4;s.player.money=6;s=choose(s);s=G.advance(s,4);
  assert.ok(s.gameOver);assert.equal(s.placeUnlock,null);assert.equal(s.eventResult,null);assert.equal(s.stats.delivered,0);assert.equal(G.placeUnlocked(s,'clinic'),false);
});
test('确认结果后仍暂停；地点确认只清回执，不改变奖励、时间、种子或订单',()=>{
  const s=ackResult(choose(fixture())),snapshot=gameplay(s);assert.equal(G.advance(s,100),s);
  for(const action of ['rest','buy','travel','choose','stop','resumeDelivery','cancelDelivery','transport'])reject(s,action,{target:'home',id:'heal'});
  reject(s,'ackPlaceUnlock',{id:'market'});
  const done=ackPlace(s);assert.deepEqual(gameplay(done),snapshot);assert.equal(done.placeUnlock,null);assert.ok(done.unlockedPlaces.includes('clinic'));
  reject(done,'ackPlaceUnlock',{id:'clinic'});assert.ok(G.advance(done,1).minutes>done.minutes);const ready=ackUnlocks(done);assert.ok(G.advance(ready,1).minutes>ready.minutes);
});
test('排队主线在结果、地点两次确认后仍保留；确认不注入新故事',()=>{
  let s=fixture();s.stats.delivered=2;s.unlockedFeatures=['system'];s.claimed=['q1'];s=choose(s);const id=s.pending.id;
  s=read(s);s=ackResult(s);assert.equal(s.pending.id,id);reject(s,'choose',{eventId:id,index:0});
  const before=gameplay(s);s=ackPlace(s);assert.deepEqual(gameplay(s),before);assert.equal(s.pending.id,id);
  s=choose(ackUnlocks(s));assert.equal(s.eventResult.title,'地图上多出来的一条线');assert.equal(s.placeUnlock,null);
});
test('无事件送达也创建提示，在真实完成时冻结，没有伪造事件结果',()=>{
  let found;
  for(let seed=1;seed<100&&!found;seed++){
    let s=G.newGame('无事送达','classic',seed*9811);s.flags.firstOrder=true;
    s.orders=[fixture().pending.delivery];s.orders[0].expiresAt=s.minutes+30;
    s=act(s,'deliver',{id:s.orders[0].id});s=G.advance(s,100);
    if(!s.pending)found=s;
  }
  assert.ok(found);assert.equal(found.eventResult,null);assert.equal(found.placeUnlock.place,'clinic');assert.equal(found.stats.delivered,1);assert.equal(G.advance(found,100),found);
  assert.deepEqual(read(found).placeUnlock,found.placeUnlock);
});
test('确认前后读档不会丢通知、重复给地点或重复发奖',()=>{
  const original=choose(fixture());let s=read(original);assert.deepEqual(s.placeUnlock,original.placeUnlock);
  s=ackResult(s);s=read(s);assert.equal(s.placeUnlock.place,'clinic');s=ackPlace(s);s=read(s);
  assert.equal(s.placeUnlock,null);assert.deepEqual(s.player,original.player);assert.equal(s.stats.delivered,1);
  assert.equal(s.logs.filter(l=>l.tag==='地点').length,1);
  s=ackUnlocks(s);s.pending=fixture().pending;s=choose(s);assert.equal(s.placeUnlock,null);assert.equal(s.stats.delivered,2);assert.equal(s.logs.filter(l=>l.tag==='地点').length,1);
});
test('普通地址也有通知，不被错误加入常驻地图',()=>{
  const p=G.PLACES.find(p=>!p.permanent),s=choose(fixture('first-order',p.id));assert.equal(s.placeUnlock.place,p.id);
  assert.equal(G.visibleServicePlaces(s).some(x=>x.id===p.id),false);
});
test('只有显示白名单可恢复，不接收注入奖励、文本、脚本或其他地点',()=>{
  const s=choose(fixture());s.placeUnlock.effects={money:99999};s.placeUnlock.name='<img onerror=alert(1)>';
  const clean=read(s);assert.deepEqual(clean.placeUnlock,{place:'clinic',at:s.minutes});assert.equal(clean.player.money,s.player.money);
});
for(const [name,mutate] of [
  ['missing',s=>delete s.placeUnlock],['unknown',s=>s.placeUnlock.place='absent'],['starting',s=>s.placeUnlock.place='home'],
  ['time',s=>s.placeUnlock.at++],['nan',s=>s.placeUnlock.at=NaN],['not-arrived',s=>s.position='home'],
  ['no-ownership',s=>s.unlockedPlaces=['home','garage']],['no-delivery',s=>s.stats.delivered=0],
  ['pending-delivery',s=>s.pending=fixture().pending],['active-order',s=>s.activeOrder=fixture().pending.delivery],
])test(`拒绝损坏或冲突的解锁提示：${name}`,()=>{const s=choose(fixture());mutate(s);assert.throws(()=>G.sanitizeSave(s));});
test('v14迁移保留既有结果、地点与资产，不为历史地点补播通知',()=>{
  const s=choose(fixture());s.schemaVersion=14;delete s.placeUnlock;const clean=read(s);
  assert.equal(clean.schemaVersion,G.VERSION);assert.equal(clean.placeUnlock,null);assert.deepEqual(clean.eventResult,s.eventResult);assert.deepEqual(clean.player,s.player);
  assert.equal(read(clean).placeUnlock,null);
});
test('旧键迁移保留原文，v15空索引不复活旧档；各存档提示独立',()=>{
  const a=choose(fixture()),b=G.newGame('另一旅程');const legacy=G.clone(a);legacy.schemaVersion=14;delete legacy.placeUnlock;
  const text=JSON.stringify({saves:[legacy]}),values=new Map([['night-courier:saves:v14',text]]);
  const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const store=G.createStore(storage);store.load();assert.equal(store.saves[0].placeUnlock,null);assert.equal(values.get('night-courier:saves:v14'),text);
  store.upsert(a);store.upsert(b);const saves=G.createStore(storage).load();assert.equal(saves.find(s=>s.id===a.id).placeUnlock.place,'clinic');assert.equal(saves.find(s=>s.id===b.id).placeUnlock,null);
  values.set(G.STORAGE_KEY,JSON.stringify({saves:[]}));assert.deepEqual(G.createStore(storage).load(),[]);
});
