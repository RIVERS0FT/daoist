/* Authored chapter/territory bible. Coordinates never move published places. */
(function(root){
  'use strict';const G=root.NightCourier;
  const rows=[
    {id:'mortal',area:'青藤旧城',seed:[1400,1600],entry:'新旅程默认开放',
      setting:'老街、里弄、修车铺与沿江住区。先让玩家记住饭点、门牌和回家的路。',
      conflict:'房租与体力都有限，准时和体谅别人未必总能兼得。',
      beats:['接住第一张真实订单，认识住处、修车铺与途中休息；第一次失误由实际行程承担。','九次送达串起不同的门：换班、照护、临时改备注；留下热饭、门铃、旧折凳三个意象。','第十单在普通随机地址遇见老人，回答为何把饭送热；固定选择结算后才绑定外卖系统。'],
      side:['雨中认错的门牌','夜班人的晚饭','同行掉链条后的互助'],cast:['lin','chen','zhou'],
      facts:['主角是尚未绑定系统的普通骑手','生活压力与同行互助都是真实的'],
      withheld:['系统提示、兑换、绑定和修仙能力','周野的隐藏身份及未来关系变化'],
      events:['first-order','system-awakening'],exit:'第十单固定选择与配送实际结算；开启第二章，不自动领取修行委托。'},
    {id:'bound',area:'长乐西坊',seed:[-6500,2000],entry:'完成第一章系统绑定',
      setting:'街市、作坊与旧住区交织，热闹的白天和安静的后巷形成反差。',
      conflict:'新获得的能力看似便利，却不能代替吃饭、付租和理解规则。',
      beats:['领取第一份系统委托，开始完整吐纳；用一次真实休息对照力量带来的期待。','送过的路线出现细金线，系统只回答“连接有效”；以重复走访、记笔记和询问验证异常。','完成「地图上多出来的一条线」，积累配送并突破炼气；承认尚不理解系统，准备进入北城求证。'],
      side:['集市摊主的收工餐','作坊里的两份备注','一个不计奖励的绕路请求'],cast:['shen','lu','tang'],
      facts:['外卖系统已经绑定','系统会记录抵达并提供有限兑换','修行仍须领取委托并真实耗时'],
      withheld:['器灵来源、旧护城阵真相','未经固定剧情确认的连接用途'],
      events:['story-street-vein'],exit:'完成街脉剧情、进入炼气且累计至少 12 单；开启第三章。'},
    {id:'second-city',area:'听雨北城',seed:[-2000,-10500],entry:'完成街脉剧情，炼气，累计 12 单',
      setting:'旧墙、学校外街巷与桥下遗迹，日常记录和异常痕迹相互重叠。',
      conflict:'看见异常不等于知道原因，旧物、噪声与危险需要分别求证。',
      beats:['同一地址在纸质记录与深夜备注中出现差异，先确保真实收餐人和路线没有被忽略。','向已经结识的研究者、编辑或修书人请教，分别记录证据与猜测；不让神识替别人编答案。','完成「城市的背面」，把零散旧符与阵号整理成残环；在结识至少两位人物后转入同行网络。'],
      side:['旧书夹页中的地址','桥下标记的年代','气象记录与异常回声'],cast:['qin','pei','cheng'],
      facts:['炼气后可以感知异常','存在旧符、阵号和残缺环形线索'],
      withheld:['残环的最终用途','系统真实身份和幕后结论'],events:['story-second-city'],exit:'完成城市背面剧情，炼气且已结识至少两位人物；开启第四章。'},
    {id:'circle',area:'云汀东城',seed:[12000,1000],entry:'完成城市背面剧情，炼气，已结识两人',
      setting:'江东新旧街区、换班通道与夜间生活设施，重点写人怎样互相接班。',
      conflict:'夜路上的互助容易变成对少数可靠者的无限索取。',
      beats:['以换班后的订单进入东城，观察医护、司机、检修与救援者各自不同的日程。','通过不同人的自愿参与建立联系；至少安排一次拒绝、一次交接和一次有人替主角接住困难。','把同行名单写成可轮换的安排而非强者排名；累计 18 单并筑基后进入第五章。'],
      side:['末班之后的热汤','检修窗口里的晚饭','临时轮值的空缺'],cast:['han','zhao','song','yue'],
      facts:['城市异常与真实配送路线相关','已有同行各有工作、休息和选择'],
      withheld:['把陌生人直接写成熟人','系统用途的最终解释'],events:[],exit:'筑基且累计 18 单；已有前章条件必须全部成立。此章收束由成长与人物里程碑承担。'},
    {id:'guardian',area:'松风西关',seed:[-18500,-5500],entry:'连续完成前章门槛，筑基，累计 18 单',
      setting:'城市西缘的工坊、社区与绿地，把维护工作和守阵放在同一张图上。',
      conflict:'旧阵习惯把人算作可用节点，现实生活却有疲惫、争执与无法出席。',
      beats:['系统首次把订单称为阵点；回访之后发现每个发光坐标都无法被简单调度。','让补给、维修与轮值互相支持，测试一个人退出后联系是否还能延续。','完成「每个人都是一个阵点」，确认力量来自真实回应；金丹与 30 单后追查系统回避的问题。'],
      side:['共享工具的归还约定','社区活动临时停办','木作修补与夜修交接'],cast:['lin','chen','meng','ye'],
      facts:['连接可以呈现为阵纹','愿意回应的人构成阵点，但仍有自己的生活'],
      withheld:['系统是旧阵器灵的最终结论','自动征用居民、自动入宗或新战斗数值'],events:['story-lantern-network'],exit:'完成灯火网络剧情，金丹，累计 30 单；开启第六章。'},
    {id:'system',area:'归云南郊',seed:[-12000,19000],entry:'完成灯火网络剧情，金丹，累计 30 单',
      setting:'南郊居住片区与产业街区，订单记录、维护账目与系统数字形成对照。',
      conflict:'一个持续给予奖励的系统，是否也必须解释它的目的与代价。',
      beats:['对照自己的送达记录，发现“有效连接数”不能解释所有被帮助的人。','系统拒绝回答时保留证据，向已结识人物学习核实、独立记录与备用方案。','完成「系统第一次拒绝回答」，看见残缺阵海与外流迹象；不提前宣布真相，待元婴与 42 单后继续。'],
      side:['被统计遗漏的送达','设备维护的交接单','直播中尚未核实的传闻'],cast:['jiang','xu','luo'],
      facts:['系统在统计有效连接','系统有回避与恐惧，需要被核实'],
      withheld:['用猜测替代第七章固定真相','后台指令、越权奖励或现实技术攻击'],events:['story-system-doubt'],exit:'完成系统疑问剧情，元婴，累计 42 单；开启第七章。'},
    {id:'truth',area:'望舒北境',seed:[-16000,-28500],entry:'完成系统疑问剧情，元婴，累计 42 单',
      setting:'北境住区与旧设施相接，失联记录、口述与当下生活并置。',
      conflict:'力量来自众人时，掌握解释的人是否就拥有替众人决定的权利。',
      beats:['把旧记录和已经核实的线索相互校验，允许不同人的记忆不完全一致。','固定主线揭示外卖系统是旧护城阵残存器灵；认识它曾经的失败而不把主角塑成唯一救世主。','完成「万家灯火，不属于任何人」，选择协作、保留质疑或要求说明；化神与 54 单后进入新的感知尺度。'],
      side:['署名应归给谁','一份不完整的旧名单','整理记录与替人发言的差别'],cast:['shen','gu','wen','su'],
      facts:['已有系统疑问和残缺阵海的证据'],
      withheld:['在固定真相事件结算前先说出器灵身份','替未结识者决定立场或强制选择结局'],events:['story-system-truth'],exit:'完成系统真相剧情，化神，累计 54 单；开启第八章。'},
    {id:'divine',area:'星河东原',seed:[28000,13000],entry:'完成系统真相剧情，化神，累计 54 单',
      setting:'东部开阔街区、社区与水道，能力扩大后更要分辨距离和界限。',
      conflict:'听见更多声音，不等于被允许进入更多人的生活。',
      beats:['「灯火之外的回声」让求助、寒暄、沉默同时进入感知；先分辨而非替人决定。','用配送与有限协助表现说明、询问和等待；紧急救助与普通好意不能混为一谈。','在「每扇门都能说不」中确认边界，保留不回应的门；炼虚与 68 单后追寻更远的失联记录。'],
      side:['没有回应的门铃','镜头之外的收餐人','救援后是否留下姓名'],cast:['han','yue','xu'],
      facts:['系统是旧护城阵残存器灵','神识可以听见更多，但不自动授予介入权'],
      withheld:['把神识写成读心授权','跳过本章两段固定选择'],events:['story-divine-echo','story-divine-consent'],exit:'两段剧情结算（第二段至少 56 单），炼虚，累计 68 单；开启第九章。'},
    {id:'void',area:'青禾水乡',seed:[-39000,10500],entry:'完成化神两段剧情，炼虚，累计 68 单',
      setting:'西部水乡、村落与旧址。水系只作真实地理，不新增轮渡或灵力跨水捷径。',
      conflict:'修复失联是否意味着让所有关系都回到从前。',
      beats:['「没有地址的回信」引出旧连接，实地核对仍然存在的地点和道路。','并排保存记忆与缺口，分别写一段愿意重联、一段确认结束、一段暂时没有答案的故事。','「给虚隙留下归路」把修复与放手分开；合体与 84 单后转向共同维护。'],
      side:['旧木器的认领','书页缺失处的注记','搬迁后仍收到的问候'],cast:['cheng','meng','pei'],
      facts:['旧阵破碎曾造成失联','保存痕迹可以不同于恢复旧关系'],
      withheld:['复活亡者、改写过去或伪造当事人回应','瞬移、轮渡或新增跨水路径'],events:['story-void-letter','story-void-return'],exit:'两段剧情结算（第二段至少 70 单），合体，累计 84 单；开启第十章。'},
    {id:'unity',area:'落霞海门',seed:[10000,46500],entry:'完成炼虚两段剧情，合体，累计 84 单',
      setting:'南部沿海城区与产业社区，以交接、补给和公开阵图组织群像。',
      conflict:'大家依赖最强者的安排，反而会让整个网络缺少接替能力。',
      beats:['「不能由一人承受的城」暴露单点依赖；让主角有一次需要别人接班的真实处境。','已有宗门可以参与讨论，散修同样有完整路径；分歧记录、轮值与退出方式都写清楚。','「把阵图摊在桌上」形成可质疑的协作约定；大乘与 102 单后把经验交给后来者。'],
      side:['跨社区补给交接','临时退出后的排班','不同修行方式如何共同记录'],cast:['lin','zhao','luo','lu'],
      facts:['器灵已开始学习说明与协作','维护需要轮值、复核和接替'],
      withheld:['自动加入宗门、自动改写宗际关系','用剧情文本代替真实结算'],events:['story-unity-burden','story-unity-covenant'],exit:'两段剧情结算（第二段至少 86 单），大乘，累计 102 单；开启第十一章。'},
    {id:'mahayana',area:'远岫南原',seed:[-36500,42000],entry:'完成合体两段剧情，大乘，累计 102 单',
      setting:'西南片区的长路、居住点与日常服务，把宏大经验落成可以照着做的小事。',
      conflict:'经验若只能证明前辈厉害，就无法帮助新人少走一次弯路。',
      beats:['「新骑手的第一张单」让主角重新看见自己习以为常的难处。','把绕路、失败、休息与求助写进说明，允许新人修改方法；留下不计成就的一次普通送达。','「不必被记住的一次抵达」完成传承的转向；渡劫与 122 单后面对旧阵最后的选择。'],
      side:['给新人标出的易错路口','失败也保留的操作笔记','不署名的一次帮忙'],cast:['song','jiang','tang','su'],
      facts:['协作网络不应只依赖主角','经验允许被理解、质疑和改进'],
      withheld:['自动传授功法或凭文本升级','提前替玩家选择结局'],events:['story-mahayana-rookie','story-mahayana-ordinary'],exit:'两段剧情结算（第二段至少 104 单），渡劫，累计 122 单；开启第十二章。'},
    {id:'tribulation',area:'沧澜群洲',seed:[21000,-23500],entry:'完成大乘两段剧情，渡劫，累计 122 单',
      setting:'东北边缘与群洲远景。全图开放仍不等于道路可达，岛屿不凭章节获得虚构通道。',
      conflict:'旧阵提出用绝对控制换取不出错，主角必须面对有限能力与共同承担。',
      beats:['「天雷问的不是修为」把控制与不确定并置，所有选择都保留人的代价。','召回前章已建立的经验和已结识人物的声音，不召唤未见过的角色替玩家表态。','「天门之后仍有门铃」回到真实日常；现有五类结局仍由原门槛与玩家选择决定，选择后可继续游历。'],
      side:['雷雨前的备用安排','临行前检查车况','第二天仍然响起的门铃'],cast:['lu','chen','qin','ye'],
      facts:['全市章节区域已开放','强大不能抹除不确定与他人的选择'],
      withheld:['自动飞升、清档或强制终局','无道路岛屿配送和新增交通方式'],events:['story-tribulation-question','story-tribulation-dawn'],exit:'完成两段剧情（第二段至少 124 单）；后续仍按现有结局条件自选并可继续游历。'}
  ];
  G.CHAPTER_OUTLINES=Object.freeze(rows.map((r,i)=>Object.freeze({...r,number:i+1})));
  const bounds=G.CITY_REGION?.bounds||[-60897,-75036,74313,65744];
  // Convex Voronoi territories: the same half-planes define art and road access.
  function clip(poly,a,b,c){
    const out=[];for(let i=0;i<poly.length;i++){
      const p=poly[i],q=poly[(i+1)%poly.length],u=a*p[0]+b*p[1]-c,v=a*q[0]+b*q[1]-c;
      if(u<=0)out.push(p);if((u<0&&v>0)||(u>0&&v<0)){const t=u/(u-v);out.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);}
    }return out;
  }
  G.MAP_REGIONS=Object.freeze(rows.map((r,i)=>{
    let polygon=[[bounds[0],bounds[1]],[bounds[2],bounds[1]],[bounds[2],bounds[3]],[bounds[0],bounds[3]]];const planes=[];
    for(const other of rows)if(other!==r){const a=2*(other.seed[0]-r.seed[0]),b=2*(other.seed[1]-r.seed[1]),c=other.seed[0]**2+other.seed[1]**2-r.seed[0]**2-r.seed[1]**2;planes.push([a,b,c]);polygon=clip(polygon,a,b,c);}
    return Object.freeze({id:r.id,name:r.area,chapter:i+1,seed:r.seed,polygon,planes});
  }));
  const byId=new Map(G.MAP_REGIONS.map(r=>[r.id,r]));
  G.mapRegion=id=>byId.get(id);
  G.regionAt=p=>{
    if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))return null;
    let nearest=null,best=Infinity;for(const r of G.MAP_REGIONS){const d=(p.x-r.seed[0])**2+(p.y-r.seed[1])**2;if(d<best){nearest=r;best=d;}}return nearest;
  };
  const placeRegions=new Map(G.PLACES.map(p=>[p.id,G.regionAt(p)]));
  G.placeRegion=id=>placeRegions.get(id);
  G.chapterNumber=s=>G.STORY_STAGES?G.STORY_STAGES.indexOf(G.storyStage(s))+1:1;
  G.regionUnlocked=(s,id)=>!!byId.get(id)&&byId.get(id).chapter<=G.chapterNumber(s);
  G.regionPlaceOpen=(s,id)=>!!placeRegions.get(id)&&placeRegions.get(id).chapter<=G.chapterNumber(s);
  G.regionBlock=(s,id)=>G.placeRegion(id)&&!G.regionPlaceOpen(s,id)?`${G.placeRegion(id).name}尚未开放，需要进入第${G.placeRegion(id).chapter}章。`:'';
  // A long road can cross a third territory even if both endpoints are open.
  G.segmentChapter=(p,q)=>{
    const a=G.regionAt(p),b=G.regionAt(q);if(!a||!b)return Infinity;if(a===b)return a.chapter;
    let required=Math.max(a.chapter,b.chapter);
    for(const r of G.MAP_REGIONS){
      if(r.chapter<=required)continue;let low=0,high=1;
      for(const [x,y,c] of r.planes){const start=x*p.x+y*p.y-c,delta=x*(q.x-p.x)+y*(q.y-p.y);
        if(Math.abs(delta)<1e-9){if(start>1e-5){high=-1;break;}}else if(delta>0)high=Math.min(high,-start/delta);else low=Math.max(low,-start/delta);
        if(high<low)break;
      }
      if(high-low>1e-10&&high>0&&low<1)required=r.chapter;
    }return required;
  };
  G.chapterBrief=(chapterId,regionId)=>{
    const chapter=G.CHAPTER_OUTLINES.find(c=>c.id===chapterId)||G.CHAPTER_OUTLINES[0],region=byId.get(regionId);
    return {id:chapter.id,number:chapter.number,area:region&&region.chapter<=chapter.number?region.name:chapter.area,
      setting:region&&region.chapter<=chapter.number?G.CHAPTER_OUTLINES[region.chapter-1].setting:chapter.setting,
      conflict:chapter.conflict,facts:chapter.facts,withheld:chapter.withheld,side:chapter.side,
      rules:['只扩写当前开放区域中的普通日常，不代替固定主线或提前完成章节','人物仅在已结识且已提供的人物上下文中出现，否则使用匿名居民','不改变坐标、区域权限、奖励规则、境界、职业和人物关系','未开放区域不能进入、途经、接单；开放后仍须真实道路连通']};
  };
})(globalThis);
