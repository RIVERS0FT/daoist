/** Deterministic exports for later portrait production and NPC dialogue integration. */
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import '../public/js/data.js';
import '../public/js/npc-profiles.js';
const G=globalThis.NightCourier,root=dirname(dirname(fileURLToPath(import.meta.url)));
const catalog={version:G.APP_VERSION,source:'public/js/data.js + public/js/npc-profiles.js',
  scope:`${G.NPCS.length}位具名羁绊NPC，其中男性${G.NPCS.filter(n=>G.getNPCProfile(n.id).gender==='male').length}位、女性${G.NPCS.filter(n=>G.getNPCProfile(n.id).gender==='female').length}位。匿名收餐人与拍卖席位不新增独立人物。`,
  note:'外貌为本版新增的文字设计，不是对已有立绘的识别结果。半身像尚未生成；全部具名NPC均有明确实际年龄，来自可信角色配置；外观描述不覆盖实际年龄。',
  style:G.NPC_PORTRAIT_STYLE,characters:G.npcPromptCatalog()};
let md=`# 外卖修仙录 · NPC设定与提示词手册\n\n版本 ${catalog.version}。${catalog.scope}\n\n${catalog.note}\n\n来源：\`${catalog.source}\`。运行 \`npm run npc:export\` 重新生成本手册及 \`docs/npc-prompts.json\`；\`npm run check\` 会检查两者是否与源码一致，请勿只修改导出文件。\n\n## 使用方式\n\n生成半身像时，使用对应角色的“正向提示词”，支持负向提示词的工具另填“负向提示词”；统一3:4腰部以上构图，人物脸型、发型和标志性配色保持一致。需要透明底时仅替换背景句，不改人物识别特征。本手册不包含图像或模型密钥。\n\nAI对话使用“角色提示词”作为已有编剧规则的补充，不替换JSON格式或效果白名单。游戏客户端只发送NPC ID及经白名单挑选的当前关系；服务端按ID重建静态人设。只将已完成的个人话题加入上下文，不传后续个人剧情全文或未选的结局；关系数值是单机上下文，不是服务端防作弊证明。\n\n不能仅凭好感高就默认恋爱。固定剧情与攻略选择仍由游戏引擎处理。静态托管不运行Node代理，真实AI仍需运行Node服务并自行配置已有AI接口；不会调用图像服务或新增付费请求。\n\n## 总览\n\n| 角色 | 年龄 | 职业 | 性格关键词 |\n| --- | --- | --- | --- |\n`;
for(const {profile:p} of catalog.characters)md+=`| ${p.name} | ${p.age}岁 | ${p.role} | ${p.personality.traits.join('、')} |\n`;
md+='\n可攻略女性固定年龄为18、18、19、19、20、20、21、24、27岁；七人集中在18–21岁，右侧尾部延伸至27岁。不随刷新、游戏时间或读档重抽。\n';
for(const {profile:p,portrait,dialogue} of catalog.characters){
  md+=`\n## ${p.name}（${p.id}）\n\n${p.age}岁成年${p.gender==='female'?'女性':'男性'}；${p.role}；${p.id==='zhou'?'路人→朋友→兄弟→仇人（分阶段揭露）':p.romantic?'可选择友情或感情路线':'仅友情／道友路线'}。常约地点：${p.usualPlace}，不代表当前所在地。\n\n### 性格与语言\n\n性格：${p.personality.traits.join('、')}。${p.personality.tension}\n\n说话方式：${p.personality.speech}\n\n习惯：${p.personality.habits}\n\n边界：${p.personality.boundaries.join('；')}\n\n语气示例：${p.personality.exampleLine}\n\n### 职业与外貌\n\n${p.profession.description}\n\n技能：${p.profession.skills.join('、')}。日常场景：${p.profession.scenes.join('、')}。道具：${p.profession.props.join('、')}。\n\n${Object.values(p.appearance).join('；')}。\n\n### 半身像正向提示词\n\n\`\`\`text\n${portrait.positive}\n\`\`\`\n\n### 半身像负向提示词\n\n\`\`\`text\n${portrait.negative}\n\`\`\`\n\n### AI角色提示词\n\n\`\`\`text\n${dialogue}\n\`\`\`\n`;
}
md+='\n周野的分阶段画像／AI提示词在JSON的disclosureVariants字段中。默认提示词仅为普通骑手；完整编剧剧透与门槛见 ZHOU_STORY.json，游戏早期不发送这些内容给AI。\n';
const zhou=G.NPCS.find(n=>n.id==='zhou');
let story=`# 周野 · 同路与歧路

版本 ${G.APP_VERSION}。25岁，职业：骑手。以下为完整编剧剧透，不是早期人物介绍。

关系顺序：路人 → 朋友 → 兄弟 → 仇人。阶段必须逐段结算，前四段沿用原好感条件，后六段以境界、累计配送和系统开放控制。旧版完成四段的朋友存档接到兄弟阶段，不重播、不直接成仇。

蚀灯会是本作虚构的邪恶修行组织，以掠夺普通人的愿力扩张力量。周野最初为家中债务接受它的资源，后来为变强主动提供路线，并非被操纵的无辜者；他对同行的真心与其主动伤害他人的选择同时成立。第九段三个回应均决裂，不设置玩家加入组织或一键洗白路线。
`;
for(const [i,arc] of zhou.arc.entries()){
  const [title,text,...choices]=arc,g=G.ZHOU_STORY_GATES[i];
  story+=`
## 第${i+1}段：${title}

前置：前段完成；${i<4?`好感至少${g.affinity}`:`外卖系统已开启、${G.REALMS[g.realm].name}及以上、累计配送${g.delivered}单`}。关系在本段结算后为${({none:'路人',friend:'朋友',brother:'兄弟',enemy:'仇人'})[G.zhouPath(i+1)]}。

${text}
`;
  for(const [index,c] of choices.entries())story+=`
### 选择${index+1}：${c.label}

${c.result}

效果：\`${JSON.stringify(c.effects||{})}\`；耗时：${c.duration||0}游戏分钟。
`;
}
story+=`
## 结算与兼容

第六段结算后才更新修仙者身份，第七段结算后才更新蚀灯会身份；第九段结算后关系为仇人，好感与信任归零。第十段为敌对余波，之后不开放友好拜访。新订单不再抽取敌对周野，旧票据仍可完成但不恢复关系。已获得丹方和旧历史保留；未获得的周野丹方在修为揭露后、尚未成仇时按原信任要求传授。角色路线不代替十二章主线，不增加战斗、瞬移、强制结局或自动经济收益。
`;
const outputs={'docs/ZHOU_STORY.md':story,'docs/ZHOU_STORY.json':JSON.stringify({version:G.APP_VERSION,spoilers:true,character:'周野',role:'骑手',age:25,gates:G.ZHOU_STORY_GATES,arc:G.NPCS.find(n=>n.id==='zhou').arc},null,2)+'\n','docs/NPC_PROMPTS.md':md,'docs/npc-prompts.json':JSON.stringify(catalog,null,2)+'\n'};
for(const [path,text]of Object.entries(outputs)){
  if(process.argv.includes('--check')){
    let existing;try{existing=await readFile(join(root,path),'utf8');}catch{}
    if(existing!==text)throw new Error(`${path} is stale; run npm run npc:export`);
  }else await writeFile(join(root,path),text);
}
console.log(process.argv.includes('--check')?'NPC prompt exports match source.':`Exported ${G.NPCS.length} NPC profiles, portrait and dialogue prompts.`);
