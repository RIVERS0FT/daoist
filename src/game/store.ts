import { create } from 'zustand';
import { createInitialState, resolveEventChoice, runAction } from './engine';
import { clearGame, loadGame, saveGame } from './storage';
import type { GameAction, GameState } from './types';

interface GameStore {
  game: GameState;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  act: (action: GameAction) => void;
  chooseEvent: (choiceId: string) => void;
  reset: () => Promise<void>;
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
      set({ game: saved?.version === 1 ? saved : get().game, hydrated: true });
    },
    act: (action) => commit(runAction(get().game, action)),
    chooseEvent: (choiceId) => commit(resolveEventChoice(get().game, choiceId)),
    reset: async () => {
      await clearGame();
      const game = createInitialState();
      set({ game, hydrated: true });
      await saveGame(game);
    },
  };
});
