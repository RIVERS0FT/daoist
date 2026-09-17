import type { ActionContext, EventDefinition, EventEffect, GameState } from './types';

const night = (s: GameState) => s.minute >= 20 * 60 || s.minute < 6 * 60;
const flag = (s: GameState, key: string) => s.flags[key];
const stat = (key: Parameters<typeof statEffect>[0], delta: number): EventEffect => statEffect(key, delta);
function statEffect(key: 'money' | 'energy' | 'health' | 'stress' | 'reputation' | 'bikeBattery' | 'qi' | 'insight' | 'karma' | 'darkQi', delta: number): EventEffect { return { type: 'stat', key, delta }; }
const time = (minutes: number): EventEffect => ({ type: 'time', minutes });
const setFlag = (key: string, value: string | number | boolean = true): EventEffect => ({ type: 'flag', key, value });

const rich: EventDefinition[] = [
  { id:'ghost-order', title:'不存在的 404', category:'灵异配送', contexts:['delivery'], weight:2, condition:(s)=>night(s)&&s.completedOrders>=3, description:'导航把你带到幸福家园 4 栋。电梯按钮上没有 4 楼，但订单地址清楚写着“404”。', choices:[{id:'leave',label:'把餐放在一楼',result:'半分钟后订单显示已签收。',effects:[stat('money',18),stat('stress',5)]},{id:'stairs',label:'走安全通道找四楼',result:'楼梯拐角多出一层。门前躺着一张发黄符纸。',effects:[time(18),stat('qi',10),stat('darkQi',2),setFlag('yellow_talisman')]}] },
  { id:'cemetery-order', title:'公墓订单', category:'灵异配送', contexts:['delivery'], weight:1, condition:(s)=>night(s)&&s.realmLevel>=1, description:'地址是青云山公墓 17 排 6 号，商品是红烧肉、白酒和三炷香。备注：“放碑前，别回头。”', choices:[{id:'obey',label:'照做，不回头',result:'走出墓园后，账户里多了一笔找不到来源的转账。',effects:[stat('money',66),stat('karma',2),setFlag('cemetery_customer')]},{id:'look',label:'回头看一眼',result:'碑前坐着一个穿旧式长衫的人。他向你点了点头。',effects:[stat('insight',2),stat('darkQi',5),stat('stress',8)]}] },
  { id:'daoist-order', title:'青云宗订单', category:'机缘', contexts:['delivery'], weight:1, condition:(s)=>s.day>=8&&s.realmLevel>=1, description:'备注：“放在护山阵外石狮旁，不要踏入白线。”配送费异常地高。', choices:[{id:'deliver',label:'规矩送达',result:'白线内伸出一只手取走外卖，留下两枚旧铜钱。',effects:[stat('money',88),stat('qi',8),setFlag('qingyun_contact')]},{id:'cross',label:'跨过白线看看',result:'眼前一晃，你又站回线外，鼻血已经流了下来。',effects:[stat('health',-12),stat('insight',2)]}] },
  { id:'midnight-knock', title:'午夜敲门', category:'灵异', contexts:['cultivation','life'], weight:3, condition:(s)=>s.minute<4*60, description:'凌晨，出租屋门外响起三次敲门声。猫眼里没有人。', choices:[{id:'ignore',label:'不开门',result:'敲门声持续几分钟后消失。',effects:[time(12),stat('stress',6)]},{id:'sense',label:'闭眼感应',result:'门缝外有一缕冰冷气息，转瞬即逝。',effects:[stat('insight',1),stat('darkQi',2),setFlag('door_spirit_seen')],requires:{key:'qi',min:8,label:'需要 8 灵气'}}] },
  { id:'old-lady-1', title:'独居老人', category:'连续剧情', contexts:['delivery'], weight:3, condition:(s)=>!flag(s,'old_lady_stage'), description:'一位独居老太太接过饭菜，问你是不是每天都跑这片。', choices:[{id:'chat',label:'陪她说两分钟话',result:'她笑着说下次还点这家。',effects:[time(4),stat('karma',1),setFlag('old_lady_stage',1)]},{id:'rush',label:'继续跑单',result:'门轻轻关上。',effects:[setFlag('old_lady_stage',1)]}] },
  { id:'old-lady-2', title:'旧铜钱', category:'连续剧情', contexts:['delivery'], weight:3, condition:(s)=>flag(s,'old_lady_stage')===1&&s.completedOrders>=5, description:'又送到老太太家。她把一枚磨亮的旧铜钱塞到你手里：“带着吧，挡灾。”', choices:[{id:'take',label:'收下',result:'铜钱入手微凉，边缘刻着云纹。',effects:[stat('qi',4),setFlag('old_lady_stage',2),setFlag('old_coin')]},{id:'refuse',label:'婉拒',result:'她没有坚持，只说“也好”。',effects:[stat('karma',1),setFlag('old_lady_stage',2)]}] },
  { id:'old-lady-3', title:'拆迁区的地址', category:'连续剧情', contexts:['delivery'], weight:2, condition:(s)=>flag(s,'old_lady_stage')===2&&s.day>=10, description:'平台再次跳出她的名字，可地址是一片五年前就拆掉的老城区。', choices:[{id:'go',label:'按地址过去',result:'废墟里立着一扇孤零零的旧木门。门后有人说：“进来坐坐？”',effects:[time(35),stat('insight',3),stat('qi',12),setFlag('old_lady_stage',3)]},{id:'cancel',label:'取消异常订单',result:'订单从记录里消失，像从没出现过。',effects:[stat('stress',4),setFlag('old_lady_stage',3)]}] },
  { id:'coin-warm', title:'发热的铜钱', category:'连续剧情', contexts:['cultivation'], weight:2, condition:(s)=>flag(s,'old_coin')===true&&night(s), description:'修炼到一半，口袋里的旧铜钱突然发热，表面云纹亮起一瞬。', choices:[{id:'hold',label:'握着继续吐纳',result:'灵气像找到了路，自动汇入丹田。',effects:[stat('qi',15),stat('insight',1),setFlag('coin_awakened')]},{id:'away',label:'先收起来',result:'热度很快消失。',effects:[stat('stress',-2)]}] },
  { id:'black-cat', title:'总在同一条巷子的黑猫', category:'城市', contexts:['delivery','travel'], weight:4, description:'那只缺了半截尾巴的黑猫又蹲在巷口，看你的眼神不像普通动物。', choices:[{id:'feed',label:'买根火腿肠 ¥3',result:'黑猫吃完后在前面走了很久。',effects:[stat('money',-3),stat('karma',1),setFlag('fed_black_cat')]},{id:'watch',label:'观察它',result:'你发现它的影子慢了半拍。',effects:[stat('insight',1),stat('stress',2)]}] },
  { id:'cat-returns', title:'黑猫带路', category:'机缘', contexts:['travel','delivery'], weight:2, condition:(s)=>flag(s,'fed_black_cat')===true&&night(s), description:'黑猫走几步就回头看你，像在示意你跟上。', choices:[{id:'follow',label:'跟上',result:'它把你带到废弃花坛，土里埋着一块刻字碎玉。',effects:[time(22),stat('qi',9),stat('insight',1),setFlag('jade_fragment')]},{id:'work',label:'还要跑单',result:'黑猫钻进夜色。',effects:[stat('reputation',1)]}] },
  { id:'elevator-b0', title:'电梯多出来的一层', category:'灵异', contexts:['delivery'], weight:2, condition:night, description:'楼层显示突然变成“B0”。门外不是地下室，而是一条挂满红灯笼的长街。', choices:[{id:'close',label:'立刻关门',result:'门合上前，你听见外面有人叹气。',effects:[stat('stress',5)]},{id:'peek',label:'探头看一眼',result:'街上那些人没有影子。',effects:[stat('insight',2),stat('darkQi',2),setFlag('saw_ghost_market')]}] },
  { id:'storm-lightning', title:'雷落城南', category:'天气修炼', contexts:['cultivation'], weight:4, condition:(s)=>s.weather==='storm'&&night(s), description:'一道雷劈在远处高楼避雷针上，空气里的灵气像被瞬间点亮。', choices:[{id:'borrow',label:'借雷势吐纳',result:'狂暴灵气冲进经脉。',effects:[stat('qi',14),stat('health',-4)]},{id:'observe',label:'只观察',result:'你记住了雷后灵气扩散的节奏。',effects:[stat('insight',2)]}] },
  { id:'cheap-manual', title:'二手书摊', category:'机缘', contexts:['travel','life'], weight:3, description:'路边旧书摊压着一本《小周天杂记》，老板开价 40。', choices:[{id:'buy',label:'买下 ¥40',result:'大部分像胡编，但两页呼吸法真的有用。',effects:[stat('money',-40),stat('insight',2),setFlag('small_cycle_notes')],requires:{key:'money',min:40,label:'需要 ¥40'}},{id:'skip',label:'不买',result:'离开时你总觉得那本书的位置变了一点。'}] },
  { id:'mirror-breath', title:'镜中的呼吸', category:'灵异', contexts:['cultivation'], weight:2, condition:(s)=>night(s)&&s.darkQi>=3, description:'你睁眼后发现镜子里的自己晚了半秒才睁眼。', choices:[{id:'cover',label:'把镜子盖住',result:'屋里安静下来。',effects:[stat('stress',2),stat('darkQi',-1)]},{id:'stare',label:'继续盯着',result:'镜中人嘴唇动了一下，你理解了一段陌生口诀。',effects:[stat('insight',2),stat('darkQi',3),stat('stress',7)]}] }
];

