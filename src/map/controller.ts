import { ATLAS, boundCamera, fitPoints, MAX_SCALE, minimumScale, pinchCamera, screenAt, wheelPixels, worldAt, zoomAt } from '../game/mapCamera';
import type { Area, Camera, Point, View } from '../game/mapCamera';

export interface CameraStatus { scale: number; minimum: number; following: boolean; wheel: 'zoom' | 'pan' }
/** One controller owns the pointer lifecycle and one RAF owns painting. No Zustand or storage. */
export function createMapController(viewport: HTMLDivElement, world: HTMLDivElement, player: Point, notify: (s: CameraStatus) => void) {
  let camera: Camera = { x: 0, y: 0, scale: .65 }, following = true, wheel: 'zoom' | 'pan' = 'zoom';
  let frame = 0, timer: ReturnType<typeof setTimeout> | undefined, dead = false, suppressClick = false;
  let pointerStart: Camera = camera, origins: Point[] = [], moved = false;
  const pointers = new Map<number, Point>(), captureTargets = new Map<number, Element>();
  const measuredView = (): View => {
    const raw = Number.parseFloat(getComputedStyle(viewport).getPropertyValue('--camera-safe-bottom'));
    const bottom = Number.isFinite(raw) ? Math.max(0, raw) : 0;
    return { width: viewport.clientWidth, height: Math.max(1, viewport.clientHeight - bottom) };
  };
  let view: View = measuredView();
  const status = () => { if (!dead) notify({ scale: camera.scale, minimum: minimumScale(view), following, wheel }); };
  const point = (e: { clientX: number; clientY: number }): Point => { const r = viewport.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const safeArea = (): Area => {
    let width = view.width;
    const r = viewport.getBoundingClientRect(), drawer = viewport.parentElement?.querySelector('.game-drawer')?.getBoundingClientRect();
    if (drawer && drawer.width < view.width * .7 && drawer.left > r.left) width = Math.min(width, drawer.left - r.left - 12);
    return { x: 0, y: 0, width, height: view.height };
  };
  const paint = () => {
    frame = 0; if (dead) return;
    world.style.transform = `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.scale})`;
    world.style.setProperty('--map-inverse', String(1 / camera.scale));
    world.dataset.scale = String(camera.scale); world.dataset.x = String(camera.x); world.dataset.y = String(camera.y);
    world.dataset.detail = camera.scale < .38 ? 'overview' : 'normal'; viewport.dataset.following = String(following);
  };
  const update = (next: Camera) => { camera = boundCamera(next, view); if (!frame) frame = requestAnimationFrame(paint); };
  const pauseFollow = () => { following = false; };
  const rebase = () => { pointerStart = { ...camera }; origins = [...pointers.values()].map(p => ({ ...p })); };
  const release = (id: number) => { const target = captureTargets.get(id); captureTargets.delete(id); try { if (target?.hasPointerCapture(id)) target.releasePointerCapture(id); } catch { /* Capture may already be lost after cancellation. */ } };
  const clear = () => { const ids = [...captureTargets.keys()]; pointers.clear(); origins = []; moved = false; ids.forEach(release); viewport.classList.remove('is-panning'); };
  const cancel = () => { if (pointers.size) suppressClick = true; clear(); if (timer) clearTimeout(timer); status(); };
  const locate = (p: Point, follow = false) => {
    clear(); following = follow; const area = safeArea();
    update({ ...camera, x: area.x + area.width / 2 - p.x * camera.scale, y: area.y + area.height / 2 + 14 - p.y * camera.scale }); status();
  };
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType !== 'touch' || (e.target as Element).closest('input,select,textarea')) return;
    if (!pointers.size) { moved = false; suppressClick = false; }
    if (pointers.size >= 2) { suppressClick = true; return; }
    pointers.set(e.pointerId, point(e));
    // Capture on the original button preserves ordinary click and keyboard activation.
    const target = (e.target as Element).closest('button') ?? viewport;
    try { target.setPointerCapture(e.pointerId); captureTargets.set(e.pointerId, target); } catch { /* Synthetic tests cannot capture an inactive pointer. */ }
    if (pointers.size === 2) { moved = true; suppressClick = true; pauseFollow(); }
    rebase();
  };
  const onMove = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, point(e)); const current = [...pointers.values()];
    if (current.length === 2 && origins.length === 2) {
      pauseFollow(); moved = true; suppressClick = true;
      update(pinchCamera(pointerStart, origins as [Point,Point], current as [Point,Point], view));
    } else if (current.length === 1 && origins.length === 1) {
      const dx = current[0].x - origins[0].x, dy = current[0].y - origins[0].y;
      if (!moved && Math.hypot(dx,dy) < (e.pointerType === 'mouse' ? 6 : 10)) return;
      moved = true; suppressClick = true; pauseFollow(); viewport.classList.add('is-panning');
      update({ ...pointerStart, x: pointerStart.x + dx, y: pointerStart.y + dy });
    }
  };
  const onUp = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId); release(e.pointerId);
    // Pinch -> drag uses the current transform and remaining touch, never the old drag origin.
    if (pointers.size) rebase(); else { origins = []; viewport.classList.remove('is-panning'); status(); }
  };
  const onLost = (e: PointerEvent) => { if (pointers.has(e.pointerId)) { suppressClick = true; pointers.delete(e.pointerId); captureTargets.delete(e.pointerId); if (pointers.size) rebase(); else clear(); status(); } };
  const onClick = (e: MouseEvent) => { if (suppressClick && e.detail !== 0) { e.preventDefault(); e.stopImmediatePropagation(); } };
  const onWheel = (e: WheelEvent) => {
    if (!e.cancelable) return; e.preventDefault(); clear(); pauseFollow();
    const dy = wheelPixels(e.deltaY, e.deltaMode, view.height), dx = wheelPixels(e.deltaX, e.deltaMode, view.width);
    if (wheel === 'pan' && !e.ctrlKey) update({ ...camera, x: camera.x - dx, y: camera.y - dy });
    else { const scale = Math.max(minimumScale(view), Math.min(MAX_SCALE, camera.scale * Math.exp(-Math.max(-300, Math.min(300, dy)) * .002))); update(zoomAt(camera, scale, point(e))); }
    if (timer) clearTimeout(timer); timer = setTimeout(status, 100);
  };
  const pan = (x: number, y: number) => { clear(); pauseFollow(); update({ ...camera, x: camera.x + x, y: camera.y + y }); status(); };
  const zoom = (factor: number) => { clear(); const area = safeArea(); update(zoomAt(camera, Math.max(minimumScale(view), Math.min(MAX_SCALE, camera.scale * factor)), { x: area.x + area.width / 2, y: area.y + area.height / 2 })); status(); };
  const fit = (points: Point[]) => { clear(); pauseFollow(); update(fitPoints(points, safeArea())); status(); };
  const onKey = (e: KeyboardEvent) => {
    if (e.target !== viewport) return;
    const moves: Record<string, [number,number]> = { ArrowLeft:[80,0], ArrowRight:[-80,0], ArrowUp:[0,80], ArrowDown:[0,-80] };
    if (moves[e.key]) { e.preventDefault(); pan(...moves[e.key]); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoom(1.2); }
    else if (e.key === '-') { e.preventDefault(); zoom(1 / 1.2); }
    else if (e.key === 'Home') { e.preventDefault(); locate(player, true); }
  };
  const onFocus = (e: FocusEvent) => {
    const target = e.target as HTMLElement;
    if (!target.matches('button:focus-visible') || !target.dataset.mapX) return;
    const p = { x: Number(target.dataset.mapX), y: Number(target.dataset.mapY) }, at = screenAt(camera, p), area = safeArea();
    if (at.x < 72 || at.x > area.width - 72 || at.y < 85 || at.y > area.height - 75) locate(p);
    viewport.scrollLeft = viewport.scrollTop = 0;
  };
  const resize = () => {
    const before = worldAt(camera, { x: view.width / 2, y: view.height / 2 });
    view = measuredView();
    clear(); if (following) locate(player, true); else { update({ ...camera, x: view.width / 2 - before.x * camera.scale, y: view.height / 2 - before.y * camera.scale }); status(); }
  };
  const visibility = () => { if (document.hidden) cancel(); };
  const preventNativeDrag = (e: Event) => e.preventDefault();
  const observer = new ResizeObserver(resize); observer.observe(viewport);
  viewport.addEventListener('pointerdown', onDown); viewport.addEventListener('pointermove', onMove);
  viewport.addEventListener('pointerup', onUp); viewport.addEventListener('pointercancel', cancel); viewport.addEventListener('lostpointercapture', onLost);
  viewport.addEventListener('click', onClick, true); viewport.addEventListener('wheel', onWheel, { passive: false });
  viewport.addEventListener('keydown', onKey); viewport.addEventListener('focusin', onFocus); viewport.addEventListener('dragstart', preventNativeDrag);
  window.addEventListener('blur', cancel); document.addEventListener('visibilitychange', visibility);
  locate(player, true);
  return {
    locate, zoom, pan, fit, resize,
    fitWorld: () => fit([{ x:0, y:0 }, { x:ATLAS.width, y:ATLAS.height }]),
    setWheel: (value: 'zoom' | 'pan') => { wheel = value; status(); },
    setPlayer: (p: Point) => { player = p; if (following) locate(player,true); },
    dispose: () => {
      dead = true; clear(); cancelAnimationFrame(frame); if (timer) clearTimeout(timer); observer.disconnect();
      viewport.removeEventListener('pointerdown', onDown); viewport.removeEventListener('pointermove', onMove);
      viewport.removeEventListener('pointerup', onUp); viewport.removeEventListener('pointercancel', cancel); viewport.removeEventListener('lostpointercapture', onLost);
      viewport.removeEventListener('click', onClick,true); viewport.removeEventListener('wheel', onWheel); viewport.removeEventListener('keydown', onKey);
      viewport.removeEventListener('focusin', onFocus); viewport.removeEventListener('dragstart', preventNativeDrag);
      window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', visibility);
    },
  };
}
export type MapController = ReturnType<typeof createMapController>;
