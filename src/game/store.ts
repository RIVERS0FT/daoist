import type { CultivationCommand } from './cultivation';
import { create } from 'zustand';
import { normalizeRelayEndpoint, persistAiSettings, readAiSettings, requestScene, RequestGate, testAiConnection } from './ai';
import type { AiSettings } from './ai';
import { runCultivationAction, resolveEventChoice, runAction, selectEnding, socializeNpc } from './engine';
import { beginExploration, createSession, fallbackExploration, receiveGeneratedScene, resolveScene, sessionBusy } from './play';
import type { PlaySession } from './play';
import { loadSlots, saveSlot, SaveConflictError } from './storage';
import type { SaveSlot, SlotEntry } from './storage';
import type { PlayMode, PlayState, SceneFocus } from './generation';
import type { GameAction, GameState, NpcId } from './types';

interface GameStore {
  game: GameState; play: PlayState; hydrated: boolean; loadBlocked: boolean;
  screen: 'start' | 'playing'; slots: SlotEntry[]; activeSlotId: string | null; slotBusy: boolean;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'; saveError: string;
  aiSettings: AiSettings; aiStatus: 'idle' | 'loading' | 'checking' | 'success' | 'fallback' | 'error'; aiMessage: string;
  hydrate: () => Promise<void>;
  newGame: (name: string, mode: PlayMode) => Promise<void>;
  openSlot: (id: string) => Promise<void>;
  returnToStart: (discardUnsaved?: boolean) => Promise<void>;
  flushSaves: () => Promise<void>;
  initAiSettings: (defaultEndpoint?: string) => void;
  configureAi: (settings: AiSettings, relayToken: string) => void;
  explore: (focus: SceneFocus, npcId?: NpcId, intent?: string) => Promise<void>;
  fallback: () => void; testAi: () => Promise<void>;
  cultivate: (command: CultivationCommand) => void;
  act: (action: GameAction) => void; socialize: (npcId: NpcId) => void;
  chooseEvent: (choiceId: string) => void; chooseEnding: (endingId: string) => void;
}
interface Dependencies { list: typeof loadSlots; save: typeof saveSlot; generate: typeof requestScene; test: typeof testAiConnection }
const defaults: Dependencies = { list: loadSlots, save: saveSlot, generate: requestScene, test: testAiConnection };
export function createGameStore(overrides: Partial<Dependencies> = {}) {
  const deps = { ...defaults, ...overrides };
  return create<GameStore>((set, get) => {
    const gate = new RequestGate(), unsaved = new Map<string, PlaySession>();
    let relayToken = '', settingsInitialized = false, hydration: Promise<void> | null = null;
    let saves = Promise.resolve(), writeRevision = 0, retry: ReturnType<typeof setTimeout> | undefined;
    const session = (): PlaySession => ({ version: 5, game: get().game, play: get().play });
    const playing = () => get().hydrated && get().screen === 'playing' && Boolean(get().activeSlotId) && !get().slotBusy && !get().loadBlocked;
    const replaceSlot = (slot: SlotEntry) => set((state) => ({ slots: [...state.slots.filter((entry) => entry.id !== slot.id), slot].sort((a, b) => b.updatedAt - a.updatedAt) }));
    const persist = (value: PlaySession, id = get().activeSlotId) => {
      if (!id) return saves;
      const revision = ++writeRevision;
      unsaved.set(id, value); set({ saveStatus: 'saving' });
      saves = saves.then(async () => {
        if (get().loadBlocked) return;
        const slot = get().slots.find((entry) => entry.id === id);
        if (!slot?.session) throw new SaveConflictError();
        const result = await deps.save({ ...slot, session: value, updatedAt: Date.now() }, slot.revision);
        replaceSlot(result);
        if (unsaved.get(id) === value) unsaved.delete(id);
        if (revision === writeRevision) set({ saveStatus: 'saved', saveError: '' });
      }).catch((error: unknown) => {
        const conflict = error instanceof SaveConflictError;
        if (revision === writeRevision || conflict) set({ saveStatus: 'error', loadBlocked: conflict,
          saveError: conflict ? error.message : '自动保存失败，正在自动重试。进度仍在内存中，请勿关闭页面。' });
        if (!conflict && typeof window !== 'undefined' && !retry) retry = setTimeout(() => {
          retry = undefined;
          const active = get().activeSlotId, pending = active ? unsaved.get(active) : null;
          if (pending && !get().loadBlocked) void persist(pending, active);
        }, 3000);
      });
      return saves;
    };
    const commit = (value: PlaySession) => {
      if (get().loadBlocked || !get().activeSlotId || value.game === get().game && value.play === get().play) return;
      set({ game: value.game, play: value.play }); void persist(value);
    };
    const canAct = () => playing() && !sessionBusy(session());
    const fallBack = (message: string) => {
      gate.cancel(); commit(fallbackExploration(session())); set({ aiStatus: 'fallback', aiMessage: message });
    };
    const initial = createSession(0x5a17d311);
    return {
      game: initial.game, play: initial.play, hydrated: false, loadBlocked: false,
      screen: 'start', slots: [], activeSlotId: null, slotBusy: false, saveStatus: 'idle', saveError: '',
      aiSettings: { endpoint: '', consent: false }, aiStatus: 'idle', aiMessage: '',
      hydrate: () => {
        if (hydration) return hydration;
        hydration = (async () => {
          try { set({ slots: await deps.list(), hydrated: true }); }
          catch { set({ hydrated: true, loadBlocked: true, saveError: '读取本机存档失败，已暂停写入，避免覆盖旧进度。请重新加载页面。' }); }
        })();
        return hydration;
      },
      newGame: async (name, mode) => {
        if (!get().hydrated || get().screen !== 'start' || get().slotBusy || get().loadBlocked || !['classic', 'generative'].includes(mode)) return;
        const playerName = name.trim().slice(0, 32);
        if (!playerName) { set({ saveError: '请输入玩家名称（1–32 个字符）。' }); return; }
        set({ slotBusy: true, saveStatus: 'saving', saveError: '' }); gate.cancel();
        try {
          const now = Date.now(), id = `save-${globalThis.crypto.randomUUID()}`;
          const next = createSession(undefined, mode);
          const slot = await deps.save({ version: 1, id, name: playerName, createdAt: now, updatedAt: now, revision: 0, session: next }, null);
          replaceSlot(slot);
          set({ game: next.game, play: next.play, activeSlotId: id, screen: 'playing', saveStatus: 'saved', aiStatus: 'idle', aiMessage: '' });
        } catch { set({ saveStatus: 'error', saveError: '新存档创建失败，未覆盖任何旧档。请检查浏览器的本机存储权限与空间。' }); }
        finally { set({ slotBusy: false }); }
      },
      openSlot: async (id) => {
        if (!get().hydrated || get().screen !== 'start' || get().slotBusy || get().loadBlocked) return;
        set({ slotBusy: true, saveError: '' }); gate.cancel();
        try {
          const slots = await deps.list(), slot = slots.find((entry) => entry.id === id);
          set({ slots });
          if (!slot?.session) { set({ saveError: slot?.error ?? '找不到这个存档，原数据未被覆盖。' }); return; }
          set({ game: slot.session.game, play: slot.session.play, activeSlotId: id, screen: 'playing', aiStatus: 'idle', aiMessage: '', saveStatus: 'saved' });
          // Persist migrations and paid-request fallbacks in this slot, without touching its backup.
          await persist(slot.session, id);
        } catch { set({ saveError: '读取存档失败，原数据未被覆盖。', saveStatus: 'error' }); }
        finally { set({ slotBusy: false }); }
      },
      returnToStart: async (discardUnsaved = false) => {
        if (get().screen !== 'playing' || get().slotBusy) return;
        set({ slotBusy: true }); gate.cancel();
        if (!discardUnsaved && get().play.pending) commit(fallbackExploration(session()));
        await saves;
        if (get().saveError && !discardUnsaved) { set({ slotBusy: false }); return; }
        if (retry) clearTimeout(retry); retry = undefined;
        unsaved.clear();
        try {
          const slots = await deps.list();
          set({ slots, screen: 'start', activeSlotId: null, loadBlocked: false, saveError: '', saveStatus: 'idle', aiStatus: 'idle', aiMessage: '' });
        } catch { set({ saveError: '读取存档列表失败。当前游戏仍保留在页面中。' }); }
        finally { set({ slotBusy: false }); }
      },
      flushSaves: () => saves,
      initAiSettings: (defaultEndpoint = '') => {
        if (!settingsInitialized) { settingsInitialized = true; set({ aiSettings: readAiSettings(defaultEndpoint) }); }
      },
      configureAi: (settings, token) => {
        if (!playing() || get().play.mode !== 'generative') return;
        try {
          const endpoint = normalizeRelayEndpoint(settings.endpoint);
          if (token.length > 256 || /[\r\n]/.test(token)) throw new Error('relay 访问口令格式不正确。');
          fallBack('设置已更新；等待中的奇遇已使用人工回退，存档模式不变。');
          relayToken = token.trim();
          const next = { endpoint, consent: settings.consent === true }, stored = persistAiSettings(next);
          set({ aiSettings: next, aiStatus: 'idle', aiMessage: stored ? '接入配置已保存。访问口令只在本次页面会话有效。' : '配置仅在当前页面有效：浏览器禁用了本机设置存储。' });
        } catch (error) { set({ aiStatus: 'error', aiMessage: error instanceof Error ? error.message : '设置无效。' }); }
      },
      explore: async (focus, npcId, intent = '') => {
        if (!canAct()) return;
        const before = session(), started = beginExploration(before, focus, npcId, intent);
        if (started === before) { set({ aiStatus: 'error', aiMessage: '暂时无法探索：请完成配送，保留至少 2 精力，并选择已认识且未疏远的人物。' }); return; }
        commit(started);
        if (!started.play.pending) return;
        if (started.play.mode === 'classic') {
          commit(fallbackExploration(started)); set({ aiStatus: 'idle', aiMessage: '本段为人工编写的经典奇遇，没有调用 AI。' }); await saves; return;
        }
        const ticket = gate.begin(), slotId = get().activeSlotId;
        set({ aiStatus: 'loading', aiMessage: '正在生成奇遇；等待不推进游戏时间。可取消本次请求并使用人工回退。' });
        try {
          const result = await deps.generate(started, get().aiSettings, relayToken, ticket.signal);
          if (!gate.current(ticket) || get().activeSlotId !== slotId || get().play.pending?.id !== started.play.pending.id) return;
          if (!result.ok) { fallBack(result.error); await saves; return; }
          const next = receiveGeneratedScene(session(), started.play.pending.id, result.data);
          commit(next);
          set(next.play.scene?.source === 'ai' ? { aiStatus: 'success', aiMessage: 'AI 奇遇已生成。自动保存完成后可选择，实际影响由本地规则结算。' } : { aiStatus: 'fallback', aiMessage: 'AI 内容未通过规则校验，已使用经典人工事件，存档模式不变。' });
          await saves;
        } catch { if (gate.current(ticket)) { fallBack('AI 服务异常，已使用经典人工事件。'); await saves; } }
      },
      fallback: () => { if (playing()) fallBack('已取消本次 AI 请求，使用人工回退；不重复收费，也不改变存档模式。'); },
      testAi: async () => {
        if (!playing() || get().play.mode !== 'generative' || get().play.pending || get().aiStatus === 'checking') return;
        const ticket = gate.begin(); set({ aiStatus: 'checking', aiMessage: '正在检查 relay 协议与配置；此检查不调用模型。' });
        try {
          const result = await deps.test(get().play.mode, get().aiSettings, relayToken, ticket.signal);
          if (gate.current(ticket)) set({ aiStatus: result.ok ? 'success' : 'error', aiMessage: result.ok ? 'relay 可达且支持生成协议；实际模型结果以生成奇遇为准。' : result.error });
        } catch { if (gate.current(ticket)) set({ aiStatus: 'error', aiMessage: '连接测试失败，请检查服务配置。' }); }
      },
      cultivate: (command) => {
        const s = get();
        if (!playing() || s.saveStatus !== 'saved' || s.play.pending || s.play.scene) return;
        commit({ ...session(), game: runCultivationAction(s.game, command) });
      },
      act: (action) => { if (canAct()) commit({ ...session(), game: runAction(get().game, action) }); },
      socialize: (npcId) => { if (canAct()) commit({ ...session(), game: socializeNpc(get().game, npcId) }); },
      chooseEvent: (choiceId) => {
        if (!playing() || get().play.pending || get().game.gameOver || get().play.scene && get().saveStatus !== 'saved') return;
        commit(get().play.scene ? resolveScene(session(), choiceId) : { ...session(), game: resolveEventChoice(get().game, choiceId) });
      },
      chooseEnding: (endingId) => { if (canAct()) commit({ ...session(), game: selectEnding(get().game, endingId) }); },
    };
  });
}
export const useGameStore = createGameStore();
