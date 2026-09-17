import { DELIVERY_PICKUPS, DELIVERY_DROPOFFS, initialPosition, normalizePosition, orderMapPoints } from './deliveryLocations';
import { BIKE_UPGRADES, MAX_BIKE_LEVEL, bikeStats, deliveryCosts, deliveryEstimate, initialBike, normalizeBike, pushingCosts, repairCost, ridingBlockReason, upgradeCost } from './bike';
import { EVENT_MAP, EVENTS } from './content';
import { ENDING_MAP } from './endings';
import { changeRelationship, clampRelationships, createInitialRelationships, mergeRelationships, setRelationshipRoute } from './npcs';
import type { ActionContext, BikeUpgrade, DeliveryOrder, EventEffect, GameAction, GameState, LogEntry, NpcId, NumericStatKey, Weather } from './types';

const WEATHERS: Weather[] = ['clear', 'clear', 'cloudy', 'cloudy', 'rain', 'storm'];

export const RENT = 850;

export function createInitialState(seed = Date.now() >>> 0): GameState {
  return {
    version: 2, day: 1, minute: 7 * 60, seed: seed || 0x13572468, weather: 'clear', money: 1263,
    energy: 88, health: 100, stress: 12, reputation: 5, bikeBattery: 82, bike: initialBike(), position: initialPosition(), qi: 0, insight: 1,
    karma: 0, darkQi: 0, realmLevel: 0, completedOrders: 0, totalIncome: 0, rentDueDay: 7,
    activeOrder: null, pendingEventId: null, recentEvents: [], flags: {}, relationships: createInitialRelationships(), endingId: null, gameOver: false,
    log: [makeLog(1, 7 * 60, '新的一个月开始了。七天后要先交第一笔房租。', 'normal')],
  };
}

export function migrateGameState(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  if (source.version !== 1 && source.version !== 2) return null;
  const seed = typeof source.seed === 'number' ? source.seed : 0x5a17d311;
  const base = createInitialState(seed);
  const bike = normalizeBike(source.bike);
  const position = normalizePosition(source.position);
  if (!bike || !position) return null;
  const merged = {
    ...base,
    ...source,
    version: 2,
    bike,
    position,
    relationships: mergeRelationships(source.relationships as Partial<GameState['relationships']> | undefined),
    endingId: typeof source.endingId === 'string' ? source.endingId : null,
  } as GameState;
  return clampState(merged);
}

function makeLog(day: number, minute: number, text: string, tone: LogEntry['tone'] = 'normal'): LogEntry {
  return { id: `${day}-${minute}-${text}-${Math.floor(text.length * 97)}`, day, minute, text, tone };
}

function appendLog(state: GameState, text: string, tone: LogEntry['tone'] = 'normal'): GameState {
  return { ...state, log: [makeLog(state.day, state.minute, text, tone), ...state.log].slice(0, 80) };
}

export function appendNarrativeLine(state: GameState, text: string): GameState {
  if (!text.trim()) return state;
  return appendLog(state, `人物片段：${text.trim().slice(0, 240)}`, 'normal');
}

function nextRandom(state: GameState): [number, GameState] {
  let x = state.seed | 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  const seed = x >>> 0 || 0x9e3779b9;
  return [seed / 4294967296, { ...state, seed }];
}

function randomInt(state: GameState, min: number, max: number): [number, GameState] {
  const [r, next] = nextRandom(state);
  return [Math.floor(r * (max - min + 1)) + min, next];
}

function pick<T>(state: GameState, values: T[]): [T, GameState] {
  const [idx, next] = randomInt(state, 0, values.length - 1);
  return [values[idx], next];
}

export function phaseFor(minute: number): string {
  if (minute < 6 * 60) return '深夜';
  if (minute < 9 * 60) return '早晨';
  if (minute < 11 * 60) return '平峰';
  if (minute < 14 * 60) return '午高峰';
  if (minute < 17 * 60) return '午后';
  if (minute < 20 * 60) return '晚高峰';
  return '夜晚';
}

