import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/js/city-data.js';
import '../public/vendor/fflate/fflate.js';
import '../public/js/city-routes.js';
import '../public/js/data.js';
import '../public/js/chapters.js';
import '../public/js/sects.js';
import '../public/js/npc-profiles.js';
import '../public/js/engine.js';
import '../public/js/sect-engine.js';
import '../public/js/sect-stories.js';
import '../public/js/storage.js';
import '../public/js/progression.js';
const G=globalThis.NightCourier,npc=G.NPCS.find(n=>n.id==='zhou');
const read=s=>G.sanitizeSave(G.clone(s));
const act=(s,a,p={})=>{const r=G.perform(s,a,p);assert.ok(r.ok,r.error);return r.state;};
const finish=s=>{for(let i=0;s.activity&&!s.gameOver&&i<4000;i++){if(G.nextUnlockNotice(s))s=act(s,'ackUnlock',{id:G.unlockNoticeKey(G.nextUnlockNotice(s))});else s=G.advance(s,1);}assert.ok(!s.activity||s.gameOver);return s;};
const choose=(s,index=0)=>act(s,'choose',{eventId:s.pending.id,index});
const ack=s=>{
 if(s.eventResult)s=act(s,'ackResult',{id:s.eventResult.id});
 if(s.placeUnlock)s=act(s,'ackPlaceUnlock',{id:s.placeUnlock.place});
 while(G.nextUnlockNotice(s))s=act(s,'ackUnlock',{id:G.unlockNoticeKey(G.nextUnlockNotice(s))});
 return s;
};
function state(stage=0,mode='classic'){
 const s=G.newGame('周野故事验证',mode,519);
 // Explicit high-progression fixture isolates this personal story from economics and the main plot.
 s.position='market';s.location=null;s.unlockedPlaces.push('market');s.unlockedFeatures=['system','bonds'];
 s.player.money=20000;s.player.realm=4;s.stats.delivered=44;s.flags.firstOrder=true;s.flags.systemAwakened=true;
 for(const e of G.EVENTS)if(e.flag&&!e.higherChapter)s.flags[e.flag]=true;
 Object.assign(s.bonds.zhou,{met:true,stage,path:G.zhouPath(stage),affinity:stage>=9?0:60,trust:stage>=9?0:30});
 G.syncFeatureUnlocks(s,true);return s;
}
const scene=(stage,mode)=>finish(act(state(stage,mode),'visit',{id:'zhou'}));
function delivery(stage){
 let s=state(stage);const ticket={id:'zhou-kept-order',title:'热饭',desc:'已经接下的订单',target:'stop-0',condition:'ordinary',expiresAt:s.minutes+36,reward:28,coins:2,npc:'zhou'};
 s.orders=[ticket];return finish(act(s,'deliver',{id:ticket.id}));
}

