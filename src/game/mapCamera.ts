/** Camera-only geometry: never reads or writes game state, time or saved randomness. */
export interface Point { x: number; y: number }
export interface View { width: number; height: number }
export interface Camera extends Point { scale: number }
export interface Area extends Point, View {}
export const ATLAS = { width: 2400, height: 1600 };
export const MAX_SCALE = 2;
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
export function minimumScale(view: View): number {
  return Math.max(.04, Math.min(.65, Math.max(1, view.width - 120) / ATLAS.width, Math.max(1, view.height - 120) / ATLAS.height));
}
export function boundCamera(c: Camera, view: View): Camera {
  const scale = clamp(Number.isFinite(c.scale) ? c.scale : .65, minimumScale(view), MAX_SCALE);
  const axis = (offset: number, world: number, size: number) => world * scale <= size ? (size - world * scale) / 2 : clamp(Number.isFinite(offset) ? offset : 0, size - world * scale - 72, 72);
  return { scale, x: axis(c.x, ATLAS.width, view.width), y: axis(c.y, ATLAS.height, view.height) };
}
export const worldAt = (c: Camera, p: Point): Point => ({ x: (p.x - c.x) / c.scale, y: (p.y - c.y) / c.scale });
export const screenAt = (c: Camera, p: Point): Point => ({ x: p.x * c.scale + c.x, y: p.y * c.scale + c.y });
export function zoomAt(c: Camera, scale: number, from: Point, to = from): Camera {
  const p = worldAt(c, from);
  return { scale, x: to.x - p.x * scale, y: to.y - p.y * scale };
}
export function fitPoints(points: Point[], area: Area, maxScale = MAX_SCALE): Camera {
  if (!points.length) return { scale: .65, x: 0, y: 0 };
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.max(.04, Math.min(maxScale, Math.max(1, area.width - 144) / Math.max(1, maxX - minX), Math.max(1, area.height - 176) / Math.max(1, maxY - minY)));
  return { scale, x: area.x + area.width / 2 - (minX + maxX) / 2 * scale, y: area.y + area.height / 2 + 14 - (minY + maxY) / 2 * scale };
}
export function pinchCamera(start: Camera, before: [Point, Point], after: [Point, Point], view: View): Camera {
  const midpoint = ([a,b]: [Point,Point]) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const distance = ([a,b]: [Point,Point]) => Math.hypot(a.x - b.x, a.y - b.y);
  const scale = clamp(start.scale * distance(after) / Math.max(1, distance(before)), minimumScale(view), MAX_SCALE);
  return boundCamera(zoomAt(start, scale, midpoint(before), midpoint(after)), view);
}
export function wheelPixels(delta: number, mode: number, page: number): number { return delta * (mode === 1 ? 16 : mode === 2 ? page : 1); }

/** Merge overlapping functional landmarks at overview scale; never alter their saved coordinates. */
export function clusterLandmarks<T extends Point>(points: T[], scale: number): Array<Point & { members: T[] }> {
  const groups = points.map(p => ({ x: p.x, y: p.y, members: [p] }));
  if (scale >= .38) return groups;
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
      if (Math.hypot(groups[i].x - groups[j].x, groups[i].y - groups[j].y) * scale >= 64) continue;
      const members = [...groups[i].members, ...groups[j].members];
      groups[i] = { members, x: members.reduce((sum,p) => sum + p.x, 0) / members.length, y: members.reduce((sum,p) => sum + p.y, 0) / members.length };
      groups.splice(j,1); merged = true; break outer;
    }
  }
  return groups;
}
