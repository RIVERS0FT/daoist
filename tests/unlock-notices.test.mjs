import {afterAwakening} from './helpers/opening.mjs';
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
const G=globalThis.NightCourier;
const act=(s,a,p={})=>{const r=G.perform(s,a,p);assert.ok(r.ok,r.error);return r.state;};
const read=s=>G.sanitizeSave(G.clone(s));
const key=n=>G.unlockNoticeKey(n);
const ack=s=>act(s,'ackUnlock',{id:key(G.nextUnlockNotice(s))});
const ackResult=s=>act(s,'ackResult',{id:s.eventResult.id});
const ackPlace=s=>s.placeUnlock?act(s,'ackPlaceUnlock',{id:s.placeUnlock.place}):s;
const choose=s=>act(s,'choose',{eventId:s.pending.id,index:0});
const rest=s=>{while(G.nextUnlockNotice(s))s=ack(s);return s;};
function delivery(npc='lin',template='first-order'){
  const s=G.newGame('初见','classic',12345),e=G.EVENTS.find(e=>e.id===template);
  const target=G.NPCS.find(n=>n.id===npc)?.place||'clinic';
  s.flags.firstOrder=true;s.position=target;s.orders=[];s.player.money=500;
  s.pending={...G.clone(e),id:'notice-fixture',templateId:e.id,source:'classic',aiStatus:'skip',
    delivery:{id:'notice-ticket',target,title:'热饭',desc:'送达',condition:'ordinary',expiresAt:s.minutes+30,reward:30,coins:2,npc}};
  return s;
}
function reject(s,a,p={}){
  const before=G.clone(s),r=G.perform(s,a,p);assert.equal(r.ok,false);assert.equal(r.state,s);assert.deepEqual(s,before);
}
function gameplay(s){const c=G.clone(s);delete c.unlockNotices;delete c.revision;delete c.updatedAt;return c;}
const notified=()=>ackPlace(ackResult(choose(delivery())));