test('周野职业统一骑手、25岁、十段三选项，其他二十人仍四段',()=>{
 assert.equal(npc.role,'骑手');assert.equal(npc.age,25);assert.equal(npc.romantic,false);assert.equal(npc.arc.length,10);
 assert.ok(G.NPCS.filter(n=>n.id!=='zhou').every(n=>n.arc.length===4));
 assert.equal(new Set(npc.arc.map(a=>a[0])).size,10);
 for(const a of npc.arc){assert.equal(a.length,5);assert.ok(a.slice(2).some(c=>!c.duration&&!G.effectBlock(G.newGame('可选'),c.effects,c.itemCost)));}
 assert.equal(G.getNPCProfile('zhou').role,'骑手');assert.doesNotMatch(JSON.stringify(G.getNPCProfile('zhou')),/夜班骑手/);
 assert.equal(G.VERSION,24);
});
for(const mode of ['classic','ai'])for(let stage=0;stage<10;stage++)test(`${mode} 周野第${stage+1}段：三个选项实际结算、读档和顺序关系`,()=>{
 for(let index=0;index<3;index++){
  let s=scene(stage,mode),before=G.clone(s);assert.equal(s.pending.templateId,`zhou-arc-${stage}`);assert.equal(s.pending.aiStatus,'skip');
  assert.equal(s.bonds.zhou.stage,stage);s=read(s);assert.equal(s.pending.title,npc.arc[stage][0]);
  s=choose(s,index);if(s.activity){assert.equal(s.bonds.zhou.stage,stage);s=read(G.advance(s,.5));assert.equal(s.bonds.zhou.stage,stage);s=finish(s);}
  assert.equal(s.bonds.zhou.stage,stage+1);assert.equal(s.bonds.zhou.path,G.zhouPath(stage+1));
  assert.equal(s.player.coins,before.player.coins);assert.equal(s.stats.delivered,before.stats.delivered);
  const result=G.clone(s.eventResult),bonds=G.clone(s.bonds),at=s.minutes;
  s=read(s);assert.deepEqual(s.eventResult,result);s=ack(s);assert.deepEqual(s.bonds,bonds);assert.equal(s.minutes,at);
  assert.equal(G.perform(s,'choose',{eventId:before.pending.id,index}).ok,false);
 }
});
for(const mode of ['classic','ai'])test(`${mode} 连续十次真实拜访：路人→朋友→兄弟→仇人且不能和解`,()=>{
 let s=state(0,mode);
 for(let step=0;step<10;step++){
  s=finish(act(s,'visit',{id:'zhou'}));assert.equal(s.pending.templateId,`zhou-arc-${step}`);
  s=ack(finish(choose(s)));assert.equal(s.bonds.zhou.path,G.zhouPath(step+1));
  if(step<9)s=G.advance(s,1440);
 }
 assert.equal(G.npcRelationshipLabel(s,'zhou'),'仇人');assert.equal(s.bonds.zhou.affinity,0);assert.equal(s.bonds.zhou.trust,0);
 const before=G.clone(s),r=G.perform(s,'visit',{id:'zhou'});assert.equal(r.ok,false);assert.deepEqual(r.state,before);
 assert.equal(read(s).bonds.zhou.path,'enemy');
});
test('前期角色介绍、默认画像及AI不泄露隐藏修为或蚀灯会',()=>{
 for(let stage=0;stage<6;stage++){
  const s=state(stage),raw={met:true,stage,path:G.zhouPath(stage)};
  for(const text of [G.npcDisplayBio(s,npc),G.npcPortraitPrompt('zhou',raw).positive,G.npcRoleplayPrompt('zhou',raw)])assert.doesNotMatch(text,/蚀灯会|邪恶组织|修仙者|蚀灯纹/);
 }
 assert.match(G.npcRoleplayPrompt('zhou',{met:true,stage:6}),/也是修仙者/);
 assert.doesNotMatch(G.npcRoleplayPrompt('zhou',{met:true,stage:6}),/蚀灯会/);
 assert.match(G.npcRoleplayPrompt('zhou',{met:true,stage:7}),/蚀灯会/);
 assert.match(G.npcRoleplayPrompt('zhou',{met:true,stage:9}),/仇人/);
 assert.match(G.npcPortraitPrompt('zhou',{met:true,stage:7}).positive,/蚀灯纹/);
});
test('AI关系与已完成话题按十段裁剪，隐藏剧情和未来选项不加入上下文',()=>{
 for(let stage=0;stage<=10;stage++){
  const ctx=G.npcDialogueContext('zhou',{met:true,stage,path:'romance',affinity:100,trust:100});
  assert.equal(ctx.relationship.stage,stage);assert.equal(ctx.relationship.path,G.zhouPath(stage));
  assert.deepEqual(ctx.completedTopics,npc.arc.slice(0,stage).map(a=>a[0]));
  for(const a of npc.arc.slice(stage))assert.ok(!JSON.stringify(ctx).includes(a[0]));
 }
 assert.equal(G.npcDialogueContext('zhou',{met:false,stage:10}).relationship.path,'none');
});
test('高好感或高境界不能越过六个后期门槛与顺序；对质不依赖刷回信任',()=>{
 for(let stage=4;stage<10;stage++){
  const g=G.ZHOU_STORY_GATES[stage],s=state(stage);s.player.realm=g.realm;s.stats.delivered=g.delivered;
  assert.equal(G.npcStoryBlock(s,'zhou'),'');s.stats.delivered--;assert.ok(G.npcStoryBlock(s,'zhou'));s.stats.delivered++;
  s.player.realm--;assert.ok(G.npcStoryBlock(s,'zhou'));s.player.realm++;
  s.bonds.zhou.affinity=s.bonds.zhou.trust=0;assert.equal(G.npcStoryBlock(s,'zhou'),'');
 }
 const s=state(0);s.bonds.zhou.affinity=100;assert.equal(finish(act(s,'visit',{id:'zhou'})).pending.templateId,'zhou-arc-0');
 const waiting=state(4);waiting.player.realm=0;assert.equal(finish(act(waiting,'visit',{id:'zhou'})).pending.npcAdvance,false);
});
test('停止赴约不会推进；错误与过期选择不部分扣费，不提前成仇',()=>{
 let s=state(8);const start=act(s,'visit',{id:'zhou'});assert.equal(G.perform(start,'stop').state.bonds.zhou.path,'brother');
 s=scene(8);for(const payload of [{eventId:'stale-event',index:0},{eventId:s.pending.id,index:99}]){
  const before=G.clone(s),r=G.perform(s,'choose',payload);assert.equal(r.ok,false);assert.deepEqual(r.state,before);
 }
 assert.equal(s.bonds.zhou.path,'brother');
});
test('同刻欠租优先于新剧情耗时结算，未完成不能揭露或增加段数',()=>{
 let s=scene(5);s.minutes=6*1440-10;s.player.money=0;
 s=choose(s,1);s=G.advance(s,10);assert.ok(s.gameOver);assert.equal(s.bonds.zhou.stage,5);assert.equal(s.bonds.zhou.path,'brother');
 assert.equal(G.zhouKnowledge(s.bonds.zhou.stage),'rider');
});
for(const stage of [2,4,6,7,9,10])test(`阶段${stage}配送重逢跟随已知身份，真实交付不跳个人章节`,()=>{
 let s=delivery(stage);assert.equal(s.pending.templateId,G.zhouDeliveryTemplate(stage));assert.equal(s.pending.npcAdvance,false);
 const before=G.clone(s),balance=s.player.money;s=read(s);s=ack(finish(choose(s,0)));
 assert.equal(s.player.money,balance+28);assert.equal(s.stats.delivered,before.stats.delivered+1);assert.equal(s.bonds.zhou.stage,stage);
 if(stage>=9){assert.equal(s.bonds.zhou.affinity,0);assert.equal(s.bonds.zhou.trust,0);assert.equal(s.bonds.zhou.path,'enemy');}
});
test('仇人不再成为新配送候选，现有订单身份和目的地保留',()=>{
 const s=state(9),raw=G.clone(s);for(let seed=1;seed<=200;seed++){
  const state={...s,seed};for(const p of G.PLACES)assert.notEqual(G.orderNPC(state,p),'zhou');
 }
 assert.deepEqual(s,raw);
 let active=state(8);active.orders=[{id:'kept-enemy-order',target:'market',title:'旧单',desc:'保留',condition:'ordinary',reward:20,coins:2,expiresAt:active.minutes+30,npc:'zhou'}];
 const ticket=G.clone(active.orders[0]);active.bonds.zhou.stage=9;active.bonds.zhou.path='enemy';active.bonds.zhou.affinity=active.bonds.zhou.trust=0;
 assert.deepEqual(read(active).orders[0],ticket);active=finish(act(active,'deliver',{id:ticket.id}));assert.equal(active.pending.templateId,'delivery-zhou-enemy');
});
test('敌对周野不计友情结局，不新传丹方，已经拥有的丹方保留',()=>{
 let s=state(9);s.bonds.chen.stage=s.bonds.lu.stage=4;
 assert.equal(G.endingOptions(s).find(e=>e.id==='friendship').ready,false);
 const formulas=G.ALCHEMY_RECIPES.filter(r=>r.acquisition.npc==='zhou');s.alchemy.formulas=[formulas[0].id];G.syncFormulaRewards(s);
 assert.deepEqual(s.alchemy.formulas.filter(id=>G.alchemyRecipe(id).acquisition.npc==='zhou'),[formulas[0].id]);assert.ok(read(s).alchemy.formulas.includes(formulas[0].id));
});
test('周野六张旧丹方在修为揭露后仍可获得，揭露前不借传方剧透',()=>{
 const s=state(4);s.bonds.zhou.trust=100;const recipes=G.ALCHEMY_RECIPES.filter(r=>r.acquisition.npc==='zhou');
 for(const r of recipes)assert.equal(G.formulaRewardReady(s,r),false);
 s.bonds.zhou.stage=6;for(const r of recipes)assert.equal(G.formulaRewardReady(s,r),true);
 const before=s.alchemy.formulas.length;G.syncFormulaRewards(s);for(const r of recipes)assert.ok(s.alchemy.formulas.includes(r.id));
 assert.equal(new Set(s.alchemy.formulas).size,s.alchemy.formulas.length);const got=[...s.alchemy.formulas];G.syncFormulaRewards(s);assert.deepEqual(s.alchemy.formulas,got);
});


