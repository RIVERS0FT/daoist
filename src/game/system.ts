import type { ItemId } from './cultivation';
import type { DeliveryOrder, GameState } from './types';

export const SYSTEM_EXCHANGES = [
  { id: 'herb-bundle', name: '青息草小包', tier: '凡品', cost: 6, item: 'herb', quantity: 2, unlockOrders: 0, description: '两份青息草，可用于调制归元散或制符。' },
  { id: 'paper-bundle', name: '素符纸匣', tier: '凡品', cost: 6, item: 'paper', quantity: 3, unlockOrders: 0, description: '三张素符纸，供五行符解制符使用。' },
  { id: 'tea-token', name: '清心茶', tier: '良品', cost: 10, item: 'tea', quantity: 1, unlockOrders: 5, description: '舒缓压力并增加突破准备度。' },
  { id: 'pill-token', name: '归元散', tier: '良品', cost: 16, item: 'pill', quantity: 1, unlockOrders: 12, description: '恢复健康与法力的成品药散。' },
  { id: 'talisman-token', name: '护脉符', tier: '珍品', cost: 24, item: 'talisman', quantity: 1, unlockOrders: 20, description: '突破时可选用，增加成功率。' },
] as const satisfies readonly {
  id: string; name: string; tier: string; cost: number;
  item: ItemId; quantity: number; unlockOrders: number; description: string;
}[];

export type SystemExchangeId = typeof SYSTEM_EXCHANGES[number]['id'];

export interface SystemReward {
  coins?: number;
  item?: ItemId;
  quantity?: number;
  label: string;
}

export interface SystemChapter {
  id: string;
  title: string;
  subtitle: string;
  text: string;
  condition: (game: GameState) => boolean;
}

export interface SystemMission {
  id: string;
  title: string;
  description: string;
  progress: (game: GameState) => string;
  condition: (game: GameState) => boolean;
  reward: SystemReward;
}

export interface SystemAchievement {
  id: string;
  title: string;
  description: string;
  hidden: boolean;
  condition: (game: GameState) => boolean;
  reward: SystemReward;
}

const metNpcCount = (game: GameState) => Object.values(game.relationships).filter((relationship) => relationship.met).length;
const hasCloseRelationship = (game: GameState) => Object.values(game.relationships).some((relationship) =>
  ['friend', 'close-friend', 'romance', 'mentor', 'partner', 'family'].includes(relationship.route)
  || relationship.affinity + relationship.trust + relationship.bond >= 120);

export const SYSTEM_CHAPTERS: readonly SystemChapter[] = [
  {
    id: 'boot',
    title: '第一章 · 系统载入',
    subtitle: '凡俗之功，也可换修行之资',
    text: '没有天降仙门，也没有无条件灌顶。面板只留下一条规则：你在这座城里真正完成的事，会被记录，也会得到对应的回报。',
    condition: () => true,
  },
  {
    id: 'first-mile',
    title: '第二章 · 第一程',
    subtitle: '城市也是道场',
    text: '第一单送达后，灰暗的兑换栏亮起。系统将配送路线记作“行路功”，仿佛每一次穿过街巷，都在给另一条看不见的经脉描线。',
    condition: (game) => game.completedOrders >= 1,
  },
  {
    id: 'two-paths',
    title: '第三章 · 两条路',
    subtitle: '生计与修行开始交汇',
    text: '当灵气第一次稳定留在体内，系统没有催你放弃凡俗。新的提示只有一句：能养活自己的道，才走得长。',
    condition: (game) => game.qi >= 20 || game.realmLevel >= 1,
  },
  {
    id: 'human-karma',
    title: '第四章 · 人间因果',
    subtitle: '关系不是面板上的装饰',
    text: '系统记录到第二个真正认识你的人时，关系栏短暂闪烁。它拒绝给“缘分”标价，只提示：有些奖励不是物品，有些选择也不会显示最优解。',
    condition: (game) => metNpcCount(game) >= 2,
  },
  {
    id: 'unfiled',
    title: '第五章 · 无法归档',
    subtitle: '城市里出现了系统也解释不了的记录',
    text: '某条异常数据被反复校验，最终仍停在“未知”。系统第一次没有给出答案，只把它归入隐藏记录，并建议你继续活着、继续观察。',
    condition: (game) => game.darkQi > 0,
  },
  {
    id: 'foundation',
    title: '第六章 · 筑基门前',
    subtitle: '系统只能给资源，不能替你过关',
    text: '炼气走到尽头后，商城没有出现“一键筑基”。系统把护脉符推到显眼位置，然后沉默下来。真正跨过去的那一步，只能由你自己完成。',
    condition: (game) => game.realmLevel >= 9,
  },
];

