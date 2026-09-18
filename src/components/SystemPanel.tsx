import { SYSTEM_EXCHANGES } from '../game/system';
import { useGameStore } from '../game/store';
import { systemActionPlan } from '../game/engine';

export function SystemPanel() {
  const game = useGameStore((state) => state.game);
  const playBusy = useGameStore((state) => Boolean(state.play.pending || state.play.scene || state.slotBusy || state.loadBlocked));
  const exchangeSystemItem = useGameStore((state) => state.exchangeSystemItem);
  return <section className="panel system-panel">
    <div className="system-balance">
      <div><span className="eyebrow">配送修仙系统</span><h3>外卖币兑换</h3></div>
      <strong>{game.deliveryCoins}<small> 外卖币</small></strong>
    </div>
    <p className="system-note">系统兑换在骑手驿站完成；总耗时 = 从当前位置前往驿站的通勤时间 + 5 分钟兑换处理。</p>
    <div className="system-shop-grid">
      {SYSTEM_EXCHANGES.map((entry) => {
        const plan = systemActionPlan(game, entry.id);
        const reason = playBusy ? '请先处理当前奇遇或存档状态。' : plan.reason;
        return <article className="system-item" key={entry.id}>
          <div className="system-item-head"><div><span>{entry.tier}</span><h3>{entry.name}</h3></div><strong>×{entry.quantity}</strong></div>
          <p>{entry.description}</p>
          <div className="system-item-meta"><span>{entry.cost} 外卖币</span><span>{plan.totalMinutes} 分钟</span><span>驿站路程 {plan.distanceKm.toFixed(1)} km</span>{entry.unlockOrders > 0 && <span>{entry.unlockOrders} 单解锁</span>}</div>
          {reason && <small className="system-lock">{reason}</small>}
          <button type="button" className="primary-button system-exchange-button" disabled={Boolean(reason)} onClick={() => exchangeSystemItem(entry.id)}>兑换</button>
        </article>;
      })}
    </div>
  </section>;
}
