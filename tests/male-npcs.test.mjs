import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import '../public/js/data.js';
import '../public/js/npc-profiles.js';
import '../public/js/engine.js';
import '../public/js/storage.js';
import '../public/js/progression.js';
import {act,finish,acknowledge,awakeningPending} from './helpers/opening.mjs';
const G=globalThis.NightCourier;
const ids=['han','zhao','qin','cheng','song','yue','pei','meng','jiang'];
const expected={han:['韩远舟',34,'急诊医生'],zhao:['赵启明',36,'电力检修员'],qin:['秦观澜',29,'气象观测员'],cheng:['程砚秋',45,'古籍修复师'],song:['宋泊宁',32,'夜班公交司机'],yue:['岳长川',39,'消防救援员'],pei:['裴景行',28,'文物研究员'],meng:['孟怀山',63,'退休木匠'],jiang:['江临',26,'软件工程师']};
const blank={met:false,affinity:0,trust:0,stage:0,path:'none',lastTalkDay:0};
const read=s=>G.sanitizeSave(G.clone(s));
const choose=(s,index=0)=>act(s,'choose',{eventId:s.pending.id,index});
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const offers=new Map();
function offer(id){
  if(!offers.has(id))for(let seed=1;seed<6000;seed++){
    const s=G.newGame('男性相逢','classic',seed);s.flags.firstOrder=true;s.stats.delivered=1;s.orders=[];G.refreshOrders(s);
    const o=s.orders.find(o=>o.npc===id&&!G.place(o.target).permanent&&!G.travelBlock(s,G.travelPlan(s,o.target))&&
      (o.condition!=='careful'||s.player.stamina-G.travelPlan(s,o.target).stamina>=10));
    if(o){offers.set(id,{s,ticket:o});break;}
  }
  assert.ok(offers.has(id),`No natural offer for ${id}`);return G.clone(offers.get(id));
}
function pending(id,mode='classic',met=false){let {s,ticket}=offer(id);s.mode=mode;if(met){s.bonds[id].met=true;s.unlockedFeatures=['bonds'];}return finish(act(s,'deliver',{id:ticket.id}));}
function talk(id,stage,mode='classic'){
  const n=G.NPCS.find(n=>n.id===id),s=G.newGame('男性故事',mode,789);
  // Explicit social fixture; actual visits, timed choices and settlement still use the engine.
  s.position=n.place;s.location=null;s.unlockedPlaces=[...new Set([...s.unlockedPlaces,n.place])];s.unlockedFeatures=['bonds'];
  Object.assign(s.bonds[id],{met:true,stage,affinity:60,trust:20,path:'none',lastTalkDay:0});
  return finish(act(s,'visit',{id}));
}
function old19(s){const raw=G.clone(s);raw.schemaVersion=19;for(const id of ids)delete raw.bonds[id];return raw;}

test('男性总数12、女性9、总数21，追加九人有明确年龄、独立职业及四段友情',()=>{
  assert.deepEqual(G.NEW_MALE_NPC_IDS,ids);assert.equal(G.NPCS.length,21);
  assert.equal(G.NPCS.filter(n=>n.gender==='male').length,12);assert.equal(G.NPCS.filter(n=>n.gender==='female').length,9);
  assert.equal(G.NPCS.filter(n=>n.romantic).length,9);assert.equal(new Set(G.NPCS.map(n=>n.role)).size,21);
  assert.deepEqual(G.NPCS.slice(12).map(n=>n.id),ids);
  const s=G.newGame('隐藏新人物');assert.equal(Object.keys(s.bonds).length,21);assert.deepEqual(G.visibleNPCs(s),[]);
  for(const n of G.NPCS.slice(12)){
    assert.deepEqual([n.name,n.age,n.role],expected[n.id]);assert.equal(n.gender,'male');assert.equal(n.romantic,false);
    assert.deepEqual(s.bonds[n.id],blank);assert.equal(n.arc.length,4);
    for(const a of n.arc){assert.equal(a.length,5);assert.ok(a.slice(2).some(c=>!c.duration&&!G.effectBlock(s,c.effects,c.itemCost)));}
    assert.deepEqual(n.arc[3].slice(2).map(c=>c.path),['friend','friend','friend']);
  }
  assert.equal(G.VERSION,21);assert.equal(G.STORAGE_KEY,'night-courier:saves:v21');
});

