import { NPC_MAP } from './npcs';
import type { GameState, NpcId, NumericStatKey } from './types';

export type PlayMode = 'classic' | 'generative';
export type SceneFocus = 'city' | 'cultivation' | 'social';
export type ApproachId = 'help' | 'observe' | 'work' | 'rest' | 'investigate' | 'practice' | 'listen' | 'share-meal' | 'depart';
export interface SceneRequest { id: string; focus: SceneFocus; npcId?: NpcId; intent: string }
export interface SceneChoice { id: string; label: string; result: string; approach: ApproachId }
export interface PlayScene {
  id: string; source: 'ai' | 'authored'; focus: SceneFocus; npcId?: NpcId;
  title: string; description: string; choices: SceneChoice[];
}
export interface SceneMemory {
  title: string; choice: string; result: string; source: 'ai' | 'authored'; day: number;
}
export interface PlayState {
  mode: PlayMode; sequence: number; pending: SceneRequest | null;
  scene: PlayScene | null; history: SceneMemory[];
}
export interface ActionProfile {
  title: string; minutes: number; energy: number; money: number;
  gains: Partial<Record<NumericStatKey, number>>;
  relation?: { affinity?: number; trust?: number; bond?: number };
}

export const PROFILES: Record<ApproachId, ActionProfile> = {
  help: { title: '停下来帮忙', minutes: 25, energy: 5, money: 0, gains: { karma: 1 }, relation: { bond: 1 } },
  observe: { title: '观察与记录', minutes: 15, energy: 2, money: 0, gains: { stress: -1 } },
  work: { title: '做一份零工', minutes: 30, energy: 6, money: 0, gains: { money: 12 } },
  rest: { title: '歇一歇', minutes: 20, energy: 0, money: 0, gains: { energy: 8, stress: -3 } },
  investigate: { title: '调查异常', minutes: 40, energy: 8, money: 0, gains: { qi: 3, insight: 1, darkQi: 1 } },
  practice: { title: '稳定吐纳', minutes: 60, energy: 8, money: 0, gains: { qi: 5 } },
  listen: { title: '认真倾听', minutes: 20, energy: 2, money: 0, gains: { stress: -2 }, relation: { affinity: 1, trust: 1 } },
  'share-meal': { title: '一起吃饭', minutes: 30, energy: 0, money: 18, gains: { energy: 18, stress: -4 }, relation: { affinity: 2 } },
  depart: { title: '告辞离开', minutes: 5, energy: 0, money: 0, gains: {} },
};
export const FOCUS_LABELS: Record<SceneFocus, string> = { city: '城市日常', cultivation: '修炼奇遇', social: '熟人故事' };
export const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const exactKeys = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).every((key) => keys.includes(key)) && keys.every((key) => key in v);
export function sceneText(value: unknown, max: number, min = 1): string | null {
  if (typeof value !== 'string' || value.length > max || /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) return null;
  const text = value.trim();
  return text.length >= min ? text : null;
}
export function initialPlay(): PlayState { return { mode: 'classic', sequence: 0, pending: null, scene: null, history: [] }; }
export function allowedApproaches(focus: SceneFocus): ApproachId[] {
  if (focus === 'social') return ['listen', 'help', 'share-meal', 'depart'];
  if (focus === 'cultivation') return ['practice', 'observe', 'investigate', 'rest', 'depart'];
  return ['help', 'observe', 'work', 'rest', 'investigate', 'depart'];
}
export function validRequest(value: unknown, game: GameState): SceneRequest | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !/^encounter-[1-9]\d{0,8}$/.test(value.id)) return null;
  if (!['city', 'cultivation', 'social'].includes(String(value.focus))) return null;
  const focus = value.focus as SceneFocus;
  const npcId = value.npcId as NpcId | undefined;
  if (focus === 'social' && (!npcId || !NPC_MAP.has(npcId) || !game.relationships[npcId]?.met || game.relationships[npcId].route === 'estranged')) return null;
  return { id: value.id, focus, ...(focus === 'social' ? { npcId } : {}), intent: typeof value.intent === 'string' ? value.intent.trim().slice(0, 200) : '' };
}

/** Provider text never carries executable effects, routes, flags, numeric rewards or IDs. */
export function validateScene(raw: unknown, request: SceneRequest, source: PlayScene['source'] = 'ai'): PlayScene | null {
  if (!isRecord(raw) || !exactKeys(raw, ['title', 'description', 'choices'])) return null;
  const title = sceneText(raw.title, 60, 2), description = sceneText(raw.description, 1200, 10);
  if (!title || !description || !Array.isArray(raw.choices) || raw.choices.length < 2 || raw.choices.length > 4) return null;
  const choices: SceneChoice[] = [];
  const seen = new Set<string>();
  for (const item of raw.choices) {
    if (!isRecord(item) || !exactKeys(item, ['label', 'result', 'approach'])) return null;
    const label = sceneText(item.label, 80, 2), result = sceneText(item.result, 400, 5);
    const approach = item.approach as ApproachId;
    if (!label || !result || !allowedApproaches(request.focus).includes(approach) || seen.has(approach)) return null;
    seen.add(approach);
    // The engine always supplies its own unconditional exit option.
    if (approach !== 'depart') choices.push({ id: `option-${choices.length}`, label, result, approach });
  }
  if (!choices.length) return null;
  choices.push({ id: 'depart', label: '到此为止，回到自己的日常', result: '你礼貌告辞，回到熟悉的城市街道。', approach: 'depart' });
  return { id: request.id, focus: request.focus, ...(request.npcId ? { npcId: request.npcId } : {}), source, title, description, choices };
}

