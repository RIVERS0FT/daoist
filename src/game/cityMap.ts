import type { NpcId } from './types';
export { MAP_WIDTH, MAP_HEIGHT, orderMapPoints } from './deliveryLocations';

// Presentation coordinates only. Opening a place never moves the game clock.
export type PanelId = 'delivery' | 'life' | 'cultivation' | 'relationships' | 'exploration' | 'character' | 'journal' | 'endings' | 'settings' | 'help' | 'event' | 'places';
export type PlaceId = 'home' | 'station' | 'noodles' | 'hospital' | 'bookshop' | 'riverside' | 'rooftop' | 'oldtown' | 'mountain' | 'charge';
export interface MapPlace {
  id: PlaceId; name: string; subtitle: string; district: string; description: string;
  x: number; y: number; icon: string; panel: PanelId; npcId?: NpcId;
}
export const MAP_PLACES: MapPlace[] = [
  { id: 'home', name: '梧桐里出租屋', subtitle: '休息 · 生活', district: '西城生活区', description: '跑单结束后，总有一个可以歇脚的地方。吃饭、休息和睡眠沿用原有时间成本。', x: 410, y: 1050, icon: 'home', panel: 'life' },
  { id: 'station', name: '骑手驿站', subtitle: '配送 · 补给', district: '中心街区', description: '从这里查看订单，决定下一趟送往哪里。取餐与送达点只在当前任务中出现，配送成功后更新你的位置。', x: 1000, y: 860, icon: 'bike', panel: 'delivery', npcId: 'zhou_ye' },
  { id: 'noodles', name: '老城食街', subtitle: '热饭 · 烟火气', district: '老城商圈', description: '一碗热饭，也是一段关系的开始。这里可安排生活行动，人物故事仍由原有事件推进。', x: 420, y: 470, icon: 'shop', panel: 'life', npcId: 'wang_shu' },
  { id: 'hospital', name: '东城医院', subtitle: '林小满 · 人间关系', district: '东城街区', description: '夜班交接时，医院门口仍然亮着灯。查看林小满的关系与线索；尚未相遇时不能直接联系。', x: 1890, y: 580, icon: 'hospital', panel: 'relationships', npcId: 'lin_xiaoman' },
  { id: 'bookshop', name: '青禾旧书店', subtitle: '苏青禾 · 人间关系', district: '文昌街', description: '泛黄的书页之间，藏着这个城市另一面的线索。先认识苏青禾，再选择是否留时间给她。', x: 1070, y: 490, icon: 'book', panel: 'relationships', npcId: 'su_qinghe' },
  { id: 'riverside', name: '清河步道', subtitle: '城市 · 自由奇遇', district: '清河沿岸', description: '离开熟悉的路线，给今天留一点未知。经典与 AI 自由奇遇都可以从这里进入。', x: 1430, y: 980, icon: 'leaf', panel: 'exploration', npcId: 'xu_yao' },
  { id: 'rooftop', name: '西城天台', subtitle: '吐纳 · 突破', district: '西城高处', description: '楼群之上，是你的另一种生活。白天也能修炼，夜晚效率更高。', x: 700, y: 240, icon: 'moon', panel: 'cultivation' },
  { id: 'oldtown', name: '旧城小巷', subtitle: '线索 · 自由奇遇', district: '老城边缘', description: '熟悉的巷子也会发生不熟悉的事。打开奇遇面板后，探索才会扣除时间与精力。', x: 250, y: 380, icon: 'spark', panel: 'exploration' },
  { id: 'mountain', name: '青云山脚', subtitle: '山色 · 修行', district: '城北山麓', description: '远山与城市相接。这里是修炼入口，不会因点击地图就免费获得灵气或解锁境界。', x: 1840, y: 340, icon: 'mountain', panel: 'cultivation' },
  { id: 'charge', name: '南街换电柜', subtitle: '换电 · 补给', district: '南街', description: '出发前先看看电量。换电仍需要 18 分钟与 ¥6。', x: 960, y: 1400, icon: 'battery', panel: 'life' },
];
export const PLACE_MAP = new Map(MAP_PLACES.map((place) => [place.id, place]));
export const PANEL_TITLES: Record<PanelId, string> = {
  delivery: '配送任务', life: '凡俗生活', cultivation: '夜间修行', relationships: '人间关系', exploration: '自由奇遇',
  character: '角色状态', journal: '今日见闻', endings: '命运分岔', settings: '设置', help: '帮助', event: '当前事件', places: '城市地点',
};
