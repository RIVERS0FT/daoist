import test from 'node:test';
// Current-schema contracts retained after removal of migration tests.
for(const mode of ['classic','ai'])test(`${mode} 满级当前档仍依次经历十场，不因境界或计数跳过章节`,()=>{
  let s=veteran(0,mode);s.player.realm=9;s.player.realmLevel=9;s.stats.delivered=150;
  const ids=[];
  for(const e of events){s=prompt(s,e.id);ids.push(s.pending.templateId);
    assert.equal(G.storyStage(s).id,e.higherChapter);s=finish(choose(read(s)));assert.equal(s.pending,null);s=ack(read(s));}
  assert.deepEqual(ids,events.map(e=>e.id));assert.equal(G.storyStageLabel(s),'第十二章 · 劫尽见人间');
  const qi=s.player.qi;s=finish(act(s,'rest'));assert.equal(s.pending,null);assert.equal(s.player.qi,qi);
  assert.equal(G.realmLabel(s),'渡劫九重');assert.equal(G.realmNeed(s),0);assert.equal(s.ending,null);assert.equal(s.gameOver,null);
});

test('当前存档缺失新键显式补false，不发奖、不抽随机数、不自动播放；待选缺标记仍可恢复',()=>{
  const s=veteran();for(const e of events)delete s.flags[e.flag];const p=G.clone(s.player),seed=s.seed,at=s.minutes;
  const restored=read(s);assert.ok(events.every(e=>restored.flags[e.flag]===false));assert.deepEqual(restored.player,p);
  assert.equal(restored.seed,seed);assert.equal(restored.minutes,at);assert.equal(restored.pending,null);assert.equal(restored.eventResult,null);
  const pending=prompt(restored,events[0].id);delete pending.flags[events[0].flag];
  const recovered=read(pending);assert.ok(recovered.flags[events[0].flag]);assert.equal(G.storyEventComplete(recovered,events[0].id),false);
});
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
const chapters=G.HIGHER_STORY_CHAPTERS;
const events=chapters.flatMap(c=>c.events.map(id=>G.EVENTS.find(e=>e.id===id)));
const act=(s,action,p={})=>{const r=G.perform(s,action,p);assert.ok(r.ok,`${action}: ${r.error}`);return r.state;};
const read=s=>G.sanitizeSave(G.clone(s));
const finish=s=>{for(let i=0;s.activity&&!s.gameOver&&i<2000;i++)s=G.advance(s,1);assert.ok(!s.activity||s.gameOver);return s;};
const ack=s=>{
  if(s.eventResult)s=act(s,'ackResult',{id:s.eventResult.id});
  if(s.placeUnlock)s=act(s,'ackPlaceUnlock',{id:s.placeUnlock.place});
  while(G.nextUnlockNotice(s))s=act(s,'ackUnlock',{id:G.unlockNoticeKey(G.nextUnlockNotice(s))});
  return s;
};
// A pre-existing advanced save, not an assertion that realm progression was played end-to-end.
// New scenes below are triggered and settled only by perform/advance.
function veteran(index=0,mode='classic'){
  const chapter=chapters[index],s=G.newGame('故城行者',mode,87651);
  s.player.realm=chapter.realm;s.stats.delivered=chapter.deliveries;s.flags.firstOrder=true;s.flags.systemAwakened=true;
  s.player.money=5000;s.player.qi=100;s.player.mana=G.limits(s).mana;s.player.stamina=G.limits(s).stamina;
  s.unlockedFeatures=['system','cultivation','practice'];s.claimed=['q1'];
  for(const e of G.EVENTS.filter(e=>e.kind==='story'&&e.flag&&!e.higherChapter&&e.id!=='story-sect-invitation'))s.flags[e.flag]=true;
  for(const c of chapters.slice(0,index))for(const id of c.events)s.flags[G.EVENTS.find(e=>e.id===id).flag]=true;
  return read(s);
}
function prompt(s,id){
  s=ack(s);assert.equal(s.pending,null);s=act(s,'rest');assert.equal(s.pending,null);
  s=finish(s);assert.equal(s.pending?.templateId,id);assert.equal(s.pending.source,'classic');assert.equal(s.pending.aiStatus,'skip');
  return s;
}
const choose=(s,index=0)=>act(s,'choose',{eventId:s.pending.id,index});
const invalid=(s,action,p)=>{const before=G.clone(s),r=G.perform(s,action,p);assert.equal(r.ok,false);assert.strictEqual(r.state,s);assert.deepEqual(s,before);};
const ai={title:'不应替换的内容',text:'这是模拟AI文本。',choices:[0,1,2].map(i=>({label:`选择${i}`,result:'虚构的变化',effects:{qi:20}}))};

