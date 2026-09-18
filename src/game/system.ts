import type { ItemId } from './cultivation';
import type { DeliveryOrder, GameState } from './types';

export const SYSTEM_EXCHANGES = [
  { id: 'herb-bundle', name: '青息草小包', tier: '凡品', cost: 6, minutes: 5, item: 'herb', quantity: 2, unlockOrders: 0, description: '两份青息草，可用于调制归元散或制符。' },
  { id: 'paper-bundle', name: '素符纸匣', tier: '凡品', cost: 6, minutes: 5, item: 'paper', quantity: 3, unlockOrders: 0, description: '三张素符纸，供五行符解制符使用。' },
  { id: 'tea-token', name: '清心茶', tier: '良品', cost: 10, minutes: 5, item: 'tea', quantity: 1, unlockOrders: 5, description: '舒缓压力并增加突破准备度。' },
  { id: 'pill-token', name: '归元散', tier: '良品', cost: 16, minutes: 5, item: 'pill', quantity: 1, unlockOrders: 12, description: '恢复健康与法力的成品药散。' },
  { id: 'talisman-token', name: '护脉符', tier: '珍品', cost: 24, minutes: 5, item: 'talisman', quantity: 1, unlockOrders: 20, description: '突破时可选用，增加成功率。' },
] as const satisfies readonly {
  id: string; name: string; tier: string; cost: number; minutes: number;
  item: ItemId; quantity: number; unlockOrders: number; description: string;
}[];

export type SystemExchangeId = typeof SYSTEM_EXCHANGES[number]['id'];

export function deliveryCoinReward(order: Pick<DeliveryOrder, 'distanceKm' | 'strange'>, distanceKm = order.distanceKm): number {
  return Math.min(4, 1 + Math.floor(Math.max(0, distanceKm) / 3) + (order.strange ? 1 : 0));
}

export function systemExchangePlan(game: GameState, id: SystemExchangeId) {
  const exchange = SYSTEM_EXCHANGES.find((entry) => entry.id === id);
  if (!exchange) return { exchange: null, reason: '兑换项不存在。' };
  const inventory = game.cultivation.inventory[exchange.item];
  const reason = game.gameOver ? '本世已经结束。'
    : game.pendingEventId || game.cultivation.trial ? '请先处理当前故事或试炼。'
    : game.activeOrder ? '请先完成或取消当前配送。'
    : game.completedOrders < exchange.unlockOrders ? '完成 ' + exchange.unlockOrders + ' 单后解锁。'
    : game.deliveryCoins < exchange.cost ? '需要 ' + exchange.cost + ' 外卖币。'
    : inventory + exchange.quantity > 99 ? '该物品已接近持有上限。'
    : null;
  return { exchange, reason };
}

function appendSystemLog(game: GameState, text: string): GameState {
  const entry = { id: 'system-' + game.day + '-' + game.minute + '-' + text, day: game.day, minute: game.minute, text, tone: 'mystic' as const };
  return { ...game, log: [entry, ...game.log].slice(0, 80) };
}

export function redeemSystemExchange(
  game: GameState,
  id: SystemExchangeId,
  advance: (state: GameState, minutes: number) => GameState,
): GameState {
  const plan = systemExchangePlan(game, id);
  if (!plan.exchange || plan.reason) return game;
  const exchange = plan.exchange;
  let next = advance({ ...game, deliveryCoins: game.deliveryCoins - exchange.cost }, exchange.minutes);
  if (next.gameOver) return next;
  next = {
    ...next,
    cultivation: {
      ...next.cultivation,
      inventory: {
        ...next.cultivation.inventory,
        [exchange.item]: next.cultivation.inventory[exchange.item] + exchange.quantity,
      },
    },
  };
  return appendSystemLog(next, '系统兑换：' + exchange.name + ' ×' + exchange.quantity + '，外卖币 -' + exchange.cost + '，耗时 ' + exchange.minutes + ' 分钟。');
}