export function formatTime(minute: number): string {
  const h = Math.floor(minute / 60).toString().padStart(2, '0');
  const m = (minute % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

export function realmName(level: number): string {
  return level <= 0 ? '凡人' : `炼气${['一', '二', '三', '四', '五', '六', '七', '八', '九'][Math.min(8, level - 1)]}层`;
}

export function breakthroughCost(level: number): number {
  return level <= 0 ? 30 : 45 + level * 28;
}

function clampState(state: GameState): GameState {
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));
  const next: GameState = {
    ...state,
    money: Math.max(-9999, Math.round(state.money)), energy: clamp(state.energy, 0, 100), health: clamp(state.health, 0, 100),
    stress: clamp(state.stress, 0, 100), reputation: clamp(state.reputation, 0, 100), bikeBattery: clamp(state.bikeBattery, 0, bikeStats(state.bike).capacity),
    qi: clamp(state.qi, 0, 9999), insight: clamp(state.insight, 0, 99), karma: clamp(state.karma, -99, 99), darkQi: clamp(state.darkQi, 0, 99),
    relationships: clampRelationships(state.relationships),
  };
  if (next.health <= 0 && !next.gameOver) return appendLog({ ...next, gameOver: true }, '你的身体彻底撑不住了。这一世的外卖修仙之路到此为止。', 'bad');
  return next;
}

function startNewDay(state: GameState): GameState {
  let next = state;
  const [weather, weatherState] = pick(next, WEATHERS);
  next = { ...weatherState, weather };
  if (next.day >= next.rentDueDay) {
    const extension = next.flags.rent_extension === true;
    const due = extension ? RENT + 50 : RENT;
    if (next.money >= due) {
      next = { ...next, money: next.money - due, rentDueDay: next.rentDueDay + 30, flags: { ...next.flags, rent_extension: false } };
      next = appendLog(next, `房租日：自动支付 ¥${due}。下次房租在第 ${next.rentDueDay} 天。`, 'bad');
    } else {
      next = { ...next, stress: next.stress + 18, health: next.health - 4, rentDueDay: next.rentDueDay + 2 };
      next = appendLog(next, '房租没凑够。房东给了你最后两天，压力陡增。', 'bad');
    }
  }
  if (next.energy < 20) {
    next = { ...next, health: next.health - 4, stress: next.stress + 4 };
    next = appendLog(next, '长期缺觉开始影响身体。', 'bad');
  }
  if (next.day === 30) next = appendLog(next, '第三十天到了。你已经可以选择收束这一阶段的人生，也可以继续生活，等更多结局条件成熟。', 'mystic');
  return clampState(next);
}

export function advanceTime(state: GameState, minutes: number): GameState {
  let remaining = Math.max(0, Math.round(minutes));
  let next = state;
  while (remaining > 0) {
    const untilMidnight = 1440 - next.minute;
    if (remaining < untilMidnight) {
      next = { ...next, minute: next.minute + remaining };
      remaining = 0;
    } else {
      remaining -= untilMidnight;
      next = { ...next, day: next.day + 1, minute: 0 };
      next = startNewDay(next);
    }
  }
  return next;
}

function setStat(state: GameState, key: NumericStatKey, delta: number): GameState {
  return { ...state, [key]: state[key] + delta } as GameState;
}

function applyEffect(state: GameState, effect: EventEffect): GameState {
  if (effect.type === 'stat') return setStat(state, effect.key, effect.delta);
  if (effect.type === 'time') return advanceTime(state, effect.minutes);
  if (effect.type === 'relationship') return { ...state, relationships: changeRelationship(state.relationships, effect.npcId, effect.key, effect.delta, state.day) };
  if (effect.type === 'relationship-route') return { ...state, relationships: setRelationshipRoute(state.relationships, effect.npcId, effect.route, state.day) };
  return { ...state, flags: { ...state.flags, [effect.key]: effect.value } };
}

function eventEligible(state: GameState, eventId: string, context: ActionContext, npcId?: NpcId): boolean {
  const event = EVENT_MAP.get(eventId);
  if (!event || !event.contexts.includes(context)) return false;
  if (npcId && event.npcId !== npcId) return false;
  if (state.recentEvents.slice(0, 5).includes(event.id)) return false;
  return event.condition ? event.condition(state) : true;
}

function maybeTriggerEvent(state: GameState, context: ActionContext, baseChance: number, npcId?: NpcId): GameState {
  if (state.pendingEventId || state.gameOver) return state;
  let next = state;
  const nightBonus = (next.minute >= 20 * 60 || next.minute < 6 * 60) ? 0.08 : 0;
  const darkBonus = Math.min(0.08, next.darkQi * 0.005);
  const [roll, rolled] = nextRandom(next);
  next = rolled;
  if (roll > Math.min(0.96, baseChance + nightBonus + darkBonus)) return next;
  const candidates = EVENTS.filter((event) => eventEligible(next, event.id, context, npcId));
  if (!candidates.length) return next;
  const totalWeight = candidates.reduce((sum, event) => sum + event.weight, 0);
  const [choiceRoll, chosenState] = nextRandom(next);
  next = chosenState;
  let cursor = choiceRoll * totalWeight;
  const chosen = candidates.find((event) => { cursor -= event.weight; return cursor <= 0; }) ?? candidates[candidates.length - 1];
  next = { ...next, pendingEventId: chosen.id, recentEvents: [chosen.id, ...next.recentEvents].slice(0, 16) };
  return appendLog(next, `事件：${chosen.title}`, chosen.npcId ? 'normal' : 'mystic');
}

