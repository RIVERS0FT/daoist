/* 五宗与三十六法：可信静态配置；不读取或修改玩家状态。 */
(function(root){
  'use strict';
  const G=root.NightCourier;
  const original=G.SECT;
  const base={joinMinutes:20,rejoinDays:1,ranks:original.ranks,commission:original.commission};
  const duty=(id,name,desc,rank,minutes,stamina,mana,contribution,qi)=>({id,name,desc,rank,minutes,stamina,mana,contribution,qi});
  G.SECTS=[
    {...base,...original,discipline:'符阵修',seal:'阵',entryRealm:1,entryLevel:1,standing:3,power:80,
      leaderRealm:'化神一重',strength:{combat:70,defense:98,supply:72,insight:82},
      station:'听雨观山门',specialty:'修复城脉、稳固经脉与突破；阵地守护最强，离阵远征较弱。',
      background:'旧护城阵的守望者，传承完整却人手凋零。陆听雨不愿再让一位守阵人独自耗尽一生。',
      weakness:'依赖阵地与协作，临时遭遇不擅长抢攻。'},
    {...base,id:'jingang',name:'金刚门',discipline:'体修',seal:'体',place:'park',entryRealm:1,entryLevel:1,standing:2,power:84,
      leaderRealm:'化神三重',strength:{combat:88,defense:94,supply:60,insight:52},station:'月渡公园练功坪',
      motto:'筋骨为舟，先渡自己，再渡他人。',specialty:'气血、体力、淬体和长途耐力；近身承伤最强。',
      background:'由搬运、护路和救援修士聚成的宗门。门中推崇能把同伴带回来的人，不把带伤硬撑当荣耀。',weakness:'神识侦察和远程应变薄弱，伤后补给依赖药修。',
      duties:[duty('iron-load','负重行桩','在练功坪循桩搬运沙袋，不以伤换名次。',0,30,16,0,10,8),duty('iron-guard','护送演练','为伤员练习承托与接力，确认每个人会求援。',0,45,18,2,14,10),duty('iron-wall','金身守关','在护阵内练习接力承压，耗力而不伤身。',1,60,26,5,22,18)]},
    {...base,id:'baicao',name:'百草谷',discipline:'药修',seal:'药',place:'clinic',entryRealm:1,entryLevel:1,standing:4,power:72,
      leaderRealm:'元婴九重',strength:{combat:48,defense:64,supply:99,insight:76},station:'回春医馆后院药庐',
      motto:'先辨药性，再问丹名；先见其人，再论代价。',specialty:'成丹率、额外产出与炼药熟练度；持续补给最强。',
      background:'保有分散药圃与药师网络，却常在平价救急和门内成本之间为难。药庐不取代医馆日常医疗。',weakness:'正面战力弱，依赖护送和稳定药材来源。',
      duties:[duty('herbal-sort','辨药校签','核对公用药材标签，不赠送未获丹方。',0,30,8,3,9,5),duty('herbal-fire','试炉记温','使用门内练习炉记录火候，不产出丹药或熟练度。',0,45,10,8,14,9),duty('herbal-reserve','药库轮值','检查应急药材储备与交接记录。',1,60,14,12,21,14)]},
    {...base,id:'lingxiao',name:'凌霄剑宗',discipline:'剑修',seal:'剑',place:'market',entryRealm:2,entryLevel:1,standing:1,power:90,
      leaderRealm:'化神六重',strength:{combat:99,defense:78,supply:68,insight:70},station:'长乐集剑宗会馆',
      motto:'出剑之前，先知锋芒所向。',specialty:'身法、行路节力与剑意破境；正面攻坚最强。',
      background:'五宗中人才与战力最盛，曾主导护城议事。年轻弟子习惯以胜负证明自己，也有人质疑这种秩序。',weakness:'消耗与后勤负担大，锋芒过盛容易与别宗失和。',
      duties:[duty('sword-forms','收锋演剑','在会馆封闭练场练习停剑与收势，不伤及路人。',0,30,12,5,11,9),duty('sword-route','护路推演','依真实城路推演疏散，不额外生成配送订单。',0,45,16,8,15,12),duty('sword-vow','问剑守约','与同门复核出手边界，守约同样算修行。',1,60,22,14,23,20)]},
    {...base,id:'xuanwei',name:'玄微阁',discipline:'神识修',seal:'识',place:'bookshop',entryRealm:1,entryLevel:3,standing:5,power:68,
      leaderRealm:'元婴七重',strength:{combat:56,defense:54,supply:66,insight:99},station:'旧雨书店静思阁',
      motto:'所见未必尽真，知情不等于有权。',specialty:'灵力储备、入定收益与破境定心；情报洞察最强。',
      background:'以观测、文献比对和神识自律立足。门人少而分散，不愿向强宗交出每一份观察记录。',weakness:'人少且不耐近身消耗，情报必须交叉验证。',
      duties:[duty('mind-index','校录残卷','比对公开旧卷，只记录可以核实的文字。',0,30,6,8,10,7),duty('mind-watch','静室观息','静坐记下自身灵息变化，不窥探陌生人。',0,45,8,12,14,12),duty('mind-echo','复核回声','将异常回声与公开记录交叉查证。',1,60,12,18,22,18)]}
  ];
  G.sectDefinition=id=>G.SECTS.find(x=>x.id===id)||null;
  G.SECT=G.SECTS[0]; // 旧 ID 与听雨观规则保持兼容；多宗查询不得依赖这个别名。
  const technique=(id,name,source,realm,rank,cost,bonus,desc)=>({id,name,source,unlockRealm:realm,rank,cost,bonus,desc,type:'technique',unique:true,glyph:name.at(-1),shop:source==='system'});
  G.TECHNIQUES=[
    technique('breathing','吐纳真诀','system',0,0,18,{training:.30},'修炼修为收益 +30%。'),
    technique('lightstep','轻身诀','system',0,0,20,{walk:.30},'步行速度 +30%；不提高电动车速度。'),
    technique('vital-breath','养元功','system',1,0,24,{health:12},'气血上限 +12；不即时回满。'),
    technique('long-breath','绵息诀','system',1,0,26,{stamina:10},'体力上限 +10；不即时回满。'),
    technique('gather-spirit','聚灵诀','system',1,0,28,{mana:15},'灵力上限 +15；不即时回满。'),
    technique('quiet-heart','澄心诀','system',1,0,32,{breakthrough:2},'突破成功率 +2 个百分点，仍受 95% 上限限制。'),
    technique('night-meditation','观月静功','system',2,0,42,{meditation:.12},'入定修为收益额外 +12%。'),
    technique('river-body','行舟锻体术','system',2,0,40,{body:.12},'淬体修为收益额外 +12%。'),
    technique('steady-road','匀息行路诀','system',1,0,30,{travelStamina:.06},'实际移动的体力消耗降低 6%。'),
    technique('small-fire','小周天火诀','system',2,0,45,{alchemy:.02},'成丹率 +2 个百分点，仍受 98% 上限限制。'),
    technique('inner-sea','内景养神篇','system',3,0,65,{mana:20,meditation:.08},'灵力上限 +20，入定修为收益额外 +8%。'),
    technique('rain-breath','听雨吐纳诀','tingyu',0,0,30,{training:.10},'修炼修为收益 +10%，与吐纳真诀按原规则叠加。'),
    technique('steady-heart','守心篇','tingyu',0,1,60,{breakthrough:3},'突破成功率 +3 个百分点，仍受 95% 上限限制。'),
    technique('gentle-fire','调火札记','tingyu',0,2,90,{alchemy:.03},'以阵辅火：成丹率 +3 个百分点；是典籍，不是丹方。'),
    technique('city-ward','镇城符阵诀','tingyu',2,2,110,{health:18,mana:20},'气血上限 +18，灵力上限 +20，侧重守护。'),
    technique('linked-veins','百脉连环经','tingyu',3,3,150,{training:.12,breakthrough:2},'修炼修为收益 +12%，突破成功率 +2 个百分点。'),
    technique('iron-skin','铁衣淬体功','jingang',1,0,30,{health:25},'气血上限 +25。'),
    technique('stone-breath','磐石吐息法','jingang',1,0,40,{stamina:20},'体力上限 +20。'),
    technique('bull-march','伏牛行桩诀','jingang',1,1,65,{travelStamina:.12},'实际移动的体力消耗降低 12%。'),
    technique('golden-body','金身百炼经','jingang',2,2,110,{body:.35,health:15},'淬体修为收益额外 +35%，气血上限 +15。'),
    technique('mountain-bone','不动山岳身','jingang',3,3,150,{health:35,stamina:25},'气血上限 +35，体力上限 +25。'),
    technique('herbal-breath','青木养息功','baicao',1,0,30,{health:10,mana:10},'气血与灵力上限各 +10。'),
    technique('fire-sense','辨火灵诀','baicao',1,0,40,{alchemy:.04},'成丹率 +4 个百分点，仍受 98% 上限限制。'),
    technique('double-dew','凝露分丹法','baicao',1,1,65,{alchemyExtra:.08},'额外成丹概率 +8 个百分点，仍受 65% 上限限制。'),
    technique('herbal-memory','百草通玄经','baicao',2,2,110,{alchemyXp:.5},'每炉结算熟练度提高 50%，向下取整且至少增加 1 点。'),
    technique('green-cauldron','青帝御炉诀','baicao',3,3,150,{alchemy:.06,alchemyExtra:.05},'成丹率 +6、额外成丹概率 +5 个百分点；不绕过丹方与药鼎。'),
    technique('sword-step','穿云剑步','lingxiao',2,0,30,{walk:.18},'步行速度 +18%；不瞬移、不越过道路。'),
    technique('sword-breath','长锋敛息诀','lingxiao',2,0,40,{travelStamina:.08},'实际移动的体力消耗降低 8%。'),
    technique('sword-heart','剑心破障篇','lingxiao',2,1,65,{breakthrough:3},'突破成功率 +3 个百分点。'),
    technique('sword-body','百转剑骨功','lingxiao',2,2,110,{body:.20,stamina:15},'淬体修为收益额外 +20%，体力上限 +15。'),
    technique('sword-sky','凌霄问道经','lingxiao',3,3,150,{walk:.20,training:.10},'步行速度 +20%，修炼修为收益 +10%。'),
    technique('mind-lamp','识海明灯诀','xuanwei',1,0,30,{mana:25},'灵力上限 +25。'),
    technique('mind-calm','静照观心法','xuanwei',1,0,40,{meditation:.20},'入定修为收益额外 +20%。'),
    technique('mind-thread','分神理脉篇','xuanwei',1,1,65,{breakthrough:3},'突破成功率 +3 个百分点。'),
    technique('mind-mirror','太虚照神经','xuanwei',2,2,110,{mana:30,meditation:.18},'灵力上限 +30，入定修为收益额外 +18%。'),
    technique('mind-return','万念归一诀','xuanwei',3,3,150,{training:.12,meditation:.15},'修炼修为收益 +12%，入定修为收益额外 +15%。')
  ];
  G.TECHNIQUE_CAPS=Object.freeze({training:1,walk:.9,meditation:.8,body:.8,travelStamina:.4,health:150,stamina:100,mana:180,breakthrough:15,alchemy:.2,alchemyExtra:.2,alchemyXp:.5});
  G.technique=id=>G.TECHNIQUES.find(t=>t.id===id)||null;
  G.ITEMS=G.ITEMS.filter(i=>i.type!=='technique').concat(G.TECHNIQUES);
  for(const sect of G.SECTS){
    const supplies=original.library.filter(i=>!i.manual).map(i=>({...i}));
    sect.library=G.TECHNIQUES.filter(t=>t.source===sect.id).map(t=>({...t,manual:true})).concat(supplies);
  }
  G.SECT_RELATIONS=[
    {a:'tingyu',b:'jingang',value:45,reason:'共同维护城内救援与守阵，互信深，但体修不愿长期充当阵眼耗材。'},
    {a:'tingyu',b:'baicao',value:35,reason:'阵法护药圃，丹药养守阵人；对资源轮值有稳定合作。'},
    {a:'tingyu',b:'lingxiao',value:-20,reason:'旧日护城议事争执：听雨观主张分权守护，剑宗强调统一号令。'},
    {a:'tingyu',b:'xuanwei',value:30,reason:'共同校验城脉异象，但神识记录的公开范围尚有分歧。'},
    {a:'jingang',b:'baicao',value:55,reason:'护药与疗伤的长期盟约；金刚门承担护送，百草谷保留紧急药额。'},
    {a:'jingang',b:'lingxiao',value:-35,reason:'剑体论争与旧次序矛盾，双方都不服由对方定义强者。'},
    {a:'jingang',b:'xuanwei',value:-10,reason:'体修嫌观测迂回，神识修担心行动过快，缺少共同经历。'},
    {a:'baicao',b:'lingxiao',value:15,reason:'剑宗是主要用丹者，却拖欠过护路损耗补偿，交易尚未成为互信。'},
    {a:'baicao',b:'xuanwei',value:40,reason:'药性记录与神识辨识互相补足，共同反对不经同意的试验。'},
    {a:'lingxiao',b:'xuanwei',value:-25,reason:'剑宗要求集中情报，玄微阁坚持记录者和当事人保有拒绝权。'}
  ];
  G.sectPair=(a,b)=>[a,b].sort().join(':');
  const feature=G.FEATURE_UNLOCKS.find(f=>f.id==='sect');
  feature.hint='进阶修行后，在已配送解锁的宗门驻点完成任一宗门引荐';
  feature.ready=s=>G.SECTS.some(x=>G.sectState(s,x.id)?.invited);
  feature.notice='导航已开放宗门。五宗各有修行方向，可择一入宗，也可继续散修；办事仍须亲自沿道路到场。';
})(globalThis);