export const SYSTEM_MISSIONS: readonly SystemMission[] = [
  {
    id: 'first-delivery',
    title: '新手任务 · 完成第一单',
    description: '完成一次真实配送，让系统确认“外卖币”循环已经启动。',
    progress: (game) => `${Math.min(1, game.completedOrders)}/1 单`,
    condition: (game) => game.completedOrders >= 1,
    reward: { coins: 3, label: '外卖币 ×3' },
  },
  {
    id: 'five-deliveries',
    title: '日常任务 · 跑出自己的路线',
    description: '累计完成 5 单。系统开始把你常走的街区标记为稳定路线。',
    progress: (game) => `${Math.min(5, game.completedOrders)}/5 单`,
    condition: (game) => game.completedOrders >= 5,
    reward: { coins: 6, label: '外卖币 ×6' },
  },
  {
    id: 'first-qi',
    title: '修行任务 · 留住第一口气',
    description: '持有至少 20 灵气，或踏入炼气境。系统确认凡俗生活没有切断你的修行。',
    progress: (game) => game.realmLevel >= 1 ? '已踏入炼气' : `${Math.min(20, Math.round(game.qi))}/20 灵气`,
    condition: (game) => game.qi >= 20 || game.realmLevel >= 1,
    reward: { item: 'herb', quantity: 2, label: '青息草 ×2' },
  },
  {
    id: 'first-realm',
    title: '进阶任务 · 炼气入门',
    description: '完成第一次正式突破。奖励不替代突破，只补充下一阶段的资源。',
    progress: (game) => game.realmLevel >= 1 ? '已完成' : '尚未突破',
    condition: (game) => game.realmLevel >= 1,
    reward: { coins: 8, label: '外卖币 ×8' },
  },
  {
    id: 'human-links',
    title: '支线任务 · 城里有人记得你',
    description: '真正认识至少 2 名 NPC。系统只记录相遇，不替你决定关系走向。',
    progress: (game) => `${Math.min(2, metNpcCount(game))}/2 人`,
    condition: (game) => metNpcCount(game) >= 2,
    reward: { item: 'paper', quantity: 3, label: '素符纸 ×3' },
  },
  {
    id: 'ten-deliveries',
    title: '阶段任务 · 十单成路',
    description: '累计完成 10 单。你开始知道什么时候该抢单，什么时候该留一点力气给夜晚。',
    progress: (game) => `${Math.min(10, game.completedOrders)}/10 单`,
    condition: (game) => game.completedOrders >= 10,
    reward: { item: 'pill', quantity: 1, label: '归元散 ×1' },
  },
  {
    id: 'trusted-person',
    title: '支线任务 · 可托付之人',
    description: '与任意人物建立稳定关系。友情、同道、伙伴、家人或恋爱都可以完成。',
    progress: (game) => hasCloseRelationship(game) ? '已建立稳定关系' : '关系仍在生长',
    condition: hasCloseRelationship,
    reward: { coins: 8, label: '外卖币 ×8' },
  },
  {
    id: 'foundation-door',
    title: '主线任务 · 走到筑基门前',
    description: '达到炼气九层。系统能提供一张护脉符，但不会代替内景试炼与突破。',
    progress: (game) => `炼气 ${Math.min(9, game.realmLevel)}/9`,
    condition: (game) => game.realmLevel >= 9,
    reward: { item: 'talisman', quantity: 1, label: '护脉符 ×1' },
  },
];

export const SYSTEM_ACHIEVEMENTS: readonly SystemAchievement[] = [
  {
    id: 'night-whisper',
    title: '隐藏成就 · 夜路有声',
    description: '第一次留下无法用普通城市常识解释的阴气记录。',
    hidden: true,
    condition: (game) => game.darkQi > 0,
    reward: { coins: 4, label: '外卖币 ×4' },
  },
  {
    id: 'twenty-orders',
    title: '成就 · 城市熟客',
    description: '累计完成 20 单。许多门牌号已经不用再看第二遍。',
    hidden: false,
    condition: (game) => game.completedOrders >= 20,
    reward: { item: 'tea', quantity: 1, label: '清心茶 ×1' },
  },
  {
    id: 'thirty-orders',
    title: '成就 · 青岚路书',
    description: '累计完成 30 单。系统将你的配送记录整理成一份只属于这一世的路书。',
    hidden: false,
    condition: (game) => game.completedOrders >= 30,
    reward: { coins: 12, label: '外卖币 ×12' },
  },
  {
    id: 'foundation-reached',
    title: '隐藏成就 · 人间筑基',
    description: '没有离开这座城，也没有放下生计；你仍然走到了筑基。',
    hidden: true,
    condition: (game) => game.realmLevel >= 10,
    reward: { coins: 20, label: '外卖币 ×20' },
  },
];

export type SystemMissionId = typeof SYSTEM_MISSIONS[number]['id'];
export type SystemAchievementId = typeof SYSTEM_ACHIEVEMENTS[number]['id'];

const flagKey = (kind: 'mission' | 'achievement', id: string) => `system_${kind}_claimed_${id}`;

