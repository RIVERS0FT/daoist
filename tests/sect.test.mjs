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
const fresh=(mode='classic')=>G.newGame('听雨行者',mode,19283);
const act=(s,name,p={})=>{const r=G.perform(s,name,p);assert.ok(r.ok,r.error);return r.state;};
const read=s=>G.sanitizeSave(G.clone(s));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function ack(s){
  if(s.eventResult)s=act(s,'ackResult',{id:s.eventResult.id});
  if(s.placeUnlock)s=act(s,'ackPlaceUnlock',{id:s.placeUnlock.place});
  while(G.nextUnlockNotice(s))s=act(s,'ackUnlock',{id:G.unlockNoticeKey(G.nextUnlockNotice(s))});
  return s;
}
function finish(s){
  for(let i=0;s.activity&&!s.gameOver&&!s.pending&&!s.eventResult&&!G.nextUnlockNotice(s)&&i<5000;i++)s=G.advance(s,Math.min(1,G.activityRemaining(s)));
  assert.ok(!s.activity||s.gameOver||s.pending||s.eventResult||G.nextUnlockNotice(s));return s;
}
function settle(s){
  for(let i=0;i<50;i++){
    s=ack(s);if(s.activity){s=finish(s);continue;}if(!s.pending)break;
    s=act(s,'choose',{eventId:s.pending.id,index:s.pending.choices.findIndex(c=>!G.choiceBlock(s,c))});
  }
  return ack(s);
}
function eligible(mode='classic'){
  const s=fresh(mode);s.player.realm=1;s.unlockedPlaces.push('temple');s.bonds.lu.met=true;
  s.unlockedFeatures=['system','cultivation','practice'];s.flags.firstOrder=true;s.stats.delivered=1;s.claimed=['q1'];
  G.syncFeatureUnlocks(s,true);return s;
}
function invite(mode='classic',index=0){
  let s=eligible(mode);s=finish(act(s,'rest'));assert.equal(s.pending.templateId,'story-sect-invitation');
  return ack(act(s,'choose',{eventId:s.pending.id,index}));
}
function member(mode='classic'){
  let s=invite(mode);s=finish(act(s,'travel',{target:'temple'}));s=ack(s);
  return finish(act(s,'sectJoin'));
}
function reject(s,action,p={},pattern){
  const before=G.clone(s),r=G.perform(s,action,p);assert.equal(r.ok,false);assert.equal(r.state,s);assert.deepEqual(s,before);
  if(pattern)assert.match(r.error,pattern);
}
function fund(s,earned=500,completed=30){s.sect.earned=earned;s.sect.contribution=earned;s.sect.completed=completed;return s;}
const duties=G.SECT.duties;

test('新存档没有宗门入口、引荐、贡献或典籍；查询不授予奖励',()=>{
 const s=fresh(),before=G.clone(s);assert.deepEqual(s.sect,G.emptySect());
 assert.equal(G.panelUnlocked(s,'sect'),false);assert.equal(G.sectTrainingBonus(s),0);
 for(const a of ['sectJoin','sectLeave','sectTask','sectPromote','sectAccept','sectClaim','sectBuy'])reject(s,a,{id:'sweep'});
 assert.deepEqual(s,before);assert.equal(s.unlockedPlaces.includes('temple'),false);assert.equal(s.bonds.lu.met,false);
});
for(const missing of ['realm','place','npc','practice'])test(`缺少 ${missing} 不触发引荐，不凭境界解锁宗门`,()=>{
 let s=eligible();if(missing==='realm')s.player.realm=0;if(missing==='place')s.unlockedPlaces=['home','garage'];if(missing==='npc')s.bonds.lu.met=false;if(missing==='practice')s.unlockedFeatures=[];
 assert.equal(G.sectInvitationReady(s),false);s=finish(act(s,'rest'));assert.equal(s.pending,null);assert.equal(G.featureUnlocked(s,'sect'),false);
});
for(const mode of ['classic','ai'])for(const index of [0,1,2])test(`${mode} 引荐选项 ${index+1}：结算后才开入口，不强制入宗、不发贡献`,()=>{
 let s=eligible(mode);s=act(s,'rest');assert.equal(s.pending,null);s=finish(s);assert.equal(s.sect.invited,false);assert.equal(s.pending.aiStatus,'skip');
 s=read(s);assert.equal(G.featureUnlocked(s,'sect'),false);const pending=s.pending,coins=s.player.coins;
 assert.equal(G.applyAIEvent(s,pending.id,{bad:true}),s);const frozen=G.advance(s,100);assert.equal(frozen,s);
 s=act(s,'choose',{eventId:pending.id,index});assert.equal(s.sect.invited,true);assert.equal(s.sect.member,false);
 assert.equal(s.sect.contribution,0);assert.equal(s.player.coins,coins);assert.equal(s.sect.manuals.length,0);
 assert.ok(s.unlockNotices.some(n=>n.id==='sect'));reject(s,'sectJoin',{},/结果/);
 s=ack(read(s));assert.equal(G.featureUnlocked(s,'sect'),true);reject(s,'choose',{eventId:pending.id,index});
 s=finish(act(s,'rest'));assert.equal(s.pending,null);
});

