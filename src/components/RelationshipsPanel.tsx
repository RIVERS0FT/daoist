import { NPCS, relationshipLabel, relationshipScore } from '../game/npcs';
import { useGameStore } from '../game/store';
import type { NpcId } from '../game/types';

function useExplorationBusy() {
  return useGameStore((s) => Boolean(s.play.pending || s.play.scene || s.game.cultivation.trial || s.loadBlocked || s.slotBusy));
}

export function RelationshipsPanel({ npcId }: { npcId?: NpcId }) {
  const game = useGameStore((s) => s.game);
  const socialize = useGameStore((s) => s.socialize);
  const explorationBusy = useExplorationBusy();
  const busy = Boolean(game.pendingEventId) || game.gameOver || Boolean(game.activeOrder) || explorationBusy;
  const metNpcs = NPCS
    .filter((npc) => game.relationships[npc.id].met)
    .sort((a, b) => Number(b.id === npcId) - Number(a.id === npcId));

  return <section className="panel relationships-panel">
    <div className="section-heading"><h3>关系</h3><span>{metNpcs.length} 人</span></div>
    {metNpcs.length === 0 ? <div className="relationships-empty"><strong>暂无关系记录</strong><p>遇见过的人会出现在这里。</p></div> : <div className="npc-grid">{metNpcs.map((npc) => {
      const relationship = game.relationships[npc.id];
      return <article className="npc-card met" key={npc.id}>
        <div className="npc-card-head"><div><h3>{npc.name}</h3><p>{npc.role}</p></div><strong>{relationshipLabel(relationship)}</strong></div>
        <p className="npc-bio">{npc.shortBio}</p>
        <div className="relationship-score"><span>关系</span><strong>{relationshipScore(relationship)}</strong></div>
        <div className="relationship-metrics"><span>好感 {relationship.affinity}</span><span>信任 {relationship.trust}</span><span>羁绊 {relationship.bond}</span><span>情感 {relationship.romance}</span></div>
        <button className="social-button" type="button" disabled={busy} onClick={() => socialize(npc.id)}>联系 / 见面 <small>45 分钟</small></button>
      </article>;
    })}</div>}
  </section>;
}
