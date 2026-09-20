import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/js/data.js';
import '../public/js/engine.js';
import '../public/js/storage.js';
import '../public/js/progression.js';
const G=globalThis.NightCourier;
const fresh=(mode='classic')=>G.newGame('灯火未明',mode,67891);
const read=s=>G.sanitizeSave(G.clone(s));
const act=(s,name,p={})=>{const r=G.perform(s,name,p);assert.ok(r.ok,r.error);return r.state;};
const finish=s=>{for(let i=0;s.activity&&!s.gameOver&&i<1000;i++)s=G.advance(s,1);assert.ok(!s.activity||s.gameOver);return s;};
const ack=s=>{
  if(s.eventResult)s=act(s,'ackResult',{id:s.eventResult.id});
  if(s.placeUnlock)s=act(s,'ackPlaceUnlock',{id:s.placeUnlock.place});
  while(G.nextUnlockNotice(s))s=act(s,'ackUnlock',{id:G.unlockNoticeKey(G.nextUnlockNotice(s))});
  return s;
};
const choose=(s,index=0)=>act(ack(s),'choose',{eventId:s.pending.id,index});
const delta=(r,key,delivery=false)=>(delivery?r.delivery.changes:r.changes).find(x=>x.key===key)?.delta||0;
function pending(id='coin',unlocked=false,mode='classic'){
  const s=fresh(mode),e=G.EVENTS.find(e=>e.id===id);
  s.flags.firstOrder=true;s.position='clinic';s.orders=[];
  if(unlocked)s.unlockedFeatures=['system'];
  s.pending={...G.clone(e),id:'coin-gate-event',templateId:e.id,source:'classic',aiStatus:mode==='ai'?'unrequested':'skip',
    delivery:{id:'coin-gate-ticket',target:'clinic',title:'灯火试单',desc:'当面交付',condition:'ordinary',expiresAt:s.minutes+30,reward:30,coins:3,npc:null}};
  return s;
}

for(const mode of ['classic','ai'])for(const index of [0,1,2])test(`${mode} 首单选项 ${index+1}：开局、途中、待选与结算无外卖币，结算后才开系统`,()=>{
  let s=fresh(mode);const original=G.clone(s),ticket=s.orders[0],c=G.EVENTS.find(e=>e.id==='first-order').choices[index];
  assert.ok(ticket.coins>0);assert.equal(G.deliveryCoins(s,ticket),0);assert.deepEqual(s,original);
  s=act(s,'deliver',{id:ticket.id});s=G.advance(s,.2);s=read(s);
  assert.equal(s.player.coins,0);assert.equal(G.featureUnlocked(s,'system'),false);
  s=finish(s);s=ack(s);assert.equal(s.pending.templateId,'first-order');assert.equal(s.stats.delivered,0);
  s=read(s);assert.equal(G.featureUnlocked(s,'system'),false);s=choose(s,index);
  assert.equal(s.player.coins,0);assert.equal(s.player.money,original.player.money+ticket.reward+(c.effects.money||0));
  assert.equal(s.stats.delivered,1);assert.equal(s.daily.delivered,1);assert.ok(G.featureUnlocked(s,'system'));
  assert.equal(delta(s.eventResult,'player.coins'),0);assert.equal(delta(s.eventResult,'player.coins',true),0);
  assert.ok(!s.logs.filter(l=>l.tag==='配送').at(-1).text.includes('外卖币'));
  const receipt=s.eventResult.id,seed=s.seed,at=s.minutes;s=ack(read(s));
  assert.equal(s.player.coins,0);assert.equal(s.seed,seed);assert.equal(s.minutes,at);
  G.syncFeatureUnlocks(s);assert.equal(s.player.coins,0);assert.equal(G.perform(s,'ackResult',{id:receipt}).ok,false);
});

test('解锁前生成的订单保留基础外卖币；首单之后继续接取可正常发奖且不补发首单',()=>{
  let s=fresh();const initial=G.clone(s.orders),first=s.orders[0];
  s=ack(choose(finish(act(s,'deliver',{id:first.id}))));assert.equal(s.player.coins,0);
  const next=s.orders.find(o=>initial.some(x=>x.id===o.id)&&!G.travelBlock(s,G.travelPlan(s,o.target)));
  assert.ok(next);assert.equal(next.coins,initial.find(o=>o.id===next.id).coins);assert.equal(G.deliveryCoins(s,next),next.coins);
  s=finish(act(read(s),'deliver',{id:next.id}));let bonus=0;
  if(s.pending){s=ack(s);bonus=s.pending.choices[0].effects.coins||0;s=finish(choose(s));}
  assert.equal(s.stats.delivered,2);assert.equal(s.player.coins,next.coins+bonus);
  const earned=s.player.coins;s=ack(read(s));assert.equal(s.player.coins,earned);
  assert.equal(G.perform(s,'deliver',{id:next.id}).ok,false);assert.equal(s.player.coins,earned);
});

