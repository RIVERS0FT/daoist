import type { DeliveryOrder, PlayerPosition } from './types';

/** Local fictional atlas. IDs are save data: do not rename or reuse them. */
export interface MapPoint { id: string; name: string; district: string; x: number; y: number }
export const MAP_WIDTH = 2400;
export const MAP_HEIGHT = 1600;
const point = (id: string, name: string, district: string, x: number, y: number): MapPoint => ({ id, name, district, x, y });

export const FUNCTIONAL_LOCATIONS: MapPoint[] = [
  point('home', '梧桐里出租屋', '西城生活区', 410, 1050),
  point('station', '骑手驿站', '中心街区', 1000, 860),
  point('noodles', '老城食街', '老城商圈', 420, 470),
  point('hospital', '东城医院', '东城街区', 1890, 580),
  point('bookshop', '青禾旧书店', '文昌街', 1070, 490),
  point('riverside', '清河步道', '清河沿岸', 1430, 980),
  point('rooftop', '西城天台', '西城高处', 700, 240),
  point('oldtown', '旧城小巷', '老城边缘', 250, 380),
  point('mountain', '青云山脚', '城北山麓', 1840, 340),
  point('charge', '南街换电柜', '南街', 960, 1400),
];
export const START_LOCATION: MapPoint = FUNCTIONAL_LOCATIONS.find((location) => location.id === 'station')!;

