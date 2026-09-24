import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import '../public/js/data.js';
import '../public/js/sects.js';
import '../public/js/npc-profiles.js';
import '../public/js/engine.js';
import '../public/js/sect-engine.js';
import '../public/js/sect-stories.js';
import '../public/js/storage.js';
import '../public/js/progression.js';

const G=globalThis.NightCourier;
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const readme=read('README.md');
const design=read('docs/GAME_DESIGN.md');
const versions=read('docs/VERSIONS.md');
const architecture=read('docs/ARCHITECTURE.md');
const memory=read('PROJECT_MEMORY.md');
const agents=read('AGENTS.md');

test('README只做项目入口，不再承载版本历史或完整玩法章节',()=>{
  assert.ok(readme.length<10000);
  assert.doesNotMatch(readme,/^##\s+1\.\d+/m);
  assert.doesNotMatch(readme,/^##\s+已实现的玩法/m);
  assert.doesNotMatch(readme,/^##\s+连续时间与操作/m);
  for(const target of ['docs/GAME_DESIGN.md','docs/VERSIONS.md','docs/ARCHITECTURE.md','PROJECT_MEMORY.md']){
    assert.ok(readme.includes(target),target);
  }
});

test('版本历史只集中在VERSIONS，未来版本模板固定为新增修复优化',()=>{
  assert.match(versions,new RegExp(`当前应用版本为 \\*\\*${G.APP_VERSION.replaceAll('.','\\.')}\\*\\*`));
  assert.match(versions,/### 新增[\s\S]*### 修复[\s\S]*### 优化/);
  assert.match(versions,/三个标题都不能省略/);
  for(const version of ['1.18.0','1.17.0','1.16.0','1.15.0','1.14.0','1.13.0','1.12.0','1.11.0','1.10.0','1.9.0','1.8.0','1.7.0','1.6.0','1.5.0','1.4.0','1.3.0','1.2.0']){
    assert.ok(versions.includes(`## ${version}`),version);
  }
  assert.doesNotMatch(architecture,/^##\s+1\.\d+/m);
  assert.doesNotMatch(memory,/^##\s+1\.\d+/m);
});

test('当前玩法设计与可信配置的核心规模保持同步',()=>{
  assert.ok(design.includes(`当前应用版本：**${G.APP_VERSION}**`));
  assert.ok(design.includes(`当前 schema：**v${G.VERSION}**`));
  assert.ok(design.includes(`110 个地点`));
  assert.ok(design.includes(`当前共有 ${G.NPCS.length} 位具名羁绊 NPC`));
  assert.ok(design.includes(`当前固定主线共十二章`));
  assert.equal(G.STORY_STAGES.length,12);
  assert.ok(design.includes(`${G.ALCHEMY_MATERIALS.length} 种药材`));
  assert.ok(design.includes(`${G.ALCHEMY_RECIPES.length} 张丹方`));
  assert.ok(design.includes(`${G.CAULDRONS.length-1} 口可拥有药鼎`));
  assert.equal(Object.keys(G.ENDINGS).length,5);
});

test('协作规则明确文档职责和下一版本三段式版本记录',()=>{
  for(const target of ['docs/GAME_DESIGN.md','docs/ARCHITECTURE.md','docs/VERSIONS.md','PROJECT_MEMORY.md'])assert.ok(agents.includes(target));
  const pos=[agents.indexOf('### 新增'),agents.indexOf('### 修复'),agents.indexOf('### 优化')];
  assert.ok(pos.every(x=>x>=0));
  assert.ok(pos[0]<pos[1]&&pos[1]<pos[2]);
  assert.match(agents,/三个部分都必须存在/);
});