test('v21损坏阶段、伪造关系、缺少已完成前置、错配剧情编号均拒绝',()=>{
 const mutations=[s=>delete s.bonds.zhou,s=>s.bonds.zhou.stage=11,s=>s.bonds.zhou.path='enemy',s=>s.bonds.zhou.met='true',s=>s.bonds.zhou.affinity=Infinity];
 for(const mutate of mutations){const s=state(4);mutate(s);assert.throws(()=>read(s));}
 let s=state(9);s.bonds.zhou.affinity=5;assert.throws(()=>read(s));s=state(9);s.player.realm=0;assert.throws(()=>read(s));
 s=scene(6);s.pending.templateId='zhou-arc-9';assert.throws(()=>read(s));s=scene(8);s.stats.delivered=10;assert.throws(()=>read(s));
 s=state(10);s.pending={id:'invalid-enemy-chat',npcId:'zhou',kind:'social',npcAdvance:false};assert.throws(()=>read(s));
});
test('固定剧情和敌对对话不能被AI覆盖，默认人设与只读查询不改状态',()=>{
 for(let i=0;i<10;i++){const s=scene(i,'ai');s.pending.aiStatus='unrequested';assert.strictEqual(G.applyAIEvent(s,s.pending.id,{}),s);}
 const s=state(9,'ai');s.pending={id:'forged-chat',kind:'social',npcId:'zhou',npcAdvance:false,aiStatus:'unrequested'};
 assert.strictEqual(G.applyAIEvent(s,s.pending.id,{}),s);
 const before=G.clone(s);for(let i=0;i<5;i++){G.npcRelationshipLabel(s,'zhou');G.npcDisplayBio(s,npc);G.npcRoleplayPrompt('zhou',s.bonds.zhou);G.npcStoryBlock(s,'zhou');}assert.deepEqual(s,before);
});


test('周野固定剧情身份与推进标记被篡改时拒绝恢复',()=>{
 for(const mutate of [s=>s.pending.npcId='chen',s=>s.pending.npcAdvance=false,s=>delete s.pending.npcId]){
  const s=scene(6);mutate(s);assert.throws(()=>read(s));
 }
});

test('敌对画像保留同一张脸和职业，收起友好笑意和碰拳动作',()=>{
 const before=G.npcPortraitPrompt('zhou').positive,enemy=G.npcPortraitPrompt('zhou',{met:true,stage:9}).positive;
 assert.match(before,/坦率笑意/);assert.doesNotMatch(before,/蚀灯纹/);
 assert.match(enemy,/冷硬防备/);assert.doesNotMatch(enemy,/坦率笑意/);assert.match(enemy,/25岁/);assert.match(enemy,/骑手/);
});

 test('前四段只建立同行情谊，不用全知旁白提前宣告背叛',()=>{
 assert.doesNotMatch(JSON.stringify(npc.arc.slice(0,4)),/蚀灯会|邪恶组织|修仙者|反目|决裂|并不全是假/);
 });
