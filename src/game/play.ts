import { advanceTime, createInitialState, migrateGameState } from './engine';
import { changeRelationship } from './npcs';
import { authoredScene, initialPlay, isRecord, PROFILES, sceneText, validRequest, validateScene } from './generation';
import type { PlayMode, PlayState, SceneFocus, SceneMemory, SceneRequest } from './generation';
import type { GameState, NpcId, NumericStatKey, RelationshipField } from './types';

export interface PlaySession { version: 3; game: GameState; play: PlayState }
export function createSession(seed?: number): PlaySession { return { version: 3, game: createInitialState(seed), play: initialPlay() }; }
export function sessionBusy(s: PlaySession): boolean { return Boolean(s.game.gameOver || s.game.pendingEventId || s.play.pending || s.play.scene); }
function log(game: GameState, text: string, id: string): GameState {
  return { ...game, log: [{ id, day: game.day, minute: game.minute, text, tone: 'normal' as const }, ...game.log].slice(0, 80) };
}
const integer = (value: unknown, fallback: number, max = 999999999) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(0, Math.floor(value))) : fallback;

/** v3 wraps the unchanged, published v2 world; older saves keep all authored progress. */
export function migrateSession(raw: unknown): PlaySession | null {
  if (!isRecord(raw)) return null;
  const world = raw.version === 3 ? raw.game : raw;
  const game = migrateGameState(world);
  if (!game || !Number.isInteger(game.day) || game.day < 1 || !Number.isInteger(game.minute) || game.minute < 0 || game.minute >= 1440 || !Array.isArray(game.log) || !isRecord(game.flags)) return null;
  if (raw.version !== 3) return { version: 3, game, play: initialPlay() };
  const p = isRecord(raw.play) ? raw.play : {};
  const play = initialPlay();
  play.mode = p.mode === 'generative' ? 'generative' : 'classic';
  play.sequence = integer(p.sequence, 0);
  if (Array.isArray(p.history)) {
    play.history = p.history.slice(-12).flatMap((entry): SceneMemory[] => {
      if (!isRecord(entry)) return [];
      const title = sceneText(entry.title, 60), choice = sceneText(entry.choice, 80), result = sceneText(entry.result, 400);
      return title && choice && result ? [{ title, choice, result, source: entry.source === 'ai' ? 'ai' : 'authored', day: integer(entry.day, game.day) }] : [];
    });
  }
  if (isRecord(p.scene)) {
    const request = validRequest({ ...p.scene, intent: '' }, game);
    if (request && request.id === `encounter-${play.sequence}` && Array.isArray(p.scene.choices)) {
      const items = p.scene.choices.filter(isRecord);
      const choices = (items.length > 4 ? items.filter((c) => c.approach !== 'depart') : items).map((c) => ({ label: c.label, result: c.result, approach: c.approach }));
      play.scene = validateScene({ title: p.scene.title, description: p.scene.description, choices }, request, p.scene.source === 'ai' ? 'ai' : 'authored');
    }
  }
  const pending = validRequest(p.pending, game);
  if (!play.scene && pending?.id === `encounter-${play.sequence}`) play.pending = pending;
  const session: PlaySession = { version: 3, game, play };
  if (game.gameOver || game.pendingEventId || game.activeOrder) return { ...session, play: { ...play, pending: null, scene: null } };
  // A browser reload never repeats the paid exploration or silently reissues an AI call.
  if (play.pending) return fallbackExploration(session);
  return session;
}

