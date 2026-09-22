/* 原创重建内容。这里集中维护地图、数值配置和剧情，不依赖外部素材。 */
(function (root) {
  'use strict';
  const G = root.NightCourier = root.NightCourier || {};
  G.VERSION = 20;
  G.APP_VERSION = '1.16.0';
  G.SYSTEM_UNLOCK_DELIVERIES = 10;
  G.STARTING_PLACES = Object.freeze(['home','garage']);
  G.TITLE = '外卖修仙录';
  G.SYSTEM_NAME = '外卖系统';
  // 只向东、向南追加网格；原 7×6 城区的坐标、地点 ID 与桥梁不变。
  G.GRID_X = [130, 370, 610, 850, 1090, 1330, 1570, 1810, 2050, 2290, 2530];
  G.GRID_Y = [120, 300, 480, 660, 840, 1020, 1200, 1380, 1560, 1740];
  G.WORLD = { width: 2660, height: 1860, metersPerUnit: 3.5 };
  G.CHARGE = Object.freeze({ minutes: 10, cost: 8 });
  G.ALCHEMY_REALM_BY_TIER = Object.freeze([0,0,0,1,1,2,3,3,4,5]);
  G.AUCTION = Object.freeze({name:'万宝拍卖场',place:'market',opens:1080,roundMinutes:5,lotCount:3,
    openingRatio:.65,stepRatio:.08,maxRivalSteps:8,
    realmByTier:G.ALCHEMY_REALM_BY_TIER});
  // 匿名席位，不作为自动结识的羁绊人物。
  G.AUCTION_BIDDERS = [{id:'herbalist',name:'青衣药商'},{id:'wanderer',name:'赤袖散修'},{id:'collector',name:'青灯藏家'}];
  // 首个可加入宗门，沿用已发布的听雨观坐标，不新增地图捷径或丹方渠道。
  G.SECT = {id:'tingyu',name:'听雨观',place:'temple',joinMinutes:20,rejoinDays:1,
    motto:'不问来处，先护人间。',
    ranks:[
      {name:'外门弟子',realm:1,level:1,earned:0,completed:0,cost:0,minutes:0,stamina:0,training:0},
      {name:'内门弟子',realm:1,level:5,earned:40,completed:3,cost:20,minutes:30,stamina:10,training:.05},
      {name:'亲传弟子',realm:2,level:1,earned:140,completed:10,cost:60,minutes:45,stamina:16,training:.08},
      {name:'护法长老',realm:3,level:1,earned:360,completed:24,cost:120,minutes:60,stamina:24,training:.12}
    ],
    duties:[
      {id:'sweep',name:'洒扫山门',desc:'清理山门石阶，为晚归的同门留一条干净的路。',rank:0,minutes:30,stamina:8,mana:0,contribution:8,qi:4},
      {id:'copy',name:'誊录经卷',desc:'在藏经阁校对旧卷，把修行心得留给后来的人。',rank:0,minutes:45,stamina:10,mana:4,contribution:12,qi:8},
      {id:'ward',name:'温养阵眼',desc:'在观内静室调息，修补守城阵的细小裂隙。',rank:1,minutes:60,stamina:16,mana:8,contribution:20,qi:15}
    ],
    commission:{name:'人间行走',count:3,contribution:20,qi:10},
    library:[
      {id:'rain-breath',name:'听雨吐纳诀',desc:'修炼修为收益 +10%，与现有心法叠加。',rank:0,cost:30,manual:true},
      {id:'steady-heart',name:'守心篇',desc:'突破成功率 +3 个百分点，仍受 95% 上限限制。',rank:1,cost:60,manual:true},
      {id:'gentle-fire',name:'调火札记',desc:'炼药成丹率 +3 个百分点，仍受 98% 上限限制；不是丹方。',rank:2,cost:90,manual:true},
      {id:'herbs',name:'青灵草 ×3',desc:'基础炼药材料，收入行囊。',rank:0,cost:8,item:'herb',count:3},
      {id:'qi-pill',name:'一阶凝气丹 ×1',desc:'收入行囊，使用后才获得修为。',rank:0,cost:12,item:'qi',count:1},
      {id:'foundation-pill',name:'一阶破境丹 ×1',desc:'收入行囊，突破时可选择服用。',rank:1,cost:50,item:'foundation',count:1}
    ]
  };
  // 功能开放只看已结算的经历；门槛、说明和入口共享同一份配置。
  G.FEATURE_UNLOCKS = [
    {id:'system',name:G.SYSTEM_NAME,hint:'先完成九单，再送达非常驻随机地点的第十单并完成解锁剧情',ready:s=>s.stats.delivered>=G.SYSTEM_UNLOCK_DELIVERIES&&s.flags?.systemAwakened===true,
      notice:'第一章「解锁外卖系统」已完成，外卖系统已绑定。之后成功送达外卖可获得外卖币，也可签到、兑换补给和领取委托奖励。'},
    {id:'cultivation',name:'修行',hint:'在外卖系统委托中领取「第一份人间烟火」奖励',requires:['system'],ready:s=>s.claimed.includes('q1'),
      notice:'导航栏已开放修行，先从一次完整的吐纳开始。'},
    {id:'practice',name:'进阶修行与探索',hint:'完成一次吐纳修炼',requires:['cultivation'],ready:s=>s.stats.trained>=1,
      notice:'修行中开放入定、淬体和突破；月渡公园、听雨观开放探索。'},
    {id:'alchemy',name:'炼药',hint:'累计完成 3 单，并完成「地图上多出来的一条线」主线选择',requires:['cultivation'],
      ready:s=>s.stats.delivered>=3&&G.formulaStoryComplete(s,{flag:'storyStreetVein',event:'story-street-vein'}),
      notice:'导航栏已开放炼药，可前往长乐集购买药鼎、药材与商店丹方。'},
    {id:'upgrades',name:'座驾升级',hint:'累计完成并结算 5 单配送',ready:s=>s.stats.delivered>=5,
      notice:'座驾面板已开放升级，需要到修车铺付费改装。'},
    {id:'auction',name:'拍卖场',hint:'开放炼药后，累计完成并结算 10 单配送',requires:['alchemy'],ready:s=>s.stats.delivered>=10,
      notice:'长乐集的万宝拍卖场递来请柬。导航已开放拍卖，每晚 18:00–24:00 可到场竞价。'},
    {id:'endings',name:'归途',hint:'累计完成并结算 20 单配送',requires:['system'],ready:s=>s.stats.delivered>=20,
      notice:'外卖系统已开放归途页，满足各结局条件后可自行选择。'},
    {id:'sect',name:'宗门',hint:'炼气后，通过配送解锁听雨观并结识陆听雨，完成引荐剧情',requires:['practice'],optional:true,ready:s=>s.sect?.invited===true,
      notice:'导航栏已开放宗门。可沿道路到听雨观入宗，做执事、积累贡献、晋升并兑换典籍；也可继续散修。'},
    {id:'bonds',name:'羁绊',hint:'通过配送或奇遇结识第一位人物',optional:true,ready:s=>Object.values(s.bonds).some(b=>b.met===true),
      notice:'导航栏已开放羁绊，只显示真正结识过的人物。'}
  ];
  G.FEATURE_PANELS = {system:'system',cultivation:'cultivation',alchemy:'alchemy',bonds:'bonds',auction:'auction',sect:'sect'};
  G.ROAD_LAYOUT = { riverColumn: 3, bridgeRows: [1, 3, 5, 7] };
  G.ROAD_NODES = G.GRID_Y.flatMap((y,r) => G.GRID_X.map((x,c) => ({x,y,c,r})));
  // 绘制、寻路和途中存档校验共用同一组真实道路，不另画可穿江的假路。
  G.ROAD_EDGES = [];
  for (const [i,a] of G.ROAD_NODES.entries()) {
    if (a.c+1 < G.GRID_X.length && (a.c !== G.ROAD_LAYOUT.riverColumn || G.ROAD_LAYOUT.bridgeRows.includes(a.r)))
      G.ROAD_EDGES.push({from:i,to:i+1});
    if (a.r+1 < G.GRID_Y.length) G.ROAD_EDGES.push({from:i,to:i+G.GRID_X.length});
  }
  const services = [
    ['home', '青藤小屋', 2, 3, 'home', '一间租来的小屋，也是你最初的洞府。'],
    ['garage', '阿默修车铺', 0, 4, 'garage', '修理、升级，以及一位总在等你收工的朋友。'],
    ['clinic', '回春医馆', 3, 1, 'clinic', '白灯下有人医人，灯灭后有人医心。'],
    ['bookshop', '旧雨书店', 1, 1, 'book', '一册失去封皮的旧书，记着这座城的秘密。'],
    ['temple', '听雨观', 5, 0, 'temple', '城北的灵气在入夜后苏醒，修炼收益提高。'],
    ['park', '月渡公园', 5, 3, 'leaf', '江风掠过古井。探索可能带来灵草与奇遇。'],
    ['market', '长乐集', 1, 5, 'market', '买些热饭和灵草，继续奔忙的人间生活。']
  ];
  G.PLACES = services.map(([id, name, c, r, kind, desc]) => ({ id, name, x: G.GRID_X[c], y: G.GRID_Y[r], kind, desc, permanent: true }));
  const names = ['杏花里','松风公寓','青石弄','栖云宿舍','银杏医院','春山大厦','望江台','榆树巷','长风客栈','新桥社区','向阳小学','水岸茶室','海棠新村','北辰写字楼','龙井作坊','听潮楼','流萤公寓','南山工作室','西城花房','观星台','锦鲤小区','青禾餐厅','落霞仓库','雨巷照相馆','望舒公馆','拾光面馆','归鹤庭','白鹭驿','雁回小筑','木棉楼','竹影小院','鸣蝉里','青瓷馆','小满街','临江书院'];
  let n = 0;
  // 旧地点编号按原来的 7×6 顺序生成，不能使用扩展后的行列数重排。
  for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) {
    const x = G.GRID_X[c], y = G.GRID_Y[r];
    if (!G.PLACES.some(p => p.x === x && p.y === y)) G.PLACES.push({ id: `stop-${n}`, name: names[n++], x, y, kind: 'delivery', permanent: false });
  }
  G.DISTRICTS = [
    {id:'yunport',name:'云港新区',cols:[7,8,9,10],rows:[0,1,2],label:{x:2180,y:415},desc:'临海的新城区，夜班写字楼与远航归来的灯火相邻。',
      names:['海岚广场','云港公寓','晨星大厦','归帆客栈','滨海医院','远航写字楼','云港夜校','澄光里','风帆小区','星洲酒店','晴海书屋','云港会展中心']},
    {id:'eastlake',name:'东湖新城',cols:[7,8,9,10],rows:[3,4,5],label:{x:2180,y:955},desc:'湖岸社区沿水铺开，晚归的人总在等一份热饭。',
      names:['东湖庭院','荷风里','碧波茶楼','听荷公寓','湖心美术馆','汀兰小区','东湖体育馆','朝露里','镜湖酒店','柳汀花园','水云居','望湖书院']},
    {id:'south',name:'南郊生活区',cols:[0,1,2,3],rows:[6,7,8],label:{x:470,y:1495},desc:'夜市、学校和物流园连着老城南面的生活。',
      names:['南郊夜市','蒲公英里','榕树公寓','青岚汽车站','稻香社区','禾下食堂','晴川小学','南郊物流园','麦田工作室','向晚小院','丰年里','南桥驿居']},
    {id:'lingxi',name:'灵溪山麓',cols:[4,5,6,7,8,9,10],rows:[6,7,8],label:{x:1810,y:1495},desc:'山脚的茶舍与民居逐水而建，灯火一直延伸到竹林边。',
      names:['灵溪入口','云栈民宿','青竹工坊','栖鹤村','茶山书屋','灵溪药圃','听泉山庄','清溪客舍','石桥人家','松间茶舍','半山学堂','竹海小筑','望岫台','雨后花房','归山院','流泉居','踏云亭','山南老街','听松楼','白石小院','问山茶坊']}
  ];

  // 在已发布的 99 个地址后追加南岸，不重排任何既有 ID。
  G.DISTRICTS.push({id:'southbank',name:'南岸新街',cols:[0,1,2,3,4,5,6,7,8,9,10],rows:[9],label:{x:1550,y:1810},desc:'沿江向南，新的归家路与夜市在这里延伸。',
    names:['柳岸人家','南桥集市','橘井巷','春水茶坊','湖心书屋','云麓别院','竹溪社区','青山学院','芳草新村','朝阳厂区','南岸书院']});
  for (const district of G.DISTRICTS) {
    let index=0;
    for (const r of district.rows) for (const c of district.cols) {
      G.PLACES.push({id:`${district.id}-${index}`,name:district.names[index++],x:G.GRID_X[c],y:G.GRID_Y[r],
        district:district.id,desc:district.desc,kind:'delivery',permanent:false});
    }
  }
  G.place = id => G.PLACES.find(p => p.id === id);
  G.RESIDENCES = [
    { id:'qiyun', name:'栖云宿舍', place:'stop-3', rent:70, desc:'合租床位便宜，但只能恢复基础体力与少量气血、灵力。', recovery:{health:20,stamina:70,mana:10,battery:0}, full:[] },
    { id:'qingteng', name:'青藤小屋', place:'home', rent:120, desc:'最初的住处。休息均衡，能补满体力、灵力与电量。', recovery:{health:45,stamina:0,mana:0,battery:0}, full:['stamina','mana','battery'] },
    { id:'songfeng', name:'松风公寓', place:'stop-1', rent:220, desc:'安静宽敞，睡眠后气血、体力、灵力与电量全部恢复。', recovery:{health:0,stamina:0,mana:0,battery:0}, full:['health','stamina','mana','battery'] }
  ];
  G.residence = id => G.RESIDENCES.find(r => r.id === id);
  for (const residence of G.RESIDENCES) {
    const place = G.place(residence.place);
    if (place) {
      place.permanent = true;
      place.kind = 'home';
      place.desc = residence.desc;
    }
  }
  G.REALM_LEVELS = ['一重','二重','三重','四重','五重','六重','七重','八重','九重'];
  G.REALMS = [
    { name: '凡人', need: 80, levels: 1 }, { name: '炼气', need: 180, levels: 9 }, { name: '筑基', need: 380, levels: 9 },
    { name: '金丹', need: 700, levels: 9 }, { name: '元婴', need: 1100, levels: 9 }, { name: '化神', need: 1600, levels: 9 },
    { name: '炼虚', need: 2300, levels: 9 }, { name: '合体', need: 3200, levels: 9 },
    { name: '大乘', need: 4300, levels: 9 }, { name: '渡劫', need: 5600, levels: 9, terminal: true }
  ];
  // v7–v12 凡人各重已经成功投入的修为；仅供旧档迁移，不是新的分重玩法。
  G.LEGACY_MORTAL_PROGRESS = Object.freeze([0,5,11,18,26,35,45,56,68]);
  G.WEATHER = [ { id: 'clear', name: '晴', speed: 1 }, { id: 'cloudy', name: '多云', speed: 1 }, { id: 'rain', name: '细雨', speed: .82 }, { id: 'mist', name: '薄雾', speed: .9 } ];
  G.ORDER_TYPES = [
    { title: '一碗热汤', desc: '不要按门铃。放在门边，轻敲两下即可。', tip: 0, condition: 'ordinary' },
    { title: '晚班的便当', desc: '收餐人还在值班，请交到本人手中。', tip: 5, condition: 'ordinary' },
    { title: '少糖桂花糕', desc: '盒子怕挤。慢一点没关系，保持完整。', tip: 8, condition: 'careful' },
    { title: '两人份晚餐', desc: '一份不要葱。备注里写着：今天很重要。', tip: 6, condition: 'ordinary' },
    { title: '急送药膳', desc: '客人正在等药膳，这张订单不会在地图上停留太久。', tip: 14, condition: 'urgent' },
    { title: '不署名的清粥', desc: '收餐人只留了一句：谢谢你还记得。', tip: 4, condition: 'ordinary' },
    { title: '夜行人的宵夜', desc: '灯亮着就有人。若灯灭了，敲三下窗。', tip: 12, condition: 'night' },
    { title: '一份人间烟火', desc: '订单备注是一枚你从未见过的篆字。', tip: 16, condition: 'mystic' },
    { title: '凌晨的豆浆', desc: '送到保安亭。师傅说今晚要替同事多守一班。', tip: 7, condition: 'night' },
    { title: '不能凉的汤药', desc: '刚熬好的药膳，家属正在病房门口等。', tip: 15, condition: 'urgent' },
    { title: '毕业前的最后一餐', desc: '宿舍要搬空了，他们想再吃一次四年前点过的那家店。', tip: 8, condition: 'ordinary' },
    { title: '给陌生人的花饼', desc: '包装很薄，备注写着：别压坏，这是道歉用的。', tip: 10, condition: 'careful' },
    { title: '守夜人的热粥', desc: '城南仓库今晚盘点到天亮，粥里多放一点姜。', tip: 9, condition: 'night' },
    { title: '写给明天的面', desc: '如果我睡着了，就放在门口。明早也会记得有人来过。', tip: 5, condition: 'ordinary' },
    { title: '阵眼旁的清茶', requiresSystem:true, desc: '地址普通，备注却要求茶杯口朝北。系统提示灵息异常。', tip: 18, condition: 'mystic' },
    { title: '散场后的馄饨', desc: '婚礼结束很久了，新郎新娘终于想起自己还没吃晚饭。', tip: 11, condition: 'ordinary' }
  ];
  // 效果全部由规则引擎结算，剧情文本不执行代码。
  const c = (label, result, effects = {}, extra = {}) => ({ label, result, effects, ...extra });
  G.EVENTS = [
    { id: 'first-order', kind: 'delivery', title: '第一份热饭', text: '你把热汤递给收餐人，第一次按下了送达确认。街上的车流没有停，房租和明天的生活还在等着你。眼下，先把这一单认真做完。', choices: [c('先问一句：您吃得惯吗？','对方笑着接过热汤。这声谢谢，让奔忙的第一天有了些暖意。',{karma:2,qi:8}),c('再核对一遍餐品和备注','你确认没有遗漏，记住了新骑手容易忽略的细节。',{insight:1,qi:4}),c('收好手机，继续做完这一单','你把餐交稳，收到一笔额外的小费，准备继续上路。',{rep:2,money:8})] },
    { id:'system-awakening', kind:'story', title:'第一章 · 解锁外卖系统', text:'九次送达，九声道谢，都曾被你当作寻常。新的订单没有店铺名，只有陌生小巷里的一处门牌。你依照路线来到门前，把第十份热饭交给一位老人。他没有先接手机，而是问：「跑了这么远，还记得为什么要把饭送热吗？」餐盒上浮起九点微光，最后一点正等待你的回应。', choices:[
      c('先把热饭放稳：吃饭要紧','你把筷子递过去，老人终于接过餐盒。第十点微光亮起，九段寻常路连成一道阵纹。手机上出现此前从未有过的界面：「外卖系统，绑定完成。」从下一次成功送达起，外卖币将记录你送到人间的善意。',{karma:2,qi:8}),
      c('问他：这些光从哪里来？','老人说：「不是天降的奖赏，是你真正抵达过的地方留下的回应。」你确认交付，第十点微光落入掌心。「外卖系统，绑定完成。」你保留自己的选择，也开始看见这座城的另一面。',{insight:1,qi:4}),
      c('想起前九位收餐人，再郑重告别','你想起加班的人、等饭的家人和那些匆忙的谢谢。老人点头，接过仍然温热的餐盒。十点微光亮起：「外卖系统，绑定完成。」你收好手机，决定仍从认真完成下一单开始。',{rep:2,money:8})
    ] },
    { id: 'rain', kind: 'delivery', title: '雨落在餐盒之前', text: '拐过路口，雨点忽然变密。一个没带伞的孩子站在屋檐外，而你只有一件备用雨披。', choices: [c('把雨披留给孩子','餐盒护在怀里，你的肩背湿了一片。',{karma:3,stamina:-6,rep:1}),c('请便利店帮忙照看孩子','店员答应了。你道谢后重新上路。',{karma:1,rep:1}),c('买把伞交给孩子','孩子认真记下了你的名字。',{money:-12,karma:4,qi:5})] },
    { id: 'cat', kind: 'delivery', title: '不肯让路的橘猫', text: '一只橘猫坐在楼道口，爪下压着半枚温热的青色玉片。它抬头看你，像是在等一个选择。', choices: [c('买一根猫条，和它交换','橘猫叼走猫条，留下玉片和一声很轻的「喵」。',{money:-6,qi:12}),c('蹲下陪它一会儿','它主动让开。你忽然觉得，这条楼道并不陌生。',{stamina:4,karma:1}),c('绕开它，不打扰','你准时把餐送到，猫也守住了自己的宝贝。',{rep:1})] },
    { id: 'stairs', kind: 'delivery', title: '停电的旧楼', text: '电梯停了。客人发来消息：腿脚不便，能不能送到门口？楼道尽头还有个邻居愿意帮忙。', choices: [c('自己提着餐上楼','你数着台阶调整呼吸，体内灵气也跟着顺了一些。',{stamina:-9,qi:10,rep:3}),c('请邻居帮忙，电话确认收餐','邻里之间的一声招呼，比电梯更快抵达。',{rep:1,karma:1}),c('多带一袋楼下的药','老人连声道谢，还把自制点心塞给了你。',{money:-8,stamina:5,karma:3})] },
    { id: 'seal', requiresSystem:true, kind: 'delivery', title: '餐袋里的封印', text: '封口贴浮出细密金线。系统提示：客人买的不只是晚餐，也是封印里唯一还热着的东西。', choices: [c('保持封印，照常交付','门后的人隔着缝隙向你行礼。',{qi:18,rep:2}),c('以灵力感应，不拆封','你认出一段古老的护城阵纹。',{mana:-10,insight:1,qi:12}),c('提醒客人当面检查','对方郑重签收，你得到了一笔额外酬谢。',{money:20,karma:1})] },
    { id: 'rival', kind: 'delivery', encounterNpc: 'zhou', title: '同路人 · 周野', text: '一个叫周野的骑手连人带车摔在路旁。他看着散落的餐袋，第一句话却是：你的单要紧。', choices: [c('帮他扶车、整理餐盒','他记住了你的工号。下一段路没那么孤单了。',{stamina:-5,karma:3,rep:2}),c('帮他联系维修','你没有耽误交付，也为他找到了帮手。',{money:-5,karma:2}),c('把自己的备用绑带给他','绑带不值多少钱，及时的援手却很珍贵。',{qi:5,karma:2})] },
    { id: 'wrong-door', requiresSystem:true, kind: 'delivery', title: '门牌上的两个世界', text: '订单写着 404，门牌却在你眼前变成了「肆零肆」。门缝里飘出海水和檀香的气味。', choices: [c('先打电话确认','门牌恢复了正常，客人说自己只是点了海鲜粥。',{rep:2,insight:1}),c('轻敲三下，报上姓名','门后递来恰好的餐费和一点温润灵息。',{qi:14,money:10}),c('请客人到门口取餐','你守住了边界。系统记下：谨慎也是一种道心。',{karma:1,stamina:3})] },
    { id: 'birthday', kind: 'delivery', title: '没有蜡烛的生日', text: '屋里只有一张折叠桌。年轻人接过蛋糕时说，自己已经快忘了今天是什么日子。', choices: [c('认真说一句生日快乐','他愣了很久，终于笑起来。',{karma:3,qi:6}),c('送一瓶便利店的汽水','瓶盖碰了一下纸杯。小小的仪式也算数。',{money:-5,rep:2,karma:2}),c('把蛋糕摆稳，留下祝福','门关上之前，你听见他说：明年会好一点。',{rep:1,stamina:3})] },
    { id: 'bad-review', kind: 'delivery', title: '迟来的解释', text: '客人责怪汤洒了一半。你看见封袋内侧的油迹，像是在出餐时就已经留下。', choices: [c('先安抚，再协助退款','对方听完解释，撤回了气话。',{rep:3,stamina:-4}),c('自己补一份热汤','这笔支出并不轻松，但你不愿让人空着肚子。',{money:-18,karma:3,rep:2}),c('拍照留证，按流程处理','有些责任，认真说明就好。',{rep:1,insight:1})] },
    { id: 'letter', kind: 'delivery', title: '一封没有寄出的信', text: '收餐人托你把信交到楼下信箱。他说自己的孩子在很远的地方，但信封上竟没有邮票。', choices: [c('补上邮票，帮他寄出','你没有读信。有些牵挂只需要有人送到。',{money:-4,karma:3,qi:5}),c('提醒他缺少邮票','他笑着拍了拍额头，回屋找出一张旧邮票。',{karma:1,rep:1}),c('询问是否需要帮忙联系家人','一通电话后，那间屋子热闹了许多。',{stamina:-3,karma:4})] },
    { id: 'night-guest', kind: 'delivery', title: '只收人间饭的客人', text: '客人的影子比本人迟了一拍。他不肯解释，只问：这座城如今，还有多少家店亮着灯？', choices: [c('告诉他你今天经过的每一盏灯','他听得很认真，像一个终于找到故乡的人。',{qi:16,karma:2}),c('请他尝尝还热的饭','他低头吃了第一口，影子渐渐和身体重合。',{rep:2,qi:10}),c('询问城里的旧事','你听到了护城阵曾经碎裂的那一夜。',{insight:1,qi:8})] },
    { id: 'coin', requiresSystem:true, kind: 'delivery', title: '找不开的一枚铜钱', text: '老人坚持用一枚铜钱付小费。系统扫描了三次，最后只显示：此物承载一段善意。', choices: [c('收下铜钱，好好道谢','铜钱化作一缕灵息，落在系统边缘。',{coins:2,qi:5}),c('把它留给老人作纪念','老人说，那就把谢意记在心里。',{karma:3}),c('用自己的零钱换下它','旧物易主，善意并没有减少。',{money:-5,qi:12,karma:1})] },
    { id: 'river', kind: 'explore', title: '江底的第二轮月亮', text: '水面映着月亮，水底却还有一轮。你看见三道断裂的阵纹，正随着潮汐缓缓明灭。', choices: [c('坐在岸边参悟','一段残缺心法在脑海中连了起来。',{qi:22,stamina:-6}),c('用灵力探查阵纹','你找到了一块可以承载阵力的碎玉。',{mana:-15,fragments:1}),c('记下位置，暂不惊动','知道何时退后，也是修行的一部分。',{insight:1,karma:1})] },
    { id: 'herb', kind: 'explore', title: '石缝里的青灵草', text: '一簇灵草生在废弃台阶上。旁边蹲着采药人，篮子里只有几片普通野菜。', choices: [c('与采药人平分','他教你辨认灵草的根脉，临别又多分给你一株。',{herb:2,karma:2}),c('用零钱买下','这是一笔双方都满意的买卖。',{money:-15,herb:3}),c('只摘成熟的一株','你把幼芽留给了明年。',{herb:1,qi:6})] },
    { id: 'sword', kind: 'explore', title: '锈剑不会说话', text: '古井旁有把断剑。你握住剑柄的一瞬，听到许多人重复着同一句话：替我们看看。', choices: [c('向断剑描述如今的城市','残留的执念安静下来，一道阵纹融入你的识海。',{qi:25,karma:3}),c('用灵力修复断口','断剑化为青光，留下温热的碎玉。',{mana:-18,fragments:1}),c('把它安放在干燥的石台上','你没有带走它，只让风雨暂时停在身后。',{karma:2,stamina:5})] },
    { id: 'bottleneck', kind: 'cultivation', title: '心魔借了一张账单', text: '闭上眼后，未付的房租、错过的订单与所有后悔轮番出现。心魔没有獠牙，只是很像疲惫的你。', choices: [c('承认自己会累','呼吸渐渐平稳。你不必时时刻刻证明自己。',{stamina:10,qi:12}),c('以道心直面杂念','念头起落，你坐在其中，没有离开。',{mana:-8,qi:24}),c('停下修炼，喝杯热水','今夜没有多走一步，也没有退回原点。',{health:8,stamina:8})] },
    { id: 'rooftop', kind: 'cultivation', title: '屋顶上的灯海', text: '灵气沿着天际缓缓流动。你忽然察觉，它并非来自群山，而是来自每一扇仍有人等候的窗。', choices: [c('把灯火引入丹田','人间烟火在你的经脉里汇成细流。',{qi:20,karma:1}),c('记录这一刻的感悟','你给笔记取名：《人间有灵》。',{insight:1,qi:8}),c('替还在工作的人留一盏灯','暖光没有照到很远，但它一直亮着。',{money:-3,karma:3,qi:10})] },
    { id: 'elevator', kind: 'delivery', title: '停在七楼的电梯', text: '老楼电梯突然卡住，里面有人拍门求助。你的客人住在十二层，你手里的餐还冒着热气。', choices: [c('先联系物业并陪到有人回应','隔着门说了几分钟话，维修人员终于赶到。',{karma:3,rep:1},{duration:8}),c('记下楼层，走楼梯继续配送','你把求助信息发给物业，随后提着餐盒继续向上。',{stamina:-5,rep:2}),c('请楼下住户代为守着','有人接过这段短暂的责任，你也没有耽误太久。',{karma:1,rep:1},{duration:3})] },
    { id: 'raincoat', kind: 'delivery', title: '两件雨衣', text: '雨忽然大起来，路口有位老人拿着两件一次性雨衣，说自己只用一件，另一件问你要不要。', choices: [c('收下并认真道谢','薄薄的塑料挡住了大半风雨，也挡住了一点疲惫。',{stamina:5,karma:1}),c('留给下一位没带伞的人','老人笑着把雨衣挂在公交站牌上。',{karma:3,qi:5}),c('帮老人把伞骨掰正','雨没停，你们却都轻松了些。',{stamina:-3,karma:2,rep:1})] },
    { id: 'night-school', kind: 'delivery', title: '夜校最后一盏灯', text: '送达地点是一间夜校。教室里只剩一个准备成人考试的人，他把错题本摊满整张桌。', choices: [c('祝他考试顺利','他把这句话写在错题本最后一页。',{karma:2,qi:6}),c('分享自己坚持修行的办法','你说，先做完今天能做的一点。',{insight:1,rep:1}),c('不打扰，轻轻放下餐','门关上时，台灯仍然亮着。',{rep:2,stamina:2})] },
    { id: 'old-photo', kind: 'delivery', title: '照片里少了一个人', text: '客人接餐时掉出一张旧合照。照片边缘被反复折过，像有人总想把自己藏起来。', choices: [c('捡起照片，只说掉东西了','你没有多问，对方却主动讲起了照片里的朋友。',{trust:0,karma:2,qi:5}),c('帮他找一个透明保护套','一张旧照片终于不用再被折叠。',{money:-6,karma:3,rep:1}),c('把照片递回去就离开','有些故事不必由陌生人打开。',{rep:1})] },
    { id: 'incense-noodle', kind: 'delivery', title: '香火味的牛肉面', text: '门开时没有人，只有一张小桌和一只写着“加辣”的纸鹤。纸鹤翅膀上沾着很淡的香灰。', choices: [c('照备注放好，再退到门外','片刻后，碗边多了一枚温热铜钱。',{coins:1,qi:8}),c('以灵力感应纸鹤','你看见一道很旧的送别仪式，却没有恶意。',{mana:-6,insight:1,qi:10}),c('打电话确认收餐方式','电话那头沉默几秒，只说：谢谢你按规矩来。',{rep:2,karma:1})] },
    { id: 'last-bus', kind: 'delivery', title: '末班车之前', text: '客人发来消息：他正从医院赶回家，如果你愿意多等五分钟，就能亲手接到这顿饭。', choices: [c('在门口等他','五分钟后，一个疲惫的人跑来，第一句是谢谢。',{karma:2,rep:2},{duration:5}),c('把餐放进保温柜并拍照','你把取餐步骤写得很清楚。',{rep:2}),c('询问是否需要帮忙带瓶水','对方回了一个很久没有发过的笑脸。',{money:-3,karma:2})] },
    {"id":"river-camera","kind":"explore","encounterNpc":"su","title":"镜头里的第二轮月亮","text":"河岸边，平面模特苏砚刚结束试拍，正用自己的旧相机记录晚霞。她说底片里偶尔会多出一轮月亮，问你愿不愿意一起看看。","choices":[{"label":"凑过去看取景器","result":"第二轮月亮下，有细小阵纹沿江延伸。","effects":{"insight":1,"qi":12}},{"label":"帮她扶稳三脚架","result":"长曝光结束时，照片上留下了一条像龙脊的光。","effects":{"stamina":-3,"karma":1,"qi":8}},{"label":"先问清楚她拍了多久","result":"苏砚笑说：久到开始怀疑不是相机的问题。","effects":{"qi":6,"karma":1}}]},
    { id: 'paper-crane', kind: 'explore', title: '逆风的纸鹤', text: '一只纸鹤逆着江风飞来，停在你的车把上。展开后，里面只写着一个已经拆迁的地址。', choices: [c('沿旧地图寻找地址','你找到一块还没被拆走的门牌，背面刻着阵纹。',{qi:18,insight:1}),c('把纸鹤重新折好放回风里','它绕了半圈，飞向江对岸。',{karma:2,stamina:3}),c('记下地址，交给旧雨书店查证','有些谜题适合慢一点解。',{qi:8,rep:1})] },
    { id: 'kiosk', kind: 'explore', title: '停业十年的报刊亭', text: '公园角落的旧报刊亭今晚亮着灯。玻璃里摆着今天的报纸，也摆着十年前同一天的报纸。', choices: [c('买一份今天的报纸','摊主不收钱，只让你以后多看看这座城。',{insight:1,qi:8}),c('翻看十年前的头版','你找到护城阵破裂那晚的一条不起眼新闻。',{qi:16,rep:1}),c('不进去，只记住灯的位置','回头再看时，亭子已经黑了。',{karma:1,stamina:4})] },
    { id: 'bridge-bell', kind: 'explore', title: '桥下的无声铃', text: '桥洞里挂着一串没有铃舌的铜铃。风吹过时没有声音，你的灵力却跟着轻轻震了一下。', choices: [c('坐下听那段无声','你第一次意识到，灵气也有自己的节拍。',{qi:20,stamina:-4}),c('用一缕灵力试探','铜铃映出几段陌生人的归家路。',{mana:-8,qi:16}),c('擦掉铃上的灰','你没有得到宝物，只觉得心里安静了一点。',{karma:2,health:4})] },
    { id: 'dream-delivery', kind: 'cultivation', title: '梦里还有一单', text: '入定后，你竟又听见接单提示。梦中的地址写着“过去”，收餐人姓名却是你自己。', choices: [c('把餐送给过去的自己','那个疲惫的你接过热饭，终于没有继续责怪后来的人。',{qi:24,health:5}),c('取消这一单','系统没有扣分。你第一次知道，有些路可以不走。',{stamina:8,karma:2}),c('问过去的自己想说什么','他只说：别把今天也弄丢了。',{insight:1,qi:12})] },
    { id: 'street-meridian', kind: 'cultivation', title: '街道也是经脉', text: '吐纳时，整座城市的道路在识海里亮起。红绿灯像穴位，桥梁像关窍，而你的路线正穿行其中。', choices: [c('顺着道路运转周天','你把熟悉的街巷变成了一套自己的吐纳节奏。',{qi:26,stamina:-4}),c('只观察，不强行引气','城市的脉络逐渐清晰。',{insight:1,qi:10}),c('把一处堵塞的阵纹记下来','下一次路过那里时，你会知道该看哪里。',{qi:12,karma:1})] },
    { id: 'dawn-breath', kind: 'cultivation', title: '天亮前最后一口气', text: '夜色将尽，灵气开始退潮。你忽然觉得，修行不是追赶灵气，而是在每一次呼吸里不把自己弄丢。', choices: [c('继续坐到天亮','你没有获得奇迹，只把这一夜完整地走完。',{qi:18,stamina:-3}),c('收功，去吃一顿早饭','身体被认真照顾，心境反而更稳。',{stamina:10,health:6}),c('记下这一刻','后来你把这句话写进自己的修行笔记。',{insight:1,qi:8})] },
    { id: 'borrowed-moon', kind: 'cultivation', title: '借来的一轮月', text: '窗外被高楼挡住，看不见月亮。你却在水杯里看到一小块月光，像有人从别处借来给你。', choices: [c('借月光运气','那一点光沿经脉走了一圈。',{qi:20,mana:5}),c('把杯子放到窗边','你不占有它，只让它照一会儿屋子。',{karma:2,qi:9}),c('喝掉已经凉的水','修行忽然变得很普通，也很可靠。',{health:5,stamina:5})] }
  ];
  // 1.8.0：39 段原创配送事件；每段三个独立结果，至少一个无资源成本选项。
  G.EVENTS.push(
    {"id":"delivery-lobby-sign","kind":"delivery","title":"被风吹反的指路牌","text":"楼下的临时指路牌被风吹反了。几位送货的人在同一条死胡同里绕圈，门卫正忙着接电话。","choices":[{"label":"把路牌扶正，再向门卫确认","result":"你扶稳底座，门卫核对后朝正确的入口点了点头。身后的送货人终于不用再绕一圈。","effects":{"stamina":-3,"rep":2},"duration":3},{"label":"把正确入口发给正在问路的人","result":"消息很短，却让群里连续响起几声道谢。你按确认过的入口完成了交付。","effects":{"rep":1,"karma":1}},{"label":"先打电话，请收餐人指路","result":"对方一步步说清了路线。你没有猜测地址，餐也安稳交到本人手里。","effects":{"rep":2}}]},
    {"id":"delivery-warm-water","kind":"delivery","title":"保温杯里的最后一口水","text":"客人开门时，看见你已经空了的水杯。他端出一壶温水，认真问你是不是又忘记喝水了。","choices":[{"label":"接半杯，坐一会儿再走","result":"温水落进胃里，紧绷的肩背慢慢松开。你把杯盖拧紧，向门里的人道了谢。","effects":{"stamina":6,"health":3},"duration":3},{"label":"只接一点，给后来的骑手留着","result":"对方把水壶放在门口的凳子上，又添了几只纸杯。这份照顾不只停在你身上。","effects":{"stamina":3,"karma":2}},{"label":"婉谢，提醒他先吃热饭","result":"对方笑着把餐盒打开。你没有多停，但那句“路上小心”陪你走到了楼梯口。","effects":{"rep":1,"qi":4}}]},
    {"id":"delivery-spare-chopsticks","kind":"delivery","title":"少了一双筷子","text":"收餐人刚搬进空屋，拆开餐袋才发现没有筷子。他看着还没送来的家具，不好意思地叹了口气。","choices":[{"label":"拿出干净的备用餐具","result":"你把独立包装递过去。他坐在纸箱上，终于吃上搬家后的第一顿饭。","effects":{"karma":2,"rep":2}},{"label":"替他去楼下买一套餐具","result":"小店还没打烊。你带回一双可以反复使用的筷子，他说这总算像个家的开头。","effects":{"money":-6,"karma":3},"duration":4},{"label":"联系商家，说明遗漏","result":"商家确认后安排补送。你把沟通结果告诉客人，没有让他自己再说一遍。","effects":{"rep":2,"insight":1}}]},
    {"id":"delivery-sleeping-baby","kind":"delivery","title":"门后的轻声细语","text":"备注写着不要敲门。门打开一条缝，抱着婴儿的家长用口型向你说谢谢，桌上的饭显然已经等了很久。","choices":[{"label":"轻轻放稳餐盒，发文字确认","result":"餐盒没有碰响门框，孩子也没有惊醒。对方用空出来的一只手回了个“收到”。","effects":{"rep":3}},{"label":"帮忙把门边的垃圾带到楼下","result":"你提起扎好的袋子，轻轻带上门。楼上传来很小的一声道谢，像怕碰碎片刻安静。","effects":{"stamina":-3,"karma":3}},{"label":"留下独立包装的湿巾","result":"对方点头收下，把湿巾放在伸手就能拿到的地方。这一点方便，恰好落在忙乱之间。","effects":{"karma":2,"qi":5}}]},
    {"id":"delivery-exam-desk","kind":"delivery","title":"准考证旁的一碗面","text":"客人的桌上铺满笔记，准考证被压在透明杯下。他接餐时问你：努力很久却没把握，算不算白忙？","choices":[{"label":"告诉他先吃完这碗面","result":"你没有替考试许愿，只把汤碗摆稳。他合上笔记，终于肯让自己停一会儿。","effects":{"karma":2,"rep":1}},{"label":"讲讲自己第一次独自跑单","result":"你讲起那次找错入口的狼狈，他听完笑了。桌边的紧张散去一点，你也重新理解了熟能生巧。","effects":{"insight":1,"qi":6},"duration":4},{"label":"不作评价，祝他照顾好自己","result":"你把祝福说得很认真。他把笔帽扣好，回答说今晚会早点休息。","effects":{"karma":2,"qi":4}}]},
    {"id":"delivery-night-cleaner","kind":"delivery","title":"扫帚边的饭盒","text":"收餐人穿着保洁制服，把扫帚靠在墙边。她特意选了不带汤的饭，说怕弄脏刚擦过的地面。","choices":[{"label":"帮她铺好一张干净垫纸","result":"饭盒终于可以放稳。她坐下吃饭时，你替她扶住了那把总往下滑的扫帚。","effects":{"karma":3,"rep":1}},{"label":"买瓶水放在饭盒旁","result":"她把水拧开，又仔细收好瓶盖。你们没聊多久，却都记住了这次照面。","effects":{"money":-3,"karma":3,"qi":4}},{"label":"把餐递好，不打断她休息","result":"你确认餐具齐全便轻声离开。她终于有一段不必回应任何人的吃饭时间。","effects":{"rep":2,"stamina":2}}]},
    {"id":"delivery-rehearsal","kind":"delivery","title":"排练室的安可","text":"你敲开排练室，里面的人刚结束一次不太整齐的合奏。主唱说，今天没有观众，只有准点到的这份饭。","choices":[{"label":"听完他们最后半首歌","result":"鼓点偶尔走散，旋律却渐渐接上。你认真鼓掌后，他们把这次排练称作一场小演出。","effects":{"stamina":4,"qi":7},"duration":5},{"label":"把餐按人数摆开","result":"乐器被收进箱里，一群人围着饭盒坐下。你看见他们开始讨论下一次怎样配合。","effects":{"rep":2,"karma":1}},{"label":"告诉他们，门外也能听到副歌","result":"主唱愣了一下，重新看向队友。那段差点被删掉的副歌，至少已经抵达过一个人。","effects":{"karma":2,"insight":1}}]},
    {"id":"delivery-repaired-sign","kind":"delivery","title":"灯牌重新亮起来","text":"小店刚换好灯管，招牌仍有一个字暗着。老板接过自己的晚饭，问你这样会不会很难看。","choices":[{"label":"帮他站远一点看看是否醒目","result":"你换了两个角度，指明被树枝挡住的位置。他照着调整后，店名清楚了许多。","effects":{"stamina":-2,"rep":2},"duration":3},{"label":"说清哪一笔没亮，不替他下判断","result":"老板记下故障位置，打算明天请人检修。你们把一个含糊的烦恼变成了具体的小事。","effects":{"insight":1,"karma":1}},{"label":"提醒他趁热吃饭，修灯明天再说","result":"他放下手里的抹布，第一次坐到顾客常坐的椅子上。热气从暗掉的字下面升起来。","effects":{"karma":2,"qi":5}}]},
    {"id":"delivery-moving-boxes","kind":"delivery","title":"最后一个纸箱","text":"收餐人被堆到门口的纸箱挡住，正一手拿钥匙一手扶箱子。餐到了，新生活却还没腾出落脚的地方。","choices":[{"label":"帮忙把挡门的两箱挪开","result":"你只挪开通道，没有替对方拆任何东西。门终于能完全打开，餐也有了平稳的位置。","effects":{"stamina":-5,"karma":3,"rep":1},"duration":4},{"label":"在门外扶住箱子，让他先开门","result":"钥匙转动后，他顺利腾出手接餐。你们各自用一点力气，化解了这个卡住的瞬间。","effects":{"stamina":-2,"rep":2}},{"label":"按对方指示把餐放到空凳上","result":"你复述了摆放位置，确认没有碰到易碎品。离开时，他终于可以先坐下吃几口。","effects":{"rep":2,"qi":3}}]},
    {"id":"delivery-rooftop-tomatoes","kind":"delivery","title":"窗台上熟透的番茄","text":"客人指着窗台说，自己种的第一颗番茄今天红了。他想切开配饭，又舍不得下刀。","choices":[{"label":"请他讲讲这盆番茄怎么长大","result":"他从第一场雨讲到今天早晨。听完这些细小的照料，你觉得等待也有了清晰的形状。","effects":{"insight":1,"qi":8},"duration":4},{"label":"帮他拍一张成熟的照片","result":"照片拍好后，他终于把番茄摘下。记录留下来，晚饭也没有错过它最好的时候。","effects":{"rep":1,"karma":2}},{"label":"祝他这顿饭吃得开心","result":"他把番茄放在饭盒旁，像添了一道节日菜。你带着一身很淡的叶香离开。","effects":{"stamina":3,"qi":4}}]},
    {"id":"delivery-guide-dog","kind":"delivery","title":"不该摸的工作伙伴","text":"门开时，一只导盲犬安静地等在主人身旁。客人请你说清餐盒和饮料的位置，不要把东西放在走道上。","choices":[{"label":"逐件说明，放到指定位置","result":"你用钟点方向描述杯子，没有逗弄正在工作的犬。对方确认摸到餐袋后，你才告辞。","effects":{"rep":3,"karma":1}},{"label":"先问是否需要协助，再递餐","result":"客人选择自己接过餐盒。你按他的节奏等待，没有把好意变成额外的障碍。","effects":{"karma":3,"insight":1}},{"label":"把取餐信息改成清晰的语音","result":"位置、数量和注意事项被简短说明。对方听完回复收到，这次交付没有留下猜测。","effects":{"rep":2,"qi":4}}]},
    {"id":"delivery-hearing-note","kind":"delivery","title":"一张写着谢谢的纸","text":"收餐人没有回应门铃，却很快回复了消息。门打开后，他举起一张纸，请你把话写下来。","choices":[{"label":"用手机打字逐项核对","result":"你把两份饭的区别写清楚，他圈出自己的那份。最后一行多了两个笔迹很重的“谢谢”。","effects":{"rep":3}},{"label":"请他指认名字，再递上餐","result":"你们用点头完成了确认。交流没有声音，却没有哪一步被省略。","effects":{"rep":2,"karma":1}},{"label":"写下保温袋的开启方法","result":"你把容易漏掉的小扣也画了出来。他看着图示打开餐袋，朝你竖起拇指。","effects":{"insight":1,"karma":2},"duration":3}]},
    {"id":"delivery-empty-shop","kind":"delivery","title":"打烊前的第一单","text":"新店还没有迎来客人，老板给自己点了份晚饭。他把收款牌擦了一遍又一遍，说不知道明天要不要继续开门。","choices":[{"label":"不替他决定，听他说完今天","result":"你听他算完房租、材料和开门的时间。他没有得到答案，却终于把心里的账说清楚了。","effects":{"stamina":-2,"karma":3},"duration":5},{"label":"买一张店里的手绘明信片","result":"你付的是明信片的钱，不是对未来的承诺。他把当天第一笔销售认真记进账本。","effects":{"money":-8,"karma":2,"qi":7}},{"label":"把饭递稳，提醒他先休息","result":"老板把抹布放下，给自己倒了杯水。明天还没到，今晚可以先吃完这顿饭。","effects":{"rep":1,"karma":2}}]},
    {"id":"delivery-burnt-rice","kind":"delivery","title":"电饭锅没有跳闸","text":"客人先展示了锅里结成硬块的米饭，才接过补点的晚餐。他说独居后的第一堂课，大概就是承认自己会做砸。","choices":[{"label":"分享自己也曾把事情弄糟","result":"你讲了一个不怎么体面的笑话。他笑出声后，屋里终于不只剩焦味。","effects":{"karma":2,"stamina":3}},{"label":"帮他把窗边的餐桌收出一角","result":"你避开还烫的锅，只整理了可以吃饭的地方。热餐放下后，这个晚上重新有了秩序。","effects":{"stamina":-3,"rep":2,"qi":5},"duration":3},{"label":"说今天仍然有一顿热饭","result":"他看了看完好的餐盒，承认你说得对。一次失败没有把整天都变成失败。","effects":{"insight":1,"karma":1}}]},
    {"id":"delivery-returned-change","kind":"delivery","title":"多转来的十块钱","text":"客人把小费转成了十倍，发现后迟迟没发消息。你核对收款记录时，看见他正在输入又删掉文字。","choices":[{"label":"主动退回误转的部分","result":"金额核清后，对方明显松了口气。他另留下一点心意，你只收了双方确认过的数目。","effects":{"money":5,"rep":3}},{"label":"先发截图，请对方确认","result":"你没有把沉默当成赠予。两边记录对上后，这笔误会被清楚地解决。","effects":{"rep":2,"insight":1}},{"label":"请平台协助原路处理","result":"款项按流程退回，没有交换多余的私人信息。客人给这次处理留下了好评。","effects":{"rep":3}}]},
    {"id":"delivery-parcel-room","kind":"delivery","title":"快递架上的同名人","text":"收餐点的架子上放着两个同名人的包裹。值守人正想随手放下你的餐，却发现联系电话不同。","choices":[{"label":"核对尾号后放入指定格","result":"你把格号发给真正的收餐人。几分钟后，平台显示了清楚的取餐确认。","effects":{"rep":3}},{"label":"联系本人到架前核验","result":"客人出示了自己的订单，你才交出餐盒。同名没有变成又一次错拿。","effects":{"rep":2,"karma":1},"duration":3},{"label":"请值守人另写一张清楚标签","result":"姓名旁补上尾号和格号后，大家都不再需要猜。你也记住了核对细节的必要。","effects":{"rep":1,"insight":1}}]},
    {"id":"delivery-umbrella-rack","kind":"delivery","title":"伞架上留着空位","text":"客人门口有个写着“借用后归还”的伞架。一位邻居正犹豫着伸手，又因为没有登记笔而缩回去。","choices":[{"label":"借出笔，让他写下归还信息","result":"名字写好，伞从架上取走。客人说这些小小的约定已经替很多人挡过雨。","effects":{"karma":2,"rep":1}},{"label":"把自己的备用挂钩留给伞架","result":"歪斜的长伞终于有了稳妥位置。你没有等到雨停，却把一点秩序留在了门口。","effects":{"money":-4,"karma":3,"qi":4}},{"label":"向客人说明邻居想借伞","result":"门里传来明确的答应。你传完话，邻居安心撑开了伞。","effects":{"rep":2,"karma":1}}]},
    {"id":"delivery-power-bank","kind":"delivery","title":"还剩百分之一","text":"收餐人的手机只剩一点电，门禁码却还没加载出来。他站在自己住的楼下，尴尬得像个外来客。","choices":[{"label":"让他借用你的应急充电线","result":"手机重新亮起，门禁码终于出现。你收好线后，发现人间的关隘有时只是一个插口。","effects":{"stamina":-2,"karma":3},"duration":5},{"label":"帮他联系物业值班台","result":"核验完成后，物业替他开了门。你们没有翻越围栏，也没有借别人的身份蒙混进去。","effects":{"rep":2,"insight":1}},{"label":"把餐交给本人，陪他确认已收到","result":"订单先完成交接，对方不用再怕断网丢了晚饭。你提醒他保留仅剩的电量联系家人。","effects":{"rep":2,"karma":1}}]},
    {"id":"delivery-overtime-table","kind":"delivery","title":"工位之间的一张空桌","text":"一群人围在打印机边赶工，饭到了却没有地方放。角落里有张堆满旧纸的空桌，没人顾得上收拾。","choices":[{"label":"请他们确认哪些纸能挪开","result":"得到同意后，你们一起腾出桌面。没人丢失资料，晚饭也终于离开了键盘旁。","effects":{"stamina":-4,"rep":3},"duration":4},{"label":"按名字逐份交到本人手里","result":"你逐个核对，没有把备注不同的饭混在一起。忙乱里，总算有件事准确落定。","effects":{"rep":3}},{"label":"提醒大家先留出安全通道","result":"纸箱被移到不挡路的角落，你才稳稳放下餐袋。着急的工作没有变成新的绊脚石。","effects":{"rep":1,"karma":2}}]},
    {"id":"delivery-paper-medal","kind":"delivery","title":"纸做的奖牌","text":"孩子替加班回来的家长订了饭，还剪出一枚纸奖牌。他问你，能不能把奖牌也一起递过去。","choices":[{"label":"把奖牌和餐一起郑重送上","result":"大人看见歪歪扭扭的字，停了很久才接过。你在门外听见孩子被叫了名字。","effects":{"karma":3,"qi":7}},{"label":"让孩子自己颁奖，你托住餐","result":"你没有占去那个重要的瞬间。小小的手把奖牌挂好，晚饭的热气绕过他们的肩膀。","effects":{"rep":2,"karma":2}},{"label":"帮孩子把松开的纸带接好","result":"奖牌没有掉下来，孩子轻轻松了口气。你把剩下的胶带还回去，完成了这次交付。","effects":{"stamina":-2,"karma":3},"duration":3}]},
    {"id":"delivery-broken-strap","kind":"delivery","title":"保温袋断了一根带","text":"刚到楼下，餐袋的提带突然断开。餐盒还好好落在你的臂弯里，只差一点就要洒在地上。","choices":[{"label":"用备用绑带重新固定","result":"你检查了封口，再把餐盒稳稳绑好。客人收到完好的饭，你也把这次险情记进心里。","effects":{"stamina":-3,"rep":2},"duration":3},{"label":"双手托住餐盒完成交付","result":"最后一段路走得比平常慢。交到客人手里时，汤面依然平整。","effects":{"stamina":-5,"rep":3}},{"label":"请客人带托盘到门口交接","result":"对方端来托盘，你说明了提带损坏但餐盒完好的情况。这次配合省去了一场狼狈。","effects":{"rep":2,"insight":1}}]},
    {"id":"delivery-soup-steam","kind":"delivery","title":"玻璃上的一行雾字","text":"客人正在小玻璃房里值守。你把热汤放到窗口时，雾气在玻璃上留下一行像字又像呼吸的纹路。","choices":[{"label":"顺着雾气的节奏调整呼吸","result":"几次缓慢吐纳后，那行纹路在眼前连成细线。汤还热着，你的心绪已经安静下来。","effects":{"qi":10,"mana":3}},{"label":"擦出一小块玻璃，确认签收","result":"值守人隔着清楚的窗口向你点头。奇怪的雾字散了，交付的信息却留了下来。","effects":{"rep":2,"insight":1}},{"label":"只把汤递好，不去猜它的意思","result":"对方捧起碗，呵了一口气。你没有追逐谜题，仍接住了这一刻普通的暖意。","effects":{"karma":2,"stamina":3}}]},
    {"id":"delivery-clock-shop","kind":"delivery","title":"所有钟都慢了一分钟","text":"送餐的屋里摆着许多旧钟，指针却比你的手机慢同样的一分钟。修钟人说，那一分钟是留给来不及道别的人。","choices":[{"label":"听他讲完那一分钟","result":"他说的不是术法，而是一次没能赶上的晚饭。故事落下后，钟声终于不再像催促。","effects":{"qi":9,"karma":2},"duration":5},{"label":"认真核对订单，不拨动任何钟","result":"你尊重屋里的时间，也按自己的记录完成签收。两个刻度没有因此互相否定。","effects":{"rep":2,"insight":1}},{"label":"提醒他今天的饭还没有凉","result":"老人移开桌上的工具，给餐盒腾出位置。那一分钟暂时有了新的用处。","effects":{"karma":3,"qi":4}}]},
    {"id":"delivery-fountain-pen","kind":"delivery","title":"墨水没干的辞职信","text":"客人桌上的信只写了一半，钢笔却漏了墨。他接过饭时，想让你替他判断该不该把信写完。","choices":[{"label":"不替他决定，建议吃饭后再想","result":"他把纸翻过去，让自己暂时离开那几个字。你没有交出答案，只帮他留住选择的余地。","effects":{"karma":2,"insight":1}},{"label":"递一张干净纸，听他梳理顾虑","result":"租金、通勤和真正想做的事被一条条写下。说完后，他知道下一步该向谁确认信息。","effects":{"stamina":-3,"karma":3},"duration":5},{"label":"把餐摆在不会沾墨的地方","result":"你只处理眼前能确定的小事。他擦净手，向你道谢，信仍由他自己保管。","effects":{"rep":2,"qi":4}}]},
    {"id":"delivery-harvest-basket","kind":"delivery","title":"菜篮里的一小把青菜","text":"收餐人刚从自己的小菜地回来，坚持送你一小把青菜。他说盒饭吃得方便，也要记得有东西会慢慢长。","choices":[{"label":"婉谢青菜，请他讲讲种菜的事","result":"你没有地方妥善存放，便认真说明。老人并不介意，反而教了你辨认嫩叶的小窍门。","effects":{"insight":1,"karma":1}},{"label":"请他把青菜留给今晚一起吃饭的人","result":"篮子被提回厨房，水声很快响起来。你没有收下礼物，却让这份心意回到了餐桌上。","effects":{"karma":3,"qi":4}},{"label":"帮他把菜篮提到门内","result":"篮子有一点沉，你把它放在不挡门的位置。老人终于腾出手接过自己的热饭。","effects":{"stamina":-3,"rep":2,"karma":1}}]},
    {"id":"delivery-train-whistle","kind":"delivery","title":"汽笛响起之前","text":"客人抱着行李等家人来接，手里攥着一张旧车票。远处传来汽笛，他却忽然不急着低头看时间了。","choices":[{"label":"陪他确认新车票的日期","result":"旧票被夹回本子，新票的信息终于看清。离别不必再多添一次赶错日子的慌张。","effects":{"rep":2,"insight":1}},{"label":"把汤和主食分开放稳","result":"行李旁留出一块干净位置，他终于能先吃几口。你听见他在电话里说，饭已经送到了。","effects":{"rep":2,"karma":1}},{"label":"听他说起上一次回家的路","result":"他说得很慢，像重新经过许多熟悉的站名。你告辞时，他的手已经不再紧攥着旧票。","effects":{"qi":8,"karma":2},"duration":4}]},
    {"id":"delivery-bridge-shadow","requiresSystem":true,"kind":"delivery","title":"桥影少了一块","text":"餐已经送到桥边值守室，窗外的桥影却缺了一段。值守人没有察觉，只有系统地图上的那一点轻轻闪烁。","choices":[{"label":"用灵力描回缺失的轮廓","result":"一缕灵息触到水面，缺口里浮出细小的阵纹。桥影重新连起，你认清了一种补阵的次序。","effects":{"mana":-8,"qi":15,"insight":1}},{"label":"记录缺口，不惊动水面","result":"你把观察写进自己的路程笔记，没有擅自触碰未知阵势。抬头时，水波已经带走了裂痕。","effects":{"insight":1,"qi":6}},{"label":"先提醒值守人吃饭","result":"值守室的灯亮起，桥影的缺口也淡了些。你发现普通的回应同样能让某些东西完整。","effects":{"karma":2,"qi":8}}]},
    {"id":"delivery-ink-address","kind":"delivery","title":"墨迹还在移动的地址","text":"收餐人递来的签收纸上，地址像墨水中的小鱼一样移动。你自己的订单却清清楚楚，没有改过一笔。","choices":[{"label":"以订单信息为准逐项核验","result":"名字、尾号和餐品全部对上后，纸上的墨迹停住了。你没有让怪异替代必要的确认。","effects":{"rep":2,"insight":1}},{"label":"用一缕灵力稳住纸角","result":"墨迹沿你的灵息排回原位，露出一小段古老门牌的写法。你看过后松手，没有把纸带走。","effects":{"mana":-6,"qi":14}},{"label":"请对方改用口头确认","result":"客人说出正确的信息，纸上的小鱼便游进了墨点。签收完成，门里的人低声道谢。","effects":{"rep":2,"karma":1}}]},
    {"id":"delivery-silent-doorbell","kind":"delivery","title":"没有声音的门铃","text":"你按下门铃，没有声音，门内的灯却随之亮起。收餐人说，这个铃只会叫醒那些仍在等人的念头。","choices":[{"label":"把热饭递过去，不再多按","result":"灯光安稳下来，对方终于将目光从走廊收回。你没有替任何人闯进那份等待。","effects":{"karma":2,"qi":8}},{"label":"询问门铃为什么还留着","result":"他说铃坏了很久，却一直舍不得换。你听见的不一定是神异，也可能只是记忆不肯散去。","effects":{"insight":1,"qi":6}},{"label":"按正常流程确认本人收餐","result":"确认完成后，手机上的提示与门内的灯同时暗了一点。你守住了自己的职责。","effects":{"rep":3}}]},
    {"id":"delivery-paper-fish","kind":"delivery","title":"汤碗边的纸鱼","text":"客人折了一条纸鱼压在签收单上。鱼鳍轻轻摆动，仿佛餐盒上方的蒸汽就是一条河。","choices":[{"label":"轻轻把蒸汽引向纸鱼","result":"纸鱼绕着碗边游了一圈，散成细小光点。你在水汽的流动里找到一段顺畅的行气节奏。","effects":{"mana":-5,"qi":13}},{"label":"问客人折纸的方法","result":"他一步步折给你看，没有任何口诀。你学到的是耐心，却也从耐心里获得一点灵息。","effects":{"insight":1,"qi":5},"duration":4},{"label":"不要触碰，等对方收好","result":"客人将纸鱼夹进书里，向你点头。小小的奇异没有妨碍这一餐被安稳送达。","effects":{"rep":2,"karma":1}}]},
    {"id":"delivery-rice-light","requiresSystem":true,"kind":"delivery","title":"米粒里的微光","text":"开盖的一瞬，几粒米饭像细小的灯。客人却只是个刚结束工作的人，正为终于能坐下吃饭而松口气。","choices":[{"label":"凝神辨认，但不碰餐食","result":"微光来自手心传来的暖意，而不是稀有灵材。你收回神识，对系统的力量多懂了一点。","effects":{"mana":-6,"qi":12,"insight":1}},{"label":"祝他好好吃完这一餐","result":"第一口饭咽下去，微光便安静落回碗中。你忽然不觉得它需要更大的名字。","effects":{"karma":3,"qi":6}},{"label":"确认没有遗漏餐具后离开","result":"你没有因为看见异常而忘记交付细节。身后传来杯碗碰响的声音，很平常，也很完整。","effects":{"rep":3}}]},
    {"id":"delivery-old-messenger","kind":"delivery","title":"穿旧制服的送信人","text":"你交餐时，一位穿旧制服的人也在门口等。他拿着没有收件地址的信，问你这座城的路是不是全变了。","choices":[{"label":"用自己的路线讲讲如今的街巷","result":"他说出的旧地名逐渐对上你走过的路。制服上的尘土散去一点，他终于找回了方向感。","effects":{"qi":10,"karma":2},"duration":5},{"label":"提醒他先向收件人核实地址","result":"他低头看信封，像第一次意识到可以问。模糊的墨迹随之清楚了一些。","effects":{"insight":1,"rep":1}},{"label":"先把饭交好，再向他道别","result":"老人没有拦你，只轻轻碰了一下帽沿。你们各自守住了手里需要送达的东西。","effects":{"rep":2,"qi":5}}]},
    {"id":"delivery-mirror-dinner","kind":"delivery","title":"镜子里多出来的晚餐","text":"门边的镜子映出两份饭，你手里却只有一份。客人看着镜面说，过去总有人与自己一起吃晚饭。","choices":[{"label":"不戳破倒影，请他先坐下","result":"客人将一张空凳推回桌旁。镜中多出的饭慢慢淡去，桌上的这一份仍然热着。","effects":{"karma":3,"qi":8}},{"label":"以灵力确认没有危险","result":"镜面回应的只有一段旧记忆。你收回灵息，不把无害的怀念当作必须驱除的东西。","effects":{"mana":-8,"insight":1,"qi":12}},{"label":"按订单清点一份饭和餐具","result":"你清楚说明数量，客人点头表示收到了。镜子留在原处，交付也没有含糊。","effects":{"rep":3}}]},
    {"id":"delivery-wind-receipt","kind":"delivery","title":"风不肯吹走的收据","text":"完成核对后，收据突然落到地上。四周有风，薄纸却纹丝不动，背面慢慢显出一条你刚走过的路线。","choices":[{"label":"沿路线末端注入一点灵力","result":"纸面上的终点亮起，随即恢复为普通收据。你感到那段道路似乎也在回望自己。","effects":{"mana":-6,"qi":14}},{"label":"只记住路线，不保留客人信息","result":"你遮住联系方式后看清阵纹，把收据归还。求知并不需要拿走别人的隐私。","effects":{"insight":1,"karma":2}},{"label":"捡起交回，继续完成签收","result":"客人没有发现异常，仍认真说了谢谢。风终于吹动纸角，像给这一单盖了章。","effects":{"rep":2,"qi":5}}]},
    {"id":"delivery-borrowed-fire","kind":"delivery","title":"借一缕不烫人的火","text":"客人端着一盏已经熄灭的小灯，说只想借餐食的一点热气。灯芯没有火，掌心却能感觉到温度。","choices":[{"label":"以少许灵力护住灯芯","result":"灯芯燃起一簇不烫人的小光。你及时停手，没有把自己全部的灵力都投进去。","effects":{"mana":-10,"qi":16}},{"label":"请他靠近热饭，先暖暖手","result":"对方捧住餐盒，灯也跟着明亮了一点。你没有施术，却让冷掉的等待重新有了温度。","effects":{"karma":3,"qi":6}},{"label":"说明餐袋不能拆，交给他自行处理","result":"客人理解地点头，接过完整的餐。你守住了配送的边界，也没有嘲笑那盏灯。","effects":{"rep":2,"insight":1}}]},
    {"id":"delivery-stone-lion","kind":"delivery","title":"石狮嘴里的糖纸","text":"门前石狮咬着一张糖纸，眼角的裂纹泛着暗光。屋里的人说，不知是哪位小孩把它当作了垃圾桶。","choices":[{"label":"取下糖纸，放进垃圾袋","result":"裂纹里的暗光渐渐平息。石狮没有动，你却感到一股很轻的暖意掠过手背。","effects":{"karma":2,"qi":8}},{"label":"用灵力探一探裂纹","result":"裂纹连着一段残缺的门阵，只是沾了杂物。你辨认清楚便收手，没有贸然重塑石像。","effects":{"mana":-7,"insight":1,"qi":12}},{"label":"提醒住户找人清理修护","result":"对方记下石像的情况，向你道谢。你没有擅动不懂的旧物，仍尽到了提醒的责任。","effects":{"rep":2,"karma":1}}]},
    {"id":"delivery-shared-dream","kind":"delivery","title":"梦里见过的骑手","text":"客人一见你就说，昨晚梦里也是你把饭送来。区别只在于梦中的城市没有桥，所有人都隔着水等待。","choices":[{"label":"请他描述梦里最后一盏灯","result":"他记得那盏灯照着一碗热汤。听到这里，你体内的灵息与窗外的灯火轻轻呼应。","effects":{"qi":10,"insight":1},"duration":4},{"label":"告诉他今天的饭已经到了","result":"他低头看见完整的餐袋，笑着承认现实更好一点。梦里的水声也像在此刻退远。","effects":{"karma":3,"rep":1}},{"label":"不下定论，正常核对订单","result":"你确认人、地址和餐品都没有错。梦留给做梦的人，今天的交付则清楚落定。","effects":{"rep":2,"qi":4}}]},
    {"id":"delivery-lantern-stitch","kind":"delivery","title":"缝补灯笼的人","text":"收餐人正用细线补一只旧灯笼。针每穿过一次，破口便闪过一点光，像有许多细小的归途等着缝合。","choices":[{"label":"帮他托住灯笼的骨架","result":"你们按他的步子一针针补好破口。最后的光没有更耀眼，却不再从裂口里漏走。","effects":{"stamina":-4,"karma":2,"qi":9},"duration":6},{"label":"用灵力照清最后一处针脚","result":"微弱的灵光让他看清线头，很快收了针。你发现细致比强大的力量更适合这件事。","effects":{"mana":-6,"insight":1,"qi":10}},{"label":"先请他把针放下吃饭","result":"灯笼被稳稳挂起，餐盒摆到面前。那些需要修补的光，暂时也允许人休息。","effects":{"karma":3,"qi":5}}]},
    {"id":"delivery-city-answer","requiresSystem":true,"kind":"delivery","title":"系统没有给出评价","text":"收餐人只说了一声谢谢，系统却迟迟没有弹出惯常的评语。你望着安静的屏幕，第一次不确定该等什么。","choices":[{"label":"收起手机，回应那声谢谢","result":"你向客人道别，不再等屏幕替这件事命名。一缕灵息安静归入丹田，没有附带指令。","effects":{"karma":2,"qi":10}},{"label":"检查订单是否确实完成","result":"签收信息没有遗漏，你确认后收好手机。系统的沉默没有影响你认真完成自己的工作。","effects":{"rep":3,"insight":1}},{"label":"问自己为什么仍愿意送这一单","result":"答案不是一句宏大的宣言，只是眼前的人还没吃饭。这个念头让你在原地站得更稳了一点。","effects":{"qi":8,"stamina":3},"duration":3}]}
  );
  // 可攻略女性均为18–27岁；固定年龄集中于18–21岁，24岁与27岁构成右尾。
  G.NPCS = [
    {"id":"lin","gender":"female","age":24,"name":"林晚","place":"clinic","role":"行政秘书","color":"#d29a7c","bio":"擅长把混乱的日程排清楚，却总把自己的晚饭排到最后。她想学会不再用随叫随到证明可靠。","romantic":true,
      "arc":[
        ["日程表外的晚饭","林晚刚协调完一场会议，把已经凉透的便当放在日程本旁。她笑说大家的时间都安排好了，唯独忘记了自己。",{"label":"陪她把晚饭吃完","result":"你们聊起与会议无关的小事，她终于把手机翻扣在桌上。","effects":{"affinity":6,"trust":2}},{"label":"帮她核对活动签到表","result":"名单整理好后，她空出了一段不用加班补表格的时间。","effects":{"affinity":4,"trust":4}},{"label":"说下次给她留一份热饭","result":"她在自己的日程上写下了饭点，没有再把它排给别人。","effects":{"affinity":5,"trust":2}}],
        ["一封没发出的邮件","一次活动延期后，林晚把所有责任都写进了道歉邮件，却迟迟没有发出。她怕不够周到，就会失去别人的信任。",{"label":"提醒她分清自己的职责","result":"她删去了不属于自己的承诺，第一次觉得解释清楚也能让人安心。","effects":{"affinity":8,"trust":5}},{"label":"先听她讲完事情经过","result":"有人把整段经历听完，她不再只用一次失误概括自己。","effects":{"affinity":6,"trust":7}},{"label":"陪她回看已经完成的准备","result":"那些被顺利接住的小事不是偶然，她看见了自己真正做好的部分。","effects":{"affinity":7,"trust":4}}],
        ["公益活动开始前","林晚负责协调一场社区公益活动，临时少了一批物资。她拿着清单来商量，不再独自填上所有空缺。",{"label":"拿出八十元支持活动","result":"她把支出逐笔登记，也把你愿意支持的心意认真收下。","effects":{"money":-80,"affinity":10,"trust":5,"karma":4}},{"label":"捐出一枚回春丹给志愿医疗站","result":"药品交由现场医护接收，林晚负责登记，不冒充懂得诊疗的人。","effects":{"affinity":10,"trust":5,"karma":5},"itemCost":{"heal":1}},{"label":"用自己的时间协助联络参加者","result":"你们把确认消息逐一发出，让活动准备少了些仓促。","effects":{"affinity":8,"trust":6},"duration":60}],
        ["明天不用提前到","散场后，林晚没有留下包办所有收尾。她把钥匙交给轮值同事，转身问你明天愿不愿意一起吃早饭。",{"label":"作为朋友，约好互相照应","result":"以后忙起来时，你们会提醒对方给生活留一点空白。","effects":{"affinity":8,"trust":6},"path":"friend"},{"label":"告诉她想一起过往后的日子","result":"她认真握住你的手，说那就先把明天的早饭留给我们。","effects":{"affinity":12,"trust":6},"path":"romance","minTrust":12},{"label":"祝她有个轻松的明天","result":"她笑着关掉工作提醒，你们仍是能安心说话的朋友。","effects":{"affinity":5,"trust":4},"path":"friend"}]
      ]},
    {"id":"chen","gender":"male","age":42,"name":"陈默","place":"garage","role":"修车铺老板","color":"#b8b079","bio":"说话不多，扳手很稳。他把一辆旧车修了很多年，也把一个承诺守了很多年。","romantic":false,
      "arc":[
        ["借你一把扳手","陈默看了看你的车。「这车还能跑。人呢？人也得修。」",{"label":"请他讲讲保养的门道","result":"他从最小的螺丝开始讲，眼睛终于有了光。","effects":{"affinity":6,"trust":3}},{"label":"请他喝一瓶汽水","result":"两只汽水瓶在工具箱边碰了一下。","effects":{"money":-5,"affinity":7,"trust":2}},{"label":"留下帮他收拾铺子","result":"他没说谢谢，第二天却给你留了把椅子。","effects":{"stamina":-5,"affinity":5,"trust":4}}],
        ["一辆从未卖出的旧车","角落的旧车属于一位再没回来的朋友。他说，总怕哪天朋友回来，认不出这家店。",{"label":"告诉他：店在，你也在","result":"他说，是啊，人得先在。","effects":{"affinity":8,"trust":6}},{"label":"帮旧车擦掉灰尘","result":"你们没有说话，一起把车灯擦得很亮。","effects":{"stamina":-4,"affinity":7,"trust":6}},{"label":"给旧车拍一张照片","result":"他把照片贴在收银台后，没有再藏起来。","effects":{"affinity":6,"trust":5}}],
        ["骑手夜修点","陈默想把铺子的一角留给夜班骑手，免费提供工具和一张能坐下歇脚的凳子。",{"label":"资助一套共用工具","result":"第一晚就有人靠这套工具重新上路。","effects":{"money":-60,"affinity":10,"trust":6,"karma":4}},{"label":"下班后帮他做招牌","result":"字写得不整齐，但每个路过的人都看得懂。","effects":{"stamina":-12,"affinity":9,"trust":6}},{"label":"把消息告诉沿路的骑手","result":"很快，铺子里有了此起彼伏的笑声。","effects":{"affinity":8,"trust":5,"rep":3}}],
        ["灯亮到你收工","陈默把备用钥匙递过来。「太晚了就来坐会儿。别一个人硬扛。」",{"label":"接过钥匙，说好互相照应","result":"后来很多个雨夜，这盏灯都为你亮着。","effects":{"affinity":10,"trust":8},"path":"friend"},{"label":"约定把夜修点一直办下去","result":"你们成了这座城市夜路上的两盏灯。","effects":{"affinity":9,"trust":8,"karma":3},"path":"friend"},{"label":"认真道谢，替他也留一把钥匙","result":"真正的朋友，不只是知道你去哪里，也知道你能回来。","effects":{"affinity":10,"trust":7},"path":"friend"}]
      ]},
    {"id":"shen","gender":"female","age":20,"name":"沈青禾","place":"bookshop","role":"编辑助理","color":"#99bba5","bio":"在校样边角写下自己的故事。她能替别人找出错字，却还在学习相信自己的声音。","romantic":true,
      "arc":[
        ["校样里的空白页","沈青禾带着校样来到常约的旧书店，说自己只是编辑助理，却越来越想在空白页上写一点自己的东西。",{"label":"问她最想写哪一种结尾","result":"她把几页手稿推来，先让你读最喜欢的一段。","effects":{"affinity":6,"trust":3}},{"label":"买一本她推荐的书","result":"她夹进一张书签，告诉你不必急着给出读后感。","effects":{"money":-12,"affinity":7,"trust":2}},{"label":"讲一件今天配送的小事","result":"她被一个不起眼的细节打动，在页边记下第一句话。","effects":{"affinity":5,"trust":4}}],
        ["署名之前","一篇由她整理的稿件要刊出了，沈青禾却不敢在协作栏留下自己的名字。她担心所有人只会看到自己还不够好的地方。",{"label":"告诉她最打动你的具体段落","result":"你没有空泛地夸赞，她也开始相信自己的判断值得被看见。","effects":{"affinity":8,"trust":7}},{"label":"陪她发送最终确认邮件","result":"发送提示亮起后，她终于不再反复修改那一行署名。","effects":{"affinity":8,"trust":5}},{"label":"说认真整理也在帮助故事抵达","result":"她看向手里的校样，第一次没有把自己称作可有可无的帮手。","effects":{"affinity":7,"trust":6}}],
        ["借来的阅读会","沈青禾为新刊筹备一场社区阅读会，借到了场地，却还缺一些椅子。她想让作者和读者坐在同一张桌边。",{"label":"出钱租几把椅子","result":"来的人都坐下时，她紧张地笑了，开场词反而变得自然。","effects":{"money":-50,"affinity":10,"trust":5}},{"label":"帮忙搬邻居借出的凳子","result":"凳子高低不齐，谈起故事的人却没有谁坐得更远。","effects":{"stamina":-12,"affinity":9,"trust":6,"karma":3}},{"label":"当第一个朗读的人","result":"你读得并不流利，她却一直认真听到最后。","effects":{"affinity":9,"trust":7}}],
        ["这一页写我们","沈青禾把一本没有写满的笔记交给你，说工作里的稿件都有截稿日，这一本却可以慢慢写。",{"label":"写两个一直交换故事的朋友","result":"她在页边画了两杯茶，约定有空就来续上新的一段。","effects":{"affinity":9,"trust":7},"path":"friend"},{"label":"写下想和她共度的以后","result":"她在你的名字旁写下自己，轻声说那就一起写吧。","effects":{"affinity":12,"trust":6},"path":"romance","minTrust":12},{"label":"写这座城里的普通人","result":"她说我们的友情也算其中一篇，不必急着写出结尾。","effects":{"affinity":8,"trust":6,"karma":3},"path":"friend"}]
      ]},
    {"id":"lu","gender":"male","age":58,"name":"陆听雨","place":"temple","role":"守阵散修","color":"#9baac9","bio":"曾以为修行就是不断告别。直到他看见，一个骑手每天都在返回。","romantic":false,
      "arc":[
        ["山门不问出身","陆听雨望着你的外卖箱。「装过万家饭食，也算一件法器。」",{"label":"请教入门心法","result":"他说，先学会把一口气呼吸完整。","effects":{"affinity":6,"trust":3,"qi":10}},{"label":"分给他一份热饭","result":"他吃得很慢，像已经很久没有尝过盐味。","effects":{"money":-10,"affinity":7,"trust":3}},{"label":"问山下的灯为什么能聚灵","result":"他没有回答，但请你明晚再来。","effects":{"affinity":5,"trust":4,"insight":1}}],
        ["守了三十年的阵","他以为封闭七情才能守住古阵，但阵纹已经越来越暗。",{"label":"告诉他：也许阵需要的正是牵挂","result":"他第一次低头看向山下。","effects":{"affinity":8,"trust":7,"qi":10}},{"label":"与他一同检查阵眼","result":"你在阵里听见了千百年前的家常话。","effects":{"mana":-10,"affinity":7,"trust":6,"qi":18}},{"label":"讲讲每天等你送饭的人","result":"他听到了许多名字，阵纹亮了一瞬。","effects":{"affinity":8,"trust":6,"karma":2}}],
        ["重新点亮的阵眼","修补需要灵力，也需要有人愿意让阵重新连接人间。",{"label":"以自身灵力补阵","result":"你没有变成更孤独的仙人，反而离城市更近了。","effects":{"mana":-25,"affinity":10,"trust":7,"qi":30}},{"label":"捐出两株青灵草","result":"他把灵草埋在阵眼旁，等待它们慢慢生长。","effects":{"affinity":9,"trust":6,"qi":18},"itemCost":{"herb":2}},{"label":"讲起沿途那些被守护的人","result":"他终于明白自己守住的并非一堆石头。","effects":{"affinity":9,"trust":6,"karma":3}}],
        ["道友，明日再见","山门重新打开。陆听雨收起写着断尘的旧匾，换上一张「欢迎回家」。",{"label":"与他约定共同守护此城","result":"你们不再是师与徒，而是走在同一条路上的道友。","effects":{"affinity":10,"trust":8,"qi":30},"path":"friend"},{"label":"请他把心法教给更多人","result":"修行的门槛，从这一晚开始变矮了。","effects":{"affinity":9,"trust":7,"karma":4},"path":"friend"},{"label":"告诉他：我还会继续去更远的地方","result":"他说，无论你走多远，山门都在。","effects":{"affinity":9,"trust":8},"path":"friend"}]
      ]},
    {"id":"zhou","gender":"male","age":25,"name":"周野","place":"market","role":"夜班骑手","color":"#d0a15f","bio":"总说自己只是跑得快一点。真正遇到别人摔倒时，他却永远是第一个停下的人。","romantic":false,
      "arc":[
        ["同一盏红灯","周野把头盔挂在车把上。「上次路边那事，多谢。夜班这行，大家都得互相看一眼。」",{"label":"请他喝杯豆浆","result":"你们站在路边喝完，谁也没有催谁。","effects":{"money":-5,"affinity":7,"trust":3}},{"label":"交换常跑路线","result":"几条容易堵的巷子，被你们画在同一张地图上。","effects":{"affinity":6,"trust":4,"rep":1}},{"label":"问他伤好些没有","result":"他嘴硬说没事，却把护膝重新系紧。","effects":{"affinity":5,"trust":4}}],
        ["被雨淋坏的旧手机","周野的旧手机屏幕裂得更厉害了。他说里面存着很多骑手互相提醒危险路段的聊天记录，舍不得换。",{"label":"帮他备份重要记录","result":"那些零散提醒被整理成一张更完整的夜路地图。","effects":{"affinity":8,"trust":7,"insight":1}},{"label":"陪他去修手机","result":"店员把资料完整导了出来，他明显松了口气。","effects":{"money":-18,"affinity":8,"trust":5}},{"label":"把自己的路线笔记抄给他","result":"他笑说：那我也欠你一份。","effects":{"affinity":7,"trust":6}}],
        ["夜路互助群","周野想做一个不看平台、不分队伍的骑手互助群：爆胎、迷路、临时缺绑带，谁近谁搭把手。",{"label":"拿出四十元买公用急救包","result":"第一天就有人用上了创可贴和雨披。","effects":{"money":-40,"affinity":10,"trust":6,"karma":3}},{"label":"帮忙整理常见求助地点","result":"你们把修车铺、医馆和避雨点标了出来。","effects":{"affinity":9,"trust":7,"rep":2}},{"label":"先拉进今晚遇见的骑手","result":"群名最后定成了“都平安到家”。","effects":{"affinity":8,"trust":6,"karma":2}}],
        ["下一单不比输赢","凌晨四点，你们同时接到两个方向相反的单。周野笑着伸拳：「比谁先回来？」",{"label":"碰拳，说平安回来就算赢","result":"后来这句话成了你们每次出发前的暗号。","effects":{"affinity":10,"trust":8},"path":"friend"},{"label":"约好忙完一起吃早饭","result":"输赢被一碗热面取消了。","effects":{"affinity":9,"trust":8,"stamina":5},"path":"friend"},{"label":"把互助群一直做下去","result":"你们没有成为传奇，只让很多夜路少了一点孤单。","effects":{"affinity":9,"trust":8,"karma":3},"path":"friend"}]
      ]},
    {"id":"su","gender":"female","age":19,"name":"苏砚","place":"park","role":"平面模特","color":"#8db6c9","bio":"刚开始积累作品的平面模特，喜欢自然光与不必摆好的表情。收工后偶尔用旧相机记录河岸，寻找镜头之外的自己。","romantic":true,
      "arc":[
        ["镜头外的表情","苏砚刚结束平面拍摄，给你看一张不在正式作品集里的照片。她说最喜欢的表情，往往发生在摄影师喊收工之后。",{"label":"一起看照片里的光线","result":"她发现你没有只评价漂不漂亮，也在认真听她想表达什么。","effects":{"affinity":6,"trust":4,"qi":8}},{"label":"请她留一张喜欢的照片给你","result":"她选了一张自然笑着的侧影，在背面写好日期。","effects":{"affinity":7,"trust":3}},{"label":"讲讲自己面对镜头的紧张","result":"她笑着承认，站在镜头前的人也不总是自信。","effects":{"affinity":5,"trust":5}}],
        ["被修改的作品集","苏砚收到一组修得几乎不像自己的成片。她想提出修改意见，又怕刚开始工作就显得难相处。",{"label":"陪她核对拍摄时的约定","result":"你们把想保留的细节列清楚，她决定按约定沟通，而不是默默接受。","effects":{"stamina":-8,"affinity":8,"trust":6,"qi":10}},{"label":"请沈青禾帮忙看看说明文字","result":"简洁的说明让她更清楚地表达自己的意见，没有替她决定形象。","effects":{"affinity":7,"trust":6,"insight":1}},{"label":"提醒她不必每次都勉强答应","result":"她松了口气，说下一次会先问清楚，再决定接不接。","effects":{"affinity":8,"trust":7}}],
        ["河岸的试拍","苏砚想为自己的作品集拍一组清晨河岸照，不追求夸张效果。她拿来那台旧相机，请你一起看看光线。",{"label":"陪她试着调整取景角度","result":"试拍间隙你们聊了很多，快门响起时她没有再急着摆好表情。","effects":{"stamina":-10,"affinity":10,"trust":7,"qi":18}},{"label":"用灵力让一盏小灯稳定片刻","result":"不刺眼的光照清了河岸，她保留了真实的影子与微笑。","effects":{"mana":-15,"affinity":9,"trust":6,"qi":22}},{"label":"带一盏普通露营灯来补光","result":"她笑说最朴素的办法也很好，重要的是这次由自己选择。","effects":{"affinity":9,"trust":6,"karma":3}}],
        ["不在作品集里的合影","收工以后，苏砚把相机交给你。这次没有客户和拍摄要求，她只想留下一张属于自己的照片。",{"label":"为朋友拍一张认真看镜头的照片","result":"她自然地笑了，照片里没有被安排好的姿势。","effects":{"affinity":9,"trust":8},"path":"friend"},{"label":"说想和她一起出现在照片里","result":"她确认你的心意后站到身边，定时快门记录了新的开始。","effects":{"affinity":12,"trust":7},"path":"romance","minTrust":12},{"label":"拍下河面和一起看过的天","result":"你们约定以后还来，不必每一次都拍成作品。","effects":{"affinity":8,"trust":8,"karma":2},"path":"friend"}]
      ]}
  ];
  // 1.13.0：常约地点用于主动拜访，不限制配送中遇见人物。
  G.NEW_NPC_IDS = Object.freeze(['xu','tang','gu','ye','wen','luo']);
  G.DELIVERY_NPC_CHANCE = 0.35;
  G.NPCS.push(
    {"id":"xu","gender":"female","age":20,"name":"许知夏","place":"park","role":"知识区主播","color":"#bba482","romantic":true,"bio":"做读书与学习方法直播的年轻主播，开播前总要把资料核对好。她希望观众记住内容，也想给关掉镜头后的自己留一点时间。",
      "arc":[
        ["开播前的提纲","许知夏拿着读书直播的提纲赴约，页边全是待核对的问题。她说比起讲得热闹，更怕把没弄懂的内容讲错。",{"label":"分享自己学会一件事的经历","result":"她先问能否匿名引用，再把你的经历记成一个朴素的开场。","effects":{"affinity":6,"trust":4}},{"label":"帮她整理散开的提纲页","result":"顺序理清后，她终于愿意停下准备，先吃完这顿饭。","effects":{"stamina":-3,"affinity":7,"trust":3}},{"label":"问她最想做哪一期内容","result":"她眼睛亮起来，讲起一本一直想和人一起读完的书。","effects":{"affinity":5,"trust":4}}],
        ["只有几个人的直播间","一场认真准备的直播只有几个人观看。许知夏盯着后台数字，开始怀疑那些翻过的资料是不是白费。",{"label":"陪她读完留下的认真提问","result":"其中一个问题正好回应了她最想讲的部分，她重新拿起了笔。","effects":{"affinity":8,"trust":6}},{"label":"建议把有用内容整理成回放目录","result":"不在场的人也能按自己的时间观看，她不再守着实时数字。","effects":{"affinity":7,"trust":6,"insight":1}},{"label":"听她说说没达到期待的失落","result":"她承认自己也想被看见，不必装作完全不在乎。","effects":{"affinity":8,"trust":7}}],
        ["镜头该朝向哪里","许知夏准备做一次城市共读直播，发现试拍画面里带到了路人的脸和餐袋信息。她决定先调整方案再开播。",{"label":"资助几张提示牌与资料袋","result":"拍摄区域被说明清楚，想旁听但不入镜的人也有座位。","effects":{"money":-35,"affinity":10,"trust":6,"karma":2}},{"label":"一起核对十分钟试播的画面","result":"你们删去不必要的个人信息，留下书页、声音和真正想分享的内容。","effects":{"affinity":9,"trust":7},"duration":10},{"label":"写下一个愿意公开讨论的问题","result":"她把讨论重心放回书里，不再靠闯入别人的生活寻找话题。","effects":{"affinity":9,"trust":6}}],
        ["下播以后不赶路","许知夏关掉镜头和工作通知，说今天不做复盘。她想知道，没有观众的这个晚上，你愿意怎样一起过。",{"label":"作为朋友，约定留一个空晚","result":"你们不催更新，也不把每一次相聚变成素材。","effects":{"affinity":10,"trust":7},"path":"friend"},{"label":"告诉她想陪她过镜头外的日子","result":"她认真点头，说先从今晚一起散步回去开始。","effects":{"affinity":12,"trust":7},"path":"romance","minTrust":12},{"label":"祝她休息，约好下次再聊","result":"她把手机收进包里，友情不需要被直播证明。","effects":{"affinity":9,"trust":8},"path":"friend"}]
      ]},
    {"id":"tang","gender":"female","age":19,"name":"唐梨","place":"market","role":"咖啡师","color":"#cb9b82","romantic":true,"bio":"记得熟客的口味，打奶泡时总哼一小段歌。她想开出自己的季节饮品，而不是永远照着别人的配方。",
      "arc":[
        ["杯边的第一片叶子","唐梨捧着练习拉花的杯子，说自己想试一款新饮品，却总在复刻店里的标准图案。",{"label":"分享配送时听到的口味需求","result":"她先记下低糖和便于携带，再想怎样加入自己的小变化。","effects":{"affinity":6,"trust":4}},{"label":"尝一口再说具体的意见","result":"你说香气很好，但甜度可以低一点，她比听见夸奖还高兴。","effects":{"affinity":7,"trust":3}},{"label":"问她最想喝什么味道","result":"她写下小时候喜欢的水果，准备从这一点熟悉开始尝试。","effects":{"affinity":6,"trust":3}}],
        ["退回来的那一杯","一位客人退回了过甜的饮品。唐梨嘴上说没关系，收工后却把当天的配方看了好几遍。",{"label":"说清楚口味也是一次沟通","result":"她重新标出糖度选项，不再把每次不同意见都当作否定。","effects":{"affinity":8,"trust":6}},{"label":"一起写清点单与更改方式","result":"客人能更容易说明需求，她也不用靠猜测完成每杯饮品。","effects":{"affinity":8,"trust":5,"insight":1}},{"label":"听她讲第一次打奶泡的狼狈","result":"说着说着她笑了，承认熟练也是从一次次失败里慢慢来的。","effects":{"affinity":7,"trust":7}}],
        ["季节菜单的空白","店里让唐梨提出一款季节饮品。她想试很多版本，却已经连续练到深夜。",{"label":"陪她安排一轮有休息的试饮","result":"你们只选几种搭配认真试，空白时间也留在安排里。","effects":{"affinity":9,"trust":7},"duration":8},{"label":"出钱支持一批试饮杯","result":"她把数量记清，邀请愿意参加的人给出具体意见。","effects":{"money":-45,"affinity":10,"trust":6}},{"label":"建议先做一款她真正喜欢的","result":"她不再追求把所有味道塞进一杯，新配方终于有了自己的名字。","effects":{"affinity":9,"trust":6,"karma":2}}],
        ["打烊后的两只杯子","打烊以后，唐梨留了两杯不在菜单上的热饮，说今天没有订单备注，可以坐下来慢慢喝。",{"label":"约定做不用客气的朋友","result":"谁也不急着照顾谁，话题从工作移到了最近喜欢的歌。","effects":{"affinity":10,"trust":8},"path":"friend"},{"label":"说想和她一起过以后的日常","result":"她笑着把杯子推近，问那明天也一起吃晚饭，好不好。","effects":{"affinity":12,"trust":7},"path":"romance","minTrust":12},{"label":"喝完这一杯，再约朋友聚餐","result":"你们把最后一口留得很慢，收工也成了值得期待的事。","effects":{"affinity":9,"trust":7,"stamina":4},"path":"friend"}]
      ]},
    {"id":"gu","gender":"female","age":18,"name":"顾清遥","place":"garage","role":"大学生","color":"#93aebc","romantic":true,"bio":"刚进入大学校园，习惯在手绘地图上标满课程与社团活动。她好奇心旺盛，也在学着不必什么都拿第一。",
      "arc":[
        ["校园地图上的箭头","顾清遥带来自己画的大学校园图，课表、社团与食堂挤在同一页。她想把刚开始的大学生活安排得一点不漏。",{"label":"补上自己送餐时确认的入口","result":"她认真标注来源，地图多了一条真正走得通的路。","effects":{"affinity":6,"trust":4}},{"label":"问她最期待哪一门课","result":"她讲起第一次选课的兴奋，暂时忘了排得太满的时间表。","effects":{"affinity":7,"trust":3}},{"label":"帮她在地图上记好日期","result":"她笑说路会变，计划当然也可以改。","effects":{"affinity":6,"trust":4,"insight":1}}],
        ["第一次没答好的题","一次课堂展示没发挥好，顾清遥打算把所有社团时间都用来重做。她习惯了争第一，突然不知道怎样面对普通的一次失误。",{"label":"陪她找出真正没弄懂的部分","result":"问题被拆小后，没有她想象中那么不可收拾。","effects":{"affinity":8,"trust":7}},{"label":"一起想想下次怎样向同学请教","result":"她发现提问不代表认输，也可以是认识新朋友的开始。","effects":{"affinity":8,"trust":6}},{"label":"问她这周有没有睡够","result":"她承认，疲惫时最容易把一次失误看成全部。","effects":{"affinity":7,"trust":6}}],
        ["小组作业的空位","小组展示临近，顾清遥悄悄把别人的任务也接到了自己这里。她担心进度，却还没试过认真商量分工。",{"label":"陪她整理可交接的分工清单","result":"任务终于回到各自负责的人手里，她也给自己留了一晚休息。","effects":{"affinity":9,"trust":7},"duration":12},{"label":"买几条公用的展示绑带","result":"小组道具稳稳固定好，她记下借还方法，感谢你的帮忙。","effects":{"money":-25,"affinity":10,"trust":6}},{"label":"提醒她同伴也值得信任","result":"她发出求助消息，第一次没有在深夜把分好的任务又做一遍。","effects":{"affinity":9,"trust":7,"karma":2}}],
        ["没有截止日期的约定","顾清遥拿出两张空便签，说今天不写课表和待办，只写一件真心想做的事。",{"label":"写下朋友之间的平安到家","result":"她把便签放进书包，记住了成绩之外也有人在意自己。","effects":{"affinity":10,"trust":8},"path":"friend"},{"label":"写下想和她认真走下去","result":"她看了很久，说想和你一起慢慢了解彼此，不急着跳过今天。","effects":{"affinity":12,"trust":7},"path":"romance","minTrust":12},{"label":"约好一起不带任务散步","result":"你们决定不比较谁更熟悉路，走错了也可以再回来。","effects":{"affinity":9,"trust":8},"path":"friend"}]
      ]},
    {"id":"ye","gender":"female","age":21,"name":"叶青岚","place":"temple","role":"花艺师","color":"#91b29a","romantic":true,"bio":"喜欢用随季节变化的花材做小花束。她相信赠送者的心意，比统一的花语和昂贵的包装更重要。",
      "arc":[
        ["花束里留出的空隙","叶青岚带来一束没有塞满的花。她说花需要舒展的位置，心意也不一定要用昂贵的包装证明。",{"label":"请教怎样搭配当季花材","result":"她讲起枝叶的方向，你在仔细观察里感到一丝平静的灵息。","effects":{"affinity":6,"trust":4,"qi":6}},{"label":"帮她分开沾湿的包纸","result":"花束重新包好，原本被压住的一片叶子舒展开来。","effects":{"stamina":-3,"affinity":7,"trust":3}},{"label":"问她最初为什么学插花","result":"她讲起第一次收到一小枝野花的惊喜，神情比平时轻快。","effects":{"affinity":6,"trust":4}}],
        ["没有统一答案的花语","一位客人担心送错花会说错心意。叶青岚翻着旧笔记，发现自己也曾把书上的解释讲得太绝对。",{"label":"一起圈出需要向赠送者确认的地方","result":"比起套用一句花语，她更想先听见这个人的故事。","effects":{"affinity":8,"trust":7,"insight":1}},{"label":"请她讲怎样改正过去的解释","result":"她说先把不确定讲清楚，再帮助对方选择喜欢的颜色。","effects":{"affinity":8,"trust":6}},{"label":"认真听她说那次误会","result":"她不再把失误藏起来，新的笔记多了几行真实的问题。","effects":{"affinity":7,"trust":7}}],
        ["不当季的订单","有人希望叶青岚赶制一束缺货的花材。她想做好委托，也不愿答应自己无法保证的供应。",{"label":"帮她写清替代花材与确认安排","result":"方案列得清楚，对方可以重新选择，不必在最后一刻失望。","effects":{"affinity":9,"trust":7},"duration":10},{"label":"支持她整理现有的花材","result":"你们先照料好手边的花，没有为了凑数浪费还新鲜的枝叶。","effects":{"stamina":-6,"affinity":10,"trust":6}},{"label":"提醒她也给自己安排休息","result":"她把交付时间说清楚，终于没有整夜守在工作台旁。","effects":{"affinity":9,"trust":6,"karma":2}}],
        ["下一季仍一起看花","叶青岚收好剪刀，说花的季节会换，重要的人却可以一年又一年认真相见。",{"label":"约定做互相提醒的朋友","result":"你们把急躁放在花瓶外，静坐片刻，灵息也慢慢平稳。","effects":{"affinity":10,"trust":8,"qi":12},"path":"friend"},{"label":"告诉她想一起看往后的四季","result":"她把一枝当季花递给你，说那就从今天开始，一起慢慢看。","effects":{"affinity":12,"trust":7},"path":"romance","minTrust":12},{"label":"约好路过时仍分一份热饭","result":"花剪与外卖箱都可以暂时放下，友情仍在日常里继续。","effects":{"affinity":10,"trust":7},"path":"friend"}]
      ]},
    {"id":"wen","gender":"female","age":18,"name":"闻星","place":"bookshop","role":"插画师","color":"#b0a0c1","romantic":true,"bio":"刚开始接委托的自由插画师，随身带着速写本。她画得出别人的故事，也想留下不为交稿而画的一页。",
      "arc":[
        ["速写本里的小空格","闻星刚完成一张委托草图，页边留着几幅自己画的小人。她说那些才是今天画得最放松的部分。",{"label":"建议为自己的画也留出一页","result":"她翻到空白处，认真写下一个与截稿无关的想法。","effects":{"affinity":6,"trust":4}},{"label":"请她讲讲草图和成稿的区别","result":"几条没画完整的线，反而藏着最初想到故事时的兴奋。","effects":{"affinity":7,"trust":3,"insight":1}},{"label":"帮她盖好散落的笔帽","result":"桌面整理好后，她终于舍得把速写本递给你看看。","effects":{"affinity":6,"trust":3}}],
        ["迟迟没回的修改意见","一张插画已经交出，委托方却没有回复。闻星反复刷新消息，担心是自己画得不好。",{"label":"陪她按约定发一条确认消息","result":"消息只说明当前进度，她发完后终于放下了手机。","effects":{"affinity":8,"trust":6}},{"label":"建议妥善保存版本，再等回应","result":"文件留好了，她有了余地继续画自己的东西，也问你下次能否再来。","effects":{"affinity":7,"trust":7}},{"label":"问这张画最想表达什么","result":"她讲起画面里等人吃饭的灯，越讲越清楚自己为什么想画它。","effects":{"affinity":8,"trust":7}}],
        ["署名要留在哪里","闻星准备参加一次社区插画展，不知道该怎样标注参考与创作过程，既不夸大自己，也不把自己的劳动抹去。",{"label":"一起写清作品说明与参考来源","result":"每张画都有自己的名字，读者也能分清哪些是参考、哪些是她的表达。","effects":{"affinity":9,"trust":7},"duration":8},{"label":"资助一套装裱小材料","result":"画作被稳稳装好，没有为了赶展示损坏原稿。","effects":{"money":-30,"affinity":10,"trust":6}},{"label":"建议先确定展出数量与休息时间","result":"她不再逼自己填满每一面墙，少一点也能认真展示。","effects":{"affinity":9,"trust":6,"karma":2}}],
        ["画面之外的我们","闻星把速写本合上，说今天想先与你说话，不必把每一个好时刻都画下来才能留下。",{"label":"约好朋友之间有空就见","result":"你们的友情没有交稿日，迟一些也能把近况认真讲完。","effects":{"affinity":10,"trust":8},"path":"friend"},{"label":"告诉她想和她共度以后的时光","result":"她牵住你的手，说不必等每一张画完成，我们的故事就可以开始。","effects":{"affinity":12,"trust":7},"path":"romance","minTrust":12},{"label":"提醒她偶尔把画具留在家里","result":"她笑着说那下次只带一份饭，空白页以后再画。","effects":{"affinity":10,"trust":7},"path":"friend"}]
      ]},
    {"id":"luo","gender":"female","age":27,"name":"罗映秋","place":"park","role":"活动策划师","color":"#aaa88d","romantic":true,"bio":"把场地、流程和备选方案记得清清楚楚。她能照顾一场活动里的每个人，却正在练习把休息也写进自己的安排。",
      "arc":[
        ["流程表外的十分钟","罗映秋带着活动流程表赴约，结束时间后又排了长长一列复盘。她看着那张表，才发现没有写吃饭。",{"label":"听她讲最难协调的一次现场","result":"她记住的不是谁出错，而是谁在最忙的时候接住了一项任务。","effects":{"affinity":6,"trust":4}},{"label":"帮她整理散开的流程页","result":"资料不再挤成一团，她也终于能腾出手接过热饭。","effects":{"affinity":7,"trust":3}},{"label":"问她忙完最想做什么","result":"她想了一会儿，说想看一场不需要自己负责的电影。","effects":{"affinity":6,"trust":4}}],
        ["临时取消的舞台","一场活动临时改期，罗映秋下意识准备独自向所有人解释。她最擅长稳住场面，却不习惯告诉同伴自己也会慌。",{"label":"陪她把变更和原因分开写清","result":"通知终于简洁起来，不需要把每一句歉意都压在她身上。","effects":{"affinity":8,"trust":7}},{"label":"告诉她不用独自承担所有沟通","result":"她联系负责不同环节的伙伴，发现商量比硬撑更有效。","effects":{"affinity":8,"trust":6}},{"label":"聊聊下一次还能怎样合作","result":"话题不再只围着取消打转，她开始期待一次新的准备。","effects":{"affinity":7,"trust":7}}],
        ["交给同伴的那一页","罗映秋计划把一场社区活动分给团队协作，却总忍不住检查每个细节。她拿着流程表来问，你会怎样放心交出去。",{"label":"一起标明负责人与待确认事项","result":"十二分钟后，清单终于不再只有她一个人的名字。","effects":{"affinity":9,"trust":7},"duration":12},{"label":"请她把安全提醒写得更具体","result":"同伴能按清楚的提醒检查场地，不必猜她没说出口的担心。","effects":{"affinity":10,"trust":6,"insight":1}},{"label":"写上同伴可以调整的空间","result":"她保留必要的节点，也让伙伴用自己的办法做好事情。","effects":{"affinity":9,"trust":7,"karma":2}}],
        ["这次只做赴约的人","活动结束后，罗映秋没有继续盯着工作群。她把工作证收进包里，说这次想只作为赴约的人见你。",{"label":"作为朋友，约好互报平安","result":"她不再只问别人是否忙完，也允许自己被关心。","effects":{"affinity":10,"trust":8},"path":"friend"},{"label":"说想成为与她一起回家的人","result":"她认真确认你的心意，然后笑着说：那以后的日程，我们一起商量。","effects":{"affinity":12,"trust":8},"path":"romance","minTrust":12},{"label":"祝她今晚睡个安稳觉","result":"流程表合上了，你们的友情不需要加班来证明。","effects":{"affinity":10,"trust":7},"path":"friend"}]
      ]}
  );
  // 1.16.0：追加九位男性；旧十二人顺序和服务地点首位关联保持不变。
  G.NEW_MALE_NPC_IDS = Object.freeze(["han", "zhao", "qin", "cheng", "song", "yue", "pei", "meng", "jiang"]);
  G.NPCS.push(
    {"id":"han","name":"韩远舟","gender":"male","age":34,"role":"急诊医生","place":"clinic","color":"#8baeb5","romantic":false,"bio":"口袋里常装着一块来不及吃的饼干。急诊室外，他正在学着把没能解决的事情交给明天，而不是全带回家。","arc":[["白衣口袋里的饼干","韩远舟下班后赴约，掏钥匙时掉出一块压碎的饼干。他说那原本是午饭，又笑自己总劝别人按时吃。",{"label":"先陪他吃完面前的饭","result":"他把饼干收好，第一次没有一边吃一边看工作消息。","effects":{"affinity":6,"trust":4}},{"label":"问他今天有没有一件顺利的事","result":"他想起一个终于退烧的孩子，语气不再只有疲惫。","effects":{"affinity":7,"trust":3}},{"label":"把聊天留到他吃完以后","result":"这次没有人催他回答，热饭也没有再次放凉。","effects":{"affinity":5,"trust":5}}],["没有署名的感谢卡","韩远舟带来一张匿名感谢卡，只写着那晚有人陪着，所以没有那么害怕。他反而记起同一晚自己没能做到的事。",{"label":"问他愿不愿意把卡片留下","result":"他把卡片夹进自己的本子，承认被感谢也不必急着推开。","effects":{"affinity":8,"trust":6}},{"label":"听他讲那一晚自己的感受","result":"他只谈感受，不透露患者的身份。你们没有替遗憾编一个圆满结局。","effects":{"affinity":7,"trust":7}},{"label":"说今天能休息也很重要","result":"他点点头，把明天的闹钟往后调了一格。","effects":{"affinity":8,"trust":5}}],["值班表上的空白","科里终于排出一个完整休息日，韩远舟却习惯性准备去顶班。他说不是没人接手，只是不知道空下来该做什么。",{"label":"一起列一份与工作无关的小计划","result":"十分钟里，清单上只有散步、吃饭和看一本闲书。他发现这些也值得认真安排。","effects":{"affinity":9,"trust":7},"duration":10},{"label":"借给他自己读过的故事","result":"他答应读完再聊，不把这当成新的任务。","effects":{"affinity":9,"trust":6,"insight":1}},{"label":"邀请他休息日来吃一顿早饭","result":"他确认同事已经接班，才郑重答应了这个普通的约定。","effects":{"affinity":10,"trust":6}}],["不值班的早晨","韩远舟穿着便服来到约定的早餐摊，手机安静地放在包里。他说今天可以慢慢吃，不用随时站起来。",{"label":"约定做彼此能说累的朋友","result":"你们不比较谁更辛苦，只约好以后都别把疲惫藏成一句没事。","effects":{"affinity":10,"trust":8},"path":"friend"},{"label":"约好隔一阵就一起吃早饭","result":"这张不写进值班表的约定，成了两人各自生活里的小小盼头。","effects":{"affinity":9,"trust":8,"stamina":4},"path":"friend"},{"label":"告诉他有空就来，不必准时打卡","result":"他说朋友的饭局确实不该再排成一班工作。","effects":{"affinity":10,"trust":7},"path":"friend"}]]},
    {"id":"zhao","name":"赵启明","gender":"male","age":36,"role":"电力检修员","place":"garage","color":"#c8ae68","romantic":false,"bio":"总先确认灯为什么熄了，再谈怎样让它亮起来。工作之外爱听老歌，最怕别人只记得修好的灯，忘记修灯的人也会累。","arc":[["没来得及喝的热茶","赵启明把保温杯倒过来，里面的茶已经冷了。他说刚才等另一组同事交接，索性又多等了一会儿。",{"label":"给他让出一张靠里的凳子","result":"他放下工具袋，说今天终于能坐稳喝完一杯。","effects":{"affinity":6,"trust":4}},{"label":"问他工具袋为什么贴着旧歌名","result":"他说怕拿错，就写了自己最喜欢的歌，随后轻轻哼了两句。","effects":{"affinity":7,"trust":3}},{"label":"提醒他先把饭吃热","result":"他笑说灯有人看着，这一会儿可以先管自己。","effects":{"affinity":6,"trust":3}}],["一封写错姓名的表扬信","居民把修灯的功劳全写给赵启明，漏掉了两个守在雨里的同事。他拿着信，想纠正又怕像在挑刺。",{"label":"陪他补上同伴的名字","result":"他把大家做过的事写清楚，没有把自己的那一份划掉。","effects":{"affinity":8,"trust":7}},{"label":"建议把信给同事一起看看","result":"几个人先笑错字，再说起那晚谁带来的姜茶最有用。","effects":{"affinity":8,"trust":6}},{"label":"问他最想怎样记住那晚","result":"他说不是停电多久，而是所有人最后都平安回来了。","effects":{"affinity":7,"trust":7,"karma":1}}],["最后一盏不必独守的灯","赵启明准备把常见报修事项整理成可交接的记录，却总想再检查一次才交出去。搭档已经在门外等他吃饭。",{"label":"陪他整理已确认的交接记录","result":"十二分钟里，你只帮忙整理文字，不接触线路。剩下的核验由有资质的同事接手。","effects":{"affinity":9,"trust":7},"duration":12},{"label":"给大家买一包共用便签","result":"记录终于能贴在所有人看得见的位置，不必靠一个人的记性。","effects":{"money":-20,"affinity":10,"trust":6}},{"label":"提醒他搭档还等着一起吃饭","result":"他把工具收好，带着那份没写完的记录交给下一班。","effects":{"affinity":9,"trust":6,"karma":2}}],["收工以后再听一首","街灯准时亮起，赵启明却没有抬头逐盏数。他把耳机取下一边，说这首歌正好想放给你听。",{"label":"约定做收工后能闲聊的朋友","result":"话题终于不只有报修，两个人还为一段旧歌词争了半天。","effects":{"affinity":10,"trust":8},"path":"friend"},{"label":"约好下次各带一首喜欢的歌","result":"他说不用挑最有道理的，好听就行。","effects":{"affinity":9,"trust":8},"path":"friend"},{"label":"告诉他哪天想歇就来坐坐","result":"你们替彼此留了一张不用带工具也能坐下的凳子。","effects":{"affinity":10,"trust":7},"path":"friend"}]]},
    {"id":"qin","name":"秦观澜","gender":"male","age":29,"role":"气象观测员","place":"park","color":"#8ba7cb","romantic":false,"bio":"喜欢云，却比谁都认真记下看错云的时候。随身的小本子一半是观测笔记，另一半是还没吃过的面馆。","arc":[["云图背面的面馆","秦观澜翻找观测笔记，露出背面密密麻麻的面馆名单。他赶紧解释，休息时总要研究一点不同的东西。",{"label":"推荐一家自己确实吃过的面馆","result":"他先问营业时间，再在名单旁画了一朵小云。","effects":{"affinity":6,"trust":4}},{"label":"请他讲讲今天最特别的一片云","result":"他说起云边被夕阳照亮的样子，没急着把一切变成数字。","effects":{"affinity":7,"trust":3}},{"label":"问那家一直没打勾的店在哪里","result":"他说每次路过都太忙，忽然觉得下次可以认真进去坐坐。","effects":{"affinity":6,"trust":4}}],["那场没有等到的雨","一场预报里的雨迟迟没来，秦观澜收到不少抱怨。他知道预报有不确定性，仍很介意别人因此多跑的路。",{"label":"听他说明当时掌握了哪些信息","result":"他把确定与不确定分开讲，不再用更多术语掩饰遗憾。","effects":{"affinity":8,"trust":7}},{"label":"建议把更新说明写得更清楚","result":"他留下什么时候更新、哪里能再查，不许诺下一次一定不会变。","effects":{"affinity":8,"trust":6,"insight":1}},{"label":"问他现在最需要什么","result":"他想了想说，先吃顿饭，再回去认真复盘。","effects":{"affinity":7,"trust":6}}],["给夜路留一行提醒","秦观澜想把观测站公开的天气提醒写得更容易看懂，特别是留给深夜仍在路上的人。",{"label":"帮他读一遍写给骑手的说明","result":"八分钟里，你指出难懂的地方，他保留原始来源和更新时间，不把提醒变成保证。","effects":{"affinity":9,"trust":7},"duration":8},{"label":"分享自己在雨里绕路的经历","result":"他发现一行醒目的更新时间，可能比一整页术语更有用。","effects":{"affinity":10,"trust":6}},{"label":"请他保留不确定的那一栏","result":"他没有把概率改成断言，也没因此不再认真提醒。","effects":{"affinity":9,"trust":6,"insight":1}}],["晴天也可以赴约","秦观澜终于走进名单上那家面馆，没有带观测任务，只带了两个准备慢慢聊的话题。",{"label":"约好做晴雨都能见面的朋友","result":"你们看了一眼天，再把话题留给面前的饭。","effects":{"affinity":10,"trust":8},"path":"friend"},{"label":"一起继续那份面馆名单","result":"名单不再只有他一个人的字迹，下一次休息也有了去处。","effects":{"affinity":9,"trust":8},"path":"friend"},{"label":"说临时改约也没关系","result":"他笑说天气会变，朋友之间可以多说一句，而不是硬撑。","effects":{"affinity":10,"trust":7},"path":"friend"}]]},
    {"id":"cheng","name":"程砚秋","gender":"male","age":45,"role":"古籍修复师","place":"bookshop","color":"#ac9b82","romantic":false,"bio":"手很稳，说笑话却总慢半拍。他珍惜纸页上的旧痕，也正在接受有些空缺不该由自己替别人填上。","arc":[["一张没被补平的纸","程砚秋给你看一张练习用的旧纸，边缘留着一道很细的折痕。他说修复不是让每张纸都假装从未被用过。",{"label":"问他为什么愿意留下折痕","result":"他说这也是别人翻过它的证据，手指只停在纸外。","effects":{"affinity":6,"trust":4}},{"label":"先把餐盒放到离纸远的桌上","result":"他笑着道谢，说这比夸手艺更让自己放心。","effects":{"affinity":7,"trust":3}},{"label":"请他讲讲自己第一次练习","result":"他承认第一次连练习纸都弄皱了，倒把紧张气氛说散了。","effects":{"affinity":6,"trust":4}}],["师父没有写完的批注","程砚秋整理旧笔记，发现师父有一处批注停在半句。他想续上，却始终想不起当时真正说过什么。",{"label":"建议把记得与猜测分开写","result":"他在旁边添了自己的日期，没把自己的字冒充师父的回答。","effects":{"affinity":8,"trust":7}},{"label":"听他讲那位不爱夸人的师父","result":"他说起许多笨拙的小事，半句批注之外的人反而清楚起来。","effects":{"affinity":8,"trust":6}},{"label":"说留下空白也不等于忘记","result":"他把笔放下，承认想念不一定非要补成一句完整的话。","effects":{"affinity":7,"trust":7}}],["修复桌外的一张椅子","程砚秋准备办一次修复展示，担心观众只想看纸页瞬间变新。他想让人看见缓慢工作的真实样子。",{"label":"陪他整理公开的工序照片","result":"十分钟里，只整理获准公开的练习记录，真正的修复仍由他亲手完成。","effects":{"affinity":9,"trust":7},"duration":10},{"label":"资助几只展示用文件夹","result":"纸页有了稳妥的收纳，标签写清复制品与原件的区别。","effects":{"money":-25,"affinity":10,"trust":6}},{"label":"当第一个认真提问的观众","result":"你的问题让他放下背好的讲解词，开始讲自己为何愿意慢下来。","effects":{"affinity":9,"trust":6,"insight":1}}],["留给新故事的空白页","展示结束后，程砚秋拿出一本普通空白本。他说给别人补了一辈子的书，也想记几件自己的闲事。",{"label":"约定做交换闲事的朋友","result":"你的配送小事和他的冷笑话，被写在了同一页。","effects":{"affinity":10,"trust":8},"path":"friend"},{"label":"约好有空一起去看旧书摊","result":"这一次不带工作清单，遇见喜欢的就多翻两页。","effects":{"affinity":9,"trust":8},"path":"friend"},{"label":"告诉他空白可以慢慢填","result":"他说那就不急着给这段友情写一个结尾。","effects":{"affinity":10,"trust":7},"path":"friend"}]]},
    {"id":"song","name":"宋泊宁","gender":"male","age":32,"role":"夜班公交司机","place":"market","color":"#879cb3","romantic":false,"bio":"认得末班车沿线的灯，也认得赶路的人不同的脚步声。换班后喜欢做模型，却总把自己的那辆停在最后一道工序。","arc":[["终点站的模型车","宋泊宁从包里拿出一辆还没装好轮子的模型车，说做模型比开车慢得多，一急就把小零件掉到地上。",{"label":"帮他找回滚到桌边的轮子","result":"他把零件收好，笑说今天总算不用再补一次货。","effects":{"affinity":6,"trust":4}},{"label":"问为什么选这款车","result":"他说那是自己第一次跟班的车型，连座椅颜色都还记得。","effects":{"affinity":7,"trust":3}},{"label":"请他先吃饭，模型晚点再装","result":"他收起盒子，说你和老同事劝人的口气倒像。","effects":{"affinity":6,"trust":4}}],["站台上没赶上的人","宋泊宁说起一名总差半步赶不上末班的乘客。他不能擅自改点，却一直记着对方失落的眼神。",{"label":"建议把实际情况通过正规渠道反馈","result":"他把频次和站点写清，不把个人好意当作随意延误整车人的理由。","effects":{"affinity":8,"trust":7}},{"label":"陪他查清可以公开的替代路线","result":"他只保留核对过的信息，准备请站务人员贴到合适的位置。","effects":{"affinity":8,"trust":6,"insight":1}},{"label":"听他说为什么一直记着那个人","result":"他说自己也曾在陌生城市赶不上最后一班，知道那种感觉。","effects":{"affinity":7,"trust":7}}],["轮到自己坐靠窗的位置","宋泊宁休息日想去看一个模型展，却又差点答应临时换班。同事告诉他，这一次真的有人能接。",{"label":"陪他把参观计划排得宽松些","result":"八分钟里，路线只留必要的几站，还有一顿不用赶着吃的午饭。","effects":{"affinity":9,"trust":7},"duration":8},{"label":"提醒他先确认交接已经完成","result":"他收到同事的回复，终于没有再把休息日改成待命。","effects":{"affinity":10,"trust":6}},{"label":"说自己也想一起去看看","result":"他说那正好，有些模型终于不用只拍给别人看了。","effects":{"affinity":9,"trust":7}}],["下一站不是工作","回程时宋泊宁坐在靠窗的位置，没有数下一站还有多久，只认真听你讲今天最喜欢的展品。",{"label":"约定做不赶末班的朋友","result":"你们给下一次见面留了余量，不用把友情也跑成一条准点线路。","effects":{"affinity":10,"trust":8},"path":"friend"},{"label":"约好模型装完时再聚一次","result":"他说成品好不好看另说，饭肯定给你留热的。","effects":{"affinity":9,"trust":8},"path":"friend"},{"label":"告诉他休息日就好好当乘客","result":"他笑着点头，终于肯把方向盘交给此刻值班的人。","effects":{"affinity":10,"trust":7},"path":"friend"}]]},
    {"id":"yue","name":"岳长川","gender":"male","age":39,"role":"消防救援员","place":"clinic","color":"#b89577","romantic":false,"bio":"训练时严谨，闲下来却爱琢磨笨拙的手工。救援之外，他想学会认真回答别人问自己的那句“还好吗”。","arc":[["休息室里的纸船","岳长川赴约时带着一只折得歪斜的纸船，说队友的孩子教过一次，自己到现在没学会让它站稳。",{"label":"和他一起研究那道折痕","result":"纸船终于立住，他笑得比完成一次难训练还轻松。","effects":{"affinity":6,"trust":4}},{"label":"问他空闲时还喜欢做什么","result":"他想了半天，说也许该多试几件与工作无关的事。","effects":{"affinity":7,"trust":3}},{"label":"提醒他饭快凉了","result":"他把纸船移开，承认自己认真起来也会忘记吃饭。","effects":{"affinity":6,"trust":4}}],["没有必要独自消化的夜晚","岳长川提到一次工作后的失眠，只讲自己的感受，没有谈涉及他人的细节。他习惯把一句还好说得很快。",{"label":"告诉他不用现在就给出答案","result":"他安静了一会儿，终于承认最近确实睡得不太踏实。","effects":{"affinity":8,"trust":7}},{"label":"问他是否愿意找可信的同伴聊聊","result":"他说队里有支持安排，自己不必总等到别人开口才承认需要。","effects":{"affinity":8,"trust":6}},{"label":"陪他谈一件今天的小事","result":"你们聊起那只纸船，没有要求一个夜晚就把难过说完。","effects":{"affinity":7,"trust":7}}],["演练结束后的合影","一次公开宣传结束，大家想拍张轻松的合影。岳长川却还在复盘每个细节，差点站到镜头外面。",{"label":"陪他整理公开活动的反馈卡","result":"十二分钟后，记录交给负责同事。他放下纸笔，赶上了最后一张照片。","effects":{"affinity":9,"trust":7},"duration":12},{"label":"帮他保管已经收好的讲解道具","result":"你没有触碰专业装备，只替他腾出参加合影的双手。","effects":{"affinity":10,"trust":6}},{"label":"喊他一起站进照片里","result":"他不好意思地走过来，队友给他留了正中间的位置。","effects":{"affinity":9,"trust":7,"karma":1}}],["今天也有人问你好吗","岳长川把冲洗好的合影拿给你，背面写着那天参加活动的人。他说以后不会总把自己的名字漏掉。",{"label":"约定做能互相问候的朋友","result":"你们都不必永远只做报平安的一方，也可以认真说一句累了。","effects":{"affinity":10,"trust":8},"path":"friend"},{"label":"约好下次教他折另一只纸船","result":"他提前认输，说手工这件事可能得慢慢学。","effects":{"affinity":9,"trust":8},"path":"friend"},{"label":"说有空就来吃顿普通的饭","result":"饭局没有任务，你们也不用把见面讲成一件特别重要的大事。","effects":{"affinity":10,"trust":7},"path":"friend"}]]},
    {"id":"pei","name":"裴景行","gender":"male","age":28,"role":"文物研究员","place":"temple","color":"#a99dba","romantic":false,"bio":"总把“或许”写在结论前面，却会为一个新发现兴奋很久。他追索旧城留下的痕迹，也在学习不让过去盖住今天。","arc":[["拓片边缘的饭渍","裴景行展示一张练习拓片，刚想开始讲解便发现旁边有一道自己留下的饭渍。他立刻换了干净桌垫。",{"label":"先把餐放到另一张桌上","result":"他道谢后笑自己总提醒别人，偶尔却也犯同样的错。","effects":{"affinity":6,"trust":4}},{"label":"问这处模糊纹样有什么特别","result":"他先说明只是猜测，仍掩不住找到线索的兴奋。","effects":{"affinity":7,"trust":3}},{"label":"请他讲讲怎样开始研究旧城","result":"他说最早只是好奇一块没人再读得懂的旧门牌。","effects":{"affinity":6,"trust":4}}],["一个还不能写进结论的名字","裴景行找到一个可能与旧城史有关的名字，但证据还不够。他怕错过发现，也怕急着发表后误导别人。",{"label":"陪他分开线索与推测","result":"写在纸上的层次清楚了，他不必用肯定语气替自己壮胆。","effects":{"affinity":8,"trust":7,"insight":1}},{"label":"问还有什么材料可以核对","result":"他列出下一步的公开资料，没要求你去碰不该进入的地方。","effects":{"affinity":8,"trust":6}},{"label":"听他说发现时为什么激动","result":"他讲起第一次觉得历史离自己很近的瞬间，而不是急着证明谁对谁错。","effects":{"affinity":7,"trust":7}}],["给普通人看的旧城图","裴景行准备把能公开的旧城线索整理成小展板。最难的是把不知道的地方也诚实地留在图上。",{"label":"陪他校对图上的来源说明","result":"十分钟里，确证与推测使用不同标记，展板没有因此少掉趣味。","effects":{"affinity":9,"trust":7},"duration":10},{"label":"带来自己配送时记下的公开地名","result":"他先核对来源，再把今天仍有人使用的称呼补进图里。","effects":{"affinity":10,"trust":6}},{"label":"问图里能不能留下今天的故事","result":"他说旧城并未停止生长，你这句话值得放到展板最后。","effects":{"affinity":9,"trust":7,"qi":6}}],["旧城之外还有新的一页","展板撤下后，裴景行把一张空白新图摊开。他说接下来想记今天的店、今天的灯和今天认识的人。",{"label":"约定做交换线索的道友","result":"你们不把猜测当承诺，也不因为暂时没答案就失去谈话的兴致。","effects":{"affinity":10,"trust":8,"qi":8},"path":"friend"},{"label":"约好有空一起走一段老街","result":"这一次走过的路，不必都对应一个等着解开的谜。","effects":{"affinity":9,"trust":8},"path":"friend"},{"label":"告诉他也给自己的生活留一页","result":"他把你的名字写进朋友一栏，不再只记档案里的名字。","effects":{"affinity":10,"trust":7},"path":"friend"}]]},
    {"id":"meng","name":"孟怀山","gender":"male","age":63,"role":"退休木匠","place":"park","color":"#b19777","romantic":false,"bio":"退休后仍会带一把小尺，却不再接赶工的活。喜欢把旧家具修到还能用，也想让年轻人用自己的办法接着做。","arc":[["长凳上多出来的一寸","孟怀山用随身小尺比了比长凳，说自己以前总按最省料的尺寸做，现在才发现宽一点能让人坐得舒服。",{"label":"坐下来试试他新加的坐垫","result":"他认真问哪里不舒服，没急着告诉你自己做了多少年。","effects":{"affinity":6,"trust":4}},{"label":"问他为什么还随身带尺","result":"他说习惯一时改不掉，但今天量完可以不立刻开工。","effects":{"affinity":7,"trust":3}},{"label":"请他先吃饭，尺寸等会再量","result":"他笑着收尺，说这顿饭倒不用再精确到一寸。","effects":{"affinity":6,"trust":4}}],["徒弟画了另一种榫","孟怀山看见年轻同行的新设计，第一反应是以前不这么做。看完说明，又发现对方有自己的用意。",{"label":"请他先问对方为什么这样设计","result":"他认真听完，发现自己能传授经验，也能学一点新办法。","effects":{"affinity":8,"trust":7}},{"label":"听他说最早被师父纠正的经历","result":"他笑说那时也嫌老规矩多，话到这里自己先停了下来。","effects":{"affinity":8,"trust":6}},{"label":"建议把不同做法都记下来","result":"笔记不再只有唯一答案，也标出了各自适合的场合。","effects":{"affinity":7,"trust":7,"insight":1}}],["修好以后交给别人坐","孟怀山修好一把旧椅，仍觉得边角不够顺，想再带回去改。社区里等着歇脚的人已经夸它稳当。",{"label":"陪他给家具贴上清楚的维护说明","result":"八分钟里，你负责整理纸条，不操作工具。椅子终于留在需要它的人身边。","effects":{"affinity":9,"trust":7},"duration":8},{"label":"买一套普通的椅脚保护垫","result":"椅子落地时安静了，他也不再把每一点磨损都看作自己的失误。","effects":{"money":-18,"affinity":10,"trust":6}},{"label":"请他自己先坐一会儿","result":"他第一次把修好的椅子当成椅子，而不是等着再加工的活。","effects":{"affinity":9,"trust":7}}],["不带工具也能来","孟怀山赴约时只提着两只空杯，说这次不量桌子，也不检查椅腿，就坐着聊聊。",{"label":"约定做经常一起喝茶的朋友","result":"你们聊走过的路，也聊根本不需要解决的小烦恼。","effects":{"affinity":10,"trust":8},"path":"friend"},{"label":"请他继续讲那些学手艺的笑话","result":"他笑说故事倒有很多，工具可以改天再带。","effects":{"affinity":9,"trust":8},"path":"friend"},{"label":"说下次轮到自己给他留座","result":"他点头时有些意外，原来不来帮忙，也会有人等自己。","effects":{"affinity":10,"trust":7},"path":"friend"}]]},
    {"id":"jiang","name":"江临","gender":"male","age":26,"role":"软件工程师","place":"bookshop","color":"#8eabc3","romantic":false,"bio":"爱把问题拆成小块，遇到自己的烦恼却经常卡住。电脑外最喜欢收集奇怪的便利贴，正在学着准时按下关机。","arc":[["写不进待办的晚饭","江临翻开待办清单，发现连喝水都写了，却没给晚饭留一行。他说提醒太多，反而一条也没看见。",{"label":"陪他先划掉几条不必今天做的事","result":"清单变短了，他终于能把饭拿稳，不再忙着同时回复三个人。","effects":{"affinity":6,"trust":4}},{"label":"问电脑盖上贴的奇怪小猫是谁画的","result":"他说是同事的随手画，比所有提醒软件都更能让自己笑一下。","effects":{"affinity":7,"trust":3}},{"label":"请他把屏幕合上再聊天","result":"他没有错过什么紧急消息，却完整吃完了这顿热饭。","effects":{"affinity":6,"trust":4}}],["被删掉的一版程序","江临认真做的一版功能被取消了。他知道原因合理，还是很难不把它当成对自己的否定。",{"label":"问哪些经验还能留到下一次","result":"他把学到的东西单独记下，不再只盯着被删的文件。","effects":{"affinity":8,"trust":7}},{"label":"听他说最舍不得的一个细节","result":"他讲完以后轻松了一点，没再要求自己立刻觉得一切都值得。","effects":{"affinity":8,"trust":6}},{"label":"约他离开屏幕走一小段","result":"话题换成路边新开的店，他发现自己还有别的事可以在意。","effects":{"affinity":7,"trust":7}}],["给邻居做的小工具","江临帮社区做一个活动报名原型，测试时发现自己收集了根本不需要的信息。他想先删掉多余内容再给大家用。",{"label":"陪他用虚构资料试一遍流程","result":"十分钟里，只用测试数据核对操作。多余字段被删去，没有动用真实住户信息。","effects":{"affinity":9,"trust":7},"duration":10},{"label":"从普通使用者角度提一个问题","result":"你的问题让他把最难懂的按钮改成一句明白的话。","effects":{"affinity":10,"trust":6,"insight":1}},{"label":"提醒他先说明工具做不到什么","result":"他写清这是试用原型，不让热心变成对别人生活的无限承诺。","effects":{"affinity":9,"trust":7}}],["关机后仍有下一句","江临准时关上电脑，没有说最后再改一行。他拿出两张新的便利贴，说今天想只记朋友推荐的饭店。",{"label":"约定做能互相提醒收工的朋友","result":"你们不监督彼此完成任务，只提醒路再长也得先吃饭。","effects":{"affinity":10,"trust":8},"path":"friend"},{"label":"约好下次不带电脑出来","result":"他说可以带便利贴，但只能记值得开心的小事。","effects":{"affinity":9,"trust":8},"path":"friend"},{"label":"告诉他不必修好一切才能来见朋友","result":"他点头，终于不再把自己也当作必须随时修好的程序。","effects":{"affinity":10,"trust":7},"path":"friend"}]]}
  );
  // 与目的地无绑定关系：收餐、帮人签收或工作间隙的短暂相逢。
  const deliveryFaces = [
    ["lin","日程本旁的晚饭","行政秘书林晚正在外出核对社区活动安排。你送到约定的交接处时，她先收好日程本，认真核对自己的餐品。","请她趁热吃饭","她把饭点留了出来，记住了认真交付的你。","帮她按住被风翻动的流程页","纸页没有散开，她合上资料向你道谢。","问下一处入口怎样走","她指出刚核对过的入口，祝你下一程顺利。","林晚刚结束一场外出活动的协调。看到你，她收起日程本，问你有没有给自己留出饭点。"],
    ['chen','工具箱边的热汤','陈默正收起上门维修的工具，手上还沾着一点机油。你核对收餐信息时，他笑说终于能歇一口气。','把餐放在干净稳妥的地方','他擦干净手，接过餐盒，认真说了声路上慢点。','帮他扶住快倒的工具袋','扳手没有散落一地，这次小小的互助让你们记住了彼此。','问他今天修了什么','他讲起一辆又能上路的旧车，语气比刚才轻快了一点。','陈默刚结束一次上门维修。他认出你的外卖箱，顺口提醒你雨天别忘了检查车灯。'],
    ["shen","校样旁的一份饭","编辑助理沈青禾正带着校样参加一场作者交流会。你抵达交接处时，她停下核对页码，报出自己的收餐姓名。","请她先把饭吃好","她把校样合上，说这次不边吃边改错字。","帮她扶好装稿件的纸袋","稿页没有散开，她向你认真道谢。","问今天读到什么有趣的句子","她分享一句可以公开的话，没有翻出未发表的稿件。","沈青禾又在外出协助新刊活动。认出你后，她问今天的配送路上有没有值得记下的小事。"],
    ['lu','便衣道人的饭点','一位穿便服的人在约定位置等餐，自称陆听雨。他说刚替附近住户看完一件旧物，今天也得先吃饭。','先核对餐品，再交给他','他接得郑重，说把眼前的事做好，比玄妙说法更要紧。','问他为什么来这里','他说走下山才能知道别人真正需要什么，随后让你放心继续送单。','提醒他记得收好散开的纸页','他收起旧纸，笑着向你道谢，没有让你替他跑额外的路。','陆听雨又在外出走访。他接过热饭，先问你累不累，并没有急着讲修行的道理。'],
    ['zhou','另一只外卖箱','交接餐袋时，周野摘下头盔说今天轮到自己点饭。他也是骑手，正等同伴一起换班。','祝他吃完再平安上路','他伸出拳与你轻碰，说同行最懂这一句。','提醒他绑带快松了','周野重新系好绑带，说你替他省掉了一次麻烦。','交换一个容易看错的楼号','你们只讲确认过的入口，不把赶时间当作冒险的理由。','周野利用换班空隙点了饭，看见是你送来，先问今晚路上有没有难走的地方。'],
    ["su","试拍结束的餐袋","平面模特苏砚刚结束外景试拍，来约定位置接餐。她把作品夹放好，说今天最期待的是不用对着镜头吃这顿饭。","请她趁热吃饭再休息","她笑着接过餐，不再急着给每一个瞬间摆好表情。","问今天的拍摄是否顺利","她讲起一次自然的笑场，眼里的紧张散去了一点。","提醒她作品夹的搭扣松了","照片被稳稳收好，她记住了你的细心。","苏砚今天换了一个外景拍摄点。看见你来，她收好作品夹，轻松地问起你今天的路况。"],
    ["xu","下播前的一份饭","知识区主播许知夏在外借的录制空间等餐。她先暂停镜头、遮好收件信息，才走到约定位置与你核对餐品。","请她关好镜头后安心吃饭","她确认设备已暂停，向你道谢，没有把送餐变成直播内容。","帮她捡起掉落的提纲页","她收好提纲，说这下能先吃饭，再整理今天的回放。","问今天聊了什么主题","她讲起一本正在读的书，没有让你配合拍摄或留在镜头里。","许知夏刚结束一场共读直播。认出你后，她确认镜头关着，想和你聊一句直播之外的近况。"],
    ["tang","围裙收好以后","咖啡师唐梨刚在外出试饮活动忙完，把围裙叠好来接餐。她说记住了那么多杯饮品，差点忘了自己的午饭。","提醒她先吃饭","她接过餐，说今天也得把自己照顾好。","帮她把餐具袋放稳","腾出双手后，她笑着向你道谢。","问她今天试了什么新口味","她讲起一款还在调整的季节饮品，邀请你有空再来尝。","唐梨今天在另一处协助试饮。她认出你的外卖箱，先收好量杯，认真接过自己的饭。"],
    ["gu","社团活动的饭点","大学生顾清遥正为一场校外社团活动整理签到材料。你到约定位置时，她收起校园地图，说不能让送饭的人一直等。","谢谢她及时出来接餐","她接好餐袋，在简短的道谢中记住了你。","提醒她一张便签快吹走了","活动时间被重新夹好，她笑着说自己的记性也需要纸来帮忙。","问这个入口是不是新换了路牌","她指给你看刚确认过的位置，少让下一位骑手绕路。","顾清遥今天参加另一场校外社团活动。她放下资料来接餐，兴奋地说起刚学到的新东西。"],
    ["ye","花材旁的家常饭","花艺师叶青岚正在外出布置一场小展览。她把花束放稳，到约定交接处核对家常饭的餐品。","核对餐品，不碰她的花材","她感谢你的细心，把饭放在离剪刀远一点的干净地方。","问是否要把餐放在阴凉处","她指出可以摆放的位置，终于腾出手吃饭。","问今天用了什么当季花","她挑一枝说起颜色，解释花材也有各自的季节。","叶青岚又在附近布置花艺。她先收好剪刀，认出你后问你今天有没有好好吃饭。"],
    ["wen","速写本旁的午餐","插画师闻星正在约定地点整理展出的草图。她盖紧笔帽，报出收餐姓名，说总算轮到自己先放下画笔。","把餐放稳，等她收好画具","她松了口气，谢过你没有把饭放到画纸上。","帮她留意有没有掉落的笔帽","小东西被找回，她认真向你道谢。","问她今天在画什么","她给你看可以公开的一页，没有把委托方的未发布作品递出来。","闻星今天换了一处采风地点。她收好速写本来接餐，问你路上有没有见到值得记下的光。"],
    ["luo","流程表与新餐盒","活动策划师罗映秋刚核对完一处场地，在约定位置等饭。她收起流程表，自我介绍后先确认餐品和份数。","祝她吃完后歇一会儿","她笑说难得有人先问自己累不累，而不是下一项什么时候开始。","帮她扶住快滑落的资料袋","清单被稳稳收好，她记住了你的细心。","问这里接下来有什么活动","她只讲已经公开的安排，提醒你不要绕进正在搭建的入口。","罗映秋今天在另一片街区协调活动。她认出你，先把工作证收好，说这次会给自己留够吃饭的时间。"]
  ];
  deliveryFaces.push(
    ["han","交班后的热粥","韩远舟刚完成一场外出健康宣传，脱下工作外套来到交接处。他自我介绍是急诊医生，今天只想先吃一碗热粥。","把餐稳稳交给他","他收好资料，接过热粥，记住了你的名字。","问他今天是否忙完了","他说这一班已经交接，终于可以放松吃饭。","提醒他纸袋的封口松了","资料没有散开，他向你道谢。","韩远舟又在外出活动后收餐。认出你，他先问今天有没有给自己留一顿热饭。"],
    ["zhao","工具袋旁的一束光","电力检修员赵启明收好上门工作的工具，来到约定交接处。灯重新亮了，他才想起自己还没吃饭。","请他先收好工具再接餐","他擦净双手，接过餐袋，说这顿饭来得正好。","帮他留意脚边的资料袋","纸页没有被踩到，他向你点头道谢。","问他是不是已经交班","他说同伴都在各自岗位，不会留谁独自忙到很晚。","赵启明在另一片街区完成检修后又点了饭。看见你，他不再急着背上工具袋，先认真接餐。"],
    ["qin","观测记录旁的饭点","气象观测员秦观澜刚结束外出记录，合上小本子来收餐。他说今天的云很有意思，但饭也不能放凉。","请他先把饭吃好","他在本子上夹好书签，向你说路上顺利。","提醒他记录页快被风掀走","他按住纸页，笑说差点把天气观察变成追纸观察。","问他今天看见了怎样的云","他只讲眼前的景色，没有把随口聊天说成确定预报。","秦观澜今天换了一处观测点。收餐时认出你，先问路上有没有下雨，再收起笔记本。"],
    ["cheng","修复师的干净桌角","古籍修复师程砚秋正在外出展示活动的休息处等餐。他先收好练习纸，自我介绍后指了指干净的桌角。","按他说的位置放好餐袋","饭和纸都安稳，他认真向你道谢。","帮他按住快滑下的空文件袋","展示材料没有掉到地上，他记住了你的细心。","问展示是不是已经结束","他说最好的问题往往来自第一次来看的人。","程砚秋又在外出展示后等餐。看见你，他笑说今天特意给热饭留了足够大的桌角。"],
    ["song","换班后的第一口饭","夜班公交司机宋泊宁把车交给同事后，在约定位置接餐。他说这次不用看站点，只需要确认自己的名字。","请他安心吃完再走","他松了松肩，向你懂行似的点点头。","提醒他收好模型盒","盒盖被扣紧，小轮子没有滚出来。","问他今天准备怎样休息","他笑着提到一辆还没做完的模型车。","宋泊宁今天在另一处交班点等餐。认出你，他先收好工作记录，说这次会给自己留够饭点。"],
    ["yue","宣传结束后的纸船","消防救援员岳长川在一场公开宣传结束后等餐，手边放着展示用的纸船。他收好物品，认真核对收餐信息。","把热饭放在干净的桌面","他接过餐盒，感谢你没有把饭搁在器材旁。","提醒他小纸船快被吹走","他一把护住，笑说这比想象中难折。","问他今天是不是能歇一会儿","他确认已有人交接，才点头说可以先吃饭了。","岳长川在另一处公开活动结束后又收到了你的餐。他收好手边的纸船，问你今天累不累。"],
    ["pei","拓片袋边的一份饭","文物研究员裴景行刚结束公开资料走访，在约定交接处等餐。他报出自己的名字，先把拓片袋移到干燥的地方。","核对餐品，不触碰他的资料","他感谢你的细心，把热饭与纸袋分开摆放。","提醒他袋角的夹子快松了","夹子被重新扣好，他朝你笑着道谢。","问今天有没有有趣的公开发现","他讲起一个仍待查证的旧地名，特意说明只是线索。","裴景行又在外出走访后点了饭。认出你，他说今天可以先不谈谜题，认真吃顿午饭。"],
    ["meng","旧尺旁的热饭","退休木匠孟怀山来社区探望老朋友，在交接处等自己的饭。他收起随身小尺，说今天不接活，只来坐坐。","祝他这顿饭吃得舒坦","他接过餐袋，笑说这句话比夸手艺还实在。","提醒他尺子别落在凳子上","他拍拍口袋，向你认真道谢。","问他今天见到老朋友没有","他说大家都好，就是又争了半天哪家面馆好吃。","孟怀山今天在另一处社区和朋友聚会。看见你，他先收好小尺，说饭可不能再被闲聊耽误。"],
    ["jiang","合上电脑再吃饭","软件工程师江临正在外出协作的休息处等餐。他合上电脑报出收餐姓名，屏幕外的小猫便利贴仍翘着一角。","请他先吃饭再回消息","他把手机也收好，说这次要完整吃完。","提醒他便利贴快掉了","他把小猫贴回去，说差点把今天的好心情弄丢。","问他今天有没有准时休息","他不好意思地笑，说现在开始也还来得及。","江临今天换了一处协作场地。看见是你送饭，他先合上电脑，问你近来的配送是否顺利。"]
  );
  for(const [id,title,text,a,ar,b,br,d,dr,reunion] of deliveryFaces){
    const name=G.NPCS.find(n=>n.id===id).name;
    G.EVENTS.push(
      {id:`delivery-npc-${id}`,kind:'delivery',deliveryNpc:id,deliveryMeeting:true,title,text,choices:[
        c(a,ar,{trust:1}),c(b,br,{karma:1}),c(d,dr,{insight:1})
      ]},
      {id:`delivery-npc-${id}-again`,kind:'delivery',deliveryNpc:id,deliveryMeeting:false,title:`途中再会 · ${name}`,text:reunion,choices:[
        c('交换一句近况，再认真交付',`${name}记住了你说的小事。你们核对餐品后道别，各自继续今天的生活。`,{affinity:2,trust:1}),
        c('多听对方说几句',`你没有急着给建议，${name}也不必把近况包装成好消息。聊完，你把餐稳妥交到对方手里。`,{affinity:2,trust:2},{duration:3}),
        c('先把饭送好，约下次再聊',`${name}理解你还在工作。短暂的相逢不必拉长，也可以是一份可靠的惦记。`,{affinity:1,rep:1})
      ]}
    );
  }
  const ALCHEMY_REALM_BY_TIER = G.ALCHEMY_REALM_BY_TIER;
  const materialNames = [
    '青灵草','凝露叶','云纹苔','清心藤','山泉藻','白芷灵根','紫苏芽','玉竹芯',
    '赤阳花','火绒芝','丹霞果','朱砂蕊','焰尾草','赤练藤','暖玉参',
    '炎心兰','月华芝','寒潭莲','霜纹叶','雪骨花','冰髓草','月桂枝',
    '银星苔','夜露果','地脉参','黄精根','山灵薯','厚土芝','石乳菌',
    '龙须根','岩心藤','土灵果','风行草','青羽叶','轻尘花','浮云蕊',
    '鹤影藤','翼灵果','风铃子','空蝉蜕','雷纹木','紫电花','惊雷子',
    '电光苔','霆心果','云雷藤','磁极砂','雷髓枝','星砂花','曜石蕊',
    '星辉草','天河藻','辰光果','星落藤','玉衡叶','玄曜芝','龙涎果',
    '凤血兰','麒麟参','玄龟苔','白泽叶','朱雀羽苔','青龙须','九转灵髓'
  ];
  G.ALCHEMY_MATERIALS = materialNames.map((name,index)=>{
    const tier=index<8?1:2+Math.floor((index-8)/7);
    return {id:index===0?'herb':`herb-${index+1}`,name,tier,realm:ALCHEMY_REALM_BY_TIER[tier],price:10+tier*11+(index%7)*3,cost:Math.min(12,1+tier),desc:`${tier}阶药材。药性会参与不同丹方的配伍与火候判定。`,glyph:name[0]};
  });
  G.PILL_TYPES = [
    {id:'heal',name:'回春丹',glyph:'春',shopCost:4,desc:'补益气血。',effect:t=>({health:30+t*10})},
    {id:'stamina',name:'清心散',glyph:'清',shopCost:4,desc:'调息解乏。',effect:t=>({stamina:25+t*10})},
    {id:'qi',name:'凝气丹',glyph:'凝',shopCost:5,desc:'凝聚修为。',effect:t=>({qi:25+t*10})},
    {id:'foundation',name:'破境丹',glyph:'境',shopCost:16,desc:'突破时服用，提高成功率。',breakBonus:t=>13+t*2},
    {id:'spiritpill',name:'回灵丹',glyph:'灵',desc:'恢复灵力。',effect:t=>({mana:35+t*20})},
    {id:'bodypill',name:'锻体丹',glyph:'体',desc:'同时补益气血与体力。',effect:t=>({health:15+t*10,stamina:15+t*10})},
    {id:'greatqi',name:'聚元丹',glyph:'元',desc:'大幅增长修为。',effect:t=>({qi:45+t*25})},
    {id:'marrowpill',name:'玉髓丹',glyph:'髓',desc:'温养筋骨，恢复气血与体力。',effect:t=>({health:30+t*15,stamina:20+t*12})},
    {id:'bloodpill',name:'血元丹',glyph:'血',desc:'侧重恢复气血。',effect:t=>({health:45+t*18})},
    {id:'vitalpill',name:'养元丹',glyph:'养',desc:'侧重恢复体力。',effect:t=>({stamina:40+t*16})},
    {id:'harmonypill',name:'三元丹',glyph:'三',desc:'同时恢复气血、体力与灵力。',effect:t=>({health:18+t*8,stamina:18+t*8,mana:18+t*8})},
    {id:'spiritqi',name:'灵元丹',glyph:'玄',desc:'兼顾灵力与修为。',effect:t=>({mana:20+t*10,qi:20+t*14})}
  ];
  G.PILL_ITEM_ID = (typeId,tier)=>tier===1?typeId:`${typeId}-${tier}`;
  G.PILL_ITEMS = G.PILL_TYPES.flatMap(type=>Array.from({length:9},(_,i)=>{
    const tier=i+1,effect=type.effect?.(tier);
    return {id:G.PILL_ITEM_ID(type.id,tier),name:`${tier}阶${type.name}`,type:'pill',pillType:type.id,tier,cost:tier===1&&type.shopCost?type.shopCost:0,shop:tier===1&&!!type.shopCost,desc:`${type.desc} 当前为${tier}阶成品。`,effect,glyph:type.glyph};
  }));
  G.ITEMS = [
    ...G.PILL_ITEMS,
    {id:'mana',name:'灵石',type:'pill',cost:3,desc:'灵力恢复 30。',effect:{mana:30},glyph:'石'},
    ...G.ALCHEMY_MATERIALS.map(m=>({id:m.id,name:m.name,type:'material',cost:m.cost,shop:false,unlockRealm:m.realm,desc:m.desc,glyph:m.glyph})),
    {id:'fragment',name:'阵心碎玉',type:'material',cost:8,desc:'收集三枚，才有机会重新点亮护城阵。',glyph:'玉'},
    {id:'charm',name:'护身符',type:'material',cost:8,desc:'突破失败时自动消耗，免除气血损失。',glyph:'符'},
    {id:'breathing',name:'吐纳真诀',type:'technique',cost:18,desc:'永久学会：修炼所得修为提高 30%。',glyph:'诀',unique:true},
    {id:'lightstep',name:'轻身诀',type:'technique',cost:20,desc:'永久学会：步行速度提高 30%。',glyph:'步',unique:true},
    {id:'jade',name:'纳灵玉佩',type:'equipment',cost:25,desc:'自动装备，灵力上限 +30。',glyph:'佩',unique:true},
    {id:'robe',name:'青云法衣',type:'equipment',cost:24,desc:'自动装备，气血上限 +25。',glyph:'衣',unique:true}
  ];
  const cauldronNames = [
    ['青铜药鼎',1],['青石温炉',1],['黑陶药釜',1],
    ['赤铜温灵鼎',2],['白瓷凝露鼎',2],['灵木回风鼎',2],
    ['玄铁聚火鼎',3],['寒玉清心鼎',3],['云纹锁灵鼎',3],
    ['紫砂养神鼎',4],['赤金焰纹鼎',4],['青玉回元鼎',4],
    ['地脉玄炉',5],['风雷药鼎',5],['月桂灵鼎',5],
    ['星砂炼真鼎',6],['雷纹镇火鼎',6],['碧落归元鼎',6],
    ['九霞丹鼎',7],['玄黄地炉',7],
    ['天星乾坤鼎',8],['龙纹离火鼎',8],
    ['太虚九转鼎',9],['万象混元鼎',9]
  ];
  G.CAULDRONS = [
    {level:0,tier:0,name:'无药鼎',cost:0,success:0,extra:0,quality:0,realm:0,desc:'需要先在长乐集购买药鼎，才能开始炼药。'},
    ...cauldronNames.map(([name,tier],index)=>{
      const variant=index%3;
      return {level:index+1,tier,name,cost:100+index*75+tier*60,success:.015*(tier-1)+variant*.012,extra:.025*tier+(2-variant)*.012,quality:.018*tier+variant*.01,realm:ALCHEMY_REALM_BY_TIER[tier],desc:`${tier}阶药鼎。成丹稳定、成色与额外产出各有侧重。`};
    })
  ];
  G.LEGACY_CAULDRON_MAP = Object.freeze({0:0,1:1,2:4,3:7});
  G.ALCHEMY_RANKS = [
    {name:'药童',need:0,tier:1},{name:'识药',need:4,tier:2},{name:'掌火',need:10,tier:3},
    {name:'炼药师',need:20,tier:4},{name:'丹师',need:40,tier:5},{name:'丹匠',need:70,tier:6},
    {name:'丹宗',need:110,tier:7},{name:'丹尊',need:170,tier:8},{name:'丹道宗师',need:250,tier:9}
  ];
  G.FORMULA_STORY_SOURCES = [
    {quest:'q1',label:'第一份人间烟火'},
    {event:'story-street-vein',flag:'storyStreetVein',label:'地图上多出来的一条线'},
    {event:'story-second-city',flag:'storySecondCity',label:'城市的背面'},
    {event:'story-lantern-network',flag:'storyLanternNetwork',label:'每个人都是一个阵点'},
    {event:'story-system-doubt',flag:'storySystemDoubt',label:'系统第一次拒绝回答'},
    {event:'story-system-truth',flag:'storySystemTruth',label:'万家灯火，不属于任何人'}
  ];
  // 每位故人各有两类药的三种配伍；友情与情感路线共用传方条件。
  G.FORMULA_NPC_PRODUCTS = {
    lin:['heal','bloodpill'],chen:['bodypill','marrowpill'],
    shen:['qi','spiritqi'],lu:['foundation','greatqi'],
    zhou:['stamina','vitalpill'],su:['spiritpill','harmonypill']
  };
  G.FORMULA_BOND_MILESTONES = [
    {stage:1,trust:3},{stage:2,trust:9},{stage:4,trust:20}
  ];
  const recipeRoutes = ['草木方','清露方','赤阳方','月华方','地脉方','风行方','雷纹方','星辉方','九转方'];
  const recipeRealm = [0,0,1,1,2,2,3,4,5];
  G.ALCHEMY_RECIPES = G.PILL_TYPES.flatMap((pill,pillIndex)=>recipeRoutes.map((route,routeIndex)=>{
    const complexity=routeIndex+1,maxMaterialTier=Math.min(9,complexity+1);
    const pool=G.ALCHEMY_MATERIALS.filter(m=>m.tier<=maxMaterialTier);
    const materialCount=Math.min(5,1+Math.ceil(complexity/2)),materials={};
    for(let j=0;j<materialCount;j++){
      const material=pool[(pillIndex*5+routeIndex*7+j*11)%pool.length];
      materials[material.id]=(materials[material.id]||0)+1+(complexity>=7&&j===0?1:0);
    }
    const channel=routeIndex%3,step=Math.floor(routeIndex/3);
    const acquisition=channel===0?{type:'shop'}:channel===1
      ? {type:'story',...G.FORMULA_STORY_SOURCES[step*2+Math.floor(pillIndex/6)]}
      : {type:'bond',npc:Object.keys(G.FORMULA_NPC_PRODUCTS).find(id=>G.FORMULA_NPC_PRODUCTS[id].includes(pill.id)),...G.FORMULA_BOND_MILESTONES[step]};
    return {
      acquisition,
      id:routeIndex===0?pill.id:`${pill.id}-formula-${routeIndex+1}`,
      name:`${pill.name}·${route}`,product:pill.id,route,complexity,
      materials,mana:6+complexity*3+Math.floor(pillIndex/3)*2,duration:15+complexity*3+(pillIndex%4)*2,
      base:Math.max(.42,.82-complexity*.035-(pillIndex%3)*.015),
      need:(complexity-1)*25+pillIndex*4,
      realm:Math.max(recipeRealm[routeIndex],Math.floor(pillIndex/4)-1,0),
      minCauldronTier:complexity,
      price:28+complexity*24+pillIndex*7,
      desc:`${route}，用于炼制${pill.name}。丹方只规定配伍与火候，最终丹药阶数由药鼎与炼药师水平决定。`
    };
  }));
  G.QUESTS = [
    {id:'q1',title:'第一份人间烟火',desc:'完成 1 单配送',delivery:1,realm:0,reward:{coins:5,qi:15},story:'系统不是凭空赐予力量。它把你送达的每一份善意，折成可以带走的光。'},
    {id:'q2',title:'万家灯火',desc:'完成 5 单配送',delivery:5,realm:0,reward:{coins:10,qi:30},story:'旧城深处的阵纹正在熄灭。你的订单，把原本断开的街巷重新连在一起。'},
    {id:'q3',title:'凡人亦能问道',desc:'完成 12 单，并进入炼气',delivery:12,realm:1,reward:{coins:15,fragments:1,qi:50},story:'系统终于说出自己的来历：它不是天外来客，而是这座城被遗忘的护城阵。'},
    {id:'q4',title:'送达的不只是饭',desc:'完成 25 单，并进入筑基',delivery:25,realm:2,reward:{coins:25,fragments:1,qi:80},story:'阵眼开始苏醒。要继续修复它，需要的不只是灵力，还有你愿意留下的理由。'},
    {id:'q5',title:'把归途还给人间',desc:'完成 40 单，并进入金丹',delivery:40,realm:3,reward:{coins:40,fragments:1,qi:120},story:'三枚碎玉在掌心合拢。山门之外出现一条通往更高处的路，而城里的灯仍为你亮着。'},
    {id:'q6',title:'夜路有人同行',desc:'完成 55 单，并进入金丹',delivery:55,realm:3,reward:{coins:45,qi:150,karma:2},story:'越来越多的人记住你的名字。不是因为你跑得最快，而是因为有人需要时，你经常恰好在那里。'},
    {id:'q7',title:'城脉重新呼吸',desc:'完成 75 单，并进入元婴',delivery:75,realm:4,reward:{coins:55,fragments:1,qi:220},story:'断裂的阵纹不再只靠旧法维持。医院、书店、修车铺、夜校和无数扇窗，正在成为新的阵眼。'},
    {id:'q8',title:'一百次准时抵达',desc:'完成 100 单，并进入元婴',delivery:100,realm:4,reward:{coins:80,qi:320,rep:5},story:'第一百次门铃响起时，系统没有弹出新的指令，只写下一句：你已经知道为什么要继续走了。'}
  ];
  G.ENDINGS = {
    guardian: { title:'万家灯火', text:'你把阵心交还给这座城。从此山川有灵，街巷有光。人们只知道有一个骑手，总能在饭凉之前赶到。你没有离开人间，也没有止步于凡人。' },
    ascend: { title:'携人间而飞升', text:'天门打开时，你没有斩断尘缘。外卖箱里装着旧书、修车铺的钥匙和一封约好回信的信。你向更远的天地走去，也把回家的路记得很清楚。' },
    ordinary: { title:'好好生活，也是一种修行', text:'你没有交出自己的名字去换一个仙号。小屋添了一张桌子，窗前种起青灵草。早饭会有人认真吃，故事会有新的下一页，而你终于懂得：平凡从来不是失败。' },
    bond: { title:'有人与你共黄昏', text:'你把最后一趟路留给一个重要的人。此后仙途漫长，却不再只有一个人的脚步。你们仍有分歧、疲惫和柴米油盐，也仍愿意每天选择彼此。' },
    friendship: { title:'此城皆故人', text:'修车铺、书店、医馆和山门的灯在同一晚亮起。没有人谈论永别。朋友们只是约好：忙完这一阵，聚一顿。你知道，这个约定总会实现。' }
  };
})(globalThis);
