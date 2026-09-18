import { bikeStats } from './bike';
import { mapPointById, orderMapPoints, playerMapPoint } from './deliveryLocations';
import type { DeliveryOrder, GameAction, GameState, NpcId, Weather } from './types';

export const MAP_PIXELS_PER_KM = 300;
const CITY_RIDE_KPH = 18;
const CITY_WALK_KPH = 5;
const PUSH_KPH = 4;

const weatherSpeed = (weather: Weather) => weather === 'storm' ? 0.68 : weather === 'rain' ? 0.85 : 1;

export function mapDistanceKm(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const pixels = Math.hypot(a.x - b.x, a.y - b.y);
  if (pixels === 0) return 0;
  return Math.max(0.1, Math.round((pixels / MAP_PIXELS_PER_KM) * 10) / 10);
}

export function routeDistanceKm(points: readonly { x: number; y: number }[]): number {
  let distance = 0;
  for (let index = 1; index < points.length; index += 1) distance += mapDistanceKm(points[index - 1], points[index]);
  return Math.round(distance * 10) / 10;
}

export function travelMinutesForDistance(game: Pick<GameState, 'bike' | 'bikeBattery' | 'weather'>, distanceKm: number): number {
  if (distanceKm <= 0) return 0;
  const canRide = game.bikeBattery > 0 && game.bike.condition > 0;
  const speed = (canRide ? CITY_RIDE_KPH * bikeStats(game.bike).speedMultiplier : CITY_WALK_KPH) * weatherSpeed(game.weather);
  return Math.max(1, Math.ceil(distanceKm / speed * 60));
}

export function pushingMinutesForDistance(game: Pick<GameState, 'weather' | 'energy'>, distanceKm: number): number {
  if (distanceKm <= 0) return 0;
  const fatigue = game.energy < 25 ? 0.82 : 1;
  return Math.max(1, Math.ceil(distanceKm / (PUSH_KPH * weatherSpeed(game.weather) * fatigue) * 60));
}

export function travelPlan(game: GameState, destinationId: string | null | undefined) {
  const from = playerMapPoint(game.position);
  const destination = destinationId ? mapPointById(destinationId) : from;
  if (!destination) return { destination: from, distanceKm: 0, minutes: 0 };
  const distanceKm = mapDistanceKm(from, destination);
  return { destination, distanceKm, minutes: travelMinutesForDistance(game, distanceKm) };
}

export function deliveryRouteDistanceKm(game: GameState, order: Pick<DeliveryOrder, 'merchant' | 'customer' | 'pickupId' | 'dropoffId'>): number {
  const route = orderMapPoints(order);
  return routeDistanceKm([playerMapPoint(game.position), route.pickup, route.dropoff]);
}

export function deliveryRouteDistanceFromPoints(game: GameState, pickup: { x: number; y: number }, dropoff: { x: number; y: number }): number {
  return routeDistanceKm([playerMapPoint(game.position), pickup, dropoff]);
}

export function deliveryRideMinutes(game: GameState, order: Pick<DeliveryOrder, 'merchant' | 'customer' | 'pickupId' | 'dropoffId'>): number {
  const distanceKm = deliveryRouteDistanceKm(game, order);
  const fatigue = game.energy < 25 ? 1.18 : 1;
  return Math.max(1, Math.ceil(travelMinutesForDistance(game, distanceKm) * fatigue));
}

export function deliveryPushMinutes(game: GameState, order: Pick<DeliveryOrder, 'merchant' | 'customer' | 'pickupId' | 'dropoffId'>): number {
  return pushingMinutesForDistance(game, deliveryRouteDistanceKm(game, order));
}

export function actionDestination(action: GameAction): string | null {
  if (action === 'eat') return 'noodles';
  if (action === 'rest' || action === 'sleep') return 'home';
  if (action === 'charge-bike') return 'charge';
  if (action === 'repair-bike' || action.startsWith('upgrade-bike-')) return 'station';
  if (action === 'meditate-1h' || action === 'meditate-3h' || action === 'study' || action === 'breakthrough') return 'rooftop';
  return null;
}

export function npcDestination(npcId: NpcId): string {
  if (npcId === 'lin_xiaoman') return 'hospital';
  if (npcId === 'zhou_ye') return 'station';
  if (npcId === 'su_qinghe') return 'bookshop';
  if (npcId === 'wang_shu') return 'noodles';
  return 'riverside';
}

export function explorationDestination(focus: 'city' | 'cultivation' | 'social', npcId?: NpcId, preferred?: string | null): string {
  if (focus === 'social' && npcId) return npcDestination(npcId);
  if (focus === 'cultivation') return preferred === 'mountain' || preferred === 'rooftop' ? preferred : 'rooftop';
  return preferred === 'riverside' || preferred === 'oldtown' ? preferred : 'oldtown';
}

export function previewAfterTravel(game: GameState, destinationId: string | null | undefined): GameState {
  const plan = travelPlan(game, destinationId);
  if (!plan.minutes) return game;
  const total = game.minute + plan.minutes;
  return {
    ...game,
    day: game.day + Math.floor(total / 1440),
    minute: total % 1440,
    position: { version: 1, locationId: plan.destination.id },
  };
}
