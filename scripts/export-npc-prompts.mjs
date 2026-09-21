/** Deterministic exports for later portrait production and NPC dialogue integration. */
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import '../public/js/data.js';
import '../public/js/npc-profiles.js';
const G=globalThis.NightCourier,root=dirname(dirname(fileURLToPath(import.meta.url)));
const catalog={version:G.APP_VERSION,source:'public/js/data.js + public/js/npc-profiles.js',
  scope:'12位具名羁绊NPC。匿名收餐人与拍卖席位不新增独立人物。',
  note:'外貌为本版新增的文字设计，不是对已有立绘的识别结果。半身像尚未生成；男性实际年龄未设，外观年龄不等于实际年龄。',
  style:G.NPC_PORTRAIT_STYLE,characters:G.npcPromptCatalog()};
let md=`# 外卖修仙录 · NPC设定与提示词手册\n\n版本 ${catalog.version}。${catalog.scope}\n\n${catalog.note}\n\n来源：\`${catalog.source}\`。运行 \`npm run npc:export\` 重新生成本手册及 \`docs/npc-prompts.json\`；\`npm run check\` 会检查两者是否与源码一致，请勿只修改导出文件。\n\n## 使用方式\n\n生成半身像时，使用对应角色的“正向提示词”，支持负向提示词的工具另填“负向提示词”；统一3:4腰部以上构图，人物脸型、发型和标志性配色保持一致。需要透明底时仅替换背景句，不改人物识别特征。本手册不包含图像或模型密钥。\n\nAI对话使用“角色提示词”作为已有编剧规则的补充，不替换JSON格式或效果白名单。游戏客户端只发送NPC ID及经白名单挑选的当前关系；服务端按ID重建静态人设。只将已完成的个人话题加入上下文，不传后续四段剧情全文或未选的结局；关系数值是单机上下文，不是服务端防作弊证明。\n\n不能仅凭好感高就默认恋爱。固定剧情与攻略选择仍由游戏引擎处理。Pages为静态部署，真实AI仍需运行Node服务并自行配置已有AI接口；不会调用图像服务或新增付费请求。\n\n## 总览\n\n| 角色 | 年龄 | 职业 | 性格关键词 |\n| --- | --- | --- | --- |\n`;
for(const {profile:p} of catalog.characters)md+=`| ${p.name} | ${p.age===null?'实际年龄未设':`${p.age}岁`} | ${p.role} | ${p.personality.traits.join('、')} |\n`;
md+='\n可攻略女性固定年龄为18、18、19、19、20、20、21、24、27岁；七人集中在18–21岁，右侧尾部延伸至27岁。不随刷新、游戏时间或读档重抽。\n';
for(const {profile:p,portrait,dialogue} of catalog.characters){
  md+=`\n## ${p.name}（${p.id}）\n\n${p.age===null?'成年男性，实际年龄未设':`${p.age}岁成年女性`}；${p.role}；${p.romantic?'可选择友情或感情路线':'仅友情／道友路线'}。常约地点：${p.usualPlace}，不代表当前所在地。\n\n### 性格与语言\n\n性格：${p.personality.traits.join('、')}。${p.personality.tension}\n\n说话方式：${p.personality.speech}\n\n习惯：${p.personality.habits}\n\n边界：${p.personality.boundaries.join('；')}\n\n语气示例：${p.personality.exampleLine}\n\n### 职业与外貌\n\n${p.profession.description}\n\n技能：${p.profession.skills.join('、')}。日常场景：${p.profession.scenes.join('、')}。道具：${p.profession.props.join('、')}。\n\n${Object.values(p.appearance).join('；')}。\n\n### 半身像正向提示词\n\n\`\`\`text\n${portrait.positive}\n\`\`\`\n\n### 半身像负向提示词\n\n\`\`\`text\n${portrait.negative}\n\`\`\`\n\n### AI角色提示词\n\n\`\`\`text\n${dialogue}\n\`\`\`\n`;
}
const outputs={'docs/NPC_PROMPTS.md':md,'docs/npc-prompts.json':JSON.stringify(catalog,null,2)+'\n'};
for(const [path,text]of Object.entries(outputs)){
  if(process.argv.includes('--check')){
    let existing;try{existing=await readFile(join(root,path),'utf8');}catch{}
    if(existing!==text)throw new Error(`${path} is stale; run npm run npc:export`);
  }else await writeFile(join(root,path),text);
}
console.log(process.argv.includes('--check')?'NPC prompt exports match source.':'Exported 12 NPC profiles, portrait and dialogue prompts.');
