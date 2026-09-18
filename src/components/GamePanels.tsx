export { CultivationPanel } from './CultivationPanel';
import { playerMapPoint } from '../game/deliveryLocations';
import { bikeStats, deliveryCosts, deliveryEstimate, pushingCosts, ridingBlockReason } from '../game/bike';
import { BikePanel } from './BikePanel';
import { EVENT_MAP } from '../game/content';
import { availableEndings, ENDING_MAP } from '../game/endings';
import { breakthroughCost, formatTime, realmName, RENT } from '../game/engine';
import { NPC_MAP, NPCS, relationshipLabel, relationshipScore } from '../game/npcs';
import { deliveryCoinReward } from '../game/system';
import { useGameStore } from '../game/store';
import type { GameAction, GameState, NpcId, NumericStatKey } from '../game/types';

function useExplorationBusy() { return useGameStore((s) => Boolean(s.play.pending || s.play.scene || s.game.cultivation.trial || s.loadBlocked || s.slotBusy)); }
export function StatBar({ label, value, max = 100, suffix = '', danger = false }: { label: string; value: number; max?: number; suffix?: string; danger?: boolean }) {
  const width = Math.max(0, Math.min(100, (value / max) * 100));
  return <div className="stat-row"><div className="stat-label"><span>{label}</span><strong>{Math.round(value)}{suffix}</strong></div><div className="bar"><span className={danger ? 'danger' : ''} style={{ width: `${width}%` }} /></div></div>;
}
export function ActionButton({ action, title, meta, disabled = false }: { action: GameAction; title: string; meta: string; disabled?: boolean }) {
  const act = useGameStore((s) => s.act);
  const busy = useExplorationBusy();
  return <button className="action-button" type="button" disabled={disabled || busy} onClick={() => act(action)}><span>{title}</span><small>{meta}</small></button>;
}
function requirementMet(game: GameState, key: NumericStatKey, min: number) { return game[key] >= min; }
export function EventPanel() {
  const game = useGameStore((s) => s.game);
  const chooseEvent = useGameStore((s) => s.chooseEvent);
  const busy = useExplorationBusy();
  const event = game.pendingEventId ? EVENT_MAP.get(game.pendingEventId) : null;
  if (!event) return null;
  const npc = event.npcId ? NPC_MAP.get(event.npcId) : null;
  return <section className={`event-panel ${event.npcId ? 'npc-event' : ''}`} aria-live="polite">
    <div className="eyebrow">{event.category}</div><h2>{event.title}</h2>{npc && <div className="event-npc">{npc.name} · {npc.role}</div>}<p>{event.description}</p>
    <div className="event-choices">{event.choices.map((choice) => {
      const statBlocked = choice.requires ? !requirementMet(game, choice.requires.key, choice.requires.min) : false;
      const relationBlocked = choice.relationshipRequires ? game.relationships[choice.relationshipRequires.npcId][choice.relationshipRequires.key] < choice.relationshipRequires.min : false;
      return <button type="button" key={choice.id} disabled={statBlocked || relationBlocked || busy || game.gameOver} onClick={() => chooseEvent(choice.id)}><span>{choice.label}</span>{choice.requires && <small>{choice.requires.label}</small>}{choice.relationshipRequires && <small>{choice.relationshipRequires.label}</small>}</button>;
    })}</div>
  </section>;
}
export function RelationshipsPanel({ npcId }: { npcId?: NpcId }) {
  const game = useGameStore((s) => s.game);
  const socialize = useGameStore((s) => s.socialize);
  const explorationBusy = useExplorationBusy();
  const busy = Boolean(game.pendingEventId) || game.gameOver || Boolean(game.activeOrder) || explorationBusy;
  return <section className="panel relationships-panel">
    <div className="section-heading"><h3>相识与羁绊</h3></div>
    <div className="npc-grid">{[...NPCS].sort((a, b) => Number(b.id === npcId) - Number(a.id === npcId)).map((npc) => {
      const relationship = game.relationships[npc.id];
      return <article className={`npc-card ${relationship.met ? 'met' : 'unmet'}`} key={npc.id}>
        <div className="npc-card-head"><div><h3>{npc.name}</h3><p>{npc.role}</p></div><strong>{relationshipLabel(relationship)}</strong></div>
        <p className="npc-bio">{relationship.met ? npc.shortBio : npc.storyHint}</p>
        {relationship.met ? <><div className="relationship-score"><span>关系</span><strong>{relationshipScore(relationship)}</strong></div>
          <div className="relationship-metrics"><span>好感 {relationship.affinity}</span><span>信任 {relationship.trust}</span><span>羁绊 {relationship.bond}</span><span>情感 {relationship.romance}</span></div>
          <button className="social-button" type="button" disabled={busy} onClick={() => socialize(npc.id)}>联系 / 见面 <small>45 分钟</small></button>
        </> : <div className="npc-unknown">尚未相遇</div>}
      </article>;
    })}</div>
  </section>;
}
export function EndingsPanel() {
  const game = useGameStore((s) => s.game);
  const chooseEnding = useGameStore((s) => s.chooseEnding);
  const busy = useExplorationBusy();
  const endings = availableEndings(game);
  if (game.gameOver) return null;
  if (game.day < 30) return <p className="panel-note">第 30 天后开放。还有 {30 - game.day} 天。</p>;
  return <section className="panel endings-panel">
    <div className="section-heading"><h3>已成立的命运</h3><span>可继续生活，或选择结局</span></div>
    <div className="ending-grid">{endings.map((ending) => <button type="button" key={ending.id} disabled={Boolean(game.pendingEventId) || Boolean(game.activeOrder) || busy} onClick={() => chooseEnding(ending.id)}><span>{ending.category}</span><strong>{ending.title}</strong><p>{ending.description}</p></button>)}</div>
  </section>;
}
export function CharacterPanel() {
  const game = useGameStore((s) => s.game);
  const rentDays = game.rentDueDay - game.day;
  return <section className="panel stats-panel">
    <div className="section-heading"><h3>角色状态</h3><span>{realmName(game.realmLevel)}</span></div><div className="money">¥{game.money}</div>
    <StatBar label="精力" value={game.energy} danger={game.energy < 25} /><StatBar label="健康" value={game.health} danger={game.health < 35} /><StatBar label="压力" value={game.stress} danger={game.stress > 70} /><StatBar label="电量" value={game.bikeBattery} max={bikeStats(game.bike).capacity} suffix={` / ${bikeStats(game.bike).capacity}`} danger={game.bikeBattery < 20} />
    <div className="mini-grid">{[['灵气', game.qi], ['外卖币', game.deliveryCoins], ['悟性', game.insight], ['信誉', game.reputation], ['因果', game.karma], ['阴气', game.darkQi], ['完成订单', game.completedOrders]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <div className={`rent-box ${rentDays <= 2 ? 'urgent' : ''}`}><span>房租 ¥{RENT}</span><strong>{rentDays >= 0 ? `${rentDays} 天后` : '已逾期'}</strong></div>
  </section>;
}
export function DeliveryPanel() {
  const game = useGameStore((s) => s.game);
  const disabled = Boolean(game.pendingEventId) || game.gameOver;
  const order = game.activeOrder, reason = order ? ridingBlockReason(game) : null, foot = pushingCosts(game);
  const costs = order ? deliveryCosts(order, game.bike) : null;
  return <section className="panel action-panel">
    <p className="delivery-location">当前位置：{playerMapPoint(game.position).name}</p>
    {reason && <p className="play-warning" role="alert">{reason}</p>}
    {order ? <div className={`order-card ${order.strange ? 'strange' : ''}`}><div className="eyebrow">{order.strange ? '异常订单' : '配送中'}</div><h3>{order.merchant} → {order.customer}</h3><p>取餐与送达合并为一次配送执行。</p><div className="order-meta"><span>{order.distanceKm.toFixed(1)} km</span><span>约 {deliveryEstimate(order, game.bike)} 分钟</span><span>¥{order.reward}</span><span>+{deliveryCoinReward(order)} 外卖币</span></div>
      <ActionButton action="complete-order" title="执行配送" meta={`含取餐与送达 · 骑行 · 电量 -${costs?.battery} · 耐久 -${costs?.wear}`} disabled={disabled || Boolean(reason)} />
      <div className="delivery-recovery"><ActionButton action="push-order" title="推车完成配送" meta={`${foot.minutes} 分钟 · 精力 -${foot.energy} · 收入 ¥${foot.income}`} disabled={disabled || game.energy < foot.energy} /><ActionButton action="cancel-order" title="取消当前订单" meta="5 分钟 · 信誉 -2" disabled={disabled} /></div>
    </div> : <div className="delivery-map-only"><div className="eyebrow">地图配送</div><h3>从地图选择配送任务</h3><p>返回地图，点击标有“单”的配送任务点查看距离、收入、电量与耐久要求；确认后直接完成配送。</p></div>}
    <div className="info-row"><span>已完成 {game.completedOrders} 单</span><span>累计 ¥{game.totalIncome}</span><span>外卖币 {game.deliveryCoins}</span></div>
    <BikePanel />
  </section>;
}
export function LifePanel() {
  const game = useGameStore((s) => s.game);
  const disabled = Boolean(game.pendingEventId) || game.gameOver;
  return <section className="panel"><div className="action-grid">
    <ActionButton action="eat" title="吃顿热饭" meta="30 分钟 · ¥18" disabled={disabled || game.money < 18} /><ActionButton action="rest" title="休息一下" meta="60 分钟 · 恢复精力" disabled={disabled} /><ActionButton action="sleep" title="睡六小时" meta="360 分钟 · 大幅恢复" disabled={disabled} /><ActionButton action="charge-bike" title="换电" meta={`18 分钟 · ¥6 · 补满至 ${bikeStats(game.bike).capacity}`} disabled={disabled || game.money < 6 || game.bikeBattery >= bikeStats(game.bike).capacity} />
  </div><div className="rent-box"><span>房租 ¥{RENT}</span><strong>第 {game.rentDueDay} 天到期</strong></div></section>;
}
export function JournalPanel() {
  const game = useGameStore((s) => s.game);
  const clues = Object.entries(game.flags).filter(([, value]) => Boolean(value));
  return <section className="panel log-panel"><details className="clues"><summary>已发现线索 · {clues.length}</summary>{clues.length ? <ul>{clues.map(([key]) => <li key={key}>{key.replaceAll('_', ' ')}</li>)}</ul> : <p>暂时没有。先多跑几单。</p>}</details><ol className="log-list">{game.log.map((entry, index) => <li key={`${entry.id}-${index}`} className={entry.tone ?? 'normal'}><time>第 {entry.day} 天 {formatTime(entry.minute)}</time><p>{entry.text}</p></li>)}</ol></section>;
}
export function EndingResult({ onReset }: { onReset: () => void }) {
  const game = useGameStore((s) => s.game);
  const ending = game.endingId ? ENDING_MAP.get(game.endingId) : null;
  if (!game.gameOver) return <EndingsPanel />;
  return <section className="gameover ending-result"><div className="eyebrow">{ending?.category ?? '本世结束'}</div><h3>{ending?.title ?? '你倒在了通往长生的路上。'}</h3><p>{ending?.description ?? `完成 ${game.completedOrders} 单，累计收入 ¥${game.totalIncome}，最终境界 ${realmName(game.realmLevel)}。`}</p>{ending && <blockquote>{ending.epilogue}</blockquote>}<button type="button" onClick={onReset}>返回开始页，保留这一世</button></section>;
}
