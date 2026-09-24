/* 固定五宗剧情与关系派生；AI 不生成资格、宗门资源或外交结果。 */
(function(root){
  'use strict';
  const G=root.NightCourier;
  const option=(label,result,effects={},relations=[],duration=0)=>({label,result,effects,relations,...(duration?{duration}:{})});
  const edge=(a,b,delta)=>({a,b,delta});
  const t='tingyu',j='jingang',b='baicao',l='lingxiao',x='xuanwei';
  const scene=(sectId,index,title,text,choices,rank=0,completed=0,introduction=false)=>({id:`sect-${sectId}-${index}`,kind:'story',sectStory:{sectId,index},title,text,choices,rank,completed,introduction});
  G.SECT_STORIES={
    tingyu:[
      scene(t,0,'空着的阵位','陆听雨把旧阵图摊开。中心有一个被磨白的座位，旁边却没有替班名册。他说过去总觉得自己还能守一夜，直到发现年轻弟子学会的第一件事，也是把求援咽回去。金刚门愿意来帮忙，却提出必须先写清轮换办法。你得到的第一个门内问题不是如何增强阵力，而是谁能在疲惫时离开阵位。',[
        option('先写轮值，把退下的位置留出来','轮值表贴在山门里。体修弟子第一次能在开阵前知道自己何时交班。',{qi:8},[edge(t,j,8)]),
        option('亲自试守，记录真正的承压变化','你在阵边陪守十分钟，把灵力变化与身体感受分开记录。陆听雨接过记录，没有让你继续硬撑。',{mana:-6,qi:14},[edge(t,j,5)],10),
        option('请玄微阁先复核阵图','你们暂不增加守阵时长，先标出未经验证的旧节点。玄微阁愿意提供一份公开校核本。',{qi:6},[edge(t,x,7)])]),
      scene(t,1,'雨夜分灯','大雨将两处阵眼同时压暗，剑宗送来命令，要求先保住会馆周围的主干。另一边是没有修士常驻的旧街。陆听雨不替你选，只说阵法的方便不应决定谁先被照顾。你知道两处都救有可能让所有人更疲惫，什么也不决定也同样是一种决定。',[
        option('先护旧街，再向剑宗说明理由','旧街恢复了照明，剑宗代表认为你绕开了统一调度。陆听雨把这次分歧公开记下。',{karma:2,qi:12},[edge(t,l,-6),edge(t,j,4)]),
        option('分段点亮，请药修接住轮换','你投入灵力把开阵分为两段，让药修安排守阵人的休息。效率并不漂亮，但没有人被默默耗尽。',{mana:-8,qi:18},[edge(t,b,7),edge(t,l,3)],12),
        option('先服从调度，保留异议与补救名单','主干先稳定下来，你没有把未受照应的住户写成已经解决。剑宗答应下一轮补救由听雨观负责。',{rep:1,qi:10},[edge(t,l,5),edge(t,j,-3)])],0,1),
      scene(t,2,'一城同阵','玄微阁送来新的节点观测。照它修改，阵法会更稳定，却要长期记录住户的作息。陆听雨问你，能让阵运转得更好，是不是就足够构成收集一切的理由。记录者也有顾虑：少收信息，就必须承认会有无法提前发现的风险。',[
        option('只采集自愿公开的阵点信息','你们删去住户名册，接受观测范围缩小。玄微阁也把拒绝与退出写进记录规则。',{qi:20},[edge(t,x,8)]),
        option('以匿名总量替代个人轨迹','你们花十分钟做对照，不保留能还原个人行程的细节。阵图留下空白，也留下解释。',{mana:-10,qi:26},[edge(t,x,6),edge(t,l,3)],10),
        option('暂停新阵，先修稳现有节点','你选择慢一点。剑宗质疑进度，守阵弟子却终于有时间把故障说明补完整。',{qi:18,rep:1},[edge(t,l,-4),edge(t,j,4)])],1,3),
      scene(t,3,'旧阵新约','你升为亲传后，陆听雨把中心阵钥放在桌上。他没有说传给你，而是问你准备把钥匙交给多少个人。剑宗希望由最强者保管，玄微阁希望每次动用都能追溯，金刚门只关心发生意外时谁能真正接手。你开始理解，一份传承也可能是一种不该被继承的负担。',[
        option('分钥轮值，建立可替代的守阵人','几位守阵人各持一段钥纹，任何一人退出都不会让全阵停摆。听雨观不再只等一个人回来。',{qi:32},[edge(t,j,8),edge(t,x,6)]),
        option('保留主钥，但让每次使用可复核','主钥仍在本宗，使用理由却必须由两宗见证。剑宗接受了这个不够集中的折中。',{qi:30},[edge(t,l,6),edge(t,x,3)]),
        option('先设一年试约，不承诺永不出错','你把复议日期写在首条，承认门规也需要修改。药修代表主动补上守阵人的休养周期。',{qi:28,karma:2},[edge(t,b,7)])],2,10)
    ],
    jingang:[
      scene(j,0,'先卸下沙袋','练功坪上一位弟子还在负重，他的手指已经握不稳。教习看见你，以为你会夸他能坚持；你却看见旁边那只还没打开的饭盒。教习沉默片刻，把入门帖递到你面前，说金刚门学的不是感觉不到疼，而是在还能判断时知道什么时候停。',[
        option('先让他吃饭，再听门规','教习收回了计时牌，认真讲起负重与恢复。你获得引荐，没有被替你决定入宗。',{qi:6,karma:1}),
        option('问体修是不是只能靠苦熬','教习说筋骨可以练，伤病不应被当作勋章。他在引荐帖背面写下循序渐进四字。',{qi:8}),
        option('请他说明求援和退出的规则','你听到了完整的休养与离门规则，才收下引荐。门里没有要求你交出外卖箱。',{rep:1,qi:5})],0,0,true),
      scene(j,1,'谁来接最后一棒','金刚门答应替百草谷搬运公用药箱。最快的弟子总被排在最重的一段，他说自己不介意，直到看见其他人已准备收工。药师执事担心药箱延误，教习担心弟子以为轮换是在否定他的能力。你被请来重新划分这条短短的接力路。',[
        option('把重段拆开，所有人轮流接','完成得慢了一点，药箱与人都平安到了。百草谷把配药交接也改成了轮换。',{qi:12},[edge(j,b,8)]),
        option('承担一段，记录负重差异','你消耗体力完成十分钟演练，把不同体格能承受的重量列清。强者不再默认承担全部。',{stamina:-8,qi:18},[edge(j,b,5)],10),
        option('先按旧约交付，再议下次分配','药箱按时交齐，最重一段仍由老手承担。你没有将这次交付写成制度已经改善。',{rep:1,qi:10},[edge(j,b,3),edge(j,t,-2)])],0,1),
      scene(j,2,'剑锋与拳骨','剑宗弟子在合练中说体修只会硬扛，金刚门有人当场摔下护具。真正演练的目标本是疏散出口，不是分出哪个宗门更配站在前面。教习让你主持下一轮，并提醒：安全的演练不是躲开差异，而是不拿同伴的伤证明自己。',[
        option('把胜负改成全员撤离的达成条件','剑修开路，体修护住队尾。双方仍不服彼此的说法，却承认这一轮谁也不能缺席。',{qi:20},[edge(j,l,12)]),
        option('分别展示强项，再交换岗位','你花十二分钟组织换位，轻快的剑步不适合每段重载，坚固的身躯也不能提前发现所有险情。',{stamina:-10,qi:28},[edge(j,l,9),edge(j,x,5)],12),
        option('取消合练，各自先完成基础训练','争执暂时停下，双方没有受伤，也没有解决旧账。教习接受了保守的决定。',{qi:18},[edge(j,l,-5)])],1,3),
      scene(j,3,'不动不是不退','你准备主持守关考核。旧规则要求守到最后一刻，百草谷提供的恢复报告却写明长期损伤。部分师兄认为改规则是在抹去他们过去的苦，药师问这些苦是否必须再落到新人身上。你站在练场中间，第一次觉得退一步可能比站稳更需要力气。',[
        option('以护住同伴和完整交班为考核','旧师兄先不服，后来主动教新人如何卸力。金刚门依旧要求坚韧，却不再要求把疼痛藏起来。',{qi:32},[edge(j,b,8),edge(j,t,6)]),
        option('保留极限项目，但设置明确停训线','极限仍是可选挑战，药师拥有叫停权。剑宗对这套有边界的考核表示认可。',{qi:30},[edge(j,b,5),edge(j,l,5)]),
        option('先记录两套结果，试行后再改','玄微阁加入复核，不让印象替代真实恢复情况。决定被推迟，但推迟有了截止时间。',{qi:28,rep:1},[edge(j,x,8)])],2,10)
    ],
    baicao:[
      scene(b,0,'丹名之前是药性','药庐里没有摆出最贵的丹药，只有一排写着失败原因的空瓶。执事看见你的外卖箱，问你愿不愿意先核对一批普通药签。有人来求能立刻变强的秘方，他却说谷中先教辨识与负责；没有丹方、药鼎和材料，再响亮的功法名字也不能凭空开炉。',[
        option('从核对药签开始了解百草谷','你核对的是公开标签，不是尚未得到的丹方。执事递来引荐帖，提醒正式入宗仍需自己选择。',{qi:6}),
        option('先问开炉失败由谁承担损耗','执事把失败与交接规则摊开，连门内练习也不隐去成本。你带着清楚的边界收下引荐。',{qi:5,rep:1}),
        option('问急用药和门内收入怎样平衡','他承认从没有容易的答案。引荐帖上没有济世英雄的称号，只有愿意一起面对难题的邀请。',{qi:5,karma:1})],0,0,true),
      scene(b,1,'一炉药的去处','应急储备只够补一处缺口：金刚门的伤员补给，或剑宗付费预订的下一轮护路用丹。两边都不是无关紧要的人。药师执事不愿用免费救急掩盖长期成本，也不愿把付款顺序当作唯一的轻重。',[
        option('先保应急，公开解释延期与损耗','金刚门记住这次支援，剑宗对延期不满。谷中没有把损耗抹去，而是留待共同议事时核算。',{qi:12},[edge(b,j,8),edge(b,l,-6)]),
        option('分批安排，亲自协助交接说明','你花十分钟把已能提供和暂时缺少的部分逐一说清。双方都让出一点安排，没有人被承诺不存在的丹药。',{stamina:-6,qi:18},[edge(b,j,5),edge(b,l,5)],10),
        option('先履行预约，再申请临时互援','剑宗照约拿到补给，并被要求参与下一批应急储备。金刚门仍需等待，旧盟约因此承受压力。',{qi:10,rep:1},[edge(b,l,7),edge(b,j,-5)])],0,1),
      scene(b,2,'不能省略的失败','新弟子整理药炉记录时只留了成丹的几页。失败被删去后，看起来每次试炉都接近完美，后来者却会低估同样配伍的风险。玄微阁请求保留原始记录，剑宗采购者担心公开失败会动摇信心。你要决定如何把不完美交给别人看。',[
        option('保留完整记录，同时说明适用边界','失败没有被写成耻辱，成功也不再被当成保证。玄微阁愿意一起整理可复核的记录。',{qi:20},[edge(b,x,8)]),
        option('内部完整保存，对外给出核实摘要','你花十二分钟把隐私与配伍信息剥离，只公布经复核的摘要。剑宗接受了没有夸大成效的说明。',{mana:-8,qi:26},[edge(b,x,5),edge(b,l,6)],12),
        option('暂停展示，先让药师重新复核','发布延期，门内少了一次招徕声势的机会。执事同意先把自己尚未弄懂的地方弄清。',{qi:18},[edge(b,l,-3),edge(b,t,4)])],1,3),
      scene(b,3,'药圃不属于账册','五宗希望百草谷扩大应急药圃。能多炼丹当然好，却意味着固定采集、护送和养护的负担。药师担心每次危机都变成药修无偿兜底，体修也不愿再次被默认负责搬运。你需要写出的不是更漂亮的产量，而是谁愿意持续承担哪一部分。',[
        option('按实际能力分担养护与护送','五宗的责任被写成具体轮次，不能只领取补给。听雨观和金刚门先签下愿意承担的部分。',{qi:32},[edge(b,j,7),edge(b,t,7)]),
        option('设共同储备，正常供应保留成本','应急与常规账目分开，任何一宗都不能凭强势先占储备。剑宗把采购承诺改为实付保障。',{qi:30},[edge(b,l,8)]),
        option('先缩小范围，保证承诺能够兑现','药圃没有立即翻倍，玄微阁却记录了第一份可持续的维护计划。少一些承诺，多一些可完成的交接。',{qi:28,karma:1},[edge(b,x,7)])],2,10)
    ],
    lingxiao:[
      scene(l,0,'入门先学收剑','剑宗会馆里的第一堂课没有锋芒。长老让弟子一次次停在木靶之前，先确认身后的退路。他知道外界把剑宗看作五宗之首，也知道这个名次容易让弟子误以为更强就有权替所有人决定。引荐帖压在木剑下面，等你问清自己的方向。',[
        option('问什么时候不该出剑','长老说这比记住起手式更重要。你得到引荐，入宗的决定仍留在自己手中。',{qi:8}),
        option('先了解剑修与日常行路的联系','长老教你观察重心，不许在街巷以行人试招。你明白身法不能代替道路与谨慎。',{qi:6,rep:1}),
        option('说明自己不会放弃骑手生活','长老收起一句专心修行的劝告，改问你能安排哪些时间。引荐不要求你断掉生活。',{qi:5,karma:1})],0,0,true),
      scene(l,1,'剑宗的旧欠条','药庐送来一张护路补给旧账，署名的人已经调走。有人说账不是今天弟子欠的，不必理会；有人怕承认旧账会折损五宗之首的体面。长老让你找出原始约定，而不是先选一个替宗门辩护的说法。',[
        option('承认未履行的部分，提出分期责任','账没有凭空变成你的个人支出，而被重新登记为会馆责任。百草谷愿意恢复更细的交接。',{qi:12},[edge(l,b,10)]),
        option('请两宗共同核对争议项','你花十分钟逐项区分已付、未付与证据不足。双方仍有分歧，但不再靠声势争输赢。',{stamina:-6,qi:18},[edge(l,b,6),edge(l,x,3)],10),
        option('先履行无争议部分，暂缓其余','补给合作继续，百草谷仍保留对旧账的追问。你没有把暂缓写成事情已了结。',{qi:10},[edge(l,b,3)])],0,1),
      scene(l,2,'赢下演练之后','剑宗以最快速度穿过练阵，却把身后的药箱和伤员标记留在原地。教习宣布胜出时，金刚门弟子问那几个标记算不算人。你已经有资格修改下一场演练目标，也知道有些同门会把这看成替别宗说话。',[
        option('把全员抵达加入胜负条件','锋芒终于有了需要保护的方向。金刚门愿意重开合练，但没有因此忘记过去的轻视。',{qi:20},[edge(l,j,12)]),
        option('保留速度项目，另设完整护送项目','双方有了可比较又不混淆的目标。听雨观补上阵地守护的约束，避免一项能力吞没所有评价。',{qi:18},[edge(l,j,6),edge(l,t,6)]),
        option('先让弟子亲自换位再讨论','你投入灵力主持十分钟换位演练，看到最快的人开始等待队尾。争论第一次有了共同经历。',{mana:-10,qi:26},[edge(l,j,9)],10)],1,3),
      scene(l,3,'最强者的空座','五宗议事准备把主座留给剑宗。长老问你是否愿意主持，旁人却已替你写好统一调度的章程。你知道分散决定可能更慢，集中决定也可能忽略不肯开口的人。最难的不是坐上去，而是在拥有发言权后仍允许别人说不。',[
        option('保留主持，不占最后决定权','剑宗主持议事，各宗保有异议与退出的明文权利。听雨观与玄微阁开始愿意交出可公开的资料。',{qi:32},[edge(l,t,10),edge(l,x,8)]),
        option('只在紧急时集中调度，事后复核','你把紧急的定义和失效时刻写清，避免临时权力成为惯例。药修要求保留救急优先，得到答复。',{qi:30},[edge(l,b,6),edge(l,t,5)]),
        option('先由五宗轮流主持一年','效率未必最好，但每一宗都会经历倾听和被质疑。体修代表先把自己的承诺写上桌。',{qi:28,rep:1},[edge(l,j,8),edge(l,x,5)])],2,10)
    ],
    xuanwei:[
      scene(x,0,'看见之后先问','静思阁里挂着一张空白的观察表。录事说，初学神识的人总想把空格填满，甚至把猜测写得比事实更完整。他没有让你窥探书店里的读者，只请你分辨自己的呼吸和窗外的声响。知道得更多，不意味着可以不经询问地知道别人。',[
        option('先学区分观察与推测','录事在引荐帖上写下暂不确定四字，说这不是无知，而是可靠的起点。',{qi:6}),
        option('询问哪些事情不能用神识探查','你听完隐私与边界的门规，才接过引荐。力量不会自动授予他人生活的通行权。',{qi:5,karma:1}),
        option('说明自己更需要安定心神','录事说修神识不只有查察，也包括让疲惫的人停下纷乱。你可以先考虑，再决定是否入阁。',{qi:5,rep:1})],0,0,true),
      scene(x,1,'一条没有证实的线索','一份异常记录指向金刚门的练功时间。阁内有人准备发出警示，却还没排除旧观测器漂移。金刚门已经听到风声，认为玄微阁只会在远处评判。录事把原始记录放在你面前，等你决定先向谁说明什么。',[
        option('先标明未证实，再请金刚门共同复核','体修弟子看到自己也能参与解释，而不是只被观察。原先僵硬的关系稍微松动。',{qi:12},[edge(x,j,10)]),
        option('投入灵力复测，暂缓外发','十分钟对照显示旧仪器确有漂移。你记录了自己的不确定，没有把纠错写成从未犯错。',{mana:-8,qi:18},[edge(x,j,6),edge(x,t,3)],10),
        option('先通知可能受影响者，明确保留疑点','警示给了人准备时间，也让金刚门承受了一次尚未定论的怀疑。你保留后续更正责任。',{qi:10,rep:1},[edge(x,j,-4),edge(x,b,4)])],0,1),
      scene(x,2,'剑宗来取原册','剑宗希望把所有观察集中到会馆，理由是应对危险不能等待。部分记录涉及自愿协助者的身份，他们只同意被玄微阁保管。录事并不认为所有合作都危险，却提醒你，答应一个强宗不能代替问过每一位当事人。',[
        option('只交经同意的部分与匿名摘要','剑宗认为资料不够完整，但第一次得到了清楚的授权边界。分歧没有消失，合作仍能开始。',{qi:20},[edge(x,l,8)]),
        option('请剑宗到场联合查验，不带走原册','你花十二分钟主持共同复核，记录每次查询理由。剑宗看见了约束，阁内也接受了适度开放。',{mana:-10,qi:26},[edge(x,l,10),edge(x,t,3)],12),
        option('拒绝这次交接，另设紧急联络人','原册留在阁内，剑宗对此不满。你没有只说不合作，而是留下可在紧急时找到的负责人。',{qi:18},[edge(x,l,-5),edge(x,b,4)])],1,3),
      scene(x,3,'万念之外仍有空白','你完成一次长时间入定，终于能分清许多彼此重叠的回声。有人期待你补齐整座城的盲区，录事却问，你准备如何记录自己仍然看不见的地方。玄微阁最容易犯的错误不是无知，而是让别人以为它无所不知。',[
        option('把盲区公开，让其他宗门补位','听雨观和金刚门按各自所长补上巡查。阁中少了神秘感，却多了能互相提醒的人。',{qi:32},[edge(x,t,8),edge(x,j,8)]),
        option('给每条结论标明证据与有效期限','剑宗获得了更容易使用也更容易被推翻的判断。信息不再因为出自玄微阁就永远正确。',{qi:30},[edge(x,l,8)]),
        option('缩小承诺，只维护可持续观测','百草谷赞同把有限精力留给可靠记录。你没有成为知道所有事的人，却开始成为知道自己不知道什么的人。',{qi:28,karma:1},[edge(x,b,7)])],2,10)
    ]
  };
  G.SECT_COUNCILS=[
    {id:'sect-council-0',kind:'story',sectCouncil:0,title:'五宗议事 · 药路之争',realm:2,deliveries:18,known:3,
      text:'几宗把最近的争执放在同一张桌上：谁先获得护送，谁承担试错，谁能决定延误是否可以接受。你不是代替所有人作决定，而是提出一个愿意让别人审阅的安排。',choices:[
        option('优先应急，公开成本与轮值','体修与药修接受了明确的应急优先，剑宗担心常规护路被挤压。安排生效前保留复议条款。',{qi:20},[edge(j,b,8),edge(b,l,-4)]),
        option('按承诺分配，再预留公共缓冲','预约不被随意推翻，各宗共同留出紧急余量。余量不够时仍须面对选择，而不是隐去代价。',{qi:18},[edge(b,l,8),edge(t,b,4)]),
        option('先做一轮联合交接，核实瓶颈','你们用十五分钟重排交接，发现问题不全在资源数量。两宗第一次承认对方并非故意拖延。',{stamina:-8,qi:26},[edge(j,l,8),edge(b,x,5)],15)]},
    {id:'sect-council-1',kind:'story',sectCouncil:1,title:'五宗议事 · 阵钥与原册',realm:3,deliveries:30,known:4,
      text:'联合守城需要阵钥、护路能力和观测资料，三者各在不同宗门手里。剑宗主张集中，听雨观担心一处失误拖垮全城，玄微阁坚持记录不能脱离授权。争论终于不再是哪个宗门更强，而是谁能在错误发生时让错误停下来。',choices:[
        option('分钥授权，保留各宗退出与接替','协作速度慢一些，却不会因一个人的判断就不可回头。弱宗也得到了明确的说话位置。',{qi:28},[edge(t,l,8),edge(x,l,8)]),
        option('设限时总调度，紧急期结束即失效','集中权力被限定在明确事件内，结束后共同复核。剑宗接受强者也需要留下可撤回的权限。',{qi:26},[edge(l,j,6),edge(l,b,6)]),
        option('先建立双向核查，不移交全部控制','你们花十五分钟检查谁能质疑谁，不把互信写成禁止追问。阵钥与原册暂留各处。',{mana:-12,qi:34},[edge(t,x,8),edge(j,x,6)],15)]},
    {id:'sect-council-2',kind:'story',sectCouncil:2,title:'五宗议事 · 同城不同道',realm:4,deliveries:42,known:5,
      text:'五宗最终要决定彼此如何共同生活。过去的争执与让步都已记入关系，不会因为一场仪式自动清零。你把共同守城、有限协作与分区自守三份方案放在桌上。任何方案都不是永远正确的答案，真正的约定是承认分歧仍可能再来。',choices:[
        {...option('签订共同守城约，设置轮值与复议','至少两对宗门已建立足够互信，联合守城有了真实基础。五宗仍各修其道，不由最强者吞并其余传承。',{qi:40},[edge(t,l,10),edge(j,x,10)]),requiresFriendlyPairs:2},
        option('保留有限协作，只共享明确同意的任务','你们没有勉强宣布结盟，却保存了护送、补给与警示的合作渠道。以后可以靠新的经历继续靠近。',{qi:36},[edge(b,l,5),edge(t,x,5)]),
        option('分区自守，保留救急互不阻拦的底线','各宗保持距离，不借名次压服别人。你要求争执不得落到等饭与求助的人身上，所有代表对此作出承诺。',{qi:34},[edge(t,l,-5),edge(j,l,-5),edge(j,b,3)])]}
  ];
  G.EVENTS.push(...Object.values(G.SECT_STORIES).flat(),...G.SECT_COUNCILS);
  const must=(ok,text)=>{if(!ok)throw new G.RuleError(text);};
  G.sectRelation=(s,a,b)=>{
    if(a===b)return 100;
    const base=G.SECT_RELATIONS.find(r=>G.sectPair(r.a,r.b)===G.sectPair(a,b));
    if(!base)return null;
    let value=base.value;
    const apply=choice=>{for(const r of choice?.relations||[])if(G.sectPair(r.a,r.b)===G.sectPair(a,b))value=G.clamp(value+r.delta,-100,100);};
    // 固定顺序派生，存档只保存已完成选项，不接受外来关系数值。
    for(const d of G.SECTS)for(const [i,pick] of (s.sectWorld?.stories?.[d.id]||[]).entries())apply(G.SECT_STORIES[d.id][i]?.choices[pick]);
    for(const [i,pick] of (s.sectWorld?.councils||[]).entries())apply(G.SECT_COUNCILS[i]?.choices[pick]);
    return value;
  };
  G.sectRelationLabel=value=>value>=50?'同盟':value>=20?'友好':value>=-9?'中立':value>=-39?'戒备':'敌对';
  G.sectFriendlyPairs=s=>G.SECT_RELATIONS.filter(r=>G.sectRelation(s,r.a,r.b)>=20).length;
  G.nextSectStory=(s,id)=>G.SECT_STORIES[id]?.[s.sectWorld.stories[id]?.length||0]||null;
  G.sectStoryBlock=(s,id)=>{
    const d=G.sectDefinition(id),entry=G.sectEntryBlock(s,id);
    if(entry)return entry;
    if(s.activeOrder)return '请先完成或明确取消已接配送。';
    if(s.position!==d.place)return `请先沿道路前往${d.name}驻点。`;
    const e=G.nextSectStory(s,id),v=G.sectState(s,id);
    if(!e)return '本宗剧情已经完成。';
    if(e.introduction)return v.invited?'引荐已经完成。':'';
    if(!v.member)return `需要先加入${d.name}。`;
    if(v.rank<e.rank||v.completed<e.completed)return `需要${d.ranks[e.rank].name}，完成宗门委托 ${e.completed} 次。`;
    return '';
  };
  G.sectCouncilBlock=s=>{
    const e=G.SECT_COUNCILS[s.sectWorld.councils.length];
    if(!e)return '五宗议事已经全部完成。';
    if(!G.featureUnlocked(s,'sect'))return '请先完成宗门引荐。';
    if(s.activeOrder)return '请先完成或明确取消已接配送。';
    if(!G.placeUnlocked(s,'market')||s.position!=='market')return '请先通过配送解锁长乐集并沿道路前往议事会馆。';
    if(s.player.realm<e.realm||s.stats.delivered<e.deliveries)return `需要${G.REALMS[e.realm].name}、累计 ${e.deliveries} 单配送。`;
    if(G.SECTS.filter(d=>G.sectState(s,d.id).invited).length<e.known)return `需要取得 ${e.known} 个宗门的引荐。`;
    return '';
  };
  G.sectStoryChoiceBlock=(s,choice)=>choice.requiresFriendlyPairs&&G.sectFriendlyPairs(s)<choice.requiresFriendlyPairs?`至少需要 ${choice.requiresFriendlyPairs} 对宗门达到友好关系。`:'';
  G.openSectStory=(s,id,council=false)=>{
    const block=council?G.sectCouncilBlock(s):G.sectStoryBlock(s,id);must(!block,block);
    const e=council?G.SECT_COUNCILS[s.sectWorld.councils.length]:G.nextSectStory(s,id);
    s.pending={...G.clone(e),id:`sect-story-${s.turn}-${s.seed}`,templateId:e.id,source:'classic',aiStatus:'skip'};
    G.log(s,`宗门剧情：${e.title}。`,'宗门');
  };
  G.finishSectStory=(s,p,index)=>{
    const e=G.EVENTS.find(e=>e.id===p.templateId&&(e.sectStory||e.sectCouncil!==undefined));
    must(e&&p.source==='classic'&&!p.delivery&&!p.npcId,'宗门剧情必须来自可信固定模板。');
    if(e.sectStory){
      const {sectId,index:stage}=e.sectStory;
      must(stage===s.sectWorld.stories[sectId].length,'宗门剧情不能重复结算或跳段。');
      s.sectWorld.stories[sectId].push(index);
      if(e.introduction)G.sectState(s,sectId).invited=true;
    }else{
      must(e.sectCouncil===s.sectWorld.councils.length,'宗际议事不能重复结算或跳段。');s.sectWorld.councils.push(index);
    }
    for(const r of e.choices[index].relations||[])G.log(s,`${G.sectDefinition(r.a).name}与${G.sectDefinition(r.b).name}关系 ${r.delta>0?'+':''}${r.delta}，当前${G.sectRelationLabel(G.sectRelation(s,r.a,r.b))}。`,'宗门');
  };
  G.validateSectStories=s=>{
    for(const d of G.SECTS){
      const done=s.sectWorld.stories[d.id],v=G.sectState(s,d.id);
      for(let i=0;i<done.length;i++){
        const e=G.SECT_STORIES[d.id][i];
        must(v.invited&&(e.introduction||(v.joinedAt!==null&&v.rank>=e.rank&&v.completed>=e.completed)),'宗门剧情缺少真实引荐、身份或委托前置。');
      }
    }
    for(let i=0;i<s.sectWorld.councils.length;i++){
      const e=G.SECT_COUNCILS[i];
      must(s.player.realm>=e.realm&&s.stats.delivered>=e.deliveries&&G.placeUnlocked(s,'market')&&G.SECTS.filter(d=>G.sectState(s,d.id).invited).length>=e.known,'五宗议事缺少境界、地点、配送或引荐前置。');
    }
    const p=s.pending||(s.activity?.kind==='choice'?s.activity.params.event:null);
    const e=p&&G.EVENTS.find(e=>e.id===p.templateId&&(e.sectStory||e.sectCouncil!==undefined));
    if(e){
      must(p.source==='classic'&&p.kind==='story'&&!p.delivery&&!p.npcId,'宗门剧情身份无效。');
      const block=e.sectStory?G.sectStoryBlock(s,e.sectStory.sectId):G.sectCouncilBlock(s);
      must(!block,block);
      must(e.sectStory?e.sectStory.index===s.sectWorld.stories[e.sectStory.sectId].length:e.sectCouncil===s.sectWorld.councils.length,'宗门待选与当前进度不一致。');
      if(s.activity?.kind==='choice')must(!G.sectStoryChoiceBlock(s,e.choices[s.activity.params.index]),'宗门选择缺少关系前置。');
    }
  };
})(globalThis);