test('入宗需真实到听雨观；途中重载、取消不入宗，20分钟完成才入宗',()=>{
 let s=invite();reject(s,'sectJoin',{},/沿道路/);const origin=G.playerPoint(s);
 s=act(s,'travel',{target:'temple'});assert.deepEqual(G.playerPoint(s),origin);s=G.advance(s,1);assert.notDeepEqual(G.playerPoint(s),origin);
 s=finish(read(s));s=act(s,'sectJoin');const time=s.minutes,money=s.player.money,coins=s.player.coins;
 assert.equal(s.sect.member,false);reject(s,'sectJoin');s=G.advance(s,10);s=read(s);assert.equal(s.sect.member,false);
 s=act(s,'stop');assert.equal(s.sect.member,false);s=finish(act(s,'sectJoin'));assert.equal(s.sect.member,true);near(s.minutes,time+30);
 assert.equal(s.sect.rank,0);assert.equal(s.player.money,money);assert.equal(s.player.coins,coins);assert.equal(s.sect.contribution,0);
 assert.deepEqual(read(s).sect,s.sect);reject(s,'sectJoin',{},/已经/);
});
for(const id of ['sweep','copy'])test(`${id} 体力连续消耗、灵力一次投入，完成才发贡献；每日名额不被中断或读档重置`,()=>{
 let s=member(),d=G.sectDuty(id),stamina=s.player.stamina,mana=s.player.mana;
 const before=G.clone(s);s=act(s,'sectTask',{id});assert.equal(before.sect.duties.length,0);assert.equal(s.sect.contribution,0);assert.equal(s.player.mana,mana-d.mana);near(s.player.stamina,stamina);
 s=G.advance(s,d.minutes/2);near(s.player.stamina,stamina-d.stamina/2);assert.equal(s.sect.completed,0);s=read(s);
 let stopped=act(s,'stop');reject(stopped,'sectTask',{id},/今日/);assert.equal(read(stopped).sect.contribution,0);
 s=finish(s);assert.equal(s.sect.contribution,d.contribution);assert.equal(s.sect.completed,1);near(s.player.stamina,stamina-d.stamina);assert.equal(s.player.mana,mana-d.mana);
 s=read(s);reject(s,'sectTask',{id},/今日/);s=G.advance(s,G.day(s)*1440-s.minutes);assert.equal(G.sectDutyUsed(s,id),false);
 s=finish(act(s,'sectTask',{id}));assert.equal(s.sect.earned,d.contribution*2);
});
test('不合身份、无效执事、体力或灵力不足均原子失败',()=>{
 const s=member();reject(s,'sectTask',{id:'missing'});reject(s,'sectTask',{id:'ward'},/内门/);
 s.player.stamina=0;reject(s,'sectTask',{id:'sweep'},/体力/);s.player.stamina=100;s.player.mana=0;reject(s,'sectTask',{id:'copy'},/灵力/);
 assert.deepEqual(s.sect.duties,[]);assert.equal(s.sect.dutyDay,0);
});
test('执事跨日使用领取当日名额；午夜房租先于同刻完成，不预支贡献',()=>{
 let s=member();s.minutes=1440-10;s.daily.day=1;s=act(s,'sectTask',{id:'sweep'});s=finish(read(G.advance(s,15)));
 assert.equal(G.day(s),2);assert.equal(s.sect.dutyDay,1);assert.equal(s.sect.contribution,8);assert.equal(G.sectDutyUsed(s,'sweep'),false);
 s.minutes=8640-30;s.player.money=0;s=act(s,'sectTask',{id:'copy'}); // 45 分钟，在午夜前只有30分钟可完成。
 const earned=s.sect.earned;s=G.advance(s,45);assert.equal(s.gameOver.reason,'rent');near(s.minutes,8640);assert.equal(s.sect.earned,earned);
 assert.equal(read(s).sect.earned,earned);
});
test('外送委托只计领取后实际交付，不另造订单，不计取消；回观交还且只能一次',()=>{
 let s=member();const orders=G.clone(s.orders),coins=s.player.coins,time=s.minutes;
 s=act(s,'sectAccept');assert.deepEqual(s.orders,orders);near(s.minutes,time);assert.equal(G.sectCommissionProgress(s),0);assert.equal(s.sect.contribution,0);
 const id=String(s.sect.commission.day);reject(s,'sectAccept');reject(s,'sectClaim',{id},/3 单/);
 let o=s.orders.find(o=>!G.travelBlock(s,G.travelPlan(s,o.target)));
 s=act(s,'deliver',{id:o.id});s=act(s,'stop');s=act(s,'cancelDelivery');assert.equal(G.sectCommissionProgress(s),0);
 for(let n=0;n<3;n++){
   s=read(s);s.player.stamina=G.limits(s).stamina;s.vehicle.battery=G.limits(s).battery;
   const o=[...s.orders].sort((a,b)=>G.travelPlan(s,a.target).meters-G.travelPlan(s,b.target).meters).find(o=>!G.travelBlock(s,G.travelPlan(s,o.target)));
   assert.ok(o);s=settle(finish(act(s,'deliver',{id:o.id})));assert.equal(G.sectCommissionProgress(s),n+1);
 }
 assert.ok(s.player.coins>coins);assert.equal(s.sect.contribution,0);if(s.position!=='temple')reject(s,'sectClaim',{id},/沿道路/);
 s.player.stamina=100;s.vehicle.battery=80;if(s.position!=='temple')s=settle(finish(act(s,'travel',{target:'temple'})));
 s=act(read(s),'sectClaim',{id});assert.equal(s.sect.contribution,20);assert.equal(s.sect.completed,1);assert.equal(s.sect.commission,null);
 reject(s,'sectClaim',{id});reject(read(s),'sectAccept',{},/今日/);
});
test('跨日外送不丢进度，不能重新领取替换；离宗放弃但不刷新当天名额',()=>{
 let s=act(member(),'sectAccept');const task=G.clone(s.sect.commission);s=G.advance(s,G.day(s)*1440-s.minutes+2);s=read(s);
 assert.deepEqual(s.sect.commission,task);reject(s,'sectAccept');s=act(s,'sectLeave');assert.equal(s.sect.commission,null);
 assert.equal(s.sect.commissionDay,task.day);assert.equal(s.sect.contribution,0);reject(s,'sectClaim',{id:String(task.day)});
});
test('晋升必须满足境界、累计贡献、次数和余额；逐级考核，花费不会降低累计贡献',()=>{
 let s=member();reject(s,'sectPromote');s=fund(s);reject(s,'sectPromote',{},/晋升需要/);s.player.realmLevel=5;
 const earned=s.sect.earned;s=act(s,'sectPromote');assert.equal(s.sect.rank,0);assert.equal(s.sect.contribution,earned-20);assert.equal(s.sect.earned,earned);
 reject(s,'sectPromote');reject(s,'sectLeave');s=read(G.advance(s,15));assert.equal(s.sect.rank,0);s=finish(s);assert.equal(s.sect.rank,1);
 reject(s,'sectPromote');s.player.realm=2;s.player.realmLevel=1;s=finish(act(s,'sectPromote'));assert.equal(s.sect.rank,2);
 s.player.realm=3;s=finish(act(s,'sectPromote'));assert.equal(s.sect.rank,3);reject(s,'sectPromote',{},/护法长老/);assert.equal(s.sect.contribution,earned-200);
 assert.equal(read(s).sect.rank,3);
});
test('停止晋升不晋升、不退贡献；同刻租金不足不晋升、不入宗',()=>{
 let s=fund(member());s.player.realmLevel=5;s=act(s,'sectPromote');s=act(G.advance(s,10),'stop');assert.equal(s.sect.rank,0);assert.equal(s.sect.contribution,480);
 for(const action of ['sectPromote','sectJoin']){
   let a=G.clone(s);if(action==='sectJoin'){a.sect.member=false;a.sect.rejoinDay=0;}const duration=action==='sectJoin'?20:30;
   a.minutes=8640-duration;a.player.money=0;a=act(a,action);a=G.advance(a,duration);assert.equal(a.gameOver.reason,'rent');assert.equal(a.sect.rank,0);
   if(action==='sectJoin')assert.equal(a.sect.member,false);
 }
});
test('藏经阁按身份扣贡献，典籍不可重复或替代丹方渠道；满行囊原子拒绝',()=>{
 let s=fund(member());const money=s.player.money,coins=s.player.coins,recipes=G.clone(s.alchemy.formulas),time=s.minutes;
 reject(s,'sectBuy',{id:'steady-heart'},/内门/);reject(s,'sectBuy',{id:'fake'});
 s=act(s,'sectBuy',{id:'rain-breath'});assert.deepEqual(s.sect.manuals,['rain-breath']);assert.equal(s.sect.contribution,470);assert.equal(s.sect.earned,500);near(G.sectTrainingBonus(s),.1);
 reject(read(s),'sectBuy',{id:'rain-breath'},/已经/);s=act(s,'sectBuy',{id:'herbs'});assert.equal(s.inventory.herb,3);assert.equal(s.sect.contribution,462);
 s=act(s,'sectBuy',{id:'qi-pill'});assert.equal(s.inventory.qi,2);s.inventory.herb=9998;reject(s,'sectBuy',{id:'herbs'},/上限/);
 assert.equal(s.player.money,money);assert.equal(s.player.coins,coins);near(s.minutes,time);assert.deepEqual(s.alchemy.formulas,recipes);
});
test('宗门身份、典籍加成真正进入修炼、突破、炼药；离宗只停身份福利',()=>{
 let s=fund(member());s.player.realm=2;s=finish(act(s,'sectPromote'));s=finish(act(s,'sectPromote'));s=ack(s);
 s=act(s,'sectBuy',{id:'rain-breath'});s=act(s,'sectBuy',{id:'steady-heart'});s=act(s,'sectBuy',{id:'gentle-fire'});
 const base=G.clone(s);base.sect=G.emptySect();near(G.sectTrainingBonus(s),.18);
 near(G.breakChance(s)-G.breakChance(base),3);near(G.alchemyChance(s,G.ALCHEMY_RECIPES[0])-G.alchemyChance(base,G.ALCHEMY_RECIPES[0]),.03);
 s.player.stamina=100;base.player.stamina=100;let a=G.advance(act(s,'cultivate',{kind:'breath'}),10),b=G.advance(act(base,'cultivate',{kind:'breath'}),10);
 near((a.player.qi-s.player.qi)/(b.player.qi-base.player.qi),1.18);
 s=act(s,'sectLeave');near(G.sectTrainingBonus(s),.1);assert.equal(s.sect.rank,2);assert.equal(s.sect.manuals.length,3);
 for(const a of ['sectTask','sectPromote','sectAccept','sectBuy'])reject(s,a,{id:'herbs'},/加入/);
 reject(s,'sectJoin',{},/重新入宗/);const retained=G.clone(s.sect);s=G.advance(s,G.day(s)*1440-s.minutes);s=finish(act(read(s),'sectJoin'));
 assert.equal(s.sect.earned,retained.earned);assert.equal(s.sect.contribution,retained.contribution);assert.equal(s.sect.rank,2);near(G.sectTrainingBonus(s),.18);
});
test('典籍加成不突破原概率上限，订单外卖币规则不变',()=>{
 const s=fund(member());s.player.realm=3;s.sect.rank=3;s.sect.contribution=100;s.sect.manuals=['rain-breath','steady-heart','gentle-fire'];
 s.player.insight=99;s.player.karma=50;s.alchemy.cauldron=24;s.alchemy.xp=99999;
 assert.equal(G.breakChance(s,9),95);assert.equal(G.alchemyChance(s,G.ALCHEMY_RECIPES[0]),.98);
 const ticket={coins:6};assert.equal(G.deliveryCoins(s,ticket),6);assert.equal(G.deliveryCoins(fresh(),ticket),0);
});
for(const [key,value] of Object.entries({missing:undefined,negative:{contribution:-1},counter:{earned:0,contribution:10},rank:{rank:6},manual:{manuals:['evil']},repeat:{manuals:['rain-breath','rain-breath']},duty:{duties:['unknown']},day:{dutyDay:99999},member:{invited:false},clock:{joinedAt:Infinity},orphan:{commission:{}},paid:{rank:1,contribution:500}}))test(`损坏宗门记录拒绝而不重置：${key}`,()=>{
 const s=fund(member());s.player.realmLevel=5;if(key==='missing')delete s.sect;else Object.assign(s.sect,value);assert.throws(()=>read(s));
});
for(const mutation of [a=>a.elapsed=-1,a=>a.startedAt+=1,a=>a.duration=1,a=>a.recovery={qi:9},a=>a.route={points:[]},a=>a.phase='travel',a=>a.params.day=2,a=>a.params.id='ward'])test('损坏执事在途状态、额外收益或领取关系拒绝',()=>{
 const s=act(member(),'sectTask',{id:'sweep'});mutation(s.activity);assert.throws(()=>read(s));
});
test('现代宗门存档只保留白名单，AI和额外字段不授予宗门资源',()=>{
 const s=member();s.sect.effects={money:9999};s.sect.html='<script>alert(1)</script>';const a=read(s);assert.equal(a.sect.effects,undefined);assert.equal(a.sect.html,undefined);
 assert.throws(()=>G.validateAIEvent({title:'宗门',text:'越权',choices:Array.from({length:3},()=>({label:'入宗',result:'得到贡献',effects:{contribution:50}}))}));
 let p=finish(act(eligible('ai'),'rest'));p.pending.source='ai';p.pending.title='恶意改写';p.pending.choices=[{effects:{money:9999}}];p=read(p);
 assert.equal(p.pending.source,'classic');assert.equal(p.pending.aiStatus,'skip');assert.equal(p.pending.title,'山门为谁而开');assert.equal(p.pending.choices.length,3);
});


test('等量不同时间切片的执事结果、资源、订单和随机源一致；纯查询无副作用',()=>{
 const initial=act(member(),'sectTask',{id:'copy'}),one=G.advance(initial,45);let split=initial;for(let i=0;i<450;i++)split=G.advance(split,.1);
 near(split.minutes,one.minutes);near(split.player.stamina,one.player.stamina);assert.deepEqual(split.sect,one.sect);assert.equal(split.seed,one.seed);
 for(let i=0;i<one.orders.length;i++){near(split.orders[i].expiresAt,one.orders[i].expiresAt);assert.deepEqual({...split.orders[i],expiresAt:0},{...one.orders[i],expiresAt:0});}
 const before=G.clone(one);for(let i=0;i<10;i++){G.sectBlock(one,'sectTask',{id:'copy'});G.sectDutyUsed(one,'sweep');G.sectCommissionProgress(one);G.sectTrainingBonus(one);G.sectPromotionHint(G.SECT.ranks[1]);}
 assert.deepEqual(one,before);
});
