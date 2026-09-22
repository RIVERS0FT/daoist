import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/js/data.js';
import '../public/js/engine.js';
import '../public/js/storage.js';
import '../public/js/progression.js';
import {act,finish,acknowledge,awakeningPending} from './helpers/opening.mjs';
const G=globalThis.NightCourier;
const read=s=>G.sanitizeSave(G.clone(s));
const cache=new Map();
// Explicit post-tutorial fixture, with actual seeded offers and unchanged resources.
function offerFor(id,mode='classic'){
  if(!cache.has(id)){
    for(let seed=1;seed<4000;seed++){
      const s=G.newGame('沿途相逢','classic',seed);s.flags.firstOrder=true;s.stats.delivered=1;
      s.orders=[];G.refreshOrders(s);
      const ticket=s.orders.find(o=>o.npc===id&&!G.place(o.target).permanent&&
        !G.travelBlock(s,G.travelPlan(s,o.target))&&
        (o.condition!=='careful'||s.player.stamina-G.travelPlan(s,o.target).stamina>=10));
      if(ticket){cache.set(id,{state:s,ticket});break;}
    }
  }
  assert.ok(cache.has(id),`No naturally generated delivery for ${id}`);
  const {state,ticket}=G.clone(cache.get(id));state.mode=mode;return {s:state,ticket};
}
function arrive(id,mode='classic',met=false){
  let {s,ticket}=offerFor(id,mode);
  if(met){s.bonds[id].met=true;s.unlockedFeatures=['bonds'];}
  s=finish(act(s,'deliver',{id:ticket.id}));
  return {s,ticket};
}
const choose=(s,index)=>act(s,'choose',{eventId:s.pending.id,index});

// The first six records are published identities, not replacements for the new women.
test('保留六位原人物，新增六位成年可攻略女性，原人物保留，扩展后共21人且9人有感情线',()=>{
  assert.deepEqual(G.NPCS.slice(0,6).map(n=>n.id),['lin','chen','shen','lu','zhou','su']);
  assert.equal(G.NPCS.length,21);assert.equal(G.NPCS.filter(n=>n.romantic).length,9);
  assert.equal(new Set(G.NPCS.map(n=>n.id)).size,21);
  for(const id of G.NEW_NPC_IDS){
    const n=G.NPCS.find(n=>n.id===id);assert.equal(n.gender,'female');assert.ok(Number.isInteger(n.age)&&n.age>=18&&n.age<=27);assert.equal(n.romantic,true);
    assert.equal(n.arc.length,4);assert.ok(G.place(n.place));
    for(const arc of n.arc){assert.equal(arc.length,5);assert.ok(arc.slice(2).some(c=>!G.effectBlock(G.newGame('零成本'),c.effects,c.itemCost)));}
    assert.deepEqual(n.arc[3].slice(2).map(c=>c.path),['friend','romance','friend']);
    assert.equal(n.arc[3][3].minTrust,12);
  }
});

test('每人都有独立配送初遇/重逢，非固定地址叙述且不携带提前关系路线',()=>{
  const faces=G.EVENTS.filter(e=>e.deliveryNpc);assert.equal(faces.length,42);
  assert.equal(new Set(faces.map(e=>e.id)).size,42);
  for(const n of G.NPCS){
    const events=faces.filter(e=>e.deliveryNpc===n.id);assert.equal(events.length,2);
    assert.deepEqual(events.map(e=>e.deliveryMeeting),[true,false]);
    for(const e of events){assert.ok(e.text.includes(n.name));assert.equal(e.kind,'delivery');assert.equal(e.choices.length,3);assert.ok(e.choices.every(c=>!c.path));}
  }
});

test('多个随机种子和多个普通地址都能遇到任一NPC，查询不改世界种子或资产',()=>{
  const places=G.PLACES.filter(p=>!p.permanent),s=G.newGame('多处相逢');s.flags.firstOrder=true;s.stats.delivered=1;
  const seen=new Map(G.NPCS.map(n=>[n.id,new Set()]));let count=0,empty=0;
  for(let seed=1;seed<=500;seed++)for(const p of places.slice(0,20)){
    s.seed=seed;const snapshot=G.clone(s),id=G.orderNPC(s,p);
    assert.deepEqual(s,snapshot);if(seed<=5)assert.equal(G.orderNPC(read(s),p),id);
    if(id){seen.get(id).add(p.id);count++;}else empty++;
  }
  for(const [id,targets] of seen)assert.ok(targets.size>=2,`${id} still tied to a single place`);
  assert.ok(count>0&&empty>0);
});

