/* 只做本地持久化与格式校验，不宣称能防止单机玩家改档。 */
(function (root) {
  'use strict';
  const G = root.NightCourier;
  G.STORAGE_KEY = 'night-courier:saves:v20';
  G.LEGACY_STORAGE_KEY = 'night-courier:saves:v19';
  G.LEGACY_STORAGE_KEYS = [G.LEGACY_STORAGE_KEY,'night-courier:saves:v18','night-courier:saves:v17','night-courier:saves:v16','night-courier:saves:v15','night-courier:saves:v14','night-courier:saves:v13','night-courier:saves:v12','night-courier:saves:v11','night-courier:saves:v10','night-courier:saves:v9','night-courier:saves:v8','night-courier:saves:v7','night-courier:saves:v6','night-courier:saves:v5','night-courier:saves:v4','night-courier:saves:v3'];
  G.BACKUP_KEY = 'night-courier:saves:backup';
  G.MAX_SAVES = 12;
  const obj = x => !!x && typeof x === 'object' && !Array.isArray(x);
  const num = (v, fallback, min=0, max=999999, integer=true) => Number.isFinite(v) ? G.clamp(integer?Math.floor(v):v,min,max) : fallback;
  const str = (v, fallback, max=100) => typeof v === 'string' ? v.slice(0,max) : fallback;
  const uid = () => root.crypto?.randomUUID?.() || `save-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const cleanId = id => typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{4,100}$/.test(id) ? id : uid();
  function cleanTicket(raw, s) {
    if(!obj(raw)||!G.place(raw.target))throw new Error('订单地点无效。');
    return {id:cleanId(raw.id),target:raw.target,title:str(raw.title,'热饭配送',60),desc:str(raw.desc,'请及时送达。',300),
      condition:['ordinary','careful','urgent','night','mystic'].includes(raw.condition)?raw.condition:'ordinary',
      expiresAt:num(raw.expiresAt,s.minutes+20,0,1e8,false),reward:num(raw.reward,20,0,1000),coins:num(raw.coins,2,0,20),
      npc:G.NPCS.some(n=>n.id===raw.npc)?raw.npc:null};
  }
  function cleanPending(p,s){
    if(!obj(p))throw new Error('待处理事件已损坏。');
    if(p.kind==='auction'||p.templateId==='auction-bid'){
      const lot=G.auctionLot(s,p.auction?.lotId);
      if(!lot||lot.status!=='decision'||p.auction.day!==s.auction.day||p.auction.round!==lot.round)throw new Error('拍卖待选轮次无效。');
      const clean=G.auctionDecision(s,lot);
      if(p.id!==clean.id)throw new Error('拍卖事件标识与轮次不一致。');
      return clean; // 丢弃任何外来 effects / AI 文本；从当前拍品重建三个固定操作。
    }
    const deliveryFace=G.EVENTS.find(e=>e.id===p.templateId&&e.deliveryNpc);
    if(deliveryFace){
      const ticket=cleanTicket(p.delivery,s),id=deliveryFace.deliveryNpc;
      if(!s.flags.firstOrder||s.stats.delivered<1||p.kind!=='delivery'||p.npcId!==id||p.npcAdvance||ticket.npc!==id||s.position!==ticket.target||
         (deliveryFace.deliveryMeeting?s.bonds[id].met:!s.bonds[id].met))
        throw new Error('配送相逢与人物、地点或票据不一致。');
      // Restore authored identity and effects, never saved AI text or social chapter advancement.
      return {...G.clone(deliveryFace),id:cleanId(p.id),templateId:deliveryFace.id,
        npcId:id,npcAdvance:false,source:'classic',aiStatus:'skip',delivery:ticket};
    }
    // New male stories and revised female stories always restore trusted authored text.
    const fixedRomance=G.NPCS.some(n=>n.id===p.npcId&&(n.romantic||G.NEW_MALE_NPC_IDS.includes(n.id)));
    if(fixedRomance&&!s.bonds[p.npcId].met)throw new Error('未结识人物不能具有交谈记录。');
    if(fixedRomance&&p.npcAdvance===true){
      const npc=G.NPCS.find(n=>n.id===p.npcId),bond=s.bonds[npc.id],arc=npc.arc[bond.stage];
      if(!arc||!bond.met||p.kind!=='social'||p.delivery||s.position!==npc.place)
        throw new Error('人物章节与羁绊或拜访地点不一致。');
      const [title,text,...choices]=arc;
      return {id:cleanId(p.id),kind:'social',title,text,choices:G.clone(choices),
        npcId:npc.id,npcAdvance:true,source:'classic',aiStatus:'skip'};
    }
    if(p.templateId==='system-awakening'){
      const ticket=cleanTicket(p.delivery,s),base=G.EVENTS.find(e=>e.id===p.templateId);
      if(!base||p.kind!=='story'||p.npcId||s.stats.delivered<G.SYSTEM_UNLOCK_DELIVERIES-1||s.flags.systemAwakened||s.position!==ticket.target||G.place(ticket.target).permanent)throw new Error('外卖系统解锁剧情与配送进度不一致。');
      return {...G.clone(base),id:cleanId(p.id),templateId:base.id,source:'classic',aiStatus:'skip',delivery:ticket};
    }
    if(G.EVENTS.some(e=>e.id===p.templateId&&e.higherChapter)){
      if(p.delivery||p.npcId||p.kind!=='story')throw new Error('高境界主线不接受配送票据或人物进度。');
      const base=G.EVENTS.find(e=>e.id===p.templateId);
      return {...G.clone(base),id:cleanId(p.id),templateId:base.id,source:'classic',aiStatus:'skip'};
    }
    if(p.templateId==='story-sect-invitation'){
      if(p.delivery||p.npcId||p.kind!=='story')throw new Error('宗门引荐不接受配送票据或人物进度。');
      const base=G.EVENTS.find(e=>e.id===p.templateId);
      if(!base)throw new Error('宗门引荐剧情尚未加载。');
      return {...G.clone(base),id:cleanId(p.id),templateId:base.id,source:'classic',aiStatus:'skip'};
    }
      let base;
      const npc=G.NPCS.find(n=>n.id===p.npcId);
      if(npc)s.bonds[npc.id].met=true;
      if(npc&&p.npcAdvance===true){const arc=npc.arc[s.bonds[npc.id].stage];if(!arc)throw new Error('人物故事进度与事件不一致。');const [title,text,...choices]=arc;base={title,text,choices:G.clone(choices),kind:'social'};}
      else if(npc){base={title:`与${npc.name}的片刻`,text:'你们继续谈起各自的近况。',choices:[{label:'分享近况',result:'你们的距离又近了一些。',effects:{affinity:5,trust:2}},{label:'认真倾听',result:'你记住了对方在意的小事。',effects:{affinity:4,trust:3}},{label:'请对方吃饭',result:'一顿热饭，让夜晚柔软了许多。',effects:{money:-12,affinity:7,stamina:8}}],kind:'social'};}
      else {base=G.EVENTS.find(e=>e.id===p.templateId);if(!base)throw new Error('无法识别待处理事件，请使用备份恢复。');base=G.clone(base);}
      let clean={...base,id:cleanId(p.id),templateId:base.id||p.templateId,source:'classic',aiStatus:['unrequested','fallback','skip'].includes(p.aiStatus)?p.aiStatus:'skip',npcId:npc?.id||null,npcAdvance:!!npc&&p.npcAdvance===true};
      if(p.source==='ai'&&p.templateId!=='first-order'){const ai=G.validateAIEvent(p);Object.assign(clean,ai,{source:'ai',aiStatus:'success'});}
      if(p.delivery)clean.delivery=cleanTicket(p.delivery,s);
      if(s.mode==='classic'||p.templateId==='first-order')clean.aiStatus='skip';
    return clean;
  }

  function cleanPlaceUnlock(raw,s){
    if(raw===null)return null;
    if(!obj(raw)||typeof raw.place!=='string'||!G.placeUnlocked(s,raw.place)||G.STARTING_PLACES.includes(raw.place)||
       !Number.isFinite(raw.at)||raw.at<0||Math.abs(raw.at-s.minutes)>1e-6||s.position!==raw.place||s.stats.delivered<1||
       s.gameOver||s.activeOrder||(s.activity&&s.activity.kind!=='rescue')||s.pending?.delivery||
       (s.eventResult&&s.eventResult.delivery?.target!==raw.place))throw new Error('地点解锁提示与已结算配送不一致。');
    // Text and graphics come from trusted place data, never from a saved reward/effect payload.
    return {place:raw.place,at:raw.at};
  }

  function cleanUnlockNotices(raw,s){
    if(!Array.isArray(raw)||raw.length>G.NPCS.length+G.FEATURE_UNLOCKS.length)throw new Error('人物或功能解锁提示队列损坏。');
    const seen=new Set();
    return raw.map(n=>{
      if(!obj(n)||!['bond','feature'].includes(n.kind)||typeof n.id!=='string'||
         !Number.isFinite(n.at)||n.at<0||Math.abs(n.at-s.minutes)>1e-6||s.gameOver)throw new Error('人物或功能解锁提示无效。');
      const owned=n.kind==='bond'?G.NPCS.some(p=>p.id===n.id)&&s.bonds[n.id]?.met===true:
        G.FEATURE_UNLOCKS.some(f=>f.id===n.id)&&s.unlockedFeatures.includes(n.id);
      const key=G.unlockNoticeKey(n);
      if(!owned||seen.has(key))throw new Error('解锁提示与人物或功能所有权不一致。');
      seen.add(key);
      // Never restore labels, HTML, rewards, effects or permission grants from a notice.
      return {kind:n.kind,id:n.id,at:n.at};
    });
  }

  function cleanEventResult(raw,s){
    if(raw===null)return null;
    const text=(value,max)=>{
      if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error('事件结果文本损坏。');
      return value;
    };
    const changes=items=>{
      if(!Array.isArray(items)||items.length>64)throw new Error('事件结果变化记录损坏。');
      const seen=new Set();
      return items.map(x=>{
        if(!obj(x)||typeof x.key!=='string'||x.key.split('.').length!==(x.key.startsWith('bond.')?3:2)||!G.eventResultLabel(x.key)||seen.has(x.key)||!Number.isFinite(x.delta)||Math.abs(x.delta)>1e7||Math.abs(x.delta)<1e-8)throw new Error('事件结果变化记录无效。');
        seen.add(x.key);return {key:x.key,delta:x.delta};
      });
    };
    if(!obj(raw)||typeof raw.id!=='string'||!/^result-[a-zA-Z0-9_-]{1,120}$/.test(raw.id)||!['classic','ai'].includes(raw.source)||!Number.isFinite(raw.at)||raw.at<0||Math.abs(raw.at-s.minutes)>1e-6||!Number.isInteger(raw.duration)||raw.duration<0||raw.duration>1440)throw new Error('待确认事件结果已损坏。');
    const result={id:raw.id,title:text(raw.title,100),choice:text(raw.choice,120),text:text(raw.text,600),source:raw.source,at:raw.at,duration:raw.duration,changes:changes(raw.changes),delivery:null};
    if(raw.delivery!==null){
      const d=raw.delivery;
      if(!obj(d)||!G.placeUnlocked(s,d.target)||s.stats.delivered<1||s.position!==d.target)throw new Error('配送结果与已结算地点不一致。');
      result.delivery={title:text(d.title,100),target:d.target,changes:changes(d.changes)};
    }
    // Never restore actions/effects/tickets from a receipt; only the display whitelist survives.
    return result;
  }

  function cleanActivity(raw,s,version=G.VERSION){
    const kinds=['travel','deliver','moveHome','sleep','visit','rest','cultivate','breakthrough','alchemy','explore','charge','repair','upgrade','heal','meal','choice','rescue','auction','sectJoin','sectTask','sectPromote'];
    if(!obj(raw)||!kinds.includes(raw.kind)||!['travel','work'].includes(raw.phase))throw new Error('进行中的行动格式无效。');
    const kind=raw.kind,p=obj(raw.params)?raw.params:{},params={};
    let duration=({rest:60,sleep:480,visit:20,breakthrough:60,explore:30,charge:G.CHARGE.minutes,repair:30,upgrade:45,heal:30,meal:20,rescue:180})[kind]||0;
    if(['moveHome','sleep'].includes(kind)){
      if(!G.residence(p.id))throw new Error('行动中的住处无效。');params.id=p.id;
    }
    if(kind==='visit'){
      if(!G.NPCS.some(n=>n.id===p.id)||!s.bonds[p.id]?.met)throw new Error('拜访对象未结识或无效。');params.id=p.id;
    }
    if(kind==='cultivate'){
      if(!['breath','meditate','body'].includes(p.kind))throw new Error('修炼方式无效。');params.kind=p.kind;duration=p.kind==='meditate'?90:p.kind==='body'?30:45;
    }
    if(kind==='alchemy'){
      const recipe=G.alchemyRecipe(p.recipe);if(!recipe)throw new Error('丹方无效。');params.recipe=recipe.id;duration=recipe.duration;
      if((s.alchemy?.cauldron||0)<=0)throw new Error('炼药行动缺少有效药鼎。');
      if(!G.alchemyHasFormula(s,recipe))throw new Error('进行中的炼药缺少已获得丹方。');
    }
    if(kind==='upgrade'){
      if(!['speed','battery','durability'].includes(p.kind)||s.vehicle.levels[p.kind]>=5)throw new Error('升级行动无效。');params.kind=p.kind;
    }
    if(kind==='breakthrough'){
      const mortal=s.player.realm===0,oldMortal=version>=7&&version<13&&mortal;
      const oldLevel=G.LEGACY_MORTAL_PROGRESS.indexOf(s.player.mortalProgress)+1;
      const savedLevel=p.realmLevel??(oldMortal?oldLevel:s.player.realmLevel);
      const level=version<13&&mortal?1:savedLevel;
      if(p.realm!==s.player.realm||level!==s.player.realmLevel||G.realmAtMax(s)||
         (oldMortal&&savedLevel!==oldLevel))throw new Error('突破境界与存档不一致。');
      let expected=G.realmNeed(s);
      const legacyMortalLevel=oldMortal&&oldLevel<9?oldLevel:version>=13?p.legacyMortalLevel:undefined;
      const legacyMajorBudget=(version<7&&!mortal)||(version>=13&&p.legacyMajorBudget===true);
      if(legacyMortalLevel!==undefined){
        if(!mortal||!Number.isInteger(legacyMortalLevel)||legacyMortalLevel<1||legacyMortalLevel>8||
           G.LEGACY_MORTAL_PROGRESS[legacyMortalLevel-1]!==s.player.mortalProgress||legacyMajorBudget)throw new Error('旧版凡人突破衔接无效。');
        params.legacyMortalLevel=legacyMortalLevel;
        expected=G.LEGACY_MORTAL_PROGRESS[legacyMortalLevel]-s.player.mortalProgress;
      }else if(legacyMajorBudget){
        if(mortal||s.player.realm>5||level!==9)throw new Error('旧版大境突破衔接无效。');
        params.legacyMajorBudget=true;expected=G.REALMS[p.realm].need;
      }
      const need=p.need??expected;
      if(!Number.isFinite(need)||Math.abs(need-expected)>1e-8)throw new Error('突破投入与当前境界不一致。');
      params.realm=p.realm;params.realmLevel=level;params.need=need;params.chance=num(p.chance,53,35,95,false);
      if(p.pillTier!==undefined)params.pillTier=num(p.pillTier,0,0,9);
    }
    if(kind==='auction'){
      const lot=G.auctionLot(s,p.lotId);
      if(!lot||lot.status!=='bidding'||p.day!==s.auction.day||p.round!==lot.round||raw.phase!=='work'||raw.target||raw.route)throw new Error('拍卖行动与冻结款不一致。');
      if(raw.duration!==G.AUCTION.roundMinutes||!Number.isFinite(raw.elapsed)||raw.elapsed<0||raw.elapsed>raw.duration||!Number.isFinite(raw.startedAt))throw new Error('拍卖行动进度无效。');
      if(Object.keys(raw.recovery||{}).length||raw.gainedQi)throw new Error('竞拍行动不能携带额外恢复或修为。');
      params.day=p.day;params.lotId=p.lotId;params.round=p.round;duration=G.AUCTION.roundMinutes;
    }
    if(['sectJoin','sectTask','sectPromote'].includes(kind)){
      if(raw.phase!=='work'||raw.target||raw.route||raw.travelled||Object.keys(raw.recovery||{}).length||raw.gainedQi)throw new Error('宗门行动不能携带路线或额外收益。');
      if(kind==='sectTask'){
        if(!G.sectDuty(p.id)||!Number.isInteger(p.day)||p.day<1||p.day!==Math.floor(raw.startedAt/1440)+1)throw new Error('执事行动的日期或类型无效。');
        params.id=p.id;params.day=p.day;
      }
      if(kind==='sectPromote'){
        if(!Number.isInteger(p.rank)||p.rank<1||p.rank>=G.SECT.ranks.length)throw new Error('晋升身份无效。');params.rank=p.rank;
      }
      duration=G.sectWork(kind,params).minutes;
      if(raw.duration!==duration||!Number.isFinite(raw.elapsed)||raw.elapsed<0||raw.elapsed>duration||!Number.isFinite(raw.startedAt)||raw.startedAt<0||Math.abs(raw.startedAt+raw.elapsed-s.minutes)>1e-6)throw new Error('宗门行动进度与时间不一致。');
    }
    if(kind==='choice'){
      if(p.event?.kind==='auction')throw new Error('拍卖必须使用独立竞价行动。');
      params.event=cleanPending(p.event,s);
      if(!Number.isInteger(p.index)||!params.event.choices[p.index])throw new Error('正在执行的事件选项无效。');
      params.index=p.index;duration=params.event.choices[p.index].duration||0;params.duration=duration;
      if(!duration)throw new Error('即时选项不应保存为持续行动。');
      if(params.event.delivery&&s.activeOrder)throw new Error('存档包含重复待结算订单。');
    }
    let target=null;
    if(['travel','deliver','moveHome','sleep','visit','rescue'].includes(kind)){
      target=kind==='deliver'?s.activeOrder?.target:kind==='rescue'?'clinic':['sleep','moveHome'].includes(kind)?G.residence(params.id).place:kind==='visit'?G.NPCS.find(n=>n.id===params.id).place:raw.target;
      if(!G.place(target)||target!==raw.target)throw new Error('行动目的地与存档不一致。');
    }
    const a={kind,params,target,phase:raw.phase,duration,elapsed:num(raw.elapsed,0,0,duration,false),startedAt:num(raw.startedAt,s.minutes,0,s.minutes,false),route:null,travelled:0,recovery:{},gainedQi:num(raw.gainedQi,0,0,999999,false)};
    // v5 旧版充电为 30 分钟：按完成比例缩短余程，保留现有电量与已付费用。
    // 写回后 duration=10，重复读档不会再次缩短或重复补电。
    if(kind==='charge'&&raw.duration===30)a.elapsed=num(raw.elapsed,0,0,30,false)/30*duration;
    if(raw.route){
      if(!target||!Array.isArray(raw.route.points)||!G.roadAnchors(raw.route.points[0]).length)throw new Error('进行中的道路路线无效。');
      a.route=G.route(raw.route.points[0],target);a.travelled=num(raw.travelled,0,0,a.route.meters,false);
    }
    if(a.phase==='travel'){
      if(!a.route||a.route.meters<=0)throw new Error('移动行动缺少有效路线。');
      const expected=G.pointOnRoute(a.route,a.travelled),actual=G.playerPoint(s);
      if(Math.hypot(expected.x-actual.x,expected.y-actual.y)>1e-5)throw new Error('角色位置与道路行程不一致。');
    }else if(target&&s.position!==target)throw new Error('尚未到达地点，不能执行当地行动。');
    if(a.phase==='work'){
      if(['repair','upgrade'].includes(kind)&&s.position!=='garage')throw new Error('维修升级必须位于修车铺。');
      if(kind==='heal'&&s.position!=='clinic')throw new Error('治疗必须位于医馆。');
      if(kind==='meal'&&s.position!=='market')throw new Error('用餐必须位于长乐集。');
      if(kind==='explore'&&!['park','temple'].includes(s.position))throw new Error('探索地点无效。');
    }
    const cap=G.limits(s);
    // Recovery is a bounded snapshot from the start of the work phase, not an
    // arbitrary effects object. In particular it cannot award money/items/realm.
    for(const key of ['health','stamina','mana','battery','durability']){
      if(obj(raw.recovery)&&Object.hasOwn(raw.recovery,key))a.recovery[key]=num(raw.recovery[key],0,0,cap[key],false);
    }
    return a;
  }

  G.sanitizeSave = raw => {
    if(!obj(raw)||!obj(raw.player))throw new Error('不是可识别的游戏存档。');
    const version=raw.schemaVersion??raw.version;
    if(![1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20].includes(version))throw new Error('存档版本未知或高于本程序。原仓库未知格式不能保证兼容。');
    const name=str(raw.name??raw.player.name,'无名行者',64).trim();
    const mode=['classic','ai'].includes(raw.mode)?raw.mode:'classic';
    const s=G.newGame([...name].slice(0,16).join('')||'无名行者',mode,raw.seed||1);
    s.id=cleanId(raw.id);s.createdAt=num(raw.createdAt,Date.now(),0,1e15);s.updatedAt=num(raw.updatedAt,Date.now(),0,1e15);
    s.minutes=num(raw.minutes,480,0,1e8,false);s.turn=num(raw.turn,0,0,1e8);s.seed=num(raw.seed,1,1,4294967295);
    s.position=G.place(raw.position)?raw.position:'home';
    if(version>=5 && raw.position===null){
      if(!G.roadAnchors(raw.location).length)throw new Error('途中位置不在有效道路上。');
      s.position=null;s.location={x:raw.location.x,y:raw.location.y};
    }
    s.revision=num(raw.revision,0,0,1e12);
    s.orderRefreshAt=num(raw.orderRefreshAt,(Math.floor(s.minutes/15)+1)*15,s.minutes,s.minutes+15,false);
    s.transport=raw.transport==='walk'?'walk':'bike';
    s.residenceId=G.residence(raw.residenceId)?.id||'qingteng';
    if(obj(raw.gameOver)&&raw.gameOver.reason==='rent'){
      const home=G.residence(raw.gameOver.residenceId)||G.residence(s.residenceId);
      s.gameOver={reason:'rent',day:num(raw.gameOver.day,G.day(s),1,999999),residenceId:home.id,rent:home.rent,money:num(raw.gameOver.money,s.player.money,0,9999999)};
    }else s.gameOver=null;
    s.weather=G.WEATHER.some(w=>w.id===raw.weather)?raw.weather:'clear';
    s.learned=Array.isArray(raw.learned)?[...new Set(raw.learned.filter(id=>G.ITEMS.some(i=>i.id===id&&i.type==='technique')))]:[];
    s.equipment=Array.isArray(raw.equipment)?[...new Set(raw.equipment.filter(id=>G.ITEMS.some(i=>i.id===id&&i.type==='equipment')))]:[];
    const legacyLevel=num(raw.player.realmLevel,version<7&&raw.activity?.kind==='breakthrough'?9:1,1,9);
    s.player.realm=num(raw.player.realm,0,0,version<13?5:G.REALMS.length-1);
    s.player.realmLevel=s.player.realm===0?1:legacyLevel;
    if(version<13){
      s.player.mortalProgress=s.player.realm===0&&version>=7?G.LEGACY_MORTAL_PROGRESS[legacyLevel-1]:0;
    }else{
      if(!Number.isInteger(raw.player.realm)||raw.player.realm!==s.player.realm||
         !Number.isInteger(raw.player.realmLevel)||raw.player.realmLevel!==s.player.realmLevel)throw new Error('修为境界或重数无效。');
      const progress=raw.player.mortalProgress;
      if(!G.LEGACY_MORTAL_PROGRESS.includes(progress)||(s.player.realm!==0&&progress!==0))throw new Error('凡人旧修为抵扣记录无效。');
      s.player.mortalProgress=progress;
    }
    for(const k of ['money','coins','qi'])s.player[k]=num(raw.player[k],s.player[k],0,k==='money'?9999999:999999,k!=='qi');
    for(const k of ['insight','constitution','agility','luck'])s.player[k]=num(raw.player[k],5,1,99);
    for(const k of ['rep','karma'])s.player[k]=num(raw.player[k],0,-50,100);
    const v=obj(raw.vehicle)?raw.vehicle:{},levels=obj(v.levels)?v.levels:{};
    for(const k of ['speed','battery','durability'])s.vehicle.levels[k]=num(levels[k],0,0,5);
    const cap=G.limits(s);
    for(const k of ['health','stamina','mana'])s.player[k]=num(raw.player[k],cap[k],0,cap[k],false);
    s.vehicle.battery=num(v.battery,cap.battery,0,cap.battery,false);s.vehicle.durability=num(v.durability,cap.durability,0,cap.durability,false);
    const ar=obj(raw.alchemy)?raw.alchemy:{};
    const oldCauldron=num(ar.cauldron,version<=5&&raw.activity?.kind==='alchemy'?1:0,0,version<8?3:G.CAULDRONS.length-1),cauldron=version<8?(G.LEGACY_CAULDRON_MAP[oldCauldron]??0):oldCauldron;
    const ownedCauldrons=version<8?(cauldron?[cauldron]:[]):Array.isArray(ar.cauldrons)?[...new Set(ar.cauldrons.map(x=>num(x,0,0,G.CAULDRONS.length-1)).filter(Boolean))].sort((a,b)=>a-b):[];
    if(cauldron&&!ownedCauldrons.includes(cauldron))ownedCauldrons.push(cauldron);
    const xp=num(ar.xp,0,0,999999);
    const formulas=version<9
      ? G.ALCHEMY_RECIPES.filter(r=>s.player.realm>=r.realm&&xp>=r.need).map(r=>r.id)
      : Array.isArray(ar.formulas)?[...new Set(ar.formulas.filter(id=>G.alchemyRecipe(id)))]:[];
    const activeFormula=raw.activity?.kind==='alchemy'&&G.alchemyRecipe(raw.activity?.params?.recipe)?.id;
    if(activeFormula&&!formulas.includes(activeFormula))formulas.push(activeFormula);
    s.alchemy={cauldron,cauldrons:ownedCauldrons.sort((a,b)=>a-b),formulas,xp,brews:num(ar.brews,0,0,999999),successes:num(ar.successes,0,0,999999)};
    if(s.alchemy.successes>s.alchemy.brews)s.alchemy.successes=s.alchemy.brews;
    for(const item of G.ITEMS.filter(i=>!i.unique))s.inventory[item.id]=num(raw.inventory?.[item.id],0,0,9999);
    for(const k of Object.keys(s.stats))s.stats[k]=num(raw.stats?.[k],0,0,k==='distance'?1e10:1e7,k!=='distance');
    // Each expansion has its own introduction version; missing old-save entries stay hidden.
    const introduced=[...G.NEW_NPC_IDS.map(id=>[id,19]),...G.NEW_MALE_NPC_IDS.map(id=>[id,20])];
    for(const [id,since] of introduced){
      const b=raw.bonds?.[id];
      if(version<since&&b===undefined)continue;
      if(!obj(b)||typeof b.met!=='boolean'||!['none','friend','romance'].includes(b.path)||
         !Number.isInteger(b.stage)||b.stage<0||b.stage>4||
         !['affinity','trust'].every(k=>Number.isInteger(b[k])&&b[k]>=0&&b[k]<=100)||
         !Number.isInteger(b.lastTalkDay)||b.lastTalkDay<0||b.lastTalkDay>G.day(s)||
         (b.path!=='none'&&b.stage!==4)||(b.path==='romance'&&b.trust<12)||
         (b.path==='romance'&&!G.NPCS.find(n=>n.id===id).romantic)||
         (!b.met&&(b.affinity||b.trust||b.stage||b.path!=='none'||b.lastTalkDay)))
        throw new Error('新增人物羁绊记录损坏。');
    }
    for(const npc of G.NPCS){const b=raw.bonds?.[npc.id];if(obj(b)){const affinity=num(b.affinity,0,0,100),trust=num(b.trust,0,0,100),stage=num(b.stage,0,0,4),path=['friend','romance'].includes(b.path)&& (b.path!=='romance'||npc.romantic)?b.path:'none';s.bonds[npc.id]={met:b.met===true||affinity>0||trust>0||stage>0||path!=='none',affinity,trust,stage,path,lastTalkDay:num(b.lastTalkDay,0,0,G.day(s))};}}
    const d=obj(raw.daily)?raw.daily:{},day=G.day(s);
    s.daily={day,delivered:d.day===day?num(d.delivered,0):0,claimed:d.day===day&&d.claimed===true,signedDay:num(d.signedDay,0,0,day),streak:num(d.streak,0,0,day)};
    s.claimed=Array.isArray(raw.claimed)?[...new Set(raw.claimed.filter(id=>G.QUESTS.some(q=>q.id===id)))]:[];
    if(version>=18&&typeof raw.flags?.systemAwakened!=='boolean')throw new Error('存档缺少有效的外卖系统剧情状态。');
    s.flags={firstOrder:raw.flags?.firstOrder===true,systemAwakened:version>=18&&raw.flags.systemAwakened===true};
    if(s.flags.systemAwakened&&s.stats.delivered<G.SYSTEM_UNLOCK_DELIVERIES)throw new Error('外卖系统剧情完成记录与送达数量不一致。');
    s.recentEvents=Array.isArray(raw.recentEvents)?raw.recentEvents.filter(id=>G.EVENTS.some(e=>e.id===id)).slice(-4):[];
    s.unlockedEndings=Array.isArray(raw.unlockedEndings)?[...new Set(raw.unlockedEndings.filter(id=>Object.hasOwn(G.ENDINGS,id)))]:[];
    s.ending=typeof raw.ending==='string'&&Object.hasOwn(G.ENDINGS,raw.ending)?raw.ending:null;
    s.logs=Array.isArray(raw.logs)?raw.logs.filter(obj).slice(-180).map((l,i)=>({id:`restored-${s.turn}-${i}`,at:num(l.at,s.minutes,0,s.minutes,false),tag:str(l.tag,'日常',12),text:str(l.text,'',600)})):s.logs;
    s.orders=[];
    if(Array.isArray(raw.orders))for(const t of raw.orders.slice(0,6)){try {const clean=cleanTicket(t,s);if(!s.orders.some(o=>o.id===clean.id||o.target===clean.target))s.orders.push(clean);}catch{}}
    if(!s.orders.length&&version<5)G.refreshOrders(s);
    s.lastRoute=null;
    if(obj(raw.lastRoute)&&G.place(raw.lastRoute.from)&&G.place(raw.lastRoute.to))s.lastRoute=G.route(raw.lastRoute.from,raw.lastRoute.to);
    s.auction=version>=11?G.cleanAuction(raw.auction,s):G.emptyAuction();
    s.pending=raw.pending?cleanPending(raw.pending,s):null;
    s.activeOrder=version>=5&&raw.activeOrder?cleanTicket(raw.activeOrder,s):null;
    if(s.activeOrder){
      if(s.pending?.delivery)throw new Error('存档包含重复待结算订单。');
      s.orders=s.orders.filter(o=>o.id!==s.activeOrder.id&&o.target!==s.activeOrder.target);
    }
    if(version<12){
      // 旧版固定地点原本已经开放，迁移不回收；保留旧非配送行程，不把未结算订单当发现。
      const unsettled=s.activeOrder?.target||s.pending?.delivery?.target||raw.activity?.params?.event?.delivery?.target;
      const oldTarget=raw.activity&&!['deliver','choice'].includes(raw.activity.kind)?raw.activity.target:null;
      s.unlockedPlaces=[...new Set([...G.PLACES.filter(p=>p.permanent).map(p=>p.id),
        ...(s.position&&s.position!==unsettled?[s.position]:[]),...(G.place(oldTarget)&&oldTarget!==unsettled?[oldTarget]:[])])];
    }else{
      if(!Array.isArray(raw.unlockedPlaces)||raw.unlockedPlaces.length>G.PLACES.length||raw.unlockedPlaces.some(id=>typeof id!=='string'||!G.place(id)))throw new Error('地点解锁记录损坏。');
      s.unlockedPlaces=[...new Set(raw.unlockedPlaces)];
      if(!s.unlockedPlaces.includes('home')||!G.placeUnlocked(s,G.currentResidence(s).place))throw new Error('当前住处缺少地点解锁记录。');
      // 1.7.1 将修车点改为初始地点；旧 v12 补齐例外，不发发现奖励或开放其他地点。
      for(const id of G.STARTING_PLACES)if(!s.unlockedPlaces.includes(id))s.unlockedPlaces.push(id);
    }
    s.sect=version>=17?G.cleanSect(raw.sect,s):G.emptySect();
    s.activity=version>=5&&raw.activity?cleanActivity(raw.activity,s,version):null;
    if(s.activity){
      const a=s.activity,params=a.kind==='travel'?{target:a.target}:a.params;
      const blocked=G.locationBlock(s,a.kind,params);
      if(blocked)throw new Error(`进行中的行动缺少地点权限：${blocked}`);
    }
    if((s.auction.activeId||s.auction.lots.length)&&!G.placeUnlocked(s,'market'))throw new Error('拍卖记录缺少长乐集地点权限。');
    if(s.pending&&s.activity)throw new Error('待选事件与进行中行动不能同时存在。');
    if(version>=14&&!Object.hasOwn(raw,'eventResult'))throw new Error('存档缺少事件结果状态。');
    s.eventResult=version>=14?cleanEventResult(raw.eventResult,s):null;
    if(s.eventResult&&(s.activeOrder||(s.activity&&s.activity.kind!=='rescue')))throw new Error('事件结果与未完成行动冲突。');
    if(version>=15&&!Object.hasOwn(raw,'placeUnlock'))throw new Error('存档缺少地点解锁提示状态。');
    s.placeUnlock=version>=15?cleanPlaceUnlock(raw.placeUnlock,s):null;
    G.validateAuctionLinks(s);
    G.restoreFeatureUnlocks(s,raw,version);
    const binding=s.pending?.templateId==='system-awakening'||s.activity?.params?.event?.templateId==='system-awakening';
    if(binding&&!G.systemAwakeningDue(s))throw new Error('已开放的外卖系统不能重复绑定。');
    const meeting=s.pending||s.activity?.params?.event;
    if(meeting?.deliveryNpc&&G.systemAwakeningDue(s)&&!G.place(meeting.delivery.target).permanent)
      throw new Error('第十单固定剧情不能被人物相逢替换。');
    // Do not draw RNG or refill offers while loading. Accepted legacy routes stay untouched.
    if(G.systemAwakeningDue(s))s.orders=s.orders.filter(o=>!G.place(o.target).permanent);
    G.validateSectLinks(s);
    s.unlockNotices=version>=16?cleanUnlockNotices(raw.unlockNotices,s):[];
    s.schemaVersion=G.VERSION;
    if(version<G.VERSION)G.log(s,`存档已从重建版 v${version} 结构升级至 v${G.VERSION}：凡人合为单一境界，旧版已投入修为抵扣进入炼气的门槛；炼气及以上境界与重数保留，新增炼虚、合体、大乘、渡劫；既有地图、连续时间与丹方所有权继续保留；玩法入口按已完成经历、已有物品与在途行动恢复，不重复扣费或结算；拍卖冻结款与轮次成对恢复；旧版已开放的固定地点继续保留，新地点通过外卖送达解锁；新增空白结果状态，之后的选择实际结算后展示结果，确认不再次发奖；旧档不补播历史解锁弹窗，保留已有未确认地点提示；新结识人物与新开放功能保存独立待确认队列；宗门记录按原版本恢复；第十单解锁剧情新增独立完成标记，旧档已开放的外卖系统不收回；v19补六位女性、v20补九位男性的隐藏初始记录；原人物关系和配送票据保持不变。`,'存档');
    return s;
  };
  G.parseImport = text => {
    if(typeof text!=='string'||text.length>2*1024*1024)throw new Error('存档文件过大（上限 2 MB）。');
    let raw;try{raw=JSON.parse(text);}catch{throw new Error('JSON 格式损坏，未导入任何内容。');}
    const list=Array.isArray(raw?.saves)?raw.saves:[raw];
    if(!list.length||list.length>G.MAX_SAVES)throw new Error(`一次最多导入 ${G.MAX_SAVES} 个存档。`);
    return list.map(G.sanitizeSave);
  };
  G.exportSaves = saves => JSON.stringify({format:'night-courier-reborn',schemaVersion:G.VERSION,exportedAt:new Date().toISOString(),saves},null,2);
  G.createStore = storage => {
    let cache=[],warning='',unavailable=!storage,dirty=false;
    function readKey(key){const text=storage.getItem(key);if(!text)return [];const raw=JSON.parse(text);if(!obj(raw)||!Array.isArray(raw.saves))throw new Error('本地存档索引损坏。');if(raw.saves.length>G.MAX_SAVES)throw new Error('存档数量异常。');return raw.saves.map(G.sanitizeSave);}
    function load(){
      if(dirty)return cache;
      if(!storage){warning='浏览器不允许本地存储。当前进度只保留在本页，请及时导出存档。';return cache;}
      try{
        cache=readKey(G.STORAGE_KEY);
        const legacy=G.LEGACY_STORAGE_KEYS.find(k=>storage.getItem(k));
        if(storage.getItem(G.STORAGE_KEY)===null&&legacy){
          cache=readKey(legacy);
          const migrated=persist(cache);
          if(migrated.ok)warning=`已将旧存档升级到 v${G.VERSION}，角色、住处、药鼎与既有进度保留。`;
        }
      }
      catch(e){try{const backup=storage.getItem(G.BACKUP_KEY);if(!backup)throw new Error('没有备份');cache=readKey(G.BACKUP_KEY);warning='主存档损坏，已读取上一次自动备份。请先导出保存。';}catch{warning='本地存档无法读取；没有覆盖原始数据。可以导入外部备份。';}}
      return cache;
    }
    function persist(next){
      if(!storage){cache=next;dirty=true;unavailable=true;return {ok:false,error:'本地存储不可用，请导出存档。'};}
      try{
        const current=storage.getItem(G.STORAGE_KEY);
        if(current){try{readKey(G.STORAGE_KEY);storage.setItem(G.BACKUP_KEY,current);}catch(error){if(error.name==='QuotaExceededError')throw error;}}
        storage.setItem(G.STORAGE_KEY,JSON.stringify({schemaVersion:G.VERSION,saves:next}));cache=next;dirty=false;warning='';unavailable=false;return {ok:true};
      }catch(e){cache=next;dirty=true;unavailable=true;warning='自动保存失败：存储空间不足或浏览器限制。请立即导出存档。';return {ok:false,error:warning};}
    }
    return {
      load, get saves(){return cache;},get warning(){return warning;},get unavailable(){return unavailable;},
      upsert(s){const old=cache.find(x=>x.id===s.id);if(old&&old.updatedAt>s.updatedAt&&(old.turn>s.turn||old.minutes>s.minutes))return {ok:false,error:'这个存档已有较新的进度，请重新载入。'};if(!old&&cache.length>=G.MAX_SAVES)return {ok:false,error:`最多保留 ${G.MAX_SAVES} 个存档，请先导出并删除不需要的存档。`};return persist([s,...cache.filter(x=>x.id!==s.id)].sort((a,b)=>b.updatedAt-a.updatedAt));},
      remove(id){return persist(cache.filter(s=>s.id!==id));},
      import(text){const incoming=G.parseImport(text);if(cache.length+incoming.length>G.MAX_SAVES)throw new Error(`导入后超过 ${G.MAX_SAVES} 个存档，请先整理存档。`);for(const s of incoming){s.id=uid();s.updatedAt=Date.now();}return {...persist([...incoming,...cache]),count:incoming.length};},
      restoreBackup(){if(!storage)throw new Error('本地存储不可用。');const raw=storage.getItem(G.BACKUP_KEY);if(!raw)throw new Error('还没有自动备份。');const recovered=readKey(G.BACKUP_KEY);if(!recovered.length)throw new Error('备份为空。');return persist(recovered);},
      rawBackup(){if(!storage)throw new Error('本地存储不可用。');return storage.getItem(G.STORAGE_KEY)||G.exportSaves(cache);}
    };
  };
})(globalThis);
