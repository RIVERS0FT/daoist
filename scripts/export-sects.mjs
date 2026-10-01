import { readFile, writeFile } from 'node:fs/promises';
import '../public/js/city-data.js';
import '../public/js/city-region-data.js';
import '../public/js/data.js';
import '../public/js/chapters.js';
import '../public/js/sects.js';
import '../public/js/engine.js';
import '../public/js/sect-engine.js';
import '../public/js/sect-stories.js';
import '../public/js/progression.js';
const G=globalThis.NightCourier;
const lines=[`# 五宗与三十六法 · 当前内容表`,``,`应用版本：${G.APP_VERSION}。本文由可信配置生成，修改源文件后运行 \`npm run sects:export\`。完整玩法规则见 [GAME_DESIGN.md](GAME_DESIGN.md)。`,``,
'## 计数与结算规则','',
'功法总数为 36：通用 11 种，五宗各 5 种。原《吐纳真诀》《轻身诀》和听雨观三本典籍均计入，不额外计数。丹方、药鼎、装备不是功法。',
'通用功法使用外卖币在系统零耗时兑换；宗门功法在所属驻点使用该宗贡献兑换。身份和境界同时满足；研习一次永久有效，不需装备槽。离宗保留功法，但门内身份加成停用。',
'上限增加不即时回血、回体或回灵。步行加成不作用于电动车，不允许瞬移或跨越路网。炼药加成不绕过丹方、药鼎、药材、境界和熟练度。',
'吐纳真诀按既有 1.3 倍参与计算，门内身份与其余修炼加成合计后乘算；淬体/入定专项收益再乘对应的 1+专项加成。同类步行加成相加，节力加成相加后减少真实移动体力消耗。',
'修炼通用加成上限 +100%，步行 +90%，淬体/入定专项各 +80%，移动体力减耗 40%；额外气血/体力/灵力上限分别 +150/+100/+180。突破加成最多 15 个百分点且最终成功率最多 95%；成丹加成最多 20 个百分点且最终最多 98%；额外成丹加成最多 20 个百分点且最终最多 65%。炼药熟练度增益最多 50%，每炉额外值向下取整且至少 1。','',
'## 五宗强弱设定','',
'以下是青岚区域的静态世界设定，不是自动胜负算法，也不会按榜单发额外奖励。宗门综合地位不同，但各自专长不可由排名替代；本版不新增战斗系统。最高战力代表本宗驻青岚体系上限，不更改既有 NPC 境界或职业。','',
'| 综合序位 | 宗门 | 主修 | 实力 | 最高战力 | 攻坚 | 防御 | 补给 | 洞察 |',
'| --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
for(const d of [...G.SECTS].sort((a,b)=>a.standing-b.standing))lines.push(`| ${d.standing} | ${d.name} | ${d.discipline} | ${d.power} | ${d.leaderRealm} | ${d.strength.combat} | ${d.strength.defense} | ${d.strength.supply} | ${d.strength.insight} |`);
lines.push('','## 功法目录','');
for(const source of ['system',...G.SECTS.map(d=>d.id)]){
 const d=G.sectDefinition(source);lines.push(`### ${d?d.name+' · '+d.discipline:'通用功法'}`,'');
 if(d)lines.push(`${d.station}（${G.place(d.place).name}）。引荐需要${G.realmLabel({player:{realm:d.entryRealm,realmLevel:d.entryLevel}})}${source==='baicao'?'，并已开放炼药':''}；驻点先通过配送发现。`,d.background,`专长：${d.specialty} 短板：${d.weakness}`,'');
 lines.push('| 名称 | 身份要求 | 境界要求 | 价格 | 实际效果 |','| --- | --- | --- | --- | --- |');
 for(const t of G.TECHNIQUES.filter(t=>t.source===source))lines.push(`| ${t.name} | ${d?d.ranks[t.rank].name:'无宗门要求'} | ${t.unlockRealm?G.REALMS[t.unlockRealm].name:'遵循入宗资格'} | ${t.cost} ${d?'宗门贡献':'外卖币'} | ${t.desc} |`);
 if(d){lines.push('','执事：','');for(const task of d.duties)lines.push(`- ${task.name}：${task.desc} ${d.ranks[task.rank].name}起，${task.minutes} 分钟，体力 ${task.stamina}，灵力 ${task.mana}，贡献 +${task.contribution}，修为 +${task.qi}。`);}
 lines.push('');
}
lines.push('## 十组初始宗际关系','','关系为 −100 至 100；50 及以上同盟，20 至 49 友好，−9 至 19 中立，−39 至 −10 戒备，−100 至 −40 敌对。关系只由已完成选项派生，读取、刷新和随机事件不漂移；转宗不清空关系。并非每对关系都从同一起点开始。','','| 宗门双方 | 初值 | 初始关系 | 形成原因 |','| --- | --- | --- | --- |');
for(const r of G.SECT_RELATIONS)lines.push(`| ${G.sectDefinition(r.a).name} / ${G.sectDefinition(r.b).name} | ${r.value} | ${G.sectRelationLabel(r.value)} | ${r.reason} |`);
lines.push('','## 固定宗门故事','','新增 20 段宗门故事和 3 场跨宗议事，另保留听雨观原有陆听雨引荐，共 24 段宗门相关固定剧情。四个新宗门的首段即引荐；听雨观新增四段门内线。每段三个选项；耗时选项完成后才改变故事前缀、引荐资格和宗际关系。','个人主线与蚀灯会身份仍沿原进度披露；蚀灯会不是可加入的第六宗门。','');
const describe=e=>{
 lines.push(`#### ${e.title}`,'',e.text,'');
 e.choices.forEach((c,i)=>{const rel=(c.relations||[]).map(r=>`${G.sectDefinition(r.a).name}/${G.sectDefinition(r.b).name} ${r.delta>0?'+':''}${r.delta}`).join('；');lines.push(`**选项 ${i+1}：${c.label}**${c.duration?`（${c.duration} 分钟）`:''}${c.requiresFriendlyPairs?`；需至少 ${c.requiresFriendlyPairs} 对宗门友好`:''}`,c.result,`结算：${G.effectText(c.effects)||'无数值奖励'}${rel?'；关系：'+rel:''}。`,'');});
};
for(const d of G.SECTS){lines.push(`### ${d.name}剧情线`,'');for(const e of G.SECT_STORIES[d.id]){lines.push(e.introduction?'门槛：符合引荐条件，未获引荐，在驻点主动了解。':`门槛：前段完成、本宗${d.ranks[e.rank].name}、完成本宗委托 ${e.completed} 次、本人在驻点。`,'');describe(e);}}
lines.push('### 跨宗议事','','地点为长乐集会馆；无需当前入宗，散修可以参加。必须依次完成，不中断已接配送。第三场可按互信选择共同守城，也可选择有限协作或分区自守，不以结盟强制替玩家作决定。','');
for(const e of G.SECT_COUNCILS){lines.push(`门槛：${G.REALMS[e.realm].name}、累计配送 ${e.deliveries} 单、取得 ${e.known} 宗引荐。`,'');describe(e);}
const output=lines.join('\n').trimEnd()+'\n',path=new URL('../docs/SECTS_AND_TECHNIQUES.md',import.meta.url);
if(process.argv.includes('--check')){if(await readFile(path,'utf8').catch(()=>null)!==output)throw new Error('五宗功法文档与可信配置不一致，请运行 npm run sects:export。');console.log('五宗功法与剧情目录一致。');}
else {await writeFile(path,output);console.log('已生成 docs/SECTS_AND_TECHNIQUES.md');}