test('除周野新故事外原十一人文字数值、画像AI与地图保持指纹一致',()=>{
  assert.equal(hash(G.NPCS.slice(0,12).filter(n=>n.id!=='zhou').map(({gender,...n})=>n)),'bddd20c6c18b8dc78034e2670d3606e97f58d859ea7b6246066621c8ac386945');
  assert.equal(hash(G.npcPromptCatalog().slice(0,12).filter(c=>c.profile.id!=='zhou')),'ddc4524ae7071b0de05477eeb31f0d10de765a61cfcb94f9c6a6a84aa976b080');
  assert.equal(hash(G.PLACES),'3772f185dc32cff4ec75996533f4dfe075e418c066f8cab0dd444a6f93fc1429');
  assert.equal(G.DELIVERY_NPC_CHANCE,.35);assert.equal(G.SYSTEM_UNLOCK_DELIVERIES,10);assert.equal(G.STORY_STAGES.length,12);
});

for(const id of ids)test(`${id}：四段三选项在经典和AI中均固定，结果实际结算且只有友情`,()=>{
  for(const mode of ['classic','ai'])for(let stage=0;stage<4;stage++)for(let index=0;index<3;index++){
    let s=talk(id,stage,mode);const before=G.clone(s),choice=s.pending.choices[index];
    assert.equal(s.pending.npcAdvance,true);assert.equal(s.pending.source,'classic');
    s=finish(choose(read(s),index));assert.equal(s.bonds[id].stage,stage+1);assert.equal(s.bonds[id].path,stage===3?'friend':'none');
    assert.equal(s.minutes,before.minutes+(choice.duration||0));assert.equal(s.stats.delivered,before.stats.delivered);
    assert.equal(s.player.money,before.player.money+(choice.effects.money||0));assert.equal(s.player.coins,before.player.coins);
    const done=G.clone(s);s=acknowledge(read(s));assert.deepEqual(s.player,done.player);assert.deepEqual(s.bonds,done.bonds);
    assert.equal(s.minutes,done.minutes);assert.equal(G.perform(s,'visit',{id}).ok,false);
    assert.equal(G.perform(s,'choose',{eventId:before.pending.id,index}).ok,false);
  }
});

for(const id of ids)test(`${id}：异地结识后实际拜访、休息及四段故事推进至知己`,()=>{
  let s=acknowledge(choose(pending(id)));const npc=G.NPCS.find(n=>n.id===id);
  // The location remains independently unlocked; ample cash isolates the social progression.
  s.unlockedPlaces=[...new Set([...s.unlockedPlaces,npc.place])];s.player.money=5000;
  for(let i=0;s.bonds[id].stage<4&&i<40;i++){
    if(s.vehicle.battery<45)s=acknowledge(finish(act(s,'charge')));
    if(s.player.stamina<55)s=acknowledge(finish(act(s,'rest')));
    if(s.bonds[id].lastTalkDay===G.day(s))s=acknowledge(finish(act(s,'sleep')));
    if(s.bonds[id].lastTalkDay===G.day(s))continue;
    s=finish(act(s,'visit',{id}));assert.equal(s.pending.npcId,id);
    s=acknowledge(finish(choose(read(s))));
  }
  assert.equal(s.bonds[id].stage,4);assert.equal(s.bonds[id].path,'friend');assert.equal(read(s).bonds[id].path,'friend');
  assert.equal(G.endingOptions(s).find(e=>e.id==='bond').ready,false);
  assert.equal(G.formulaBondProgress(s,id).total,0);
});