for(const n of G.NPCS)for(const mode of ['classic','ai'])test(`${mode} ${n.name}：真实异地配送、途中和待选读档，选择结算后才结识`,()=>{
  let {s,ticket}=offerFor(n.id,mode);const before=G.clone(s);
  assert.equal(s.bonds[n.id].met,false);assert.notEqual(ticket.target,n.place);
  s=act(s,'deliver',{id:ticket.id});s=G.advance(s,.1);assert.ok(s.activity);assert.equal(s.bonds[n.id].met,false);
  const mid=read(s);assert.deepEqual(mid.activeOrder,s.activeOrder);assert.deepEqual(mid.location,s.location);
  s=finish(mid);assert.equal(s.pending.templateId,`delivery-npc-${n.id}`);assert.equal(s.pending.source,'classic');assert.equal(s.pending.aiStatus,'skip');
  assert.equal(s.bonds[n.id].met,false);assert.equal(s.stats.delivered,1);assert.equal(s.unlockNotices.length,0);
  s=read(s);assert.equal(s.bonds[n.id].met,false);assert.equal(G.perform(s,'visit',{id:n.id}).ok,false);
  const pending=G.clone(s.pending);s=choose(s,0);
  assert.equal(s.bonds[n.id].met,true);assert.equal(s.bonds[n.id].stage,0);assert.equal(s.bonds[n.id].path,'none');assert.equal(s.bonds[n.id].lastTalkDay,0);
  assert.equal(s.bonds[n.id].affinity,3);assert.equal(s.bonds[n.id].trust,1);
  assert.equal(s.stats.delivered,2);assert.equal(s.player.money,before.player.money+ticket.reward);assert.equal(s.player.coins,0);
  assert.equal(s.unlockNotices.filter(x=>x.kind==='bond'&&x.id===n.id).length,1);
  assert.equal(G.placeUnlocked(s,ticket.target),true);assert.equal(G.placeUnlocked(s,n.place),G.placeUnlocked(before,n.place));
  const done=G.clone(s),loaded=read(s);s=acknowledge(loaded);
  assert.deepEqual(s.player,done.player);assert.deepEqual(s.bonds,done.bonds);assert.equal(s.minutes,done.minutes);assert.equal(s.seed,done.seed);
  assert.equal(G.perform(s,'choose',{eventId:pending.id,index:0}).ok,false);
});

for(const id of G.NEW_NPC_IDS)test(`${id}：配送重逢的三分钟短聊不推进四章、不占深入交谈，不自动攻略`,()=>{
  let {s,ticket}=arrive(id,'ai',true);const before=G.clone(s),at=s.minutes;
  assert.equal(s.pending.templateId,`delivery-npc-${id}-again`);
  s=choose(s,1);assert.equal(s.activity.kind,'choice');s=G.advance(s,1);
  assert.deepEqual(s.bonds[id],before.bonds[id]);s=read(s);assert.equal(s.activity.elapsed,1);
  s=finish(s);assert.equal(s.minutes,at+3);assert.equal(s.bonds[id].affinity,5);assert.equal(s.bonds[id].trust,2);
  assert.equal(s.bonds[id].stage,0);assert.equal(s.bonds[id].path,'none');assert.equal(s.bonds[id].lastTalkDay,0);
  assert.equal(s.player.money,before.player.money+ticket.reward);assert.equal(s.unlockNotices.filter(n=>n.kind==='bond').length,0);
});

test('停止、续送、取消不会重抽已接人物，候选刷新不改已接票据',()=>{
  let {s,ticket}=offerFor('xu');s=act(s,'deliver',{id:ticket.id});s=G.advance(s,.2);s=act(s,'stop');
  const before=G.clone(s.activeOrder);s=read(s);G.refreshOrders(s);assert.deepEqual(s.activeOrder,before);
  s=act(s,'resumeDelivery');s=finish(s);assert.equal(s.pending.delivery.npc,ticket.npc);
  let other=offerFor('gu').s;const o=other.orders.find(o=>o.npc==='gu');other=G.advance(act(other,'deliver',{id:o.id}),.2);
  other=act(other,'stop');other=act(other,'cancelDelivery',{confirm:true});assert.equal(other.bonds.gu.met,false);assert.equal(other.stats.delivered,1);
});

