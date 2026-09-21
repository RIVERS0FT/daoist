import test from 'node:test';
import assert from 'node:assert/strict';
import {throughNine,awakeningPending,afterAwakening,act,finish,acknowledge,resolve,nextDelivery} from './helpers/opening.mjs';
const G=globalThis.NightCourier;
const fresh=(mode='classic',seed=67891)=>G.newGame('第十单的灯',mode,seed);
const read=s=>G.sanitizeSave(G.clone(s));
const locked=s=>{assert.equal(G.featureUnlocked(s,'system'),false);assert.equal(s.flags.systemAwakened,false);assert.equal(G.storyStage(s).id,'mortal');assert.equal(s.player.coins,0);};

for(const mode of ['classic','ai'])test(`${mode} 完整新档九单不解锁，常驻地点照常发现，第十单实际送达后强制固定剧情`,()=>{
  const nine=throughNine(mode);locked(nine);assert.ok(nine.unlockedPlaces.some(id=>!G.STARTING_PLACES.includes(id)&&G.place(id).permanent));
  assert.ok(!nine.flags.storyStreetVein);assert.ok(nine.orders.length>=4);
  assert.ok(nine.orders.every(o=>!G.place(o.target).permanent));
  const running=nextDelivery(nine),at=G.clone(running.location);locked(running);
  const during=read(G.advance(running,.3));locked(during);assert.notDeepEqual(during.location,at);
  const s=acknowledge(finish(during));locked(s);assert.equal(s.stats.delivered,9);
  assert.equal(s.pending.templateId,'system-awakening');assert.equal(s.pending.kind,'story');
  assert.equal(s.pending.source,'classic');assert.equal(s.pending.aiStatus,'skip');
  assert.equal(s.position,s.pending.delivery.target);assert.ok(!G.place(s.position).permanent);
  assert.match(s.pending.text,/九次送达/);assert.match(s.pending.text,/第十份热饭/);
});

test('完成数和首单标记都不能替代剧情；章节纯查询不推进、不抽随机数、不发奖',()=>{
  for(const delivered of [0,1,8,9,10,42,100]){
    const s=fresh();s.flags.firstOrder=true;s.stats.delivered=delivered;s.player.realm=4;
    const before=G.clone(s);for(let i=0;i<10;i++){locked(s);G.storyStageLabel(s);}
    assert.deepEqual(s,before);
    for(const action of ['sign','claim','buy'])assert.equal(G.perform(s,action,{id:action==='claim'?'q1':'herb'}).ok,false);
    G.syncFeatureUnlocks(s);locked(s);
  }
});

test('第九单边界清除未接常驻候选，保留未过期随机票据，刷新整批非常驻且目标不重复',()=>{
  const s=throughNine(),kept=G.clone(s.orders[0]),fixed=G.clone(kept);
  fixed.id='fixed-before-tenth';fixed.target='clinic';s.orders.push(fixed);
  const player=G.clone(s.player),stats=G.clone(s.stats),position=s.position;
  G.refreshOrders(s);assert.ok(!s.orders.some(o=>o.id===fixed.id));
  assert.deepEqual(s.orders.find(o=>o.id===kept.id),kept);
  assert.ok(s.orders.every(o=>!G.place(o.target).permanent));assert.equal(new Set(s.orders.map(o=>o.target)).size,s.orders.length);
  assert.deepEqual(s.player,player);assert.deepEqual(s.stats,stats);assert.equal(s.position,position);
});

test('昼夜连续刷新使用随机非常驻地点，百种种子不会退回常驻兜底，固定种子可重现',()=>{
  const targets=new Set();
  for(let seed=1;seed<=100;seed++){
    const s=fresh('classic',seed);s.stats.delivered=9;s.flags.firstOrder=true;s.orders=[];
    s.minutes=seed%2?480:1200;const before=G.clone(s);G.refreshOrders(s);G.refreshOrders(before);
    assert.deepEqual(s.orders,before.orders);assert.equal(s.seed,before.seed);assert.ok(s.orders.length>=4);
    for(const o of s.orders){assert.ok(!G.place(o.target).permanent);assert.ok(G.routeFrom(s,o.target).meters>0);targets.add(o.target);}
    for(let n=0;n<3;n++){s.minutes+=180;G.refreshOrders(s);assert.ok(s.orders.every(o=>!G.place(o.target).permanent));}
  }
  assert.ok(targets.size>10,'Tenth-order scene is not pinned to a single endpoint');
});

