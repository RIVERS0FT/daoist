import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/js/city-data.js';
import '../public/js/city-region-data.js';
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
const act=(s,a,p={})=>{const r=G.perform(s,a,p);assert.ok(r.ok,`${a}: ${r.error}`);return r.state;};
const read=s=>G.sanitizeSave(G.clone(s));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function reject(s,a,p={}){const before=G.clone(s),r=G.perform(s,a,p);assert.equal(r.ok,false);assert.equal(r.state,s);assert.deepEqual(s,before);}
function ack(s){
 if(s.eventResult)s=act(s,'ackResult',{id:s.eventResult.id});
 if(s.placeUnlock)s=act(s,'ackPlaceUnlock',{id:s.placeUnlock.place});
 while(G.nextUnlockNotice(s))s=act(s,'ackUnlock',{id:G.unlockNoticeKey(G.nextUnlockNotice(s))});
 return s;
}
function finish(s){for(let i=0;s.activity&&i<500;i++){assert.ok(!s.gameOver&&!s.pending&&!s.eventResult);s=G.advance(s,Math.min(1,G.activityRemaining(s)));}assert.equal(s.activity,null);return s;}
// A qualified, funded test fixture, not a production shortcut or migration path.
function eligible(mode='classic'){
 const s=G.newGame('五宗边界',mode,44123);s.player.realm=4;s.player.money=100000;s.player.coins=10000;
 s.stats.delivered=42;s.flags.firstOrder=true;s.flags.systemAwakened=true;s.claimed=['q1'];s.stats.trained=1;
 for(const k of G.STORY_FLAG_KEYS.slice(0,6))s.flags[k]=true;
 for(const k of ['storyWestwardNote','storyRiverRelay'])s.flags[k]=true;
 s.unlockedPlaces=G.PLACES.filter(p=>p.permanent).map(p=>p.id);s.bonds.lu.met=true;s.bonds.lin.met=true;s.sect.invited=true;
 s.unlockedFeatures=G.FEATURE_UNLOCKS.map(f=>f.id);s.unlockNotices=[];
 return s;
}
function invite(id,mode='classic'){
 let s=eligible(mode);s.position=G.sectDefinition(id).place;
 if(id!=='tingyu'){s=act(s,'sectStory',{sectId:id});s=ack(act(read(s),'choose',{eventId:s.pending.id,index:0}));}
 return s;
}
function join(id){return ack(finish(act(invite(id),'sectJoin',{sectId:id})));}
function fund(s,id,rank=3){const v=G.sectState(s,id);v.rank=rank;v.earned=5000;v.contribution=5000-G.sectDefinition(id).ranks.slice(1,rank+1).reduce((n,r)=>n+r.cost,0);v.completed=30;return s;}
function own(s,id){const t=G.technique(id);if(t.source==='system')s.learned.push(id);else G.sectState(s,t.source).manuals.push(id);return s;}

