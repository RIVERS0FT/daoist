import {throughNine, awakeningPending, afterAwakening} from './helpers/opening.mjs';
import test from 'node:test';
// Current-schema contracts retained after removal of migration tests.
test('当前档已经完成的解锁单回执和历史日志不重写、不回退绑定、不追溯补币',()=>{
  let s=unlockPending();s=act(s,'choose',{eventId:s.pending.id,index:0});
  s.eventResult.title='第一声「叮」';s.eventResult.text='万家灯火系统，已绑定。';
  s.logs.push({id:'saved-binding',at:s.minutes,tag:'奇遇',text:'万家灯火系统，已绑定。'});
  const result=G.clone(s.eventResult),player=G.clone(s.player);
  const restored=read(s);assert.deepEqual(restored.eventResult,result);assert.deepEqual(restored.player,player);
  assert.equal(restored.logs.at(-1).text,'万家灯火系统，已绑定。');
  assert.equal(G.storyStage(restored).id,'bound');assert.equal(G.storyStage(ack(restored)).id,'bound');
});

test('当前档永久权限保持有效，新档独立保留第一章，取消首次配送不能完成绑定',()=>{
  const legacy=fresh();legacy.unlockedFeatures=['system'];
  assert.equal(G.storyStage(read(legacy)).id,'bound');
  let s=fresh();s=act(s,'deliver',{id:s.orders[0].id});s=G.advance(s,.2);
  s=act(s,'stop');assert.equal(G.storyStage(s).id,'mortal');
  s=act(s,'cancelDelivery',{confirm:true});assert.equal(G.storyStage(read(s)).id,'mortal');
  assert.equal(s.player.coins,0);assert.equal(s.stats.delivered,0);assert.deepEqual(s.unlockedFeatures,[]);
});
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import '../public/js/city-data.js';
import '../public/js/data.js';
import '../public/js/sects.js';
import '../public/js/engine.js';
import '../public/js/sect-engine.js';
import '../public/js/sect-stories.js';
import '../public/js/storage.js';
import '../public/js/progression.js';
const G=globalThis.NightCourier;
const fresh=(mode='classic')=>G.newGame('首章骑手',mode,67891);
const read=s=>G.sanitizeSave(G.clone(s));
const act=(s,action,payload={})=>{const r=G.perform(s,action,payload);assert.ok(r.ok,r.error);return r.state;};
const finish=s=>{for(let i=0;s.activity&&!s.gameOver&&i<1000;i++)s=G.advance(s,1);assert.ok(!s.activity||s.gameOver);return s;};
const ack=s=>{
  if(s.eventResult)s=act(s,'ackResult',{id:s.eventResult.id});
  if(s.placeUnlock)s=act(s,'ackPlaceUnlock',{id:s.placeUnlock.place});
  while(G.nextUnlockNotice(s))s=act(s,'ackUnlock',{id:G.unlockNoticeKey(G.nextUnlockNotice(s))});
  return s;
};
const unlockPending=awakeningPending;

test('外卖系统正式名称统一，保留首章配送与七章稳定ID',()=>{
  assert.equal(G.SYSTEM_NAME,'外卖系统');
  assert.equal(G.FEATURE_UNLOCKS.find(f=>f.id==='system').name,G.SYSTEM_NAME);
  assert.deepEqual(G.STORY_STAGES.slice(0,7).map(s=>s.id),['mortal','bound','second-city','circle','guardian','system','truth']);
  assert.equal(G.STORY_STAGES[0].title,'解锁外卖系统');
  assert.equal(G.STORY_STAGES[1].title,'初入仙途');
  assert.equal(G.EVENTS.find(e=>e.id==='system-awakening').title,'第一章 · 解锁外卖系统');
  assert.match(G.EVENTS.find(e=>e.id==='system-awakening').text,/第十份热饭/);
  for(const e of G.EVENTS.find(e=>e.id==='system-awakening').choices)assert.match(e.result,/外卖系统/);
});

