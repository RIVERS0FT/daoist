import type { NpcDefinition, NpcId, NpcRelationship, NpcRoute, RelationshipField } from './types';

export const NPCS: NpcDefinition[] = [
  {
    id: 'lin_xiaoman',
    name: '林小满',
    role: '东城医院夜班护士',
    shortBio: '习惯替所有人留一盏灯，却很少有人问她累不累。',
    storyHint: '她经常点很晚的夜宵。医院后门，是你们最常见面的地方。',
  },
  {
    id: 'zhou_ye',
    name: '周野',
    role: '同站骑手',
    shortBio: '嘴上什么都无所谓，真遇到事却总是第一个停车。',
    storyHint: '雨天、爆单和没电的时候，最容易看清一个同行。',
  },
  {
    id: 'su_qinghe',
    name: '苏青禾',
    role: '旧书店店员',
    shortBio: '认识许多绝版旧书，也认识一些不该存在于现代城市里的字。',
    storyHint: '她似乎比你更早知道灵气正在回来。',
  },
  {
    id: 'wang_shu',
    name: '王叔',
    role: '老王牛肉面老板',
    shortBio: '后厨永远很吵，但你饿着肚子时，他总能看出来。',
    storyHint: '有些关系不是修来的，是一碗又一碗热汤攒出来的。',
  },
  {
    id: 'xu_yao',
    name: '许遥',
    role: '自由摄影记者',
    shortBio: '追着城市怪谈跑了很多年，终于拍到了不该存在的东西。',
    storyHint: '她想知道真相，而你得决定真相应该属于谁。',
  },
];

export const NPC_MAP = new Map(NPCS.map((npc) => [npc.id, npc]));

const BASE_RELATIONSHIP: NpcRelationship = {
  met: false,
  affinity: 0,
  trust: 0,
  bond: 0,
  romance: 0,
  route: 'unmet',
  lastSeenDay: 0,
};

const clamp = (value: number) => Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));

export function createInitialRelationships(): Record<NpcId, NpcRelationship> {
  return Object.fromEntries(NPCS.map((npc) => [npc.id, { ...BASE_RELATIONSHIP }])) as Record<NpcId, NpcRelationship>;
}

function normalizeRelationship(input?: Partial<NpcRelationship>): NpcRelationship {
  return {
    met: Boolean(input?.met),
    affinity: clamp(input?.affinity ?? 0),
    trust: clamp(input?.trust ?? 0),
    bond: clamp(input?.bond ?? 0),
    romance: clamp(input?.romance ?? 0),
    route: (input?.route ?? (input?.met ? 'acquaintance' : 'unmet')) as NpcRoute,
    lastSeenDay: Math.max(0, Math.round(input?.lastSeenDay ?? 0)),
  };
}

export function mergeRelationships(input?: Partial<Record<NpcId, Partial<NpcRelationship>>> | null): Record<NpcId, NpcRelationship> {
  const base = createInitialRelationships();
  for (const npc of NPCS) base[npc.id] = normalizeRelationship(input?.[npc.id]);
  return base;
}

export function clampRelationships(input: Record<NpcId, NpcRelationship>): Record<NpcId, NpcRelationship> {
  return mergeRelationships(input);
}

export function changeRelationship(
  input: Record<NpcId, NpcRelationship>,
  npcId: NpcId,
  field: RelationshipField,
  delta: number,
  day: number,
): Record<NpcId, NpcRelationship> {
  const current = input[npcId] ?? { ...BASE_RELATIONSHIP };
  const next: NpcRelationship = {
    ...current,
    met: true,
    route: current.route === 'unmet' ? 'acquaintance' : current.route,
    [field]: clamp(current[field] + delta),
    lastSeenDay: day,
  };
  return { ...input, [npcId]: next };
}

export function setRelationshipRoute(
  input: Record<NpcId, NpcRelationship>,
  npcId: NpcId,
  route: NpcRoute,
  day: number,
): Record<NpcId, NpcRelationship> {
  const current = input[npcId] ?? { ...BASE_RELATIONSHIP };
  return { ...input, [npcId]: { ...current, met: true, route, lastSeenDay: day } };
}

export function relationshipLabel(rel: NpcRelationship): string {
  if (!rel.met) return '尚未相遇';
  const routeLabels: Partial<Record<NpcRoute, string>> = {
    friend: '朋友',
    'close-friend': '挚友',
    romance: '恋人',
    mentor: '同道',
    partner: '伙伴',
    family: '家人般的关系',
    estranged: '渐行渐远',
  };
  if (routeLabels[rel.route]) return routeLabels[rel.route]!;
  const score = rel.affinity + rel.trust + rel.bond;
  if (score >= 150) return '非常亲近';
  if (score >= 95) return '熟悉';
  if (score >= 45) return '认识';
  return '点头之交';
}

export function relationshipScore(rel: NpcRelationship): number {
  return Math.round(rel.affinity * 0.3 + rel.trust * 0.4 + rel.bond * 0.3);
}