export const DELIVERY_PICKUPS: MapPoint[] = [
  point('pickup-noodles', '老王牛肉面', '老城商圈', 420, 610),
  point('pickup-roast', '金记烧腊', '老城商圈', 580, 760),
  point('pickup-sichuan', '川味小馆', '中心街区', 940, 620),
  point('pickup-coffee', '月桂咖啡', '清河沿岸', 1460, 860),
  point('pickup-dumplings', '北门饺子馆', '文昌学城', 1140, 370),
  point('pickup-midnight', '深夜食堂', '西城生活区', 330, 930),
  point('pickup-congee', '阿婆砂锅粥', '老城商圈', 210, 720),
  point('pickup-seven', '七号便利店', '中心街区', 1080, 1040),
  point('pickup-breakfast', '梧桐早点铺', '西城生活区', 460, 1200),
  point('pickup-bakery', '晴日面包房', '文昌学城', 820, 330),
  point('pickup-tea', '青禾茶饮', '文昌学城', 1320, 530),
  point('pickup-canteen', '学府小炒', '文昌学城', 1460, 260),
  point('pickup-sushi', '东城寿司屋', '东城街区', 1910, 720),
  point('pickup-soup', '杏林炖汤', '东城街区', 1840, 480),
  point('pickup-curry', '白塔咖喱', '东城新城', 2220, 520),
  point('pickup-bento', '云栖便当', '东城新城', 2160, 920),
  point('pickup-fish', '河鲜小馆', '清河沿岸', 1560, 1110),
  point('pickup-grill', '滨江烧烤', '滨江港区', 2000, 1300),
  point('pickup-light', '绿野轻食', '城南园区', 1190, 1300),
  point('pickup-rice', '南街煲仔饭', '城南园区', 880, 1230),
  point('pickup-workers', '工友快餐', '南站物流区', 500, 1410),
  point('pickup-station', '南站馄饨', '南站物流区', 730, 1460),
  point('pickup-mountain', '山门素斋', '青云山麓', 1800, 240),
  point('pickup-spring', '清泉豆花', '青云山麓', 2120, 210),
];
export const DELIVERY_DROPOFFS: MapPoint[] = [
  point('dropoff-happiness', '幸福家园 4 栋 404', '东城街区', 1860, 890),
  point('dropoff-cloud-garden', '云景花园 8 栋', '东城新城', 2200, 1100),
  point('dropoff-hospital', '东城医院住院部', '东城街区', 2060, 620),
  point('dropoff-software', '城南软件园 A3', '城南园区', 1260, 1430),
  point('dropoff-wutong', '老城区梧桐里', '西城生活区', 320, 1140),
  point('dropoff-mountain-17', '青云山脚 17 号', '青云山麓', 1970, 180),
  point('dropoff-dorm-6', '大学城 6 号宿舍', '文昌学城', 1340, 220),
  point('dropoff-riverside-12', '河畔公寓 12F', '清河沿岸', 1690, 1010),
  point('dropoff-old-lane', '槐花巷 9 号', '老城商圈', 190, 530),
  point('dropoff-clock', '钟楼街 22 号', '老城商圈', 540, 450),
  point('dropoff-market', '西城菜场管理室', '老城商圈', 700, 660),
  point('dropoff-courtyard', '石桥大院 3 门', '老城商圈', 450, 800),
  point('dropoff-willow', '杨柳里 2 栋', '西城生活区', 210, 980),
  point('dropoff-park', '西苑公园值班室', '西城生活区', 170, 1290),
  point('dropoff-orchid', '兰庭小区 5 栋', '西城生活区', 630, 1100),
  point('dropoff-repair', '梧桐车行后院', '西城生活区', 630, 940),
  point('dropoff-library', '市图书馆东门', '文昌学城', 1020, 260),
  point('dropoff-lab', '理工实验楼 B2', '文昌学城', 1570, 390),
  point('dropoff-teachers', '文昌教师公寓', '文昌学城', 880, 500),
  point('dropoff-art', '美院画室 302', '文昌学城', 1220, 660),
  point('dropoff-office', '青岚大厦 18F', '中心街区', 1090, 730),
  point('dropoff-mall', '中央商场服务台', '中心街区', 810, 810),
  point('dropoff-hotel', '星河酒店前台', '中心街区', 1280, 930),
  point('dropoff-cinema', '新世纪影城', '中心街区', 820, 1030),
  point('dropoff-clinic', '杏林康复中心', '东城街区', 1750, 660),
  point('dropoff-community', '东城社区服务站', '东城街区', 1980, 1000),
  point('dropoff-white-tower', '白塔公寓 7 栋', '东城新城', 2220, 360),
  point('dropoff-sports', '新城体育馆南门', '东城新城', 2250, 730),
  point('dropoff-cloud-office', '云栖广场 C 座', '东城新城', 2010, 810),
  point('dropoff-studio', '清河摄影工作室', '清河沿岸', 1560, 740),
  point('dropoff-wharf', '滨河码头调度室', '滨江港区', 1800, 1270),
  point('dropoff-warehouse', '滨江冷链仓 2 号', '滨江港区', 2200, 1370),
  point('dropoff-sail', '远帆船厂办公楼', '滨江港区', 2010, 1490),
  point('dropoff-startup', '创新园孵化楼', '城南园区', 1080, 1160),
  point('dropoff-cloud-data', '云算数据中心', '城南园区', 1450, 1450),
  point('dropoff-logistics', '南站物流园 D4', '南站物流区', 360, 1450),
  point('dropoff-rail', '南站候车厅西门', '南站物流区', 690, 1320),
  point('dropoff-forest', '青云护林站', '青云山麓', 1680, 170),
  point('dropoff-spring-inn', '清泉民宿 6 号院', '青云山麓', 2020, 360),
  point('dropoff-observatory', '北岭天文台值班室', '青云山麓', 2270, 170),
];
const pickups = new Map(DELIVERY_PICKUPS.map((p) => [p.id, p]));
const dropoffs = new Map(DELIVERY_DROPOFFS.map((p) => [p.id, p]));
const byName = new Map([...DELIVERY_PICKUPS, ...DELIVERY_DROPOFFS].map((p) => [p.name, p]));
const locations = new Map([...FUNCTIONAL_LOCATIONS, ...DELIVERY_PICKUPS, ...DELIVERY_DROPOFFS].map((p) => [p.id, p]));

export const initialPosition = (): PlayerPosition => ({ version: 1, locationId: START_LOCATION.id });
export function normalizePosition(raw: unknown): PlayerPosition | null {
  if (raw === undefined) return initialPosition(); // Old saves did not record a location; never invent a past destination.
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  if (p.version !== 1 || typeof p.locationId !== 'string' || !locations.has(p.locationId)) return null;
  return { version: 1, locationId: p.locationId };
}
export function mapPointById(locationId: string): MapPoint | null {
  return locations.get(locationId) ?? null;
}
export function playerMapPoint(position: PlayerPosition): MapPoint {
  return mapPointById(position.locationId) ?? START_LOCATION;
}
/** Named lookup keeps released v1–v4 orders intact; IDs keep new orders stable. */
export function orderMapPoints(order: Pick<DeliveryOrder, 'merchant' | 'customer' | 'pickupId' | 'dropoffId'>) {
  return {
    pickup: pickups.get(order.pickupId ?? '') ?? byName.get(order.merchant) ?? START_LOCATION,
    dropoff: dropoffs.get(order.dropoffId ?? '') ?? byName.get(order.customer) ?? DELIVERY_DROPOFFS[0],
  };
}
