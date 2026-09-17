import { create } from 'zustand';
import { normalizeRelayEndpoint, persistAiSettings, readAiSettings, requestScene, RequestGate, testAiConnection } from './ai';
import type { AiSettings } from './ai';
import { resolveEventChoice, runAction, selectEnding, socializeNpc } from './engine';
import { beginExploration, createSession, fallbackExploration, migrateSession, receiveGeneratedScene, resolveScene, sessionBusy, switchMode } from './play';
import type { PlaySession } from './play';
import { loadGame, saveGame } from './storage';
import type { PlayMode, PlayState, SceneFocus } from './generation';
import type { GameAction, GameState, NpcId } from './types';

interface GameStore {
  game: GameState; play: PlayState; hydrated: boolean; loadBlocked: boolean;
  aiSettings: AiSettings; aiStatus: 'idle' | 'loading' | 'checking' | 'success' | 'fallback' | 'error';
  aiMessage: string; saveError: string;
  hydrate: () => Promise<void>;
  initAiSettings: (defaultEndpoint?: string) => void;
  configureAi: (settings: AiSettings, relayToken: string) => void;
  setMode: (mode: PlayMode) => void;
  explore: (focus: SceneFocus, npcId?: NpcId, intent?: string) => Promise<void>;
  fallback: () => void;
  testAi: () => Promise<void>;
  act: (action: GameAction) => void;
  socialize: (npcId: NpcId) => void;
  chooseEvent: (choiceId: string) => void;
  chooseEnding: (endingId: string) => void;
  reset: () => Promise<void>;
}
interface Dependencies {
  load: typeof loadGame; save: typeof saveGame;
  generate: typeof requestScene; test: typeof testAiConnection;
}
const defaults: Dependencies = { load: loadGame, save: saveGame, generate: requestScene, test: testAiConnection };

