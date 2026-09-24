import {throughNine, awakeningPending, afterAwakening} from './helpers/opening.mjs';
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
const fresh=(mode='classic')=>G.newGame('初送人间',mode,67891);
const act=(s,action,payload={})=>{const r=G.perform(s,action,payload);assert.ok(r.ok,r.error);return r.state;};
const read=s=>G.sanitizeSave(G.clone(s));
const finish=s=>{for(let i=0;s.activity&&!s.gameOver&&i<1000;i++)s=G.advance(s,1);assert.ok(!s.activity||s.gameOver);return s;};
const ack=s=>{
  if(s.eventResult)s=act(s,'ackResult',{id:s.eventResult.id});
  if(s.placeUnlock)s=act(s,'ackPlaceUnlock',{id:s.placeUnlock.place});
  while(G.nextUnlockNotice(s))s=act(s,'ackUnlock',{id:G.unlockNoticeKey(G.nextUnlockNotice(s))});
  return s;
};
const unlockPending=awakeningPending;
const choose=(s,index=0)=>act(s,'choose',{eventId:s.pending.id,index});
const label=(s,expected)=>assert.equal(G.storyStageLabel(s),expected);

test('前七章配置保留既有 ID 与后五章顺序，系统正式名称统一为外卖系统',()=>{
  assert.equal(G.SYSTEM_NAME,'外卖系统');
  assert.equal(G.FEATURE_UNLOCKS.find(f=>f.id==='system').name,G.SYSTEM_NAME);
  assert.deepEqual(G.STORY_STAGES.slice(0,7).map(s=>s.id),['mortal','bound','second-city','circle','guardian','system','truth']);
  assert.deepEqual(G.STORY_STAGES.slice(0,7).map(s=>s.chapter),['第一章','第二章','第三章','第四章','第五章','第六章','第七章']);
  assert.deepEqual(G.STORY_STAGES.slice(0,7).map(s=>s.title),['解锁外卖系统','初入仙途','城有第二面','夜路同行','阵眼苏醒','系统为何而来','人间即阵心']);
  assert.equal(G.EVENTS.filter(e=>e.kind==='delivery'&&!e.deliveryNpc).length,60);
});

test('章节查询不改状态，首单触发标记不能单独跳到第二章或授予系统',()=>{
  const s=fresh();s.flags.firstOrder=true;const before=G.clone(s);
  for(let i=0;i<4;i++){label(s,'第一章 · 解锁外卖系统');assert.equal(G.featureUnlocked(s,'system'),false);}
  assert.deepEqual(s,before);
});

for(const mode of ['classic','ai'])for(const index of [0,1,2])test(`${mode} 解锁单选项 ${index+1}：途中和待选仍在第一章，实际结算进入第二章且不发解锁单币`,()=>{
  let s=throughNine(mode);label(s,'第一章 · 解锁外卖系统');
  const ticket=G.clone(s.orders[0]);s=act(s,'deliver',{id:ticket.id});
  label(s,'第一章 · 解锁外卖系统');s=read(G.advance(s,.2));label(s,'第一章 · 解锁外卖系统');
  s=ack(finish(s));assert.equal(s.pending.templateId,'system-awakening');assert.equal(s.stats.delivered,9);
  assert.equal(s.pending.source,'classic');assert.equal(s.pending.aiStatus,'skip');
  assert.match(s.pending.text,/第十份热饭/);assert.doesNotMatch(s.pending.text,/绑定完成/);
  label(s,'第一章 · 解锁外卖系统');s=read(s);label(s,'第一章 · 解锁外卖系统');
  const pending=G.clone(s),id=s.pending.id;
  assert.equal(G.applyAIEvent(s,id,{}),s,'固定解锁单不能被 AI 覆盖');
  const invalid=G.perform(s,'choose',{eventId:'stale-event',index});assert.equal(invalid.ok,false);assert.deepEqual(invalid.state,pending);
  s=choose(s,index);label(s,'第二章 · 初入仙途');
  assert.equal(s.stats.delivered,10);assert.equal(s.player.coins,0);
  assert.match(s.eventResult.text,/外卖系统，绑定完成/);
  assert.ok(s.unlockNotices.some(n=>n.kind==='feature'&&n.id==='system'));
  const result=G.clone(s.eventResult),player=G.clone(s.player),minutes=s.minutes,seed=s.seed;
  s=read(s);label(s,'第二章 · 初入仙途');assert.deepEqual(s.eventResult,result);
  s=ack(s);assert.deepEqual(s.player,player);assert.equal(s.minutes,minutes);assert.equal(s.seed,seed);
  assert.equal(G.perform(s,'choose',{eventId:id,index}).ok,false);
  assert.equal(s.logs.filter(l=>l.tag==='解锁'&&l.text.startsWith('玩法开启：外卖系统。')).length,1);
  const next=s.orders[0];assert.equal(G.deliveryCoins(s,next),next.coins);
});

test('首单中断和取消不进入第二章，不授予功能或外卖币',()=>{
  let s=fresh();s=act(s,'deliver',{id:s.orders[0].id});s=G.advance(s,.2);
  s=act(s,'stop');label(s,'第一章 · 解锁外卖系统');
  s=act(s,'cancelDelivery');label(read(s),'第一章 · 解锁外卖系统');
  assert.equal(s.stats.delivered,0);assert.equal(s.player.coins,0);assert.equal(G.featureUnlocked(s,'system'),false);
});

