import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import '../public/js/data.js';
import '../public/js/sects.js';
import '../public/js/npc-profiles.js';
import '../public/js/engine.js';
import '../public/js/sect-engine.js';
import '../public/js/sect-stories.js';
import '../public/js/storage.js';
import '../public/js/progression.js';
import {act,finish,acknowledge} from './helpers/opening.mjs';
const G=globalThis.NightCourier;
const roles={lin:'行政秘书',shen:'编辑助理',su:'平面模特',xu:'知识区主播',tang:'咖啡师',gu:'大学生',ye:'花艺师',wen:'插画师',luo:'活动策划师'};
const read=s=>G.sanitizeSave(G.clone(s));
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const mechanics=({label,result,...rule})=>rule;
function conversation(id,stage=0,mode='ai'){
  const n=G.NPCS.find(n=>n.id===id),s=G.newGame('职业回归',mode,789);
  // Explicit already-met fixture; travel/visit/choice settlement still uses the real engine.
  s.position=n.place;s.location=null;s.unlockedPlaces=[...new Set([...s.unlockedPlaces,n.place])];
  s.unlockedFeatures=['bonds'];Object.assign(s.bonds[id],{met:true,affinity:60,trust:20,stage,path:'none',lastTalkDay:0});
  return finish(act(s,'visit',{id}));
}

test('九位可攻略女性职业互不相同，明确包含学生、模特、秘书与主播，扩员后旧女性不变',()=>{
  const women=G.NPCS.filter(n=>n.romantic);
  assert.equal(G.NPCS.length,21);assert.equal(women.length,9);
  assert.deepEqual(Object.fromEntries(women.map(n=>[n.id,n.role])),roles);
  assert.equal(new Set(G.NPCS.map(n=>n.role)).size,21);
  assert.deepEqual(women.map(n=>n.age).sort((a,b)=>a-b),[18,18,19,19,20,20,21,24,27]);
});

test('除单独重写的周野外，旧职业改写的44段人物故事数值仍保持',()=>{
  const rules=G.NPCS.slice(0,12).filter(n=>n.id!=='zhou').map(n=>({id:n.id,age:n.age,place:n.place,romantic:n.romantic,arc:n.arc.map(a=>a.slice(2).map(mechanics))}));
  assert.equal(hash(rules),'46ed0efe5966aee45f809baf8d43829898e311f61ba7e6afea22f6da0c56c700');
});

test('旧事件ID、类型、人物关联及数值保持原样，职业不会改变订单或世界随机规则',()=>{
  const rules=G.EVENTS.filter(e=>!e.sectStory&&e.sectCouncil===undefined&&!G.NEW_MALE_NPC_IDS.includes(e.deliveryNpc)&&!e.id.startsWith('delivery-zhou-')).map(e=>({id:e.id,kind:e.kind,npc:e.deliveryNpc||e.encounterNpc||null,choices:e.choices.map(mechanics)}));
  assert.equal(hash(rules),'ed79e62514a2df13d06c9a1cb9aabd9496802e522d6aa83162506747eb9b9477');
  assert.equal(G.DELIVERY_NPC_CHANCE,.35);assert.equal(G.SYSTEM_UNLOCK_DELIVERIES,10);assert.equal(G.STORY_STAGES.length,12);
});

for(const [id,role]of Object.entries(roles))test(`${id}：职业贯穿卡片配置、异地初遇、半身像、AI上下文和同源导出`,()=>{
  const n=G.NPCS.find(n=>n.id===id),p=G.getNPCProfile(id),face=G.EVENTS.find(e=>e.id===`delivery-npc-${id}`);
  assert.equal(p.role,role);assert.ok(face.text.includes(role));assert.ok(face.text.includes(n.name));
  assert.ok(G.npcPortraitPrompt(id).positive.includes(role));assert.ok(G.npcRoleplayPrompt(id).includes(role));
  const exported=JSON.parse(readFileSync(new URL('../docs/npc-prompts.json',import.meta.url),'utf8'));
  const row=exported.characters.find(c=>c.profile.id===id);assert.deepEqual(row.profile,p);
  assert.ok(row.portrait.positive.includes(role)&&row.dialogue.includes(role));
  assert.equal(n.arc.length,4);assert.ok(n.arc.every(a=>a.length===5));
});

