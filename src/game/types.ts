export type Weather = 'clear' | 'cloudy' | 'rain' | 'storm';
export type ActionContext = 'delivery' | 'life' | 'cultivation' | 'travel' | 'social';

export type NpcId = 'lin_xiaoman' | 'zhou_ye' | 'su_qinghe' | 'wang_shu' | 'xu_yao';
export type RelationshipField = 'affinity' | 'trust' | 'bond' | 'romance';
export type NpcRoute = 'unmet' | 'acquaintance' | 'friend' | 'close-friend' | 'romance' | 'mentor' | 'partner' | 'family' | 'estranged';

export interface NpcDefinition {
  id: NpcId;
  name: string;
  role: string;
  shortBio: string;
  storyHint: string;
}

export interface NpcRelationship {
  met: boolean;
  affinity: number;
  trust: number;
  bond: number;
  romance: number;
  route: NpcRoute;
  lastSeenDay: number;
}

export interface DeliveryOrder {
  id: string;
  merchant: string;
  customer: string;
  distanceKm: number;
  reward: number;
  estimatedMinutes: number;
  acceptedAtDay: number;
  acceptedAtMinute: number;
  strange: boolean;
}

export interface LogEntry {
  id: string;
  day: number;
  minute: number;
  text: string;
  tone?: 'normal' | 'good' | 'bad' | 'mystic';
}

export type BikeUpgrade = 'speed' | 'battery' | 'durability' | 'efficiency';
export interface BikeState { version: 1; speed: number; battery: number; durability: number; efficiency: number; condition: number }

export interface GameState {
  version: 2;
  day: number;
  minute: number;
  seed: number;
  weather: Weather;
  money: number;
  energy: number;
  health: number;
  stress: number;
  reputation: number;
  bikeBattery: number;
  bike: BikeState;
  qi: number;
  insight: number;
  karma: number;
  darkQi: number;
  realmLevel: number;
  completedOrders: number;
  totalIncome: number;
  rentDueDay: number;
  activeOrder: DeliveryOrder | null;
  pendingEventId: string | null;
  recentEvents: string[];
  flags: Record<string, string | number | boolean>;
  relationships: Record<NpcId, NpcRelationship>;
  endingId: string | null;
  log: LogEntry[];
  gameOver: boolean;
}

export type NumericStatKey = 'money' | 'energy' | 'health' | 'stress' | 'reputation' | 'bikeBattery' | 'qi' | 'insight' | 'karma' | 'darkQi';

export type EventEffect =
  | { type: 'stat'; key: NumericStatKey; delta: number }
  | { type: 'flag'; key: string; value: string | number | boolean }
  | { type: 'time'; minutes: number }
  | { type: 'relationship'; npcId: NpcId; key: RelationshipField; delta: number }
  | { type: 'relationship-route'; npcId: NpcId; route: NpcRoute };

export interface EventRequirement {
  key: NumericStatKey;
  min: number;
  label: string;
}

export interface RelationshipRequirement {
  npcId: NpcId;
  key: RelationshipField;
  min: number;
  label: string;
}

export interface EventChoice {
  id: string;
  label: string;
  result: string;
  effects?: EventEffect[];
  requires?: EventRequirement;
  relationshipRequires?: RelationshipRequirement;
}

export interface EventDefinition {
  id: string;
  title: string;
  category: string;
  description: string;
  contexts: ActionContext[];
  weight: number;
  npcId?: NpcId;
  condition?: (state: GameState) => boolean;
  choices: EventChoice[];
}

export interface EndingDefinition {
  id: string;
  title: string;
  category: string;
  description: string;
  epilogue: string;
  condition: (state: GameState) => boolean;
}

export type GameAction = 'accept-order' | 'complete-order' | 'eat' | 'rest' | 'sleep' | 'charge-bike' | 'meditate-1h' | 'meditate-3h' | 'study' | 'breakthrough' | 'repair-bike' | 'push-order' | 'cancel-order' | `upgrade-bike-${BikeUpgrade}`;