test('耗时解锁单选择读档仍为第一章，只有完成才跨章',()=>{
  const choice=G.EVENTS.find(e=>e.id==='system-awakening').choices[0],duration=choice.duration;
  choice.duration=5;
  try{
    let s=choose(unlockPending());s=G.advance(s,2);s=read(s);
    label(s,'第一章 · 解锁外卖系统');assert.equal(s.activity.kind,'choice');assert.equal(s.stats.delivered,9);
    s=G.advance(s,3);label(s,'第二章 · 初入仙途');assert.equal(s.player.coins,0);assert.equal(s.stats.delivered,10);
  }finally{if(duration===undefined)delete choice.duration;else choice.duration=duration;}
});

test('解锁单选项与房租破产同刻时仍停在第一章，不生成绑定结果',()=>{
  const choice=G.EVENTS.find(e=>e.id==='system-awakening').choices[0],duration=choice.duration;
  choice.duration=5;
  try{
    let s=unlockPending();s.minutes=6*1440-5;s.player.money=119;s=choose(s);s=G.advance(s,5);
    assert.equal(s.gameOver.reason,'rent');label(s,'第一章 · 解锁外卖系统');assert.equal(s.eventResult,null);
    assert.equal(s.stats.delivered,9);assert.equal(G.featureUnlocked(s,'system'),false);
  }finally{if(duration===undefined)delete choice.duration;else choice.duration=duration;}
});

for(const version of [16,17])test(`v${version} 旧首单待选与已解锁存档按真实资格显示章节，保留余额、旧回执和日志`,()=>{
  const initial=fresh();const pending=ack(finish(act(initial,'deliver',{id:initial.orders[0].id})));pending.schemaVersion=version;
  pending.pending.text='万家灯火系统，已绑定。';
  const waiting=read(pending);label(waiting,'第一章 · 解锁外卖系统');assert.doesNotMatch(waiting.pending.text,/万家灯火系统|已绑定/);
  let completed=choose(unlockPending());completed.schemaVersion=version;completed.player.coins=27;
  completed.eventResult.text='历史结果：万家灯火系统，已绑定。';
  const restored=read(completed);label(restored,'第二章 · 初入仙途');
  assert.equal(restored.player.coins,27);assert.deepEqual(restored.eventResult,completed.eventResult);assert.deepEqual(restored.logs.slice(0,completed.logs.length).map(({at,tag,text})=>({at,tag,text})),completed.logs.map(({at,tag,text})=>({at,tag,text})));
  assert.equal(ack(restored).player.coins,27);
});

test('兼容旧档已拥有外卖系统但缺少解锁单标记，不收回能力或重播解锁',()=>{
  const s=fresh();s.unlockedFeatures=['system'];s.player.coins=19;
  const restored=read(s);label(restored,'第二章 · 初入仙途');
  assert.equal(restored.flags.firstOrder,false);assert.equal(restored.player.coins,19);assert.deepEqual(restored.unlockNotices,[]);
});

test('第三至第七章的境界、送达与人物门槛不变',()=>{
  const s=fresh();s.unlockedFeatures=['system'];s.stats.delivered=8;s.player.realm=1;label(s,'第三章 · 城有第二面');
  s.bonds.chen.met=true;s.bonds.lin.met=true;label(s,'第四章 · 夜路同行');
  s.stats.delivered=18;s.player.realm=2;label(s,'第五章 · 阵眼苏醒');
  s.stats.delivered=30;s.player.realm=3;label(s,'第六章 · 系统为何而来');
  s.stats.delivered=42;s.player.realm=4;label(s,'第七章 · 人间即阵心');
});


test('第一章承担解锁目标，提示与解锁单结果归属一致，第二章不重复解锁',()=>{
  const opening=G.STORY_STAGES[0],next=G.STORY_STAGES[1],feature=G.FEATURE_UNLOCKS.find(f=>f.id==='system');
  assert.equal(opening.title,'解锁外卖系统');assert.equal(next.title,'初入仙途');
  assert.match(opening.desc,/在本章解锁外卖系统/);
  assert.match(feature.hint,/先完成九单/);
  assert.match(feature.notice,/第一章「解锁外卖系统」已完成/);
  assert.doesNotMatch(feature.notice,/第二章开始/);
  const s=choose(unlockPending());
  assert.equal(s.eventResult.title,'第一章 · 解锁外卖系统');label(s,'第二章 · 初入仙途');
  assert.equal(s.unlockNotices.filter(n=>n.kind==='feature'&&n.id==='system').length,1);
});

test('进入初入仙途不自动开放修行，仍须领取首个委托且不补发解锁单币',()=>{
  let s=choose(unlockPending());assert.equal(G.featureUnlocked(s,'cultivation'),false);
  const coins=s.player.coins;assert.equal(coins,0);s=ack(read(s));
  label(s,'第二章 · 初入仙途');assert.equal(s.player.coins,coins);
  assert.equal(G.featureUnlocked(s,'cultivation'),false);
  s=act(s,'claim',{id:'q1'});assert.equal(G.featureUnlocked(s,'cultivation'),true);
  label(s,'第二章 · 初入仙途');
});

test('已结算剧情保留历史章名，待选模板更新且不改变票据或资产',()=>{
  const waiting=unlockPending();waiting.pending.title='第一章 · 送外卖';
  const restored=read(waiting);assert.equal(restored.pending.title,'第一章 · 解锁外卖系统');
  assert.deepEqual(restored.pending.delivery,waiting.pending.delivery);assert.deepEqual(restored.player,waiting.player);
  label(restored,'第一章 · 解锁外卖系统');
  const completed=choose(restored);completed.eventResult.title='第一章 · 送外卖';
  const receipt=G.clone(completed.eventResult),player=G.clone(completed.player);
  const loaded=read(completed);assert.deepEqual(loaded.eventResult,receipt);assert.deepEqual(loaded.player,player);
  label(loaded,'第二章 · 初入仙途');assert.deepEqual(ack(loaded).player,player);
});
