import type { EventDefinition, EventEffect, GameState, NpcId, RelationshipField, NpcRoute } from './types';

const flag = (s: GameState, key: string) => s.flags[key];
const rel = (s: GameState, id: NpcId) => s.relationships[id];
const stat = (key: 'money' | 'energy' | 'health' | 'stress' | 'reputation' | 'bikeBattery' | 'qi' | 'insight' | 'karma' | 'darkQi', delta: number): EventEffect => ({ type: 'stat', key, delta });
const time = (minutes: number): EventEffect => ({ type: 'time', minutes });
const setFlag = (key: string, value: string | number | boolean = true): EventEffect => ({ type: 'flag', key, value });
const relationship = (npcId: NpcId, key: RelationshipField, delta: number): EventEffect => ({ type: 'relationship', npcId, key, delta });
const route = (npcId: NpcId, value: NpcRoute): EventEffect => ({ type: 'relationship-route', npcId, route: value });

export const NPC_EVENTS: EventDefinition[] = [
  {
    id: 'xiaoman-1-night-shift', npcId: 'lin_xiaoman', title: '医院后门的夜宵', category: 'NPC · 林小满', contexts: ['delivery'], weight: 9,
    condition: (s) => s.day >= 2 && !flag(s, 'xiaoman_stage'),
    description: '东城医院后门，一个戴着工牌的年轻护士跑出来接餐。她看起来已经连续站了很久，却先问你：“雨这么大，你没事吧？”',
    choices: [
      { id: 'joke', label: '笑着说“跑习惯了”', result: '她也笑了一下，记住了你的骑手编号。', effects: [relationship('lin_xiaoman', 'affinity', 10), relationship('lin_xiaoman', 'trust', 4), setFlag('xiaoman_stage', 1)] },
      { id: 'care', label: '提醒她先吃，别又凉了', result: '她怔了一下，说：“你也记得吃饭。”', effects: [relationship('lin_xiaoman', 'affinity', 8), relationship('lin_xiaoman', 'bond', 6), setFlag('xiaoman_stage', 1)] },
      { id: 'rush', label: '点头后继续跑单', result: '你赶去下一单。她在门口站了一会。', effects: [relationship('lin_xiaoman', 'affinity', 2), setFlag('xiaoman_stage', 1)] },
    ],
  },
  {
    id: 'xiaoman-2-last-bus', npcId: 'lin_xiaoman', title: '错过末班车', category: 'NPC · 林小满', contexts: ['social', 'life', 'delivery'], weight: 10,
    condition: (s) => flag(s, 'xiaoman_stage') === 1 && s.day >= 4,
    description: '凌晨一点，你在医院附近又碰见林小满。她刚下班，末班车已经走了，手机电量只剩 3%。',
    choices: [
      { id: 'ride', label: '推着车陪她走到能打车的路口', result: '你们聊了二十多分钟，第一次知道彼此不工作时是什么样。', effects: [time(24), relationship('lin_xiaoman', 'trust', 12), relationship('lin_xiaoman', 'bond', 10), stat('energy', -3), setFlag('xiaoman_stage', 2)] },
      { id: 'charger', label: '把充电宝借给她', result: '她记下你的联系方式，说第二天一定还。', effects: [time(5), relationship('lin_xiaoman', 'trust', 8), relationship('lin_xiaoman', 'affinity', 6), setFlag('xiaoman_stage', 2)] },
      { id: 'directions', label: '告诉她附近还有夜班公交', result: '你帮她查好路线，然后继续工作。', effects: [relationship('lin_xiaoman', 'affinity', 3), setFlag('xiaoman_stage', 2)] },
    ],
  },
  {
    id: 'xiaoman-3-empty-bed', npcId: 'lin_xiaoman', title: '空病床边的人影', category: 'NPC · 林小满', contexts: ['delivery', 'social'], weight: 11,
    condition: (s) => flag(s, 'xiaoman_stage') === 2 && s.day >= 7,
    description: '林小满把你拉到楼梯间，小声问：“你送夜单多……有没有见过不太正常的东西？”她说病房里有一张空床，每晚都有人替不存在的病人掖被角。',
    choices: [
      { id: 'tell', label: '告诉她你也见过异常', result: '她没有笑你，只长长松了口气：“原来不是我疯了。”', effects: [relationship('lin_xiaoman', 'trust', 18), relationship('lin_xiaoman', 'bond', 8), setFlag('xiaoman_knows', true), setFlag('xiaoman_stage', 3)] },
      { id: 'protect', label: '只说可能是太累，让她先休息', result: '她点头，但显然知道你没说实话。', effects: [relationship('lin_xiaoman', 'affinity', 5), relationship('lin_xiaoman', 'trust', -3), setFlag('xiaoman_stage', 3)] },
      { id: 'investigate', label: '答应今晚帮她看看', result: '你在病房外守了半小时，最后只看到一团淡得快散掉的阴气。', effects: [time(35), stat('qi', 5), stat('darkQi', 1), relationship('lin_xiaoman', 'trust', 15), relationship('lin_xiaoman', 'bond', 12), setFlag('xiaoman_knows', true), setFlag('xiaoman_stage', 3)] },
    ],
  },
  {
    id: 'xiaoman-4-crossroads', npcId: 'lin_xiaoman', title: '天亮之前', category: 'NPC · 林小满', contexts: ['social'], weight: 14,
    condition: (s) => flag(s, 'xiaoman_stage') === 3 && rel(s, 'lin_xiaoman').trust >= 20,
    description: '你们坐在医院后门台阶上等天亮。林小满突然问：“如果以后越来越危险，你还会来这里吗？”这不像是在问送餐。',
    choices: [
      { id: 'romance', label: '“会。不是因为订单。”', result: '她低头笑了很久。你们没有给关系取名字，但从今天开始已经不一样。', effects: [relationship('lin_xiaoman', 'romance', 25), relationship('lin_xiaoman', 'bond', 15), relationship('lin_xiaoman', 'trust', 10), route('lin_xiaoman', 'romance'), setFlag('xiaoman_stage', 4)] },
      { id: 'friend', label: '“会，你是我很重要的朋友。”', result: '她认真点头：“那就说定了。出事别一个人扛。”', effects: [relationship('lin_xiaoman', 'bond', 20), relationship('lin_xiaoman', 'trust', 12), route('lin_xiaoman', 'close-friend'), setFlag('xiaoman_stage', 4)] },
      { id: 'distance', label: '“最好别再卷进这些事。”', result: '她说理解。之后你们仍会见面，只是有些话再也没继续。', effects: [relationship('lin_xiaoman', 'trust', -8), route('lin_xiaoman', 'estranged'), setFlag('xiaoman_stage', 4)] },
    ],
  },
  {
    id: 'xiaoman-5-dawn', npcId: 'lin_xiaoman', title: '两份早餐', category: 'NPC · 林小满', contexts: ['social'], weight: 7,
    condition: (s) => flag(s, 'xiaoman_stage') === 4 && !flag(s, 'xiaoman_dawn') && (rel(s, 'lin_xiaoman').route === 'romance' || rel(s, 'lin_xiaoman').route === 'close-friend'),
    description: '林小满下班时提着两份早餐：“我猜你又修了一夜。别问，另一份就是你的。”',
    choices: [
      { id: 'stay', label: '坐下来一起吃', result: '城市开始早高峰时，你们已经把最安静的那段清晨分完了。', effects: [time(30), stat('energy', 10), stat('stress', -10), relationship('lin_xiaoman', 'bond', 12), relationship('lin_xiaoman', 'romance', 8), setFlag('xiaoman_dawn')] },
      { id: 'work', label: '收下早餐，赶早高峰', result: '她把豆浆塞进你外卖箱侧袋：“至少路上喝。”', effects: [stat('energy', 6), relationship('lin_xiaoman', 'affinity', 5), setFlag('xiaoman_dawn')] },
    ],
  },

  {
    id: 'zhou-1-rain', npcId: 'zhou_ye', title: '雨里扶车的人', category: 'NPC · 周野', contexts: ['delivery', 'travel'], weight: 9,
    condition: (s) => !flag(s, 'zhou_stage') && s.day >= 1,
    description: '路口一辆外卖车侧倒，骑手裤腿全是泥。你刚停下，他就摆手：“别管我，先看餐撒没撒。”',
    choices: [
      { id: 'help', label: '先帮他把车扶起来', result: '他自我介绍叫周野，临走前拍了拍你的箱子：“下次换我帮你。”', effects: [time(10), relationship('zhou_ye', 'trust', 8), relationship('zhou_ye', 'bond', 8), stat('karma', 1), setFlag('zhou_stage', 1)] },
      { id: 'meal', label: '帮他重新固定撒乱的餐', result: '你们一起把还能救的订单收拾好。', effects: [time(8), relationship('zhou_ye', 'affinity', 7), relationship('zhou_ye', 'trust', 5), setFlag('zhou_stage', 1)] },
      { id: 'rush', label: '确认他没受伤就走', result: '他朝你挥挥手。你们后来还是会在站点见到。', effects: [relationship('zhou_ye', 'affinity', 2), setFlag('zhou_stage', 1)] },
    ],
  },
  {
    id: 'zhou-2-battery', npcId: 'zhou_ye', title: '最后一块满电电池', category: 'NPC · 周野', contexts: ['social', 'life', 'delivery'], weight: 10,
    condition: (s) => flag(s, 'zhou_stage') === 1 && s.day >= 4,
    description: '暴雨前换电站只剩一块满电电池。你和周野的车都快没电了。',
    choices: [
      { id: 'give', label: '让给周野', result: '他没说谢谢，只把自己今天最赚钱的一条路线发给了你。', effects: [relationship('zhou_ye', 'trust', 14), relationship('zhou_ye', 'bond', 8), stat('bikeBattery', -8), setFlag('zhou_stage', 2)] },
      { id: 'share', label: '各跑半程，之后回来轮换', result: '计划麻烦，但你们真的靠一块电池撑过了晚高峰。', effects: [time(20), stat('money', 18), relationship('zhou_ye', 'bond', 14), relationship('zhou_ye', 'trust', 10), setFlag('zhou_stage', 2)] },
      { id: 'take', label: '自己先拿', result: '周野耸耸肩，没有抱怨。', effects: [stat('bikeBattery', 30), relationship('zhou_ye', 'trust', -5), setFlag('zhou_stage', 2)] },
    ],
  },
  {
    id: 'zhou-3-secret', npcId: 'zhou_ye', title: '他看见你“太快了”', category: 'NPC · 周野', contexts: ['delivery', 'social'], weight: 11,
    condition: (s) => flag(s, 'zhou_stage') === 2 && s.realmLevel >= 1,
    description: '一单快超时时，你无意识地运转灵气，几乎瞬间冲上七层楼。周野正好从楼梯口出来，盯着你半天：“你是不是该解释一下？”',
    choices: [
      { id: 'truth', label: '告诉他一部分真相', result: '周野沉默很久，只问：“所以以后真有鬼，你能打吗？”', effects: [relationship('zhou_ye', 'trust', 20), relationship('zhou_ye', 'bond', 10), setFlag('zhou_knows'), setFlag('zhou_stage', 3)] },
      { id: 'joke', label: '说自己最近在练跑酷', result: '他显然不信，但没继续追问。', effects: [relationship('zhou_ye', 'affinity', 3), relationship('zhou_ye', 'trust', -4), setFlag('zhou_stage', 3)] },
    ],
  },
  {
    id: 'zhou-4-friend', npcId: 'zhou_ye', title: '谁先倒谁请客', category: 'NPC · 周野', contexts: ['social'], weight: 13,
    condition: (s) => flag(s, 'zhou_stage') === 3 && rel(s, 'zhou_ye').trust >= 20,
    description: '收工后周野把两瓶汽水放在路边护栏上：“以后你那边有怪事叫我。打不过我至少能帮你叫救护车。”',
    choices: [
      { id: 'brother', label: '碰瓶：“那就互相捞。”', result: '你们约定谁先倒下谁请宵夜。这个约定后来救过你们不止一次。', effects: [relationship('zhou_ye', 'trust', 15), relationship('zhou_ye', 'bond', 22), route('zhou_ye', 'close-friend'), setFlag('zhou_stage', 4)] },
      { id: 'ordinary', label: '“怪事我处理，你帮我看普通订单。”', result: '他骂你见外，但还是答应了。', effects: [relationship('zhou_ye', 'trust', 9), relationship('zhou_ye', 'bond', 9), route('zhou_ye', 'friend'), setFlag('zhou_stage', 4)] },
    ],
  },
  {
    id: 'zhou-5-pact', npcId: 'zhou_ye', title: '备用头盔', category: 'NPC · 周野', contexts: ['social'], weight: 6,
    condition: (s) => flag(s, 'zhou_stage') === 4 && !flag(s, 'zhou_pact') && rel(s, 'zhou_ye').route === 'close-friend',
    description: '周野把一个旧头盔扔给你：“备用的。真遇到那种东西，别又拿脑袋硬扛。”',
    choices: [
      { id: 'keep', label: '收下', result: '头盔很旧，但内衬洗得很干净。', effects: [relationship('zhou_ye', 'bond', 12), stat('health', 4), setFlag('zhou_pact')] },
      { id: 'return', label: '让他自己留着', result: '你说他比你更容易摔。他骂了两句，最后笑了。', effects: [relationship('zhou_ye', 'affinity', 8), setFlag('zhou_pact')] },
    ],
  },

  {
    id: 'qinghe-1-bookshop', npcId: 'su_qinghe', title: '书页上的第二种墨', category: 'NPC · 苏青禾', contexts: ['life', 'cultivation'], weight: 9,
    condition: (s) => !flag(s, 'qinghe_stage') && s.day >= 4 && (s.insight >= 2 || flag(s, 'small_cycle_notes') === true),
    description: '你去旧书店找修炼资料。店员苏青禾翻了翻你手里的笔记，说：“这一页不是印刷墨，是朱砂和灵兽血的混合物。”',
    choices: [
      { id: 'ask', label: '问她为什么认识', result: '她没有直接回答，只给你留了书店关门后的时间。', effects: [relationship('su_qinghe', 'trust', 8), relationship('su_qinghe', 'affinity', 6), setFlag('qinghe_stage', 1)] },
      { id: 'pretend', label: '装作听不懂', result: '她看你一眼，把书还回来：“那就当我没说。”', effects: [relationship('su_qinghe', 'affinity', 2), setFlag('qinghe_stage', 1)] },
    ],
  },
  {
    id: 'qinghe-2-decipher', npcId: 'su_qinghe', title: '关门后的旧书店', category: 'NPC · 苏青禾', contexts: ['social', 'cultivation'], weight: 10,
    condition: (s) => flag(s, 'qinghe_stage') === 1 && s.day >= 6,
    description: '卷帘门落下后，苏青禾从柜台底下拿出一摞手抄本。她说这些字每隔几十年就会重新有人看懂一次。',
    choices: [
      { id: 'learn', label: '和她一起整理到深夜', result: '你们把散乱术语对应起来，很多以前不懂的地方突然连上了。', effects: [time(90), stat('insight', 2), relationship('su_qinghe', 'trust', 12), relationship('su_qinghe', 'bond', 7), setFlag('qinghe_stage', 2)] },
      { id: 'coin', label: '给她看旧铜钱或符纸', result: '她脸色第一次变了：“这个东西不该在普通人手里。”', effects: [relationship('su_qinghe', 'trust', 15), stat('insight', 1), setFlag('qinghe_stage', 2), setFlag('qinghe_saw_relic')] },
      { id: 'leave', label: '觉得太危险，先走', result: '她没有拦你，只说门一直在。', effects: [relationship('su_qinghe', 'trust', -3), setFlag('qinghe_stage', 2)] },
    ],
  },
  {
    id: 'qinghe-3-confession', npcId: 'su_qinghe', title: '谁先承认自己在修仙', category: 'NPC · 苏青禾', contexts: ['social'], weight: 12,
    condition: (s) => flag(s, 'qinghe_stage') === 2 && s.realmLevel >= 1,
    description: '苏青禾直接问：“你已经引气入体了，对吧？”她的指尖也浮起一缕极淡的灵光。',
    choices: [
      { id: 'honest', label: '坦白自己的修炼经历', result: '她把自己的笔记也推了过来。两个半吊子的秘密终于放在同一张桌上。', effects: [relationship('su_qinghe', 'trust', 20), relationship('su_qinghe', 'bond', 12), setFlag('qinghe_knows'), setFlag('qinghe_stage', 3)] },
      { id: 'guarded', label: '只承认会一点吐纳', result: '她没有拆穿你，只把最危险的那几页收了回去。', effects: [relationship('su_qinghe', 'trust', 5), setFlag('qinghe_stage', 3)] },
    ],
  },
  {
    id: 'qinghe-4-road', npcId: 'su_qinghe', title: '同行还是各走各路', category: 'NPC · 苏青禾', contexts: ['social'], weight: 13,
    condition: (s) => flag(s, 'qinghe_stage') === 3 && rel(s, 'su_qinghe').trust >= 20,
    description: '苏青禾找到一条关于城外旧道观的线索。她问你愿不愿意以后一起验证这些东西，不是谁教谁，而是互相把对方从坑里拽出来。',
    choices: [
      { id: 'peer', label: '“一起走。”', result: '你们约定资料共享、危险共享、活着回来也共享。', effects: [relationship('su_qinghe', 'trust', 15), relationship('su_qinghe', 'bond', 18), route('su_qinghe', 'mentor'), setFlag('qinghe_stage', 4)] },
      { id: 'friend', label: '只做朋友，不共同冒险', result: '她接受这个边界，也仍然愿意帮你查资料。', effects: [relationship('su_qinghe', 'trust', 10), relationship('su_qinghe', 'bond', 8), route('su_qinghe', 'friend'), setFlag('qinghe_stage', 4)] },
      { id: 'leave', label: '彻底退出她的调查', result: '苏青禾合上书：“明白。那以后我不把你算进计划。”', effects: [route('su_qinghe', 'estranged'), setFlag('qinghe_stage', 4)] },
    ],
  },
  {
    id: 'qinghe-5-oath', npcId: 'su_qinghe', title: '旧道观的约定', category: 'NPC · 苏青禾', contexts: ['social', 'cultivation'], weight: 7,
    condition: (s) => flag(s, 'qinghe_stage') === 4 && !flag(s, 'qinghe_oath') && rel(s, 'su_qinghe').route === 'mentor' && s.realmLevel >= 2,
    description: '临行前，苏青禾把一半地图给你：“如果有一天我没回来，另一半线索在你手里。”',
    choices: [
      { id: 'promise', label: '“那你也得替我保管一半。”', result: '你撕下自己的笔记一页交给她。不是誓言，却比誓言更实际。', effects: [relationship('su_qinghe', 'trust', 15), relationship('su_qinghe', 'bond', 15), setFlag('qinghe_oath')] },
      { id: 'refuse', label: '不接受这种不吉利的安排', result: '她笑你迷信，还是把地图收了回去。', effects: [relationship('su_qinghe', 'affinity', 5), setFlag('qinghe_oath', false)] },
    ],
  },

  {
    id: 'wang-1-meal', npcId: 'wang_shu', title: '多出来的一碗面', category: 'NPC · 王叔', contexts: ['delivery', 'life'], weight: 9,
    condition: (s) => !flag(s, 'wang_stage') && s.day >= 2,
    description: '老王牛肉面打烊前，王叔把一碗没下单的面推给你：“别问，后厨做多了。你脸色跟纸一样。”',
    choices: [
      { id: 'eat', label: '坐下吃完', result: '热汤下肚，你第一次和王叔聊了配送之外的事。', effects: [time(20), stat('energy', 18), stat('health', 3), relationship('wang_shu', 'affinity', 10), relationship('wang_shu', 'bond', 6), setFlag('wang_stage', 1)] },
      { id: 'pay', label: '坚持把钱留下', result: '王叔骂你轴，最后只收了五块。', effects: [stat('money', -5), stat('energy', 15), relationship('wang_shu', 'trust', 7), setFlag('wang_stage', 1)] },
    ],
  },
  {
    id: 'wang-2-closing', npcId: 'wang_shu', title: '一起收摊', category: 'NPC · 王叔', contexts: ['social', 'life'], weight: 9,
    condition: (s) => flag(s, 'wang_stage') === 1 && s.day >= 5,
    description: '店里水管坏了，王叔一个人搬桌子。平台正好开始爆单。',
    choices: [
      { id: 'help', label: '关半小时接单，帮他收拾', result: '你们折腾得一身水。王叔只说：“以后饿了就来，别客气。”', effects: [time(35), relationship('wang_shu', 'trust', 14), relationship('wang_shu', 'bond', 12), stat('karma', 1), setFlag('wang_stage', 2)] },
      { id: 'work', label: '先跑高峰，之后回来看看', result: '回来时店已经收完。王叔说没事，但语气比平时客气。', effects: [stat('money', 15), relationship('wang_shu', 'affinity', 3), setFlag('wang_stage', 2)] },
    ],
  },
  {
    id: 'wang-3-son', npcId: 'wang_shu', title: '没有寄出的消息', category: 'NPC · 王叔', contexts: ['social'], weight: 11,
    condition: (s) => flag(s, 'wang_stage') === 2 && s.day >= 9,
    description: '王叔让你帮忙看手机，说不会发语音。你才知道他儿子很多年没回这座城，他每个月仍会发一句“店里都好”。',
    choices: [
      { id: 'listen', label: '陪他把想说的话说完', result: '最后那条语音还是没发出去，但王叔看起来轻松了一些。', effects: [time(18), relationship('wang_shu', 'trust', 15), relationship('wang_shu', 'bond', 15), setFlag('wang_stage', 3)] },
      { id: 'send', label: '劝他直接发出去', result: '王叔犹豫很久，按下发送。第二天仍没有回复。', effects: [relationship('wang_shu', 'trust', 8), relationship('wang_shu', 'bond', 7), setFlag('wang_stage', 3)] },
    ],
  },
  {
    id: 'wang-4-family', npcId: 'wang_shu', title: '以后别叫老板', category: 'NPC · 王叔', contexts: ['social'], weight: 12,
    condition: (s) => flag(s, 'wang_stage') === 3 && rel(s, 'wang_shu').trust >= 20,
    description: '王叔把店门钥匙丢给你一把：“以后半夜饿了自己进来热东西。还有，别老老板老板的，叫王叔。”',
    choices: [
      { id: 'family', label: '把钥匙收好', result: '你忽然发现，这座城里第一次有了一个不需要消费也能推门进去的地方。', effects: [relationship('wang_shu', 'trust', 15), relationship('wang_shu', 'bond', 22), route('wang_shu', 'family'), setFlag('wang_stage', 4)] },
      { id: 'friend', label: '钥匙不收，但常来吃面', result: '王叔骂你见外，最后把钥匙挂回墙上。', effects: [relationship('wang_shu', 'bond', 12), route('wang_shu', 'friend'), setFlag('wang_stage', 4)] },
    ],
  },
  {
    id: 'wang-5-table', npcId: 'wang_shu', title: '收摊后的那张桌', category: 'NPC · 王叔', contexts: ['social'], weight: 6,
    condition: (s) => flag(s, 'wang_stage') === 4 && !flag(s, 'shared_table') && rel(s, 'wang_shu').route === 'family',
    description: '王叔收摊后没关最后一盏灯。周野碰巧来换电，林小满也刚下班。桌上摆着几盘后厨剩菜。',
    choices: [
      { id: 'sit', label: '坐下一起吃', result: '没有大事发生。但你很久以后仍会记得这一顿。', effects: [time(45), stat('stress', -14), stat('energy', 12), relationship('wang_shu', 'bond', 12), setFlag('shared_table')] },
      { id: 'leave', label: '今天太累，先回去', result: '王叔给你打包一份：“下次别跑。”', effects: [stat('energy', 7), setFlag('shared_table')] },
    ],
  },

  {
    id: 'xu-1-photo', npcId: 'xu_yao', title: '照片里多出来的人', category: 'NPC · 许遥', contexts: ['delivery', 'travel'], weight: 8,
    condition: (s) => !flag(s, 'xu_stage') && s.day >= 6 && (s.realmLevel >= 1 || flag(s, 'saw_ghost_market') === true || flag(s, 'door_spirit_seen') === true),
    description: '一个背相机的女人拦住你。她叫许遥，照片里拍到你从一栋楼出来，而你身后跟着一个没有脸的人。',
    choices: [
      { id: 'look', label: '仔细看照片', result: '照片不是伪造。更麻烦的是，你记得当时身后明明没人。', effects: [stat('insight', 1), relationship('xu_yao', 'trust', 6), relationship('xu_yao', 'affinity', 4), setFlag('xu_stage', 1)] },
      { id: 'delete', label: '让她删掉', result: '许遥没有答应，只说：“那你至少告诉我为什么。”', effects: [relationship('xu_yao', 'trust', -2), setFlag('xu_stage', 1)] },
    ],
  },
  {
    id: 'xu-2-investigation', npcId: 'xu_yao', title: '她的怪谈地图', category: 'NPC · 许遥', contexts: ['social', 'travel'], weight: 10,
    condition: (s) => flag(s, 'xu_stage') === 1 && s.day >= 9,
    description: '许遥摊开一张城市地图，上面密密麻麻标着失踪、电梯故障、夜间目击和废弃建筑。很多点正好与你接过的怪单重合。',
    choices: [
      { id: 'compare', label: '拿自己的经历和她核对', result: '两条原本不相干的线索连在了一起。她第一次真正相信你。', effects: [time(35), stat('insight', 2), relationship('xu_yao', 'trust', 16), relationship('xu_yao', 'bond', 8), setFlag('xu_stage', 2)] },
      { id: 'listen', label: '只听她讲，不透露自己', result: '你知道了很多，但她也看出你在保留。', effects: [stat('insight', 1), relationship('xu_yao', 'trust', 3), setFlag('xu_stage', 2)] },
    ],
  },
  {
    id: 'xu-3-evidence', npcId: 'xu_yao', title: '真相值多少钱', category: 'NPC · 许遥', contexts: ['social'], weight: 11,
    condition: (s) => flag(s, 'xu_stage') === 2,
    description: '许遥拿到一段足以引发轰动的视频。她没有立刻发布，而是问你：“如果所有人都知道这些是真的，会更安全吗？”',
    choices: [
      { id: 'nuance', label: '说真相也需要边界', result: '她把硬盘合上：“至少你不是只想把秘密据为己有。”', effects: [relationship('xu_yao', 'trust', 14), relationship('xu_yao', 'bond', 8), setFlag('xu_stage', 3)] },
      { id: 'publish-now', label: '主张立刻公开', result: '她没有马上按下发布，但开始认真准备证据链。', effects: [relationship('xu_yao', 'affinity', 7), setFlag('xu_prefers_public'), setFlag('xu_stage', 3)] },
      { id: 'destroy', label: '主张销毁证据', result: '许遥看了你很久：“你怕的到底是别人知道，还是你失去控制？”', effects: [relationship('xu_yao', 'trust', -8), setFlag('xu_stage', 3)] },
    ],
  },
  {
    id: 'xu-4-choice', npcId: 'xu_yao', title: '把夜晚交给谁', category: 'NPC · 许遥', contexts: ['social'], weight: 13,
    condition: (s) => flag(s, 'xu_stage') === 3 && rel(s, 'xu_yao').trust >= 15,
    description: '许遥已经整理出第一批可以公开的材料。她把最终决定留给你：公开可验证的部分，还是把线索封存，只用于保护具体的人。',
    choices: [
      { id: 'public', label: '公开可验证的部分', result: '你们删掉可能伤害普通人的细节，只留下足以证明异常存在的证据。', effects: [relationship('xu_yao', 'trust', 15), relationship('xu_yao', 'bond', 14), route('xu_yao', 'partner'), setFlag('public_truth'), setFlag('xu_stage', 4)] },
      { id: 'secret', label: '封存证据，优先保护人', result: '许遥同意暂不发布，并建立一份只用于预警的秘密档案。', effects: [relationship('xu_yao', 'trust', 18), relationship('xu_yao', 'bond', 12), route('xu_yao', 'partner'), setFlag('protect_secret'), setFlag('xu_stage', 4)] },
      { id: 'walk-away', label: '不再参与她的调查', result: '许遥没有追问。从此她只在必要时给你发一条没有寒暄的信息。', effects: [route('xu_yao', 'estranged'), setFlag('xu_stage', 4)] },
    ],
  },
  {
    id: 'xu-5-rooftop', npcId: 'xu_yao', title: '城市凌晨四点', category: 'NPC · 许遥', contexts: ['social'], weight: 6,
    condition: (s) => flag(s, 'xu_stage') === 4 && !flag(s, 'xu_rooftop') && rel(s, 'xu_yao').route === 'partner',
    description: '许遥把相机放在天台护栏上。凌晨四点的城市看起来仍然完全普通。她说：“也许普通本来就是很多人拼命维持出来的。”',
    choices: [
      { id: 'agree', label: '“那就一起维持。”', result: '你们没有再谈宏大的真相，只把下一处异常地点记进共享地图。', effects: [relationship('xu_yao', 'bond', 15), relationship('xu_yao', 'trust', 8), setFlag('xu_rooftop')] },
      { id: 'silence', label: '安静看一会天亮', result: '有些答案不需要说出来。', effects: [time(15), stat('stress', -6), relationship('xu_yao', 'affinity', 6), setFlag('xu_rooftop')] },
    ],
  },

  {
    id: 'xiaoman-ambient', npcId: 'lin_xiaoman', title: '一句“到家了吗”', category: 'NPC · 林小满', contexts: ['social'], weight: 3,
    condition: (s) => rel(s, 'lin_xiaoman').met && flag(s, 'xiaoman_stage') === 4 && rel(s, 'lin_xiaoman').route !== 'estranged',
    description: '你们并不总有大事可聊。有时只是一条很短的消息：“今天收车了吗？”',
    choices: [{ id: 'reply', label: '认真回一句', result: '普通的关心没有奖励提示，但你知道它有重量。', effects: [time(8), relationship('lin_xiaoman', 'bond', 2), stat('stress', -2)] }],
  },
  {
    id: 'zhou-ambient', npcId: 'zhou_ye', title: '路边五分钟', category: 'NPC · 周野', contexts: ['social'], weight: 3,
    condition: (s) => rel(s, 'zhou_ye').met && flag(s, 'zhou_stage') === 4 && rel(s, 'zhou_ye').route !== 'estranged',
    description: '你和周野在路边停五分钟，互相吐槽今天最离谱的一单。',
    choices: [{ id: 'chat', label: '再坐一会', result: '五分钟变成了十五分钟。', effects: [time(15), relationship('zhou_ye', 'bond', 2), stat('stress', -3)] }],
  },
  {
    id: 'qinghe-ambient', npcId: 'su_qinghe', title: '互换笔记', category: 'NPC · 苏青禾', contexts: ['social'], weight: 3,
    condition: (s) => rel(s, 'su_qinghe').met && flag(s, 'qinghe_stage') === 4 && rel(s, 'su_qinghe').route !== 'estranged',
    description: '苏青禾发来一页新抄的术语对照表，顺便把你上次写错的三个字圈了出来。',
    choices: [{ id: 'review', label: '回去重抄一遍', result: '她回了一个“这次像样了”。', effects: [time(20), relationship('su_qinghe', 'trust', 2), stat('insight', 1)] }],
  },
  {
    id: 'wang-ambient', npcId: 'wang_shu', title: '后厨留的一碗汤', category: 'NPC · 王叔', contexts: ['social'], weight: 3,
    condition: (s) => rel(s, 'wang_shu').met && flag(s, 'wang_stage') === 4,
    description: '王叔什么也没问，直接从后厨端出一碗汤：“喝完再走。”',
    choices: [{ id: 'drink', label: '喝掉', result: '有时候恢复状态不需要丹药。', effects: [time(15), relationship('wang_shu', 'affinity', 2), stat('energy', 7), stat('health', 2)] }],
  },
  {
    id: 'xu-ambient', npcId: 'xu_yao', title: '一张没有解释的照片', category: 'NPC · 许遥', contexts: ['social'], weight: 3,
    condition: (s) => rel(s, 'xu_yao').met && flag(s, 'xu_stage') === 4 && rel(s, 'xu_yao').route === 'partner',
    description: '许遥发来一张凌晨街口的照片。照片里什么都没有，但你立刻知道她为什么发给你。',
    choices: [{ id: 'mark', label: '把地点记下来', result: '共享地图上又多了一个小小的红点。', effects: [time(6), relationship('xu_yao', 'trust', 2), stat('insight', 1)] }],
  },
];
