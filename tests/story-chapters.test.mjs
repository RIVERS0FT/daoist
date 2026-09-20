import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/js/data.js';
import '../public/js/engine.js';
import '../public/js/storage.js';
import '../public/js/progression.js';
const G=globalThis.NightCourier;
const fresh=(mode='classic')=>G.newGame('觉醒行者',mode,67891);
const read=s=>G.sanitizeSave(G.clone(s));
const act=(s,action,p={})=>{const r=G.perform(s,action,p);assert.ok(r.ok,r.error);return r.state;};
const finish=s=>{for(let i=0;s.activity&&!s.gameOver&&i<1000;i++)s=G.advance(s,1);assert.ok(!s.activity);return s;};
const ack=s=>{
  if(s.eventResult)s=act(s,'ackResult',{id:s.eventResult.id});
  if(s.placeUnlock)s=act(s,'ackPlaceUnlock',{id:s.placeUnlock.place});
  while(G.nextUnlockNotice(s))s=act(s,'ackUnlock',{id:G.unlockNoticeKey(G.nextUnlockNotice(s))});
  return s;
};
function assertOpening(s){
  const before=G.clone(s),chapter=G.storyStage(s);
  assert.equal(chapter.id,'mortal');assert.equal(chapter.chapter,'第一章');assert.equal(chapter.title,'系统觉醒');
  assert.equal(G.featureUnlocked(s,'system'),false);assert.deepEqual(s,before);
}
function assertBound(s){
  const chapter=G.storyStage(s);
  assert.equal(chapter.id,'bound');assert.equal(chapter.chapter,'第二章');assert.equal(chapter.title,'初入仙途');
  assert.equal(G.featureUnlocked(s,'system'),true);
}

for(const mode of ['classic','ai'])for(const index of [0,1,2])test(`${mode} 首章选项 ${index+1}：真实抵达、读档仍在觉醒章，完成选择才绑定并进入第二章`,()=>{
  let s=fresh(mode);assertOpening(s);const ticket=G.clone(s.orders[0]),before=G.clone(s.player);
  s=act(s,'deliver',{id:ticket.id});s=G.advance(s,.2);assertOpening(s);s=read(s);assertOpening(s);
  s=ack(finish(s));assert.equal(s.pending.templateId,'first-order');assert.equal(s.flags.firstOrder,true);
  assert.equal(s.pending.title,'第一章 · 系统觉醒');assert.match(s.pending.text,/等待你的回应/);
  assert.doesNotMatch(s.pending.text,/已绑定|绑定完成/);assert.equal(s.pending.source,'classic');assert.equal(s.pending.aiStatus,'skip');
  assertOpening(s);s=read(s);assertOpening(s);
  const eventId=s.pending.id,choice=s.pending.choices[index];
  for(const payload of [{eventId:'stale-event',index},{eventId,index:99}]){
    const original=G.clone(s),r=G.perform(s,'choose',payload);assert.equal(r.ok,false);assert.deepEqual(r.state,original);assertOpening(r.state);
  }
  assert.equal(G.perform(s,'sign').ok,false);assert.equal(G.perform(s,'claim',{id:'q1'}).ok,false);
  s=act(s,'choose',{eventId,index});assertBound(s);assert.equal(s.stats.delivered,1);
  assert.equal(s.player.coins,0);assert.equal(s.player.money,before.money+ticket.reward+(choice.effects.money||0));
  assert.equal(s.player.qi,before.qi+(choice.effects.qi||0));assert.match(s.eventResult.text,/绑定完成|完成绑定/);
  assert.equal(s.eventResult.title,'第一章 · 系统觉醒');assert.equal(G.featureUnlocked(s,'cultivation'),false);
  const player=G.clone(s.player),stats=G.clone(s.stats),minutes=s.minutes,seed=s.seed;
  s=ack(read(s));assertBound(s);assert.deepEqual(s.player,player);assert.deepEqual(s.stats,stats);assert.equal(s.minutes,minutes);assert.equal(s.seed,seed);
  assert.equal(G.perform(s,'choose',{eventId,index}).ok,false);
  s=act(s,'claim',{id:'q1'});assert.equal(G.featureUnlocked(s,'cultivation'),true);assertBound(s);
});