for(const id of Object.keys(roles))test(`${id}：经典与AI旧四段待选恢复新职业文本，不接受旧身份、附加收益或关系覆盖`,()=>{
  for(const mode of ['classic','ai'])for(let stage=0;stage<4;stage++){
    const s=conversation(id,stage,mode),expected=read(s),raw=G.clone(s);
    assert.equal(s.pending.npcAdvance,true);
    raw.pending.title='旧职业场景';raw.pending.text='旧职业的工作内容';raw.pending.source='ai';raw.pending.aiStatus='success';
    raw.pending.choices[0].effects.money=999;raw.pending.choices[0].path='romance';
    const loaded=read(raw);
    assert.deepEqual(loaded.pending,expected.pending);assert.equal(loaded.pending.source,'classic');assert.equal(loaded.pending.aiStatus,'skip');
    for(const field of ['player','bonds','stats','seed','minutes'])assert.deepEqual(loaded[field],expected[field]);
    const pending=G.clone(s);pending.pending.aiStatus='unrequested';
    assert.strictEqual(G.applyAIEvent(pending,pending.pending.id,{title:'AI改职业'}),pending);
  }
});

for(const id of Object.keys(roles))test(`${id}：职业耗时选项的在途读档不再扣成本、即时发奖或丢失阶段`,()=>{
  const s=conversation(id,2),index=s.pending.choices.findIndex(c=>c.duration);
  if(index<0){assert.ok(s.pending.choices.every(c=>!c.duration));return;}
  const c=s.pending.choices[index],started=act(s,'choose',{eventId:s.pending.id,index});
  const mid=G.advance(started,1);assert.ok(mid.activity);assert.equal(mid.bonds[id].stage,2);
  const raw=G.clone(mid);raw.activity.params.event.text='旧职业待完成内容';
  const restored=read(raw);assert.equal(restored.minutes,mid.minutes);assert.deepEqual(restored.player,mid.player);
  assert.equal(restored.activity.elapsed,1);assert.equal(restored.activity.params.event.text,s.pending.text);
  const done=finish(restored);assert.equal(done.minutes,s.minutes+c.duration);assert.equal(done.bonds[id].stage,3);
  const snapshot=G.clone(done),ack=acknowledge(read(done));assert.deepEqual(ack.player,snapshot.player);assert.deepEqual(ack.bonds,snapshot.bonds);
});

test('已结算的旧职业回执和日志保留原文，旧相伴关系不因职业变更被清空或重新确定',()=>{
  for(const id of Object.keys(roles)){
    let s=conversation(id,3);s=act(s,'choose',{eventId:s.pending.id,index:1});
    s.eventResult.text='旧职业下的一段已结算往事。';s.logs.push({id:`legacy-career-${id}`,at:s.minutes,tag:'羁绊',text:'旧职业的历史记录。'});
    const restored=read(s);assert.deepEqual(restored.eventResult,s.eventResult);assert.deepEqual(restored.player,s.player);
    assert.deepEqual(restored.bonds,s.bonds);assert.equal(restored.bonds[id].path,'romance');assert.equal(restored.logs.at(-1).text,'旧职业的历史记录。');
  }
});

test('主播固定故事不会直播骑手或把打赏当作感情门槛，学生明确为成年大学生',()=>{
  const xu=G.NPCS.find(n=>n.id==='xu'),face=G.EVENTS.find(e=>e.id==='delivery-npc-xu');
  assert.match(face.text,/暂停镜头/);assert.match(face.text,/遮好收件信息/);
  assert.match(xu.arc[2][1],/直播/);assert.match(G.npcRoleplayPrompt('xu'),/不索要打赏/);
  assert.match(G.npcRoleplayPrompt('gu'),/18岁成年大学生/);assert.match(G.npcPortraitPrompt('gu').positive,/18岁/);
  assert.equal(xu.arc[3][3].minTrust,12);assert.equal(xu.arc[3][3].path,'romance');
});

test('重复、空白或缺失的可攻略职业在设定加载时拒绝，不能进入导出与AI提示词',()=>{
  const source=readFileSync(new URL('../public/js/data.js',import.meta.url),'utf8');
  const profiles=readFileSync(new URL('../public/js/npc-profiles.js',import.meta.url),'utf8');
  for(const role of ['知识区主播',' 知识区主播 ','',null,undefined]){
    const context=vm.createContext({});vm.runInContext(source,context);
    context.NightCourier.NPCS.find(n=>n.id==='gu').role=role;
    assert.throws(()=>vm.runInContext(profiles,context),/Romance NPC occupations must be distinct/);
  }
});
