import type { GameState } from './types';

export const MANUALS = [
  { id: 'breath', name: '归元养生经', description: '主修时吐纳每小时多恢复 2 压力；调息额外恢复 5 法力。入门即有，不必拜师。', cost: 0 },
  { id: 'wind', name: '轻身行气诀', description: '熟练度 20 后可施展轻身术，接下来两次成功骑行少耗 3 精力；不能代替电池。', cost: 90 },
  { id: 'ward', name: '五行符解', description: '熟练度 20 后可制作护脉符，突破时自愿消耗一张增加 8 个百分点成功率。', cost: 90 },
  { id: 'insight', name: '观心录', description: '主修时整理笔记额外增加 4 熟练度；熟练度 20 后突破成功率增加 4 个百分点。', cost: 90 },
] as const;
export type ManualId = typeof MANUALS[number]['id'];
export const ITEMS = [
  { id: 'herb', name: '青息草', cost: 12, description: '调制归元散的材料。也可通过辨药获得。' },
  { id: 'paper', name: '素符纸', cost: 6, description: '绘制护脉符的材料。' },
  { id: 'tea', name: '清心茶', cost: 20, description: '饮用 15 分钟，压力 -8，准备度 +10。每日限用 3 次药食。' },
  { id: 'pill', name: '归元散', cost: 36, description: '服用 15 分钟，健康 +8，法力 +12。也可用两份青息草调制。' },
  { id: 'talisman', name: '护脉符', cost: 55, description: '突破前勾选使用，消耗一张增加 8 个百分点成功率；可购买或制符。' },
] as const;
export type ItemId = typeof ITEMS[number]['id'];
export interface CultivationState {
  version: 1; main: ManualId; manuals: Record<ManualId, number | null>;
  mana: number; preparation: number; failures: number; inventory: Record<ItemId, number>;
  medicineUses: number; medicineDay: number; lightSteps: number;
  trial: { stage: number; composure: number } | null; trialPassed: boolean;
}
export type CultivationCommand =
  | { type: 'meditate'; hours: 1 | 3 }
  | { type: 'study' | 'train' | 'breathe' | 'prepare' | 'gather' | 'light-steps' | 'trial-start' | 'trial-exit' }
  | { type: 'learn' | 'equip'; id: ManualId }
  | { type: 'buy'; id: ItemId }
  | { type: 'use'; id: 'tea' | 'pill' }
  | { type: 'craft'; id: 'pill' | 'talisman' }
  | { type: 'breakthrough'; strategy: 'steady' | 'risk'; aid: boolean }
  | { type: 'trial-choice'; choice: 'steady' | 'rush'; stage: number };

