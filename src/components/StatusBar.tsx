import { bikeStats } from '../game/bike';
import { formatTime, phaseFor, realmName } from '../game/engine';
import type { PlayMode } from '../game/generation';
import type { GameState } from '../game/types';
import { Icon } from './Icon';

const WEATHER = { clear: '晴', cloudy: '多云', rain: '雨', storm: '雷暴' } as const;

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface StatusBarProps {
  game: GameState;
  mode: PlayMode;
  playerName: string;
  saveStatus: SaveStatus;
  onOpenCharacter: () => void;
  onOpenSettings: () => void;
}

export function StatusBar({ game, mode, playerName, saveStatus, onOpenCharacter, onOpenSettings }: StatusBarProps) {
  const meters = [
    { label: '金钱', value: `¥${Math.round(game.money).toLocaleString('zh-CN')}`, icon: 'wallet', danger: game.money < 100 },
    { label: '灵气', value: Math.round(game.qi), icon: 'spark', danger: false },
    { label: '精力', value: `${Math.round(game.energy)}/100`, icon: 'leaf', danger: game.energy < 25 },
    { label: '健康', value: `${Math.round(game.health)}/100`, icon: 'heart', danger: game.health < 35 },
    { label: '压力', value: `${Math.round(game.stress)}/100`, icon: 'clock', danger: game.stress > 70 },
    { label: '电量', value: `${Math.round(game.bikeBattery)}/${bikeStats(game.bike).capacity}`, icon: 'battery', danger: game.bikeBattery < 20 },
  ];
  const modeLabel = mode === 'classic' ? '经典剧情' : 'AI 生成剧情';
  const saveLabel = saveStatus === 'saving' ? '自动保存中…' : saveStatus === 'error' ? '自动保存失败' : '进度已自动保存';

  return <header className="status-bar" role="banner" aria-label="顶部状态栏">
    <div className="game-identity">
      <span className="game-seal" aria-hidden="true">道</span>
      <div className="identity-copy">
        <h1 title={playerName}>{playerName}</h1>
        <button type="button" className="realm-button" onClick={onOpenCharacter}>{realmName(game.realmLevel)}<span>查看状态 ›</span></button>
      </div>
    </div>
    <div className="status-overview">
      <div className="time-status">
        <div className="clock-block">
          <strong>第 {game.day} 天 · {formatTime(game.minute)}</strong>
          <span>{phaseFor(game.minute)} · {WEATHER[game.weather]}</span>
        </div>
        <small className={`save-indicator ${saveStatus}`} aria-live="polite">{saveLabel}</small>
      </div>
      <div className="status-meters">{meters.map((item) => <div className={`status-meter ${item.danger ? 'low' : ''}`} key={item.label}><Icon name={item.icon} size={18} /><div><span>{item.label}</span><strong>{item.value}</strong></div></div>)}</div>
    </div>
    <div className="status-actions">
      <button type="button" className="mode-chip" onClick={onOpenSettings} aria-label={`游玩模式：${modeLabel}，打开设置`}><span className="mode-dot" />{modeLabel}</button>
    </div>
  </header>;
}
