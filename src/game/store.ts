import { create } from 'zustand';
import { requestNarrativeLine } from './ai';
import { EVENT_MAP } from './content';
import { appendNarrativeLine, createInitialState, migrateGameState, resolveEventChoice, runAction, selectEnding, socializeNpc } from './engine';
import { clearGame, loadGame, saveGame } from './storage';
import type { GameAction, GameState, NpcId } from './types';

interface GameStore {
  game: GameState;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  act: (action: GameAction) => void;
  socialize: (npcId: NpcId) => void;
  chooseEvent: (choiceId: string) => void;
  chooseEnding: (endingId: string) => void;
  reset: () => Promise<void>;
}

function saveVersion(value: unknown): unknown {
  if (!value || typeof value !== 'object' || !('version' in value)) return undefined;
  return (value as { version?: unknown }).version;
}

export const useGameStore = create<GameStore>((set, get) => {
  const commit = (game: GameState) => {
    set({ game });
    void saveGame(game);
  };

  return {
    game: createInitialState(0x5a17d311),
    hydrated: false,
    hydrate: async () => {
      const saved = await loadGame();
      const migrated = migrateGameState(saved);
      const game = migrated ?? get().game;
      set({ game, hydrated: true });
      if (migrated && saveVersion(saved) !== 2) await saveGame(game);
    },
    act: (action) => commit(runAction(get().game, action)),
    socialize: (npcId) => commit(socializeNpc(get().game, npcId)),
    chooseEvent: (choiceId) => {
      const before = get().game;
      const event = before.pendingEventId ? EVENT_MAP.get(before.pendingEventId) : null;
      const choice = event?.choices.find((item) => item.id === choiceId) ?? null;
      const game = resolveEventChoice(before, choiceId);
      commit(game);
      if (event?.npcId && choice && game.pendingEventId === null) {
        void requestNarrativeLine(event, choice, game).then((text) => {
          if (!text) return;
          commit(appendNarrativeLine(get().game, text));
        });
      }
    },
    chooseEnding: (endingId) => commit(selectEnding(get().game, endingId)),
    reset: async () => {
      await clearGame();
      const game = createInitialState();
      set({ game, hydrated: true });
      await saveGame(game);
    },
  };
});
