import type { EventDefinition, EventEffect, GameState, NpcId, RelationshipField } from './types';

const night = (s: GameState) => s.minute >= 20 * 60 || s.minute < 6 * 60;
const stat = (key: 'money' | 'energy' | 'health' | 'stress' | 'reputation' | 'bikeBattery' | 'qi' | 'insight' | 'karma' | 'darkQi', delta: number): EventEffect => ({ type: 'stat', key, delta });
const time = (minutes: number): EventEffect => ({ type: 'time', minutes });
const flag = (key: string, value: string | number | boolean = true): EventEffect => ({ type: 'flag', key, value });
const relationship = (npcId: NpcId, key: RelationshipField, delta: number): EventEffect => ({ type: 'relationship', npcId, key, delta });

export const DELIVERY_CHOICE_EVENTS: EventDefinition[] = [
  {
    id: 'delivery-kitchen-gridlock',
    title: '后厨卡单',
    category: '配送抉择 · 商家',
    contexts: ['delivery'],
    weight: 7,
    description: '送达这单后，平台又弹出同一家店的催单。你回头看见后厨已经堵成一团，店员把几份餐贴错了单号，门口还有三个骑手在等。',
    choices: [
      { id: 'wait', label: '留下来等店员重新核对', result: '你多等了一会，至少下一位顾客不会拿错餐。', effects: [time(12), stat('stress', 2), stat('reputation', 1)] },
      { id: 'help', label: '帮忙按单号重新排好', result: '你和店员一起把桌上的袋子分清，后厨终于顺了一点。', effects: [time(8), stat('energy', -3), stat('karma', 1), stat('reputation', 1)] },
      { id: 'leave', label: '不掺和，马上离开', result: '你把自己的这一单收尾，下一条路继续由平台安排。', effects: [stat('stress', -1)] },
    ],
  },
  {
    id: 'delivery-elevator-out',
    title: '电梯停在十三楼',
    category: '配送抉择 · 楼宇',
    contexts: ['delivery'],
    weight: 7,
    condition: (s) => s.energy >= 10,
    description: '顾客签收后，电梯忽然显示检修。楼道里贴着一张通知：至少半小时后恢复。你还在高层，下一单已经开始倒计时。',
    choices: [
      { id: 'stairs', label: '直接走楼梯下去', result: '十几层楼跑下来腿有点软，但你很快回到街面。', effects: [time(10), stat('energy', -7), stat('reputation', 1)] },
      { id: 'wait', label: '等物业恢复电梯', result: '你坐在消防通道边歇了一阵，时间却一点没停。', effects: [time(22), stat('energy', 5), stat('stress', -3)] },
      { id: 'ask', label: '问保安有没有货梯', result: '保安带你绕到后场货梯，省下一大段楼梯。', effects: [time(7), stat('stress', 1)] },
    ],
  },
  {
    id: 'delivery-leaking-soup',
    title: '汤洒了一点',
    category: '配送抉择 · 售后',
    contexts: ['delivery'],
    weight: 6,
    description: '顾客接过袋子时发现汤盒边缘渗出来一点。餐还能吃，但包装明显不好看。对方没有立刻投诉，只看着你等一个说法。',
    choices: [
      { id: 'return', label: '联系商家重新补一份', result: '你折返回去补餐，再送回来。麻烦，但顾客最后撤掉了投诉入口。', effects: [time(24), stat('energy', -4), stat('reputation', 2)] },
      { id: 'compensate', label: '自己补 ¥12 表示歉意', result: '顾客收下补偿，说包装确实也可能是店家的问题。', effects: [stat('money', -12), stat('karma', 1), stat('reputation', 1)], requires: { key: 'money', min: 12, label: '需要 ¥12' } },
      { id: 'explain', label: '说明情况，请顾客走平台售后', result: '你把照片和取餐时的封签一起上传，责任留给平台判断。', effects: [time(6), stat('stress', 3)] },
    ],
  },
  {
    id: 'delivery-wrong-building',
    title: '7 栋还是 17 栋',
    category: '配送抉择 · 地址',
    contexts: ['delivery'],
    weight: 6,
    description: '顾客接电话后才发现地址少写了一个“1”。正确位置在小区另一头。平台定位没错，备注却确实写错了。',
    choices: [
      { id: 'redeliver', label: '再送到 17 栋', result: '你多绕了一圈，顾客连声道歉，最后给了你一个好评。', effects: [time(15), stat('energy', -4), stat('reputation', 2)] },
      { id: 'meet-halfway', label: '请顾客下楼到中间碰面', result: '你们在小区中庭碰头，双方都少走了一段。', effects: [time(7), stat('reputation', 1)] },
      { id: 'platform', label: '按平台地址完成并提交证据', result: '平台记录了地址错误，顾客虽然不高兴，却没有继续追责。', effects: [time(4), stat('stress', 4)] },
    ],
  },
  {
    id: 'delivery-gate-locked',
    title: '夜里锁上的侧门',
    category: '配送抉择 · 小区',
    contexts: ['delivery'],
    weight: 5,
    condition: night,
    description: '送完餐准备离开时，小区侧门已经上锁。正门要绕很远，围栏不算高，远处保安亭还亮着灯。',
    choices: [
      { id: 'front', label: '老老实实绕正门', result: '多走一段路，但至少没人会因为你翻栏杆来找麻烦。', effects: [time(12), stat('energy', -3), stat('reputation', 1)] },
      { id: 'guard', label: '去保安亭请人开门', result: '保安核对了你的骑手信息，给你开了侧门。', effects: [time(7), stat('stress', -1)] },
      { id: 'climb', label: '翻过低围栏', result: '你落地时脚下一滑，裤脚也被铁丝划开。', effects: [time(3), stat('health', -4), stat('stress', 3)] },
    ],
  },
  {
    id: 'delivery-customer-extra',
    title: '“能顺手带瓶水吗？”',
    category: '配送抉择 · 顾客',
    contexts: ['delivery'],
    weight: 6,
    description: '顾客签收后发来消息，说家里小孩发烧，问你能不能顺手从楼下便利店带一瓶水上来。平台不会记录这段额外跑腿。',
    choices: [
      { id: 'help', label: '顺手跑一趟', result: '你多跑了一趟。顾客坚持给了你一点现金，说谢谢你没嫌麻烦。', effects: [time(12), stat('energy', -4), stat('money', 8), stat('karma', 2)] },
      { id: 'decline', label: '礼貌拒绝，继续接单', result: '你说明自己还有后续配送，对方也没有为难你。', effects: [stat('reputation', 1)] },
      { id: 'suggest', label: '帮忙找附近即时零售入口', result: '你花几分钟帮对方找到能直接送上楼的店，自己不用再跑一趟。', effects: [time(5), stat('karma', 1), stat('stress', 1)] },
    ],
  },
  {
    id: 'delivery-stray-dog',
    title: '楼下不肯让路的狗',
    category: '配送抉择 · 街巷',
    contexts: ['delivery'],
    weight: 5,
    description: '你刚离开顾客楼下，一只没拴绳的大狗挡在车边。它没有扑上来，但一直盯着你手里的保温箱。',
    choices: [
      { id: 'detour', label: '推车从另一边绕开', result: '你绕了半个街区，安全回到主路。', effects: [time(9), stat('energy', -2)] },
      { id: 'wait', label: '站远一点等它自己走', result: '几分钟后主人终于从便利店出来把狗叫走。', effects: [time(7), stat('stress', 2)] },
      { id: 'observe', label: '不靠近，先观察它在盯什么', result: '你发现它其实一直盯着楼道阴影，而不是保温箱。那片阴影比周围暗得不自然。', effects: [time(5), stat('insight', 1), stat('darkQi', 1), flag('dog_saw_shadow')] },
    ],
  },
  {
    id: 'delivery-false-complaint',
    title: '“我没有收到餐”',
    category: '配送抉择 · 平台',
    contexts: ['delivery'],
    weight: 4,
    condition: (s) => s.completedOrders >= 4,
    description: '订单明明刚刚当面交付，平台却弹出顾客申诉：“未收到餐”。你手机里还留着门牌和封签照片。',
    choices: [
      { id: 'evidence', label: '整理照片提交申诉', result: '平台复核后撤销了处罚，还给你的配送记录加了一条免责备注。', effects: [time(9), stat('reputation', 2), stat('stress', 1)] },
      { id: 'call', label: '直接打电话问顾客', result: '对方沉默几秒，说可能是家里人已经拿进去了，随后撤销申诉。', effects: [time(5), stat('stress', 4)] },
      { id: 'absorb', label: '不争了，自己承担损失', result: '你不想再耗时间，但这笔损失还是落在了自己身上。', effects: [stat('money', -18), stat('stress', 2)] },
    ],
  },
  {
    id: 'delivery-three-doors',
    title: '三扇一模一样的门',
    category: '配送抉择 · 异常',
    contexts: ['delivery'],
    weight: 3,
    condition: (s) => night(s) && (s.darkQi >= 1 || s.completedOrders >= 8),
    description: '顾客关门后，你转身准备离开，却发现走廊尽头多出三扇完全一样的安全门。你明明只记得来时有一扇。',
    choices: [
      { id: 'middle', label: '走中间那扇', result: '门后还是楼梯，但你下到一楼时手机时间跳快了几分钟。', effects: [time(9), stat('darkQi', 2), stat('stress', 5), flag('three_doors_middle')] },
      { id: 'mark', label: '先在地上做记号再试门', result: '你发现左门和右门会把人送回原地，只有中门真的通向楼梯。', effects: [time(14), stat('insight', 2), stat('qi', 3), flag('three_doors_solved')] },
      { id: 'wait', label: '原地等普通住户经过', result: '过了一会，一个拎垃圾袋的人自然地推开“第四扇”门。你眨眼时，另外三扇都不见了。', effects: [time(18), stat('stress', 2), stat('insight', 1)] },
    ],
  },
  {
    id: 'delivery-silent-call',
    title: '没有人说话的电话',
    category: '配送抉择 · 异常',
    contexts: ['delivery'],
    weight: 3,
    condition: (s) => night(s) && s.completedOrders >= 6,
    description: '离开顾客地址后，刚完成的订单号码又打了回来。接通后没有人说话，只有很远的电梯提示音，一层一层往上。',
    choices: [
      { id: 'hang', label: '马上挂断并拉黑', result: '电话没有再响，但你一路都忍不住看后视镜。', effects: [stat('stress', 5)] },
      { id: 'listen', label: '继续听，数电梯到了几楼', result: '提示音停在一个不存在的楼层。你记住了那个数字。', effects: [time(4), stat('insight', 2), stat('darkQi', 1), flag('silent_call_floor')] },
      { id: 'call-back', label: '挂断后反拨回去', result: '系统提示这个号码从未存在。你的通话记录里也只剩一条空白。', effects: [time(3), stat('stress', 3), stat('qi', 2), flag('silent_call_checked')] },
    ],
  },
  {
    id: 'delivery-zhou-battery',
    title: '路口的周野',
    category: '配送抉择 · 同行',
    contexts: ['delivery'],
    weight: 4,
    npcId: 'zhou_ye',
    condition: (s) => s.relationships.zhou_ye.met && s.relationships.zhou_ye.route !== 'estranged' && s.bikeBattery >= 15,
    description: '送完这一单，你在路口碰见周野。他的车只剩一点电，下一单却是医院方向。他朝你扬了扬充电线：“借我撑一段？”',
    choices: [
      { id: 'lend', label: '帮他补一点电', result: '周野重新亮起电门，临走前拍了拍你的车把。', effects: [time(6), stat('bikeBattery', -10), relationship('zhou_ye', 'trust', 5), relationship('zhou_ye', 'bond', 3)] },
      { id: 'route', label: '告诉他最近的换电柜', result: '你把最快路线发给他，至少没耽误太久。', effects: [time(3), relationship('zhou_ye', 'affinity', 2)] },
      { id: 'rush', label: '自己也赶单，先走', result: '周野摆摆手说没事，你们各自钻进车流。', effects: [stat('stress', 1)] },
    ],
  },
  {
    id: 'delivery-rain-package',
    title: '暴雨里的纸袋',
    category: '配送抉择 · 天气',
    contexts: ['delivery'],
    weight: 6,
    condition: (s) => s.weather === 'rain' || s.weather === 'storm',
    description: '刚送完餐，楼下又有人把一份纸袋餐递给骑手。雨太大，普通纸袋几乎一出门就会湿透。店员说没有多余防水袋了。',
    choices: [
      { id: 'wrap', label: '用自己的备用袋重新包一层', result: '你花了点时间把封口重新整理好，至少这一份能扛过雨。', effects: [time(6), stat('reputation', 2), stat('karma', 1)] },
      { id: 'wait-rain', label: '在屋檐下等雨小一点', result: '雨势终于缓了一点，你也顺便喘了口气。', effects: [time(16), stat('energy', 4), stat('stress', -3)] },
      { id: 'decline-next', label: '不接这份，留给有装备的骑手', result: '你没有为了抢一单把餐和自己都赌进暴雨里。', effects: [stat('stress', -1), stat('reputation', 1)] },
    ],
  },
];
