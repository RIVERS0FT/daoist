import { memo, useLayoutEffect, useRef, useState } from 'react';
import { createMapController } from '../map/controller';
import type { MapController, CameraStatus } from '../map/controller';
import '../camera.css';
import { MAP_PLACES, PLACE_MAP } from '../game/cityMap';
import { MAP_HEIGHT, MAP_WIDTH, orderMapPoints, playerMapPoint } from '../game/deliveryLocations';
import type { MapPoint } from '../game/deliveryLocations';
import type { MapPlace, PlaceId } from '../game/cityMap';
import type { DeliveryOrder, PlayerPosition } from '../game/types';
import { Icon } from './Icon';

// Fixed fictional geometry: more districts, not external tiles or browser geolocation.
const STREETS = [
  'M-30 800H750L1050 770H1550L1820 800H2430', 'M-30 400H760L1050 430H1590L1910 400H2430',
  'M-30 1220H750L1100 1200H1560L1900 1240H2430', 'M-30 1500H1400L1830 1480H2430',
  'M280 -30V700L320 920V1630', 'M760 -30V550L720 940V1630',
  'M1200 -30V540L1170 920V1630', 'M1880 -30V500L1920 1030V1630',
  'M2210 -30V650L2250 1140V1630', 'M-20 190H1530L1800 240H2430',
];
const BLOCKS = Array.from({ length: 56 }, (_, i) => {
  const column = i % 8, row = Math.floor(i / 8);
  const x = 95 + column * 285, y = 275 + row * 178;
  return [x, y, 78 + i % 3 * 19, 52 + i % 4 * 9];
}).filter(([x]) => x < 1500 || x > 1730);
const RIVER = 'M1700-100C1560 160 1740 330 1650 560S1570 910 1710 1160S1690 1470 1550 1680';
const MapArtwork = memo(function MapArtwork({ order, player }: { order: DeliveryOrder | null; player: MapPoint }) {
  const route = order ? orderMapPoints(order) : null;
  return <svg className="city-artwork" viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} aria-hidden="true">
    <defs>
      <pattern id="map-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="currentColor" strokeWidth=".5" /></pattern>
      <pattern id="map-windows" width="14" height="14" patternUnits="userSpaceOnUse"><rect x="4" y="4" width="3" height="3" fill="currentColor" /></pattern>
    </defs>
    <rect width={MAP_WIDTH} height={MAP_HEIGHT} className="map-land" /><rect width={MAP_WIDTH} height={MAP_HEIGHT} fill="url(#map-grid)" className="map-gridlines" />
    <path className="map-park" d="M1540 0H2400V310L2190 260 2000 450 1790 330 1550 240ZM0 1080H250V1600H0ZM50 0H650V155H50Z" />
    <g className="mountain-contours" fill="none">{[0, 1, 2, 3, 4, 5].map((i) => <path key={i} d={`M${1620 + i * 40} 0Q${1740 + i * 30} ${330 - i * 30} 2060 ${290 - i * 24}T2440 ${190 - i * 25}`} />)}</g>
    <path className="river-bank" d={RIVER} /><path className="map-river" d={RIVER} /><path className="river-current" d={RIVER} />
    <g className="city-blocks">{BLOCKS.map(([x, y, w, h], index) => <g key={index}><rect x={x} y={y} width={w} height={h} rx="5" /><rect x={x + 7} y={y + 7} width={w - 14} height={h - 14} rx="2" fill="url(#map-windows)" /></g>)}</g>
    <g className="side-streets" fill="none"><path d="M30 580H1520M30 990H1510M20 1370H1500M490 200V1490M970 200V1490M1450 190V1500M1730 610H2390M1790 1030H2390M1780 1370H2390M2070 360V1550" /></g>
    <g className="street-borders" fill="none">{STREETS.map((d) => <path key={d} d={d} />)}</g>
    <g className="streets" fill="none">{STREETS.map((d) => <path key={d} d={d} />)}</g>
    <g className="street-centers" fill="none">{STREETS.map((d) => <path key={d} d={d} />)}</g>
    <g className="map-trees">{Array.from({ length: 32 }, (_, i) => <g key={i} transform={`translate(${55 + i % 8 * 65} ${48 + Math.floor(i / 8) * 30})`}><circle r="10" /><circle cy="-5" r="7" /></g>)}</g>
    <g className="district-labels"><text x="100" y="460">老 城 商 圈</text><text x="200" y="1250">西 城</text><text x="990" y="340">文 昌 学 城</text><text x="900" y="940">中 心 街 区</text><text x="1840" y="550">东 城</text><text x="2180" y="970">东 城 新 城</text><text x="1770" y="1450">滨 江 港 区</text><text x="1000" y="1360">城 南 园 区</text><text x="380" y="1520">南 站 物 流 区</text><text x="2070" y="100">青 云 山</text><text x="1600" y="940" transform="rotate(-78 1600 940)">清 河</text></g>
    {route && <path className="delivery-line" d={`M${player.x} ${player.y}L${route.pickup.x} ${route.pickup.y}L${route.dropoff.x} ${route.dropoff.y}`} fill="none" />}
  </svg>;
});
interface CityMapProps {
  panelOpen: boolean; order: DeliveryOrder | null; position: PlayerPosition; selected: PlaceId | null;
  onPlace: (place: MapPlace) => void; onPlaces: () => void; onOrder: () => void;
}
export function CityMap({ order, position, selected, panelOpen, onPlace, onPlaces, onOrder }: CityMapProps) {
  const viewport = useRef<HTMLDivElement>(null), world = useRef<HTMLDivElement>(null), controller = useRef<MapController | null>(null);
  const [status, setStatus] = useState<CameraStatus>({ scale: .65, minimum: .04, following: true, wheel: 'zoom' });
  const player = playerMapPoint(position), route = order ? orderMapPoints(order) : null;
  useLayoutEffect(() => {
    if (!viewport.current || !world.current) return;
    const api = createMapController(viewport.current, world.current, player, setStatus); controller.current = api;
    return () => { api.dispose(); controller.current = null; };
  }, []);
  useLayoutEffect(() => { controller.current?.setPlayer(player); }, [position.locationId]);
  useLayoutEffect(() => { if (selected) controller.current?.locate(PLACE_MAP.get(selected)!); }, [selected]);
  useLayoutEffect(() => { controller.current?.resize(); }, [panelOpen]);
  return <>
    <div className="map-title"><span className="eyebrow">扩展城市 / CITY ATLAS</span><h2>青岚市<span>人间烟火，亦有仙途</span></h2></div>
    <div className="map-location" role="status" aria-live="polite">当前位置：<strong>{player.name}</strong><span> · {player.district}</span></div>
    <div className="map-tools"><button type="button" className="place-list-button" onClick={onPlaces}><Icon name="map" size={16} />地点</button><div className="zoom-tools">
      <button type="button" aria-label="放大地图" title="放大地图" disabled={status.scale >= 2} onClick={() => controller.current?.zoom(1.2)}><Icon name="plus" /></button>
      <button type="button" aria-label="缩小地图" title="缩小地图" disabled={status.scale <= status.minimum + .0001} onClick={() => controller.current?.zoom(1 / 1.2)}><Icon name="minus" /></button>
      <button type="button" aria-label="定位玩家" title="定位玩家（只移动视角）" onClick={() => controller.current?.locate(player, true)}><Icon name="focus" /></button>
      <button type="button" aria-label="定位配送终点" title="定位当前订单送达点" disabled={!route} onClick={() => { if (route) controller.current?.locate(route.dropoff); }}><Icon name="flag" /></button>
    </div></div>
    <details className="camera-access"><summary>视角 · {Math.round(status.scale * 100)}% · {status.following ? '跟随' : '自由'}</summary>
      <div className="camera-menu" aria-label="地图视角控制">
        <p>单指拖动、双指捏合；从图钉上拖动不会打开地点。缩放只改变视角。</p>
        <div className="camera-menu-buttons"><button type="button" onClick={() => controller.current?.fitWorld()}>显示全图</button>
          <button type="button" disabled={!route} onClick={() => { if (route) controller.current?.fit([player, route.pickup, route.dropoff]); }}>查看整单路线</button></div>
        <div className="camera-directions" aria-label="无需拖动的地图平移">{[['向左平移',80,0,'←'],['向上平移',0,80,'↑'],['向下平移',0,-80,'↓'],['向右平移',-80,0,'→']].map(([label,x,y,glyph]) => <button type="button" key={label} aria-label={String(label)} onClick={() => controller.current?.pan(Number(x), Number(y))}>{glyph}</button>)}</div>
        <label>滚轮行为<select aria-label="滚轮行为" value={status.wheel} onChange={e => controller.current?.setWheel(e.target.value as 'zoom' | 'pan')}><option value="zoom">鼠标：滚动缩放</option><option value="pan">触控板：滚动平移</option></select></label>
        <p>触控板捏合缩放；方向键平移，+/− 缩放，Home 定位玩家。点击“定位玩家”恢复跟随。</p>
      </div>
    </details>
    <div ref={viewport} className="map-viewport camera-viewport" tabIndex={0} aria-label="城市地图，可拖动、双指缩放或使用方向键平移" data-testid="map-viewport">
      <div ref={world} className="map-world" style={{ width: MAP_WIDTH, height: MAP_HEIGHT }} data-scale="0.65">
        <MapArtwork order={order} player={player} />
        {MAP_PLACES.map((place) => <button type="button" className={`map-pin ${selected === place.id ? 'selected' : ''} ${place.panel === 'cultivation' || place.panel === 'exploration' ? 'mystic-pin' : ''}`} key={place.id} data-map-x={place.x} data-map-y={place.y} style={{ left: place.x, top: place.y }} aria-label={`${place.name}，${place.subtitle}`} onClick={() => onPlace(place)}>
          <span className="pin-emblem"><Icon name={place.icon} size={25} /></span><strong>{place.name}</strong><small>{place.subtitle}</small>
        </button>)}
        {route && ([['pickup', route.pickup, '取', '取餐点'], ['dropoff', route.dropoff, '送', '送达点']] as const).map(([kind, point, badge, label]) => <button type="button" key={kind} className={`map-pin delivery-pin ${kind}`} data-location-id={point.id} data-map-x={point.x} data-map-y={point.y} data-testid={`delivery-${kind}`} style={{ left: point.x, top: point.y }} aria-label={`${label}：${point.name}`} onClick={onOrder}>
          <span className="pin-emblem"><b className="route-pin">{badge}</b></span><strong>{point.name}</strong><small>{point.district} · 当前订单</small>
        </button>)}
        <div className="player-marker" role="img" aria-label={`玩家位置：${player.name}`} data-testid="player-marker" data-location-id={player.id} style={{ left: player.x, top: player.y }}><strong>你在这里</strong><span><Icon name="bike" size={21} /></span></div>
      </div>
    </div>
    <div className="map-caption"><span className="legend-dot" />生活地标<span className="legend-dot mystic" />修行奇遇<span className="map-help">取送点随任务出现 · 单指平移，双指缩放</span></div>
    <div className="map-compass" aria-hidden="true"><span>北</span><svg viewBox="0 0 40 52" width="28" height="36"><path d="M20 2 32 44 20 35 8 44Z" fill="none" stroke="currentColor" /><path d="M20 2V35L8 44Z" fill="currentColor" /></svg></div>
  </>;
}
