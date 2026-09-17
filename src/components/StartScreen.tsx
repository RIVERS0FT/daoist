import { useState } from 'react';
import { formatTime, realmName } from '../game/engine';
import type { PlayMode } from '../game/generation';
import { useGameStore } from '../game/store';
import { Icon } from './Icon';
import '../start.css';

export function StartScreen() {
  const { slots, slotBusy, loadBlocked, saveError, newGame, openSlot } = useGameStore();
  const [creating, setCreating] = useState(false), [name, setName] = useState(''), [mode, setMode] = useState<PlayMode>('classic');
  const latest = slots.find((slot) => slot.session);
  const validName = Boolean(name.trim());
  return <main className="start-screen" aria-label="游戏开始页面">
    <div className="start-content">
      <header className="start-hero"><span className="start-seal" aria-hidden="true">道</span><p className="eyebrow">青岚市 · 人间烟火，亦是仙途</p><h1>外卖修仙</h1><p className="start-tagline">白天，送一城烟火。<br />夜晚，修自己的长生。</p></header>
      <section className="start-library" aria-label="开始与存档">
        <div className="start-actions">
          {latest && <button className="start-primary" type="button" disabled={slotBusy || loadBlocked} onClick={() => { void openSlot(latest.id); }}><Icon name="arrow" size={20} /><span>继续最近的仙途<small>{latest.name}</small></span></button>}
          <button className={latest ? 'start-secondary' : 'start-primary'} type="button" disabled={slotBusy || loadBlocked} onClick={() => setCreating((value) => !value)}>新建角色<span aria-hidden="true">＋</span></button>
        </div>
        {saveError && <p className="start-warning" role="alert">{saveError}</p>}
        {creating && <form className="new-save-form" onSubmit={(event) => { event.preventDefault(); if (validName) void newGame(name, mode); }}>
          <h2>新的一世</h2>
          <label>角色名称<input value={name} onChange={(event) => setName(event.target.value)} maxLength={32} placeholder="输入角色名称" disabled={slotBusy} autoComplete="off" required /></label>
          <fieldset disabled={slotBusy}><legend>剧情模式 · 本存档固定</legend>
            <label className={`mode-option ${mode === 'classic' ? 'selected' : ''}`}><input type="radio" name="story-mode" value="classic" checked={mode === 'classic'} onChange={() => setMode('classic')} /><span><strong>经典剧情</strong><small>完整人工剧情 · 无需 AI</small></span></label>
            <label className={`mode-option ${mode === 'generative' ? 'selected' : ''}`}><input type="radio" name="story-mode" value="generative" checked={mode === 'generative'} onChange={() => setMode('generative')} /><span><strong>AI 生成式剧情</strong><small>原剧情 + 受控生成支线</small></span></label>
          </fieldset>
          <button className="start-primary" type="submit" disabled={slotBusy || loadBlocked || !validName}>{slotBusy ? '正在创建…' : '开始这一世'}</button>
        </form>}
        <details className="start-help">
          <summary>玩法帮助</summary>
          <div className="start-help-body"><p>行动才会推进游戏时间；浏览地图和菜单不耗时。白天跑单维持生活，夜间修炼，随机事件与人物关系会改变后续分支。</p><p>每次有效行动自动保存。每个角色都是独立存档，剧情模式只在创建时选择。</p></div>
        </details>
        <div className="save-list-heading"><h2>我的仙途</h2><span>{slots.length} 个存档</span></div>
        {!slots.length && <div className="empty-saves"><Icon name="book" size={28} /><p>此处还没有留下足迹。</p><small>新建角色，开始第一天的生活。</small></div>}
        <div className="save-list">{slots.map((slot) => <article className="save-card" key={slot.id}>
          <div className="save-card-title"><h3>{slot.name}</h3><span>{slot.session?.play.mode === 'generative' ? 'AI 生成式' : slot.session ? '经典剧情' : '受保护'}</span></div>
          {slot.session ? <><p>第 {slot.session.game.day} 天 · {formatTime(slot.session.game.minute)} · {realmName(slot.session.game.realmLevel)}{slot.session.game.gameOver ? ' · 本世结束' : ''}</p><p>¥{Math.round(slot.session.game.money)} · 已送 {slot.session.game.completedOrders} 单</p><small>自动保存于 {new Date(slot.updatedAt).toLocaleString('zh-CN')}</small></> : <p className="start-warning">{slot.error}</p>}
          <button className="start-secondary" type="button" disabled={slotBusy || loadBlocked || !slot.session} onClick={() => { void openSlot(slot.id); }} aria-label={`进入存档：${slot.name}`}>进入这段仙途<Icon name="arrow" size={16} /></button>
        </article>)}</div>
      </section>
    </div>
  </main>;
}