export function deliveryCoinReward(order: Pick<DeliveryOrder, 'distanceKm' | 'strange'>, distanceKm = order.distanceKm): number {
  return Math.min(4, 1 + Math.floor(Math.max(0, distanceKm) / 3) + (order.strange ? 1 : 0));
}

export function currentSystemChapter(game: GameState): { chapter: SystemChapter; index: number; unlocked: number } {
  const unlocked = SYSTEM_CHAPTERS.filter((chapter) => chapter.condition(game));
  const chapter = unlocked[unlocked.length - 1] ?? SYSTEM_CHAPTERS[0];
  return { chapter, index: SYSTEM_CHAPTERS.indexOf(chapter), unlocked: unlocked.length };
}

export function systemExchangePlan(game: GameState, id: SystemExchangeId) {
  const exchange = SYSTEM_EXCHANGES.find((entry) => entry.id === id);
  if (!exchange) return { exchange: null, reason: '兑换项不存在。' };
  const inventory = game.cultivation.inventory[exchange.item];
  const reason = game.gameOver ? '本世已经结束。'
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

function applyReward(game: GameState, reward: SystemReward): GameState | null {
  if (reward.item) {
    const quantity = reward.quantity ?? 1;
    if (game.cultivation.inventory[reward.item] + quantity > 99) return null;
    game = {
      ...game,
      cultivation: {
        ...game.cultivation,
        inventory: {
          ...game.cultivation.inventory,
          [reward.item]: game.cultivation.inventory[reward.item] + quantity,
        },
      },
    };
  }
  if (reward.coins) game = { ...game, deliveryCoins: Math.min(999999, game.deliveryCoins + reward.coins) };
  return game;
}

export function redeemSystemExchange(game: GameState, id: SystemExchangeId): GameState {
  const plan = systemExchangePlan(game, id);
  if (!plan.exchange || plan.reason) return game;
  const exchange = plan.exchange;
  const next = {
    ...game,
    deliveryCoins: game.deliveryCoins - exchange.cost,
    cultivation: {
      ...game.cultivation,
      inventory: {
        ...game.cultivation.inventory,
        [exchange.item]: game.cultivation.inventory[exchange.item] + exchange.quantity,
      },
    },
  };
  return appendSystemLog(next, '系统兑换：' + exchange.name + ' ×' + exchange.quantity + '，外卖币 -' + exchange.cost + '。物品已直接发放到系统背包。');
}

export function systemMissionState(game: GameState, id: SystemMissionId) {
  const mission = SYSTEM_MISSIONS.find((entry) => entry.id === id);
  if (!mission) return { mission: null, complete: false, claimed: false, reason: '任务不存在。' };
  const complete = mission.condition(game);
  const claimed = game.flags[flagKey('mission', id)] === true;
  const itemBlocked = mission.reward.item
    ? game.cultivation.inventory[mission.reward.item] + (mission.reward.quantity ?? 1) > 99
    : false;
  const reason = game.gameOver ? '本世已经结束。'
    : claimed ? '奖励已领取。'
    : !complete ? '任务尚未完成。'
    : itemBlocked ? '背包空间不足。'
    : null;
  return { mission, complete, claimed, reason };
}

export function systemAchievementState(game: GameState, id: SystemAchievementId) {
  const achievement = SYSTEM_ACHIEVEMENTS.find((entry) => entry.id === id);
  if (!achievement) return { achievement: null, complete: false, claimed: false, reason: '成就不存在。' };
  const complete = achievement.condition(game);
  const claimed = game.flags[flagKey('achievement', id)] === true;
  const itemBlocked = achievement.reward.item
    ? game.cultivation.inventory[achievement.reward.item] + (achievement.reward.quantity ?? 1) > 99
    : false;
  const reason = game.gameOver ? '本世已经结束。'
    : claimed ? '奖励已领取。'
    : !complete ? '成就尚未达成。'
    : itemBlocked ? '背包空间不足。'
    : null;
  return { achievement, complete, claimed, reason };
}

export function claimSystemMission(game: GameState, id: SystemMissionId): GameState {
  const state = systemMissionState(game, id);
  if (!state.mission || state.reason) return game;
  const rewarded = applyReward({
    ...game,
    flags: { ...game.flags, [flagKey('mission', id)]: true },
  }, state.mission.reward);
  return rewarded ? appendSystemLog(rewarded, '系统任务「' + state.mission.title + '」结算：' + state.mission.reward.label + '。') : game;
}

export function claimSystemAchievement(game: GameState, id: SystemAchievementId): GameState {
  const state = systemAchievementState(game, id);
  if (!state.achievement || state.reason) return game;
  const rewarded = applyReward({
    ...game,
    flags: { ...game.flags, [flagKey('achievement', id)]: true },
  }, state.achievement.reward);
  return rewarded ? appendSystemLog(rewarded, '系统成就「' + state.achievement.title + '」结算：' + state.achievement.reward.label + '。') : game;
}
