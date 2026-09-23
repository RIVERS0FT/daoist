import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/js/data.js';
import '../public/js/engine.js';
import '../public/js/storage.js';
import '../public/js/progression.js';

const G=globalThis.NightCourier;
const chapterIds=['mortal','bound','second-city','circle','guardian','system','truth','divine','void','unity','mahayana','tribulation'];
const coreEvents=[
  'first-order','system-awakening','story-street-vein','story-second-city','story-lantern-network',
  'story-system-doubt','story-system-truth','story-divine-echo','story-divine-consent',
  'story-void-letter','story-void-return','story-unity-burden','story-unity-covenant',
  'story-mahayana-rookie','story-mahayana-ordinary','story-tribulation-question','story-tribulation-dawn'
];

test('十二章都有扩写主题、章节问题和至少三个人物侧写，21位NPC全部进入主线视角',()=>{
  assert.equal(G.APP_VERSION,'1.18.0');
  assert.equal(G.VERSION,21);
  assert.deepEqual(G.STORY_STAGES.map(stage=>stage.id),chapterIds);
  assert.deepEqual(G.CHAPTER_CHARACTER_BEATS.map(stage=>stage.id),chapterIds);
  const covered=new Set();
  for(const [index,chapter] of G.CHAPTER_CHARACTER_BEATS.entries()){
    const stage=G.STORY_STAGES[index];
    assert.ok(stage.desc.length>=65,`${stage.chapter} description is too short`);
    assert.ok(chapter.question.length>=20,`${stage.chapter} question is too short`);
    assert.ok(chapter.beats.length>=3,`${stage.chapter} needs at least three character beats`);
    assert.ok(Object.isFrozen(chapter)&&Object.isFrozen(chapter.beats));
    for(const beat of chapter.beats){
      const npc=G.NPCS.find(n=>n.id===beat.npc);
      assert.ok(npc,`unknown NPC ${beat.npc}`);
      assert.ok(beat.text.length>=35,`${stage.chapter}/${npc.name} beat is too short`);
      covered.add(beat.npc);
    }
  }
  assert.deepEqual([...covered].sort(),G.NPCS.map(n=>n.id).sort());
});

test('章节人物侧写只返回已结识人物，查询不推进状态、不抽随机数、不解锁人物',()=>{
  const s=G.newGame('章节侧写查询','classic',1729);
  const before=G.clone(s);
  assert.deepEqual(G.chapterCharacterNotes(s,'circle').notes,[]);
  assert.deepEqual(s,before);
  s.bonds.han.met=true;
  s.bonds.yue.met=true;
  const marked=G.clone(s),notes=G.chapterCharacterNotes(s,'circle');
  assert.deepEqual(notes.notes.map(note=>note.id),['han','yue']);
  assert.ok(notes.notes.every(note=>note.name&&note.role&&note.text));
  assert.ok(!notes.notes.some(note=>['zhao','song'].includes(note.id)));
  assert.deepEqual(s,marked);
  assert.deepEqual(G.visibleNPCs(G.newGame('仍然隐藏')),[]);
});

test('周野在第一章章节侧写只保持普通骑手信息，不提前泄露修为、组织或反目',()=>{
  const chapter=G.CHAPTER_CHARACTER_BEATS.find(entry=>entry.id==='mortal');
  const beat=chapter.beats.find(entry=>entry.npc==='zhou');
  assert.ok(beat);
  assert.doesNotMatch(beat.text,/修仙|修为|灵力|蚀灯会|组织|黑签|邪恶|背叛|仇人/);
  const s=G.newGame('周野未剧透','classic',811);
  s.bonds.zhou.met=true;
  const note=G.chapterCharacterNotes(s,'mortal').notes.find(entry=>entry.id==='zhou');
  assert.ok(note);
  assert.equal(note.role,'骑手');
  assert.doesNotMatch(JSON.stringify(note),/蚀灯会|修仙者|组织成员|仇人/);
});

test('扩写后的固定主线仍使用原事件ID和三选项，不引入新的经济或结算机制',()=>{
  for(const id of coreEvents){
    const event=G.EVENTS.find(e=>e.id===id);
    assert.ok(event,`missing ${id}`);
    assert.ok(event.text.length>=120,`${id} story text is too short`);
    assert.equal(event.choices.length,3,`${id} must remain three-choice`);
  }
  const higher=G.HIGHER_STORY_CHAPTERS.flatMap(ch=>ch.events);
  assert.deepEqual(higher,coreEvents.slice(7));
  for(const id of higher){
    const event=G.EVENTS.find(e=>e.id===id);
    assert.ok(event.choices.every(choice=>!('coins' in choice.effects)&&!('money' in choice.effects)&&!choice.path));
  }
});

test('未知章节侧写返回空结果；显式查询旧章节不会改变当前主线或人物关系',()=>{
  const s=G.newGame('只读边界','classic',913);
  s.unlockedFeatures=['system'];
  s.flags.systemAwakened=true;
  s.stats.delivered=10;
  const stage=G.storyStageLabel(s),before=G.clone(s);
  assert.deepEqual(G.chapterCharacterNotes(s,'missing'),{question:'',notes:[]});
  G.chapterCharacterNotes(s,'mortal');
  G.chapterCharacterNotes(s,'tribulation');
  assert.equal(G.storyStageLabel(s),stage);
  assert.deepEqual(s,before);
});