export function beginExploration(s: PlaySession, focus: SceneFocus, npcId?: NpcId, intent = ''): PlaySession {
  if (sessionBusy(s) || s.game.activeOrder || s.play.sequence >= 999999999 || s.game.energy < 2) return s;
  const request = validRequest({ id: `encounter-${s.play.sequence + 1}`, focus, npcId, intent }, s.game);
  if (!request) return s;
  const game = advanceTime({ ...s.game, energy: s.game.energy - 2 }, 15);
  return {
    ...s,
    game: log(game, '你为一段自由奇遇留出时间：15 分钟，精力 -2。', `${request.id}-start`),
    play: { ...s.play, sequence: s.play.sequence + 1, pending: game.gameOver ? null : request },
  };
}
export function fallbackExploration(s: PlaySession): PlaySession {
  if (!s.play.pending || s.play.scene) return s;
  if (s.game.gameOver) return { ...s, play: { ...s.play, pending: null } };
  const [scene, seed] = authoredScene(s.play.pending, s.game.seed, s.play.history);
  return { ...s, game: { ...s.game, seed }, play: { ...s.play, pending: null, scene } };
}
export function receiveGeneratedScene(s: PlaySession, expectedId: string, raw: unknown): PlaySession {
  if (s.play.mode !== 'generative' || s.play.pending?.id !== expectedId || s.game.gameOver || s.game.pendingEventId || s.game.activeOrder) return s;
  const scene = validateScene(raw, s.play.pending);
  return scene ? { ...s, play: { ...s.play, pending: null, scene } } : fallbackExploration(s);
}
export function switchMode(s: PlaySession, mode: PlayMode): PlaySession {
  if (mode !== 'classic' && mode !== 'generative') return s;
  const next = { ...s, play: { ...s.play, mode } };
  // Keep an already generated scene locally playable. Only unresolved network work falls back.
  return next.play.pending ? fallbackExploration(next) : next;
}
export function sceneChoiceBlocked(game: GameState, approach: keyof typeof PROFILES): boolean {
  const p = PROFILES[approach];
  return game.gameOver || game.money < p.money && p.money > 0 || game.energy < p.energy;
}
export function resolveScene(s: PlaySession, choiceId: string): PlaySession {
  if (!s.play.scene || s.play.pending || s.game.gameOver || s.game.pendingEventId) return s;
  const scene = s.play.scene;
  const choice = scene.choices.find((item) => item.id === choiceId);
  if (!choice || sceneChoiceBlocked(s.game, choice.approach)) return s;
  const p = PROFILES[choice.approach];
  // Pay before the clock advances, so rent crossing cannot double-spend the same cash.
  let game = advanceTime({ ...s.game, money: s.game.money - p.money, energy: Math.max(0, s.game.energy - p.energy) }, p.minutes);
  if (!game.gameOver) {
    for (const [key, delta] of Object.entries(p.gains)) {
      const stat = key as NumericStatKey;
      const min = stat === 'money' ? -9999 : stat === 'karma' ? -99 : 0;
      const max = stat === 'money' ? Number.MAX_SAFE_INTEGER : stat === 'qi' ? 9999 : ['insight', 'karma', 'darkQi'].includes(stat) ? 99 : 100;
      game = { ...game, [stat]: Math.min(max, Math.max(min, game[stat] + delta)) };
    }
    if (p.gains.money) game = { ...game, totalIncome: game.totalIncome + p.gains.money };
    const npcId = scene.npcId;
    if (npcId && game.relationships[npcId]?.met && game.relationships[npcId].route !== 'estranged' && p.relation) {
      for (const [key, delta] of Object.entries(p.relation)) {
        game = { ...game, relationships: changeRelationship(game.relationships, npcId, key as RelationshipField, delta, game.day) };
      }
    }
  }
  const result = game.gameOver ? '身体没能支撑到行动完成，这段奇遇到此中止。' : choice.result;
  game = log(game, `${scene.source === 'ai' ? 'AI 奇遇' : '经典奇遇'}「${scene.title}」：${result}`, `${scene.id}-result`);
  const memory: SceneMemory = { title: scene.title, choice: choice.label, result, source: scene.source, day: game.day };
  return { ...s, game, play: { ...s.play, scene: null, pending: null, history: [...s.play.history, memory].slice(-12) } };
}

export function generationPayload(s: PlaySession) {
  const request = s.play.pending;
  if (!request) return null;
  const npcId = request.npcId;
  const rel = npcId ? s.game.relationships[npcId] : undefined;
  return {
    protocol: 1, type: 'scene',
    context: {
      focus: request.focus, intent: request.intent, day: s.game.day, minute: s.game.minute,
      weather: s.game.weather, realmLevel: s.game.realmLevel,
      ...(npcId && rel ? { npc: { id: npcId, route: rel.route, affinity: rel.affinity, trust: rel.trust, bond: rel.bond } } : {}),
      memories: s.play.history.slice(-4).map(({ title, choice, result }) => ({ title, choice, result })),
    },
  };
}
