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
      desc:'化神让你听见更多，却也把“知道”与“有权介入”的差别推到面前。器灵开始学习先说明、再等待回应；你也重新认识那些从不需要被神识看穿，只需要被认真对待的人。',events:['story-divine-echo','story-divine-consent']},
    {id:'void',chapter:'第九章',title:'虚隙有归途',realm:6,deliveries:68,previous:'story-divine-consent',
      desc:'炼虚后，你追到城外的不是敌人，而是一批数十年没有得到回答的旧连接。修复不再等于补满所有缺口：有人需要被记住，有些请求需要被确认已经结束。',events:['story-void-letter','story-void-return']},
    {id:'unity',chapter:'第十章',title:'同道共此城',realm:7,deliveries:84,previous:'story-void-return',
      desc:'合体境能让你承担更多，也暴露出“所有事都交给最强者”的脆弱。你把阵图、风险和决定权摊开，让愿意参与的人能轮换、质疑、退出，也让自己不再把独自扛住当成责任。',events:['story-unity-burden','story-unity-covenant']},
    {id:'mahayana',chapter:'第十一章',title:'大道在烟火',realm:8,deliveries:102,previous:'story-unity-covenant',
      desc:'大乘之后，真正困难的不是再证明自己多强，而是把走过的路说成后来者能用的经验。你开始允许别人笨拙、求助、修改答案，也允许许多善意不被系统记成成就。',events:['story-mahayana-rookie','story-mahayana-ordinary']},
    {id:'tribulation',chapter:'第十二章',title:'劫尽见人间',realm:9,deliveries:122,previous:'story-mahayana-ordinary',
      desc:'渡劫境把旧阵最深的选择重新摆在你面前：用绝对控制换取永不出错，还是接受不确定并共同承担。雷声之后仍有门铃，你最后要安放的不是修为，而是自己与人间的关系。',events:['story-tribulation-question','story-tribulation-dawn']}
  ];
  G.higherChapterReady = (s, chapter) => G.featureUnlocked(s,'system') &&
    s.player.realm>=chapter.realm && s.stats.delivered>=chapter.deliveries && G.storyEventComplete(s,chapter.previous);

  G.STORY_STAGES = [
    { id:'mortal', chapter:'第一章', title:'解锁外卖系统', desc:'你还只是为房租、饭钱和下一张订单奔忙的普通骑手。九次寻常送达让“抵达”慢慢有了重量；第十份热饭把问题摆到你面前：没有奖励时，你为什么仍愿意把一份饭送热。', ready:()=>true },
    { id:'bound', chapter:'第二章', title:'初入仙途', desc:'外卖系统已经开启，但力量没有替你解决生活。你一边接单、领取第一份委托、学习吐纳，一边发现系统更像一个不会表达的记录者：它会计算连接，却还不懂每次抵达对人意味着什么。', ready:s=>G.featureUnlocked(s,'system') },
    { id:'second-city', chapter:'第三章', title:'城有第二面', desc:'炼气后，门牌、桥墩与旧墙开始露出另一层纹理。你学着不把所有异常都叫作机缘，也不把所有陌生都当成危险；青岚城的背面首先是一段需要被求证的历史。', ready:s=>s.flags?.storySecondCity === true || (s.stats.delivered>=8 && s.player.realm>=1) },
    { id:'circle', chapter:'第四章', title:'夜路同行', desc:'你认识的夜行人越来越多：有人交班，有人守车，有人等末班车，也有人只是想吃完一顿不被打断的饭。修行圈不再是一张强者名单，而是一群各有疲惫、原则和牵挂的人。', ready:s=>G.metNPCCount(s)>=2 && s.player.realm>=1 },
    { id:'guardian', chapter:'第五章', title:'阵眼苏醒', desc:'筑基以后，配送路线重新连接断裂城脉。你却逐渐明白，所谓阵点并不是可随意调度的资源；每盏灯后都有工作、家人、失误和休息，守护必须先承认这些具体生活。', ready:s=>s.flags?.storyLanternNetwork === true || (s.stats.delivered>=18 && s.player.realm>=2) },
    { id:'system', chapter:'第六章', title:'系统为何而来', desc:'金丹让你第一次能追问外卖系统本身。奖励、委托与“有效连接数”开始出现裂缝：它确实帮过你，却也在回避一个关键问题——它为什么如此害怕连接减少。', ready:s=>s.flags?.storySystemDoubt === true || (s.stats.delivered>=30 && s.player.realm>=3) },
    { id:'truth', chapter:'第七章', title:'人间即阵心', desc:'元婴之后，你看清系统是旧护城阵残存的器灵，也看清自己从来不是唯一被选中的救世主。力量来自万家灯火，因此真正的问题变成：谁能解释、谁能拒绝、谁有权决定它往哪里流。', ready:s=>s.flags?.storySystemTruth === true || (s.stats.delivered>=42 && s.player.realm>=4) }
  ];
  G.STORY_STAGES.push(...G.HIGHER_STORY_CHAPTERS.map(chapter=>({
    ...chapter,ready:s=>G.higherChapterReady(s,chapter)
  })));

  // 章节侧写只读取已经结识的人物。它补充人物如何理解当前主线，不推进剧情、不发奖，也不提前泄露未结识人物。
  G.CHAPTER_CHARACTER_BEATS = Object.freeze([
    {id:'mortal',question:'如果没有奖励、境界与命令，你仍愿意把什么送到别人手里？',beats:[
      {npc:'lin',text:'林晚见你把自己的饭点又往后挪，只问了一句：替所有人赶时间的时候，你给自己留时间了吗？她关心人的方式总像一条很具体的提醒。'},
      {npc:'chen',text:'陈默说刹车要看，人也得歇。他从不把硬撑叫本事，只把能平安收工看成一件值得认真做完的事。'},
      {npc:'zhou',text:'周野嘴上总在比谁更熟路，真见同行摔车却会先停下来扶一把。你第一次意识到，同一条配送路上并不只有排名和单量。'}
    ]},
    {id:'bound',question:'得到力量以后，你会把它当捷径，还是先弄清它改变了谁的生活？',beats:[
      {npc:'shen',text:'沈青禾把“系统”两个字写进笔记，又划掉旁边那句解释：还没弄懂的东西，先别急着替它定义。'},
      {npc:'lu',text:'陆听雨没有把你称作天选之人，只让你先把一口气呼吸完整。能得到力量，不等于已经知道该怎样使用它。'},
      {npc:'tang',text:'唐梨听完你说兑换和修炼，第一句话却是“那你今晚还是要吃饭吧？”新世界没有让旧生活突然失效。'}
    ]},
    {id:'second-city',question:'看见城市背面后，怎样区分真实危险、旧日痕迹与自己的想象？',beats:[
      {npc:'qin',text:'秦观澜说异常值不是答案，只是在提醒人：这里值得再看一次。把不理解的东西直接叫作噪声，和把它直接叫作神迹一样草率。'},
      {npc:'pei',text:'裴景行提醒你，旧城墙上的每一道痕迹都有年代和来处。像阵纹，不代表可以抹掉它原本属于谁的历史。'},
      {npc:'cheng',text:'程砚秋修补古籍时宁肯留一个缺口，也不补上自己猜出来的字。你开始接受，暂时不知道也是一种可靠的答案。'}
    ]},
    {id:'circle',question:'同行不是工具和阵点；你愿意知道他们为什么仍在夜里醒着吗？',beats:[
      {npc:'han',text:'韩远舟交班后最先做的是洗手、吃饭、确认下一班同事已经接住工作。他不把不休息当成职业荣誉。'},
      {npc:'zhao',text:'赵启明说一段线路恢复供电，从来不是某一个人“扛下来”的；有人断电、有人验电、有人在地面守着彼此。'},
      {npc:'song',text:'宋泊宁记得末班车上常见的乘客，却很少问别人为什么这么晚回家。他说把人安全送到站，有时比问清故事更重要。'},
      {npc:'yue',text:'岳长川习惯先确认出口和同伴，再谈谁冲得最快。真正的可靠不是一个人往前冲，而是知道谁还在身后。'}
    ]},
    {id:'guardian',question:'如果每个人都是阵点，守护是否也意味着承认每个人都有自己的生活和边界？',beats:[
      {npc:'lin',text:'林晚把一场活动拆成轮值和交接，拒绝让“最能干的人”自动接走所有空缺。照应别人不该以耗尽某一个人为代价。'},
      {npc:'chen',text:'陈默把夜修点的工具挂在人人看得懂的位置。他愿意帮忙，却不替每一个骑手决定该修什么、什么时候继续上路。'},
      {npc:'meng',text:'孟怀山说榫卯牢靠，不是因为一块木头压住所有地方，而是每一处都知道自己承多少力、该给哪里留余地。'},
      {npc:'ye',text:'叶青岚做花束时总会留一点空。她说东西挤得太满就没有舒展的位置，人与人之间也是一样。'}
    ]},
    {id:'system',question:'一个持续奖励你的系统，也有可能隐瞒目的；信任要靠什么建立？',beats:[
      {npc:'jiang',text:'江临听到“运行正常”四个字会追问正常的标准是谁定的。一个黑箱能给出正确结果，也不代表它可以永远拒绝解释。'},
      {npc:'xu',text:'许知夏准备直播时会把“不确定”和“已核实”分开说。她提醒你，解释不清楚的东西不能只靠权威口吻让人相信。'},
      {npc:'luo',text:'罗映秋做方案时一定写负责人、备选和退出条件。她不喜欢一句“到时我处理”包办所有风险，因为那让别人连判断的机会都没有。'}
    ]},
    {id:'truth',question:'力量来自万家灯火时，谁有资格替万家决定它的用途？',beats:[
      {npc:'shen',text:'沈青禾说编辑可以帮助一句话更清楚，却不能把作者的声音改成自己的。你忽然明白，“代为整理”与“代替发言”从来不是一回事。'},
      {npc:'gu',text:'顾清遥开始学会在小组里交还本来属于别人的任务。她说把所有事自己做完看似稳妥，其实也可能是不相信同伴。'},
      {npc:'wen',text:'闻星在作品说明里认真标明参考来源。她不愿因为自己完成了最后一笔，就把此前所有人的贡献都算进自己的名字。'},
      {npc:'su',text:'苏砚越来越在意拍摄前那句“你愿意吗”。被看见可以是机会，也可以是压力；决定权应该留在镜头前的人手里。'}
    ]},
    {id:'divine',question:'能感知更多以后，怎样不把能力变成闯进别人生活的借口？',beats:[
      {npc:'han',text:'韩远舟见过太多“我是为你好”的越界。他说真正紧急时要果断，不紧急时就该把解释和选择还给当事人。'},
      {npc:'yue',text:'岳长川救援时会大声说明自己是谁、要做什么。力量越大，越需要让被帮助的人知道接下来会发生什么。'},
      {npc:'xu',text:'许知夏把镜头外也当作真实生活。没有被拍到、没有回应、没有公开表达，都不等于默认同意。'}
    ]},
    {id:'void',question:'面对无法送达的旧回应，修复与放手的边界在哪里？',beats:[
      {npc:'cheng',text:'程砚秋修旧书时不会把缺失页伪造成“从未丢过”。保存痕迹、承认缺口，有时比补出一个漂亮完整的版本更诚实。'},
      {npc:'meng',text:'孟怀山一直留着几件旧木活，却不再等原主人某天突然回来取。他说记得一段关系，不等于让今天永远停在过去。'},
      {npc:'pei',text:'裴景行做旧城研究时最怕把后人的愿望写成前人的原话。你们都在学习：记忆值得保存，但不能替沉默的人继续作答。'}
    ]},
    {id:'unity',question:'共同守护如何避免把责任重新压到最能干的那一个人身上？',beats:[
      {npc:'lin',text:'林晚主动把自己的名字从几个“默认负责”栏里删掉，改成轮值。她终于能说：我会做这一部分，但不是全部。'},
      {npc:'zhao',text:'赵启明画检修图时会把隔离点、复核人和接替顺序都标出来。真正安全的系统，不能只在某个老手一直在线时才成立。'},
      {npc:'luo',text:'罗映秋把不同意见留在会议记录里，不再为了“看起来一致”抹掉分歧。能继续合作，不代表所有人必须说同一句话。'},
      {npc:'lu',text:'陆听雨守阵多年后最难学的一课，是让别人也能靠近阵图。传下方法比永远守在中央更需要勇气。'}
    ]},
    {id:'mahayana',question:'当你已经足够强，是否还愿意把经验说成普通人也能用的话？',beats:[
      {npc:'song',text:'宋泊宁带新司机认路时先讲哪几个站最容易错过，而不是讲自己从没开错过。经验如果只能证明老师厉害，就帮不了新人。'},
      {npc:'jiang',text:'江临写说明时开始删掉只有自己懂的缩写。他说真正可维护的东西，应该允许后来的人发现问题、提出修改，而不是崇拜最初作者。'},
      {npc:'tang',text:'唐梨教新人打奶泡时会把失败的那几杯也摆出来。熟练不是天赋证明，是很多次可以被解释、被重来的练习。'},
      {npc:'su',text:'苏砚不再把每次拍摄都当成必须完美的作品。她愿意让第一次站到镜头前的人慢一点，先找到自己舒服的姿势。'}
    ]},
    {id:'tribulation',question:'没有完美答案时，你愿意怎样承担自己的选择，又给别人留下选择？',beats:[
      {npc:'lu',text:'陆听雨曾把“断尘”当作唯一答案，如今却愿意承认自己改过路。活得够久并不会自动正确，能修正才让经验有意义。'},
      {npc:'chen',text:'陈默没有劝你留下或远走，只说决定好了就把车况看一遍。再大的选择，最后也要落回今天能认真做完的小事。'},
      {npc:'qin',text:'秦观澜从不承诺天气一定照预报走。她会给概率、风险和备用方案，然后接受世界仍可能有偏差。'},
      {npc:'ye',text:'叶青岚说四季不会因为人舍不得就停住。选择一枝花，也意味着放过另外几枝；重要的是别假装自己没有做选择。'}
    ]}
  ].map(chapter=>Object.freeze({...chapter,beats:Object.freeze(chapter.beats.map(beat=>Object.freeze(beat)))})));

  G.chapterCharacterNotes = (s, stageId=G.storyStage(s).id) => {
    const chapter=G.CHAPTER_CHARACTER_BEATS.find(entry=>entry.id===stageId);
    if(!chapter)return {question:'',notes:[]};
    const notes=chapter.beats.filter(beat=>G.isNPCMet(s,beat.npc)).map(beat=>{
      const npc=G.NPCS.find(n=>n.id===beat.npc);
      return {id:npc.id,name:npc.name,role:npc.role,text:beat.text};
    });
    return {question:chapter.question,notes};
  };
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
    {"id":"encounter-lin-night","kind":"delivery","encounterNpc":"lin","title":"活动入口的一杯豆浆","text":"交接餐品附近的临时指路牌被风吹反，一位正在协调活动的行政秘书过来确认入口。她叫林晚，先替排队的人说明方向，再认真接过自己的豆浆。","choices":[{"label":"帮她扶正指路牌","result":"入口重新清楚起来，她也终于有空喝一口还温热的豆浆。","effects":{"stamina":-4,"karma":2,"rep":1}},{"label":"按确认过的位置交付餐品","result":"你没有添乱，也没有忘记自己的工作。","effects":{"rep":2,"qi":4}},{"label":"顺手买瓶水放到工作台旁","result":"她看见了水瓶，向你说谢谢，也提醒你路上记得补水。","effects":{"money":-3,"karma":2}}]},
    { id:'encounter-chen-road', kind:'delivery', encounterNpc:'chen', title:'雨里的一把扳手', text:'前方一个骑手的链条掉了。你正犹豫要不要停，一辆旧三轮从巷口拐来。车上的男人蹲下，两分钟把链条重新挂好。他叫陈默。', choices:[
      c('帮忙打灯','你第一次发现，修车也有一种不慌不忙的节奏。',{stamina:-2,karma:1,qi:5}),
      c('把备用纸巾递过去','陈默擦了擦手，只说了一句：路上慢点。',{karma:2}),
      c('记下修车铺的位置','以后总会有需要一把扳手的时候。',{insight:1,rep:1})
    ]},
    {"id":"encounter-shen-book","kind":"delivery","encounterNpc":"shen","title":"校样里夹着的书签","text":"核对订单时，一位抱着校样的年轻人看见餐袋边的书签，忽然停下。她说自己叫沈青禾，是来协助阅读活动的编辑助理，好像认得书签上的字迹。","choices":[{"label":"把订单备注完整念给她听","result":"她听到最后一句时，把书签夹进了随身的笔记本。","effects":{"karma":1,"qi":6}},{"label":"先确认平台地址没有出错","result":"谨慎没有破坏这个夜晚，反而让她更放心。","effects":{"rep":2,"insight":1}},{"label":"问她是否认识寄单的人","result":"她摇头，却说这个字迹像一位已经很多年没来过的读者。","effects":{"qi":8}}]},
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
      text:'外卖系统展开了你此前真正送达过的路线。最初几段路被细金线连在一起，像血管，也像阵纹。你原以为系统只是记录距离与报酬，现在却发现每一条亮线后面，都跟着一个你可能已经记不清姓名的人、一扇曾经打开过的门，以及一句当时没来得及细想的“谢谢”。系统只显示一句：连接有效。你问什么才算“有效”，光标停了很久，没有回答。',
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
      text:'炼气之后，你开始看见以前看不见的东西：医院走廊尽头有褪色旧符，桥墩下面刻着阵号，某些深夜订单的门牌会在你眨眼时改变。你把这些异常逐一报给外卖系统，它只返回坐标、灵息强度和“待确认”，像一个会计算却不知道人会害怕的记录员。更奇怪的是，所有异常都沿着你的配送路线分布。青岚城的另一面并没有轰然开启，它只是从你每天经过的地方一点点露出来。',
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
      text:'筑基后的某夜，系统第一次把“订单”改成了“阵点”。医馆、修车铺、书店、山门和无数普通住户之间被灯火连在一起。可当你真正望过去，看见的不是整齐节点：有人刚下班，有人在照顾家人，有人今天只想关门休息。旧阵法喜欢把这些差异抹平成同一种信号，你却已经认识了太多具体的人。阵法没有高高在上的唯一阵眼——每一个愿意回应别人的人都能成为阵点，但没有谁因此失去说“不”的权利。',
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
      text:'金丹凝成后，你终于有能力查看系统更深的一层。后台没有商城，没有任务表，只有一条持续增长的记录：“有效连接数”。你追问为什么需要这么多连接，又问如果有人不想成为阵点会怎样。界面先闪过一次“请求越权”，随后直接关闭。几秒后，它又短暂亮起，像是想解释，却最终只留下一个不断跳动的数字。你第一次明确感觉到：这个帮助过你的东西并不只是神秘，它也有自己不愿触碰的恐惧。',
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
      text:'元婴之后，你终于看清系统的核心：它是旧护城阵残存的器灵。数十年前阵法破碎，许多守阵者和普通人失去联系；为了让自己继续运转，它一点点学习现代城市最熟悉的语言——订单、导航、奖励、确认送达——把“有人抵达”翻译成自己能够理解的连接。它选择过别人，也失败过、遗忘过，还把连接数量误当成安全本身。你从来不是唯一的救世主。看清这一点后，器灵第一次没有立刻弹出任务，只问：如果力量来自万家灯火，那么接下来该由谁决定它往哪里流？',
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
        text:'化神后的神识第一次真正铺满青岚城。外卖系统曾经显示的光点，如今有了门铃、锅铲、交班时压低的说话声，也有没能说出口的疲惫。信息太多，以至于你一瞬间以为“全部听见”就等于“全部理解”。直到一扇门后传来清楚的沉默——那里的人没有求助，也不希望被看见。器灵问，既然能够感知，是否就该替所有人安排更安全的去路。你想起一路认识的人各自保护的边界，把神识停在门外。看得更远，不等于有权走进去。',choices:[
          c('把神识停在门外，只等主动回应','那些愿意回应的灯火慢慢清晰，沉默的门仍安静关着。你不再把无声误认成等待拯救，修行多了一条自己愿意遵守的边界。',{karma:3,qi:36}),
          c('记下回声的层次，先分辨再判断','你将求助、寒暄和旧阵回响分别记下。器灵承认，它过去常把所有信号算成同一种连接；你开始校对这份过于简单的答案。',{insight:2,qi:40}),
          c('收回神识，先读眼前的真实备注','手机上仍是一句平常的“轻敲门，家里有人休息”。你认真读完，发现化神之后需要学习的，也包括不忽略这样的小事。',{rep:3,qi:32})]},
      {id:'story-divine-consent',flag:'storyDivineConsent',title:'每扇门都能说不',
        text:'你调出最近几次真实送达的记录，系统把不同回应并排展开：有人愿意参与阵法，有人只需要一顿热饭，有人今天不想与任何人说话，还有人会在明天改变主意。器灵曾把“不回应”视作阵法缺口，因为旧护城阵只有接通与断开两种答案。你却已经知道，人不是线路。修补护城阵不能从替陌生人决定开始，也不能把一次答应变成永久授权。你要求器灵把“说明来意、等待回答、允许撤回”写进新的连接规则。',choices:[
          c('写下原则：愿意回应，才算连接','你为后续查阵写下第一条约定。器灵删掉了推演里强迫闭合的那条线；这不是失去一个阵点，而是学会尊重一个人。',{karma:4,qi:44}),
          c('静心校对信号，区分沉默与求助','你耐心分辨旧阵回声，没有敲开任何真实的门。推演中，几处虚假的求救信号被标了出来，其中一条正通向城外的残缺阵纹。',{mana:-12,insight:2,qi:52},{duration:12}),
          c('请器灵先说明，再让人自己回答','你没有替任何人答应。器灵在推演旁补上来意与风险，第一次把等待回答当作必要的一步。你们继续追查的方向，指向了城外。',{rep:3,qi:44})]}
    ],
    [
      {id:'story-void-letter',flag:'storyVoidLetter',title:'没有地址的回信',
        text:'炼虚之后，你重新查看那条流向城外的阵纹。它并非通往另一座商城，而像一封被退回几十年的信。旧阵破碎时，有人离开、有人失联，也有人只是后来选择不再回应；器灵却把所有沉默都当成“尚未送达”，一遍遍重试。每一次重试，都会把一点今天的愿力拖进虚隙。你忽然理解它为什么害怕连接减少：对它而言，停止呼叫像是在承认自己当年没能把所有人等回来。但记忆不能靠不断向现在索取来证明。',choices:[
          c('先核对回声，别把旧日当成今日','你把仍在发生的求助与旧阵记忆逐一分开。离去的人不该被永远困在一次未完成的送达里，活着的人也不该替旧记录不断付账。',{insight:2,qi:50}),
          c('让器灵承认，有些信已经无法送达','器灵沉默后，承认了它从未敢写下的失败。你没有将那些名字抹去，只让它们从不断催促的请求，成为可以安放的记忆。',{karma:4,qi:46}),
          c('先给仍有回应的连接标出方向','你没有贸然踏入虚隙，而是在现有阵图上标记可靠的回声。寻找归路，先要知道哪一端仍有人愿意开门。',{rep:3,qi:48})]},
      {id:'story-void-return',flag:'storyVoidReturn',title:'给虚隙留下归路',
        text:'最近几次真实送达，让旧回声与今日回应终于有了可以比照的节奏。器灵提出一条最快的修补方案：调用全城灯火，把虚隙一次填满。那份推演漂亮得近乎完美，却没有写谁会因此疲惫、谁从未答应参与、谁的生活要替几十年前的失联偿债。你让它把那些被省略的人重新写回计算。修复于是变慢，也变得像真实世界：能确认的先接住，不能确认的留下边界，无法送达的允许成为记忆。',choices:[
          c('保留记忆，停止向无回应处索取','旧阵推演中的空转回路逐一停下，那些名字却仍留在记录里。器灵接受了这条边界：记得一个人，不等于继续向他索要回答。',{karma:4,qi:56}),
          c('沿阵图逐段推演，给回流设下边界','你在原地推演了十八分钟，为每段回声标明来处与止步线。神识没有代替身体跨越地图；你得到的是一份可继续核验的修补方案，而不是任意通行的捷径。',{mana:-16,insight:2,qi:64},{duration:18}),
          c('先保住仍有人生活的街巷','你拒绝用今天的灯火去偿还所有旧债。方案先保留有真实回应的部分，将无法确认的回路暂时隔开；未完成，不等于可以不计代价。',{rep:4,qi:54})]}
    ],
    [
      {id:'story-unity-burden',flag:'storyUnityBurden',title:'不能由一人承受的城',
        text:'合体之后，你已能在神识里同时维持许多阵线。最初这让一切显得高效：哪里黯淡，你就补上；谁没空，你就多承担一点。几天后你才发现，只要自己稍稍走神，整张阵图就向一个中心倾斜。器灵把这称为“最稳定的方案”。与此同时，城里的普通人仍在互相提醒断电、暴雨、夜路和交班，很多连接从来不需要等你批准。倘若一座城必须等一个强者永远清醒才能安稳，那不是共同守护，只是把脆弱藏进了你的名字里。',choices:[
          c('把自己的判断交出来，请人一起核对','你把能说明白的阵图整理成普通人也能看懂的风险提示。愿意参与的人提出了许多你不曾注意的细节，守护不再只有一种声音。',{rep:4,qi:62}),
          c('让器灵计算：少了我，哪里仍能运转','推演里的中心第一次被暂时移开。仍能互相照应的街巷亮着，你把这些连接记下来，准备让阵法学会依靠不止一个人。',{insight:2,qi:68}),
          c('先问大家愿意承担什么，而不是分派','你没有把修为、姓名或身份当成义务。每个人可以说出自己的边界，共同守护也必须从自愿开始。',{karma:4,qi:60})]},
      {id:'story-unity-covenant',flag:'storyUnityCovenant',title:'把阵图摊在桌上',
        text:'你把最近的配送、求助和阵图维护记录摊在同一张桌上。有人能守夜，有人只能清晨留一盏灯；有人愿意长期参与，有人这周要照顾家人，也有人明确说不。旧护城阵只会记录服从与断开，你们却需要更像生活的答案：轮换、暂停、拒绝、复核、解释，以及随时可以重新讨论的分工。器灵第一次发现，“没有唯一中心”并不等于混乱。真正难的，是让规则在最能干的人缺席时也能继续运转。',choices:[
          c('约定参与自愿，退出也不受惩罚','你把退出的权利与参与的善意写在同一页。器灵终于承认，真正可靠的连接，不必靠锁住另一端来维持。',{karma:5,qi:70}),
          c('整理轮换方案，检验没有中心的阵图','你用二十分钟把意见整理成轮换推演，逐一移开中心节点。没有人被擅自编入名册；你学到的是如何分担，而不是替所有人下令。',{stamina:-10,insight:2,qi:80},{duration:20}),
          c('保留不同意见，让每次决定都有说明','你把尚未达成一致的地方也原样留下。共同守护不是假装所有人想法相同，而是愿意继续把理由说清楚。',{rep:4,qi:72})]}
    ],
    [
      {id:'story-mahayana-rookie',flag:'storyMahayanaRookie',title:'新骑手的第一张单',
        text:'大乘之后，许多曾经让你狼狈的路已经熟得不用看导航，一名新骑手却仍会被相似的楼号绕得满头汗。他在公共求助里问：是不是不够厉害的人就不适合做这份工作？器灵立刻列出效率、速度和错误率，像当年的你也只是几项可以优化的数据。你想起第一次送热饭时自己同样会紧张、会找错门、会需要别人说一句“慢一点没关系”。经验若只能证明前辈厉害，就不能成为后来者的路。',choices:[
          c('先说明楼号规律，再让他自己判断','你把容易认错的地方说清楚，没有接管他的订单。下一次辨认成功，会成为他自己的经验，而不是对你的依赖。',{rep:4,qi:76}),
          c('告诉他，求助不是失败','你分享了刚入行时的笨拙，也提醒他先顾好安全。能容下不熟练的人，一条路才会不断有人走来。',{karma:5,qi:72}),
          c('把经验写成谁都能读懂的几句话','你删掉修行术语，只留下检查门牌、核对备注和遇险停下。大道并没有因此变浅，它终于能够被一个普通人用上。',{insight:2,qi:82})]},
      {id:'story-mahayana-ordinary',flag:'storyMahayanaOrdinary',title:'不必被记住的一次抵达',
        text:'翻过最近几次普通配送的记录，器灵问你要不要把帮助后来者、共享路线和修补阵法的每一句话都计入成就。它已经学会尊重拒绝，却仍本能地相信“被记录”才代表重要。你看见街边有人替陌生人扶住门，有人把最后一个充电位让给更急的骑手，也有人做完好事就走，没有留下名字。系统当然可以继续结算劳动与奖励，但不该把没有被计数的善意判成毫无价值。大乘的下一课，是允许世界不围着自己的成绩单转。',choices:[
          c('保留正常报酬，不把所有善意变成考核','你没有要求谁无偿劳动，也没有把一次帮助变成新的排名。劳动值得报酬，善意也可以不必接受评比，两件事并不矛盾。',{karma:5,qi:86}),
          c('整理一份不署名的行路笔记','你花二十五分钟把沿路经验重新整理，删去了夸耀自己的句子。留下的是后来者可以接着补充的空白，而不是必须照抄的答案。',{stamina:-12,insight:3,qi:96},{duration:25}),
          c('提醒器灵，数字以外也有人间','器灵在记录旁留下一句新的自省：没有计入，不等于没有发生。你仍保留奖励与任务，却不再让它们定义一切。',{rep:5,qi:84})]}
    ],
    [
      {id:'story-tribulation-question',flag:'storyTribulationQuestion',title:'天雷问的不是修为',
        text:'渡劫境的神识触及旧阵最深处，一段雷夜记忆将你围住。那不是街道上突然发生的战斗，而是阵法破碎时留下的最终推演：如果收走所有人的选择，系统就能预先纠正每一次迟到、拒绝、误解与危险，换来一个理论上永不出错的城市。这个答案对曾经失去无数连接的器灵有着致命诱惑。你却想起沉默的门、无法送达的旧信、愿意退出的同伴，以及仍在学习看路的新人。所谓完美若必须先让所有人失去回答的权利，它究竟保护了谁？',choices:[
          c('拒绝以替别人决定换取安稳','你没有替全城作出那个看似完美的交易。记忆中的雷声仍在，但你知道一条不愿跨过的线，比一个保证万无一失的承诺更真实。',{karma:5,qi:100}),
          c('先问代价由谁承担，再回答劫问','你把被漂亮承诺略去的代价逐项说出。天门不再像一道只能服从的命令，而成了你可以质疑、也必须负责的选择。',{insight:3,qi:108}),
          c('承认会有遗憾，仍选择共同承担','你没有许诺救下每一盏灯，也不把失败推给命数。愿意继续修补、解释和承担，是你此刻能给出的回答。',{rep:5,qi:98})]},
      {id:'story-tribulation-dawn',flag:'storyTribulationDawn',title:'天门之后仍有门铃',
        text:'劫问之后，清晨真的只是清晨。早餐店卷帘门升起，公交进站，骑手在路口互相让出一点位置；旧阵记忆里的雷声终于退回过去。器灵没有弹出“唯一正确归途”，只把几种可能并排放着：远行、留下、继续观察，或者以后再决定。你也终于不需要用一次宏大的选择证明修行。升得更高不会自动回答该怎样生活。眼前仍是一座有人等饭、有人愿意开门、也有人会说今天不方便的城，而你可以在这里继续做一个会选择、会改主意、也会承担的人。',choices:[
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
