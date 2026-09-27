import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/js/city-data.js';
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
const fresh=()=>Object.assign(G.newGame('问道','classic',123456),{
  unlockedFeatures:G.FEATURE_UNLOCKS.map(f=>f.id),unlockedPlaces:G.PLACES.filter(p=>!p.regional).map(p=>p.id)
});
const read=s=>G.sanitizeSave(G.clone(s));
const act=(s,action,p={})=>{const r=G.perform(s,action,p);assert.ok(r.ok,r.error);return r.state;};
// The seed is controlled only in this test fixture, immediately before the real completion boundary.
const outcome=(s,success=true)=>{
  s=G.advance(s,G.activityRemaining(s)-.25);
  assert.equal(s.activity.kind,'breakthrough');s.orderRefreshAt=s.minutes+15;
  for(let seed=1;seed<200000;seed++){
    const copy={seed},roll=G.rand(copy)*100;
    if(success?roll<35:roll>=95){s.seed=seed;break;}
  }
  return G.advance(s,.25);
};

test('十个境界、82个阶段，凡人单境界且仅渡劫封顶',()=>{
  assert.deepEqual(G.REALMS.map(r=>r.name),['凡人','炼气','筑基','金丹','元婴','化神','炼虚','合体','大乘','渡劫']);
  assert.equal(G.REALMS.reduce((n,r)=>n+r.levels,0),82);
  assert.equal(G.realmLevelCount(0),1);assert.ok(G.REALMS.slice(1).every(r=>r.levels===9));
  assert.deepEqual(G.REALMS.filter(r=>r.terminal).map(r=>r.name),['渡劫']);
  const s=fresh();assert.equal(G.realmLabel(s),'凡人');assert.equal(G.nextRealmLabel(s),'炼气一重');assert.equal(G.realmNeed(s),80);
  s.player.realmLevel=9;assert.equal(G.realmLabel(s),'凡人');assert.equal(G.realmLevel(s),1);
});
test('凡人突破60分钟后直接进入炼气一重，保留原大境奖励',()=>{
  let s=fresh();s.player.qi=100;const before=G.clone(s);s=act(s,'breakthrough');
  assert.deepEqual(before.player.qi,100);assert.equal(s.minutes,before.minutes);assert.equal(s.player.realm,0);
  assert.equal(s.player.qi,20);assert.equal(s.player.stamina,80);assert.equal(s.activity.duration,60);
  s=outcome(s);assert.equal(G.realmLabel(s),'炼气一重');assert.equal(s.player.qi,20);
  assert.equal(s.player.insight,6);assert.equal(s.player.constitution,6);assert.equal(s.player.agility,6);
  assert.equal(Object.hasOwn(s.player,"mortalProgress"),false);assert.equal(s.minutes,before.minutes+60);
});
test('凡人修为或体力不足、满级突破均原子拒绝，不消耗丹药或随机源',()=>{
  for(const [realm,level,qi,stamina] of [[0,1,79.99,100],[0,1,80,19.99],[9,9,9999,200]]){
    const s=fresh();Object.assign(s.player,{realm,realmLevel:level,qi,stamina});s.inventory.foundation=1;
    const before=G.clone(s),r=G.perform(s,'breakthrough',{usePill:true});
    assert.equal(r.ok,false);assert.equal(r.state,s);assert.deepEqual(s,before);
    if(realm===9)assert.match(r.error,/渡劫九重/);
  }
});
test('凡人失败退回约75%修为，仍为凡人；中断不返还本次投入',()=>{
  const s=fresh();s.player.qi=80;const pending=act(s,'breakthrough');
  const failed=outcome(pending,false);assert.equal(G.realmLabel(failed),'凡人');assert.equal(failed.player.qi,60);
  assert.equal(failed.player.health,82);assert.equal(Object.hasOwn(failed.player,"mortalProgress"),false);
  const stopped=act(G.advance(pending,25),'stop');assert.equal(stopped.player.qi,0);assert.equal(Object.hasOwn(stopped.player,"mortalProgress"),false);
});
test('全部82阶段可沿真实突破行动逐阶到达，门槛、标签与封顶一致',()=>{
  let s=fresh(),count=1,lastRank=G.realmRank(s);s.player.money=999999;
  while(!G.realmAtMax(s)){
    const label=G.nextRealmLabel(s),need=G.realmNeed(s),before={realm:s.player.realm,level:G.realmLevel(s)};
    assert.ok(need>0&&Number.isFinite(need));Object.assign(s.player,{qi:need,stamina:G.limits(s).stamina});
    s=outcome(act(s,'breakthrough'));assert.equal(G.realmLabel(s),label);assert.equal(s.player.qi,0);
    assert.ok(G.realmRank(s)>lastRank);lastRank=G.realmRank(s);
    assert.equal(s.player.realm,before.level===G.realmLevelCount(before.realm)?before.realm+1:before.realm);
    s=read(s);assert.equal(G.realmLabel(s),label);count++;assert.ok(count<=82);
  }
  assert.equal(count,82);assert.equal(G.realmLabel(s),'渡劫九重');assert.equal(G.realmNeed(s),0);assert.equal(G.nextRealmLabel(s),null);
});
test('化神九重不再封顶，新境界门槛逐境递增且概率有界',()=>{
  const s=fresh();s.player.realm=5;s.player.realmLevel=9;
  assert.equal(G.nextRealmLabel(s),'炼虚一重');assert.equal(G.realmAtMax(s),false);assert.equal(G.realmNeed(s),249);
  for(let realm=1;realm<G.REALMS.length;realm++)for(let level=1;level<=9;level++){
    Object.assign(s.player,{realm,realmLevel:level});assert.ok(G.breakChance(s)>=35&&G.breakChance(s)<=95);
    if(realm>1&&level<9){const previous=G.clone(s);previous.player.realm--;assert.ok(G.realmNeed(s)>G.realmNeed(previous));}
  }
});
test('炼气及以上保留原属性上限，不受凡人重数删除影响',()=>{
  const s=fresh();
  for(let realm=1;realm<=9;realm++)for(let level=1;level<=9;level++){
    Object.assign(s.player,{realm,realmLevel:level});const rank=realm*9+level-1,cap=G.limits(s);
    assert.equal(cap.health,100+Math.floor(rank*12/9));assert.equal(cap.stamina,100+Math.floor(rank*8/9));assert.equal(cap.mana,60+Math.floor(rank*16/9));
  }
});
test('v7–v12凡人旧重数存档明确拒绝，不改写原文',()=>{
  for(let version=7;version<=12;version++)for(let level=1;level<=9;level++){
    const old=fresh();old.schemaVersion=version;old.player.realmLevel=level;const raw=G.clone(old);
    assert.throws(()=>read(old),/不支持此存档版本/);assert.deepEqual(old,raw);
  }
});