test('初遇无效选择原子拒绝，AI不能替换固定身份或个人攻略选项',()=>{
  let {s}=arrive('xu','ai');const before=G.clone(s);
  for(const payload of [{eventId:'stale',index:0},{eventId:s.pending.id,index:7}])assert.equal(G.perform(s,'choose',payload).state,s);
  assert.deepEqual(s,before);s.pending.aiStatus='unrequested';
  const forged={title:'改写身份',text:'不应出现',choices:[{label:'一',result:'一',effects:{affinity:1}},{label:'二',result:'二',effects:{}},{label:'三',result:'三',effects:{}}]};
  assert.equal(G.applyAIEvent(s,s.pending.id,forged),s);
  const restored=read({...s,pending:{...s.pending,source:'ai',text:'wrong',choices:forged.choices}});
  assert.deepEqual(restored.pending.choices,before.pending.choices);assert.equal(restored.bonds.xu.met,false);
});

for(const mutate of [p=>p.npcId='tang',p=>p.delivery.npc='ye',p=>p.npcAdvance=true,p=>p.kind='social',p=>delete p.delivery])test(`损坏配送人物待选拒绝恢复：${mutate}`,()=>{
  const {s}=arrive('xu');mutate(s.pending);assert.throws(()=>read(s));
});

test('v18及更早的六人存档补六个隐藏羁绊，不改原人物和在途票据或资产',()=>{
  const {s:source,ticket}=offerFor('lin');
  let state=G.advance(act(source,'deliver',{id:ticket.id}),.2);
  for(const version of [16,17,18]){
    const raw=G.clone(state);raw.schemaVersion=version;for(const id of G.NEW_NPC_IDS)delete raw.bonds[id];
    const out=read(raw);assert.equal(out.schemaVersion,20);assert.deepEqual(out.player,state.player);assert.deepEqual(out.activeOrder,state.activeOrder);assert.deepEqual(out.location,state.location);
    for(const n of G.NPCS.slice(0,6))assert.deepEqual(out.bonds[n.id],state.bonds[n.id]);
    for(const id of G.NEW_NPC_IDS)assert.deepEqual(out.bonds[id],{met:false,affinity:0,trust:0,stage:0,path:'none',lastTalkDay:0});
    assert.deepEqual(read(out).bonds,out.bonds);
  }
});

for(const change of [s=>delete s.bonds.xu,s=>s.bonds.xu.met='true',s=>s.bonds.xu.stage=5,s=>s.bonds.xu.path='romance',s=>s.bonds.xu.affinity=1,s=>s.bonds.xu.trust=-2])test(`v19损坏新增人物记录不静默修复：${change}`,()=>{
  const s=G.newGame('损坏人物');change(s);assert.throws(()=>read(s));
});

// High-affinity pre-final-chapter fixture isolates explicit relationship choice.
// Earlier chapters and real visit progression are also exercised below.
function finalConversation(id,trust=20){
  const npc=G.NPCS.find(n=>n.id===id),s=G.newGame('羁绊选择','ai',65432);
  s.unlockedFeatures=['bonds'];s.unlockedPlaces=[...new Set([...s.unlockedPlaces,npc.place])];
  s.position=npc.place;s.location=null;
  Object.assign(s.bonds[id],{met:true,affinity:60,trust,stage:3});
  return finish(act(s,'visit',{id}));
}
for(const id of G.NEW_NPC_IDS)test(`${id}：第四章信任不足不能攻略，友情或感情必须明确选择且永久保存`,()=>{
  let blocked=finalConversation(id,11);const original=G.clone(blocked);
  assert.match(G.choiceBlock(blocked,blocked.pending.choices[1]),/信任/);
  assert.equal(G.perform(blocked,'choose',{eventId:blocked.pending.id,index:1}).ok,false);assert.deepEqual(blocked,original);
  for(const index of [0,1,2]){
    let s=finalConversation(id);s.pending.aiStatus='unrequested';
    assert.equal(G.applyAIEvent(s,s.pending.id,{bad:true}),s);s=read(s);
    s=choose(s,index);assert.equal(s.bonds[id].stage,4);assert.equal(s.bonds[id].path,index===1?'romance':'friend');
    assert.equal(read(s).bonds[id].path,index===1?'romance':'friend');
    s=acknowledge(s);assert.equal(G.perform(s,'visit',{id}).ok,false);
    s.stats.delivered=20;assert.equal(G.endingOptions(s).find(x=>x.id==='bond').ready,index===1);
  }
});

