import type { EventChoice, EventDefinition, GameState, NpcId } from './types';
import { NPC_MAP } from './npcs';

export interface NarrativeAiRequest {
  event: Pick<EventDefinition, 'id' | 'title' | 'category' | 'description' | 'npcId'>;
  choice: Pick<EventChoice, 'id' | 'label' | 'result'>;
  state: {
    day: number;
    minute: number;
    realmLevel: number;
    weather: GameState['weather'];
    npc?: {
      id: NpcId;
      name: string;
      affinity: number;
      trust: number;
      bond: number;
      romance: number;
      route: string;
    };
  };
}

const endpoint = (import.meta.env.VITE_NARRATIVE_AI_ENDPOINT as string | undefined)?.trim() ?? '';

export const narrativeAiEnabled = endpoint.length > 0;

export async function requestNarrativeLine(event: EventDefinition, choice: EventChoice, state: GameState): Promise<string | null> {
  if (!narrativeAiEnabled || !event.npcId) return null;
  const npc = NPC_MAP.get(event.npcId);
  const relationship = state.relationships[event.npcId];
  if (!npc || !relationship) return null;

  const payload: NarrativeAiRequest = {
    event: {
      id: event.id,
      title: event.title,
      category: event.category,
      description: event.description,
      npcId: event.npcId,
    },
    choice: { id: choice.id, label: choice.label, result: choice.result },
    state: {
      day: state.day,
      minute: state.minute,
      realmLevel: state.realmLevel,
      weather: state.weather,
      npc: {
        id: event.npcId,
        name: npc.name,
        affinity: relationship.affinity,
        trust: relationship.trust,
        bond: relationship.bond,
        romance: relationship.romance,
        route: relationship.route,
      },
    },
  };

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = await response.json() as { text?: unknown };
    if (typeof data.text !== 'string') return null;
    const text = data.text.replace(/\s+/g, ' ').trim().slice(0, 240);
    return text.length >= 2 ? text : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}
