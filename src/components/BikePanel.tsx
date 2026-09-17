import { BIKE_UPGRADES, MAX_BIKE_LEVEL, bikeStats, repairCost, upgradeCost } from '../game/bike';
import { useGameStore } from '../game/store';
import { ActionButton, StatBar } from './GamePanels';

export function BikePanel() {
  const { game, play, slotBusy, loadBlocked } = useGameStore();
  const stats = bikeStats(game.bike), repair = repairCost(game.bike);
  const busy = Boolean(game.pendingEventId || game.gameOver || play.pending || play.scene || slotBusy || loadBlocked);
  return <section className="bike-panel" aria-label="电动车维护与升级">
    <div className="section-heading"><h3>我的电动车</h3></div>
    <StatBar label="电池电量" value={game.bikeBattery} max={stats.capacity} suffix={` / ${stats.capacity}`} danger={game.bikeBattery < 20} />
    <StatBar label="车辆耐久" value={game.bike.condition} max={stats.maxCondition} suffix={` / ${stats.maxCondition}`} danger={game.bike.condition < 20} />
    <div className="action-grid"><ActionButton action="charge-bike" title="换电补满" meta={`18 分钟 · ¥6 · 补满至 ${stats.capacity}`} disabled={busy || game.money < 6 || game.bikeBattery >= stats.capacity} /><ActionButton action="repair-bike" title="维修电动车" meta={`30 分钟 · ¥${repair} · 耐久补满`} disabled={busy || !repair || game.money < repair} /></div>
    <div className="bike-upgrades">{BIKE_UPGRADES.map((item) => {
      const level = game.bike[item.id], maxed = level >= MAX_BIKE_LEVEL, cost = upgradeCost(game.bike, item.id);
      return <div className="bike-upgrade" key={item.id}><div><strong>{item.label} <span>Lv.{level} / {MAX_BIKE_LEVEL}</span></strong><p>{item.description}</p></div><ActionButton action={`upgrade-bike-${item.id}`} title={maxed ? `${item.label}已满级` : `升级${item.label}`} meta={maxed ? '已达到升级上限' : `45 分钟 · ¥${cost}`} disabled={busy || maxed || game.money < cost} /></div>;
    })}</div>
  </section>;
}