const isNightMinute = (minute: number) => minute >= 20 * 60 || minute < 6 * 60;

function generateOrder(state: GameState): [DeliveryOrder, GameState] {
  let next = state;
  const [pickup, pickupState] = pick(next, DELIVERY_PICKUPS);
  const [dropoff, dropoffState] = pick(pickupState, DELIVERY_DROPOFFS);
  next = dropoffState;
  const merchant = pickup.name, customer = dropoff.name;
  let distanceTenths: number, rewardBonus: number, timeJitter: number, strangeRoll: number;
  [distanceTenths, next] = randomInt(next, 12, 72); [rewardBonus, next] = randomInt(next, 0, 8);
  [timeJitter, next] = randomInt(next, 0, 12); [strangeRoll, next] = randomInt(next, 0, 99);
  const distanceKm = distanceTenths / 10;
  const phase = phaseFor(next.minute);
  const peak = phase === '午高峰' || phase === '晚高峰' ? 1.35 : 1;
  const weather = next.weather === 'storm' ? 1.45 : next.weather === 'rain' ? 1.2 : 1;
  const reward = Math.round((7 + distanceKm * 2.1 + rewardBonus) * peak * weather);
  const estimatedMinutes = Math.round(10 + distanceKm * 4.2 + timeJitter);
  return [{ id: `${next.day}-${next.minute}-${next.seed}`, merchant, customer, pickupId: pickup.id, dropoffId: dropoff.id, distanceKm, reward, estimatedMinutes, acceptedAtDay: next.day, acceptedAtMinute: next.minute, strange: strangeRoll < (isNightMinute(next.minute) ? 14 : 4) }, next];
}

function acceptOrder(state: GameState): GameState {
  if (state.activeOrder || state.gameOver || ridingBlockReason(state)) return state;
  let next = advanceTime(state, 2);
  let order: DeliveryOrder;
  [order, next] = generateOrder(next);
  next = { ...next, activeOrder: order };
  next = appendLog(next, `接单：${order.merchant} → ${order.customer}，预计 ${order.estimatedMinutes} 分钟，基础收入 ¥${order.reward}。`, order.strange ? 'mystic' : 'normal');
  return maybeTriggerEvent(clampState(next), 'delivery', 0.26);
}

function completeOrder(state: GameState, pushing = false): GameState {
  const order = state.activeOrder;
  if (!order || state.gameOver || (!pushing && ridingBlockReason(state))) return state;
  const foot = pushingCosts(state), costs = deliveryCosts(order, state.bike);
  if (pushing && state.energy < foot.energy) return state;
  let next = state, variance = 0;
  if (!pushing) [variance, next] = randomInt(next, -4, 14);
  const weatherDelay = next.weather === 'storm' ? 10 : next.weather === 'rain' ? 5 : 0;
  const actualMinutes = pushing ? foot.minutes : Math.max(8, deliveryEstimate(order, next.bike) + variance + weatherDelay + (next.energy < 25 ? 8 : 0));
  const energyCost = pushing ? foot.energy : Math.max(4, Math.round(order.distanceKm * 1.5 + actualMinutes / 18));
  const income = pushing ? foot.income : order.reward;
  // All requirements are checked before RNG, time, payment or order state can change.
  next = advanceTime({ ...next, energy: Math.max(0, next.energy - energyCost),
    bikeBattery: next.bikeBattery - (pushing ? 0 : costs.battery),
    bike: { ...next.bike, condition: next.bike.condition - (pushing ? 0 : costs.wear) }, activeOrder: null }, actualMinutes);
  if (next.gameOver) return next;
  next = { ...next, position: { version: 1, locationId: orderMapPoints(order).dropoff.id }, money: next.money + income, totalIncome: next.totalIncome + income, completedOrders: next.completedOrders + 1,
    reputation: next.reputation + (!pushing && variance <= 6 ? 1 : 0), stress: next.stress + (pushing || variance > 10 ? 3 : -1) };
  next = appendLog(next, `${pushing ? '推车送达（没有骑行）' : '骑行送达'}至 ${order.customer}：耗时 ${actualMinutes} 分钟，精力 -${energyCost}，收入 ¥${income}。`, pushing ? 'normal' : 'good');
  return maybeTriggerEvent(clampState(next), 'delivery', order.strange ? 0.82 : 0.58);
}