test('新旅程没有羁绊或功能提示，不预告未遇见人物',()=>{
  const a=G.newGame('新途'),b=G.newGame('另一新途');assert.deepEqual(a.unlockNotices,[]);
  assert.notEqual(a.unlockNotices,b.unlockNotices);assert.equal(G.nextUnlockNotice(a),null);assert.deepEqual(G.visibleNPCs(a),[]);
});
for(const npc of G.NPCS)test(`首次送达结识 ${npc.name} 后保存一条人物回执，未结算前不提示`,()=>{
  const before=delivery(npc.id);assert.equal(before.bonds[npc.id].met,false);assert.deepEqual(read(before).unlockNotices,[]);
  const s=choose(before);assert.equal(before.bonds[npc.id].met,false);assert.ok(s.bonds[npc.id].met);
  assert.deepEqual(s.unlockNotices,[{kind:'bond',id:npc.id,at:s.minutes},{kind:'feature',id:'bonds',at:s.minutes}]);
  assert.deepEqual(G.visibleNPCs(s).map(n=>n.id),[npc.id]);assert.deepEqual(read(s).unlockNotices,s.unlockNotices);
});
test('耗时配送选择不提前结识或提示，实际完成才生成',()=>{
  let s=choose(delivery('lin','last-bus'));assert.equal(s.activity.kind,'choice');assert.deepEqual(s.unlockNotices,[]);
  s=read(G.advance(s,2));assert.equal(s.bonds.lin.met,false);assert.deepEqual(s.unlockNotices,[]);
  const at=s.minutes+G.activityRemaining(s);s=G.advance(s,100);assert.equal(s.minutes,at);
  assert.equal(s.unlockNotices[0].id,'lin');assert.equal(s.stats.delivered,1);
});
test('结果、地点和人物功能队列按顺序确认，后面的提示不能越过前面的',()=>{
  let s=choose(delivery());reject(s,'ackUnlock',{id:'bond:lin'});reject(s,'ackPlaceUnlock',{id:'clinic'});
  s=ackResult(s);reject(s,'ackUnlock',{id:'bond:lin'});s=ackPlace(s);
  reject(s,'ackUnlock',{id:'feature:system'});reject(s,'ackUnlock',{id:'feature:bonds'});s=ack(s);assert.equal(key(G.nextUnlockNotice(s)),'feature:bonds');
  reject(s,'ackUnlock',{id:'bond:lin'});
  s=ack(s);assert.equal(G.nextUnlockNotice(s),null);reject(s,'ackUnlock',{id:'feature:bonds'});
});
test('确认只移除队首、更新 revision，不改时间、资产、RNG、日志、订单或主线',()=>{
  let s=notified();while(G.nextUnlockNotice(s)){
    const snapshot=gameplay(s),notices=G.clone(s.unlockNotices),before=G.clone(s);const next=ack(s);
    assert.deepEqual(s,before);assert.deepEqual(gameplay(next),snapshot);assert.equal(next.revision,s.revision+1);
    assert.deepEqual(next.unlockNotices,notices.slice(1));s=next;
  }
});
test('未读新提示冻结时间，其他指令原子拒绝，全部确认后可继续',()=>{
  const s=notified();assert.equal(G.advance(s,1440),s);
  for(const a of ['rest','buy','claim','choose','travel','stop','sign','use','transport','continue','cancelDelivery'])reject(s,a,{id:'qi',target:'home',mode:'walk'});
  const done=rest(s);assert.equal(G.advance(done,1).minutes,done.minutes+1);
});
test('第三单后保持下一段主线，解锁提示不覆盖待选剧情',()=>{
  let s=delivery();s.stats.delivered=2;s.unlockedFeatures=['system'];s=choose(s);const pending=G.clone(s.pending);
  assert.equal(pending.templateId,'story-street-vein');s=ackPlace(ackResult(s));reject(s,'choose',{eventId:pending.id,index:0});
  s=rest(read(s));assert.deepEqual(s.pending,{...pending,npcId:null,npcAdvance:false});s=choose(s);assert.equal(s.eventResult.title,pending.title);
});
test('旧地点送达仍可结识新人物，不依赖地点弹窗',()=>{
  let s=delivery();s.unlockedPlaces.push('clinic');s=choose(s);
  assert.equal(s.placeUnlock,null);assert.equal(key(G.nextUnlockNotice(s)),'bond:lin');
});
test('无事件配送也保存人物提示，不伪造事件结果',()=>{
  let result;
  for(let seed=1;seed<100&&!result;seed++){
    let s=delivery();const ticket=s.pending.delivery;s.pending=null;s.position='home';s.orders=[ticket];s.seed=seed*9811;
    s=act(s,'deliver',{id:ticket.id});s=G.advance(s,100);if(!s.pending&&s.stats.delivered===1)result=s;
  }
  assert.ok(result);assert.equal(result.eventResult,null);assert.equal(key(G.nextUnlockNotice(result)),'bond:lin');
});
test('随机相逢按原触发时机结识：先确认人物和羁绊入口，再进入相逢选择',()=>{
  let result;
  for(let seed=1;seed<200&&!result;seed++){
    let s=G.newGame('雨中','classic',seed);s.position='park';s.unlockedPlaces.push('park');
    s.unlockedFeatures=['system','cultivation','practice'];s=act(s,'explore');s=G.advance(s,100);
    if(s.pending.encounterNpc)result=s;
  }
  assert.ok(result);const id=result.pending.encounterNpc,pending=G.clone(result.pending);
  assert.deepEqual(result.unlockNotices,[{kind:'bond',id,at:result.minutes},{kind:'feature',id:'bonds',at:result.minutes}]);
  assert.deepEqual(result.unlockedPlaces,['home','garage','park']);
  result=read(result);reject(result,'choose',{eventId:pending.id,index:0});result=rest(result);
  assert.deepEqual(result.pending,{...pending,npcId:null,npcAdvance:false});assert.ok(choose(result).eventResult);
});
test('原有八项功能使用配置生成一次提示，不包含奖励或任意文本',()=>{
  const s=G.newGame('功能');s.stats.delivered=20;s.flags.systemAwakened=true;s.claimed=['q1'];s.stats.trained=1;s.flags.storyStreetVein=true;s.bonds.lin.met=true;
  const before=G.clone(s);G.syncFeatureUnlocks(s);
  assert.deepEqual(s.unlockNotices.map(n=>n.id),G.FEATURE_UNLOCKS.filter(f=>f.id!=='sect').map(f=>f.id));assert.ok(s.unlockNotices.every(n=>n.kind==='feature'));
  assert.deepEqual(s.player,before.player);assert.equal(s.minutes,before.minutes);assert.equal(s.seed,before.seed);
  const notices=G.clone(s.unlockNotices);G.syncFeatureUnlocks(s);assert.deepEqual(s.unlockNotices,notices);
  const done=rest(s);G.syncFeatureUnlocks(done);assert.deepEqual(done.unlockNotices,[]);
});
test('领取 q1 解锁修行，确认功能不重复领委托奖励',()=>{
  let s=afterAwakening();s=act(s,'claim',{id:'q1'});
  assert.deepEqual(s.unlockNotices.map(key),['feature:cultivation']);const snapshot=gameplay(s);s=ack(s);assert.deepEqual(gameplay(s),snapshot);
  reject(s,'claim',{id:'q1'});
});
test('首次完整吐纳才弹进阶修行，中断不提示',()=>{
  let s=G.newGame('吐纳','classic',999);s.unlockedFeatures=['system','cultivation'];s=act(s,'cultivate',{kind:'breath'});
  let mid=G.advance(s,20);assert.deepEqual(mid.unlockNotices,[]);assert.deepEqual(act(mid,'stop').unlockNotices,[]);
  s=G.advance(mid,100);assert.ok(s.unlockNotices.some(n=>n.kind==='feature'&&n.id==='practice'));assert.equal(s.stats.trained,1);
});
test('进行中领取委托出现功能提示，读档保存原路径及进度，确认不停止或瞬移',()=>{
  let s=G.newGame('在途');s.stats.delivered=1;s.unlockedFeatures=['system'];G.syncFeatureUnlocks(s,true);s=act(s,'travel',{target:'garage'});
  s=G.advance(s,G.activityRemaining(s)*.37);s=act(s,'claim',{id:'q1'});const mid=G.clone(s.activity),loc=G.clone(s.location),minutes=s.minutes;
  assert.equal(key(G.nextUnlockNotice(s)),'feature:cultivation');assert.equal(G.advance(s,100),s);s=read(s);
  assert.deepEqual(s.activity,mid);s=ack(s);assert.deepEqual(s.activity,mid);assert.deepEqual(s.location,loc);assert.equal(s.minutes,minutes);
  assert.ok(G.advance(s,1).minutes>minutes);
});
test('重复配送与功能同步不重播人物、功能，不新增解锁奖励',()=>{
  let s=rest(ackPlace(ackResult(choose(delivery()))));s.pending=delivery().pending;s=choose(s);
  assert.deepEqual(s.unlockNotices,[]);assert.equal(s.placeUnlock,null);assert.equal(s.stats.delivered,2);
  assert.equal(s.logs.filter(l=>l.tag==='相逢').length,1);assert.equal(s.logs.filter(l=>l.tag==='解锁').length,1);
});
test('v16 读档保留队列顺序；确认的项不会重新出现',()=>{
  let s=notified();const names=s.unlockNotices.map(key);s=read(s);assert.deepEqual(s.unlockNotices.map(key),names);
  s=ack(s);s=read(s);assert.deepEqual(s.unlockNotices.map(key),names.slice(1));s=rest(s);assert.deepEqual(read(s).unlockNotices,[]);
});