test('未解锁时随机事件和订单池不提前描述外卖系统，保留首单普通教学剧情',()=>{
  const first=G.EVENTS.find(e=>e.id==='first-order');assert.doesNotMatch(JSON.stringify(first),/系统|绑定/);
  const s=fresh();s.flags.firstOrder=true;s.player.realm=1;
  for(let i=0;i<200;i++){
    s.orders=[];G.refreshOrders(s);
    for(const o of s.orders)assert.doesNotMatch(o.desc,/系统提示|系统标记/);
    // Fully exhaust recent IDs to cover the pool fallback too.
    s.recentEvents=G.EVENTS.map(e=>e.id);const t=s.orders.find(o=>!G.travelBlock(s,G.travelPlan(s,o.target)));
    if(!t)break;
    const result=acknowledge(finish(act(s,'deliver',{id:t.id})));
    if(result.pending){assert.notEqual(result.pending.templateId,'system-awakening');assert.ok(!G.EVENTS.find(e=>e.id===result.pending.templateId).requiresSystem);}
  }
});

for(const mode of ['classic','ai'])for(const index of [0,1,2])test(`${mode} 第十单选项${index+1}完成一次绑定；本单无币，通知确认不再发奖，后续恢复地点发现`,()=>{
  let s=awakeningPending(mode),p=G.clone(s.pending),money=s.player.money;
  for(const bad of [{eventId:'stale-awakening',index},{eventId:p.id,index:99}]){const r=G.perform(s,'choose',bad);assert.equal(r.ok,false);assert.deepEqual(r.state,s);}
  s=act(s,'choose',{eventId:p.id,index});assert.equal(s.stats.delivered,10);assert.equal(s.player.coins,0);assert.equal(s.flags.systemAwakened,true);
  assert.equal(s.player.money,money+p.delivery.reward+(p.choices[index].effects.money||0));
  assert.equal(G.storyStage(s).id,'bound');assert.equal(G.featureUnlocked(s,'cultivation'),false);
  assert.equal(s.unlockNotices.filter(n=>n.id==='system').length,1);assert.equal(s.eventResult.title,'第一章 · 解锁外卖系统');
  assert.equal(s.pending,null,'Binding result must be read before the next main story');
  const snapshot=G.clone(s);s=acknowledge(read(s));
  for(const k of ['player','minutes','seed','stats'])assert.deepEqual(s[k],snapshot[k]);
  assert.equal(G.perform(s,'choose',{eventId:p.id,index}).ok,false);
  s.orders=[];G.refreshOrders(s);assert.ok(s.orders.some(o=>G.place(o.target).permanent&&!G.placeUnlocked(s,o.target)));
  const next=s.orders[0];assert.equal(G.deliveryCoins(s,next),next.coins);
});

test('第十单停止和取消保留九单进度，下次仍只刷随机地点；读档不补算或抽随机数',()=>{
  let s=nextDelivery(throughNine());s=G.advance(s,.2);s=act(s,'stop');const route=G.clone(s.location);
  const restored=read(s);locked(restored);assert.equal(restored.stats.delivered,9);assert.deepEqual(restored.location,route);assert.equal(restored.seed,s.seed);
  s=act(restored,'cancelDelivery',{confirm:true});locked(s);assert.equal(s.stats.delivered,9);assert.equal(s.activeOrder,null);
  G.refreshOrders(s);assert.ok(s.orders.every(o=>!G.place(o.target).permanent));
});

