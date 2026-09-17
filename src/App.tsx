import { StartScreen } from './components/StartScreen';
import { bikeStats, deliveryEstimate } from './game/bike';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CityMap } from './components/CityMap';
import { CharacterPanel, CultivationPanel, DeliveryPanel, EndingResult, EventPanel, LifePanel } from './components/GamePanels';
import { HelpPanel } from './components/HelpPanel';
import { Icon } from './components/Icon';
import { MapLogOverlay } from './components/MapLogOverlay';
import { PlayModePanel } from './components/PlayModePanel';
import { RelationshipsPanel } from './components/RelationshipsPanel';
import { MAP_PLACES, PANEL_TITLES } from './game/cityMap';
import type { MapPlace, PanelId, PlaceId } from './game/cityMap';
import { EVENT_MAP } from './game/content';
import { formatTime, phaseFor, realmName } from './game/engine';
import { useGameStore } from './game/store';

const WEATHER = { clear: '晴', cloudy: '多云', rain: '雨', storm: '雷暴' } as const;
const NAV = [
  { id: null, label: '地图', icon: 'map' }, { id: 'delivery', label: '跑单', icon: 'bike' },
  { id: 'cultivation', label: '修炼', icon: 'moon' }, { id: 'relationships', label: '关系', icon: 'users' },
  { id: 'exploration', label: '奇遇', icon: 'spark' },
] as const;
const MORE = [
  { id: 'life', icon: 'home' }, { id: 'character', icon: 'wallet' },
  { id: 'endings', icon: 'flag' }, { id: 'help', icon: 'book' }, { id: 'settings', icon: 'settings' },
] as const;