export const MAX_REALM = 10;
export function realmName(level: number): string {
  return level >= 10 ? '筑基初期' : level <= 0 ? '凡人' : `炼气${['一','二','三','四','五','六','七','八','九'][level - 1]}层`;
}
export function breakthroughCost(level: number): number { return level >= 9 ? 400 : level <= 0 ? 30 : 45 + level * 28; }
export const maxMana = (level: number) => 30 + Math.min(MAX_REALM, Math.max(0, level)) * 5;
export function initialCultivation(level = 0, day = 1): CultivationState {
  return { version: 1, main: 'breath', manuals: { breath: level > 0 ? Math.min(90, 12 + level * 8) : 0, wind: null, ward: null, insight: null },
    mana: 20, preparation: 0, failures: 0, inventory: { herb: 0, paper: 0, tea: 0, pill: 0, talisman: 0 },
    medicineUses: 0, medicineDay: day, lightSteps: 0, trial: null, trialPassed: level >= MAX_REALM };
}
const record = (r: unknown): r is Record<string, unknown> => !!r && typeof r === 'object' && !Array.isArray(r);
const bounded = (r: unknown, max: number): r is number => typeof r === 'number' && Number.isInteger(r) && r >= 0 && r <= max;
/** Validate durable IDs and all counters; unknown schemas are never silently overwritten. */
export function normalizeCultivation(raw: unknown, level: number, day: number): CultivationState | null {
  if (raw === undefined) return initialCultivation(level, day);
  if (!record(raw) || raw.version !== 1 || !MANUALS.some(m => m.id === raw.main) || !record(raw.manuals) || !record(raw.inventory)) return null;
  if (Object.keys(raw.manuals).some(id => !MANUALS.some(m => m.id === id)) || Object.keys(raw.inventory).some(id => !ITEMS.some(i => i.id === id))) return null;
  for (const m of MANUALS) if (raw.manuals[m.id] !== null && !bounded(raw.manuals[m.id], 100)) return null;
  if (raw.manuals.breath === null || raw.manuals[raw.main as string] === null) return null;
  for (const i of ITEMS) if (!bounded(raw.inventory[i.id], 99)) return null;
  if (!bounded(raw.mana, maxMana(level)) || !bounded(raw.preparation, 100) || !bounded(raw.failures, 5) || !bounded(raw.lightSteps, 2)
    || !bounded(raw.medicineUses, 3) || !bounded(raw.medicineDay, day) || raw.medicineDay < 1 || typeof raw.trialPassed !== 'boolean') return null;
  if (raw.trial !== null && (!record(raw.trial) || !bounded(raw.trial.stage, 2) || !bounded(raw.trial.composure, raw.trial.stage) || raw.trialPassed || level !== 9)) return null;
  if (level >= MAX_REALM && !raw.trialPassed) return null;
  return structuredClone(raw) as unknown as CultivationState;
}
export const mastery = (g: GameState) => g.cultivation.manuals[g.cultivation.main] ?? 0;
export function breakthroughPreview(g: GameState, strategy: 'steady' | 'risk' = 'steady', aid = false) {
  const c = g.cultivation, foundation = g.realmLevel === 9, steady = strategy === 'steady';
  const qi = breakthroughCost(g.realmLevel), mana = 6 + g.realmLevel * 2, energy = foundation ? 25 : 18;
  const minutes = foundation ? (steady ? 360 : 240) : (steady ? 240 : 120);
  const first = g.realmLevel === 0 && steady;
  const chance = first ? 1 : Math.min(.97, Math.max(.1, .58 + g.health * .0015 + g.insight * .004 - g.stress * .0015 + c.preparation * .002
    + c.failures * .04 + (steady ? .06 : -.08) + (aid ? .08 : 0) + (c.main === 'insight' && mastery(g) >= 20 ? .04 : 0)));
  const reason = g.realmLevel >= MAX_REALM ? '已达本版最高境界：筑基初期。' : g.activeOrder ? '请先处理当前配送。' : g.gameOver ? '本世已结束。'
    : g.pendingEventId || c.trial ? '请先处理待完成的故事或试炼。' : g.qi < qi ? `需要 ${qi} 灵气。` : g.energy < energy ? `需要 ${energy} 精力。`
    : c.mana < mana ? `需要 ${mana} 法力，请先调息。` : g.health < (foundation ? 60 : 40) ? `健康至少 ${foundation ? 60 : 40}。`
    : (steady && g.stress > 70) ? '稳妥突破需要压力不超过 70。' : steady && c.preparation < 50 ? '稳妥突破需要至少 50 准备度。'
    : mastery(g) < (steady || foundation ? 8 + g.realmLevel * 4 : 0) ? `主修熟练度需要 ${8 + g.realmLevel * 4}。`
    : foundation && !c.trialPassed ? '请先完成内景筑基试炼。' : aid && c.inventory.talisman < 1 ? '没有护脉符，请取消勾选或先获取。' : null;
  return { qi, mana, energy, minutes, chance, reason, first, foundation };
}
export function timePreview(g: GameState, minutes: number): string {
  const total = g.minute + minutes, day = g.day + Math.floor(total / 1440), time = total % 1440;
  return `预计第 ${day} 天 ${String(Math.floor(time / 60)).padStart(2, '0')}:${String(time % 60).padStart(2, '0')} 结束${day > g.day ? ' · 跨日结算' : ''}${day > g.day && day >= g.rentDueDay ? ' · 期间到房租日' : ''}`;
}
export const TRIAL_STAGES = [
  { title: '听息', text: '闭目之后，外卖提示音仍在识海回荡。你需要分清催促与自己的呼吸。', steady: '放慢呼吸，辨认真正的节律', rush: '强压杂念，先闯过这一关' },
  { title: '守心', text: '房租、修为与未赴的约定同时浮现。筑基不是忘掉人间，而是知道自己为何留下。', steady: '承认牵挂，将心神重新收束', rush: '耗费法力，暂时封住纷扰' },
  { title: '合流', text: '散乱的周天渐渐汇成一线。最后一步，需要让力量服从意志。', steady: '循序合流，稳稳完成试炼', rush: '一鼓作气冲开最后屏障' },
] as const;
export interface CultivationPlan { minutes: number; energy: number; mana: number; money: number; reason: string | null }
export function cultivationPlan(g: GameState, cmd: CultivationCommand): CultivationPlan {
  const c = g.cultivation;
  let minutes = 0, energy = 0, mana = 0, money = 0, reason: string | null = null;
  if (g.gameOver || g.pendingEventId || g.activeOrder) reason = '请先处理配送或故事；本世结束后不能继续修行。';
  if (c.trial && !['trial-choice', 'trial-exit'].includes(cmd.type)) reason = '请完成或退出内景试炼。';
  switch (cmd.type) {
    case 'meditate': if (![1,3].includes(cmd.hours)) reason = '无效的修炼时长。'; minutes = cmd.hours * 60; energy = cmd.hours * 8; break;
    case 'study': minutes = 90; energy = 7; break;
    case 'train': minutes = 60; energy = 8; if (mastery(g) >= 100) reason = '当前功法已熟练。'; break;
    case 'breathe': minutes = 30; energy = 2; break;
    case 'prepare': minutes = 60; energy = 6; mana = 4; if (c.preparation >= 100) reason = '准备度已满。'; break;
    case 'gather': minutes = 30; energy = 4; if (c.inventory.herb >= 99) reason = '青息草已达持有上限。'; break;
    case 'learn': { const m = MANUALS.find(m => m.id === cmd.id); minutes = 60; energy = 6; money = m?.cost ?? 0; if (!m || c.manuals[cmd.id] !== null) reason = '功法不存在或已学会。'; break; }
    case 'equip': minutes = 45; energy = 4; if (!MANUALS.some(m => m.id === cmd.id) || c.manuals[cmd.id] == null || c.main === cmd.id) reason = '需要选择已学会的其他功法。'; break;
    case 'buy': { const i = ITEMS.find(i => i.id === cmd.id); minutes = 10; money = i?.cost ?? 0; if (!i || c.inventory[cmd.id] >= 99) reason = '物品无效或已达持有上限。'; break; }
    case 'use': minutes = 15; if (!['tea','pill'].includes(cmd.id) || !c.inventory[cmd.id]) reason = '没有这种药食。'; if (c.medicineDay === g.day && c.medicineUses >= 3) reason = '今日已使用三次药食，请休息或调息。'; break;
    case 'craft': minutes = 30; energy = 4; mana = cmd.id === 'talisman' ? 6 : 0;
      if (!['pill','talisman'].includes(cmd.id) || c.inventory[cmd.id] >= 99) reason = '配方无效或已达上限。';
      else if (cmd.id === 'pill' ? c.inventory.herb < 2 : c.inventory.paper < 2 || c.inventory.herb < 1) reason = '材料不足。';
      else if (cmd.id === 'talisman' && (c.main !== 'ward' || mastery(g) < 20)) reason = '需要主修五行符解且熟练度达到 20。'; break;
    case 'light-steps': minutes = 5; mana = 8; if (c.main !== 'wind' || mastery(g) < 20 || c.lightSteps > 0) reason = '需轻身行气诀熟练度 20，且没有未用完的轻身术。'; break;
    case 'breakthrough': { const p = breakthroughPreview(g, cmd.strategy, cmd.aid); ({ minutes, energy, mana } = p); reason = reason ?? p.reason; if (!['steady','risk'].includes(cmd.strategy) || typeof cmd.aid !== 'boolean') reason = '无效突破方式。'; break; }
    case 'trial-start': minutes = 30; energy = 4; mana = 4; if (g.realmLevel !== 9 || c.trial || c.trialPassed || g.health < 60) reason = '炼气九层、健康至少 60，且未完成试炼时可以进入。'; break;
    case 'trial-exit': minutes = 5; if (!c.trial) reason = '当前没有内景试炼。'; break;
    case 'trial-choice': minutes = cmd.choice === 'steady' ? 30 : 15; energy = cmd.choice === 'steady' ? 4 : 8; mana = cmd.choice === 'steady' ? 4 : 8;
      if (!c.trial || c.trial.stage !== cmd.stage || !['steady','rush'].includes(cmd.choice)) reason = '该阶段已经处理或选择无效。'; break;
    default: reason = '未知修行命令。';
  }
  if (g.energy < energy || c.mana < mana || g.money < money && money > 0) reason = reason ?? '精力、法力或金钱不足。';
  return { minutes, energy, mana, money, reason };
}
function log(g: GameState, text: string): GameState {
  return { ...g, log: [{ id: `cult-${g.day}-${g.minute}-${text}`, day: g.day, minute: g.minute, text, tone: 'mystic' as const }, ...g.log].slice(0, 80) };
}
function finish(g: GameState): GameState {
  const c = g.cultivation;
  return { ...g, energy: Math.max(0, Math.min(100, g.energy)), health: Math.max(0, Math.min(100, g.health)), stress: Math.max(0, Math.min(100, g.stress)),
    qi: Math.max(0, Math.min(9999, g.qi)), insight: Math.max(0, Math.min(99, g.insight)),
    cultivation: { ...c, mana: Math.max(0, Math.min(maxMana(g.realmLevel), c.mana)), preparation: Math.min(100, c.preparation) } };
}
const nightFactor = (minute: number) => minute < 360 ? 1.65 : minute < 540 ? 1.15 : minute < 1200 ? .85 : 1.4;
export function cultivationGain(g: GameState, minutes: number): number {
  // Preview and settlement integrate every minute across phase boundaries, never wall-clock time.
  let weight = 0; for (let i = 0; i < minutes; i++) weight += nightFactor((g.minute + i) % 1440) / 60;
  return Math.max(1, Math.round((5 + g.insight * .18 + (g.flags.small_cycle_notes === true ? 2 : 0) + mastery(g) * .025) * weight));
}
export function runCultivation(g: GameState, cmd: CultivationCommand, advance: (g: GameState, minutes: number) => GameState, checkpoint: (g: GameState) => GameState = g => g): GameState {
  const plan = cultivationPlan(g, cmd); if (plan.reason) return g;
  let c: CultivationState = structuredClone(g.cultivation);
  let next = { ...g, cultivation: c, energy: g.energy - plan.energy, money: g.money - plan.money };
  c.mana -= plan.mana;
  if (cmd.type === 'breakthrough') { next.qi -= breakthroughCost(g.realmLevel); if (cmd.aid) c.inventory.talisman--; }
  if (cmd.type === 'use') { c.inventory[cmd.id]--; c.medicineUses = (c.medicineDay === g.day ? c.medicineUses : 0) + 1; c.medicineDay = g.day; }
  if (cmd.type === 'craft') { c.inventory.herb -= cmd.id === 'pill' ? 2 : 1; if (cmd.id === 'talisman') c.inventory.paper -= 2; }
  if (cmd.type === 'meditate') {
    // One-hour checkpoints prevent long cultivation from awarding anything after a fatal midnight.
    next = { ...next, energy: g.energy };
    for (let i = 0; i < cmd.hours; i++) {
      const gain = cultivationGain(next, 60);
      next = advance({ ...next, energy: next.energy - 8 }, 60);
      if (next.gameOver) return log(next, '闭关因身体崩溃中止，未结算后续修行。');
      next = finish({ ...next, qi: next.qi + gain, stress: next.stress - (c.main === 'breath' ? 4 : 2) });
      next = checkpoint(log(next, `吐纳一小时完成：灵气 +${gain}，精力 -8；跨时段按实际分钟计算。`));
      if (next.pendingEventId || next.gameOver) return next;
    }
    return next;
  }
  next = advance(next, plan.minutes); if (next.gameOver) return log(next, '修行因身体崩溃中止；没有获得后续奖励。');
  c = next.cultivation;
  const gainMastery = (n: number) => { c.manuals[c.main] = Math.min(100, (c.manuals[c.main] ?? 0) + n); };
  let text = '';
  switch (cmd.type) {
    case 'study': next.insight++; gainMastery(c.main === 'insight' ? 8 : 4); text = '整理修炼笔记：悟性 +1，主修熟练度提升。'; break;
    case 'train': gainMastery(8); text = '行功一小时：主修功法熟练度 +8。'; break;
    case 'breathe': c.mana += c.main === 'breath' ? 20 : 15; next.stress -= 4; text = '调息半小时：恢复法力，压力 -4。不消耗突破用的灵气。'; break;
    case 'prepare': c.preparation += 25; text = '稳固周天：突破准备度 +25。'; break;
    case 'gather': c.inventory.herb++; text = '辨识与整理药草：获得青息草 ×1。'; break;
    case 'learn': c.manuals[cmd.id] = 0; text = `研习《${MANUALS.find(m => m.id === cmd.id)!.name}》入门，尚未设为主修。`; break;
    case 'equip': c.main = cmd.id; c.lightSteps = 0; text = '重新行功，主修功法已更换；旧熟练度保留，未用完的轻身术解除。'; break;
    case 'buy': c.inventory[cmd.id]++; text = `购入${ITEMS.find(i => i.id === cmd.id)!.name} ×1。`; break;
    case 'craft': c.inventory[cmd.id]++; text = `炼制完成：${cmd.id === 'pill' ? '归元散' : '护脉符'} ×1，材料已消耗。`; break;
    case 'use': if (cmd.id === 'tea') { next.stress -= 8; c.preparation += 10; } else { next.health += 8; c.mana += 12; } text = `使用${cmd.id === 'tea' ? '清心茶' : '归元散'}，药食次数记在使用当日。`; break;
    case 'light-steps': c.lightSteps = 2; text = '轻身术生效：接下来两次成功骑行精力消耗 -3（至少消耗 1）。仍需足够电量与耐久。'; break;
    case 'breakthrough': {
      const p = breakthroughPreview(g, cmd.strategy, cmd.aid);
      // Only the committed attempt consumes RNG; preview and rejected attempts never do.
      let x = next.seed | 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
      next.seed = x >>> 0 || 0x9e3779b9;
      if (next.seed / 4294967296 < p.chance) {
        next.realmLevel++; next.health += 5; next.stress -= 8; c.preparation = 0; c.failures = 0;
        text = `突破成功：${realmName(next.realmLevel)}。功法与人间牵挂仍在，仙途继续。`;
      } else {
        next.qi += Math.floor(p.qi / 2); next.health -= cmd.strategy === 'steady' ? 6 : 14; next.stress += 10;
        c.failures = Math.min(5, c.failures + 1); c.preparation = Math.floor(c.preparation / 2);
        text = `突破未成：退回 ${Math.floor(p.qi / 2)} 灵气，境界不下降；本瓶颈经验 +1。先调息休养再试。`;
      }
      break;
    }
    case 'trial-start': c.trial = { stage: 0, composure: 0 }; text = '进入内景筑基试炼：只在心中行走，不移动地图位置。'; break;
    case 'trial-exit': c.trial = null; text = '主动退出内景试炼，已投入的时间不返还；可以准备后重新尝试。'; break;
    case 'trial-choice': {
      const trial = c.trial!; trial.composure += cmd.choice === 'steady' ? 1 : 0;
      if (trial.stage < 2) { trial.stage++; text = '内景向深处展开，下一阶段已自动记录。'; }
      else { c.trialPassed = trial.composure >= 2; c.trial = null; text = c.trialPassed ? '筑基试炼通过。现在可以准备突破筑基；不会自动扣除突破资源。' : '内景尚未稳固：至少两次循序守心才能通过，可以休养后再试。'; }
      break;
    }
  }
  return log(finish(next), `${text}（${plan.minutes} 分钟）`);
}
