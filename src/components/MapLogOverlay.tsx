import { formatTime } from '../game/engine';
import { useGameStore } from '../game/store';

export function MapLogOverlay({ compact = false }: { compact?: boolean }) {
  const screen = useGameStore((s) => s.screen);
  const entries = useGameStore((s) => s.game.log);
  if (screen !== 'playing') return null;

  const visibleEntries = entries.slice(0, compact ? 4 : 8);
  return <aside className={`map-log-overlay ${compact ? 'compact' : ''}`} aria-label="行为与事件日志">
    <div className="map-log-heading"><strong>日志</strong><span>{entries.length}</span></div>
    {visibleEntries.length ? <ol>{visibleEntries.map((entry, index) => <li key={`${entry.id}-${index}`} className={entry.tone ?? 'normal'}>
      <time>第 {entry.day} 天 {formatTime(entry.minute)}</time><p>{entry.text}</p>
    </li>)}</ol> : <p className="map-log-empty">暂无记录</p>}
  </aside>;
}