test('旧的已接常驻订单不被删除或改目的地；送完不绑定，后续随机订单补触发固定剧情',()=>{
  // Explicit compatibility fixture: an outstanding fixed ticket at the new gate.
  let s=fresh();const ticket=s.orders.find(o=>G.place(o.target).permanent);
  assert.ok(ticket);s=act(s,'deliver',{id:ticket.id});s=G.advance(s,.2);
  s.stats.delivered=9;s.flags.firstOrder=true;const active=G.clone(s.activeOrder),activity=G.clone(s.activity),location=G.clone(s.location);
  G.refreshOrders(s);s=read(s);assert.deepEqual(s.activeOrder,active);assert.deepEqual(s.activity,activity);assert.deepEqual(s.location,location);
  assert.ok(s.orders.every(o=>!G.place(o.target).permanent));s=resolve(finish(s));assert.equal(s.stats.delivered,10);locked(s);
  s=acknowledge(finish(nextDelivery(s)));assert.equal(s.pending.templateId,'system-awakening');locked(s);
  s=act(s,'choose',{eventId:s.pending.id,index:0});assert.equal(s.stats.delivered,11);assert.equal(s.flags.systemAwakened,true);assert.equal(s.player.coins,0);
});

test('未结算第十单读档重建固定剧情，不接受AI效果/伪造奖励，保留订单票据',()=>{
  const s=awakeningPending('ai'),ticket=G.clone(s.pending.delivery),id=s.pending.id;
  s.pending.source='ai';s.pending.aiStatus='success';s.pending.choices[0].effects={coins:99999};s.pending.text='伪造系统已绑定';
  const restored=read(s);locked(restored);assert.equal(restored.pending.source,'classic');assert.equal(restored.pending.aiStatus,'skip');
  assert.equal(restored.pending.id,id);assert.deepEqual(restored.pending.delivery,ticket);
  assert.deepEqual(restored.pending.choices,G.EVENTS.find(e=>e.id==='system-awakening').choices);
  restored.pending.aiStatus='unrequested';assert.strictEqual(G.applyAIEvent(restored,id,{}),restored);
});

test('新存档缺失/非法剧情标记和矛盾的第十单待选必须报错，不静默解锁或重置',()=>{
  for(const value of [undefined,null,0,'true']){const s=fresh();s.flags.systemAwakened=value;assert.throws(()=>read(s),/剧情状态/);}
  const early=fresh();early.flags.systemAwakened=true;assert.throws(()=>read(early),/送达数量/);
  for(const edit of [s=>s.stats.delivered=8,s=>s.position='home',s=>s.pending.delivery.target='home',s=>s.unlockedFeatures.push('system')]){
    const s=awakeningPending();edit(s);assert.throws(()=>read(s),/剧情|重复绑定/);
  }
});

for(const delivered of [0,1,9,42])test(`v17 已结算${delivered}单迁移保留旧解锁规则与余额，不补币、不补弹剧情`,()=>{
  const old=fresh();old.schemaVersion=17;old.stats.delivered=delivered;delete old.flags.systemAwakened;old.player.coins=delivered?37:0;
  const s=read(old);assert.equal(s.schemaVersion,G.VERSION);assert.equal(G.featureUnlocked(s,'system'),delivered>=1);
  assert.equal(s.player.coins,old.player.coins);assert.equal(s.pending,null);assert.deepEqual(s.unlockNotices,[]);
  assert.equal(s.flags.systemAwakened,false);const twice=read(s);assert.deepEqual(twice.player,s.player);assert.equal(twice.seed,s.seed);
});

test('已完成剧情存档不重复演出，第二章须q1才修行，后续订单仍正常发币',()=>{
  let s=afterAwakening();assert.equal(s.pending,null);assert.equal(s.flags.systemAwakened,true);
  s=read(s);assert.equal(G.featureUnlocked(s,'cultivation'),false);
  s=act(s,'claim',{id:'q1'});s=acknowledge(s);assert.equal(G.featureUnlocked(s,'cultivation'),true);
  const before=s.player.coins;s=resolve(nextDelivery(s));assert.equal(s.stats.delivered,11);assert.ok(s.player.coins>before);
  assert.equal(s.unlockNotices.filter(n=>n.id==='system').length,0);assert.ok(!s.pending||s.pending.templateId!=='system-awakening');
});