function ambient(id:string,title:string,category:string,contexts:ActionContext[],description:string,label:string,result:string,effects:EventEffect[],condition?:(s:GameState)=>boolean,weight=5):EventDefinition { return {id,title,category,contexts,weight,description,condition,choices:[{id:'continue',label,result,effects}]}; }

const ambientEvents: EventDefinition[] = [
  ambient('slow-kitchen','后厨爆单','商家',['delivery'],'后厨堆满单子，老板不断喊“马上好”。','等餐','你在门口又等了十四分钟。',[time(14),stat('stress',4)]),
  ambient('customer-tip','意外小费','顾客',['delivery'],'顾客看看天气，又塞给你一点现金。','收下','今天的路似乎顺了一点。',[stat('money',12),stat('karma',1)]),
  ambient('red-lights','一路红灯','交通',['delivery','travel'],'每一个路口都像算好了一样在你抵达前变红。','遵守交通规则','慢一点，至少安全。',[time(9),stat('stress',2)]),
  ambient('flat-tire','轮胎漏气','交通',['delivery','travel'],'后轮越来越软，骑起来像拖着一袋沙。','路边补胎 ¥25','修车师傅动作很快。',[stat('money',-25),time(28)],undefined,3),
  ambient('wrong-address','地址写错一栋','顾客',['delivery'],'顾客电话里说：“不是 7 栋，是 17 栋。”','重新送','你绕了一个大圈。',[time(16),stat('reputation',1)]),
  ambient('rider-fall','同行摔车','骑手',['delivery','travel'],'前方一名骑手摔倒，餐撒了一地。','停车帮忙','你扶起他并把车挪到路边。',[time(12),stat('karma',2),stat('reputation',1)],undefined,4),
  ambient('cancelled-meal','被取消的餐','生活',['delivery'],'订单突然被取消，商家说这份餐你自己处理。','当晚饭吃','一顿热饭让身体缓过来。',[time(18),stat('energy',15),stat('health',3)],undefined,3),
  ambient('landlord-message','房东催租','生活',['life'],'手机弹出房东消息：“这次别再拖啊。”','回复“知道了”','你盯着余额看了一会。',[stat('stress',6)],(s)=>s.rentDueDay-s.day<=2),
  ambient('night-wind','天台夜风','修炼',['cultivation'],'夜风穿过楼群，你第一次感觉到风里有某种可以被“抓住”的东西。','顺势引气','气息沿经脉多走了一小周天。',[stat('qi',6),stat('energy',-3)],night,7),
  ambient('qi-deviation','岔气','修炼',['cultivation'],'疲惫让呼吸节奏突然乱了，胸口一阵发闷。','立即停下','休息一会后并无大碍。',[time(20),stat('health',-2)],(s)=>s.energy<35,3),
  ambient('rain-stranger','屋檐下的陌生人','天气',['delivery','travel'],'暴雨把你逼到屋檐下。老人说这座城以前有七口“锁龙井”。','记住这句话','也许以后会用得上。',[stat('insight',1),setFlag('heard_dragon_wells')],(s)=>s.weather==='rain'||s.weather==='storm',4),
  ambient('energy-drink','免费能量饮料','生活',['life','delivery'],'商家做活动，送了你一罐能量饮料。','喝掉','精神一下提起来，心跳也快了一点。',[stat('energy',18),stat('stress',3)]),
  ambient('battery-fault','换电柜故障','生活',['life'],'常用换电柜显示维护中，另一个柜子要绕路。','绕去下一个柜子','总比半路没电好。',[time(20),stat('bikeBattery',45),stat('money',-6)],(s)=>s.bikeBattery<35,3),
  ambient('incense-shop','快打烊的香烛店','城市',['travel','life'],'老板隔着玻璃看了你很久，说你“身上沾了路上的东西”。','进去看看','他送你一张普通黄纸。',[time(12),stat('darkQi',-2),setFlag('incense_shop')],night,2),
  ambient('morning-sun','清晨第一缕阳光','修炼',['cultivation'],'晨光越过楼顶，丹田里的气息格外清澈。','迎着朝阳吐纳','灵气不多，却异常温和。',[stat('qi',5),stat('health',3)],(s)=>s.minute>=5*60&&s.minute<8*60&&s.weather==='clear',3),
  ambient('drunk-customer','喝醉的顾客','顾客',['delivery'],'顾客明显喝多了，非要拉着你聊人生。','听五分钟','他讲完后给了你一笔小费。',[time(8),stat('money',20),stat('stress',2)],night,4),
  ambient('security-guard','门岗盘问','配送',['delivery'],'小区保安不让外卖车进入，客户又要求送到门口。','停外面走进去','你跑完一段长路。',[time(12),stat('energy',-6)]),
  ambient('found-wallet','路边的钱包','生活',['travel','delivery'],'路边躺着一个钱包，里面有现金和证件。','联系失主','折腾一阵，总算还给本人。',[time(25),stat('karma',4),stat('reputation',2)],undefined,2),
  ambient('temple-bell','远处钟声','机缘',['cultivation','travel'],'城市噪声之间忽然传来一声悠长钟鸣。附近根本没有寺庙。','停下来听','第二声没有响，但你的心跳慢了下来。',[stat('stress',-8),stat('insight',1)],(s)=>night(s)&&s.day>=5,2),
  ambient('body-light','身轻如燕','修炼',['delivery','travel'],'过去会让你喘气的六层楼现在几乎没感觉。','试着跑上去','身体适应了新的力量。',[stat('energy',4),stat('insight',1)],(s)=>s.realmLevel>=2,3),
  ambient('platform-bonus','临时冲单奖','配送',['delivery'],'平台弹出临时奖励：这一单完成可获得额外补贴。','冲一单','高峰期的钱确实更好赚。',[stat('money',10),stat('energy',-3)],(s)=>(s.minute>=11*60&&s.minute<14*60)||(s.minute>=17*60&&s.minute<20*60)),
  ambient('quiet-room','突然安静的出租屋','灵异',['life','cultivation'],'窗外车流还在动，但所有声音忽然消失了三秒。','趁机吐纳','那三秒里灵气浓度高得不可思议。',[stat('qi',7),stat('darkQi',1)],(s)=>night(s)&&s.day>=3,2),
  ambient('dream-method','梦中行气','修炼',['life'],'打盹时，你梦见有人用红线在身上标出一条行气路线。','醒来记下','关键几个穴位还记得。',[stat('insight',2),setFlag('dream_route')],(s)=>s.realmLevel>=1&&s.energy<45,2),
  ambient('hospital-order','住院楼的夜宵','顾客',['delivery'],'顾客问：“你刚才是不是和那个灰袍道士一起上来的？”','问清楚','那人进电梯后按了不存在的楼层。',[stat('insight',1),stat('stress',3),setFlag('grey_robed_daoist')],night,2),
];

export const EVENTS: EventDefinition[] = [...rich, ...ambientEvents];
export const EVENT_MAP = new Map(EVENTS.map((event) => [event.id, event]));