test('v1–v6凡人存档明确拒绝，现代凡人完整投入80修为',()=>{
  for(let version=1;version<=6;version++){
    const old=fresh();old.schemaVersion=version;delete old.player.realmLevel;assert.throws(()=>read(old),/不支持此存档版本/);
    const a=fresh();assert.equal(G.realmLabel(a),'凡人');assert.equal(Object.hasOwn(a.player,"mortalProgress"),false);assert.equal(G.realmNeed(a),80);
  }
});





test('新境界及使用九阶破境丹的途中存档保持原投入、时间与概率',()=>{
  let s=fresh();s.player.realm=6;s.player.realmLevel=9;s.player.qi=1000;s.inventory[G.pillItemId('foundation',9)]=1;
  s=act(s,'breakthrough',{usePill:true});s=G.advance(s,20.25);const a=read(s);
  assert.deepEqual(a.activity,s.activity);assert.deepEqual(a.inventory,s.inventory);assert.deepEqual(a.player,s.player);assert.equal(a.minutes,s.minutes);
  assert.equal(G.realmLabel(outcome(a)),'合体一重');
});
test('非法重数、越界境界和突破投入均拒绝',()=>{
  for(const edits of [{realm:0,realmLevel:2},{realm:10},{realm:6.5},{realm:1,realmLevel:10},{realm:1,realmLevel:1.5}]){
    const s=fresh();Object.assign(s.player,edits);assert.throws(()=>read(s),/境界|重数/);
  }
  const wrong=act(Object.assign(fresh(),{player:{...fresh().player,qi:80}}),'breakthrough');wrong.activity.params.need++;
  assert.throws(()=>read(wrong),/突破投入/);
});
test('房租终局先于突破完成，不能提前晋升',()=>{
  let s=fresh();s.player.realm=6;s.player.realmLevel=9;s.player.qi=999;s=act(s,'breakthrough');
  s.minutes=6*1440-1;s.orderRefreshAt=6*1440+14;s.player.money=0;s.activity.elapsed=59;s.activity.startedAt=s.minutes-59;
  const before=G.clone(s.player);s=G.advance(s,1);assert.equal(s.gameOver.reason,'rent');assert.deepEqual(s.player,before);
});
