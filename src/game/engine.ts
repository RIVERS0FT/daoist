import type { CultivationCommand } from './cultivation';
import { cultivationPlan, initialCultivation, normalizeCultivation, runCultivation, realmName, breakthroughCost } from './cultivation';
export { realmName, breakthroughCost } from './cultivation';
import { DELIVERY_PICKUPS, DELIVERY_DROPOFFS, initialPosition, normalizePosition, orderMapPoints } from './deliveryLocations';
import { BIKE_UPGRADES, MAX_BIKE_LEVEL, bikeStats, deliveryCosts, deliveryEstimate, initialBike, normalizeBike, pushingCosts, repairCost, ridingBlockReason, upgradeCost } from './bike';
import { EVENT_MAP, EVENTS } from './content';
import { ENDING_MAP } from './endings';
import { changeRelationship, clampRelationships, createInitialRelationships, mergeRelationships, setRelationshipRoute } from './npcs';
import { deliveryCoinReward } from './system';
import { actionDestination, deliveryRouteDistanceFromPoints, deliveryRouteDistanceKm, npcDestination, travelPlan } from './travel';
import type { ActionContext, BikeUpgrade, DeliveryOrder, EventEffect, GameAction, GameState, LogEntry, NpcId, NumericStatKey, Weather } from './types';

const WEATHERS: Weather[] = ['clear', 'clear', 'cloudy', 'cloudy', 'rain', 'storm'];

export const RENT = 850;

