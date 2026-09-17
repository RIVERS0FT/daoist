import { playerMapPoint } from '../game/deliveryLocations';
import { bikeStats, deliveryCosts, deliveryEstimate, pushingCosts, ridingBlockReason } from '../game/bike';
import { BikePanel } from './BikePanel';
import { EVENT_MAP } from '../game/content';
import { availableEndings, ENDING_MAP } from '../game/endings';
import { breakthroughCost, formatTime, realmName, RENT } from '../game/engine';
import { NPC_MAP, NPCS, relationshipLabel, relationshipScore } from '../game/npcs';
import { useGameStore } from '../game/store';
import type { GameAction, GameState, NpcId, NumericStatKey } from '../game/types';

function useExplorationBusy() { return useGameStore((s) => Boolean(s.play.pending || s.play.scene || s.loadBlocked || s.slotBusy)); }
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
    <div className="section-heading"><h3>相识与羁绊</h3><span>选择会留下长期痕迹</span></div>
    <div className="npc-grid">{[...NPCS].sort((a, b) => Number(b.id === npcId) - Number(a.id === npcId)).map((npc) => {
      const relationship = game.relationships[npc.id];
      return <article className={`npc-card ${relationship.met ? 'met' : 'unmet'}`} key={npc.id}>
        <div className="npc-card-head"><div><h3>{npc.name}</h3><p>{npc.role}</p></div><strong>{relationshipLabel(relationship)}</strong></div>
        <p className="npc-bio">{relationship.met ? npc.shortBio : npc.storyHint}</p>
        {relationship.met ? <><div className="relationship-score"><span>关系</span><strong>{relationshipScore(relationship)}</strong></div>
          <div className="relationship-metrics"><span>好感 {relationship.affinity}</span><span>信任 {relationship.trust}</span><span>羁绊 {relationship.bond}</span><span>情感 {relationship.romance}</span></div>
          <button className="social-button" type="button" disabled={busy} onClick={() => socialize(npc.id)}>联系 / 见面 <small>45 分钟</small></button>
        </> : <div className="npc-unknown">继续跑单、生活或修炼，也许会遇见。</div>}
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
  if (game.day < 30) return <p className="panel-note">第 30 天后，可以主动选择已经成立的结局。还有 {30 - game.day} 天，现在的每个选择都可能影响故事走向。</p>;
  return <section className="panel endings-panel">
    <div className="section-heading"><h3>已成立的命运</h3><span>第 30 天后可主动收束故事</span></div>
    <p className="ending-note">你可以现在选择一个已经成立的结局，也可以继续生活，让更多关系和世界线成熟。选择结局会结束当前存档的这一世。</p>
    <div className="ending-grid">{endings.map((ending) => <button type="button" key={ending.id} disabled={Boolean(game.pendingEventId) || Boolean(game.activeOrder) || busy} onClick={() => chooseEnding(ending.id)}><span>{ending.category}</span><strong>{ending.title}</strong><p>{ending.description}</p></button>)}</div>
  </section>;
}
export function CharacterPanel() {
  const game = useGameStore((s) => s.game);
  const rentDays = game.rentDueDay - game.day;
  return <section className="panel stats-panel">
    <div className="section-heading"><h3>此身在人间</h3><span>{realmName(game.realmLevel)}</span></div><div className="money">¥{game.money}</div>
    <StatBar label="精力" value={game.energy} danger={game.energy < 25} /><StatBar label="健康" value={game.health} danger={game.health < 35} /><StatBar label="压力" value={game.stress} danger={game.stress > 70} /><StatBar label="电量" value={game.bikeBattery} max={bikeStats(game.bike).capacity} suffix={` / ${bikeStats(game.bike).capacity}`} danger={game.bikeBattery < 20} />
    <div className="mini-grid">{[['灵气', game.qi], ['悟性', game.insight], ['信誉', game.reputation], ['因果', game.karma], ['阴气', game.darkQi], ['完成订单', game.completedOrders]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <div className={`rent-box ${rentDays <= 2 ? 'urgent' : ''}`}><span>房租 ¥{RENT}</span><strong>{rentDays >= 0 ? `${rentDays} 天后` : '已逾期'}</strong></div>
    <p className="panel-note">累计配送收入 ¥{game.totalIncome}。查看状态与切换地图不消耗游戏时间。</p>
  </section>;
}
export function DeliveryPanel() {
  const game = useGameStore((s) => s.game);
  const disabled = Boolean(game.pendingEventId) || game.gameOver;
  const order = game.activeOrder, reason = ridingBlockReason(game), foot = pushingCosts(game);
  const costs = order ? deliveryCosts(order, game.bike) : null;
  return <section className="panel action-panel">
    <p className="delivery-location">当前位置：{playerMapPoint(game.position).name}</p>
    {reason && <p className="play-warning" role="alert">{reason}</p>}
    {order ? <div className={`order-card ${order.strange ? 'strange' : ''}`}><div className="eyebrow">{order.strange ? '异常订单 · 谨慎前行' : '配送中'}</div><h3>{order.merchant}</h3><p>送往 {order.customer}</p><div className="order-meta"><span>{order.distanceKm.toFixed(1)} km</span><span>约 {deliveryEstimate(order, game.bike)} 分钟</span><span>¥{order.reward}</span></div>
      <ActionButton action="complete-order" title="完成配送" meta={`骑行 · 电量 -${costs?.battery} · 耐久 -${costs?.wear} · 天气与路况影响耗时`} disabled={disabled || Boolean(reason)} />
      <div className="delivery-recovery"><ActionButton action="push-order" title="推车送达（不骑行）" meta={`${foot.minutes} 分钟 · 精力 -${foot.energy} · 收入 ¥${foot.income} · 不耗电`} disabled={disabled || game.energy < foot.energy} /><ActionButton action="cancel-order" title="取消当前订单" meta="5 分钟 · 信誉 -2 · 不收取费用" disabled={disabled} /></div>
    </div> : <><p className="panel-note">城市里总有人等着一顿热饭。接单后，地图会临时显示本单的取餐与送达点，完成或取消后消失。</p><ActionButton action="accept-order" title="接一个新订单" meta="2 分钟 · 可能遇见 NPC、友情与灵异剧情" disabled={disabled || Boolean(reason)} /></>}
    <div className="info-row"><span>已完成 {game.completedOrders} 单</span><span>累计 ¥{game.totalIncome}</span></div>
    <p className="panel-note">午高峰 11:00–14:00，晚高峰 17:00–20:00。成功送达后，你的位置会移动到目的地并自动保存。连线是示意，不是实时导航。骑行条件不满足时，不会自动扣款或代替你推车。</p>
    <BikePanel />
  </section>;
}
export function LifePanel() {
  const game = useGameStore((s) => s.game);
  const disabled = Boolean(game.pendingEventId) || game.gameOver;
  return <section className="panel"><p className="panel-note">凡俗生活也是修行的一部分。照顾身体，给下一趟旅程留些余力。</p><div className="action-grid">
    <ActionButton action="eat" title="吃顿热饭" meta="30 分钟 · ¥18" disabled={disabled || game.money < 18} /><ActionButton action="rest" title="休息一下" meta="60 分钟 · 恢复精力" disabled={disabled} /><ActionButton action="sleep" title="睡六小时" meta="360 分钟 · 大幅恢复" disabled={disabled} /><ActionButton action="charge-bike" title="换电" meta={`18 分钟 · ¥6 · 补满至 ${bikeStats(game.bike).capacity}`} disabled={disabled || game.money < 6 || game.bikeBattery >= bikeStats(game.bike).capacity} />
  </div><div className="rent-box"><span>房租 ¥{RENT}</span><strong>第 {game.rentDueDay} 天到期</strong></div></section>;
}
export function CultivationPanel() {
  const game = useGameStore((s) => s.game);
  const disabled = Boolean(game.pendingEventId) || game.gameOver;
  const nextCost = breakthroughCost(game.realmLevel);
  const night = game.minute >= 1200 || game.minute < 360;
  return <section className="panel"><div className="cultivation-summary"><span>{realmName(game.realmLevel)}</span><strong>{Math.round(game.qi)} <small>灵气</small></strong><p>{night ? '夜色正浓，当前修炼效率提升。' : '白天也能吐纳，夜晚修炼效率更高。'}</p></div><div className="action-grid">
    <ActionButton action="meditate-1h" title="吐纳一小时" meta="60 分钟 · 稳定积累灵气" disabled={disabled} /><ActionButton action="meditate-3h" title="闭关三小时" meta="180 分钟 · 高收益高消耗" disabled={disabled} /><ActionButton action="study" title="整理修炼笔记" meta="90 分钟 · 悟性 +1" disabled={disabled} /><ActionButton action="breakthrough" title={game.realmLevel >= 9 ? '炼气圆满' : `尝试突破 · ${nextCost} 灵气`} meta="240 分钟 · 存在失败风险" disabled={disabled || game.realmLevel >= 9 || game.qi < nextCost} />
  </div></section>;
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