interface AuthoredSeed { title: string; description: string; choices: Omit<SceneChoice, 'id'>[] }
const AUTHORED: Record<SceneFocus, AuthoredSeed[]> = {
  city: [
    { title: '收摊前的一盏灯', description: '小吃街快收摊了，店主还在搬被风吹倒的桌椅。街口有人需要搬一箱餐具，旁边的石凳则难得空着。今天剩下的时间要留给谁？', choices: [
      { label: '帮店主收拾桌椅', result: '你扶稳桌脚，和店主一起把门口收拾干净。', approach: 'help' },
      { label: '接下搬餐具的小零工', result: '对方按约定结清工钱，你又攒下一点生活费。', approach: 'work' },
      { label: '坐在石凳上歇一歇', result: '你看着店铺陆续收好东西，让紧绷的肩膀松下来。', approach: 'rest' },
    ] },
    { title: '一张看不懂的路线图', description: '骑手休息点的桌上留着一张路线图，几条小巷被反复圈起。旁边的送货员正在清点货物，抬头问你有没有空。你既能追究图上的秘密，也能先照顾现实。', choices: [
      { label: '沿着圈出的巷子调查', result: '你发现墙面有微弱的灵气残痕，记下位置便退了回来。', approach: 'investigate' },
      { label: '帮送货员完成一份零工', result: '你把货物搬到约定地点，收到了说好的报酬。', approach: 'work' },
      { label: '只观察地图，不涉险', result: '你记下几条路的走向，决定不急着下结论。', approach: 'observe' },
    ] },
  ],
  cultivation: [
    { title: '楼群之间的回声', description: '楼群间的风忽然有了节律，与你平时吐纳的呼吸隐约呼应。墙边一点微光时隐时现。也许是机缘，也许只是你过于疲倦。', choices: [
      { label: '守住呼吸，完成一轮吐纳', result: '你没有贪多，只让气息沿熟悉的经脉缓缓走完。', approach: 'practice' },
      { label: '调查墙边的微光', result: '你看清了残留的灵气纹路，也沾上一丝凉意。', approach: 'investigate' },
      { label: '先休息，放下执念', result: '你放松肩颈，不再勉强捕捉每一缕陌生气息。', approach: 'rest' },
    ] },
    { title: '夹在旧书里的练习', description: '一本旧书里夹着一页无署名的呼吸练习。它没有许诺长生，只提醒读者注意身体。你想起修行也可以是一件不需要逞强的小事。', choices: [
      { label: '按自己的功法稳定修炼', result: '你沿用已经学会的功法，把这页纸当作提醒。', approach: 'practice' },
      { label: '记下感受，不急着尝试', result: '你整理了当下的感受，决定先把疑问留着。', approach: 'observe' },
      { label: '合上书，好好休息', result: '你合上书，给身体留下一段安静的空白。', approach: 'rest' },
    ] },
  ],
  social: [
    { title: '留给熟人的空白', description: '你与熟人见面，对方问起最近的生活。没有谁非得揭开秘密，也没有谁必须给这段关系取一个新的名字。只是这一次，你们都愿意停下脚步。', choices: [
      { label: '认真听完对方的近况', result: '你没有急着给建议，对方也慢慢把话说完整了。', approach: 'listen' },
      { label: '一起吃一顿普通的饭', result: '你们在小店坐下，聊完琐碎的近况再各自出发。', approach: 'share-meal' },
      { label: '帮忙处理手边的小事', result: '你们一起把手边的事做完，没有许下过大的承诺。', approach: 'help' },
    ] },
    { title: '没有发出去的消息', description: '熟人拿起手机又放下，似乎想说些什么，最终只聊起最近遇到的一点麻烦。你可以耐心倾听，也可以用实际行动表示支持，不必追问不愿提及的过去。', choices: [
      { label: '不追问，陪对方慢慢说', result: '你留下足够的安静，对方终于把眼前的烦恼说了出来。', approach: 'listen' },
      { label: '先把眼前的小麻烦解决', result: '你们分头把事情理顺，最后一起松了口气。', approach: 'help' },
      { label: '找家小店吃饭，再谈近况', result: '一顿热饭让谈话平和下来，谁也没有被迫做出决定。', approach: 'share-meal' },
    ] },
  ],
};
export function authoredScene(request: SceneRequest, seed: number, history: SceneMemory[]): [PlayScene, number] {
  let x = seed | 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  const nextSeed = x >>> 0 || 0x9e3779b9;
  const entries = AUTHORED[request.focus];
  const fresh = entries.filter((entry) => !history.slice(-1).some((memory) => memory.title === entry.title));
  const pool = fresh.length ? fresh : entries;
  const raw = pool[Math.floor(nextSeed / 4294967296 * pool.length)];
  const scene = validateScene(raw, request, 'authored');
  if (!scene) throw new Error('Invalid authored exploration content');
  return [scene, nextSeed];
}

export function profileSummary(approach: ApproachId, withNpc = false): string {
  const p = PROFILES[approach];
  const names: Partial<Record<NumericStatKey, string>> = { money: '金钱', energy: '精力', stress: '压力', karma: '因果', qi: '灵气', insight: '悟性', darkQi: '阴气' };
  const parts = [`${p.minutes} 分钟`, ...(p.money ? [`¥${p.money}`] : []), ...(p.energy ? [`精力 -${p.energy}`] : [])];
  for (const [key, value] of Object.entries(p.gains)) parts.push(`${names[key as NumericStatKey] ?? key} ${value > 0 ? '+' : ''}${value}`);
  if (withNpc && p.relation) {
    const names = { affinity: '好感', trust: '信任', bond: '羁绊' };
    for (const [key, value] of Object.entries(p.relation)) parts.push(`${names[key as keyof typeof names]} +${value}`);
  }
  return parts.join(' · ');
}