test('十二章保留原ID顺序，新增五境十场与三十个不同回应，全部有无成本选项',()=>{
  assert.equal(G.APP_VERSION,'1.20.1');assert.equal(G.VERSION,23);assert.equal(G.STORY_STAGES.length,12);
  assert.deepEqual(G.STORY_STAGES.slice(7).map(c=>[c.id,c.realm,c.deliveries]),[
    ['divine',5,54],['void',6,68],['unity',7,84],['mahayana',8,102],['tribulation',9,122]]);
  assert.equal(events.length,10);assert.equal(new Set(events.map(e=>e.id)).size,10);
  assert.equal(new Set(G.EVENTS.map(e=>e.id)).size,G.EVENTS.length);
  assert.equal(new Set(G.STORY_FLAG_KEYS).size,G.STORY_FLAG_KEYS.length);
  for(const e of events){assert.ok(G.STORY_FLAG_KEYS.includes(e.flag));assert.equal(e.choices.length,3);assert.ok(e.text.length>100);
    assert.ok(e.choices.some(c=>!c.duration&&Object.values(c.effects).every(n=>n>=0)));
    assert.equal(new Set(e.choices.map(c=>c.result)).size,3);assert.ok(e.choices.every(c=>c.result.length<600));
    assert.ok(e.choices.every(c=>!('coins' in c.effects)&&!('money' in c.effects)&&!c.path));}
});

for(const [i,chapter] of chapters.entries())test(`${chapter.chapter}：境界、配送和前章实际完成缺一不可，查询只读`,()=>{
  const s=veteran(i),first=events[i*2],previous=G.EVENTS.find(e=>e.id===chapter.previous);
  assert.ok(first.ready(s));assert.equal(G.storyStage(s).id,chapter.id);const snapshot=G.clone(s);
  for(let k=0;k<5;k++){G.storyStage(s);G.higherChapterReady(s,chapter);G.storyEventComplete(s,previous.id);}assert.deepEqual(s,snapshot);
  for(const mutate of [x=>x.player.realm--,x=>x.stats.delivered--,x=>x.flags[previous.flag]=false,
    x=>{x.pending={...G.clone(previous),id:'waiting-previous',templateId:previous.id,source:'classic',aiStatus:'skip'};},
    x=>{x.activity={kind:'choice',params:{event:{templateId:previous.id}}};}]){
    const x=G.clone(s);mutate(x);assert.equal(first.ready(x),false);assert.notEqual(G.storyStage(x).id,chapter.id);
  }
  const locked=G.newGame('尚未绑定','classic',91);locked.player.realm=9;locked.stats.delivered=200;locked.flags[previous.flag]=true;
  assert.equal(first.ready(locked),false);assert.equal(G.storyStage(locked).id,'mortal');
});

