import type { BikeState, BikeUpgrade, DeliveryOrder, GameState } from './types';

export const MAX_BIKE_LEVEL = 5;
export const BIKE_UPGRADES: { id: BikeUpgrade; label: string; description: string; baseCost: number }[] = [
  { id: 'speed', label: '速度', description: '每级提升 15% 骑行速度，缩短配送耗时。', baseCost: 180 },
  { id: 'battery', label: '电池容量', description: '每级增加 40 电量上限，升级后需要换电补满。', baseCost: 160 },
  { id: 'durability', label: '耐用性', description: '每级增加 25 耐久上限，并降低配送磨损。', baseCost: 140 },
  { id: 'efficiency', label: '节能', description: '每级减少 8% 配送耗电。', baseCost: 150 },
];
export const initialBike = (): BikeState => ({ version: 1, speed: 0, battery: 0, durability: 0, efficiency: 0, condition: 100 });
const finite = (v: unknown, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? v : fallback;
export function normalizeBike(raw: unknown): BikeState | null {
  if (raw == null) return initialBike();
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.version !== 1) return null;
  const bike = initialBike();
  for (const { id } of BIKE_UPGRADES) bike[id] = Math.max(0, Math.min(MAX_BIKE_LEVEL, Math.floor(finite(r[id], 0))));
  bike.condition = Math.max(0, Math.min(bikeStats(bike).maxCondition, finite(r.condition, 100)));
  return bike;
}
export function bikeStats(bike: BikeState) {
  return { capacity: 100 + bike.battery * 40, maxCondition: 100 + bike.durability * 25,
    speedMultiplier: 1 + bike.speed * 0.15, energyMultiplier: 1 - bike.efficiency * 0.08 };
}
export function upgradeCost(bike: BikeState, upgrade: BikeUpgrade): number {
  const definition = BIKE_UPGRADES.find((entry) => entry.id === upgrade);
  return definition ? definition.baseCost * (bike[upgrade] + 1) : Infinity;
}
export function repairCost(bike: BikeState): number {
  const missing = bikeStats(bike).maxCondition - bike.condition;
  return missing > 0 ? Math.max(5, Math.ceil(missing * 0.3)) : 0;
}
export function deliveryEstimate(order: DeliveryOrder, bike: BikeState, distanceKm = order.distanceKm, weather: GameState['weather'] = 'clear', energy = 100): number {
  const weatherFactor = weather === 'storm' ? 0.68 : weather === 'rain' ? 0.85 : 1;
  const fatigue = energy < 25 ? 1.18 : 1;
  const speedKph = 18 * bikeStats(bike).speedMultiplier * weatherFactor;
  return Math.max(1, Math.ceil(distanceKm / speedKph * 60 * fatigue));
}
export function deliveryCosts(order: DeliveryOrder, bike: BikeState, distanceKm = order.distanceKm) {
  return { battery: Math.max(1, Math.ceil(distanceKm * 2.4 * bikeStats(bike).energyMultiplier)),
    wear: Math.max(1, Math.ceil(distanceKm * 0.65 / (1 + bike.durability * 0.2))) };
}
export function ridingBlockReason(game: GameState, distanceKm = game.activeOrder?.distanceKm ?? 0): string | null {
  if (game.bikeBattery <= 0) return '电动车已没电，不能骑行。请换电，或明确选择推车送达。';
  if (game.bike.condition <= 0) return '电动车已损坏，不能骑行。请维修，或推车送达。';
  if (game.activeOrder) {
    const cost = deliveryCosts(game.activeOrder, game.bike, distanceKm);
    if (game.bikeBattery < cost.battery) return `本单需要 ${cost.battery} 电量，当前不足。请先换电。`;
    if (game.bike.condition < cost.wear) return `本单需要 ${cost.wear} 耐久，当前不足。请先维修。`;
  }
  return null;
}
export function pushingCosts(game: GameState, distance = game.activeOrder?.distanceKm ?? 0) {
  const weatherFactor = game.weather === 'storm' ? 0.68 : game.weather === 'rain' ? 0.85 : 1;
  const fatigue = game.energy < 25 ? 0.82 : 1;
  const minutes = distance > 0 ? Math.max(1, Math.ceil(distance / (4 * weatherFactor * fatigue) * 60)) : 0;
  return { minutes, energy: Math.max(1, Math.ceil(distance * 3 + minutes / 25)), income: Math.max(2, (game.activeOrder?.reward ?? 0) - 12) };
}