export default function App() {
  const game = useGameStore((s) => s.game), play = useGameStore((s) => s.play);
  const hydrated = useGameStore((s) => s.hydrated), hydrate = useGameStore((s) => s.hydrate);
  const initAiSettings = useGameStore((s) => s.initAiSettings), returnToStart = useGameStore((s) => s.returnToStart);
  const screen = useGameStore((s) => s.screen), activeSlotId = useGameStore((s) => s.activeSlotId);
  const saveStatus = useGameStore((s) => s.saveStatus), slotBusy = useGameStore((s) => s.slotBusy);
  const currentSlot = useGameStore((s) => s.slots.find((slot) => slot.id === s.activeSlotId));
  const saveError = useGameStore((s) => s.saveError), loadBlocked = useGameStore((s) => s.loadBlocked);
  const [panel, setPanel] = useState<PanelId | null>(null), [more, setMore] = useState(false);
  const [place, setPlace] = useState<MapPlace | null>(null), [selected, setSelected] = useState<PlaceId | null>(null);
  const drawer = useRef<HTMLElement>(null), mapNav = useRef<HTMLButtonElement>(null), opener = useRef<HTMLElement | null>(null);
  const event = game.pendingEventId ? EVENT_MAP.get(game.pendingEventId) : null;
  const night = game.minute >= 1200 || game.minute < 360;
  const pendingPanel: PanelId | null = game.gameOver ? 'endings' : event ? 'event' : play.pending || play.scene ? 'exploration' : game.cultivation.trial ? 'cultivation' : null;
  const openPanel = useCallback((next: PanelId) => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPanel(next); setMore(false);
  }, []);
  const closePanel = useCallback(() => {
    setPanel(null); setMore(false); setPlace(null);
    requestAnimationFrame(() => {
      const target = opener.current;
      const canRestore = target?.isConnected && !(target instanceof HTMLButtonElement && target.disabled);
      (canRestore ? target : mapNav.current)?.focus({ preventScroll: true });
    });
  }, []);
  const openNav = (next: PanelId | null) => { setPlace(null); if (next === null || panel === next) closePanel(); else openPanel(next); };
  const openPlace = (next: MapPlace) => { setPlace(next); setSelected(next.id); openPanel(next.panel); };
  const resetGame = () => { void returnToStart(); };
  useEffect(() => { setPanel(null); setPlace(null); setMore(false); setSelected(null); }, [activeSlotId]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { const state = useGameStore.getState(); if (state.saveStatus === 'saving' || state.saveStatus === 'error') { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard);
  }, []);
  useEffect(() => { void hydrate(); initAiSettings(import.meta.env.VITE_NARRATIVE_AI_ENDPOINT as string | undefined); }, [hydrate, initAiSettings]);
  useEffect(() => {
    if (!hydrated || loadBlocked || screen !== 'playing') return;
    if (game.gameOver) openPanel('endings');
    else if (game.pendingEventId) openPanel('event');
    else if (play.pending || play.scene) openPanel('exploration');
    else if (game.cultivation.trial) openPanel('cultivation');
  }, [hydrated, loadBlocked, screen, activeSlotId, game.gameOver, game.pendingEventId, game.cultivation.trial?.stage, play.pending?.id, play.scene?.id, openPanel]);
  useEffect(() => { if (panel) drawer.current?.focus({ preventScroll: true }); }, [panel]);
  useEffect(() => { if (more) document.querySelector<HTMLButtonElement>('#more-navigation button')?.focus({ preventScroll: true }); }, [more]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { if (more) { setMore(false); document.getElementById('more-navigation-button')?.focus(); } else if (panel) closePanel(); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [panel, more, closePanel]);
  if (!hydrated) return <main className="loading">正在读取本地存档…</main>;
  if (screen === 'start') return <StartScreen />;
  const meters = [
    { label: '金钱', value: `¥${Math.round(game.money).toLocaleString('zh-CN')}`, icon: 'wallet', danger: game.money < 100 },
    { label: '灵气', value: Math.round(game.qi), icon: 'spark', danger: false },
    { label: '精力', value: `${Math.round(game.energy)}/100`, icon: 'leaf', danger: game.energy < 25 },
    { label: '健康', value: `${Math.round(game.health)}/100`, icon: 'heart', danger: game.health < 35 },
    { label: '压力', value: `${Math.round(game.stress)}/100`, icon: 'clock', danger: game.stress > 70 },
    { label: '电量', value: `${Math.round(game.bikeBattery)}/${bikeStats(game.bike).capacity}`, icon: 'battery', danger: game.bikeBattery < 20 },
  ];
  const latest = game.log[0];
  return <main className={`game-shell ${night ? 'night-map' : 'day-map'}`} data-weather={game.weather}>
    <header className="status-bar" role="banner" aria-label="顶部状态栏">
      <div className="game-identity"><div><h1 title={currentSlot?.name}>{currentSlot?.name ?? '无名修士'}</h1><button type="button" className="realm-button" onClick={() => openNav('character')}>{realmName(game.realmLevel)}<span>查看状态 ›</span></button></div></div>
      <div className="clock-block"><strong>第 {game.day} 天 · {formatTime(game.minute)}</strong><span>{phaseFor(game.minute)} · {WEATHER[game.weather]}</span><small className={`save-indicator ${saveStatus}`} aria-live="polite">{saveStatus === 'saving' ? '自动保存中…' : saveStatus === 'error' ? '自动保存失败' : '已保存'}</small></div>
      <div className="status-meters">{meters.map((item) => <div className={`status-meter ${item.danger ? 'low' : ''}`} key={item.label}><Icon name={item.icon} size={18} /><div><span>{item.label}</span><strong>{item.value}</strong></div></div>)}</div>
      <button type="button" className="mode-chip" onClick={() => openNav('settings')} aria-label={`游玩模式：${play.mode === 'classic' ? '经典剧情' : 'AI 生成剧情'}，打开设置`}><span className="mode-dot" />{play.mode === 'classic' ? '经典剧情' : 'AI 生成剧情'}</button>
    </header>
    {saveError && <div className="storage-alert" role="alert">{saveError}<button type="button" onClick={() => openNav('settings')}>打开设置</button></div>}
    <section className="map-stage" aria-label="城市地图主界面">
      <CityMap key={activeSlotId} panelOpen={Boolean(panel)} order={game.activeOrder} position={game.position} selected={selected} onOrder={() => { setPlace(null); openPanel('delivery'); }} onPlace={openPlace} onPlaces={() => openNav('places')} />
      <MapLogOverlay compact={Boolean(panel)} />
      {!panel && (pendingPanel || game.activeOrder) && <aside className={`map-task ${pendingPanel ? 'requires-attention' : ''}`}>
        <span className="eyebrow">{pendingPanel ? '待处理' : '当前配送'}</span>
        <strong>{game.gameOver ? '这一世的故事已收束' : event ? event.title : play.pending ? '奇遇生成中' : play.scene ? play.scene.title : game.cultivation.trial ? '内景筑基试炼待续' : `${game.activeOrder?.merchant} → ${game.activeOrder?.customer}`}</strong>
        <p>{pendingPanel ? '先处理当前内容再继续行动。' : `${game.activeOrder?.distanceKm.toFixed(1)} km · 约 ${game.activeOrder ? deliveryEstimate(game.activeOrder, game.bike) : 0} 分钟`}</p>
        <button type="button" onClick={() => openNav(pendingPanel ?? 'delivery')}>{pendingPanel ? '继续处理' : '查看配送'}<Icon name="arrow" size={17} /></button>
      </aside>}
      {panel && <section ref={drawer} className="game-drawer" tabIndex={-1} aria-labelledby="drawer-heading">
        <header className="drawer-heading"><div>{place && place.panel === panel && <span className="eyebrow">{place.name}</span>}<h2 id="drawer-heading">{PANEL_TITLES[panel]}</h2></div><button className="drawer-close" type="button" aria-label="关闭面板，返回地图" onClick={closePanel}><Icon name="close" /></button></header>
        <div className="drawer-body" key={panel}>
          {pendingPanel && panel !== pendingPanel && <button type="button" className="pending-link" onClick={() => openPanel(pendingPanel)}>{game.gameOver ? '查看本世结局' : '有待处理的内容，点击继续'}<Icon name="arrow" size={16} /></button>}
          {place && place.panel === panel && <div className="place-intro"><span>{place.district}</span><p>{place.description}</p></div>}
          {panel === 'delivery' && <DeliveryPanel />}{panel === 'life' && <LifePanel />}{panel === 'cultivation' && <CultivationPanel />}
          {panel === 'relationships' && <RelationshipsPanel npcId={place?.npcId} />}{panel === 'character' && <CharacterPanel />}
          {panel === 'exploration' && <PlayModePanel />}
          {panel === 'help' && <HelpPanel />}
          {panel === 'settings' && <><PlayModePanel settingsOnly /><div className="settings-save"><h3>存档 · {currentSlot?.name}</h3><button className="reset-button" type="button" disabled={slotBusy} onClick={resetGame}>返回开始页 / 管理存档</button>{saveError && <button className="reset-button" type="button" disabled={slotBusy} onClick={() => { if (window.confirm('确定放弃本页尚未保存的改动？磁盘中的存档会保留。')) void returnToStart(true); }}>放弃未保存改动，保留磁盘存档并返回</button>}</div></>}
          {panel === 'endings' && <EndingResult onReset={resetGame} />}
          {panel === 'event' && (event ? <EventPanel /> : <div className="resolved-event"><Icon name="book" size={28} /><h3>这一页，已经写下。</h3><p>{latest?.text}</p><button type="button" className="primary-button" onClick={() => openNav(game.activeOrder ? 'delivery' : null)}>{game.activeOrder ? '继续配送' : '返回地图'}</button></div>)}
          {panel === 'places' && <div className="place-directory">{MAP_PLACES.map((item) => <button key={item.id} type="button" onClick={() => openPlace(item)}><Icon name={item.icon} /><span><strong>{item.name}</strong><small>{item.subtitle}</small></span><Icon name="arrow" size={16} /></button>)}</div>}
        </div>
      </section>}
    </section>
    <nav className="nav-dock" aria-label="游戏导航">
      {more && <div className="more-navigation" id="more-navigation"><span className="eyebrow">更多</span>{MORE.map((item) => <button type="button" key={item.id} onClick={() => openNav(item.id)}><Icon name={item.icon} size={18} /><span>{PANEL_TITLES[item.id]}</span>{item.id === 'endings' && game.day >= 30 && <b className="nav-badge">可查看</b>}</button>)}<button type="button" disabled={slotBusy} onClick={resetGame}><Icon name="book" size={18} /><span>存档 / 返回开始页</span></button></div>}
      {NAV.map((item) => <button type="button" key={item.label} ref={item.id === null ? mapNav : undefined} className="nav-button" aria-label={item.label} aria-pressed={panel === item.id} onClick={() => openNav(item.id)}><Icon name={item.icon} /><span>{item.label}</span>{item.id === 'delivery' && game.activeOrder && <i className="nav-indicator" />}{item.id === 'exploration' && (play.pending || play.scene) && <i className="nav-indicator" />}</button>)}
      <button type="button" className="nav-button more-button" id="more-navigation-button" aria-label="更多导航" aria-expanded={more} aria-controls="more-navigation" onClick={() => setMore((v) => !v)}><Icon name="more" /><span>更多</span></button>
    </nav>
  </main>;
}
