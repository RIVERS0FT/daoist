import { useLayoutEffect, useRef, useState } from 'react';
import { MAP_HEIGHT, MAP_PLACES, MAP_WIDTH, orderMapPoints, PLACE_MAP } from '../game/cityMap';
import type { MapPlace, PlaceId } from '../game/cityMap';
import type { DeliveryOrder } from '../game/types';
import { Icon } from './Icon';

// Static, local geometry. No map tiles, geolocation, external assets or RNG.
const STREETS = ['M-30 445H250L440 430H665L890 405H1250', 'M100 -10V160L185 240V430L245 520V850', 'M470 -20V180L520 275V460L485 610V850', 'M790 -10V230L740 345V535L795 660V850', 'M1040 260V405L1000 560V820', 'M-20 205H510L690 170H860', 'M-30 665H510L685 620H1230'];
const BLOCKS = [
  [80, 485, 105, 125], [275, 525, 95, 80], [320, 650, 100, 55], [295, 385, 80, 27],
  [280, 245, 67, 62], [385, 245, 60, 40], [290, 62, 40, 55], [395, 65, 42, 73],
  [565, 70, 95, 55], [580, 310, 90, 61], [560, 408, 56, 35], [605, 557, 52, 35],
  [845, 270, 48, 64], [1065, 287, 70, 69], [880, 458, 65, 70], [1070, 600, 71, 114],
  [829, 625, 40, 90], [870, 743, 85, 35], [30, 255, 58, 85], [45, 350, 62, 59],
];
function MapArtwork({ order }: { order: DeliveryOrder | null }) {
  const route = order ? orderMapPoints(order) : null;
  return <svg className="city-artwork" viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} aria-hidden="true">
    <defs>
      <pattern id="map-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="currentColor" strokeWidth=".5" /></pattern>
      <pattern id="map-windows" width="14" height="14" patternUnits="userSpaceOnUse"><rect x="4" y="4" width="3" height="3" fill="currentColor" /></pattern>
    </defs>
    <rect width="1200" height="800" className="map-land" /><rect width="1200" height="800" fill="url(#map-grid)" className="map-gridlines" />
    <path className="map-park" d="M810 0h390v235l-99 27-99-53-113-36-79-67ZM0 715l132-32 42 117H0ZM553 188l140-10 17 87-126 22Z" />
    <g className="mountain-contours" fill="none">{[0, 1, 2, 3, 4, 5].map((i) => <path key={i} d={`M${790 + i * 23} 0Q${800 + i * 25} ${80 + i * 16} 1020 ${175 - i * 18}T1240 ${130 - i * 17}`} />)}</g>
    <path className="river-bank" d="M1130-70C820 60 1080 255 830 434S765 710 570 880" />
    <path className="map-river" d="M1130-70C820 60 1080 255 830 434S765 710 570 880" />
    <path className="river-current" d="M1130-70C820 60 1080 255 830 434S765 710 570 880" />
    <g className="city-blocks">{BLOCKS.map(([x, y, w, h], index) => <g key={index}><rect x={x} y={y} width={w} height={h} rx="5" /><rect x={x + 7} y={y + 7} width={w - 14} height={h - 14} rx="2" fill="url(#map-windows)" /></g>)}</g>
    <g className="side-streets" fill="none"><path d="M30 100H440M285 0v410M30 370h450M40 500H460M300 450v200M570 40v125m120 100v170M850 275h330M1100 240v510M850 570h350M-10 735h550" /></g>
    <g className="street-borders" fill="none">{STREETS.map((d) => <path key={d} d={d} />)}</g>
    <g className="streets" fill="none">{STREETS.map((d) => <path key={d} d={d} />)}</g>
    <g className="street-centers" fill="none">{STREETS.map((d) => <path key={d} d={d} />)}</g>
    <g className="map-trees">{Array.from({ length: 20 }, (_, i) => <g key={i} transform={`translate(${53 + (i % 5) * 31} ${59 + Math.floor(i / 5) * 32})`}><circle r="10" /><circle cy="-5" r="7" /></g>)}</g>
    <g className="district-labels"><text x="60" y="190">西 城</text><text x="320" y="750">梧 桐 里</text><text x="576" y="153">文 昌 街</text><text x="997" y="245">东 城</text><text x="953" y="762">城 南</text><text x="1100" y="71">青 云 山</text><text x="802" y="575" transform="rotate(-48 802 575)">清 河</text></g>
    {route && <path className="delivery-line" d={`M${route.pickup.x} ${route.pickup.y}C${route.pickup.x} ${route.dropoff.y},${route.dropoff.x} ${route.pickup.y},${route.dropoff.x} ${route.dropoff.y}`} fill="none" />}
  </svg>;
}
export function CityMap({ order, selected, onPlace, onPlaces }: { order: DeliveryOrder | null; selected: PlaceId; onPlace: (place: MapPlace) => void; onPlaces: () => void }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(.8);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const route = order ? orderMapPoints(order) : null;
  const center = (place: MapPlace, nextScale = scale) => {
    const node = viewport.current;
    if (node) node.scrollTo({ left: place.x * nextScale - node.clientWidth / 2, top: place.y * nextScale - node.clientHeight / 2, behavior: 'instant' });
  };
  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const observer = new ResizeObserver(() => center(PLACE_MAP.get(selected)!, scale));
    observer.observe(node);
    center(PLACE_MAP.get(selected)!, scale);
    return () => observer.disconnect();
  }, [scale, selected]);
  return <>
    <div className="map-title"><span className="eyebrow">城市图鉴 / CITY ATLAS</span><h2>青岚市<span>人间烟火，亦有仙途</span></h2></div>
    <div className="map-tools"><button type="button" className="place-list-button" onClick={onPlaces}><Icon name="map" size={16} />地点</button><div className="zoom-tools">
      <button type="button" aria-label="放大地图" disabled={scale >= 1.5} onClick={() => setScale((s) => Math.min(1.5, s + .15))}><Icon name="plus" /></button>
      <button type="button" aria-label="缩小地图" disabled={scale <= .75} onClick={() => setScale((s) => Math.max(.75, s - .15))}><Icon name="minus" /></button>
      <button type="button" aria-label="回到骑手驿站" onClick={() => center(PLACE_MAP.get('station')!)}><Icon name="focus" /></button>
    </div></div>
    <div ref={viewport} className="map-viewport" tabIndex={0} aria-label="城市地图，可拖动或使用方向键平移" data-testid="map-viewport"
      onKeyDown={(event) => { if (event.target !== event.currentTarget) return; const moves: Record<string, [number, number]> = { ArrowLeft: [-80, 0], ArrowRight: [80, 0], ArrowUp: [0, -80], ArrowDown: [0, 80] }; const move = moves[event.key]; if (move) { event.preventDefault(); event.currentTarget.scrollBy(move[0], move[1]); } }}
      onPointerDown={(event) => { if (event.pointerType === 'touch' || (event.target as Element).closest('button') || event.button !== 0) return; drag.current = { x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={(event) => { const start = drag.current; if (start) { event.currentTarget.scrollLeft = start.left - event.clientX + start.x; event.currentTarget.scrollTop = start.top - event.clientY + start.y; } }}
      onPointerUp={(event) => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
      <div className="map-world" style={{ width: MAP_WIDTH * scale, height: MAP_HEIGHT * scale }} data-scale={scale}>
        <MapArtwork order={order} />
        {MAP_PLACES.map((place) => <button type="button" className={`map-pin ${selected === place.id ? 'selected' : ''} ${place.panel === 'cultivation' || place.panel === 'exploration' ? 'mystic-pin' : ''}`} key={place.id} style={{ left: place.x * scale, top: place.y * scale }} aria-label={`${place.name}，${place.subtitle}`} onClick={() => onPlace(place)}>
          <span className="pin-emblem"><Icon name={place.icon} size={25} />{route && (route.pickup.id === place.id || route.dropoff.id === place.id) && <b className="route-pin">{route.pickup.id === place.id ? '取' : '送'}</b>}</span><strong>{place.name}</strong><small>{place.subtitle}</small>
        </button>)}
      </div>
    </div>
    <div className="map-caption"><span className="legend-dot" />生活与配送<span className="legend-dot mystic" />修行与奇遇<span className="map-help">拖动地图 · 点击地点查看</span></div>
    <div className="map-compass" aria-hidden="true"><span>北</span><svg viewBox="0 0 40 52" width="28" height="36"><path d="M20 2 32 44 20 35 8 44Z" fill="none" stroke="currentColor" /><path d="M20 2V35L8 44Z" fill="currentColor" /></svg></div>
  </>;
}
