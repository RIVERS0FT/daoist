import { useEffect, useMemo } from 'react';
import { narrativeAiEnabled } from './game/ai';
import { EVENT_MAP } from './game/content';
import { availableEndings, ENDING_MAP } from './game/endings';
import { breakthroughCost, formatTime, phaseFor, realmName, RENT } from './game/engine';
import { NPC_MAP, NPCS, relationshipLabel, relationshipScore } from './game/npcs';
import { useGameStore } from './game/store';
import type { GameAction, GameState, NumericStatKey } from './game/types';

const weatherLabel = { clear: '晴', cloudy: '多云', rain: '雨', storm: '雷暴' } as const;

function StatBar({ label, value, max = 100, suffix = '', danger = false }: { label: string; value: number; max?: number; suffix?: string; danger?: boolean }) {
  const width = Math.max(0, Math.min(100, (value / max) * 100));
  return <div className="stat-row"><div className="stat-label"><span>{label}</span><strong>{Math.round(value)}{suffix}</strong></div><div className="bar"><span className={danger ? 'danger' : ''} style={{ width: `${width}%` }} /></div></div>;
}

function ActionButton({ action, title, meta, disabled = false }: { action: GameAction; title: string; meta: string; disabled?: boolean }) {
  const act = useGameStore((s) => s.act);
  return <button className="action-button" type="button" disabled={disabled} onClick={() => act(action)}><span>{title}</span><small>{meta}</small></button>;
}

function requirementMet(game: GameState, key: NumericStatKey, min: number) { return game[key] >= min; }

function EventPanel() {
  const game = useGameStore((s) => s.game);
  const chooseEvent = useGameStore((s) => s.chooseEvent);
  const event = game.pendingEventId ? EVENT_MAP.get(game.pendingEventId) : null;
  if (!event) return null;
  const npc = event.npcId ? NPC_MAP.get(event.npcId) : null;
  return <section className={`event-panel ${event.npcId ? 'npc-event' : ''}`} aria-live="polite">
    <div className="eyebrow">{event.category}</div><h2>{event.title}</h2>{npc && <div className="event-npc">{npc.name} · {npc.role}</div>}<p>{event.description}</p>
    <div className="event-choices">{event.choices.map((choice) => {
      const statBlocked = choice.requires ? !requirementMet(game, choice.requires.key, choice.requires.min) : false;
      const relationBlocked = choice.relationshipRequires ? game.relationships[choice.relationshipRequires.npcId][choice.relationshipRequires.key] < choice.relationshipRequires.min : false;
      const blocked = statBlocked || relationBlocked;
      return <button type="button" key={choice.id} disabled={blocked} onClick={() => chooseEvent(choice.id)}><span>{choice.label}</span>{choice.requires && <small>{choice.requires.label}</small>}{choice.relationshipRequires && <small>{choice.relationshipRequires.label}</small>}</button>;
    })}</div>
  </section>;
}

function RelationshipsPanel() {
  const game = useGameStore((s) => s.game);
  const socialize = useGameStore((s) => s.socialize);
  const busy = Boolean(game.pendingEventId) || game.gameOver || Boolean(game.activeOrder);
  return <section className="panel relationships-panel">
    <div className="section-heading"><h2>人间关系</h2><span>选择会留下长期痕迹</span></div>
    <div className="npc-grid">{NPCS.map((npc) => {
      const relationship = game.relationships[npc.id];
      const score = relationshipScore(relationship);
      return <article className={`npc-card ${relationship.met ? 'met' : 'unmet'}`} key={npc.id}>
        <div className="npc-card-head"><div><h3>{npc.name}</h3><p>{npc.role}</p></div><strong>{relationshipLabel(relationship)}</strong></div>
        <p className="npc-bio">{relationship.met ? npc.shortBio : npc.storyHint}</p>
        {relationship.met ? <>
          <div className="relationship-score"><span>关系</span><strong>{score}</strong></div>
          <div className="relationship-metrics"><span>好感 {relationship.affinity}</span><span>信任 {relationship.trust}</span><span>羁绊 {relationship.bond}</span><span>情感 {relationship.romance}</span></div>
          <button className="social-button" type="button" disabled={busy} onClick={() => socialize(npc.id)}>联系 / 见面 <small>45 分钟</small></button>
        </> : <div className="npc-unknown">继续跑单、生活或修炼，也许会遇见。</div>}
      </article>;
    })}</div>
  </section>;
}

