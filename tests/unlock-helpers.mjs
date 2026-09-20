import assert from 'node:assert/strict';
// Existing gameplay regressions explicitly acknowledge the new presentation-only
// step. Dedicated unlock-notices tests exercise blocking and ordering directly.
export function ackUnlocks(s) {
  const G=globalThis.NightCourier;
  if(s.eventResult||s.placeUnlock)return s;
  while(G.nextUnlockNotice(s)) {
    const r=G.perform(s,'ackUnlock',{id:G.unlockNoticeKey(G.nextUnlockNotice(s))});
    assert.ok(r.ok,r.error);s=r.state;
  }
  return s;
}
