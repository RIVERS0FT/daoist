import { advanceTime, phaseFor } from './engine';
import { DELIVERY_DROPOFFS, DELIVERY_PICKUPS } from './deliveryLocations';
import type { DeliveryOrder, GameState, LogEntry } from './types';

export const DELIVERY_OFFER_COUNT = 4;

function hashText(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0 || 0x6d2b79f5;
}

function nextRandom(seed: number): [number, number] {
  let value = seed | 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  const next = value >>> 0 || 0x9e3779b9;
  return [next / 4294967296, next];
}

function randomInt(seed: number, min: number, max: number): [number, number] {
  const [roll, next] = nextRandom(seed);
  return [Math.floor(roll * (max - min + 1)) + min, next];
}

function boardSeed(state: GameState): number {
  const latest = state.log[0]?.id ?? 'new-save';
  return hashText(`${state.day}|${state.minute}|${state.seed}|${state.weather}|${state.completedOrders}|${latest}`);
}

function makeLog(state: GameState, text: string, tone: LogEntry['tone'] = 'normal'): LogEntry {
  return {
    id: `${state.day}-${state.minute}-${hashText(text).toString(36)}`,
    day: state.day,
    minute: state.minute,
    text,
    tone,
  };
}

function isNightMinute(minute: number): boolean {
  return minute >= 20 * 60 || minute < 6 * 60;
}

export function deliveryOffers(state: GameState, count = DELIVERY_OFFER_COUNT): DeliveryOrder[] {
  if (state.activeOrder || state.pendingEventId || state.gameOver || state.cultivation.trial) return [];
  const desired = Math.max(0, Math.min(8, Math.floor(count)));
  if (!desired) return [];

  let seed = boardSeed(state);
  const offers: DeliveryOrder[] = [];
  const usedDropoffs = new Set<string>();
  const phase = phaseFor(state.minute);
  const peak = phase === '午高峰' || phase === '晚高峰' ? 1.35 : 1;
  const weather = state.weather === 'storm' ? 1.45 : state.weather === 'rain' ? 1.2 : 1;

  for (let attempt = 0; offers.length < desired && attempt < desired * 8; attempt += 1) {
    let pickupIndex: number, dropoffIndex: number, distanceTenths: number, rewardBonus: number, timeJitter: number, strangeRoll: number;
    [pickupIndex, seed] = randomInt(seed, 0, DELIVERY_PICKUPS.length - 1);
    [dropoffIndex, seed] = randomInt(seed, 0, DELIVERY_DROPOFFS.length - 1);
    const pickup = DELIVERY_PICKUPS[pickupIndex], dropoff = DELIVERY_DROPOFFS[dropoffIndex];
    if (usedDropoffs.has(dropoff.id)) continue;
    usedDropoffs.add(dropoff.id);
    [distanceTenths, seed] = randomInt(seed, 12, 72);
    [rewardBonus, seed] = randomInt(seed, 0, 8);
    [timeJitter, seed] = randomInt(seed, 0, 12);
    [strangeRoll, seed] = randomInt(seed, 0, 99);
    const distanceKm = distanceTenths / 10;
    const reward = Math.round((7 + distanceKm * 2.1 + rewardBonus) * peak * weather);
    const estimatedMinutes = Math.round(10 + distanceKm * 4.2 + timeJitter);
    offers.push({
      id: `offer-${state.day}-${state.minute}-${attempt}-${seed.toString(36)}`,
      merchant: pickup.name,
      pickupId: pickup.id,
      customer: dropoff.name,
      dropoffId: dropoff.id,
      distanceKm,
      reward,
      estimatedMinutes,
      acceptedAtDay: state.day,
      acceptedAtMinute: state.minute,
      strange: strangeRoll < (isNightMinute(state.minute) ? 14 : 4),
    });
  }
  return offers;
}

export function acceptDeliveryOffer(state: GameState, offerId: string): GameState {
  if (state.activeOrder || state.pendingEventId || state.gameOver || state.cultivation.trial) return state;
  const selected = deliveryOffers(state).find((offer) => offer.id === offerId);
  if (!selected) return state;

  let next = advanceTime(state, 2);
  if (next.gameOver) return next;
  const order: DeliveryOrder = { ...selected, acceptedAtDay: next.day, acceptedAtMinute: next.minute };
  next = { ...next, activeOrder: order };
  const text = `接取地图任务：${order.merchant} → ${order.customer}，取餐并入配送流程，预计 ${order.estimatedMinutes} 分钟，基础收入 ¥${order.reward}。`;
  return { ...next, log: [makeLog(next, text, order.strange ? 'mystic' : 'normal'), ...next.log].slice(0, 80) };
}
