import { useEffect, useMemo } from 'react';
import { EVENT_MAP } from './game/events';
import { breakthroughCost, formatTime, phaseFor, realmName, RENT } from './game/engine';
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
  return <section className="event-panel" aria-live="polite">
    <div className="eyebrow">{event.category}</div><h2>{event.title}</h2><p>{event.description}</p>
    <div className="event-choices">{event.choices.map((choice) => {
      const blocked = choice.requires ? !requirementMet(game, choice.requires.key, choice.requires.min) : false;
      return <button type="button" key={choice.id} disabled={blocked} onClick={() => chooseEvent(choice.id)}><span>{choice.label}</span>{choice.requires && <small>{choice.requires.label}</small>}</button>;
    })}</div>
  </section>;
}

export default function App() {
  const game = useGameStore((s) => s.game);
  const hydrated = useGameStore((s) => s.hydrated);
  const hydrate = useGameStore((s) => s.hydrate);
  const reset = useGameStore((s) => s.reset);
  const event = game.pendingEventId ? EVENT_MAP.get(game.pendingEventId) : null;
  const phase = phaseFor(game.minute);
  const nextCost = breakthroughCost(game.realmLevel);
  const night = game.minute >= 20 * 60 || game.minute < 6 * 60;
  const rentDays = game.rentDueDay - game.day;

  useEffect(() => { void hydrate(); }, [hydrate]);
  const statusLine = useMemo(() => {
    if (game.gameOver) return '这一世已经结束。';
    if (event) return '先处理当前事件，时间才会继续。';
    if (game.activeOrder) return `正在配送：${game.activeOrder.merchant} → ${game.activeOrder.customer}`;
    if (night) return '夜色已深，修炼效率上升，异常事件也更频繁。';
    return '城市仍在运转。每个行动都会消耗真实的游戏时间。';
  }, [event, game.activeOrder, game.gameOver, night]);

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
        {game.activeOrder ? <div className={`order-card ${game.activeOrder.strange ? 'strange' : ''}`}><div className="eyebrow">{game.activeOrder.strange ? '订单信息似乎有点不对劲' : '配送中'}</div><h3>{game.activeOrder.merchant}</h3><p>送往 {game.activeOrder.customer}</p><div className="order-meta"><span>{game.activeOrder.distanceKm.toFixed(1)} km</span><span>约 {game.activeOrder.estimatedMinutes} 分钟</span><span>¥{game.activeOrder.reward}</span></div><ActionButton action="complete-order" title="完成配送" meta="路况与天气会改变实际耗时" disabled={Boolean(event) || game.gameOver} /></div> : <ActionButton action="accept-order" title="接一个新订单" meta="2 分钟 · 白天赚钱，夜晚可能接到奇怪订单" disabled={Boolean(event) || game.gameOver} />}
        <div className="action-group"><h3>凡俗生活</h3><div className="action-grid"><ActionButton action="eat" title="吃顿热饭" meta="30 分钟 · ¥18" disabled={Boolean(event) || game.gameOver} /><ActionButton action="rest" title="休息一下" meta="60 分钟 · 恢复精力" disabled={Boolean(event) || game.gameOver} /><ActionButton action="sleep" title="睡六小时" meta="360 分钟 · 大幅恢复" disabled={Boolean(event) || game.gameOver} /><ActionButton action="charge-bike" title="换电" meta="18 分钟 · ¥6" disabled={Boolean(event) || game.gameOver} /></div></div>
        <div className="action-group cultivation-group"><div className="group-title"><h3>夜修</h3><span>{night ? '当前有夜间加成' : '夜晚效率更高'}</span></div><div className="action-grid"><ActionButton action="meditate-1h" title="吐纳一小时" meta="60 分钟 · 稳定积累灵气" disabled={Boolean(event) || game.gameOver} /><ActionButton action="meditate-3h" title="闭关三小时" meta="180 分钟 · 高收益高消耗" disabled={Boolean(event) || game.gameOver} /><ActionButton action="study" title="整理修炼笔记" meta="90 分钟 · 悟性 +1" disabled={Boolean(event) || game.gameOver} /><ActionButton action="breakthrough" title={game.realmLevel >= 9 ? '炼气圆满' : `尝试突破 · ${nextCost} 灵气`} meta="240 分钟 · 存在失败风险" disabled={Boolean(event) || game.gameOver || game.realmLevel >= 9 || game.qi < nextCost} /></div></div>
      </section>

      <aside className="panel world-panel">
        <div className="section-heading"><h2>这座城</h2><span>世界会记住选择</span></div>
        <dl className="world-facts"><div><dt>完成订单</dt><dd>{game.completedOrders}</dd></div><div><dt>累计收入</dt><dd>¥{game.totalIncome}</dd></div><div><dt>阴气</dt><dd>{Math.round(game.darkQi)}</dd></div><div><dt>近期事件</dt><dd>{game.recentEvents.length}</dd></div></dl>
        <div className="clues"><h3>已发现线索</h3>{Object.entries(game.flags).filter(([, value]) => Boolean(value)).length ? <ul>{Object.entries(game.flags).filter(([, value]) => Boolean(value)).slice(-7).map(([key]) => <li key={key}>{key.replaceAll('_', ' ')}</li>)}</ul> : <p>暂时没有。先多跑几单。</p>}</div>
        <button className="reset-button" type="button" onClick={() => { if (window.confirm('确定重新开局？当前本地存档会被覆盖。')) void reset(); }}>重新开局</button>
      </aside>
    </section>

    {event && <EventPanel />}
    <section className="panel log-panel"><div className="section-heading"><h2>今日见闻</h2><span>自动保存到本机</span></div><ol className="log-list">{game.log.map((entry) => <li key={entry.id} className={entry.tone ?? 'normal'}><time>第 {entry.day} 天 {formatTime(entry.minute)}</time><p>{entry.text}</p></li>)}</ol></section>
    {game.gameOver && <section className="gameover"><div className="eyebrow">本世结束</div><h2>你倒在了通往长生的路上。</h2><p>完成 {game.completedOrders} 单，累计收入 ¥{game.totalIncome}，最终境界 {realmName(game.realmLevel)}。</p><button type="button" onClick={() => void reset()}>进入下一世</button></section>}
  </main>;
}
