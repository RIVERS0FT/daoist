import type { DeliveryOrder, NpcId } from './types';

// Presentation coordinates only. Opening a place never moves the game clock.
export type PanelId = 'delivery' | 'life' | 'cultivation' | 'relationships' | 'exploration' | 'character' | 'journal' | 'endings' | 'settings' | 'event' | 'places';
export type PlaceId = 'home' | 'station' | 'noodles' | 'hospital' | 'bookshop' | 'riverside' | 'rooftop' | 'oldtown' | 'mountain' | 'charge' | 'community' | 'software';
export interface MapPlace {
  id: PlaceId; name: string; subtitle: string; district: string; description: string;
  x: number; y: number; icon: string; panel: PanelId; npcId?: NpcId;
}
export const MAP_WIDTH = 1200;
export const MAP_HEIGHT = 800;
export const MAP_PLACES: MapPlace[] = [
  { id: 'home', name: '梧桐里出租屋', subtitle: '休息 · 生活', district: '西城生活区', description: '跑单结束后，总有一个可以歇脚的地方。吃饭、休息和睡眠沿用原有时间成本。', x: 230, y: 570, icon: 'home', panel: 'life' },
  { id: 'station', name: '骑手驿站', subtitle: '接单 · 配送', district: '中心街区', description: '从这里查看订单，决定下一趟送往哪里。地图上的连线仅为配送路线示意。', x: 450, y: 505, icon: 'bike', panel: 'delivery', npcId: 'zhou_ye' },
  { id: 'noodles', name: '老王牛肉面', subtitle: '热饭 · 烟火气', district: '老城商圈', description: '一碗热饭，也是一段关系的开始。这里可安排生活行动，人物故事仍由原有事件推进。', x: 380, y: 320, icon: 'shop', panel: 'life', npcId: 'wang_shu' },
  { id: 'hospital', name: '东城医院', subtitle: '林小满 · 人间关系', district: '东城街区', description: '夜班交接时，医院门口仍然亮着灯。查看林小满的关系与线索；尚未相遇时不能直接联系。', x: 940, y: 340, icon: 'hospital', panel: 'relationships', npcId: 'lin_xiaoman' },
  { id: 'bookshop', name: '青禾旧书店', subtitle: '苏青禾 · 人间关系', district: '文昌街', description: '泛黄的书页之间，藏着这个城市另一面的线索。先认识苏青禾，再选择是否留时间给她。', x: 650, y: 245, icon: 'book', panel: 'relationships', npcId: 'su_qinghe' },
  { id: 'riverside', name: '清河步道', subtitle: '城市 · 自由奇遇', district: '清河沿岸', description: '离开熟悉的路线，给今天留一点未知。经典与 AI 自由奇遇都可以从这里进入。', x: 720, y: 490, icon: 'leaf', panel: 'exploration', npcId: 'xu_yao' },
  { id: 'rooftop', name: '西城天台', subtitle: '吐纳 · 突破', district: '西城高处', description: '楼群之上，是你的另一种生活。白天也能修炼，夜晚效率更高。', x: 345, y: 125, icon: 'moon', panel: 'cultivation' },
  { id: 'oldtown', name: '旧城小巷', subtitle: '线索 · 自由奇遇', district: '老城边缘', description: '熟悉的巷子也会发生不熟悉的事。打开奇遇面板后，探索才会扣除时间与精力。', x: 150, y: 290, icon: 'spark', panel: 'exploration' },
  { id: 'mountain', name: '青云山脚', subtitle: '山色 · 修行', district: '城北山麓', description: '远山与城市相接。这里是修炼入口，不会因点击地图就免费获得灵气或解锁境界。', x: 965, y: 120, icon: 'mountain', panel: 'cultivation' },
  { id: 'charge', name: '南街换电柜', subtitle: '换电 · 补给', district: '南街', description: '出发前先看看电量。换电仍需要 18 分钟与 ¥6。', x: 530, y: 680, icon: 'battery', panel: 'life' },
  { id: 'community', name: '东城社区', subtitle: '收餐地址 · 配送', district: '东城生活区', description: '幸福家园、云景花园和大学城订单的区域示意。实际配送距离、地址与收益以订单为准。', x: 1070, y: 505, icon: 'home', panel: 'delivery' },
  { id: 'software', name: '城南园区', subtitle: '收餐地址 · 配送', district: '城南', description: '午晚高峰时，这里的写字楼和公寓等待着热饭。打开订单查看具体收餐地址。', x: 900, y: 680, icon: 'building', panel: 'delivery' },
];
export const PLACE_MAP = new Map(MAP_PLACES.map((place) => [place.id, place]));
const PICKUPS: Record<string, PlaceId> = {
  '老王牛肉面': 'noodles', '金记烧腊': 'noodles', '川味小馆': 'noodles', '月桂咖啡': 'riverside',
  '北门饺子馆': 'bookshop', '深夜食堂': 'oldtown', '阿婆砂锅粥': 'oldtown', '七号便利店': 'station',
};
const DROPOFFS: Record<string, PlaceId> = {
  '幸福家园 4 栋 404': 'community', '云景花园 8 栋': 'community', '东城医院住院部': 'hospital', '城南软件园 A3': 'software',
  '老城区梧桐里': 'home', '青云山脚 17 号': 'mountain', '大学城 6 号宿舍': 'community', '河畔公寓 12F': 'software',
};
export function orderMapPoints(order: Pick<DeliveryOrder, 'merchant' | 'customer'>) {
  return { pickup: PLACE_MAP.get(PICKUPS[order.merchant] ?? 'station')!, dropoff: PLACE_MAP.get(DROPOFFS[order.customer] ?? 'community')! };
}
export const PANEL_TITLES: Record<PanelId, string> = {
  delivery: '配送任务', life: '凡俗生活', cultivation: '夜间修行', relationships: '人间关系', exploration: '自由奇遇',
  character: '骑手状态', journal: '今日见闻', endings: '命运分岔', settings: '设置', event: '当前事件', places: '城市地点',
};