test('exactly 36 unique techniques, 11 common and 5 per unique discipline; no formula conversion',()=>{
 assert.equal(G.TECHNIQUES.length,36);assert.equal(new Set(G.TECHNIQUES.map(t=>t.id)).size,36);assert.equal(new Set(G.TECHNIQUES.map(t=>t.name)).size,36);
 assert.equal(G.SECTS.length,5);assert.equal(new Set(G.SECTS.map(x=>x.discipline)).size,5);
 assert.equal(G.ITEMS.filter(t=>t.type==='technique').length,36);assert.equal(G.TECHNIQUES.filter(t=>t.source==='system').length,11);
 assert.equal(G.PLACES.length,110+G.REGION_ROADS.places.length);assert.equal(G.ALCHEMY_RECIPES.length,108);
 for(const d of G.SECTS){assert.equal(d.library.filter(t=>t.manual).length,5);assert.ok(G.PLACES.some(p=>p.id===d.place));}
 assert.equal(G.sectDefinition('tingyu').discipline,'符阵修');assert.equal(G.sectDefinition('jingang').discipline,'体修');assert.equal(G.sectDefinition('baicao').discipline,'药修');
 assert.equal(new Set(G.SECTS.map(s=>s.standing)).size,5);assert.equal(G.SECT_RELATIONS.length,10);assert.equal(new Set(G.SECT_RELATIONS.map(r=>G.sectPair(r.a,r.b))).size,10);
});
for(const t of G.TECHNIQUES)test(`technique ${t.name}: actual acquisition, exact cost, no duplicate or cross-channel purchase`,()=>{
 let s=t.source==='system'?eligible():fund(join(t.source),t.source);
 const time=s.minutes,resource=t.source==='system'?s.player.coins:G.sectState(s,t.source).contribution,capBefore=G.limits(s);
 const action=t.source==='system'?'buy':'sectBuy',p=t.source==='system'?{id:t.id}:{id:t.id,sectId:t.source};
 if(t.source!=='system')reject(s,'buy',{id:t.id});
 s=act(s,action,p);assert.ok(G.knowsTechnique(s,t.id));near(s.minutes,time);
 assert.equal(t.source==='system'?s.player.coins:G.sectState(s,t.source).contribution,resource-t.cost);
 for(const [key,value] of Object.entries(t.bonus))near(G.techniqueBonuses(s)[key],value);
 for(const key of ['health','stamina','mana'])if(t.bonus[key]){near(G.limits(s)[key]-capBefore[key],t.bonus[key]);assert.ok(s.player[key]<G.limits(s)[key]);}
 s=read(s);assert.ok(G.knowsTechnique(s,t.id));reject(s,action,p);
});
for(const d of G.SECTS)test(`${d.name}: timed join, duty, in-flight load, cancel consumes quota and no foreign credit`,()=>{
 let s=invite(d.id),at=s.minutes;s=act(s,'sectJoin',{sectId:d.id});assert.ok(!G.sectMember(s));
 s=read(G.advance(s,9));assert.ok(!G.sectMember(s));s=finish(s);near(s.minutes,at+20);assert.equal(G.currentSect(s).id,d.id);
 s=ack(s);const duty=d.duties[0];s=act(s,'sectTask',{sectId:d.id,id:duty.id});s=read(G.advance(s,duty.minutes/2));
 const stopped=act(s,'stop');assert.equal(G.sectState(stopped,d.id).earned,0);reject(stopped,'sectTask',{sectId:d.id,id:duty.id});
 s=finish(s);assert.equal(G.sectState(s,d.id).earned,duty.contribution);assert.equal(G.sectState(s,d.id).completed,1);
 for(const other of G.SECTS.filter(x=>x.id!==d.id))assert.equal(G.sectState(s,other.id).earned,0);
 s=read(s);reject(s,'sectTask',{sectId:d.id,id:duty.id});reject(s,'sectJoin',{sectId:d.id});
});
for(const d of G.SECTS)test(`${d.name}: promotion cost paid once, cancelled exam does not promote; complete restores`,()=>{
 let s=fund(join(d.id),d.id,0),v=G.sectState(s,d.id),before=v.contribution;
 s=act(s,'sectPromote',{sectId:d.id});assert.equal(G.sectState(s,d.id).rank,0);assert.equal(G.sectState(s,d.id).contribution,before-20);
 s=read(G.advance(s,10));const stopped=act(s,'stop');assert.equal(G.sectState(stopped,d.id).rank,0);assert.equal(G.sectState(stopped,d.id).contribution,before-20);
 s=read(finish(s));assert.equal(G.sectState(s,d.id).rank,1);assert.equal(G.sectState(s,d.id).contribution,before-20);
});
for(const d of G.SECTS)test(`${d.name}: remote, wrong-library, insufficient resources and wrong sect rejection are atomic`,()=>{
 let s=join(d.id);const duty=d.duties[0];s.position='home';reject(s,'sectTask',{sectId:d.id,id:duty.id});s.position=d.place;
 reject(s,'sectBuy',{sectId:d.id,id:d.library[0].id});reject(s,'sectBuy',{sectId:d.id,id:'breathing'});reject(s,'sectTask',{sectId:'unknown',id:duty.id});
 for(const other of G.SECTS.filter(x=>x.id!==d.id)){s.position=other.place;reject(s,'sectTask',{sectId:other.id,id:other.duties[0].id});reject(s,'sectJoin',{sectId:other.id});}
 s.position=d.place;s.player.stamina=0;reject(s,'sectTask',{sectId:d.id,id:duty.id});
});
for(const d of G.SECTS.filter(d=>d.id!=='tingyu'))for(const mode of ['classic','ai'])test(`${d.name} ${mode}: introduction is fixed, no forced membership, faithful pending restore`,()=>{
 let s=eligible(mode);s.position=d.place;s=act(s,'sectStory',{sectId:d.id});assert.equal(s.pending.source,'classic');assert.equal(s.pending.aiStatus,'skip');assert.ok(!G.sectState(s,d.id).invited);
 const raw=G.clone(s);raw.pending.choices[0].effects={coins:99999};raw.pending.text='untrusted';s=read(raw);
 assert.notEqual(s.pending.text,'untrusted');assert.equal(s.pending.choices[0].effects.coins,undefined);const pending=s.pending;
 assert.equal(G.applyAIEvent(s,pending.id,{title:'bad'}),s);s=act(s,'choose',{eventId:pending.id,index:0});
 assert.ok(G.sectState(s,d.id).invited);assert.ok(!G.sectState(s,d.id).member);assert.equal(s.player.coins,10000);
 assert.deepEqual(s.sectWorld.stories[d.id],[0]);s=ack(read(s));reject(s,'choose',{eventId:pending.id,index:0});reject(s,'sectStory',{sectId:d.id});
});
test('entry gates: sword needs foundation, mind needs qi III, herbal needs alchemy, undiscovered station cannot introduce',()=>{
 for(const [id,mutate] of [['lingxiao',s=>s.player.realm=1],['xuanwei',s=>{s.player.realm=1;s.player.realmLevel=2;}],['baicao',s=>{s.unlockedFeatures=s.unlockedFeatures.filter(x=>x!=='alchemy');s.flags.storyStreetVein=false;}],['jingang',s=>s.unlockedPlaces=s.unlockedPlaces.filter(x=>x!=='park')]]){
  const s=eligible();s.position=G.sectDefinition(id).place;mutate(s);reject(s,'sectStory',{sectId:id});
 }
});
test('global next-day transfer cooldown, old credit/rank/manuals preserved and cannot fund new sect',()=>{
 let s=fund(join('jingang'),'jingang',1);s=act(s,'sectBuy',{sectId:'jingang',id:'bull-march'});
 const credits=s.sectWorld.records.jingang.contribution,bonus=G.techniqueBonuses(s).travelStamina;
 s=act(s,'sectLeave',{sectId:'jingang'});s.position='clinic';s=act(s,'sectStory',{sectId:'baicao'});s=ack(act(s,'choose',{eventId:s.pending.id,index:0}));reject(s,'sectJoin',{sectId:'baicao'});
 s=G.advance(read(s),G.day(s)*1440-s.minutes+1);s=ack(finish(act(s,'sectJoin',{sectId:'baicao'})));
 assert.equal(G.currentSect(s).id,'baicao');assert.equal(s.sectWorld.records.jingang.contribution,credits);assert.equal(s.sectWorld.records.jingang.rank,1);
 assert.equal(s.sectWorld.records.baicao.contribution,0);near(G.techniqueBonuses(s).travelStamina,bonus);assert.equal(G.sectTrainingBonus(s),0);
 reject(s,'sectBuy',{sectId:'baicao',id:'fire-sense'});assert.equal(read(s).sectWorld.records.jingang.contribution,credits);
});
for(const d of G.SECTS)test(`${d.name}: full four-stage story, three options per stage, relationship changes only after completion`,()=>{
 let s=fund(join(d.id),d.id);const count=G.SECT_STORIES[d.id].length;assert.equal(count,4);
 while(s.sectWorld.stories[d.id].length<count){
  const e=G.nextSectStory(s,d.id);assert.equal(e.choices.length,3);const relations=G.SECT_RELATIONS.map(r=>G.sectRelation(s,r.a,r.b));
  s.player.stamina=G.limits(s).stamina;s.player.mana=G.limits(s).mana;s=act(s,'sectStory',{sectId:d.id});const pending=s.pending;
  const index=e.choices.findIndex(c=>c.duration),pick=index<0?0:index;s=act(read(s),'choose',{eventId:pending.id,index:pick});
  if(s.activity){s=read(G.advance(s,e.choices[pick].duration/2));assert.deepEqual(G.SECT_RELATIONS.map(r=>G.sectRelation(s,r.a,r.b)),relations);reject(s,'stop');s=finish(s);}
  assert.equal(s.sectWorld.stories[d.id].at(-1),pick);s=ack(read(s));reject(s,'choose',{eventId:pending.id,index:pick});
 }
 reject(s,'sectStory',{sectId:d.id});assert.equal(G.nextSectStory(s,d.id),null);
});
test('three sequential councils playable as independent cultivator; genuine gates and read do not reroll relations',()=>{
 let s=eligible();
 for(const d of G.SECTS.slice(1)){s.position=d.place;s=act(s,'sectStory',{sectId:d.id});s=ack(act(s,'choose',{eventId:s.pending.id,index:0}));}
 s.position='market';assert.equal(G.sectMember(s),false);
 for(let i=0;i<3;i++){
  s=act(s,'sectCouncil');assert.equal(s.pending.sectCouncil,i);const id=s.pending.id;s=act(read(s),'choose',{eventId:id,index:0});if(s.activity)s=finish(s);s=ack(read(s));reject(s,'choose',{eventId:id,index:0});
 }
 assert.deepEqual(s.sectWorld.councils,[0,0,0]);reject(s,'sectCouncil');
 const before=G.clone(s);for(let i=0;i<10;i++)for(const r of G.SECT_RELATIONS){near(G.sectRelation(s,r.a,r.b),G.sectRelation(s,r.b,r.a));assert.ok(G.sectRelation(s,r.a,r.b)>=-100&&G.sectRelation(s,r.a,r.b)<=100);}
 assert.deepEqual(s,before);assert.deepEqual(read(s).sectWorld,s.sectWorld);
});
test('lore strength does not affect rewards, routes, ranking or RNG by reading relationships',()=>{
 const s=eligible(),before=G.clone(s),seed=s.seed;
 for(const r of G.SECT_RELATIONS){assert.equal(G.sectRelation(s,r.a,r.b),r.value);G.sectRelationLabel(r.value);}
 G.sectFriendlyPairs(s);G.techniqueBonuses(s);assert.deepEqual(s,before);assert.equal(s.seed,seed);
});
test('cap, walking and body/mind bonuses affect real rules, but bike speed/battery and roads are untouched',()=>{
 let s=eligible(),base=G.clone(s);s=own(s,'lightstep');s=own(s,'bull-march');s=own(s,'iron-skin');s=own(s,'mind-lamp');
 near(G.movementRates(s,'walk').speed/G.movementRates(base,'walk').speed,1.3);near(G.movementRates(s,'bike').speed,G.movementRates(base,'bike').speed);
 near(G.travelPlan(s,'market','bike').stamina/G.travelPlan(base,'market','bike').stamina,.88);assert.equal(G.travelPlan(s,'market','bike').battery,G.travelPlan(base,'market','bike').battery);
 assert.equal(G.limits(s).health-G.limits(base).health,25);assert.equal(G.limits(s).mana-G.limits(base).mana,25);assert.deepEqual(G.routeFrom(s,'market'),G.routeFrom(base,'market'));
 s.player.insight=100;assert.equal(G.breakChance(s),95);const recipe=G.ALCHEMY_RECIPES[0];assert.ok(G.alchemyChance(s,recipe)<=.98);
});
for(const [kind,id,ratio] of [['body','golden-body',1.35],['meditate','mind-calm',1.2]])test(`${id} changes actual ${kind} progress and no other cultivation kind`,()=>{
 let base=eligible();base.position='home';base=act(base,'cultivate',{kind});let enhanced=G.clone(base);own(enhanced,id);
 const qi=base.player.qi;const a=G.advance(base,5),b=G.advance(enhanced,5);near((b.player.qi-qi)/(a.player.qi-qi),ratio);
 assert.equal(a.minutes,b.minutes);assert.equal(a.player.stamina,b.player.stamina);
});
test('modern saved maximum resources survive sect-manual restore; v21 is explicitly rejected',()=>{
 let s=fund(join('jingang'),'jingang');s=act(s,'sectBuy',{sectId:'jingang',id:'mountain-bone'});for(const k of ['health','stamina','mana'])s.player[k]=G.limits(s)[k];
 const restored=read(s);for(const k of ['health','stamina','mana'])near(restored.player[k],s.player[k]);
 let old=fund(join('tingyu'),'tingyu');old=act(old,'sectBuy',{id:'rain-breath'});old.schemaVersion=21;delete old.sectWorld;
 assert.throws(()=>read(old),/不支持此存档版本/);
});
for(const [name,corrupt] of [
 ['missing world',s=>delete s.sectWorld],['foreign manual',s=>s.sect.manuals.push('iron-skin')],['no contribution payment',s=>s.sect.manuals.push('rain-breath')],
 ['invalid choice',s=>s.sectWorld.stories.tingyu=[4]],['story skipped',s=>s.sectWorld.stories.tingyu=[0,0,0,0]],['invalid council',s=>s.sectWorld.councils=[7]],
 ['duplicate techniques',s=>s.learned=['lightstep','lightstep']],['sect in common learned',s=>s.learned=['iron-skin']],
 ['unearned new invitation',s=>s.sectWorld.records.jingang.invited=true],['negative balance',s=>s.sect.contribution=-1]
])test(`modern corruption rejected: ${name}`,()=>{const s=join('tingyu');corrupt(s);assert.throws(()=>read(s));});
test('dual membership and foreign in-flight actions cannot load',()=>{
 let s=join('jingang');s.sect.member=true;s.sect.joinedAt=s.minutes;assert.throws(()=>read(s));
 s=act(join('jingang'),'sectTask',{sectId:'jingang',id:'iron-load'});s.activity.params.sectId='baicao';assert.throws(()=>read(s));
});
for(const d of G.SECTS)for(const [stage,e] of G.SECT_STORIES[d.id].entries())for(let pick=0;pick<3;pick++)test(`${d.name} story ${stage+1} option ${pick+1}: valid end-to-end choice and exact diplomatic result`,()=>{
 let s=e.introduction?eligible():fund(join(d.id),d.id);s.position=d.place;
 s.sectWorld.stories[d.id]=Array(stage).fill(0);s.player.stamina=G.limits(s).stamina;s.player.mana=G.limits(s).mana;
 const expected=G.clone(s);expected.sectWorld.stories[d.id].push(pick);
 s=act(s,'sectStory',{sectId:d.id});s=act(read(s),'choose',{eventId:s.pending.id,index:pick});if(s.activity)s=finish(read(s));
 s=ack(read(s));assert.deepEqual(s.sectWorld.stories[d.id],expected.sectWorld.stories[d.id]);
 for(const r of G.SECT_RELATIONS)assert.equal(G.sectRelation(s,r.a,r.b),G.sectRelation(expected,r.a,r.b));
});
for(let stage=0;stage<3;stage++)for(let pick=0;pick<3;pick++)test(`council ${stage+1} option ${pick+1}: qualified independent cultivator can finish`,()=>{
 let s=eligible();for(const d of G.SECTS.slice(1)){s.position=d.place;s=act(s,'sectStory',{sectId:d.id});s=ack(act(s,'choose',{eventId:s.pending.id,index:0}));}
 s.position='market';s.sectWorld.councils=Array(stage).fill(0);s=act(s,'sectCouncil');s=act(read(s),'choose',{eventId:s.pending.id,index:pick});if(s.activity)s=finish(read(s));s=ack(read(s));assert.equal(s.sectWorld.councils.at(-1),pick);
});
test('herbal XP bonus applies only on real brew completion, not start or cancellation',()=>{
 let s=fund(join('baicao'),'baicao');s=act(s,'sectBuy',{sectId:'baicao',id:'herbal-memory'});const r=G.ALCHEMY_RECIPES[0];
 s.alchemy.cauldron=1;s.alchemy.cauldrons=[1];s.alchemy.formulas.push(r.id);for(const [id,n] of Object.entries(r.materials))s.inventory[id]=n+5;
 s=act(s,'alchemy',{recipe:r.id});assert.equal(s.alchemy.xp,0);s=read(G.advance(s,r.duration/2));assert.equal(s.alchemy.xp,0);
 assert.equal(act(s,'stop').alchemy.xp,0);s=finish(s);const base=s.alchemy.successes?1+Math.ceil(r.complexity/3):1;
 assert.equal(s.alchemy.xp,base+Math.max(1,Math.floor(base*.5)));assert.equal(read(s).alchemy.xp,s.alchemy.xp);
});
for(const d of G.SECTS)test(`${d.name}: rent ends game before same-time duty reward`,()=>{
 let s=join(d.id);const duty=d.duties[0];s.minutes=8640-duty.minutes;s.player.money=0;s=act(s,'sectTask',{sectId:d.id,id:duty.id});s=G.advance(s,duty.minutes);
 assert.equal(s.gameOver.reason,'rent');assert.equal(G.sectState(s,d.id).earned,0);assert.equal(read(s).gameOver.reason,'rent');
});
test('cancelled/accepted delivery cannot be overwritten by sect stories or councils',()=>{
 const s=eligible();s.position='park';s.activeOrder=G.clone(s.orders[0]);s.orders=s.orders.slice(1);reject(s,'sectStory',{sectId:'jingang'});s.position='market';reject(s,'sectCouncil');
});