for(const unlocked of [false,true])test(`经典配送选项与票据奖励共用系统门槛（已解锁=${unlocked}）`,()=>{
  const s=pending('coin',unlocked),before=G.clone(s),c=s.pending.choices[0];
  assert.deepEqual(G.choiceEffects(s,c),unlocked?c.effects:{qi:5});assert.deepEqual(s,before);
  const result=choose(read(s));assert.equal(result.player.coins,unlocked?5:0);assert.equal(result.player.money,150);
  assert.equal(result.player.qi,5);assert.equal(delta(result.eventResult,'player.coins'),unlocked?2:0);
  assert.equal(delta(result.eventResult,'player.coins',true),unlocked?3:0);
  const log=result.logs.find(l=>l.tag==='奇遇');assert.equal(log.text.includes('外卖币'),unlocked);
  assert.equal(G.EVENTS.find(e=>e.id==='coin').choices[0].effects.coins,2);
});

for(const unlocked of [false,true])test(`AI配送的额外外卖币不能绕过门槛，存读后规则不变（已解锁=${unlocked}）`,()=>{
  let s=pending('coin',unlocked,'ai');const raw={title:'额外感谢',text:'客人递来一枚旧币。',choices:[
    {label:'道谢',result:'记下这份善意。',effects:{coins:2,qi:5}},
    {label:'帮忙',result:'放好餐盒。',effects:{money:-3,coins:1}},
    {label:'告别',result:'继续上路。',effects:{rep:1}}]};
  s=G.applyAIEvent(s,s.pending.id,raw);assert.equal(s.pending.source,'ai');s=read(s);
  assert.equal(G.choiceEffects(s,s.pending.choices[0]).coins,unlocked?2:undefined);
  s=choose(s);assert.equal(s.player.coins,unlocked?5:0);assert.equal(s.player.qi,5);
  assert.equal(delta(s.eventResult,'player.coins'),unlocked?2:0);assert.equal(delta(s.eventResult,'player.coins',true),unlocked?3:0);
});

for(const unlocked of [false,true])test(`耗时配送选择直到完成才按系统门槛发币，旧途中存档不重发（已解锁=${unlocked}）`,()=>{
  let s=pending('last-bus',unlocked);s=choose(s);assert.equal(s.activity.kind,'choice');
  s=G.advance(s,2);s=read(s);assert.equal(s.player.coins,0);assert.equal(s.stats.delivered,0);
  s=G.advance(s,3);assert.equal(s.player.coins,unlocked?3:0);assert.equal(s.stats.delivered,1);
  const before=s.player.coins;s=ack(read(s));s=G.advance(s,1);assert.equal(s.player.coins,before);
});

for(const unlocked of [false,true])test(`无随机事件配送也在交付前检查系统，首单统计不能提前开放奖励（已解锁=${unlocked}）`,()=>{
  let s=fresh();s.flags.firstOrder=true;if(unlocked)s.unlockedFeatures=['system'];
  const ticket=s.orders[0];s.position=ticket.target;
  for(let seed=1;seed<100000;seed++){const probe={seed};if(G.rand(probe)>=.55){s.seed=seed;break;}}
  s=act(s,'deliver',{id:ticket.id});assert.equal(s.pending,null);assert.equal(s.stats.delivered,1);
  assert.equal(s.player.coins,unlocked?ticket.coins:0);assert.ok(G.featureUnlocked(s,'system'));
});

test('门槛只过滤未开放的配送正收益，不豁免费用、不影响其他事件、不篡改选项',()=>{
  const s=fresh(),c={effects:{coins:-2,money:4}},bonus={effects:{coins:2,qi:5}};
  assert.deepEqual(G.choiceEffects(s,c,{kind:'delivery'}),c.effects);
  assert.deepEqual(G.choiceEffects(s,bonus,{kind:'explore'}),bonus.effects);
  assert.deepEqual(G.choiceEffects(s,bonus,{kind:'story',delivery:{}}),{qi:5});
  assert.equal(bonus.effects.coins,2);assert.equal(c.effects.coins,-2);
});

test('已有币余额和已结算结果原样保留，读档或确认解锁不追溯补发或清空',()=>{
  let s=pending();s.player.coins=27;s=read(s);assert.equal(s.player.coins,27);assert.equal(G.featureUnlocked(s,'system'),false);
  s=choose(s);assert.equal(s.player.coins,27);s=ack(read(s));assert.equal(s.player.coins,27);
  const old=choose(pending('coin',true));const saved=G.clone(old.eventResult),balance=old.player.coins;
  const restored=read(old);assert.deepEqual(restored.eventResult,saved);assert.equal(ack(restored).player.coins,balance);
});

test('房租破产先于同刻配送与外卖币结算，不触发新系统解锁',()=>{
  let s=pending('last-bus');s.minutes=8640-5;s.player.money=119;
  s=choose(s);s=G.advance(s,5);assert.equal(s.gameOver.reason,'rent');assert.equal(s.player.coins,0);
  assert.equal(s.stats.delivered,0);assert.equal(s.eventResult,null);assert.equal(G.featureUnlocked(s,'system'),false);
});

test('正常签到和委托奖励保持原规则，未解锁时直接调用仍拒绝',()=>{
  const locked=fresh();assert.equal(G.perform(locked,'sign').ok,false);assert.equal(G.perform(locked,'claim',{id:'q1'}).ok,false);
  let s=ack(choose(finish(act(locked,'deliver',{id:locked.orders[0].id}))));assert.equal(s.player.coins,0);
  s=act(s,'sign');assert.equal(s.player.coins,5);const reward=G.QUESTS.find(q=>q.id==='q1').reward.coins;
  s=act(s,'claim',{id:'q1'});assert.equal(s.player.coins,5+reward);
});
