import {readFile,writeFile} from 'node:fs/promises';
import '../public/js/city-data.js';
import '../public/js/city-region-data.js';
import '../public/vendor/fflate/fflate.js';
import '../public/js/city-routes.js';
import '../public/js/data.js';
import '../public/js/chapters.js';
import '../public/js/sects.js';
import '../public/js/engine.js';
import '../public/js/sect-engine.js';
import '../public/js/sect-stories.js';
import '../public/js/progression.js';
const G=NightCourier;
const lines=['# 全市区域与十六章内容大纲','',
 '本文由 `public/js/chapters.js`、章节门槛与当前道路数据生成，运行 `npm run chapters:export` 更新。它是后续扩写的内容契约，不表示三幕中的每个支线素材都已经实现为可触发事件。已落地固定节点按事件 ID 列出；当前第六章使用成长和人物里程碑衔接。','',
 '## 通行与进度','',
 '- 十六章与十六个行政边界区域一一对应，每章开放一个区；已开放区保留。原 485 个地点 ID 和坐标不变，原 110 个地点仍在首章。区域名称与全部游戏地名均虚构。',
 '- 区域轮廓取自上海十六个行政区的真实 OSM 多面体，与上海市界求交；支持凹区、洞及多个不相连的部分。市外背景不归入最近区域，也不能借道通行。',
 '- 未开放区显示轮廓、名字与所需章节，隐藏街巷细节。不可进入、途经、接单、选作目的地；地图镜头可以预览锁定区。',
 '- 寻路逐路段检查整段边界，不仅检查端点。开放但需借道锁定区的地址暂不发单。章节开放不自动发现地点、结识人物或发奖。',
 '- 岛屿开放仍不新增轮渡或跨水捷径；只有现有共享路网可达的地址能配送。',
 `- 应用 ${G.APP_VERSION} / 存档 v${G.VERSION}，从新旅程开始；不读取、迁移、删除 v24 或更早存储键及用户文件。`,'',
 '## 区域顺序','',
 '| 章节 | 篇名 | 区域 | 地址数 | 当章从住处可达 |', '| --- | --- | --- | ---: | ---: |'];
for(const r of G.MAP_REGIONS){const places=G.PLACES.filter(p=>G.placeRegion(p.id)===r);lines.push(`| ${r.chapter} | ${G.STORY_STAGES[r.chapter-1].title} | ${r.name} | ${places.length} | ${places.filter(p=>Number.isFinite(G.routeMeters(G.place('home'),p.id,r.chapter))).length} |`);}
lines.push('','“当章可达”按该章及之前已开放区域的真实道路计算。青禾水乡有一个地址仅可借道市外路网，当前暂不生成订单；沧澜群洲没有现有路网可达地址，不补造道路或轮渡。','',
 '## 生成任务模板','',
 '每次扩写提供：当前章节 ID、当前区域 ID、已结算固定节点、已结识人物及其当前阶段、当前真实地点与时间、已有事件摘要。只选一个支线题材，不能一次生成跨越多个章节的故事。','',
 '内容任务字段：`chapterId`、`regionId`、`scenePurpose`、`prerequisites`、`participants`、`locationId`、`opening`、`choices[3]`、`consequences`、`foreshadowing`、`continuityChecks`。这是离线编剧模板；运行时 AI 仍只接受原 `title/text/choices` 白名单，不能写玩法状态。','',
 '验收要求：一处具体生活细节；三个态度与代价不同的选择；至少一个无资源成本的可选项；结果与效果一致；不自动恋爱、入宗、改职业、改地点、解锁区域或改变主线标记。NPC 必须已结识且使用当前阶段可信人设；否则使用匿名居民。','',
 '章节主题贯穿普通事件，固定结论只由列出的经典主线节点结算。当前章三幕和收束可能包含剧透，仅供编剧；局内界面仅展示风貌、主题和开区条件。服务端以可信配置重建当前章事实、禁透范围与区域风貌，不接受客户端提供的大纲正文。','');
for(const c of G.CHAPTER_OUTLINES){lines.push(`## ${G.STORY_STAGES[c.number-1].chapter} · ${G.STORY_STAGES[c.number-1].title}`,'',`区域：**${c.area}**。进入条件：${c.entry}。`,'',`风貌：${c.setting}`,'',`核心矛盾：${c.conflict}`,'','### 三幕推进','',...c.beats.map((b,i)=>`${i+1}. ${b}`),'','### 支线与人物','',...c.side.map(v=>`- ${v}`),'',`人物池（仅已结识者可用）：${c.cast.map(id=>G.NPCS.find(n=>n.id===id).name).join('、')}。`,'','### 内容边界','',`已知事实：${c.facts.join('；')}。`,'',`不得提前生成：${c.withheld.join('；')}。`,'',`已落地固定节点：${c.events.length?c.events.map(id=>`\`${id}\``).join('、'):'无新增固定事件；以章节进入条件和成长里程碑衔接'}。`,'',`收束与下一章：${c.exit}`,'');}
const result=lines.join('\n'),file=new URL('../docs/CHAPTER_OUTLINES.md',import.meta.url);
if(process.argv.includes('--check')){if(await readFile(file,'utf8')!==result)throw Error('Run npm run chapters:export to update the chapter bible.');}
else await writeFile(file,result);
console.log('Chapter outline document is current.');