for(const [i,chapter] of chapters.entries())for(const mode of ['classic','ai'])for(const index of [0,1,2])test(`${chapter.chapter} ${mode} 选项${index+1}：两段真实行动触发、读档、成本与结果一次性结算`,()=>{
  let s=veteran(i,mode);const first=events[i*2],second=events[i*2+1];
  s=prompt(s,first.id);const wait=G.clone(s);assert.deepEqual(G.advance(s,100),s);
  assert.equal(G.storyEventComplete(s,first.id),false);assert.equal(second.ready(s),false);
  const p=s.pending;assert.strictEqual(G.applyAIEvent(s,p.id,ai),s);
  invalid(s,'choose',{eventId:'old',index});invalid(s,'choose',{eventId:p.id,index:99});
  s=read(s);assert.deepEqual(s.pending.choices,p.choices);const qi=s.player.qi;
  s=finish(choose(s,index));assert.equal(s.player.qi,qi+first.choices[index].effects.qi);
  assert.equal(s.eventResult.text,first.choices[index].result);assert.equal(s.eventResult.delivery,null);assert.equal(s.pending,null);
  assert.ok(G.storyEventComplete(s,first.id));const balance=G.clone(s.player),time=s.minutes,seed=s.seed,turn=s.turn;
  s=ack(read(s));assert.deepEqual(s.player,balance);assert.equal(s.minutes,time);assert.equal(s.seed,seed);assert.equal(s.turn,turn);
  invalid(s,'choose',{eventId:p.id,index});assert.equal(second.ready(s),false);
  // The extra two deliveries are an explicit milestone fixture; prompt/choices remain real.
  s.stats.delivered=chapter.deliveries+1;assert.equal(second.ready(s),false);
  s.stats.delivered++;assert.ok(second.ready(s));s=prompt(s,second.id);
  const eventId=s.pending.id,c=second.choices[index],before=G.clone(s.player),at=s.minutes;
  s=choose(s,index);
  if(c.duration){
    assert.equal(s.eventResult,null);assert.equal(s.player.qi,before.qi);assert.equal(G.storyEventComplete(s,second.id),false);
    s=G.advance(s,c.duration/2);const mid=G.clone(s);s=read(s);assert.deepEqual(s.player,mid.player);
    assert.equal(s.activity.elapsed,mid.activity.elapsed);assert.equal(G.storyEventComplete(s,second.id),false);
  }
  s=finish(s);assert.equal(s.minutes,at+(c.duration||0));assert.equal(s.player.qi,before.qi+c.effects.qi);
  for(const key of ['mana','stamina'])if(c.effects[key]<0)assert.equal(s.player[key],before[key]+c.effects[key]);
  assert.equal(s.player.money,before.money);assert.equal(s.player.coins,before.coins);
  assert.equal(s.eventResult.text,c.result);assert.equal(s.pending,null);assert.ok(G.storyEventComplete(s,second.id));
  const settled=G.clone(s.player);s=ack(read(s));invalid(s,'choose',{eventId:eventId,index});assert.deepEqual(s.player,settled);
  assert.equal(s.ending,null);assert.equal(s.gameOver,null);assert.equal(s.position,wait.position);
});



test('第七章待选和耗时途中均不放行第八章；选择完成后下个世界行动才触发',()=>{
  let s=veteran(),truth=G.EVENTS.find(e=>e.id==='story-system-truth');
  s.flags.storySystemTruth=false;s=prompt(s,truth.id);assert.equal(G.storyStage(s).id,'truth');
  s=choose(s,0);assert.equal(s.pending,null);const saved=read(s);assert.ok(saved.eventResult);
  s=ack(saved);assert.equal(s.pending,null);s=prompt(s,events[0].id);assert.equal(G.storyStage(s).id,'divine');
});

test('开始、停止、纯空闲、渲染查询、读档和即时兑换不注入高境界剧情',()=>{
  let s=veteran();const original=G.clone(s);read(s);G.storyStageLabel(s);assert.deepEqual(s,original);
  s=G.advance(s,1);assert.equal(s.pending,null);s=act(s,'rest');s=G.advance(s,1);assert.equal(s.pending,null);
  s=act(s,'stop');assert.equal(s.pending,null);s=act(s,'sign');assert.equal(s.pending,null);
  s=prompt(s,events[0].id);assert.ok(s.pending);
});