for(const id of ids)test(`${id}：配送重逢保留三分钟与票据；故事在途可信恢复并拒绝AI篡改`,()=>{
  let s=pending(id,'ai',true),before=G.clone(s);s=G.advance(choose(s,1),1);assert.equal(s.activity.elapsed,1);
  const mid=read(s);assert.deepEqual(mid.activity,s.activity);s=finish(mid);
  assert.equal(s.minutes,before.minutes+3);assert.equal(s.bonds[id].stage,0);assert.equal(s.bonds[id].path,'none');assert.equal(s.bonds[id].lastTalkDay,0);
  assert.equal(s.bonds[id].affinity,5);assert.equal(s.bonds[id].trust,2);assert.equal(s.stats.delivered,2);
  s=talk(id,2,'ai');before=G.clone(s);s=G.advance(choose(s,0),1);const raw=G.clone(s);
  raw.activity.params.event.text='被覆盖的人设';raw.activity.params.event.source='ai';raw.activity.params.event.choices[0].effects={money:999};
  const loaded=read(raw);assert.equal(loaded.activity.params.event.text,before.pending.text);assert.deepEqual(loaded.player,s.player);
  assert.equal(loaded.activity.elapsed,1);s=finish(loaded);assert.equal(s.minutes,before.minutes+before.pending.choices[0].duration);assert.equal(s.bonds[id].stage,3);
  const noAI=talk(id,0,'ai');noAI.pending.aiStatus='unrequested';assert.strictEqual(G.applyAIEvent(noAI,noAI.pending.id,{title:'覆盖'}),noAI);
});

for(const id of ids)test(`${id}：人物画像与AI日常使用同一年龄职业，非法恋爱上下文不生效`,()=>{
  const p=G.getNPCProfile(id),n=G.NPCS.find(n=>n.id===id),before=G.newGame('不自动认识','ai',77),snapshot=G.clone(before);
  assert.equal(p.gender,'male');assert.equal(p.age,n.age);assert.equal(p.role,n.role);assert.match(G.npcPortraitPrompt(id).positive,/成年男性/);
  assert.match(G.npcRoleplayPrompt(id),/不可攻略/);assert.equal(G.npcDialogueContext(id,{met:true,stage:4,path:'romance'}).relationship.path,'none');
  assert.deepEqual(G.npcAIRequestContext(before,{kind:'social',npcId:id,aiStatus:'unrequested'}),{});assert.deepEqual(before,snapshot);
  assert.throws(()=>{p.personality.traits[0]='覆盖';},TypeError);
});

test('v19旧在途档保留票据、路线、旧十二人和资产，新九人仅补隐藏记录',()=>{
  const s=G.newGame('旧十二人','ai',81);s.bonds.chen.met=true;s.bonds.chen.affinity=18;s.bonds.chen.stage=1;
  const inFlight=G.advance(act(s,'deliver',{id:s.orders[0].id}),.2),raw=old19(inFlight),out=read(raw);
  for(const k of ['player','stats','activeOrder','location','activity','minutes','seed','claimed','inventory','alchemy'])assert.deepEqual(out[k],inFlight[k],k);
  for(const n of G.NPCS.slice(0,12))assert.deepEqual(out.bonds[n.id],inFlight.bonds[n.id]);
  for(const id of ids)assert.deepEqual(out.bonds[id],blank);
  assert.deepEqual(out.unlockNotices,inFlight.unlockNotices);assert.equal(out.schemaVersion,21);assert.deepEqual(read(out).bonds,out.bonds);
});

