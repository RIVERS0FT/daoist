import { memo, useLayoutEffect, useRef, useState } from 'react';
import { deliveryCosts, deliveryEstimate } from '../game/bike';
import { deliveryOffers } from '../game/deliveryBoard';
import { deliveryCoinReward } from '../game/system';
import { clusterLandmarks } from '../game/mapCamera';
import { createMapController } from '../map/controller';
import type { MapController, CameraStatus } from '../map/controller';
import '../camera.css';
import { MAP_PLACES, PLACE_MAP } from '../game/cityMap';
import { MAP_HEIGHT, MAP_WIDTH, orderMapPoints, playerMapPoint } from '../game/deliveryLocations';
import type { MapPoint } from '../game/deliveryLocations';
import type { MapPlace, PlaceId } from '../game/cityMap';
import { useGameStore } from '../game/store';
import type { DeliveryOrder, PlayerPosition } from '../game/types';
import { Icon } from './Icon';

// Fixed fictional geometry: more districts, not external tiles or browser geolocation.
const STREETS = [
  'M-30 800H750L1050 770H1550L1820 800H2430', 'M-30 400H760L1050 430H1590L1910 400H2430',
  'M-30 1220H750L1100 1200H1560L1900 1240H2430', 'M-30 1500H1400L1830 1480H2430',
  'M280 -30V700L320 920V1630', 'M760 -30V550L720 940V1630',
  'M1200 -30V540L1170 920V1630', 'M1880 -30V500L1920 1030V1630',
  'M2210 -30V650L2250 1140V1630', 'M-30 190H1530L1800 240H2430',
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
    {route && <path className="delivery-line" d={`M${player.x} ${player.y}L${route.dropoff.x} ${route.dropoff.y}`} fill="none" />}
  </svg>;
});
interface CityMapProps {
  panelOpen: boolean; order: DeliveryOrder | null; position: PlayerPosition; selected: PlaceId | null;
  onPlace: (place: MapPlace) => void; onPlaces: () => void; onOrder: () => void;
}
export function CityMap({ order, position, selected, panelOpen, onPlace, onOrder }: CityMapProps) {
  const viewport = useRef<HTMLDivElement>(null), world = useRef<HTMLDivElement>(null), controller = useRef<MapController | null>(null);
  const [status, setStatus] = useState<CameraStatus>({ scale: .65, minimum: .04, following: true, wheel: 'zoom' });
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const game = useGameStore((state) => state.game);
  const playBusy = useGameStore((state) => Boolean(state.play.pending || state.play.scene || state.slotBusy || state.loadBlocked));
  const deliverDeliveryOffer = useGameStore((state) => state.deliverDeliveryOffer);
  const offers = playBusy ? [] : deliveryOffers(game);
  const selectedOffer = offers.find((offer) => offer.id === selectedOfferId) ?? null;
  const selectedCosts = selectedOffer ? deliveryCosts(selectedOffer, game.bike) : null;
  const player = playerMapPoint(position), route = order ? orderMapPoints(order) : null;
  const groups = clusterLandmarks(MAP_PLACES, status.scale);
  useLayoutEffect(() => {
    if (!viewport.current || !world.current) return;
    const api = createMapController(viewport.current, world.current, player, setStatus); controller.current = api;
    return () => { api.dispose(); controller.current = null; };
  }, []);
  useLayoutEffect(() => { controller.current?.setPlayer(player); }, [position.locationId]);
  useLayoutEffect(() => { if (selected) controller.current?.locate(PLACE_MAP.get(selected)!); }, [selected]);
  useLayoutEffect(() => { controller.current?.resize(); }, [panelOpen]);
  return <>
    <div className="map-title"><h2>青岚市</h2></div>
    <div className="map-location" role="status" aria-live="polite">当前位置：<strong>{player.name}</strong><span> · {player.district}</span></div>
    <div className="map-tools"><div className="zoom-tools">
      <button type="button" aria-label="放大地图" title="放大地图" disabled={status.scale >= 2} onClick={() => controller.current?.zoom(1.2)}><Icon name="plus" /></button>
      <button type="button" aria-label="缩小地图" title="缩小地图" disabled={status.scale <= status.minimum + .0001} onClick={() => controller.current?.zoom(1 / 1.2)}><Icon name="minus" /></button>
      <button type="button" aria-label="定位玩家" title="定位玩家（只移动视角）" onClick={() => controller.current?.locate(player, true)}><Icon name="focus" /></button>
    </div></div>
    <div ref={viewport} className="map-viewport camera-viewport" tabIndex={0} aria-label="城市地图，可拖动、双指缩放或使用方向键平移" data-testid="map-viewport">
      <div ref={world} className="map-world" style={{ width: MAP_WIDTH, height: MAP_HEIGHT }} data-scale="0.65">
        <MapArtwork order={order} player={player} />
        {groups.map((group) => {
          if (group.members.length > 1) return <button type="button" key={`cluster-${group.members.map(p => p.id).join('-')}`} className="map-pin landmark-cluster" data-map-x={group.x} data-map-y={group.y} style={{ left: group.x, top: group.y }} aria-label={`展开 ${group.members.length} 处地标：${group.members.map(p => p.name).join('、')}`} onClick={() => { controller.current?.zoom(Math.max(1.6, .42 / status.scale)); controller.current?.locate(group); }}>
            <span className="pin-emblem"><b>{group.members.length}</b></span><small>处地标</small>
          </button>;
          const place = group.members[0];
          return <button type="button" className={`map-pin ${selected === place.id ? 'selected' : ''} ${place.panel === 'cultivation' || place.panel === 'exploration' ? 'mystic-pin' : ''}`} key={place.id} data-map-x={place.x} data-map-y={place.y} style={{ left: place.x, top: place.y }} aria-label={`${place.name}，${place.subtitle}`} onClick={() => onPlace(place)}>
          <span className="pin-emblem"><Icon name={place.icon} size={25} /></span><strong>{place.name}</strong><small>{place.subtitle}</small>
        </button>; })}
        {offers.map((offer) => {
          const point = orderMapPoints(offer).dropoff;
          return <button type="button" key={offer.id} className={`map-pin delivery-pin offer ${selectedOfferId === offer.id ? 'selected' : ''}`} data-offer-id={offer.id} data-location-id={point.id} data-map-x={point.x} data-map-y={point.y} data-testid="delivery-offer" style={{ left: point.x, top: point.y }} aria-label={`配送任务：${offer.merchant} 到 ${point.name}，${offer.distanceKm.toFixed(1)} 公里，收入 ${offer.reward} 元，外卖币 ${deliveryCoinReward(offer)} 枚`} onClick={() => setSelectedOfferId(offer.id)}>
            <span className="pin-emblem"><b className="route-pin">单</b></span><strong>{point.name}</strong><small>{point.district} · ¥{offer.reward}</small>
          </button>;
        })}
        {route && <button type="button" className="map-pin delivery-pin dropoff" data-location-id={route.dropoff.id} data-map-x={route.dropoff.x} data-map-y={route.dropoff.y} data-testid="delivery-dropoff" style={{ left: route.dropoff.x, top: route.dropoff.y }} aria-label={`配送终点：${route.dropoff.name}`} onClick={onOrder}>
          <span className="pin-emblem"><b className="route-pin">送</b></span><strong>{route.dropoff.name}</strong><small>{route.dropoff.district} · 当前配送</small>
        </button>}
        <div className="player-marker" role="img" aria-label={`玩家位置：${player.name}`} data-testid="player-marker" data-location-id={player.id} style={{ left: player.x, top: player.y }}><strong>你在这里</strong><span><Icon name="bike" size={21} /></span></div>
      </div>
    </div>
    {selectedOffer && !panelOpen && <aside className="delivery-offer-card" data-testid="delivery-offer-card" aria-label="配送任务详情">
      <button type="button" className="delivery-offer-close" aria-label="关闭配送任务详情" onClick={() => setSelectedOfferId(null)}><Icon name="close" size={16} /></button>
      <span className="eyebrow">{selectedOffer.strange ? '异常配送任务' : '配送任务'}</span>
      <h3>{selectedOffer.customer}</h3>
      <p className="delivery-offer-merchant">取餐 {selectedOffer.merchant} · 路程按当前位置 → 商家 → 顾客计算</p>
      <div className="delivery-offer-meta"><span>{selectedOffer.distanceKm.toFixed(1)} km</span><span>约 {deliveryEstimate(selectedOffer, game.bike, selectedOffer.distanceKm, game.weather, game.energy)} 分钟</span><strong>¥{selectedOffer.reward}</strong><span>+{deliveryCoinReward(selectedOffer)} 外卖币</span></div>
      <div className="delivery-requirements" aria-label="配送要求">
        <span>骑行电量：需 {selectedCosts?.battery ?? 0} / 当前 {Math.round(game.bikeBattery)}</span>
        <span>车辆耐久：需 {selectedCosts?.wear ?? 0} / 当前 {Math.round(game.bike.condition)}</span>
      </div>
      {selectedCosts && (game.bikeBattery < selectedCosts.battery || game.bike.condition < selectedCosts.wear) && <p className="delivery-offer-warning">当前车辆不足以完成骑行配送，请先换电或维修。</p>}
      <button type="button" className="primary-button delivery-accept-button" disabled={Boolean(selectedCosts && (game.bikeBattery < selectedCosts.battery || game.bike.condition < selectedCosts.wear))} onClick={() => { deliverDeliveryOffer(selectedOffer.id); setSelectedOfferId(null); }}>配送</button>
    </aside>}
    <div className="map-caption"><span className="legend-dot" />生活地标<span className="legend-dot mystic" />修行奇遇<span className="map-help">配送任务随行动刷新 · 点击“单”查看要求</span></div>
    <div className="map-compass" aria-hidden="true"><span>北</span><svg viewBox="0 0 40 52" width="28" height="36"><path d="M20 2 32 44 20 35 8 44Z" fill="none" stroke="currentColor" /><path d="M20 2V35L8 44Z" fill="currentColor" /></svg></div>
  </>;
}
