// Shared fixtures play the first nine deliveries through the real rule engine.
// No delivery counts, unlock flags or player assets are written by these helpers.
import assert from 'node:assert/strict';
import '../../public/js/data.js';
import '../../public/js/engine.js';
import '../../public/js/storage.js';
import '../../public/js/progression.js';
const G=globalThis.NightCourier;
export const act=(s,action,payload={})=>{const r=G.perform(s,action,payload);assert.ok(r.ok,`${action}: ${r.error}`);return r.state;};
export const finish=s=>{for(let i=0;s.activity&&!s.gameOver&&i<2000;i++)s=G.advance(s,1);assert.ok(!s.activity&&!s.gameOver,'Action did not finish safely');return s;};
export const acknowledge=s=>{
  if(s.eventResult)s=act(s,'ackResult',{id:s.eventResult.id});
  if(s.placeUnlock)s=act(s,'ackPlaceUnlock',{id:s.placeUnlock.place});
  while(G.nextUnlockNotice(s))s=act(s,'ackUnlock',{id:G.unlockNoticeKey(G.nextUnlockNotice(s))});
  return s;
};
export function resolve(s){
  for(let i=0;i<20;i++){
    s=acknowledge(finish(s));
    if(!s.pending)return s;
    const index=s.pending.choices.findIndex(c=>!G.choiceBlock(s,c)&&!Object.values(c.effects||{}).some(v=>v<0));
    const fallback=s.pending.choices.findIndex(c=>!G.choiceBlock(s,c));
    s=act(s,'choose',{eventId:s.pending.id,index:index>=0?index:fallback});
  }
  throw new Error('Event queue did not drain');
}
export function nextDelivery(s){
  s=resolve(s);
  if(s.player.stamina<30||s.player.health<30)s=resolve(act(s,'rest'));
  if(s.vehicle.battery<20)s=resolve(act(s,'charge'));
  if(!s.orders.length)s=resolve(act(s,'rest'));
  const candidates=s.orders.filter(o=>!G.travelBlock(s,G.travelPlan(s,o.target)));
  candidates.sort((a,b)=>G.routeFrom(s,a.target).meters-G.routeFrom(s,b.target).meters);
  assert.ok(candidates.length,'Need a reachable offer');
  return act(s,'deliver',{id:candidates[0].id});
}
export function throughNine(mode='classic',seed=67891){
  let s=G.newGame('九单行者',mode,seed);
  for(let count=1;count<=9;count++){
    s=resolve(nextDelivery(s));
    assert.equal(s.stats.delivered,count);assert.equal(s.player.coins,0);
    assert.equal(G.featureUnlocked(s,'system'),false);
  }
  assert.ok(s.orders.every(o=>!G.place(o.target).permanent));
  // Stable test selection: choose the nearest real offer, not array insertion order.
  s.orders.sort((a,b)=>G.routeFrom(s,a.target).meters-G.routeFrom(s,b.target).meters);
  return s;
}
export function awakeningPending(mode='classic',seed=67891){
  let s=acknowledge(finish(nextDelivery(throughNine(mode,seed))));
  assert.equal(s.pending.templateId,'system-awakening');
  return s;
}
export function afterAwakening(mode='classic',seed=67891){const s=awakeningPending(mode,seed);return resolve(act(s,'choose',{eventId:s.pending.id,index:0}));}
