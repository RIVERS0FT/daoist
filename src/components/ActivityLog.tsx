import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { formatTime } from '../game/engine';
import { useGameStore } from '../game/store';
import { Icon } from './Icon';

/** A read-only view of the existing per-slot log; never dispatches a game action. */
export function ActivityLog({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  const entries = useGameStore((state) => state.game.log);
  const body = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const anchor = useRef<{ key: string; offset: number } | null>(null);
  const previousEntries = useRef(entries);
  const [hasNew, setHasNew] = useState(false);
  const rows = useMemo(() => {
    // Saves can contain repeated IDs. Keep separate real actions, without unstable index keys.
    const occurrences = new Map<string, number>();
    return [...entries].reverse().map((entry) => {
      const occurrence = occurrences.get(entry.id) ?? 0;
      occurrences.set(entry.id, occurrence + 1);
      return { entry, key: `${entry.id}:${occurrence}` };
    });
  }, [entries]);

  function rememberPosition() {
    const element = body.current;
    if (!element || !expanded) return;
    following.current = element.scrollHeight - element.clientHeight - element.scrollTop < 20;
    if (following.current) { anchor.current = null; setHasNew(false); return; }
    const top = element.getBoundingClientRect().top;
    const first = [...element.querySelectorAll<HTMLElement>('[data-log-key]')].find((row) => row.getBoundingClientRect().bottom > top + 1);
    anchor.current = first ? { key: first.dataset.logKey!, offset: first.getBoundingClientRect().top - top } : null;
  }

  useLayoutEffect(() => {
    const changed = previousEntries.current !== entries;
    previousEntries.current = entries;
    const element = body.current;
    if (!expanded || !element) { if (changed) setHasNew(true); return; }
    if (following.current) { element.scrollTop = element.scrollHeight; setHasNew(false); }
    else {
      if (changed) setHasNew(true);
      // Preserve the visible row even when the bounded log trims older entries.
      const saved = anchor.current;
      const row = saved && [...element.querySelectorAll<HTMLElement>('[data-log-key]')].find((item) => item.dataset.logKey === saved.key);
      if (row && saved) element.scrollTop += row.getBoundingClientRect().top - element.getBoundingClientRect().top - saved.offset;
    }
  }, [entries, expanded]);

  function showLatest() {
    following.current = true; anchor.current = null; setHasNew(false);
    if (body.current) body.current.scrollTop = body.current.scrollHeight;
  }
  function toggle() {
    // Explicitly reopening means resume at the newest entry; new actions never force it open.
    if (!expanded) showLatest();
    onToggle();
  }

  return <aside className="activity-log" aria-label="行为与事件日志">
    <header className="activity-log-header">
      <h2><Icon name="book" size={17} />日志</h2>
      {hasNew && (expanded
        ? <button className="log-latest" type="button" onClick={showLatest}>查看最新</button>
        : <span className="log-unread" role="status">有新记录</span>)}
      <button className="log-toggle" type="button" aria-label={expanded ? '收起日志' : '展开日志'} aria-expanded={expanded} aria-controls="activity-log-body" onClick={toggle}><Icon name={expanded ? 'minus' : 'plus'} size={18} /></button>
    </header>
    <div ref={body} id="activity-log-body" className="activity-log-body" hidden={!expanded} role="log" aria-label="行为与事件记录" aria-live={expanded ? 'polite' : 'off'} aria-relevant="additions" tabIndex={0} onScroll={rememberPosition}>
      {rows.length ? <ol className="activity-log-list">{rows.map(({ entry, key }) => <li key={key} data-log-key={key} className={entry.tone ?? 'normal'}>
        <time>第 {entry.day} 天 · {formatTime(entry.minute)}</time><p>{entry.text}</p>
      </li>)}</ol> : <p className="activity-log-empty">暂无记录</p>}
    </div>
  </aside>;
}