test('首单触发标记不会冒充第一章已完成，章节查询不写入状态',()=>{
  const s=fresh();s.flags.firstOrder=true;const before=G.clone(s);
  for(let i=0;i<5;i++)assertOpening(s);
  assert.deepEqual(s,before);assert.equal(G.featureUnlocked(s,'cultivation'),false);
});

test('绑定门槛复用实际系统所有权，不改变旧档已经拥有的系统',()=>{
  const s=fresh();s.unlockedFeatures=['system'];s.player.coins=27;
  const restored=read(s);assertBound(restored);assert.equal(restored.player.coins,27);assert.equal(restored.stats.delivered,0);
  const before=G.clone(restored);G.storyStage(restored);assert.deepEqual(restored,before);
});

test('v16 已完成首单旧档直接衔接第二章，不重播首单或补币',()=>{
  const s=fresh();s.schemaVersion=16;delete s.sect;s.flags.firstOrder=true;s.stats.delivered=1;s.player.coins=37;
  const restored=read(s);assert.equal(restored.schemaVersion,17);assertBound(restored);assert.equal(restored.player.coins,37);
  assert.equal(restored.pending,null);assert.equal(restored.eventResult,null);assert.deepEqual(restored.unlockNotices,[]);
});

test('旧首单待选按固定模板更新文案，保留票据与未结算进度，不提前跨章',()=>{
  let s=fresh();s=ack(finish(act(s,'deliver',{id:s.orders[0].id})));
  s.pending.title='第一声「叮」';s.pending.text='旧版首单剧情原文。';const pending=G.clone(s.pending);
  s=read(s);assertOpening(s);assert.equal(s.pending.id,pending.id);assert.deepEqual(s.pending.delivery,pending.delivery);
  assert.deepEqual(s.pending.choices,pending.choices);assert.equal(s.pending.title,'第一章 · 系统觉醒');assert.match(s.pending.text,/等待你的回应/);
  assert.equal(s.player.coins,0);assert.equal(s.stats.delivered,0);
});

test('七个阶段 ID、后五章门槛与宗门可选性质保持不变',()=>{
  assert.deepEqual(G.STORY_STAGES.map(e=>e.id),['mortal','bound','second-city','circle','guardian','system','truth']);
  assert.deepEqual(G.STORY_STAGES.map(e=>e.chapter),['第一章','第二章','第三章','第四章','第五章','第六章','第七章']);
  const s=fresh();s.flags.firstOrder=true;s.stats.delivered=1;assertBound(s);
  s.stats.delivered=8;s.player.realm=1;assert.equal(G.storyStage(s).id,'second-city');
  s.bonds.lin.met=true;s.bonds.chen.met=true;assert.equal(G.storyStage(s).id,'circle');
  for(const [delivered,realm,id] of [[18,2,'guardian'],[30,3,'system'],[42,4,'truth']]){
    s.stats.delivered=delivered;s.player.realm=realm;assert.equal(G.storyStage(s).id,id);
  }
  assert.equal(s.sect.invited,false);assert.equal(s.sect.member,false);
});

test('首单叙述与章名一致，绑定不添加新奖励或系统提前开放',()=>{
  const e=G.EVENTS.find(e=>e.id==='first-order'),stage=G.STORY_STAGES[0];
  assert.equal(e.title,`${stage.chapter} · ${stage.title}`);assert.equal(e.kind,'delivery');
  assert.deepEqual(e.choices.map(c=>c.effects),[{karma:2,qi:8},{insight:1,qi:4},{rep:2,money:8}]);
  for(const c of e.choices){assert.ok(!c.duration);assert.ok(!c.itemCost);}
  const s=fresh();assertOpening(s);assert.equal(G.APP_VERSION,'1.10.1');assert.equal(G.VERSION,17);
});


test('已结算的旧首单回执保留原文，读档和确认不重复绑定奖励',()=>{
  let s=fresh();s=ack(finish(act(s,'deliver',{id:s.orders[0].id})));
  s=act(s,'choose',{eventId:s.pending.id,index:0});
  s.eventResult.title='第一声「叮」';s.eventResult.text='老人接过汤，你第一次看见一缕金光落入掌心。';
  const receipt=G.clone(s.eventResult),player=G.clone(s.player),stats=G.clone(s.stats);
  s=read(s);assertBound(s);assert.deepEqual(s.eventResult,receipt);s=ack(s);
  assert.deepEqual(s.player,player);assert.deepEqual(s.stats,stats);assertBound(s);
});
