import { useEffect, useRef, useState } from 'react';
import { FOCUS_LABELS, profileSummary } from '../game/generation';
import type { SceneFocus } from '../game/generation';
import { NPC_MAP, NPCS } from '../game/npcs';
import { explorationPlan, sceneChoiceBlocked } from '../game/play';
import { useGameStore } from '../game/store';
import type { NpcId } from '../game/types';
import '../playModes.css';

export function PlayModePanel({ settingsOnly = false, preferred = null }: { settingsOnly?: boolean; preferred?: string | null }) {
  const store = useGameStore();
  const { game, play, aiSettings } = store;
  const [endpoint, setEndpoint] = useState(aiSettings.endpoint);
  const [consent, setConsent] = useState(aiSettings.consent);
  const [token, setToken] = useState('');
  const [focus, setFocus] = useState<SceneFocus>('city');
  const [npcId, setNpcId] = useState<NpcId | ''>('');
  const [intent, setIntent] = useState('');
  const sceneElement = useRef<HTMLElement>(null);
  const contacts = NPCS.filter((npc) => game.relationships[npc.id].met && game.relationships[npc.id].route !== 'estranged');
  const selectedNpc = contacts.some((npc) => npc.id === npcId) ? npcId : contacts[0]?.id;
  const effectiveFocus = focus === 'social' && !contacts.length ? 'city' : focus;
  const busy = Boolean(game.pendingEventId || game.activeOrder || game.gameOver || play.pending || play.scene || store.loadBlocked);
  const explorePlan = explorationPlan(game, effectiveFocus, effectiveFocus === 'social' ? selectedNpc || undefined : undefined, preferred);

  useEffect(() => { store.initAiSettings(import.meta.env.VITE_NARRATIVE_AI_ENDPOINT as string | undefined); }, [store.initAiSettings]);
  useEffect(() => { setEndpoint(aiSettings.endpoint); setConsent(aiSettings.consent); }, [aiSettings]);
  // Only scroll the panel: the map, fixed status bar and navigation stay put.
  useEffect(() => {
    if (settingsOnly || !play.scene) return;
    const frame = requestAnimationFrame(() => {
      const scene = sceneElement.current;
      const body = scene?.closest<HTMLElement>('.drawer-body');
      if (!scene || !body) return;
      const top = body.scrollTop + scene.getBoundingClientRect().top - body.getBoundingClientRect().top - 12;
      body.scrollTo({ top, behavior: 'instant' });
      scene.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [play.scene?.id, settingsOnly]);

  return <section className="panel play-mode-panel" aria-label="游玩模式与自由奇遇">
    <div className="section-heading"><h2>{settingsOnly ? '剧情与服务设置' : '自由奇遇'}</h2></div>
    <div className="mode-locked"><strong>{play.mode === 'classic' ? '经典剧情' : 'AI 生成式剧情'}</strong><span>本存档固定</span></div>
    {play.mode === 'generative' && <details className="ai-settings" open={settingsOnly || undefined}>
      <summary>AI 服务设置 · {aiSettings.endpoint ? '已配置地址' : '尚未配置服务'}</summary>
      <form onSubmit={(event) => { event.preventDefault(); store.configureAi({ endpoint, consent }, token); }}>
        <label>生成服务地址（relay，不是模型供应商地址）<input type="url" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://your-relay.example/narrative" maxLength={2048} autoComplete="off" /></label>
        <label>relay 访问口令（仅本次页面有效）<input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="不要填写模型供应商 API Key" maxLength={256} autoComplete="off" /></label>
        <label className="consent-row"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />同意向此服务发送当前虚构场景、行动意图、相关 NPC 关系与最近奇遇。服务可能产生模型费用。</label>
        <p>模型密钥只放在 relay 服务端。游戏不上传整份存档；不要在行动意图里填写真实个人资料或密钥。保存地址不代表模型已经连接。旧的仅返回对白的接口需升级为 scene-v1。</p>
        <div className="play-controls"><button type="submit">保存接入设置</button><button type="button" disabled={play.mode !== 'generative' || !aiSettings.endpoint || !aiSettings.consent || Boolean(play.pending) || store.aiStatus === 'checking'} onClick={() => { void store.testAi(); }}>测试连接</button></div>
      </form>
    </details>}
    {play.mode === 'generative' && (!aiSettings.endpoint || !aiSettings.consent) && <p className="play-warning">AI 尚未就绪：配置并授权后才会请求生成服务；未就绪时使用人工回退。</p>}
    {!settingsOnly && <div className="exploration-form">
      <label>奇遇方向<select value={effectiveFocus} onChange={(event) => setFocus(event.target.value as SceneFocus)} disabled={busy}>
        <option value="city">城市日常</option><option value="cultivation">修炼奇遇</option><option value="social" disabled={!contacts.length}>熟人故事{contacts.length ? '' : '（先认识 NPC）'}</option>
      </select></label>
      {effectiveFocus === 'social' && <label>一起经历的人<select value={selectedNpc ?? ''} onChange={(event) => setNpcId(event.target.value as NpcId)} disabled={busy}>{contacts.map((npc) => <option key={npc.id} value={npc.id}>{npc.name} · {npc.role}</option>)}</select></label>}
      {play.mode === 'generative' && <label className="intent-field">虚构行动（可选）<textarea value={intent} onChange={(event) => setIntent(event.target.value)} maxLength={200} rows={2} disabled={busy} placeholder="例如：调查巷口反复出现的纸鹤。" /></label>}
      <button className="explore-button" type="button" disabled={busy || game.energy < 2} onClick={() => { void store.explore(effectiveFocus, effectiveFocus === 'social' ? selectedNpc || undefined : undefined, intent, preferred); }}>
        {play.mode === 'generative' ? '生成下一段奇遇' : '探索经典奇遇'}<small>{explorePlan.totalMinutes} 分钟 · 路程 {explorePlan.distanceKm.toFixed(1)} km · 精力 -2 · 选择另计</small>
      </button>
    </div>}
    <p className={`ai-status ${store.aiStatus}`} role="status" aria-live="polite">{store.aiMessage || (play.mode === 'classic' ? '经典模式 · 无 AI 请求' : '等待探索')}</p>
    {!settingsOnly && play.pending && <button className="fallback-button" type="button" onClick={store.fallback}>取消生成并使用人工回退</button>}
    {store.saveError && <p className="play-warning" role="alert">{store.saveError}</p>}
    {!settingsOnly && play.scene && <section ref={sceneElement} tabIndex={-1} className="generated-scene" aria-live="polite" aria-label="当前自由奇遇">
      <div className="eyebrow">{play.scene.source === 'ai' ? 'AI 生成奇遇' : '经典人工奇遇'} · {FOCUS_LABELS[play.scene.focus]}{play.scene.npcId ? ` · ${NPC_MAP.get(play.scene.npcId)?.name}` : ''}</div>
      <h3>{play.scene.title}</h3><p>{play.scene.description}</p>
      {play.mode === 'classic' && play.scene.source === 'ai' && <p className="play-explanation">旧档保留的 AI 场景，可离线完成。</p>}
      <div className="generated-choices">{play.scene.choices.map((choice) => <button type="button" key={choice.id} disabled={sceneChoiceBlocked(game, choice.approach) || store.loadBlocked || store.slotBusy || store.saveStatus !== 'saved'} onClick={() => store.chooseEvent(choice.id)}>
        <strong>{choice.label}</strong><small>{profileSummary(choice.approach, Boolean(play.scene?.npcId))}</small>
      </button>)}</div>
    </section>}
    {!settingsOnly && play.history.length > 0 && <details className="scene-memories"><summary>奇遇记忆 · 最近 {play.history.length} 段</summary>{[...play.history].reverse().map((memory, index) => <article key={`${play.sequence}-${index}`}><strong>{memory.source === 'ai' ? 'AI' : '经典'} · 第 {memory.day} 天 · {memory.title}</strong><p>选择：{memory.choice}</p><p>{memory.result}</p></article>)}</details>}
  </section>;
}