test('v19存储自动迁移到v20保留原文；损坏v20不回退覆盖；导入生成独立副本',()=>{
  const raw=old19(G.newGame('旧键迁移','classic',91)),text=JSON.stringify({schemaVersion:19,saves:[raw]});
  const map=new Map([[G.LEGACY_STORAGE_KEY,text]]),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
  const store=G.createStore(storage),out=store.load();assert.equal(out.length,1);assert.equal(out[0].schemaVersion,21);assert.equal(map.get(G.LEGACY_STORAGE_KEY),text);
  assert.ok(map.has(G.STORAGE_KEY));for(const id of ids)assert.deepEqual(out[0].bonds[id],blank);
  const original=out[0].id;store.import(text);assert.equal(store.saves.length,2);assert.equal(new Set(store.saves.map(s=>s.id)).size,2);assert.ok(store.saves.some(s=>s.id===original));
  const corrupt=G.clone(out[0]);delete corrupt.bonds.han;const broken=JSON.stringify({schemaVersion:20,saves:[corrupt]});map.set(G.STORAGE_KEY,broken);map.delete(G.BACKUP_KEY);
  const badStore=G.createStore(storage);assert.deepEqual(badStore.load(),[]);assert.equal(map.get(G.STORAGE_KEY),broken);assert.match(badStore.warning,/没有覆盖/);
});

for(const id of ids)test(`${id}：损坏记录、未识社交或伪造感情拒绝，不因读档授予角色`,()=>{
  const mutations=[s=>delete s.bonds[id],s=>s.bonds[id].met='true',s=>s.bonds[id].stage=5,s=>s.bonds[id].age=99,s=>Object.assign(s.bonds[id],{met:true,stage:4,path:'romance',trust:100})];
  for(const [i,change]of mutations.entries()){
    const s=G.newGame('校验');change(s);if(i===3){assert.equal(read(s).bonds[id].age,undefined);continue;}assert.throws(()=>read(s));
  }
  const s=talk(id,0);s.bonds[id]=G.clone(blank);assert.throws(()=>read(s),/未结识/);
});

test('第十单老人剧情不借附带男性票据提前结识或发币，原绑定规则保留',()=>{
  for(const id of ids){let s=awakeningPending();const before=G.clone(s.bonds[id]);s.pending.delivery.npc=id;s=choose(s);assert.equal(s.flags.systemAwakened,true);assert.equal(s.player.coins,0);assert.deepEqual(s.bonds[id],before);assert.equal(s.stats.delivered,10);}
});

test('男性耗时故事遇到同刻欠租先终局，不推进个人阶段或发正奖励',()=>{
  let s=talk('han',2);s.minutes=6*1440-10;s.player.money=0;const bond=G.clone(s.bonds.han);
  s=choose(s,0);s=G.advance(s,10);assert.ok(s.gameOver);assert.deepEqual(s.bonds.han,bond);assert.equal(s.eventResult,null);
});

test('追加男性不能挤占旧六人丹方、固定地点首位收餐人或旧故事顺序',()=>{
  for(const place of ['clinic','garage','bookshop','temple','market','park']){
    const s=G.newGame('固定关联'),old=G.NPCS.slice(0,12).find(n=>n.place===place);
    assert.equal(G.orderNPC(s,G.place(place)),old.id);
  }
  assert.equal(G.ALCHEMY_RECIPES.length,108);
  for(const id of ids){const s=acknowledge(choose(pending(id)));assert.equal(G.formulaBondProgress(s,id).total,0);assert.deepEqual(s.alchemy.formulas,[]);}
});

test('新男性职业重复或缺失在资料初始化时拒绝',()=>{
  const data=readFileSync(new URL('../public/js/data.js',import.meta.url),'utf8'),profile=readFileSync(new URL('../public/js/npc-profiles.js',import.meta.url),'utf8');
  for(const role of ['',null,' 修车铺老板 ']){const context=vm.createContext({});vm.runInContext(data,context);context.NightCourier.NPCS.find(n=>n.id==='han').role=role;assert.throws(()=>vm.runInContext(profile,context),/All NPC occupations must be distinct/);}
});