function upgradeBike(state: GameState, id: BikeUpgrade): GameState {
  if (!BIKE_UPGRADES.some((item) => item.id === id) || state.bike[id] >= MAX_BIKE_LEVEL) return state;
  const cost = upgradeCost(state.bike, id);
  if (state.money < cost) return state;
  const next = advanceTime({ ...state, money: state.money - cost }, 45);
  if (next.gameOver) return next;
  return appendLog({ ...next, bike: { ...next.bike, [id]: next.bike[id] + 1 } },
    `电动车${BIKE_UPGRADES.find((item) => item.id === id)!.label}升至 ${next.bike[id] + 1} 级：¥${cost}，45 分钟。升级不自动充电或维修。`, 'good');
}

function cultivate(state: GameState, minutes: number): GameState {
  if (state.gameOver) return state;
  let next = advanceTime(state, minutes);
  let roll: number;
  [roll, next] = randomInt(next, 0, 4);
  const phase = phaseFor(state.minute);
  const multiplier = phase === '深夜' ? 1.65 : phase === '夜晚' ? 1.4 : phase === '早晨' ? 1.15 : 0.85;
  const manualBonus = next.flags.small_cycle_notes === true ? 2 : 0;
  const hours = minutes / 60;
  const gain = Math.max(1, Math.round((3 + roll + manualBonus + next.insight * 0.18) * multiplier * hours));
  next = { ...next, qi: next.qi + gain, energy: next.energy - Math.round(8 * hours), stress: next.stress - Math.round(2 * hours) };
  next = appendLog(next, `吐纳 ${hours} 小时，获得 ${gain} 灵气。`, 'mystic');
  return maybeTriggerEvent(clampState(next), 'cultivation', minutes >= 180 ? 0.48 : 0.34);
}

function breakthrough(state: GameState): GameState {
  if (state.gameOver || state.realmLevel >= 9) return state;
  const cost = breakthroughCost(state.realmLevel);
  if (state.qi < cost) return appendLog(state, `突破失败：至少需要 ${cost} 灵气。`, 'bad');
  let next = advanceTime(state, 240);
  let roll: number;
  [roll, next] = randomInt(next, 0, 999);
  const chance = Math.min(0.94, 0.66 + next.insight * 0.025 + next.health * 0.0015 - next.stress * 0.0015);
  next = { ...next, qi: next.qi - cost, energy: next.energy - 18 };
  if (roll / 1000 <= chance) {
    next = { ...next, realmLevel: next.realmLevel + 1, health: next.health + 5, stress: next.stress - 8 };
    next = appendLog(next, `突破成功：你踏入了${realmName(next.realmLevel)}。`, 'mystic');
  } else {
    next = { ...next, health: next.health - 14, stress: next.stress + 10, darkQi: next.darkQi + 1 };
    next = appendLog(next, '突破失败，灵气散乱，经脉受损。', 'bad');
  }
  return maybeTriggerEvent(clampState(next), 'cultivation', 0.42);
}

