/* 五宗规则：所有结算只由 perform / advance 调用，查询不写状态。 */
(function(root){
  'use strict';
  const G=root.NightCourier;
  const must=(ok,message)=>{if(!ok)throw new G.RuleError(message);};
  const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
  const integer=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
  G.emptySect=()=>({invited:false,member:false,rank:0,contribution:0,earned:0,completed:0,joinedAt:null,rejoinDay:0,dutyDay:0,duties:[],manuals:[],commission:null,commissionDay:0});
  G.emptySectWorld=()=>({records:Object.fromEntries(G.SECTS.slice(1).map(x=>[x.id,G.emptySect()])),stories:Object.fromEntries(G.SECTS.map(x=>[x.id,[]])),councils:[]});
  G.sectState=(s,id=G.currentSect(s).id)=>id==='tingyu'?s.sect:s.sectWorld?.records?.[id];
  G.currentSect=s=>G.SECTS.find(x=>(x.id==='tingyu'?s.sect:s.sectWorld?.records?.[x.id])?.member)||G.SECT;
  G.sectMember=s=>G.SECTS.some(x=>G.sectState(s,x.id)?.member===true);
  G.sectRank=(s,id=G.currentSect(s).id)=>G.sectDefinition(id)?.ranks[G.sectState(s,id)?.rank||0];
  G.sectManual=(s,id)=>G.SECTS.some(x=>G.sectState(s,x.id)?.manuals?.includes(id));
  G.knowsTechnique=(s,id)=>s.learned.includes(id)||G.sectManual(s,id);
  G.techniqueBonuses=s=>{
    const total=Object.fromEntries(Object.keys(G.TECHNIQUE_CAPS).map(k=>[k,0]));
    for(const t of G.TECHNIQUES)if(G.knowsTechnique(s,t.id))for(const [k,v] of Object.entries(t.bonus))total[k]+=v;
    for(const k of Object.keys(total))total[k]=Math.min(G.TECHNIQUE_CAPS[k],total[k]);
    return total;
  };
  // 吐纳真诀的 1.3 倍与门内修炼保持原乘算；其余同类收益在这里累加。
  G.sectTrainingBonus=s=>(G.sectMember(s)?G.sectRank(s).training:0)+G.techniqueBonuses(s).training-(s.learned.includes('breathing')?.30:0);
  G.sectInvitationReady=s=>G.featureUnlocked(s,'practice')&&s.player.realm>=1&&G.placeUnlocked(s,'temple')&&s.bonds.lu?.met===true;
  G.sectEntryBlock=(s,id)=>{
    const d=G.sectDefinition(id);
    if(!d)return '宗门不存在。';
    if(!G.featureUnlocked(s,'practice'))return '请先完成一次吐纳，开启进阶修行。';
    if(!G.placeUnlocked(s,d.place))return `请先通过配送解锁${G.place(d.place).name}。`;
    if(s.player.realm<d.entryRealm||(s.player.realm===d.entryRealm&&G.realmLevel(s)<d.entryLevel))return `需要${G.realmLabel({player:{realm:d.entryRealm,realmLevel:d.entryLevel}})}。`;
    if(id==='baicao'&&!G.featureUnlocked(s,'alchemy'))return '百草谷引荐需要先开放炼药玩法。';
    return '';
  };
  G.sectDuty=(id,sectId)=>sectId?G.sectDefinition(sectId)?.duties.find(d=>d.id===id):G.SECTS.flatMap(d=>d.duties).find(d=>d.id===id);
  G.sectDutyUsed=(s,id,sectId=G.currentSect(s).id)=>{const v=G.sectState(s,sectId);return v.dutyDay===G.day(s)&&v.duties.includes(id);};
  G.sectCommissionProgress=(s,id=G.currentSect(s).id)=>{const v=G.sectState(s,id);return v.commission?Math.min(G.sectDefinition(id).commission.count,Math.max(0,s.stats.delivered-v.commission.startDelivered)):0;};
  G.sectPromotionReady=(s,rank,id=G.currentSect(s).id)=>{const v=G.sectState(s,id);return !!rank&&s.player.realm>=rank.realm&&(s.player.realm>rank.realm||G.realmLevel(s)>=rank.level)&&v.earned>=rank.earned&&v.completed>=rank.completed;};
  G.sectPromotionHint=rank=>rank?`${G.realmLabel({player:{realm:rank.realm,realmLevel:rank.level}})} · 累计贡献 ${rank.earned} · 完成宗门委托 ${rank.completed} 次`:'';
  G.sectBlock=(s,action,payload={})=>{
    const id=payload.sectId??G.currentSect(s).id,d=G.sectDefinition(id),v=G.sectState(s,id);
    if(!d||!v)return '宗门不存在。';
    if(!v.invited||!G.featureUnlocked(s,'sect'))return id==='tingyu'?'请先完成陆听雨的宗门引荐剧情。':`请先完成${d.name}引荐剧情。`;
    if(!G.placeUnlocked(s,d.place))return `请先通过配送解锁${d.name}驻点。`;
    if(s.position!==d.place)return `请先沿道路前往${d.name}驻点。`;
    if(action==='sectJoin'){
      if(G.sectMember(s))return `已经加入${G.currentSect(s).name}，不能同时入两宗。`;
      const day=Math.max(...G.SECTS.map(x=>G.sectState(s,x.id).rejoinDay));
      if(G.day(s)<day)return `第 ${day} 日才可重新入宗或转宗。`;
      return G.sectEntryBlock(s,id);
    }
    if(!v.member)return `需要先加入${d.name}，不能借用别宗身份。`;
    if(action==='sectTask'){
      const task=G.sectDuty(payload.id,id);
      if(!task)return '宗门执事不存在。';
      if(v.rank<task.rank)return `需要晋升${d.ranks[task.rank].name}。`;
      if(G.sectDutyUsed(s,task.id,id))return '今日已经领过这项执事，明日再来。';
      if(s.player.stamina<task.stamina||s.player.mana<task.mana)return `需要体力 ${task.stamina}、灵力 ${task.mana}。`;
    }else if(action==='sectPromote'){
      const next=d.ranks[v.rank+1];
      if(!next)return '已经是护法长老，无需再次晋升。';
      if(!G.sectPromotionReady(s,next,id))return `晋升需要：${G.sectPromotionHint(next)}。`;
      if(v.contribution<next.cost)return `晋升需要可用贡献 ${next.cost}。`;
      if(s.player.stamina<next.stamina)return `晋升考核需要体力 ${next.stamina}。`;
    }else if(action==='sectAccept'){
      if(v.commission)return '已有未交还的外送委托。';
      if(v.commissionDay===G.day(s))return '今日已经领过外送委托，明日再来。';
    }else if(action==='sectClaim'){
      if(!v.commission||payload.id!==String(v.commission.day))return '这项外送委托已经交还或已失效。';
      if(G.sectCommissionProgress(s,id)<d.commission.count)return '领取后需要实际完成 3 单配送，再回宗门交还。';
    }else if(action==='sectBuy'){
      const item=d.library.find(i=>i.id===payload.id);
      if(!item)return '藏经阁没有这项兑换。';
      if(v.rank<item.rank)return `需要晋升${d.ranks[item.rank].name}。`;
      if(s.player.realm<(item.unlockRealm||0))return `研习需要${G.REALMS[item.unlockRealm].name}。`;
      if(item.manual&&G.sectManual(s,item.id))return '已经研习过这部典籍，不重复兑换。';
      if(v.contribution<item.cost)return `需要可用贡献 ${item.cost}。`;
      if(!item.manual&&(s.inventory[item.item]||0)+item.count>9999)return '行囊中该物品已接近上限。';
    }else if(action!=='sectLeave')return '宗门行动无效。';
    return '';
  };
  G.sectWork=(kind,p={})=>{
    const d=G.sectDefinition(p.sectId||'tingyu');
    return !d?null:kind==='sectJoin'?{minutes:d.joinMinutes,stamina:0}:kind==='sectTask'?G.sectDuty(p.id,d.id):kind==='sectPromote'?d.ranks[p.rank]:null;
  };
  G.awardSect=(s,contribution,qi,label,id=G.currentSect(s).id)=>{
    const v=G.sectState(s,id),gained=Math.min(contribution,999999-v.contribution),qiGain=Math.min(qi,999999-s.player.qi);
    v.contribution+=gained;v.earned+=gained;v.completed++;s.player.qi+=qiGain;
    G.log(s,`${label}完成。${G.sectDefinition(id).name}贡献 +${gained}，修为 +${qiGain}。`,'宗门');
  };
  G.finishSect=(s,a)=>{
    const id=a.params.sectId||'tingyu',d=G.sectDefinition(id),v=G.sectState(s,id);
    if(a.kind==='sectJoin'){
      must(!G.sectMember(s),'已经加入宗门。');v.member=true;v.joinedAt=s.minutes;
      G.log(s,`你正式加入${d.name}，身份为${G.sectRank(s,id).name}。白天送饭，夜里修行，去路仍由自己决定。`,'宗门');
    }else if(a.kind==='sectTask'){
      const task=G.sectDuty(a.params.id,id);G.awardSect(s,task.contribution,task.qi,`「${task.name}」`,id);
    }else if(a.kind==='sectPromote'){
      v.rank=a.params.rank;G.log(s,`考核完成，晋升${d.name}${G.sectRank(s,id).name}。门内修炼加成提高至 ${Math.round(G.sectRank(s,id).training*100)}%。`,'宗门');
    }
  };
  G.cleanSect=(raw,s,id='tingyu')=>{
    const d=G.sectDefinition(id);
    must(object(raw)&&typeof raw.invited==='boolean'&&typeof raw.member==='boolean','宗门存档缺失或损坏。');
    must(integer(raw.rank,0,d.ranks.length-1)&&integer(raw.contribution,0,999999)&&integer(raw.earned,raw.contribution,1e9)&&integer(raw.completed,0,1e8),'宗门身份或贡献无效。');
    must(raw.joinedAt===null||(Number.isFinite(raw.joinedAt)&&raw.joinedAt>=0&&raw.joinedAt<=s.minutes),'入宗时刻无效。');
    must(integer(raw.rejoinDay,0,G.day(s)+d.rejoinDays)&&integer(raw.dutyDay,0,G.day(s))&&integer(raw.commissionDay,0,G.day(s)),'宗门日历记录无效。');
    must(Array.isArray(raw.duties)&&raw.duties.length<=d.duties.length&&new Set(raw.duties).size===raw.duties.length&&raw.duties.every(key=>!!G.sectDuty(key,id)),'宗门执事记录无效。');
    must(Array.isArray(raw.manuals)&&new Set(raw.manuals).size===raw.manuals.length&&raw.manuals.every(key=>d.library.some(i=>i.id===key&&i.manual)),'宗门典籍记录无效。');
    must(!raw.duties.length||raw.dutyDay>0,'执事记录缺少日期。');
    must(raw.invited||(!raw.member&&raw.joinedAt===null&&!raw.rank&&!raw.earned&&!raw.completed&&!raw.manuals.length&&!raw.duties.length&&!raw.commissionDay&&!raw.rejoinDay),'未引荐的宗门记录包含非法进度。');
    must(raw.joinedAt!==null||(!raw.member&&!raw.rank&&!raw.earned&&!raw.completed&&!raw.manuals.length&&!raw.duties.length&&!raw.commissionDay&&!raw.rejoinDay),'未入宗的存档包含门内进度。');
    must(!raw.member||raw.rejoinDay<=G.day(s),'入宗状态与退出冷却冲突。');
    const rank=d.ranks[raw.rank];
    must(!raw.rank||(raw.earned>=rank.earned&&raw.completed>=rank.completed&&s.player.realm>=rank.realm&&(s.player.realm>rank.realm||G.realmLevel(s)>=rank.level)),'宗门晋升条件与记录不一致。');
    must(raw.manuals.every(key=>{const item=d.library.find(i=>i.id===key);return item.rank<=raw.rank&&s.player.realm>=(item.unlockRealm||0);})&&raw.duties.every(key=>G.sectDuty(key,id).rank<=raw.rank),'宗门记录超出当前身份。');
    const paid=d.ranks.slice(1,raw.rank+1).reduce((n,r)=>n+r.cost,0)+raw.manuals.reduce((n,key)=>n+d.library.find(i=>i.id===key).cost,0);
    must(raw.earned-raw.contribution>=paid,'宗门典籍或晋升缺少贡献支出。');
    let commission=null;
    if(raw.commission!==null){
      const t=raw.commission;must(object(t)&&raw.member&&integer(t.day,1,G.day(s))&&t.day===raw.commissionDay&&integer(t.startDelivered,0,s.stats.delivered)&&Number.isFinite(t.acceptedAt)&&t.acceptedAt>=0&&t.acceptedAt<=s.minutes&&Math.floor(t.acceptedAt/1440)+1===t.day,'外送委托记录无效。');
      commission={day:t.day,startDelivered:t.startDelivered,acceptedAt:t.acceptedAt};
    }
    return {invited:raw.invited,member:raw.member,rank:raw.rank,contribution:raw.contribution,earned:raw.earned,completed:raw.completed,joinedAt:raw.joinedAt,rejoinDay:raw.rejoinDay,dutyDay:raw.dutyDay,duties:[...raw.duties],manuals:[...raw.manuals],commission,commissionDay:raw.commissionDay};
  };
  G.cleanSectWorld=(raw,s)=>{
    must(object(raw)&&object(raw.records)&&object(raw.stories)&&Array.isArray(raw.councils),'五宗进度缺失或损坏。');
    const out=G.emptySectWorld();
    for(const d of G.SECTS){
      if(d.id!=='tingyu')out.records[d.id]=G.cleanSect(raw.records[d.id],s,d.id);
      const choices=raw.stories[d.id];
      must(Array.isArray(choices)&&choices.length<=G.SECT_STORIES[d.id].length&&choices.every(x=>integer(x,0,2)),'宗门剧情进度无效。');
      out.stories[d.id]=[...choices];
    }
    must(raw.councils.length<=G.SECT_COUNCILS.length&&raw.councils.every(x=>integer(x,0,2)),'宗际议事进度无效。');
    out.councils=[...raw.councils];return out;
  };
  G.validateSectLinks=s=>{
    const members=G.SECTS.filter(d=>G.sectState(s,d.id).member);
    must(members.length<=1,'不能同时加入两个宗门。');
    if(members.length)must(G.SECTS.every(d=>G.sectState(s,d.id).rejoinDay<=G.day(s)),'入宗状态与转宗冷却冲突。');
    for(const d of G.SECTS){
      const v=G.sectState(s,d.id),a=s.activity;
      if(v.invited){
        must(G.placeUnlocked(s,d.place)&&s.player.realm>=d.entryRealm&&(s.player.realm>d.entryRealm||G.realmLevel(s)>=d.entryLevel),'宗门引荐缺少地点或境界经历。');
        if(d.id==='tingyu')must(s.bonds.lu.met,'宗门引荐缺少人物经历。');
        else must(s.sectWorld.stories[d.id].length>0,'宗门引荐缺少已结算的剧情。');
        if(d.id==='baicao')must(G.featureUnlocked(s,'alchemy'),'百草谷记录缺少炼药资格。');
      }
      if(a&&['sectJoin','sectTask','sectPromote'].includes(a.kind)&&(a.params.sectId||'tingyu')===d.id){
        if(a.kind==='sectJoin')must(v.invited&&!members.length&&G.SECTS.every(x=>G.sectState(s,x.id).rejoinDay<=G.day(s)),'入宗仪式与宗门状态不一致。');
        if(a.kind==='sectTask')must(v.member&&a.params.day===v.dutyDay&&v.duties.includes(a.params.id)&&v.rank>=G.sectDuty(a.params.id,d.id).rank,'执事行动与领取记录不一致。');
        if(a.kind==='sectPromote'){
          const next=d.ranks[a.params.rank];must(v.member&&a.params.rank===v.rank+1&&G.sectPromotionReady(s,next,d.id),'晋升考核与当前身份不一致。');
          const paid=d.ranks.slice(1,a.params.rank+1).reduce((n,r)=>n+r.cost,0)+v.manuals.reduce((n,key)=>n+d.library.find(i=>i.id===key).cost,0);
          must(v.earned-v.contribution>=paid,'晋升考核缺少已经投入的贡献。');
        }
        must(G.placeUnlocked(s,d.place)&&s.position===d.place,'宗门行动缺少驻点地点权限。');
      }
    }
    if(s.pending?.templateId==='story-sect-invitation')must(!s.sect.invited&&G.sectInvitationReady(s),'宗门引荐剧情与实际经历不符。');
    G.validateSectStories(s);
  };
})(globalThis);
