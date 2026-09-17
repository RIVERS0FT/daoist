import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createInitialState, advanceTime, runAction } = require('../.test-dist/engine.js');
const { initialCultivation, normalizeCultivation, runCultivation, breakthroughPreview, cultivationPlan, cultivationGain, realmName, maxMana } = require('../.test-dist/cultivation.js');
const { createSession, migrateSession, beginExploration } = require('../.test-dist/play.js');
const run = (g, c) => runCultivation(g, c, advanceTime);
const prepared = (level = 0, seed = 42) => { const g = createInitialState(seed); g.realmLevel=level; g.cultivation=initialCultivation(level); g.cultivation.manuals.breath=100; g.cultivation.preparation=100; g.cultivation.mana=maxMana(level); g.qi=999; g.energy=100; g.health=100; return g; };

test('v1–v4 upgrades retain all progress and grant only baseline cultivation, once', () => {
  for (const version of [1,2,3,4]) {
    const s=createSession(812, 'generative'); s.game.realmLevel=8; s.game.qi=234; s.game.money=777; s.game.position.locationId='dropoff-forest'; delete s.game.cultivation;
    const old=version<3 ? { ...s.game, version } : { ...s, version }, snapshot=structuredClone(old);
    const migrated=migrateSession(old); assert.equal(migrated.version,5); assert.equal(migrated.game.realmLevel,8);
    for (const key of ['qi','money','position','relationships','bike','flags','seed']) assert.deepEqual(migrated.game[key],s.game[key]);
    assert.ok(migrated.game.cultivation.manuals.breath>=44); assert.equal(migrated.game.cultivation.inventory.pill,0);
    assert.deepEqual(migrateSession(migrated), migrated); assert.deepEqual(old,snapshot);
    assert.equal(migrated.play.mode,version<3?'classic':'generative');
  }
});
test('v5 missing, future, malformed and unknown cultivation data is protected', () => {
  for (const mutation of [s=>delete s.game.cultivation, s=>s.game.cultivation.version=9, s=>s.game.cultivation.main='evil', s=>s.game.cultivation.inventory.herb=-1,
    s=>s.game.cultivation.mana=Infinity,s=>s.game.cultivation.manuals.breath=null,s=>s.game.cultivation.trial={stage:5,composure:0},s=>s.game.realmLevel=11,s=>s.play.mode='custom']) {
    const s=createSession(3); mutation(s); assert.equal(migrateSession(s),null);
  }
  assert.equal(migrateSession({version:6}),null); assert.equal(migrateSession({version:'5'}),null);
});
test('breakthrough preview is deterministic, free and cannot consume the saved seed', () => {
  const g=prepared(), before=structuredClone(g); for(let i=0;i<50;i++) assert.equal(breakthroughPreview(g).chance,1);
  assert.deepEqual(g,before); assert.equal(breakthroughPreview(g).reason,null);
  const result=run(g,{type:'breakthrough',strategy:'steady',aid:false}); assert.equal(result.realmLevel,1); assert.equal(result.qi,g.qi-30); assert.notEqual(result.seed,g.seed);
  assert.deepEqual(g,before);
});
test('rejected commands leave clock, RNG, position and resources exactly unchanged', () => {
  const g=createInitialState(4);
  for(const cmd of [{type:'breakthrough',strategy:'steady',aid:false},{type:'craft',id:'pill'},{type:'craft',id:'talisman'},{type:'use',id:'pill'},{type:'trial-start'},{type:'light-steps'},{type:'buy',id:'fake'}]) assert.strictEqual(run(g,cmd),g);
  const poor=prepared(); poor.energy=0; assert.strictEqual(run(poor,{type:'meditate',hours:3}),poor);
});
test('learn, practice and switching create one active manual without losing proficiency', () => {
  let g=prepared(); g=run(g,{type:'learn',id:'wind'}); assert.equal(g.cultivation.main,'breath'); assert.equal(g.money,1173);
  g=run(g,{type:'equip',id:'wind'}); g=run(g,{type:'train'}); assert.equal(g.cultivation.manuals.wind,8); assert.equal(g.cultivation.manuals.breath,100);
  const dup=run(g,{type:'learn',id:'wind'}); assert.strictEqual(dup,g);
  g=run(g,{type:'equip',id:'breath'}); assert.equal(g.cultivation.manuals.wind,8);
});
test('phase-aware cultivation splits night and morning while applying mastery and notes', () => {
  const g=prepared(); g.minute=1170;
  assert.ok(cultivationGain(g,60)>cultivationGain({...g,minute:600},60));
  const next=run(g,{type:'meditate',hours:1}); assert.equal(next.qi-g.qi,cultivationGain(g,60)); assert.equal(next.minute,1230);
  assert.equal(next.energy,92); assert.deepEqual(next.position,g.position);
});
test('three-hour cultivation stops at a checkpoint event without charging unplayed hours', () => {
  const g=prepared(), next=runCultivation(g,{type:'meditate',hours:3},advanceTime,n=>({...n,pendingEventId:'old-lady-1'}));
  assert.equal(next.minute-g.minute,60); assert.equal(next.energy,g.energy-8); assert.equal(next.pendingEventId,'old-lady-1');
});
test('midnight death aborts meditation, manufacture and breakthroughs without posthumous rewards', () => {
  for(const cmd of [{type:'meditate',hours:3},{type:'craft',id:'pill'},{type:'breakthrough',strategy:'steady',aid:false}]) {
    const g=prepared(); g.day=6;g.minute=1435;g.rentDueDay=7;g.money=0;g.health=4;g.cultivation.inventory.herb=2;
    if(cmd.type==='breakthrough') { // Cross an injected fatal clock after valid entry health.
      g.health=60; const n=runCultivation(g,cmd,s=>({...s,gameOver:true,health:0})); assert.equal(n.realmLevel,0); continue;
    }
    const next=run(g,cmd); assert.equal(next.gameOver,true); assert.equal(next.cultivation.inventory.pill,0); assert.equal(next.qi,g.qi); assert.equal(next.day,7); assert.equal(next.minute,0);
  }
});
test('a failing breakthrough refunds half the required qi and retains the realm and bounded experience', () => {
  let g=prepared(2); g.cultivation.preparation=0; g.health=40;g.stress=100;
  for(let seed=1;seed<100000;seed++) { g.seed=seed; const n=run(g,{type:'breakthrough',strategy:'risk',aid:false}); if(n.realmLevel===2) {
    assert.equal(n.qi,g.qi-101+50); assert.equal(n.health,26); assert.equal(n.cultivation.failures,1); assert.equal(n.stress,100); return;
  }} assert.fail('expected a failing deterministic seed');
});
test('recovery spends time and mana is distinct from advancement qi', () => {
  const g=prepared();g.cultivation.mana=0;const next=run(g,{type:'breathe'}); assert.equal(next.cultivation.mana,20);assert.equal(next.qi,g.qi);assert.equal(next.minute-g.minute,30);
});
test('crafting, purchasing and medication have explicit limits and pay before midnight rent', () => {
  let g=prepared(); g.minute=1435;g.day=6;g.rentDueDay=7;g.money=860;
  g=run(g,{type:'buy',id:'tea'}); assert.equal(g.money,840); assert.equal(g.rentDueDay,9);assert.equal(g.cultivation.inventory.tea,1);
  g.minute=420;g.cultivation.inventory.tea=4;
  for(let i=0;i<3;i++)g=run(g,{type:'use',id:'tea'});
  assert.equal(g.cultivation.medicineUses,3);assert.strictEqual(run(g,{type:'use',id:'tea'}),g);
  g=advanceTime(g,1440);const next=run(g,{type:'use',id:'tea'});assert.equal(next.cultivation.medicineUses,1);
  g.cultivation.inventory.herb=2;const crafted=run(g,{type:'craft',id:'pill'}); assert.equal(crafted.cultivation.inventory.herb,0);assert.equal(crafted.cultivation.inventory.pill,1);
});
test('protection requires consent and is consumed only on an accepted attempt', () => {
  const g=prepared();g.cultivation.inventory.talisman=1;
  const no=run(g,{type:'breakthrough',strategy:'steady',aid:false});assert.equal(no.cultivation.inventory.talisman,1);
  const yes=run(g,{type:'breakthrough',strategy:'steady',aid:true});assert.equal(yes.cultivation.inventory.talisman,0);
  g.energy=0;assert.strictEqual(run(g,{type:'breakthrough',strategy:'steady',aid:true}),g);
});
test('light steps reduce fatigue, never bypass battery or wear, and expire on actual successful rides', () => {
  const base=prepared(3);base.cultivation.main='wind';base.cultivation.manuals.wind=20;
  let buff=run(base,{type:'light-steps'});assert.equal(buff.cultivation.lightSteps,2);assert.equal(buff.cultivation.mana,base.cultivation.mana-8);
  buff.activeOrder={id:'one',merchant:'test',customer:'test',distanceKm:2,reward:20,estimatedMinutes:22,acceptedAtDay:1,acceptedAtMinute:420,strange:false};
  buff.bikeBattery=0; assert.strictEqual(runAction(buff,'complete-order'),buff);assert.equal(buff.cultivation.lightSteps,2);
  buff.bikeBattery=82;const normal=structuredClone(buff);normal.cultivation.lightSteps=0;
  const enhanced=runAction(buff,'complete-order'), ordinary=runAction(normal,'complete-order');
  assert.equal(enhanced.energy,ordinary.energy+3);assert.equal(enhanced.cultivation.lightSteps,1);assert.equal(enhanced.bikeBattery,ordinary.bikeBattery);
});
test('foundation trial blocks other actions, permits resource-free retreat and persists each stage', () => {
  let g=run(prepared(9),{type:'trial-start'});assert.ok(g.cultivation.trial);
  assert.strictEqual(runAction(g,'accept-order'),g);assert.strictEqual(run(g,{type:'prepare'}),g);
  const s={...createSession(8),game:g};assert.strictEqual(beginExploration(s,'city'),s);
  for(let stage=0;stage<3;stage++){
    const restored=migrateSession(JSON.parse(JSON.stringify({...s,game:g})));assert.deepEqual(restored.game.cultivation,g.cultivation);
    g=run(restored.game,{type:'trial-choice',choice:'steady',stage});
    assert.strictEqual(run(g,{type:'trial-choice',choice:'steady',stage}),g);
  }
  assert.equal(g.cultivation.trialPassed,true);assert.equal(g.cultivation.trial,null);assert.strictEqual(run(g,{type:'trial-start'}),g);
  g=run(prepared(9),{type:'trial-start'});g.energy=0;g.cultivation.mana=0;g.money=-99;
  const retreat=run(g,{type:'trial-exit'});assert.equal(retreat.cultivation.trial,null);assert.equal(retreat.minute-g.minute,5);
});
test('rushing every foundation stage fails safely; successful trial unlocks only the next realm', () => {
  let g=run(prepared(9),{type:'trial-start'});for(let stage=0;stage<3;stage++)g=run(g,{type:'trial-choice',choice:'rush',stage});
  assert.equal(g.cultivation.trialPassed,false);assert.equal(g.realmLevel,9);
  g=prepared(9);assert.ok(breakthroughPreview(g).reason);g.cultivation.trialPassed=true;
  const n=run(g,{type:'breakthrough',strategy:'steady',aid:false});assert.equal(n.realmLevel,10);assert.equal(realmName(10),'筑基初期');
  assert.strictEqual(run(n,{type:'breakthrough',strategy:'steady',aid:false}),n);assert.deepEqual(migrateSession({...createSession(),game:n}).game,n);
});