test('解锁单已触发标记不再等于第一章完成，章节查询不授予权限或改写状态',()=>{
  const s=fresh();s.flags.firstOrder=true;const before=G.clone(s);
  for(let i=0;i<30;i++){
    assert.equal(G.storyStage(s).id,'mortal');assert.equal(G.STORY_STAGES[1].ready(s),false);
    assert.equal(G.featureUnlocked(s,'system'),false);
  }
  assert.deepEqual(s,before);
  for(const action of ['sign','claim','buy']){
    const r=G.perform(s,action,{id:action==='claim'?'q1':'herb'});
    assert.equal(r.ok,false);assert.strictEqual(r.state,s);assert.match(r.error,/外卖系统/);
  }
});

for(const mode of ['classic','ai'])for(const index of [0,1,2])test(`${mode} 第十单选项${index+1}：接单/途中/待选/读档不跳章，结算后绑定且解锁单无外卖币`,()=>{
  let s=throughNine(mode);const ticket=G.clone(s.orders[0]);
  assert.equal(G.storyStage(s).title,'解锁外卖系统');
  s=act(s,'deliver',{id:ticket.id});assert.equal(G.storyStage(s).id,'mortal');
  s=read(G.advance(s,.2));assert.ok(s.activity);assert.equal(G.storyStage(s).id,'mortal');
  s=ack(finish(s));assert.equal(s.pending.templateId,'system-awakening');assert.equal(s.flags.firstOrder,true);
  assert.equal(s.stats.delivered,9);assert.equal(G.storyStage(s).id,'mortal');
  assert.equal(s.pending.source,'classic');assert.equal(s.pending.aiStatus,'skip');
  s=read(s);assert.equal(G.storyStage(s).id,'mortal');
  const before=G.clone(s),choice=s.pending.choices[index];
  s=act(s,'choose',{eventId:s.pending.id,index});
  assert.equal(s.stats.delivered,10);assert.equal(s.player.coins,0);
  assert.equal(s.player.money,before.player.money+ticket.reward+(choice.effects.money||0));
  assert.equal(s.player.qi,before.player.qi+(choice.effects.qi||0));
  assert.equal(G.storyStage(s).id,'bound');assert.equal(G.storyStage(s).title,'初入仙途');
  assert.equal(s.unlockedFeatures.filter(id=>id==='system').length,1);
  assert.equal(s.unlockNotices.filter(n=>n.kind==='feature'&&n.id==='system').length,1);
  assert.equal(s.eventResult.title,'第一章 · 解锁外卖系统');assert.match(s.eventResult.text,/外卖系统/);
  const receipt=s.eventResult.id,at=s.minutes,balance=s.player.coins;
  s=ack(read(s));assert.equal(G.storyStage(s).id,'bound');assert.equal(s.minutes,at);assert.equal(s.player.coins,balance);
  G.syncFeatureUnlocks(s);assert.equal(s.unlockNotices.length,0);
  assert.equal(G.perform(s,'ackResult',{id:receipt}).ok,false);
  assert.equal(G.perform(s,'choose',{eventId:before.pending.id,index}).ok,false);
});







test('正式名称替换不误改万家灯火任务与结局，主线丹方来源仍与事件名称一致',()=>{
  assert.equal(G.QUESTS.find(q=>q.id==='q2').title,'万家灯火');
  assert.equal(G.ENDINGS.guardian.title,'万家灯火');
  assert.equal(G.EVENTS.find(e=>e.id==='story-system-truth').title,'万家灯火，不属于任何人');
  const source=G.FORMULA_STORY_SOURCES.find(s=>s.event==='story-system-doubt');
  assert.equal(source.label,G.EVENTS.find(e=>e.id===source.event).title);
  for(const path of ['public/js/data.js','public/js/progression.js','public/js/app.js','server.mjs']){
    assert.ok(!readFileSync(new URL('../'+path,import.meta.url),'utf8').includes('万家灯火系统'),path);
  }
});