export function createInitialState(seed = Date.now() >>> 0): GameState {
  return {
    version: 2, day: 1, minute: 7 * 60, seed: seed || 0x13572468, weather: 'clear', money: 1263, deliveryCoins: 0,
    energy: 88, health: 100, stress: 12, reputation: 5, bikeBattery: 82, bike: initialBike(), position: initialPosition(), cultivation: initialCultivation(), qi: 0, insight: 1,
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
  if (source.deliveryCoins !== undefined && (typeof source.deliveryCoins !== 'number' || !Number.isSafeInteger(source.deliveryCoins) || source.deliveryCoins < 0 || source.deliveryCoins > 999999)) return null;
  const base = createInitialState(seed);
  const bike = normalizeBike(source.bike);
  const position = normalizePosition(source.position);
  const level = source.realmLevel ?? 0, day = source.day ?? 1;
  if (typeof level !== 'number' || !Number.isInteger(level) || level < 0 || level > 10 || typeof day !== 'number' || !Number.isSafeInteger(day) || day < 1) return null;
  const cultivation = normalizeCultivation(source.cultivation, level, day);
  if (!bike || !position || !cultivation) return null;
  const merged = {
    ...base,
    ...source,
    version: 2,
    bike,
    position,
    cultivation,
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

function clampState(state: GameState): GameState {
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));
  const next: GameState = {
    ...state,
    money: Math.max(-9999, Math.round(state.money)), deliveryCoins: Math.round(clamp(state.deliveryCoins, 0, 999999)), energy: clamp(state.energy, 0, 100), health: clamp(state.health, 0, 100),
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
  while (remaining > 0 && !next.gameOver) {
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

export function gameActionPlan(state: GameState, action: GameAction) {
  const baseMinutes = action.startsWith('upgrade-bike-') ? 45
    : action === 'eat' ? 30 : action === 'rest' ? 60 : action === 'sleep' ? 360
    : action === 'charge-bike' ? 18 : action === 'repair-bike' ? 30 : action === 'cancel-order' ? 5
    : action === 'meditate-1h' ? 60 : action === 'meditate-3h' ? 180 : action === 'study' ? 90 : action === 'breakthrough' ? 240 : 0;
  const travel = travelPlan(state, actionDestination(action));
  return { ...travel, baseMinutes, totalMinutes: baseMinutes + travel.minutes };
}

function arriveForAction(state: GameState, destinationId: string | null): GameState {
  const plan = travelPlan(state, destinationId);
  if (!plan.minutes) return destinationId && state.position.locationId !== plan.destination.id
    ? { ...state, position: { version: 1, locationId: plan.destination.id } } : state;
  let next = advanceTime(state, plan.minutes);
  if (next.gameOver) return next;
  next = { ...next, position: { version: 1, locationId: plan.destination.id } };
  return appendLog(next, `前往${plan.destination.name}：地图路程 ${plan.distanceKm.toFixed(1)} km，通勤 ${plan.minutes} 分钟。`, 'normal');
}

function cultivationDestination(command: CultivationCommand, preferred?: string | null): string | null {
  if (command.type === 'use') return null;
  if (command.type === 'buy' || command.type === 'learn' || command.type === 'study') return 'bookshop';
  if (command.type === 'gather') return 'mountain';
  if (preferred === 'mountain' || preferred === 'rooftop') return preferred;
  return 'rooftop';
}

export function cultivationActionPlan(state: GameState, command: CultivationCommand, preferred?: string | null) {
  const base = cultivationPlan(state, command);
  const destinationId = cultivationDestination(command, preferred);
  const travel = travelPlan(state, destinationId);
  return { ...base, destinationId, destination: travel.destination, distanceKm: travel.distanceKm, travelMinutes: travel.minutes, totalMinutes: base.minutes + travel.minutes };
}

export function socializePlan(state: GameState, npcId: NpcId) {
  const travel = travelPlan(state, npcDestination(npcId));
  return { ...travel, baseMinutes: 45, totalMinutes: 45 + travel.minutes };
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
  if (state.pendingEventId || state.gameOver || state.cultivation.trial) return state;
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
  let rewardBonus: number, strangeRoll: number;
  [rewardBonus, next] = randomInt(next, 0, 8); [strangeRoll, next] = randomInt(next, 0, 99);
  const distanceKm = deliveryRouteDistanceFromPoints(state, pickup, dropoff);
  const phase = phaseFor(next.minute);
  const peak = phase === '午高峰' || phase === '晚高峰' ? 1.35 : 1;
  const weather = next.weather === 'storm' ? 1.45 : next.weather === 'rain' ? 1.2 : 1;
  const reward = Math.round((7 + distanceKm * 2.1 + rewardBonus) * peak * weather);
  const estimatedMinutes = Math.max(1, Math.ceil(distanceKm / 18 * 60));
  return [{ id: `${next.day}-${next.minute}-${next.seed}`, merchant, customer, pickupId: pickup.id, dropoffId: dropoff.id, distanceKm, reward, estimatedMinutes, acceptedAtDay: next.day, acceptedAtMinute: next.minute, strange: strangeRoll < (isNightMinute(next.minute) ? 14 : 4) }, next];
}

function acceptOrder(state: GameState): GameState {
  if (state.activeOrder || state.gameOver || ridingBlockReason(state)) return state;
  let next = state;
  let order: DeliveryOrder;
  [order, next] = generateOrder(next);
  next = { ...next, activeOrder: order };
  next = appendLog(next, `接单：${order.merchant} → ${order.customer}，预计 ${order.estimatedMinutes} 分钟，基础收入 ¥${order.reward}。`, order.strange ? 'mystic' : 'normal');
  return maybeTriggerEvent(clampState(next), 'delivery', 0.26);
}

export function completeDelivery(state: GameState, order: DeliveryOrder, pushing = false): GameState {
  if (state.gameOver || state.pendingEventId || state.cultivation.trial) return state;
  const distanceKm = deliveryRouteDistanceKm(state, order);
  const costs = deliveryCosts(order, state.bike, distanceKm);
  if (!pushing && (state.bikeBattery <= 0 || state.bike.condition <= 0 || state.bikeBattery < costs.battery || state.bike.condition < costs.wear)) return state;
  const foot = pushingCosts({ ...state, activeOrder: order }, distanceKm);
  if (pushing && state.energy < foot.energy) return state;
  const actualMinutes = pushing ? foot.minutes : deliveryEstimate(order, state.bike, distanceKm, state.weather, state.energy);
  const useLightSteps = !pushing && state.cultivation.lightSteps > 0;
  const energyCost = pushing ? foot.energy : Math.max(1, Math.round(distanceKm * 1.5 + actualMinutes / 18) - (useLightSteps ? 3 : 0));
  const income = pushing ? foot.income : order.reward;
  const deliveryCoins = deliveryCoinReward(order, distanceKm);
  let next = advanceTime({ ...state, energy: Math.max(0, state.energy - energyCost),
    bikeBattery: state.bikeBattery - (pushing ? 0 : costs.battery),
    bike: { ...state.bike, condition: state.bike.condition - (pushing ? 0 : costs.wear) },
    activeOrder: state.activeOrder?.id === order.id ? null : state.activeOrder }, actualMinutes);
  if (next.gameOver) return next;
  next = { ...next, cultivation: useLightSteps ? { ...next.cultivation, lightSteps: next.cultivation.lightSteps - 1 } : next.cultivation,
    position: { version: 1, locationId: orderMapPoints(order).dropoff.id }, money: next.money + income, deliveryCoins: next.deliveryCoins + deliveryCoins,
    totalIncome: next.totalIncome + income, completedOrders: next.completedOrders + 1,
    reputation: next.reputation + (pushing ? 0 : 1), stress: next.stress + (pushing ? 3 : -1) };
  next = appendLog(next, `${pushing ? '推车送达（没有骑行）' : '骑行送达'}至 ${order.customer}：地图路程 ${distanceKm.toFixed(1)} km，耗时 ${actualMinutes} 分钟，精力 -${energyCost}，收入 ¥${income}，外卖币 +${deliveryCoins}。`, pushing ? 'normal' : 'good');
  return maybeTriggerEvent(clampState(next), 'delivery', order.strange ? 0.82 : 0.58);
}

function completeOrder(state: GameState, pushing = false): GameState {
  const order = state.activeOrder;
  return order ? completeDelivery(state, order, pushing) : state;
}

function upgradeBike(state: GameState, id: BikeUpgrade): GameState {
  if (!BIKE_UPGRADES.some((item) => item.id === id) || state.bike[id] >= MAX_BIKE_LEVEL) return state;
  const cost = upgradeCost(state.bike, id);
  if (state.money < cost) return state;
  let next = arriveForAction(state, 'station');
  if (next.gameOver || next.money < cost) return next;
  next = advanceTime({ ...next, money: next.money - cost }, 45);
  if (next.gameOver) return next;
  return appendLog({ ...next, bike: { ...next.bike, [id]: next.bike[id] + 1 } },
    `电动车${BIKE_UPGRADES.find((item) => item.id === id)!.label}升至 ${next.bike[id] + 1} 级：¥${cost}，施工 45 分钟。`, 'good');
}

export function runCultivationAction(state: GameState, command: CultivationCommand, preferred?: string | null): GameState {
  const plan = cultivationPlan(state, command);
  if (plan.reason) return state;
  const destinationId = cultivationDestination(command, preferred);
  let arrived = arriveForAction(state, destinationId);
  if (arrived.gameOver) return arrived;
  const next = runCultivation(arrived, command, advanceTime, value => maybeTriggerEvent(value, 'cultivation', .28));
  return next !== arrived && command.type === 'study' ? maybeTriggerEvent(next, 'cultivation', .3) : next;
}

export function runAction(state: GameState, action: GameAction): GameState {
  if (state.pendingEventId || state.gameOver || state.cultivation.trial) return state;
  if (action.startsWith('upgrade-bike-')) return upgradeBike(state, action.slice(13) as BikeUpgrade);
  let next = state;
  switch (action) {
    case 'accept-order': return acceptOrder(next);
    case 'complete-order': return completeOrder(next);
    case 'push-order': return completeOrder(next, true);
    case 'cancel-order':
      if (!next.activeOrder) return next;
      return appendLog(clampState(advanceTime({ ...next, activeOrder: null, reputation: next.reputation - 2, stress: next.stress + 2 }, 5)), '已取消配送：处理耗时 5 分钟，信誉 -2。', 'bad');
    case 'eat':
      if (next.money < 18) return appendLog(next, '余额不足，连一顿像样的饭都买不起。', 'bad');
      next = arriveForAction(next, 'noodles'); if (next.gameOver || next.money < 18) return next;
      next = advanceTime({ ...next, money: next.money - 18 }, 30);
      if (next.gameOver) return next;
      next = { ...next, energy: next.energy + 22, health: next.health + 4, stress: next.stress - 5 };
      next = appendLog(clampState(next), '在老城食街吃了一顿热饭，精神恢复了一些。', 'good');
      return maybeTriggerEvent(next, 'life', 0.18);
    case 'rest':
      next = arriveForAction(next, 'home'); if (next.gameOver) return next;
      next = advanceTime(next, 60); if (next.gameOver) return next;
      next = { ...next, energy: next.energy + 24, stress: next.stress - 10 };
      next = appendLog(clampState(next), '回到出租屋休息一小时，脑子终于没那么紧绷。', 'good'); return maybeTriggerEvent(next, 'life', 0.2);
    case 'sleep':
      next = arriveForAction(next, 'home'); if (next.gameOver) return next;
      next = advanceTime(next, 360); if (next.gameOver) return next;
      next = { ...next, energy: next.energy + 62, health: next.health + 8, stress: next.stress - 16 };
      next = appendLog(clampState(next), '回到出租屋睡了六小时。城市没有因为你休息而停下来。', 'good'); return maybeTriggerEvent(next, 'life', 0.22);
    case 'charge-bike': {
      if (next.money < 6 || next.bikeBattery >= bikeStats(next.bike).capacity) return next;
      next = arriveForAction(next, 'charge'); if (next.gameOver || next.money < 6) return next;
      next = advanceTime({ ...next, money: next.money - 6 }, 18);
      if (next.gameOver) return next;
      next = { ...next, bikeBattery: bikeStats(next.bike).capacity };
      return appendLog(clampState(next), '在南街换电柜换上满电电池。', 'good');
    }
    case 'repair-bike': {
      const cost = repairCost(next.bike);
      if (!cost || next.money < cost) return next;
      next = arriveForAction(next, 'station'); if (next.gameOver || next.money < cost) return next;
      next = advanceTime({ ...next, money: next.money - cost }, 30);
      if (next.gameOver) return next;
      return appendLog({ ...next, bike: { ...next.bike, condition: bikeStats(next.bike).maxCondition } }, `在骑手驿站修好电动车：¥${cost}，维修 30 分钟，耐久补满。`, 'good');
    }
    case 'meditate-1h': return runCultivationAction(next, { type: 'meditate', hours: 1 });
    case 'meditate-3h': return runCultivationAction(next, { type: 'meditate', hours: 3 });
    case 'study': return runCultivationAction(next, { type: 'study' });
    case 'breakthrough': return runCultivationAction(next, { type: 'breakthrough', strategy: 'steady', aid: false });
    default: return state;
  }
}

export function socializeNpc(state: GameState, npcId: NpcId): GameState {
  if (state.pendingEventId || state.gameOver || state.activeOrder || state.cultivation.trial) return state;
  const current = state.relationships[npcId];
  if (!current?.met) return appendLog(state, '你们还没有真正认识，暂时没有联系方式。', 'normal');
  let next = arriveForAction(state, npcDestination(npcId));
  if (next.gameOver) return next;
  next = advanceTime(next, 45);
  if (next.gameOver) return next;
  next = { ...next, energy: next.energy - 3, stress: next.stress - 2 };
  next = appendLog(clampState(next), '你到了对方常活动的地点，留出四十五分钟见面。', 'normal');
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
  if (state.gameOver || state.pendingEventId || state.activeOrder || state.cultivation.trial) return state;
  const ending = ENDING_MAP.get(endingId);
  if (!ending || !ending.condition(state)) return appendLog(state, '这个结局还没有真正成为你的可能。', 'bad');
  return appendLog({ ...state, endingId, gameOver: true }, `结局：${ending.title}`, 'mystic');
}
