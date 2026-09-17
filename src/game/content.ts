import { EVENTS as BASE_EVENTS } from './events';
import { NPC_EVENTS } from './npcEvents';

export const EVENTS = [...BASE_EVENTS, ...NPC_EVENTS];
export const EVENT_MAP = new Map(EVENTS.map((event) => [event.id, event]));