for(const id of G.NEW_NPC_IDS)test(`${id}：从异地结识到四章和感情选择的实际拜访流程`,()=>{
  let {s}=arrive(id);s=acknowledge(choose(s,0));
  // Unlocking a meeting place is still separate from discovering its person.
  const npc=G.NPCS.find(n=>n.id===id);s.unlockedPlaces=[...new Set([...s.unlockedPlaces,npc.place])];
  // Resource-rich social fixture, no direct writes to affinity/trust/stage/path/time.
  s.player.money=5000;s.player.health=100;s.player.stamina=100;
  for(let i=0;s.bonds[id].stage<4&&i<30;i++){
    if(s.vehicle.battery<45)s=acknowledge(finish(act(s,'charge')));
    if(s.bonds[id].lastTalkDay===G.day(s))s=acknowledge(finish(act(s,'sleep')));
    if(s.bonds[id].lastTalkDay===G.day(s))continue;
    if(s.player.stamina<50)s=acknowledge(finish(act(s,'rest')));
    if(s.vehicle.battery<45)s=acknowledge(finish(act(s,'charge')));
    s=finish(act(s,'visit',{id}));
    assert.equal(s.pending.npcId,id);const final=s.bonds[id].stage===3&&s.pending.npcAdvance;
    s=finish(choose(read(s),final?1:0));s=acknowledge(s);
  }
  assert.equal(s.bonds[id].stage,4);assert.equal(s.bonds[id].path,'romance');
});

test('第十单剧情优先，不因旧候选附带人物把未出场女性提前结识',()=>{
  let s=awakeningPending();s.pending.delivery.npc='xu';const ticket=G.clone(s.pending.delivery);
  s=choose(s,0);assert.equal(s.flags.systemAwakened,true);assert.equal(s.player.coins,0);assert.equal(s.bonds.xu.met,false);
  assert.equal(s.stats.delivered,10);assert.equal(s.player.money>=ticket.reward,true);
  assert.ok(s.unlockNotices.some(n=>n.kind==='feature'&&n.id==='system'));
});

test('同刻房租终局先于配送重逢结算，不增加好感或交付',()=>{
  let {s}=arrive('wen','classic',true);s.minutes=6*1440-3;s.player.money=0;s.unlockNotices=[];
  s=choose(s,1);const bond=G.clone(s.bonds.wen);s=G.advance(s,3);
  assert.ok(s.gameOver);assert.deepEqual(s.bonds.wen,bond);assert.equal(s.stats.delivered,1);assert.equal(s.eventResult,null);
});

test('旧六人的108张丹方归属不重排；新六人不凭相遇赠送专属丹方',()=>{
  assert.equal(G.ALCHEMY_RECIPES.length,108);
  for(const id of G.NEW_NPC_IDS){const {s}=arrive(id);const out=choose(s,0);assert.deepEqual(out.alchemy.formulas,[]);assert.equal(G.formulaBondProgress(out,id).total,0);}
});


test('全部九位可攻略女性年龄限定18至27岁，补齐原三位女性配置',()=>{
  const ages={lin:24,shen:20,su:19,xu:20,tang:19,gu:18,ye:21,wen:18,luo:27};
  assert.deepEqual(G.NPCS.filter(n=>n.romantic).map(n=>n.id),Object.keys(ages));
  for(const [id,age] of Object.entries(ages)){
    const n=G.NPCS.find(n=>n.id===id);
    assert.equal(n.age,age);assert.ok(Number.isInteger(n.age)&&n.age>=18&&n.age<=27);
    assert.equal(n.gender,'female');assert.equal(n.romantic,true);
  }
  assert.equal(G.APP_VERSION,'1.16.0');assert.equal(G.VERSION,20);
  assert.equal(G.STORAGE_KEY,'night-courier:saves:v20');
});

test('罗映秋现为活动策划师，简介、个人故事和配送初遇职业一致',()=>{
  const npc=G.NPCS.find(n=>n.id==='luo'),face=G.EVENTS.find(e=>e.id==='delivery-npc-luo');
  assert.equal(npc.role,'活动策划师');assert.match(npc.bio,/活动/);
  assert.match(npc.arc[0][1],/活动流程表/);assert.equal(npc.arc[0][4].label,'问她忙完最想做什么');
  assert.match(face.text,/活动策划师/);
  assert.doesNotMatch(JSON.stringify([npc,G.EVENTS.filter(e=>e.deliveryNpc==='luo')]),/退休|46岁/);
  assert.deepEqual(npc.arc[3].slice(2).map(c=>c.path),['friend','romance','friend']);
  assert.equal(npc.arc[3][3].minTrust,12);
});