test('新剧情不抢占已有随机事件、结局或未确认结果，确认动作不注入剧情',()=>{
  const e=events[0],base=veteran();
  for(const mutate of [s=>s.pending={templateId:'rain'},s=>s.ending='ascend',s=>s.eventResult={id:'wait'},s=>s.placeUnlock={place:'clinic'},
    s=>s.unlockNotices=[{kind:'feature',id:'system',at:s.minutes}]]){
    const s=G.clone(base);mutate(s);G.afterWorldAction(s,'rest');assert.equal(s.flags[e.flag],false);
  }
});

test('新待选从经典模板恢复，AI文本、虚构奖励和NPC/配送票据不能混入',()=>{
  const original=prompt(veteran(0,'ai'),events[0].id),raw=G.clone(original);
  Object.assign(raw.pending,ai,{source:'ai',aiStatus:'unrequested'});
  const s=read(raw);assert.equal(s.pending.source,'classic');assert.equal(s.pending.aiStatus,'skip');
  assert.equal(s.pending.text,events[0].text);assert.deepEqual(s.pending.choices,events[0].choices);
  const tampered=G.clone(s);tampered.pending.aiStatus='unrequested';assert.strictEqual(G.applyAIEvent(tampered,tampered.pending.id,ai),tampered);
  for(const mutation of [x=>x.pending.delivery={target:'home'},x=>x.pending.npcId='lin',x=>x.pending.kind='delivery',
    x=>x.flags.storySystemTruth=false,x=>x.player.realm=4,x=>x.stats.delivered=53]){const x=G.clone(s);mutation(x);assert.throws(()=>read(x));}
});



test('新标记类型错误、越章记录拒绝读取；历史回执文本仍保留且确认不重发',()=>{
  for(const value of [null,1,'true',[],{}]){const s=veteran();s.flags[events[0].flag]=value;assert.throws(()=>read(s),/标记/);}
  const skip=veteran();skip.flags[events[2].flag]=true;assert.throws(()=>read(skip),/进度/);
  let s=choose(prompt(veteran(),events[0].id));s.eventResult.title='旧版已经结算的标题';s.eventResult.text='历史回执原文。';
  const r=G.clone(s.eventResult),p=G.clone(s.player);s=read(s);assert.deepEqual(s.eventResult,r);s=ack(s);assert.deepEqual(s.player,p);
});

test('耗时收束遇租金终局不发结算奖励，也不注入后章',()=>{
  let s=veteran();s.stats.delivered=56;s.flags[events[0].flag]=true;s=prompt(s,events[1].id);
  s.minutes=8640-5;s.player.money=119;const qi=s.player.qi;s=choose(s,1);s=G.advance(s,100);
  assert.equal(s.gameOver.reason,'rent');assert.equal(s.player.qi,qi);assert.equal(s.eventResult,null);assert.equal(s.pending,null);
  assert.ok(!s.flags[events[2].flag]);assert.equal(G.perform(s,'rest').ok,false);assert.ok(read(s).gameOver);
});

test('化神既有归途不被新章推迟，继续游历不跳过新剧情，宗门不必加入',()=>{
  let s=veteran();assert.ok(G.endingOptions(s).find(e=>e.id==='ascend').ready);assert.equal(s.sect.member,false);
  s=act(s,'finale',{id:'ascend'});assert.equal(s.ending,'ascend');s=act(s,'continue');assert.equal(s.ending,null);
  s=prompt(s,events[0].id);assert.equal(s.sect.member,false);
});

test('已接配送途中停止并休息，不插入无配送票据的高境界剧情',()=>{
  let s=veteran();s=act(s,'deliver',{id:s.orders[0].id});s=G.advance(s,.1);s=act(s,'stop');
  const ticket=G.clone(s.activeOrder);s=finish(act(s,'rest'));assert.equal(s.pending,null);assert.deepEqual(s.activeOrder,ticket);
  s=read(s);assert.deepEqual(s.activeOrder,ticket);assert.equal(s.flags[events[0].flag],false);
  s=act(s,'cancelDelivery');s=prompt(s,events[0].id);assert.ok(s.pending);
});