function EndingsPanel() {
  const game = useGameStore((s) => s.game);
  const chooseEnding = useGameStore((s) => s.chooseEnding);
  const endings = availableEndings(game);
  if (game.day < 30 || game.gameOver) return null;
  return <section className="panel endings-panel">
    <div className="section-heading"><h2>命运分岔</h2><span>第 30 天后可主动收束故事</span></div>
    <p className="ending-note">你可以现在选择一个已经成立的结局，也可以继续生活，让更多关系和世界线成熟。选择结局会结束当前存档的这一世。</p>
    <div className="ending-grid">{endings.map((ending) => <button type="button" key={ending.id} disabled={Boolean(game.pendingEventId) || Boolean(game.activeOrder)} onClick={() => chooseEnding(ending.id)}><span>{ending.category}</span><strong>{ending.title}</strong><p>{ending.description}</p></button>)}</div>
  </section>;
}

export default function App() {
  const game = useGameStore((s) => s.game);
  const hydrated = useGameStore((s) => s.hydrated);
  const hydrate = useGameStore((s) => s.hydrate);
  const reset = useGameStore((s) => s.reset);
  const event = game.pendingEventId ? EVENT_MAP.get(game.pendingEventId) : null;
  const ending = game.endingId ? ENDING_MAP.get(game.endingId) : null;
  const phase = phaseFor(game.minute);
  const nextCost = breakthroughCost(game.realmLevel);
  const night = game.minute >= 20 * 60 || game.minute < 6 * 60;
  const rentDays = game.rentDueDay - game.day;

  useEffect(() => { void hydrate(); }, [hydrate]);
  const statusLine = useMemo(() => {
    if (ending) return `这一阶段的故事已经收束：${ending.title}`;
    if (game.gameOver) return '这一世已经结束。';
    if (event) return '先处理当前事件，时间才会继续。';
    if (game.activeOrder) return `正在配送：${game.activeOrder.merchant} → ${game.activeOrder.customer}`;
    if (night) return '夜色已深，修炼效率上升，异常事件也更频繁。';
    return '城市仍在运转。每个行动都会消耗真实的游戏时间。';
  }, [ending, event, game.activeOrder, game.gameOver, night]);

  if (!hydrated) return <main className="loading">正在读取本地存档…</main>;

  return <main className="app-shell">
    <header className="topbar"><div><div className="eyebrow">单机 · 时间流逝 RPG</div><h1>外卖修仙</h1></div><div className="clock-block"><strong>第 {game.day} 天 · {formatTime(game.minute)}</strong><span>{phase} · {weatherLabel[game.weather]}</span></div></header>
    <div className="status-strip">{statusLine}</div>

    <section className="dashboard">
      <aside className="panel stats-panel">
        <div className="section-heading"><h2>骑手状态</h2><span>{realmName(game.realmLevel)}</span></div><div className="money">¥{game.money}</div>
        <StatBar label="精力" value={game.energy} danger={game.energy < 25} /><StatBar label="健康" value={game.health} danger={game.health < 35} /><StatBar label="压力" value={game.stress} danger={game.stress > 70} /><StatBar label="电量" value={game.bikeBattery} danger={game.bikeBattery < 20} />
        <div className="mini-grid"><div><span>灵气</span><strong>{Math.round(game.qi)}</strong></div><div><span>悟性</span><strong>{Math.round(game.insight)}</strong></div><div><span>信誉</span><strong>{Math.round(game.reputation)}</strong></div><div><span>因果</span><strong>{Math.round(game.karma)}</strong></div></div>
        <div className={`rent-box ${rentDays <= 2 ? 'urgent' : ''}`}><span>房租 ¥{RENT}</span><strong>{rentDays >= 0 ? `${rentDays} 天后` : '已逾期'}</strong></div>
      </aside>

      <section className="panel action-panel">
        <div className="section-heading"><h2>今天做什么</h2><span>行动即时间</span></div>
        {game.activeOrder ? <div className={`order-card ${game.activeOrder.strange ? 'strange' : ''}`}><div className="eyebrow">{game.activeOrder.strange ? '订单信息似乎有点不对劲' : '配送中'}</div><h3>{game.activeOrder.merchant}</h3><p>送往 {game.activeOrder.customer}</p><div className="order-meta"><span>{game.activeOrder.distanceKm.toFixed(1)} km</span><span>约 {game.activeOrder.estimatedMinutes} 分钟</span><span>¥{game.activeOrder.reward}</span></div><ActionButton action="complete-order" title="完成配送" meta="路况、天气与事件会改变实际耗时" disabled={Boolean(event) || game.gameOver} /></div> : <ActionButton action="accept-order" title="接一个新订单" meta="2 分钟 · 订单可能打开 NPC、友情与灵异剧情" disabled={Boolean(event) || game.gameOver} />}
        <div className="action-group"><h3>凡俗生活</h3><div className="action-grid"><ActionButton action="eat" title="吃顿热饭" meta="30 分钟 · ¥18" disabled={Boolean(event) || game.gameOver} /><ActionButton action="rest" title="休息一下" meta="60 分钟 · 恢复精力" disabled={Boolean(event) || game.gameOver} /><ActionButton action="sleep" title="睡六小时" meta="360 分钟 · 大幅恢复" disabled={Boolean(event) || game.gameOver} /><ActionButton action="charge-bike" title="换电" meta="18 分钟 · ¥6" disabled={Boolean(event) || game.gameOver} /></div></div>
        <div className="action-group cultivation-group"><div className="group-title"><h3>夜修</h3><span>{night ? '当前有夜间加成' : '夜晚效率更高'}</span></div><div className="action-grid"><ActionButton action="meditate-1h" title="吐纳一小时" meta="60 分钟 · 稳定积累灵气" disabled={Boolean(event) || game.gameOver} /><ActionButton action="meditate-3h" title="闭关三小时" meta="180 分钟 · 高收益高消耗" disabled={Boolean(event) || game.gameOver} /><ActionButton action="study" title="整理修炼笔记" meta="90 分钟 · 悟性 +1" disabled={Boolean(event) || game.gameOver} /><ActionButton action="breakthrough" title={game.realmLevel >= 9 ? '炼气圆满' : `尝试突破 · ${nextCost} 灵气`} meta="240 分钟 · 存在失败风险" disabled={Boolean(event) || game.gameOver || game.realmLevel >= 9 || game.qi < nextCost} /></div></div>
      </section>

      <aside className="panel world-panel">
        <div className="section-heading"><h2>这座城</h2><span>世界会记住选择</span></div>
        <dl className="world-facts"><div><dt>完成订单</dt><dd>{game.completedOrders}</dd></div><div><dt>累计收入</dt><dd>¥{game.totalIncome}</dd></div><div><dt>阴气</dt><dd>{Math.round(game.darkQi)}</dd></div><div><dt>认识的人</dt><dd>{Object.values(game.relationships).filter((item) => item.met).length} / {NPCS.length}</dd></div></dl>
        <div className="ai-box"><span>AI 叙事增强</span><strong>{narrativeAiEnabled ? '已接入' : '离线剧情'}</strong><small>{narrativeAiEnabled ? '仅增强 NPC 对白，不改变数值与结局。' : '未配置 AI 时全部剧情仍可完整游玩。'}</small></div>
        <div className="clues"><h3>已发现线索</h3>{Object.entries(game.flags).filter(([, value]) => Boolean(value)).length ? <ul>{Object.entries(game.flags).filter(([, value]) => Boolean(value)).slice(-7).map(([key]) => <li key={key}>{key.replaceAll('_', ' ')}</li>)}</ul> : <p>暂时没有。先多跑几单。</p>}</div>
        <button className="reset-button" type="button" onClick={() => { if (window.confirm('确定重新开局？当前本地存档会被覆盖。')) void reset(); }}>重新开局</button>
      </aside>
    </section>

    {event && <EventPanel />}
    <RelationshipsPanel />
    <EndingsPanel />
    <section className="panel log-panel"><div className="section-heading"><h2>今日见闻</h2><span>自动保存到本机</span></div><ol className="log-list">{game.log.map((entry) => <li key={entry.id} className={entry.tone ?? 'normal'}><time>第 {entry.day} 天 {formatTime(entry.minute)}</time><p>{entry.text}</p></li>)}</ol></section>
    {game.gameOver && (ending ? <section className="gameover ending-result"><div className="eyebrow">{ending.category}</div><h2>{ending.title}</h2><p>{ending.description}</p><blockquote>{ending.epilogue}</blockquote><button type="button" onClick={() => void reset()}>重新开始一世</button></section> : <section className="gameover"><div className="eyebrow">本世结束</div><h2>你倒在了通往长生的路上。</h2><p>完成 {game.completedOrders} 单，累计收入 ¥{game.totalIncome}，最终境界 {realmName(game.realmLevel)}。</p><button type="button" onClick={() => void reset()}>进入下一世</button></section>)}
  </main>;
}
