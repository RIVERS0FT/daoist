/* Authored chapter/territory bible. Coordinates never move published places. */
(function(root){
  'use strict';const G=root.NightCourier;
  const rows=[
    {id:'mortal',area:'青藤旧城',entry:'新旅程默认开放',
      setting:'老街、里弄、修车铺与沿江住区。先让玩家记住饭点、门牌和回家的路。',
      conflict:'房租与体力都有限，准时和体谅别人未必总能兼得。',
      beats:['接住第一张真实订单，认识住处、修车铺与途中休息；第一次失误由实际行程承担。','九次送达串起不同的门：换班、照护、临时改备注；留下热饭、门铃、旧折凳三个意象。','第十单在普通随机地址遇见老人，回答为何把饭送热；固定选择结算后才绑定外卖系统。'],
      side:['雨中认错的门牌','夜班人的晚饭','同行掉链条后的互助'],cast:['lin','chen','zhou'],
      facts:['主角是尚未绑定系统的普通骑手','生活压力与同行互助都是真实的'],
      withheld:['系统提示、兑换、绑定和修仙能力','周野的隐藏身份及未来关系变化'],
      events:['first-order','system-awakening'],exit:'第十单固定选择与配送实际结算；开启第二章，不自动领取修行委托。'},
    {id:'bound',area:'长乐西坊',entry:'完成第一章系统绑定',
      setting:'街市、作坊与旧住区交织，热闹的白天和安静的后巷形成反差。',
      conflict:'新获得的能力看似便利，却不能代替吃饭、付租和理解规则。',
      beats:['领取第一份系统委托，开始完整吐纳；用一次真实休息对照力量带来的期待。','送过的路线出现细金线，系统只回答“连接有效”；以重复走访、记笔记和询问验证异常。','完成「地图上多出来的一条线」，积累配送并突破炼气；承认尚不理解系统，先在西城核对真实走过的路。'],
      side:['集市摊主的收工餐','作坊里的两份备注','一个不计奖励的绕路请求'],cast:['shen','lu','tang'],
      facts:['外卖系统已经绑定','系统会记录抵达并提供有限兑换','修行仍须领取委托并真实耗时'],
      withheld:['器灵来源、旧护城阵真相','未经固定剧情确认的连接用途'],
      events:['story-street-vein'],exit:'完成街脉剧情、进入炼气且累计至少 12 单；开启第三章。'},
    {id:'second-city',area:'听雨北城',entry:'西城笔记剧情结算，炼气，累计 14 单',
      setting:'旧墙、学校外街巷与桥下遗迹，日常记录和异常痕迹相互重叠。',
      conflict:'看见异常不等于知道原因，旧物、噪声与危险需要分别求证。',
      beats:['同一地址在纸质记录与深夜备注中出现差异，先确保真实收餐人和路线没有被忽略。','向已经结识的研究者、编辑或修书人请教，分别记录证据与猜测；不让神识替别人编答案。','完成「城市的背面」，把零散旧符与阵号整理成残环；在结识至少两位人物后转入同行网络。'],
      side:['旧书夹页中的地址','桥下标记的年代','气象记录与异常回声'],cast:['qin','pei','cheng'],
      facts:['炼气后可以感知异常','存在旧符、阵号和残缺环形线索'],
      withheld:['残环的最终用途','系统真实身份和幕后结论'],events:['story-second-city'],exit:'城市背面剧情结算，炼气，累计 16 单，已结识两人；开启第五章。'},
    {id:'circle',area:'云汀东城',entry:'交班剧情结算，炼气，累计 18 单',
      setting:'江东新旧街区、换班通道与夜间生活设施，重点写人怎样互相接班。',
      conflict:'夜路上的互助容易变成对少数可靠者的无限索取。',
      beats:['以换班后的订单进入东城，观察医护、司机、检修与救援者各自不同的日程。','通过不同人的自愿参与建立联系；至少安排一次拒绝、一次交接和一次有人替主角接住困难。','把同行名单写成可轮换的安排而非强者排名；累计 20 单并筑基后进入第七章。'],
      side:['末班之后的热汤','检修窗口里的晚饭','临时轮值的空缺'],cast:['han','zhao','song','yue'],
      facts:['城市异常与真实配送路线相关','已有同行各有工作、休息和选择'],
      withheld:['把陌生人直接写成熟人','系统用途的最终解释'],events:[],exit:'筑基，累计 20 单；开启第七章。'},
    {id:'guardian',area:'松风西关',entry:'连续完成前章门槛，筑基，累计 20 单',
      setting:'城市西缘的工坊、社区与绿地，把维护工作和守阵放在同一张图上。',
      conflict:'旧阵习惯把人算作可用节点，现实生活却有疲惫、争执与无法出席。',
      beats:['系统首次把订单称为阵点；回访之后发现每个发光坐标都无法被简单调度。','让补给、维修与轮值互相支持，测试一个人退出后联系是否还能延续。','完成「每个人都是一个阵点」，确认力量来自真实回应；金丹与 30 单后追查系统回避的问题。'],
      side:['共享工具的归还约定','社区活动临时停办','木作修补与夜修交接'],cast:['lin','chen','meng','ye'],
      facts:['连接可以呈现为阵纹','愿意回应的人构成阵点，但仍有自己的生活'],
      withheld:['系统是旧阵器灵的最终结论','自动征用居民、自动入宗或新战斗数值'],events:['story-lantern-network'],exit:'灯火网络剧情结算，金丹，累计 30 单；开启第八章。'},
    {id:'system',area:'归云南郊',entry:'完成灯火网络剧情，金丹，累计 30 单',
      setting:'南郊居住片区与产业街区，订单记录、维护账目与系统数字形成对照。',
      conflict:'一个持续给予奖励的系统，是否也必须解释它的目的与代价。',
      beats:['对照自己的送达记录，发现“有效连接数”不能解释所有被帮助的人。','系统拒绝回答时保留证据，向已结识人物学习核实、独立记录与备用方案。','完成「系统第一次拒绝回答」，看见残缺阵海与外流迹象；不提前宣布真相，待元婴与 42 单后继续。'],
      side:['被统计遗漏的送达','设备维护的交接单','直播中尚未核实的传闻'],cast:['jiang','xu','luo'],
      facts:['系统在统计有效连接','系统有回避与恐惧，需要被核实'],
      withheld:['用猜测替代第九章固定真相','后台指令、越权奖励或现实技术攻击'],events:['story-system-doubt'],exit:'系统疑问剧情结算，元婴，累计 42 单；开启第九章。'},
    {id:'truth',area:'望舒北境',entry:'完成系统疑问剧情，元婴，累计 42 单',
      setting:'北境住区与旧设施相接，失联记录、口述与当下生活并置。',
      conflict:'力量来自众人时，掌握解释的人是否就拥有替众人决定的权利。',
      beats:['把旧记录和已经核实的线索相互校验，允许不同人的记忆不完全一致。','固定主线揭示外卖系统是旧护城阵残存器灵；认识它曾经的失败而不把主角塑成唯一救世主。','完成「万家灯火，不属于任何人」，选择协作、保留质疑或要求说明；累计 48 单后把普通记录与阵图并列核对。'],
      side:['署名应归给谁','一份不完整的旧名单','整理记录与替人发言的差别'],cast:['shen','gu','wen','su'],
      facts:['已有系统疑问和残缺阵海的证据'],
      withheld:['在固定真相事件结算前先说出器灵身份','替未结识者决定立场或强制选择结局'],events:['story-system-truth'],exit:'系统真相剧情结算，元婴，累计 48 单；开启第十章。'},
    {id:'divine',area:'星河东原',entry:'共同记录剧情结算，化神，累计 54 单',
      setting:'东部开阔街区、社区与水道，能力扩大后更要分辨距离和界限。',
      conflict:'听见更多声音，不等于被允许进入更多人的生活。',
      beats:['「灯火之外的回声」让求助、寒暄、沉默同时进入感知；先分辨而非替人决定。','用配送与有限协助表现说明、询问和等待；紧急救助与普通好意不能混为一谈。','在「每扇门都能说不」中确认边界，保留不回应的门；炼虚与 68 单后追寻更远的失联记录。'],
      side:['没有回应的门铃','镜头之外的收餐人','救援后是否留下姓名'],cast:['han','yue','xu'],
      facts:['系统是旧护城阵残存器灵','神识可以听见更多，但不自动授予介入权'],
      withheld:['把神识写成读心授权','跳过本章两段固定选择'],events:['story-divine-echo','story-divine-consent'],exit:'化神两段剧情结算（第二段至少 56 单），炼虚，累计 68 单；开启第十二章。'},
    {id:'void',area:'青禾水乡',entry:'完成化神两段剧情，炼虚，累计 68 单',
      setting:'西部水乡、村落与旧址。水系只作真实地理，不新增轮渡或灵力跨水捷径。',
      conflict:'修复失联是否意味着让所有关系都回到从前。',
      beats:['「没有地址的回信」引出旧连接，实地核对仍然存在的地点和道路。','并排保存记忆与缺口，分别写一段愿意重联、一段确认结束、一段暂时没有答案的故事。','「给虚隙留下归路」把修复与放手分开；合体与 84 单后转向共同维护。'],
      side:['旧木器的认领','书页缺失处的注记','搬迁后仍收到的问候'],cast:['cheng','meng','pei'],
      facts:['旧阵破碎曾造成失联','保存痕迹可以不同于恢复旧关系'],
      withheld:['复活亡者、改写过去或伪造当事人回应','瞬移、轮渡或新增跨水路径'],events:['story-void-letter','story-void-return'],exit:'炼虚两段剧情结算（第二段至少 70 单），合体，累计 84 单；开启第十三章。'},
    {id:'unity',area:'落霞海门',entry:'完成炼虚两段剧情，合体，累计 84 单',
      setting:'南部沿海城区与产业社区，以交接、补给和公开阵图组织群像。',
      conflict:'大家依赖最强者的安排，反而会让整个网络缺少接替能力。',
      beats:['「不能由一人承受的城」暴露单点依赖；让主角有一次需要别人接班的真实处境。','已有宗门可以参与讨论，散修同样有完整路径；分歧记录、轮值与退出方式都写清楚。','「把阵图摊在桌上」形成可质疑的协作约定；大乘与 102 单后把经验交给后来者。'],
      side:['跨社区补给交接','临时退出后的排班','不同修行方式如何共同记录'],cast:['lin','zhao','luo','lu'],
      facts:['器灵已开始学习说明与协作','维护需要轮值、复核和接替'],
      withheld:['自动加入宗门、自动改写宗际关系','用剧情文本代替真实结算'],events:['story-unity-burden','story-unity-covenant'],exit:'合体两段剧情结算（第二段至少 86 单），大乘，累计 102 单；开启第十四章。'},
    {id:'mahayana',area:'远岫南原',entry:'完成合体两段剧情，大乘，累计 102 单',
      setting:'西南片区的长路、居住点与日常服务，把宏大经验落成可以照着做的小事。',
      conflict:'经验若只能证明前辈厉害，就无法帮助新人少走一次弯路。',
      beats:['「新骑手的第一张单」让主角重新看见自己习以为常的难处。','把绕路、失败、休息与求助写进说明，允许新人修改方法；留下不计成就的一次普通送达。','「不必被记住的一次抵达」完成传承的转向；累计 112 单后共同准备沿海的备用安排。'],
      side:['给新人标出的易错路口','失败也保留的操作笔记','不署名的一次帮忙'],cast:['song','jiang','tang','su'],
      facts:['协作网络不应只依赖主角','经验允许被理解、质疑和改进'],
      withheld:['自动传授功法或凭文本升级','提前替玩家选择结局'],events:['story-mahayana-rookie','story-mahayana-ordinary'],exit:'大乘两段剧情结算（第二段至少 104 单），大乘，累计 112 单；开启第十五章。'},
    {id:'tribulation',area:'沧澜群洲',entry:'海岸交接剧情结算，渡劫，累计 122 单',
      setting:'东北边缘与群洲远景。全图开放仍不等于道路可达，岛屿不凭章节获得虚构通道。',
      conflict:'旧阵提出用绝对控制换取不出错，主角必须面对有限能力与共同承担。',
      beats:['「天雷问的不是修为」把控制与不确定并置，所有选择都保留人的代价。','召回前章已建立的经验和已结识人物的声音，不召唤未见过的角色替玩家表态。','「天门之后仍有门铃」回到真实日常；现有五类结局仍由原门槛与玩家选择决定，选择后可继续游历。'],
      side:['雷雨前的备用安排','临行前检查车况','第二天仍然响起的门铃'],cast:['lu','chen','qin','ye'],
      facts:['全市章节区域已开放','强大不能抹除不确定与他人的选择'],
      withheld:['自动飞升、清档或强制终局','无道路岛屿配送和新增交通方式'],events:['story-tribulation-question','story-tribulation-dawn'],exit:'完成两段剧情（第二段至少 124 单）；后续仍按现有结局条件自选并可继续游历。'}
  ];
  rows.splice(2,0,{id:'westward',area:'松风西城',entry:'街脉剧情结算，炼气，累计 12 单',
    setting:'西城的小巷、门铃和配送入口，让认路笔记从一个人的经验变成可以核对的说明。',
    conflict:'系统记录过的路线也会遇到变化，熟路不应成为把猜测写成保证的理由。',
    beats:['沿实际道路完成配送，比较旧说明与现有入口，保留时间与绕路的真实代价。','把确认日期、未核实部分和更正方式分开写，不替收餐人决定开门方式。','完成「路要真正走过才算」，让笔记能够被后来的人修正；累计 14 单进入第四章。'],
    side:['停用后门旁的新门铃','旧笔记里的近路','一份允许更正的入口说明'],cast:['chen','jiang','tang'],
    facts:['外卖系统已经绑定','街脉已被观察到，但用途尚未确认'],withheld:['器灵来源和系统最终真相','未走过的路线与虚构近路'],
    events:['story-westward-note'],exit:'西城笔记剧情实际结算，炼气，累计 14 单；开启第四章。'});
  rows.splice(4,0,{id:'river-relay',area:'杏花里',entry:'城市背面剧情结算，炼气，累计 16 单，已结识两人',
    setting:'沿河的值班室与街巷，将普通交班写成后来协作关系的起点。',
    conflict:'交接既需要说明未完成的事，也需要让接班的人保留选择范围与拒绝的权利。',
    beats:['从一次收餐与换班看见空白记录带来的困难，先听清接班者需要什么。','区分已确认与待确认事项，把本人同意、联系和退出方法留下。','完成「交班时留下的那一栏」，承认休息也属于安排；累计 18 单进入第六章。'],
    side:['只写正常的旧白板','没有提前填名的轮值表','下班之后的一份晚饭'],cast:['lin','han','song'],
    facts:['城市的背面已被观察','已经结识至少两人，同行仍有各自的生活'],withheld:['把陌生人写成已结识人物','阵点的最终解释与器灵身份'],
    events:['story-river-relay'],exit:'交班剧情实际结算，炼气，累计 18 单；开启第六章。'});
  rows.splice(9,0,{id:'shared-ledger',area:'星河北原',entry:'系统真相剧情结算，元婴，累计 48 单',
    setting:'北原的普通纸册、公开图例与修正记录，让阵图能被普通人核对。',
    conflict:'说明若只让有力量的人看懂，仍无法把决定权交还真正参与的人。',
    beats:['把器灵的计数与普通记录并列，说明不同来源为何不能相互替代。','保留不同意见、署名和未确定部分，让参与者知道如何提出更正或退出。','完成「阵图旁边的普通笔记」；化神与 54 单后进入第十一章。'],
    side:['第一页的修正方法','有争议也保留的图例','最后整理者的署名'],cast:['shen','wen','luo'],
    facts:['系统是旧护城阵残存器灵','力量来自众人，需要可核对的说明'],withheld:['把公开记录写成自动服从','越权改奖励、开区与人物关系'],
    events:['story-shared-ledger'],exit:'共同记录剧情实际结算，化神，累计 54 单；开启第十一章。'});
  rows.splice(14,0,{id:'coast-watch',area:'南烛海岸',entry:'大乘两段剧情结算，大乘，累计 112 单',
    setting:'沿海雷雨前的检查、替班与备用联系，面对不能彻底消除的不确定。',
    conflict:'准备未来不该再回到由最强者独自承担，退出与求助也必须有真实位置。',
    beats:['对照天气风险与真实生活安排，承认预报不会保证每件事都按图发生。','写清轮值、复核与消息中断时的确认方法，让参与者自愿选择职责。','完成「雷雨来前的一次交接」；渡劫与 122 单后开放第十六章群洲远景。'],
    side:['还要照顾家人的轮值者','停下来的检查清单','明天饭点前的一次交班'],cast:['qin','yue','zhao'],
    facts:['协作与传承已逐步建立','备用方案必须能在熟悉阵图的人离开后继续使用'],withheld:['把准备写成控制所有人的权利','提前选择结局或新增渡海路径'],
    events:['story-coast-watch'],exit:'海岸交接剧情实际结算，渡劫，累计 122 单；开启第十六章。'});
  G.CHAPTER_OUTLINES=Object.freeze(rows.map((r,i)=>Object.freeze({...r,number:i+1,
    area:G.CITY_REGION.administrative.districts.filter(d=>d.chapter===i+1).map(d=>d.name).join('、')})));
  // Real administrative multipolygons, including holes and disconnected parts.
  // Shared borders belong to the earliest chapter; no nearest-centre fallback.
  G.MAP_REGIONS=Object.freeze(G.CITY_REGION.administrative.districts.map(r=>Object.freeze(r)));
  const byId=new Map(G.MAP_REGIONS.map(r=>[r.id,r]));
  G.mapRegion=id=>byId.get(id);
  const cell=512,tolerance=.02,bins=new Map(),stripes=new Map();
  const edges=[];
  for(const r of G.MAP_REGIONS){
    const bands=new Map();stripes.set(r.id,bands);
    for(const polygon of r.polygons)for(const ring of polygon)for(let i=1;i<ring.length;i++){
      const a=ring[i-1],b=ring[i],edge={a,b,region:r},index=edges.length;edges.push(edge);
      const x0=Math.floor((Math.min(a[0],b[0])-tolerance)/cell),x1=Math.floor((Math.max(a[0],b[0])+tolerance)/cell);
      const y0=Math.floor((Math.min(a[1],b[1])-tolerance)/cell),y1=Math.floor((Math.max(a[1],b[1])+tolerance)/cell);
      for(let y=y0;y<=y1;y++){
        if(!bands.has(y))bands.set(y,[]);bands.get(y).push(edge);
        for(let x=x0;x<=x1;x++){const key=`${x}:${y}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(index);}
      }
    }
  }
  function onEdge(p,a,b){
    const dx=b[0]-a[0],dy=b[1]-a[1],len=dx*dx+dy*dy;
    const t=len?Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.y-a[1])*dy)/len)):0;
    return (p.x-a[0]-t*dx)**2+(p.y-a[1]-t*dy)**2<=tolerance**2;
  }
  G.regionAt=p=>{
    if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))return null;
    for(const r of G.MAP_REGIONS){
      const [l,t,h,b]=r.bounds;if(p.x<l-tolerance||p.x>h+tolerance||p.y<t-tolerance||p.y>b+tolerance)continue;
      let inside=false;
      for(const {a,b} of stripes.get(r.id).get(Math.floor(p.y/cell))||[]){
        if(onEdge(p,a,b))return r;
        if((a[1]>p.y)!==(b[1]>p.y)&&p.x<(b[0]-a[0])*(p.y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
      }
      if(inside)return r;
    }return null;
  };
  const placeRegions=new Map(G.PLACES.map(p=>[p.id,G.regionAt(p)]));
  G.placeRegion=id=>placeRegions.get(id);
  G.chapterNumber=s=>G.STORY_STAGES?G.STORY_STAGES.indexOf(G.storyStage(s))+1:1;
  G.regionUnlocked=(s,id)=>!!byId.get(id)&&byId.get(id).chapter<=G.chapterNumber(s);
  G.regionPlaceOpen=(s,id)=>!!placeRegions.get(id)&&placeRegions.get(id).chapter<=G.chapterNumber(s);
  G.regionBlock=(s,id)=>G.placeRegion(id)&&!G.regionPlaceOpen(s,id)?`${G.placeRegion(id).name}尚未开放，需要进入第${G.placeRegion(id).chapter}章。`:'';
  G.openRegionCount=s=>G.MAP_REGIONS.filter(r=>G.regionUnlocked(s,r.id)).length;
  // Split at every boundary crossing: equal endpoint regions are insufficient
  // for concave outlines, holes and disconnected islands.
  G.segmentChapter=(p,q)=>{
    const a=G.regionAt(p),b=G.regionAt(q);if(!a||!b)return Infinity;
    let required=Math.max(a.chapter,b.chapter);const dx=q.x-p.x,dy=q.y-p.y,length=dx*dx+dy*dy;
    if(!length)return required;
    const candidates=new Set(),cuts=[0,1];
    for(let x=Math.floor((Math.min(p.x,q.x)-tolerance)/cell);x<=Math.floor((Math.max(p.x,q.x)+tolerance)/cell);x++)
      for(let y=Math.floor((Math.min(p.y,q.y)-tolerance)/cell);y<=Math.floor((Math.max(p.y,q.y)+tolerance)/cell);y++)
        for(const i of bins.get(`${x}:${y}`)||[])candidates.add(i);
    for(const i of candidates){
      const {a,b}=edges[i],ex=b[0]-a[0],ey=b[1]-a[1],ax=a[0]-p.x,ay=a[1]-p.y,den=dx*ey-dy*ex;
      if(Math.abs(den)>1e-9){const t=(ax*ey-ay*ex)/den,u=(ax*dy-ay*dx)/den;if(t>0&&t<1&&u>=-1e-9&&u<=1+1e-9)cuts.push(t);}
      else if(Math.abs(ax*dy-ay*dx)<=tolerance*Math.sqrt(length)){
        for(const v of [a,b]){const t=((v[0]-p.x)*dx+(v[1]-p.y)*dy)/length;if(t>0&&t<1)cuts.push(t);}
      }
    }
    cuts.sort((a,b)=>a-b);
    for(let i=1;i<cuts.length;i++)if(cuts[i]-cuts[i-1]>1e-10){
      const t=(cuts[i]+cuts[i-1])/2,r=G.regionAt({x:p.x+t*dx,y:p.y+t*dy});if(!r)return Infinity;required=Math.max(required,r.chapter);
    }return required;
  };
  G.chapterBrief=(chapterId,regionId)=>{
    const chapter=G.CHAPTER_OUTLINES.find(c=>c.id===chapterId)||G.CHAPTER_OUTLINES[0],region=byId.get(regionId);
    return {id:chapter.id,number:chapter.number,area:region&&region.chapter<=chapter.number?region.name:chapter.area,
      setting:region&&region.chapter<=chapter.number?`${region.name}：${G.CHAPTER_OUTLINES[region.chapter-1].setting}`:chapter.setting,
      conflict:chapter.conflict,facts:chapter.facts,withheld:chapter.withheld,side:chapter.side,
      rules:['只扩写当前开放区域中的普通日常，不代替固定主线或提前完成章节','人物仅在已结识且已提供的人物上下文中出现，否则使用匿名居民','不改变坐标、区域权限、奖励规则、境界、职业和人物关系','未开放区域不能进入、途经、接单；开放后仍须真实道路连通']};
  };
})(globalThis);