test('提示只保留白名单字段，不接收显示文本、脚本或奖励注入',()=>{
  const s=notified();Object.assign(s.unlockNotices[0],{effects:{money:99999},name:'<script>alert(1)</script>',feature:'auction'});
  const a=read(s);assert.deepEqual(a.unlockNotices[0],{kind:'bond',id:'lin',at:s.minutes});assert.deepEqual(a.player,s.player);assert.equal(G.featureUnlocked(a,'auction'),false);
});
for(const [label,mutate] of [
  ['缺少队列',s=>delete s.unlockNotices],['非数组',s=>s.unlockNotices={}],['空记录',s=>s.unlockNotices=[null]],
  ['未知类型',s=>s.unlockNotices[0].kind='reward'],['非字符串ID',s=>s.unlockNotices[0].id=1],
  ['未知人物',s=>s.unlockNotices[0].id='ghost'],['未结识',s=>{s.bonds.lin.met=false;s.bonds.lin.affinity=0;}],
  ['未知功能',s=>s.unlockNotices[1].id='__proto__'],['未解锁功能',s=>s.unlockNotices[1].id='auction'],
  ['重复回执',s=>s.unlockNotices.push({...s.unlockNotices[0]})],['时间冲突',s=>s.unlockNotices[0].at++],
  ['无效时间',s=>s.unlockNotices[0].at=NaN],['负时间',s=>s.unlockNotices[0].at=-1],
  ['队列过长',s=>s.unlockNotices=Array.from({length:15},()=>s.unlockNotices[0])],
  ['终局',s=>s.gameOver={reason:'rent',day:7,residenceId:'qingteng',money:0,rent:120}]
])test(`拒绝损坏解锁提示：${label}`,()=>{const s=notified();mutate(s);assert.throws(()=>G.sanitizeSave(s));});
test('房租终局先于结算，不结识人物、不发功能通知',()=>{
  let s=delivery('lin','last-bus');s.minutes=6*1440-4;s.player.money=0;s=choose(s);s=G.advance(s,4);
  assert.ok(s.gameOver);assert.equal(s.bonds.lin.met,false);assert.deepEqual(s.unlockNotices,[]);assert.deepEqual(read(s).unlockNotices,[]);
});
test('AI回包不能越过解锁提示或授权人物、功能；迟到的请求不能覆盖事件',()=>{
  let s=notified();s.mode='ai';const e=G.EVENTS.find(e=>e.id==='rain-lobby')||G.EVENTS.find(e=>e.kind==='delivery'&&e.id!=='first-order');
  s.pending={...G.clone(e),id:'queued-ai-event',templateId:e.id,source:'classic',aiStatus:'unrequested'};
  assert.equal(G.applyAIEvent(s,s.pending.id,{}),s);assert.equal(G.fallbackAI(s,s.pending.id,'late'),s);
  s=rest(s);const source={title:'相逢',text:'点亮街巷。',choices:[{label:'道谢',result:'道别。',effects:{}},{label:'挥手',result:'离开。',effects:{}},{label:'继续',result:'上路。',effects:{}}],unlockNotices:[{kind:'feature',id:'auction'}]};
  const a=G.applyAIEvent(s,s.pending.id,source);assert.deepEqual(a.unlockNotices,[]);assert.equal(G.featureUnlocked(a,'auction'),false);
});

test('耗时配送完成后气血耗尽：结果、地点、人物与功能先读完，再继续救助',()=>{
  let s=delivery('lin','last-bus');s.player.health=1;
  // A controlled adverse choice exercises the real timed completion and rescue path.
  s.pending.choices[0].effects.health=-10;
  s=choose(s);assert.equal(s.activity.kind,'choice');assert.deepEqual(s.unlockNotices,[]);
  s=G.advance(s,100);assert.equal(s.activity.kind,'rescue');assert.ok(s.eventResult);assert.ok(s.placeUnlock);
  assert.deepEqual(s.unlockNotices.map(key),['bond:lin','feature:bonds']);
  assert.equal(G.advance(s,100),s);s=read(s);
  const before=s.minutes,assets=G.clone(s.player);s=rest(ackPlace(ackResult(s)));
  assert.equal(s.minutes,before);assert.equal(s.activity.kind,'rescue');assert.deepEqual(s.player,assets);
  assert.ok(G.advance(s,1).minutes>before);
});
