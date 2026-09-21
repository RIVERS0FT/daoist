/* 都市系统修仙成长线：在现有规则引擎之上增加阶段剧情、系统解锁与关键主线。 */
(function (root) {
  'use strict';
  const G = root.NightCourier;
  if (!G) throw new Error('NightCourier core must load before progression.js');

  const c = (label, result, effects = {}, extra = {}) => ({ label, result, effects, ...extra });

  G.STORY_FLAG_KEYS = [
    'storySectInvitation',
    'storyStreetVein',
    'storySecondCity',
    'storyLanternNetwork',
    'storySystemDoubt',
    'storySystemTruth'
  ];

  G.metNPCCount = s => G.NPCS.filter(n => s.bonds?.[n.id]?.met === true).length;
  G.isNPCMet = (s, id) => s.bonds?.[id]?.met === true;
  G.visibleNPCs = s => G.NPCS.filter(n => G.isNPCMet(s, n.id));

  // 后五章按已完成的前章剧情逐章衔接；不把“已经触发”当作完成。
  G.storyEventComplete = (s, id) => {
    const event=G.EVENTS.find(e=>e.id===id&&e.kind==='story');
    return !!event?.flag && s.flags?.[event.flag]===true && s.pending?.templateId!==id &&
      s.activity?.params?.event?.templateId!==id;
  };
  G.HIGHER_STORY_CHAPTERS = [
    {id:'divine',chapter:'第八章',title:'一念照千家',realm:5,deliveries:54,previous:'story-system-truth',
      desc:'神识越过街巷后，你学会听见回应，也学会不替每扇门后的人作主。',events:['story-divine-echo','story-divine-consent']},
    {id:'void',chapter:'第九章',title:'虚隙有归途',realm:6,deliveries:68,previous:'story-divine-consent',
      desc:'追查流向城外的愿力，分辨旧阵留下的回声，为断开的连接留下归路。',events:['story-void-letter','story-void-return']},
    {id:'unity',chapter:'第十章',title:'同道共此城',realm:7,deliveries:84,previous:'story-void-return',
      desc:'不再独自承担整座城，与愿意参与的人共同守护灯火，同时保留退出的权利。',events:['story-unity-burden','story-unity-covenant']},
    {id:'mahayana',chapter:'第十一章',title:'大道在烟火',realm:8,deliveries:102,previous:'story-unity-covenant',
      desc:'把经验交给后来者，让修行回到具体的人与事，而不是不断增长的数字。',events:['story-mahayana-rookie','story-mahayana-ordinary']},
    {id:'tribulation',chapter:'第十二章',title:'劫尽见人间',realm:9,deliveries:122,previous:'story-mahayana-ordinary',
      desc:'面对旧阵记忆中的劫问，决定如何安放力量，并把接下来的路留给自己选择。',events:['story-tribulation-question','story-tribulation-dawn']}
  ];
  G.higherChapterReady = (s, chapter) => G.featureUnlocked(s,'system') &&
    s.player.realm>=chapter.realm && s.stats.delivered>=chapter.deliveries && G.storyEventComplete(s,chapter.previous);

  G.STORY_STAGES = [
    { id:'mortal', chapter:'第一章', title:'解锁外卖系统', desc:'先完成九单，再将第十份热饭送往非常驻随机地点；完成固定剧情，在本章解锁外卖系统。', ready:()=>true },
    { id:'bound', chapter:'第二章', title:'初入仙途', desc:'外卖系统已经开启。继续配送赚取外卖币，领取第一份委托奖励，开始吐纳修行。', ready:s=>G.featureUnlocked(s,'system') },
    { id:'second-city', chapter:'第三章', title:'城有第二面', desc:'异常门牌、旧阵纹与夜行客反复出现。青岚城并不只有地图上这一层。', ready:s=>s.flags?.storySecondCity === true || (s.stats.delivered>=8 && s.player.realm>=1) },
    { id:'circle', chapter:'第四章', title:'夜路同行', desc:'你认识了越来越多夜里仍醒着的人，也开始进入这座城真正的修行圈。', ready:s=>G.metNPCCount(s)>=2 && s.player.realm>=1 },
    { id:'guardian', chapter:'第五章', title:'阵眼苏醒', desc:'配送路线正在重新连接断裂的城脉。修行不再只是你一个人的事。', ready:s=>s.flags?.storyLanternNetwork === true || (s.stats.delivered>=18 && s.player.realm>=2) },
    { id:'system', chapter:'第六章', title:'系统为何而来', desc:'外卖系统开始显露自己的目的。它究竟在帮助你，还是借你完成某件事？', ready:s=>s.flags?.storySystemDoubt === true || (s.stats.delivered>=30 && s.player.realm>=3) },
    { id:'truth', chapter:'第七章', title:'人间即阵心', desc:'你终于知道力量来自哪里。接下来要决定的，不是还能变多强，而是这份力量属于谁。', ready:s=>s.flags?.storySystemTruth === true || (s.stats.delivered>=42 && s.player.realm>=4) }
  ];
  G.STORY_STAGES.push(...G.HIGHER_STORY_CHAPTERS.map(chapter=>({
    ...chapter,ready:s=>G.higherChapterReady(s,chapter)
  })));
  G.storyStage = s => {
    let current = G.STORY_STAGES[0];
    if(!G.featureUnlocked(s,'system'))return current;
    for (const stage of G.STORY_STAGES) if (stage.ready(s)) current = stage;
    return current;
  };
  G.storyStageLabel = s => {
    const stage=G.storyStage(s);
    return `${stage.chapter} · ${stage.title}`;
  };

  // 系统不是开局一次性开放全部能力。基础补给在第十单解锁剧情结束后开放，修行资源仍随境界解锁。
  const unlocks = {
    qi:0, heal:0, stamina:0, mana:0, herb:0,
    fragment:1, charm:1, foundation:1, breathing:1, lightstep:1,
    jade:2, robe:2
  };
  for (const item of G.ITEMS) item.unlockRealm = unlocks[item.id] ?? item.unlockRealm ?? 0;
  G.itemUnlocked = (s, item) => G.featureUnlocked(s,'system') && s.player.realm >= (item.unlockRealm || 0);

  // 都市生活继续是订单主体，但修行越深，越容易收到“只有你看得懂”的特殊配送。
  G.ORDER_TYPES.push(
    { title:'不存在的十三楼', desc:'电梯只有十二层。备注写着：到十二楼后走楼梯，不要看身后的镜子。', tip:20, condition:'mystic' },
    { title:'阵眼旁的一碗白粥', desc:'送到桥下旧石碑。若看见有人等，就把第二双筷子也留下。', tip:18, condition:'mystic' },
    { title:'给守夜人的药茶', desc:'收件人整夜不能离开阵位。茶不能洒，也不能换杯。', tip:16, condition:'careful' },
    { requiresSystem:true, title:'凌晨四点的热豆花', desc:'不是给修士，是给刚下夜班的人。系统却把这一单标成了“重要”。', tip:10, condition:'night' },
    { title:'旧雨书店的无名订单', desc:'备注只有一句：把书里的那个人也算一份。', tip:12, condition:'ordinary' },
    { title:'给另一个骑手的晚饭', desc:'对方正在替人顶班，地址会随着他的位置变化。请尽快送到。', tip:13, condition:'urgent' }
  );

  // 随机相逢：人物不是开局通讯录，而是在配送或奇遇中先成为“见过的人”。
  G.EVENTS.push(
    { id:'encounter-lin-night', kind:'delivery', encounterNpc:'lin', title:'急诊门口的一杯豆浆', text:'你抵达医馆时，门口有人突然晕倒。一个还穿着白大褂的女人从楼里跑出来，一边急救一边让你先把豆浆放到值班台。她叫林晚。', choices:[
      c('留下来帮她维持通道','等救护床推进去，她才想起那杯已经不烫的豆浆。',{stamina:-4,karma:2,rep:1}),
      c('按她说的先把订单送到','你没有添乱，也没有忘记自己正在做的事。',{rep:2,qi:4}),
      c('顺手买一瓶水放在值班台','她忙完回来时，看见水瓶旁写着“别忘了喝”。',{money:-3,karma:2})
    ]},
    { id:'encounter-chen-road', kind:'delivery', encounterNpc:'chen', title:'雨里的一把扳手', text:'前方一个骑手的链条掉了。你正犹豫要不要停，一辆旧三轮从巷口拐来。车上的男人蹲下，两分钟把链条重新挂好。他叫陈默。', choices:[
      c('帮忙打灯','你第一次发现，修车也有一种不慌不忙的节奏。',{stamina:-2,karma:1,qi:5}),
      c('把备用纸巾递过去','陈默擦了擦手，只说了一句：路上慢点。',{karma:2}),
      c('记下修车铺的位置','以后总会有需要一把扳手的时候。',{insight:1,rep:1})
    ]},
    { id:'encounter-shen-book', kind:'delivery', encounterNpc:'shen', title:'没有收件人的旧书', text:'订单地址是旧雨书店，店门却已经落锁。一个抱着纸箱的女人从后巷出来，说自己没点餐，但看到袋子里的书签后忽然沉默。她叫沈青禾。', choices:[
      c('把订单备注完整念给她听','她听到最后一句时，把书签夹进了随身的笔记本。',{karma:1,qi:6}),
      c('先确认平台地址没有出错','谨慎没有破坏这个夜晚，反而让她更放心。',{rep:2,insight:1}),
      c('问她是否认识寄单的人','她摇头，却说这个字迹像一位已经很多年没来过的读者。',{qi:8})
    ]},
    { id:'encounter-lu-rain', kind:'explore', encounterNpc:'lu', title:'山门外没有避雨的人', text:'雨忽然大起来。听雨观山门外站着一个没有打伞的人，雨水却总在离他半寸的地方散开。他看了看你的外卖箱，说：“能把人间的饭送到这里，也算有缘。”', choices:[
      c('问他这里能不能避雨','他侧身让出屋檐，也让出了一条以前看不见的山路。',{stamina:4,qi:8}),
      c('把多带的一份热饭分给他','他接过饭时很认真，像在接一件法器。',{money:-8,karma:2,qi:6}),
      c('先问这是不是障眼法','他笑了一声：“至少你知道要先问。”',{insight:1,qi:5})
    ]}
  );

  const storyEvents = [
    {
      id:'story-sect-invitation',kind:'story',flag:'storySectInvitation',
      ready:s=>!s.sect.invited&&G.sectInvitationReady(s),
      title:'山门为谁而开',
      text:'陆听雨发来一段语音：听雨观准备重新收徒，不再只靠一个人守着旧阵。「你已能引气入体，也真的把饭送进过这道山门。愿意的话，来做一名走在人间的弟子。宗门不替你决定去路，更不会收走你的外卖箱。」',
      choices:[
        c('听他说完门规','不欺凡人，不弃同门，不以修为夺人饭碗。你收下引荐信；是否入宗，仍由你亲自到听雨观决定。',{qi:4}),
        c('问入宗后能否继续送外卖','陆听雨回答：「这正是我们的修行。」你收下引荐信，记住了宗门外送委托的约定。',{rep:1}),
        c('收下引荐信，暂时保持散修身份','山门会为你留着。宗门入口已经开放，但不会替你入宗，也不会改变已有的生活。')
      ]
    },
    {
      id:'story-street-vein', kind:'story', flag:'storyStreetVein',
      ready:s=>s.flags.firstOrder && s.stats.delivered>=3,
      title:'地图上多出来的一条线',
      text:'外卖系统展开了你先前送达的路线。最初的三段路被细金线连在一起，像血管，也像阵纹。系统只显示一句：连接有效。',
      choices:[
        c('把三段路线重新走一遍','你确认金线不是错觉。它们只在有人真正抵达之后亮起。',{stamina:-4,insight:1,qi:8}),
        c('截图留存，暂不声张','第二天再看，截图里什么都没有，但你记得那些线在哪里。',{insight:1,rep:1}),
        c('问系统“连接了什么？”','系统沉默很久，只回了两个字：人间。',{qi:10,karma:1})
      ]
    },
    {
      id:'story-second-city', kind:'story', flag:'storySecondCity',
      ready:s=>s.player.realm>=1 && s.stats.delivered>=8,
      title:'城市的背面',
      text:'炼气之后，你开始看见以前看不见的东西：医院走廊尽头有旧符，桥墩下面刻着阵号，某些深夜订单的门牌会在你眨眼时改变。最奇怪的是，这些异常都沿着你的配送路线分布。',
      choices:[
        c('把异常地点标进自己的地图','零散的怪事第一次有了形状：它们围着青岚城形成一个残缺的环。',{insight:1,qi:12}),
        c('继续像平常一样送单','先把饭送到，再考虑世界为什么变了。这个决定让道心意外地稳定。',{karma:2,qi:8}),
        c('尝试用灵力感应整座城','千万盏灯同时涌进感知，你立刻收回神识，却记住了一瞬间的脉动。',{mana:-8,qi:16})
      ]
    },
    {
      id:'story-lantern-network', kind:'story', flag:'storyLanternNetwork',
      ready:s=>s.player.realm>=2 && s.stats.delivered>=18 && G.metNPCCount(s)>=2,
      title:'每个人都是一个阵点',
      text:'筑基后的某夜，系统第一次把“订单”改成了“阵点”。你看见医馆、修车铺、书店、山门和无数普通住户之间被灯火连在一起。阵法没有高高在上的阵眼——每一个仍愿意回应别人的人，都是阵眼。',
      choices:[
        c('记住这些人的名字','阵纹不再只是几何图形。你知道每一点后面都有人在生活。',{karma:3,qi:16}),
        c('研究灯火与灵气的转换','你确认外卖币只是中间形式，真正被系统收集的是“抵达”产生的愿力。',{insight:2,qi:12}),
        c('先去完成下一单','系统没有评价。地图上却有一处黯淡阵点重新亮了。',{rep:2,qi:10})
      ]
    },
    {
      id:'story-system-doubt', kind:'story', flag:'storySystemDoubt',
      ready:s=>s.player.realm>=3 && s.stats.delivered>=30,
      title:'系统第一次拒绝回答',
      text:'金丹凝成后，你终于有能力查看系统更深的一层。后台没有商城，没有任务表，只有一条持续增长的记录：“有效连接数”。你问它为什么需要这么多连接。系统关闭了界面。',
      choices:[
        c('暂停追问，记录变化','你没有和未知力量硬碰。谨慎让你看见：系统关闭前，数字仍在因为远处的一次送达而增长。',{insight:1,qi:12}),
        c('以神识强行追踪','你触到一片庞大的残缺阵海，也察觉其中有一部分正在把力量引向城外。',{mana:-12,qi:20}),
        c('问自己：如果没有奖励，还会不会送？','答案没有立刻出现。但你想起许多已经不需要系统提醒也会去做的事。',{karma:3,qi:14})
      ]
    },
    {
      id:'story-system-truth', kind:'story', flag:'storySystemTruth',
      ready:s=>s.player.realm>=4 && s.stats.delivered>=42,
      title:'万家灯火，不属于任何人',
      text:'元婴之后，你终于看清系统的核心：它是旧护城阵残存的“器灵”。数十年前阵法破碎，为了自救，它学会用现代人最熟悉的方式发布任务、发放奖励、引导一个又一个人重新建立连接。它选择过别人，也会继续选择别人。你从来不是唯一的救世主。',
      choices:[
        c('把控制权还给整座城','如果力量来自万家灯火，就不该只由一个人决定它往哪里流。',{karma:4,qi:24}),
        c('保留系统，但拒绝绝对服从','你接受它的帮助，也保留说“不”的权利。修行终于从任务列表变回自己的选择。',{insight:2,qi:20}),
        c('告诉系统：以后少发命令，多讲原因','沉默很久后，界面出现一个新的按钮：“说明”。你笑出了声。',{rep:2,karma:2,qi:18})
      ]
    }
  ];

  // 每章两段固定剧情，第二段的累计配送门槛高两单；数值效果仍由原规则引擎结算。
  const higherScenes = [
    [
      {id:'story-divine-echo',flag:'storyDivineEcho',title:'灯火之外的回声',
        text:'手头的事告一段落，化神后的神识忽然铺满青岚城。外卖系统曾经显示的光点，如今有了敲门声、锅铲声和未说完的道谢。你也听见一扇门后的沉默：那里的人并不希望被看见。器灵问，既然能够感知，是否就该替所有人安排去路？你把神识停在门外，第一次明白，看得更远不等于有权走进去。',choices:[
          c('把神识停在门外，只等主动回应','那些愿意回应的灯火慢慢清晰，沉默的门仍安静关着。你不再把无声误认成等待拯救，修行多了一条自己愿意遵守的边界。',{karma:3,qi:36}),
          c('记下回声的层次，先分辨再判断','你将求助、寒暄和旧阵回响分别记下。器灵承认，它过去常把所有信号算成同一种连接；你开始校对这份过于简单的答案。',{insight:2,qi:40}),
          c('收回神识，先读眼前的真实备注','手机上仍是一句平常的“轻敲门，家里有人休息”。你认真读完，发现化神之后需要学习的，也包括不忽略这样的小事。',{rep:3,qi:32})]},
      {id:'story-divine-consent',flag:'storyDivineConsent',title:'每扇门都能说不',
        text:'你调出最近两份外卖的送达记录，系统把不同的回应并排展开。有的人愿意成为阵点，有的人只需要一顿热饭，还有的人今天不想与任何人说话。器灵曾把不回应视作阵法的缺口，你却想起每张订单都要先有人愿意下单。修补护城阵，不能从替陌生人决定开始。',choices:[
          c('写下原则：愿意回应，才算连接','你为后续查阵写下第一条约定。器灵删掉了推演里强迫闭合的那条线；这不是失去一个阵点，而是学会尊重一个人。',{karma:4,qi:44}),
          c('静心校对信号，区分沉默与求助','你耐心分辨旧阵回声，没有敲开任何真实的门。推演中，几处虚假的求救信号被标了出来，其中一条正通向城外的残缺阵纹。',{mana:-12,insight:2,qi:52},{duration:12}),
          c('请器灵先说明，再让人自己回答','你没有替任何人答应。器灵在推演旁补上来意与风险，第一次把等待回答当作必要的一步。你们继续追查的方向，指向了城外。',{rep:3,qi:44})]}
    ],
    [
      {id:'story-void-letter',flag:'storyVoidLetter',title:'没有地址的回信',
        text:'炼虚之后，你重新查看那条流向城外的阵纹。它并非通往另一座商城，而像一封不断被退回的信。数十年前旧阵破碎，许多已经断开的回应仍被器灵反复呼叫；每重试一次，就有一点愿力流进虚隙。系统以为连接越多越好，却没有学会确认：对面是否还在等，是否仍愿意接。',choices:[
          c('先核对回声，别把旧日当成今日','你把仍在发生的求助与旧阵记忆逐一分开。离去的人不该被永远困在一次未完成的送达里，活着的人也不该替旧记录不断付账。',{insight:2,qi:50}),
          c('让器灵承认，有些信已经无法送达','器灵沉默后，承认了它从未敢写下的失败。你没有将那些名字抹去，只让它们从不断催促的请求，成为可以安放的记忆。',{karma:4,qi:46}),
          c('先给仍有回应的连接标出方向','你没有贸然踏入虚隙，而是在现有阵图上标记可靠的回声。寻找归路，先要知道哪一端仍有人愿意开门。',{rep:3,qi:48})]},
      {id:'story-void-return',flag:'storyVoidReturn',title:'给虚隙留下归路',
        text:'最近两次真实送达，让旧回声与今日的回应终于有了可比照的节奏。器灵提出一条捷径：直接拿全城灯火填满虚隙。但那会让普通人的生活替一个残缺的旧约定付出代价。你看着仍然亮着的街灯，明白修复不是把所有缺口一次塞满，而是让每段连接知道自己从哪里来、能够在哪里停下。',choices:[
          c('保留记忆，停止向无回应处索取','旧阵推演中的空转回路逐一停下，那些名字却仍留在记录里。器灵接受了这条边界：记得一个人，不等于继续向他索要回答。',{karma:4,qi:56}),
          c('沿阵图逐段推演，给回流设下边界','你在原地推演了十八分钟，为每段回声标明来处与止步线。神识没有代替身体跨越地图；你得到的是一份可继续核验的修补方案，而不是任意通行的捷径。',{mana:-16,insight:2,qi:64},{duration:18}),
          c('先保住仍有人生活的街巷','你拒绝用今天的灯火去偿还所有旧债。方案先保留有真实回应的部分，将无法确认的回路暂时隔开；未完成，不等于可以不计代价。',{rep:4,qi:54})]}
    ],
    [
      {id:'story-unity-burden',flag:'storyUnityBurden',title:'不能由一人承受的城',
        text:'合体之后，你已能在神识里同时维持许多阵线，却发现只要稍稍走神，它们就开始向你一人倾斜。器灵称这为最稳定的中心。与此同时，群里的普通人还在互相提醒断电、暴雨和晚归的路口。你忽然意识到，倘若一座城必须等一个强者醒着才能安稳，那不是共同守护，而是另一种脆弱。',choices:[
          c('把自己的判断交出来，请人一起核对','你把能说明白的阵图整理成普通人也能看懂的风险提示。愿意参与的人提出了许多你不曾注意的细节，守护不再只有一种声音。',{rep:4,qi:62}),
          c('让器灵计算：少了我，哪里仍能运转','推演里的中心第一次被暂时移开。仍能互相照应的街巷亮着，你把这些连接记下来，准备让阵法学会依靠不止一个人。',{insight:2,qi:68}),
          c('先问大家愿意承担什么，而不是分派','你没有把修为、姓名或身份当成义务。每个人可以说出自己的边界，共同守护也必须从自愿开始。',{karma:4,qi:60})]},
      {id:'story-unity-covenant',flag:'storyUnityCovenant',title:'把阵图摊在桌上',
        text:'你翻看最近两单平常的配送记录，把一路收到的意见重新展开。有人能守夜，有人只能在清晨留一盏灯，也有人需要随时退出照看家人。旧护城阵只有服从与断开两种记录方式，你们却需要更多可能：轮换、拒绝、解释，以及没人能永久占有的决定权。无论是否加入宗门，这份约定都不该把人分成高低。',choices:[
          c('约定参与自愿，退出也不受惩罚','你把退出的权利与参与的善意写在同一页。器灵终于承认，真正可靠的连接，不必靠锁住另一端来维持。',{karma:5,qi:70}),
          c('整理轮换方案，检验没有中心的阵图','你用二十分钟把意见整理成轮换推演，逐一移开中心节点。没有人被擅自编入名册；你学到的是如何分担，而不是替所有人下令。',{stamina:-10,insight:2,qi:80},{duration:20}),
          c('保留不同意见，让每次决定都有说明','你把尚未达成一致的地方也原样留下。共同守护不是假装所有人想法相同，而是愿意继续把理由说清楚。',{rep:4,qi:72})]}
    ],
    [
      {id:'story-mahayana-rookie',flag:'storyMahayanaRookie',title:'新骑手的第一张单',
        text:'大乘之后，许多曾经艰难的修行已有答案，一名新骑手却仍会被相似的楼号绕得满头汗。他在公共求助里问：是不是不够厉害的人就不适合做这份工作？器灵列出一长串效率建议。你想起自己的第一份热饭，那时你并没有系统，也没有人要求你第一次就懂得整座城。',choices:[
          c('先说明楼号规律，再让他自己判断','你把容易认错的地方说清楚，没有接管他的订单。下一次辨认成功，会成为他自己的经验，而不是对你的依赖。',{rep:4,qi:76}),
          c('告诉他，求助不是失败','你分享了刚入行时的笨拙，也提醒他先顾好安全。能容下不熟练的人，一条路才会不断有人走来。',{karma:5,qi:72}),
          c('把经验写成谁都能读懂的几句话','你删掉修行术语，只留下检查门牌、核对备注和遇险停下。大道并没有因此变浅，它终于能够被一个普通人用上。',{insight:2,qi:82})]},
      {id:'story-mahayana-ordinary',flag:'storyMahayanaOrdinary',title:'不必被记住的一次抵达',
        text:'翻过最近两单的记录，器灵问你要不要把帮助后来者的每句话都计入成就。你看着街边互相让路的人，忽然发现许多让城市继续生活的事情从来没有奖章。系统仍然可以按规则结算外卖币，但不能把没有被计数的善意说成毫无价值。大乘的下一课，或许正是容许世界不围着自己的名字转。',choices:[
          c('保留正常报酬，不把所有善意变成考核','你没有要求谁无偿劳动，也没有把一次帮助变成新的排名。劳动值得报酬，善意也可以不必接受评比，两件事并不矛盾。',{karma:5,qi:86}),
          c('整理一份不署名的行路笔记','你花二十五分钟把沿路经验重新整理，删去了夸耀自己的句子。留下的是后来者可以接着补充的空白，而不是必须照抄的答案。',{stamina:-12,insight:3,qi:96},{duration:25}),
          c('提醒器灵，数字以外也有人间','器灵在记录旁留下一句新的自省：没有计入，不等于没有发生。你仍保留奖励与任务，却不再让它们定义一切。',{rep:5,qi:84})]}
    ],
    [
      {id:'story-tribulation-question',flag:'storyTribulationQuestion',title:'天雷问的不是修为',
        text:'渡劫境的神识触及旧阵最深处，一段雷夜记忆将你围住。那不是街道上突然发生的战斗，而是阵法破碎时留下的劫问：若交出所有人的选择，就能换来一个永不出错的世界，你会不会答应？记忆中的天门安静等待。你想起沉默的门、无法送达的旧信，以及仍在学习看路的新骑手。',choices:[
          c('拒绝以替别人决定换取安稳','你没有替全城作出那个看似完美的交易。记忆中的雷声仍在，但你知道一条不愿跨过的线，比一个保证万无一失的承诺更真实。',{karma:5,qi:100}),
          c('先问代价由谁承担，再回答劫问','你把被漂亮承诺略去的代价逐项说出。天门不再像一道只能服从的命令，而成了你可以质疑、也必须负责的选择。',{insight:3,qi:108}),
          c('承认会有遗憾，仍选择共同承担','你没有许诺救下每一盏灯，也不把失败推给命数。愿意继续修补、解释和承担，是你此刻能给出的回答。',{rep:5,qi:98})]},
      {id:'story-tribulation-dawn',flag:'storyTribulationDawn',title:'天门之后仍有门铃',
        text:'劫问之后，你重新看了最近两份真实配送的记录。清晨的门铃与旧阵记忆中的雷声终于分开，器灵不再替你写下唯一的归途。升得更高并不自动回答该怎样生活。远行、留守，或再观察一段时间，都应由你决定；此刻摆在面前的，仍是一座有人等饭、有人愿意开门的城。',choices:[
          c('记住归路，仍愿意看看更远的天地','你把远行当成方向，而不是立刻消失的命令。这段主线在此收束，真正要选择哪一种归途，仍可由你在外卖系统中亲自决定。',{insight:3,qi:120}),
          c('静坐片刻，把愿守的人间重新记清','你在原地静坐三十分钟，让雷夜的记忆与眼前的生活各归其位。没有自动飞升，也没有新的境界被强行赐予；只是你更清楚自己为何留下。',{mana:-20,karma:5,qi:128},{duration:30}),
          c('暂不决定，继续走好眼前的路','你收起那份宏大的答案，允许自己继续生活。故事没有替你结束游戏，外卖箱也仍在身边。下一次门铃，可以等你准备好再按下。',{rep:5,qi:116})]}
    ]
  ];
  const higherEvents=G.HIGHER_STORY_CHAPTERS.flatMap((chapter,i)=>higherScenes[i].map((scene,part)=>({
    ...scene,kind:'story',higherChapter:chapter.id,title:`${chapter.chapter} · ${scene.title}`,
    ready:s=>G.higherChapterReady(s,chapter) && s.stats.delivered>=chapter.deliveries+part*2 &&
      (part===0||G.storyEventComplete(s,chapter.events[0]))
  })));
  G.STORY_FLAG_KEYS.push(...higherEvents.map(e=>e.flag));
  storyEvents.push(...higherEvents);
  G.EVENTS.push(...storyEvents);

  const originalNewGame = G.newGame;
  G.newGame = (...args) => {
    const s = originalNewGame(...args);
    for (const key of G.STORY_FLAG_KEYS) s.flags[key] = false;
    return s;
  };

  const originalSanitize = G.sanitizeSave;
  if (originalSanitize) {
    G.sanitizeSave = raw => {
      const s = originalSanitize(raw);
      for (const key of G.STORY_FLAG_KEYS) s.flags[key] = key==='storySectInvitation'&&(raw.schemaVersion??raw.version)<17?false:raw?.flags?.[key] === true;
      // v18 的开放式 flags 白名单扩充：旧档缺失新键视为未触发，不补播、不补奖。
      for(const event of higherEvents){
        const value=raw.flags?.[event.flag];
        if(value!==undefined&&typeof value!=='boolean')throw new Error('高境界主线标记损坏。');
        const waiting=s.pending?.templateId===event.id||s.activity?.params?.event?.templateId===event.id;
        if(waiting&&s.activeOrder)throw new Error('高境界主线不能打断已接配送。');
        if(waiting)s.flags[event.flag]=true;
        if(s.flags[event.flag]&&!event.ready(s))throw new Error('高境界主线与境界、配送或前章进度不一致。');
      }
      // 已读引荐由宗门状态佐证；丢失触发标记的旧待选剧情仍可继续，不重发奖励。
      s.flags.storySectInvitation=s.sect.invited||s.pending?.templateId==='story-sect-invitation';
      // 已完成的旧剧情和羁绊补领一次；仍在待选/执行中的主线不算完成。
      G.syncFormulaRewards(s);
      G.syncFeatureUnlocks(s,true);
      return s;
    };
  }

  const storyActions = new Set(['deliver','choose','travel','moveHome','rest','sleep','cultivate','breakthrough','explore','visit','heal','meal','alchemy','sectJoin','sectTask','sectPromote']);
  function injectStoryEvent(s) {
    if (s.gameOver || s.pending || s.ending || s.activity || !G.featureUnlocked(s,'system')) return;
    const next = storyEvents.find(e => !s.flags[e.flag] && e.ready(s) &&
      (!e.higherChapter||(!s.activeOrder&&!s.eventResult&&!s.placeUnlock&&!G.nextUnlockNotice(s))));
    if (!next) return;
    s.flags[next.flag] = true;
    s.pending = {
      ...G.clone(next),
      id:`story-${s.turn}-${s.seed}`,
      templateId:next.id,
      source:'classic',
      aiStatus:'skip'
    };
    G.log(s, `主线推进：${next.title}。`, '主线');
  }

  G.afterWorldAction = (s, action) => { if (storyActions.has(action)) injectStoryEvent(s); };

  const originalPerform = G.perform;
  G.perform = (original, action, payload = {}) => {
    if (action === 'buy') {
      const item = G.ITEMS.find(i => i.id === payload.id);
      if (G.featureUnlocked(original,'system') && item && !G.itemUnlocked(original, item)) {
        return { ok:false, state:original, error:`需要进入${G.REALMS[item.unlockRealm].name}后，${G.SYSTEM_NAME}才会开放这项兑换。` };
      }
    }
    const result = originalPerform(original, action, payload);
    if (!result.ok) return result;
    // Completion is dispatched by the simulation, never by merely starting an action.
    return result;
  };
})(globalThis);