export function runAction(state: GameState, action: GameAction): GameState {
  if (state.pendingEventId || state.gameOver) return state;
  if (action.startsWith('upgrade-bike-')) return upgradeBike(state, action.slice(13) as BikeUpgrade);
  let next = state;
  switch (action) {
    case 'accept-order': return acceptOrder(next);
    case 'complete-order': return completeOrder(next);
    case 'push-order': return completeOrder(next, true);
    case 'cancel-order':
      if (!next.activeOrder) return next;
      return appendLog(clampState(advanceTime({ ...next, activeOrder: null, reputation: next.reputation - 2, stress: next.stress + 2 }, 5)), '已取消配送：5 分钟，信誉 -2。', 'bad');
    case 'eat':
      if (next.money < 18) return appendLog(next, '余额不足，连一顿像样的饭都买不起。', 'bad');
      next = advanceTime(next, 30);
      next = { ...next, money: next.money - 18, energy: next.energy + 22, health: next.health + 4, stress: next.stress - 5 };
      next = appendLog(clampState(next), '吃了一顿热饭，精神恢复了一些。', 'good');
      return maybeTriggerEvent(next, 'life', 0.18);
    case 'rest':
      next = advanceTime(next, 60); next = { ...next, energy: next.energy + 24, stress: next.stress - 10 };
      next = appendLog(clampState(next), '休息一小时，脑子终于没那么紧绷。', 'good'); return maybeTriggerEvent(next, 'life', 0.2);
    case 'sleep':
      next = advanceTime(next, 360); next = { ...next, energy: next.energy + 62, health: next.health + 8, stress: next.stress - 16 };
      next = appendLog(clampState(next), '睡了六小时。城市没有因为你休息而停下来。', 'good'); return maybeTriggerEvent(next, 'life', 0.22);
    case 'charge-bike': {
      if (next.money < 6 || next.bikeBattery >= bikeStats(next.bike).capacity) return next;
      next = advanceTime({ ...next, money: next.money - 6 }, 18);
      if (next.gameOver) return next;
      next = { ...next, bikeBattery: bikeStats(next.bike).capacity };
      return appendLog(clampState(next), '换上满电电池，电量已补满至当前容量上限。', 'good');
    }
    case 'repair-bike': {
      const cost = repairCost(next.bike);
      if (!cost || next.money < cost) return next;
      next = advanceTime({ ...next, money: next.money - cost }, 30);
      if (next.gameOver) return next;
      return appendLog({ ...next, bike: { ...next.bike, condition: bikeStats(next.bike).maxCondition } }, `电动车已修好：¥${cost}，30 分钟，耐久补满。`, 'good');
    }
    case 'meditate-1h': return cultivate(next, 60);
    case 'meditate-3h': return cultivate(next, 180);
    case 'study':
      next = advanceTime(next, 90); next = { ...next, energy: next.energy - 7, insight: next.insight + 1, stress: next.stress + 1 };
      next = appendLog(clampState(next), '你把零碎的修炼笔记重新整理了一遍，悟性有所增长。', 'mystic'); return maybeTriggerEvent(next, 'cultivation', 0.3);
    case 'breakthrough': return breakthrough(next);
    default: return state;
  }
}

export function socializeNpc(state: GameState, npcId: NpcId): GameState {
  if (state.pendingEventId || state.gameOver || state.activeOrder) return state;
  const current = state.relationships[npcId];
  if (!current?.met) return appendLog(state, '你们还没有真正认识，暂时没有联系方式。', 'normal');
  let next = advanceTime(state, 45);
  next = { ...next, energy: next.energy - 3, stress: next.stress - 2 };
  next = appendLog(clampState(next), '你给熟人留出了一点时间。修仙和跑单之外，人也需要关系。', 'normal');
  const withEvent = maybeTriggerEvent(next, 'social', 0.96, npcId);
  if (withEvent.pendingEventId) return withEvent;
  next = { ...withEvent, relationships: changeRelationship(withEvent.relationships, npcId, 'affinity', 2, withEvent.day) };
  return appendLog(clampState(next), '没有发生什么大事，只是聊了聊近况。关系也会在普通日子里慢慢长出来。', 'good');
}

export function resolveEventChoice(state: GameState, choiceId: string): GameState {
  if (!state.pendingEventId) return state;
  const event = EVENT_MAP.get(state.pendingEventId);
  if (!event) return { ...state, pendingEventId: null };
  const choice = event.choices.find((item) => item.id === choiceId);
  if (!choice) return state;
  if (choice.requires && state[choice.requires.key] < choice.requires.min) return appendLog(state, `无法选择：${choice.requires.label}。`, 'bad');
  if (choice.relationshipRequires) {
    const req = choice.relationshipRequires;
    if (state.relationships[req.npcId][req.key] < req.min) return appendLog(state, `无法选择：${req.label}。`, 'bad');
  }
  let next: GameState = { ...state, pendingEventId: null };
  for (const effect of choice.effects ?? []) next = applyEffect(next, effect);
  next = clampState(next);
  const tone = event.npcId ? 'good' : event.category.includes('灵异') || event.category.includes('修炼') || event.category.includes('机缘') ? 'mystic' : 'normal';
  return appendLog(next, `${event.title}：${choice.result}`, tone);
}

export function selectEnding(state: GameState, endingId: string): GameState {
  if (state.gameOver || state.pendingEventId || state.activeOrder) return state;
  const ending = ENDING_MAP.get(endingId);
  if (!ending || !ending.condition(state)) return appendLog(state, '这个结局还没有真正成为你的可能。', 'bad');
  return appendLog({ ...state, endingId, gameOver: true }, `结局：${ending.title}`, 'mystic');
}