export function createGameStore(overrides: Partial<Dependencies> = {}) {
  const deps = { ...defaults, ...overrides };
  return create<GameStore>((set, get) => {
    const gate = new RequestGate();
    let relayToken = ''; // Session-only relay password. Never part of any persisted state.
    let settingsInitialized = false;
    let hydration: Promise<void> | null = null;
    let saves = Promise.resolve();
    let writeRevision = 0;
    const session = (): PlaySession => ({ version: 3, game: get().game, play: get().play });
    const persist = (value: PlaySession) => {
      const revision = ++writeRevision;
      saves = saves.then(() => deps.save(value)).then(() => { if (revision === writeRevision) set({ saveError: '' }); }).catch(() => {
        if (revision === writeRevision) set({ saveError: '本机存档写入失败。当前进度仍在内存中，请勿关闭页面。' });
      });
      return saves;
    };
    const commit = (value: PlaySession) => {
      if (get().loadBlocked || value.game === get().game && value.play === get().play) return;
      set({ game: value.game, play: value.play });
      void persist(value);
    };
    const canAct = () => get().hydrated && !get().loadBlocked && !sessionBusy(session());
    const fallBack = (message: string) => {
      gate.cancel(); commit(fallbackExploration(session()));
      set({ aiStatus: 'fallback', aiMessage: message });
    };
    const initial = createSession(0x5a17d311);
    return {
      game: initial.game, play: initial.play, hydrated: false, loadBlocked: false,
      aiSettings: { endpoint: '', consent: false }, aiStatus: 'idle', aiMessage: '', saveError: '',
      hydrate: () => {
        if (hydration) return hydration;
        hydration = (async () => {
          try {
            const saved = await deps.load();
            const restored = saved === null ? null : migrateSession(saved);
            if (saved !== null && !restored) {
              set({ hydrated: true, loadBlocked: true, saveError: '无法读取此存档版本，原存档未被覆盖。确认不再需要后可重新开局。' }); return;
            }
            const current = restored ?? session();
            set({ game: current.game, play: current.play, hydrated: true });
            if (restored) await persist(current);
          } catch {
            set({ hydrated: true, loadBlocked: true, saveError: '读取本机存档失败，已暂停写入，避免覆盖旧进度。' });
          }
        })();
        return hydration;
      },
      initAiSettings: (defaultEndpoint = '') => {
        if (!settingsInitialized) { settingsInitialized = true; set({ aiSettings: readAiSettings(defaultEndpoint) }); }
      },
      configureAi: (settings, token) => {
        try {
          const endpoint = normalizeRelayEndpoint(settings.endpoint);
          if (token.length > 256 || /[\r\n]/.test(token)) throw new Error('relay 访问口令格式不正确。');
          fallBack('设置已更新；等待中的奇遇已改用经典剧情。');
          relayToken = token.trim();
          const next = { endpoint, consent: settings.consent === true };
          const stored = persistAiSettings(next);
          set({ aiSettings: next, aiStatus: 'idle', aiMessage: stored ? '配置已保存。访问口令只在本次页面会话有效。' : '配置仅在当前页面有效：浏览器禁用了本机设置存储。' });
        } catch (error) { set({ aiStatus: 'error', aiMessage: error instanceof Error ? error.message : '设置无效。' }); }
      },
      setMode: (mode) => {
        if (!get().hydrated || get().loadBlocked || mode === get().play.mode) return;
        gate.cancel(); commit(switchMode(session(), mode));
        set({ aiStatus: 'idle', aiMessage: mode === 'classic' ? '经典模式：不发送 AI 请求。已有奇遇可继续在本机结算。' : '生成模式：原剧情保留，点击自由奇遇后才会请求 AI。' });
      },
      explore: async (focus, npcId, intent = '') => {
        if (!canAct()) return;
        const before = session();
        const started = beginExploration(before, focus, npcId, intent);
        if (started === before) { set({ aiStatus: 'error', aiMessage: '暂时无法探索：请完成配送，保留至少 2 精力，并选择已认识且未疏远的人物。' }); return; }
        commit(started);
        if (!started.play.pending) return;
        if (started.play.mode === 'classic') {
          commit(fallbackExploration(started)); set({ aiStatus: 'idle', aiMessage: '本段为人工编写的经典奇遇，没有调用 AI。' }); return;
        }
        const ticket = gate.begin();
        set({ aiStatus: 'loading', aiMessage: '正在生成奇遇；等待不推进游戏时间，可以随时改用经典剧情。' });
        try {
          const result = await deps.generate(started, get().aiSettings, relayToken, ticket.signal);
          if (!gate.current(ticket) || get().play.pending?.id !== started.play.pending.id) return;
          if (!result.ok) { fallBack(result.error); return; }
          const next = receiveGeneratedScene(session(), started.play.pending.id, result.data);
          commit(next);
          set(next.play.scene?.source === 'ai' ? { aiStatus: 'success', aiMessage: 'AI 奇遇已生成并写入本地存档。选择的实际影响由本地规则结算。' } : { aiStatus: 'fallback', aiMessage: 'AI 内容未通过规则校验，已替换为经典剧情。' });
        } catch {
          if (gate.current(ticket)) fallBack('AI 服务异常，已使用经典剧情。');
        }
      },
      fallback: () => fallBack('已取消 AI 请求，使用经典剧情；不重复收取探索时间。'),
      testAi: async () => {
        if (!get().hydrated || get().loadBlocked || get().play.mode !== 'generative' || get().play.pending || get().aiStatus === 'checking') return;
        const ticket = gate.begin();
        set({ aiStatus: 'checking', aiMessage: '正在检查 relay 协议与配置；此检查不调用模型。' });
        try {
          const result = await deps.test(get().play.mode, get().aiSettings, relayToken, ticket.signal);
          if (gate.current(ticket)) set({ aiStatus: result.ok ? 'success' : 'error', aiMessage: result.ok ? 'relay 可达且支持生成协议；实际模型结果以生成奇遇为准。' : result.error });
        } catch { if (gate.current(ticket)) set({ aiStatus: 'error', aiMessage: '连接测试失败，请检查服务配置。' }); }
      },
      act: (action) => { if (canAct()) commit({ ...session(), game: runAction(get().game, action) }); },
      socialize: (npcId) => { if (canAct()) commit({ ...session(), game: socializeNpc(get().game, npcId) }); },
      chooseEvent: (choiceId) => {
        if (!get().hydrated || get().loadBlocked || get().play.pending || get().game.gameOver) return;
        commit(get().play.scene ? resolveScene(session(), choiceId) : { ...session(), game: resolveEventChoice(get().game, choiceId) });
      },
      chooseEnding: (endingId) => { if (canAct()) commit({ ...session(), game: selectEnding(get().game, endingId) }); },
      reset: async () => {
        // Also wait for initial hydration so a late disk read cannot revive the previous world.
        if (hydration) await hydration;
        gate.cancel();
        const next = createSession(); next.play.mode = get().play.mode;
        set({ game: next.game, play: next.play, hydrated: true, loadBlocked: false, aiStatus: 'idle', aiMessage: '', saveError: '' });
        await persist(next);
      },
    };
  });
}
export const useGameStore = createGameStore();