test('v19旧待选恢复策划职业文案，配送票据和个人选项效果、进度均保留',()=>{
  const {s}=arrive('luo');const ticket=G.clone(s.pending.delivery),effects=s.pending.choices.map(c=>G.clone(c.effects));
  s.pending.text='罗映秋刚结束社区夜路走访，在约定位置等饭。她介绍自己已经退休，今天只是把旧经验讲给接班的人。';
  const before=G.clone(s),loaded=read(s);
  assert.equal(loaded.schemaVersion,20);assert.match(loaded.pending.text,/活动策划师/);
  assert.equal(loaded.pending.id,s.pending.id);assert.deepEqual(loaded.pending.delivery,ticket);
  assert.deepEqual(loaded.pending.choices.map(c=>c.effects),effects);assert.deepEqual(loaded.player,before.player);
  assert.deepEqual(loaded.bonds,before.bonds);assert.equal(loaded.minutes,before.minutes);assert.equal(loaded.seed,before.seed);
  const npc=G.NPCS.find(n=>n.id==='luo');let social=G.newGame('旧对话');
  social.unlockedFeatures=['bonds'];social.unlockedPlaces.push(npc.place);social.position=npc.place;social.location=null;
  social.bonds.luo.met=true;social=finish(act(social,'visit',{id:npc.id}));
  assert.equal(social.pending.npcAdvance,true);const choices=G.clone(social.pending.choices);
  social.pending.text='罗映秋带着用了多年的手电，电池却是新的。她说早已不用值夜，只是出门总想带着。';
  social.pending.choices[2].label='问她退休后想做什么';
  const restored=read(social);assert.match(restored.pending.text,/活动流程表/);
  assert.deepEqual(restored.pending.choices,choices);assert.deepEqual(restored.bonds,social.bonds);
  assert.deepEqual(restored.player,social.player);assert.equal(restored.pending.id,social.pending.id);
});

test('年龄调整不重写旧回执和日志，也不重置已确定的相伴关系',()=>{
  let s=choose(finalConversation('luo'),1);
  s.eventResult.text='你与退休巡夜人罗映秋约好下次见面。';
  s.logs.push({id:'legacy-luo-age',at:s.minutes,tag:'羁绊',text:'罗映秋，46岁，退休巡夜人。'});
  const receipt=G.clone(s.eventResult),bonds=G.clone(s.bonds),player=G.clone(s.player),history=s.logs.map(({at,tag,text})=>({at,tag,text}));
  s=read(s);assert.deepEqual(s.eventResult,receipt);assert.deepEqual(s.logs.map(({at,tag,text})=>({at,tag,text})),history);
  assert.deepEqual(s.bonds,bonds);assert.deepEqual(s.player,player);
  assert.equal(s.bonds.luo.path,'romance');assert.equal(G.NPCS.find(n=>n.id==='luo').age,27);
  s=acknowledge(s);assert.deepEqual(s.bonds,bonds);assert.deepEqual(s.player,player);
});


test('全部九位及新增六位的年龄均为右偏分布，而非向高龄端集中',()=>{
  for(const npcs of [G.NPCS.filter(n=>n.romantic),G.NPCS.filter(n=>G.NEW_NPC_IDS.includes(n.id))]){
    const ages=npcs.map(n=>n.age).sort((a,b)=>a-b),n=ages.length;
    const mean=ages.reduce((a,b)=>a+b,0)/n,median=(ages[Math.floor((n-1)/2)]+ages[Math.floor(n/2)])/2;
    const m2=ages.reduce((a,x)=>a+(x-mean)**2,0)/n,m3=ages.reduce((a,x)=>a+(x-mean)**3,0)/n;
    assert.equal(ages[0],18);assert.equal(ages.at(-1),27);
    assert.ok(ages.filter(x=>x<=21).length>n/2);
    assert.ok(mean>median);assert.ok(m3/m2**1.5>0,'Age skew must be positive');
  }
});

test('年龄为固定人物配置，新建和旧档恢复不重抽年龄或自动认识原三位女性',()=>{
  const before=G.clone(G.NPCS.filter(n=>n.romantic).map(({id,age})=>({id,age})));
  for(const mode of ['classic','ai'])for(const seed of [1,97,13579]){
    const fresh=G.newGame('年龄不重抽',mode,seed),s=read(fresh);
    assert.deepEqual(G.visibleNPCs(s),[]);
    const bonds=G.clone(s.bonds),player=G.clone(s.player);
    // Foreign save metadata cannot override authored ages or grant a bond.
    for(const {id} of before)s.bonds[id].age=99;
    s.npcAges={lin:1,shen:99,su:0};
    const restored=read(s);
    assert.deepEqual(restored.bonds,bonds);assert.deepEqual(restored.player,player);
    assert.equal(restored.seed,s.seed);assert.equal(restored.minutes,s.minutes);
    assert.deepEqual(G.NPCS.filter(n=>n.romantic).map(({id,age})=>({id,age})),before);
  }
});
