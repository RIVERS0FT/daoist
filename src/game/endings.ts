import type { EndingDefinition, GameState, NpcId } from './types';

const rel = (state: GameState, npcId: NpcId) => state.relationships[npcId];
const flag = (state: GameState, key: string) => state.flags[key];

export const ENDINGS: EndingDefinition[] = [
  {
    id: 'xiaoman-morning',
    title: '等天亮的人',
    category: '情感结局',
    description: '你和林小满都习惯了夜晚，但终于有人愿意陪另一个人等到早晨。',
    epilogue: '她下夜班，你结束夜修。你们在医院后门分一杯豆浆，谈房租、病人、订单，也谈那些不能告诉普通人的夜。没有谁承诺永远，但每次天快亮时，你知道有人在等你。',
    condition: (s) => s.day >= 30 && rel(s, 'lin_xiaoman').route === 'romance' && rel(s, 'lin_xiaoman').trust >= 60 && rel(s, 'lin_xiaoman').romance >= 55,
  },
  {
    id: 'rider-brothers',
    title: '风雨同路',
    category: '友情结局',
    description: '周野知道你身上藏着秘密，但他更在意下雨的时候有没有人给你留块电池。',
    epilogue: '你们没有离开骑手站。只是从那以后，谁被困在暴雨里，另一个人一定会去接。有人说你们运气好，总能从最怪的巷子里回来。只有你们知道，那不是运气。',
    condition: (s) => s.day >= 30 && rel(s, 'zhou_ye').route === 'close-friend' && rel(s, 'zhou_ye').trust >= 65 && rel(s, 'zhou_ye').bond >= 50,
  },
  {
    id: 'qinghe-road',
    title: '青山有路',
    category: '修仙结局',
    description: '苏青禾决定离开旧书店，而你决定和她一起去看看城市之外的灵气源头。',
    epilogue: '你把外卖箱留在出租屋里，只带了一身换洗衣服和那几本被翻烂的笔记。她在车站等你，手里仍拿着一本旧书。列车驶出城时，你第一次看见远山上真正的灵光。',
    condition: (s) => s.day >= 30 && rel(s, 'su_qinghe').route === 'mentor' && rel(s, 'su_qinghe').trust >= 60 && s.realmLevel >= 3 && flag(s, 'qinghe_oath') === true,
  },
  {
    id: 'found-family',
    title: '一桌热饭',
    category: '羁绊结局',
    description: '你没有血缘意义上的家，却在这座城里慢慢有了一张总有人给你留位置的桌子。',
    epilogue: '王叔照旧嫌你太瘦，周野照旧抢最后一块牛肉，小满偶尔带着夜班同事来。有人知道你修仙，有人不知道。重要的是，每次推门进来，总有人说一句：“来了？坐。”',
    condition: (s) => {
      if (s.day < 30 || rel(s, 'wang_shu').route !== 'family' || rel(s, 'wang_shu').trust < 60) return false;
      return Object.values(s.relationships).filter((r) => r.met && r.trust >= 50).length >= 3;
    },
  },
  {
    id: 'truth-in-daylight',
    title: '把真相带到白天',
    category: '城市结局',
    description: '你和许遥选择让一部分真相见光。城市从此再也无法假装一切正常。',
    epilogue: '第一篇报道发出后，争论持续了很久。有人嘲笑，有人恐慌，也有人终于承认自己见过同样的东西。你失去了一些安静，却得到了一座开始正视夜色的城市。',
    condition: (s) => s.day >= 30 && rel(s, 'xu_yao').route === 'partner' && rel(s, 'xu_yao').trust >= 60 && flag(s, 'public_truth') === true,
  },
  {
    id: 'silent-guardian',
    title: '无名夜行者',
    category: '守护结局',
    description: '你选择让大多数人继续过普通日子，而自己处理那些普通人不必知道的东西。',
    epilogue: '平台上仍有人抱怨配送慢三分钟，楼道里仍有人忘记开灯。只是从某一天起，城市里真正危险的夜路少了一些。没有人知道是谁做的。你也不需要他们知道。',
    condition: (s) => s.day >= 30 && s.realmLevel >= 4 && s.karma >= 12 && flag(s, 'protect_secret') === true,
  },
  {
    id: 'solitary-immortal',
    title: '独自向上',
    category: '独行结局',
    description: '你把关系、承诺和牵挂都留在身后，选择只追求境界。',
    epilogue: '炼气之后还有筑基，筑基之后还有更远的路。你终于不再为房租发愁，也很少再打开通讯录。高处的风很干净，只是偶尔会让人想起楼下那盏还亮着的灯。',
    condition: (s) => s.day >= 30 && s.realmLevel >= 7 && Object.values(s.relationships).every((r) => r.route !== 'romance' && r.route !== 'family' && r.route !== 'close-friend'),
  },
  {
    id: 'shadow-city',
    title: '灯火背面',
    category: '暗线结局',
    description: '你越来越适应那些没有影子的街道，也越来越难回到普通人的生活里。',
    epilogue: '凌晨三点，平台偶尔会出现一个只有你能看见的订单。收货地址不在人间地图上。你再也没有拒绝过。有人说那座城市从来没有鬼市，也有人说鬼市里多了一个戴头盔的引路人。',
    condition: (s) => s.day >= 30 && s.darkQi >= 15 && flag(s, 'saw_ghost_market') === true,
  },
  {
    id: 'city-lights',
    title: '烟火仍在',
    category: '人间结局',
    description: '你没有急着离开这座城。白天继续跑单，夜里继续吐纳，日子普通得像什么都没发生。',
    epilogue: '你终于明白，修仙不是逃离生活。凌晨收车时，街边早餐铺刚刚亮灯。你把头盔放在桌边，点了一碗热面。长生很远，今天还要好好过。',
    condition: (s) => s.day >= 30,
  },
];

export const ENDING_MAP = new Map(ENDINGS.map((ending) => [ending.id, ending]));

export function availableEndings(state: GameState): EndingDefinition[] {
  return ENDINGS.filter((ending) => ending.condition(state));
}
