import { EVENTS as BASE_EVENTS } from './events';
import { NPC_EVENTS } from './npcEvents';
import { DELIVERY_CHOICE_EVENTS } from './deliveryEvents';

export const EVENTS = [...BASE_EVENTS, ...DELIVERY_CHOICE_EVENTS, ...NPC_EVENTS];
export const EVENT_MAP = new Map(EVENTS.map((event) => [event.id, event]));
