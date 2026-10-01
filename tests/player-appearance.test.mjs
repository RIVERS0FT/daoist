import test from 'node:test';
import assert from 'node:assert/strict';
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
import '../public/js/storage.js';
import '../public/js/progression.js';

const G=globalThis.NightCourier;
const fresh=(appearanceId=G.DEFAULT_APPEARANCE_ID,mode='classic')=>G.newGame('云行',mode,24681357,appearanceId);
const roundtrip=s=>G.sanitizeSave(JSON.parse(JSON.stringify(s)));
const comparable=s=>{
  const copy=G.clone(s);
  for(const key of ['id','appearanceId','createdAt','updatedAt'])delete copy[key];
  return copy;
};
class MemoryStorage {
  data=new Map();
  reads=[];
  writes=[];
  getItem(key){this.reads.push(key);return this.data.get(key)??null;}
  setItem(key,value){this.writes.push(key);this.data.set(key,String(value));}
  removeItem(key){this.data.delete(key);}
}
const invalidIds=['','female-rider','unknown','__proto__','constructor','toString','../art/player.png','https://example.com/player.png',null,0,{},['male-rider-steady']];

test('玩家形象仅有冻结的清朗骑手与沉稳骑手配置，查询拒绝非白名单值',()=>{
  assert.deepEqual(G.PLAYER_APPEARANCES.map(({id,name})=>({id,name})),[
    {id:'male-rider',name:'清朗骑手'},{id:'male-rider-steady',name:'沉稳骑手'}
  ]);
  assert.ok(Object.isFrozen(G.PLAYER_APPEARANCES));
  for(const appearance of G.PLAYER_APPEARANCES){
    assert.ok(Object.isFrozen(appearance));
    assert.equal(G.playerAppearance(appearance.id),appearance);
  }
  for(const id of [...invalidIds,undefined])assert.equal(G.playerAppearance(id),null);
  assert.equal(G.DEFAULT_APPEARANCE_ID,'male-rider');
});

test('三参数创建入口保留 seed 兼容，并默认清朗骑手',()=>{
  const s=G.newGame('云行','classic',24681357),explicit=fresh('male-rider');
  assert.equal(s.appearanceId,'male-rider');
  assert.deepEqual(comparable(s),comparable(explicit));
  assert.equal(G.newGame('云行').appearanceId,G.DEFAULT_APPEARANCE_ID);
});

test('两款形象均可在经典与 AI 模式创建，非法显式形象拒绝创建',()=>{
  for(const {id} of G.PLAYER_APPEARANCES)for(const mode of ['classic','ai']){
    const s=fresh(id,mode);
    assert.equal(s.appearanceId,id);
    assert.equal(s.mode,mode);
  }
  for(const id of invalidIds)assert.throws(()=>fresh(id),G.RuleError);
});

test('当前 v25 缺失形象字段时使用默认形象，原始对象保持不变',()=>{
  const raw=fresh('male-rider-steady');delete raw.appearanceId;
  const before=G.clone(raw),restored=G.sanitizeSave(raw);
  assert.equal(restored.appearanceId,G.DEFAULT_APPEARANCE_ID);
  assert.deepEqual(raw,before);
  assert.deepEqual(comparable(restored).orders,raw.orders);
  assert.equal(restored.seed,raw.seed);
});

test('当前存档显式非法值和 undefined 拒绝导入，不能回退默认形象',()=>{
  for(const id of [...invalidIds,undefined]){
    const raw=fresh();raw.appearanceId=id;
    assert.throws(()=>G.sanitizeSave(raw),/玩家形象无效/);
    if(id!==undefined)assert.throws(()=>G.parseImport(JSON.stringify(raw)),/玩家形象无效/);
  }
  assert.throws(()=>G.parseImport(JSON.stringify({saves:[fresh(),{...fresh(),appearanceId:'constructor'}]})),/玩家形象无效/);
  assert.equal({}.appearanceId,undefined);
});

test('历史和未来 schema 即使缺失形象字段也明确拒绝，不迁移或改写',()=>{
  for(const schemaVersion of [1,24,G.VERSION+1,undefined]){
    const raw=fresh();raw.schemaVersion=schemaVersion;delete raw.appearanceId;
    const before=G.clone(raw);
    assert.throws(()=>G.sanitizeSave(raw),/不支持此存档版本/);
    assert.deepEqual(G.clone(raw),before);
  }
  assert.equal(G.VERSION,25);
  assert.equal(G.STORAGE_KEY,'night-courier:saves:v25');
  assert.equal(G.BACKUP_KEY,'night-courier:saves:v25:backup');
});

test('两款形象均可清洗和导入导出，导入创建副本并保留形象',()=>{
  const saves=G.PLAYER_APPEARANCES.map(({id})=>fresh(id));
  for(const s of saves)assert.equal(roundtrip(s).appearanceId,s.appearanceId);
  const parsed=G.parseImport(G.exportSaves(saves));
  assert.deepEqual(parsed.map(s=>s.appearanceId),saves.map(s=>s.appearanceId));
  const storage=new MemoryStorage(),store=G.createStore(storage);store.load();
  assert.equal(store.upsert(saves[0]).ok,true);
  assert.equal(store.import(G.exportSaves(saves)).ok,true);
  assert.equal(store.saves.length,3);
  assert.deepEqual(store.saves.slice(0,2).map(s=>s.appearanceId),saves.map(s=>s.appearanceId));
  for(const imported of store.saves.slice(0,2))assert.ok(!saves.some(s=>s.id===imported.id));
  assert.equal(G.createStore(storage).load().find(s=>s.appearanceId==='male-rider-steady').appearanceId,'male-rider-steady');
});

test('真实移动中自动保存和读档保留形象、沿路位置与资源',()=>{
  for(const {id} of G.PLAYER_APPEARANCES){
    const storage=new MemoryStorage(),store=G.createStore(storage);store.load();
    let s=fresh(id);assert.equal(store.upsert(s).ok,true);
    const accepted=G.perform(s,'deliver',{id:s.orders[0].id});assert.equal(accepted.ok,true,accepted.error);
    s=G.advance(accepted.state,.1);s.updatedAt+=1;
    assert.equal(store.upsert(s).ok,true);
    const restored=G.createStore(storage).load()[0];
    assert.equal(restored.appearanceId,id);
    assert.deepEqual(restored.location,s.location);
    assert.equal(restored.minutes,s.minutes);
    assert.equal(restored.player.stamina,s.player.stamina);
    assert.equal(restored.vehicle.battery,s.vehicle.battery);
    assert.equal(restored.activeOrder.id,s.activeOrder.id);
    assert.equal(restored.activity.travelled,s.activity.travelled);
  }
});

test('上次写入备份保留形象，主档形象损坏回退且原始数据保留',()=>{
  const storage=new MemoryStorage(),store=G.createStore(storage);store.load();
  const s=fresh('male-rider-steady');store.upsert(s);
  const next=G.advance(s,.5);next.updatedAt+=1;store.upsert(next);
  const backup=storage.getItem(G.BACKUP_KEY);
  assert.equal(JSON.parse(backup).saves[0].appearanceId,'male-rider-steady');
  const corrupted=JSON.parse(storage.getItem(G.STORAGE_KEY));corrupted.saves[0].appearanceId=null;
  const original=JSON.stringify(corrupted);storage.setItem(G.STORAGE_KEY,original);
  const recovered=G.createStore(storage);
  assert.equal(recovered.load()[0].appearanceId,'male-rider-steady');
  assert.match(recovered.warning,/已读取上一次自动备份/);
  assert.equal(storage.getItem(G.STORAGE_KEY),original);
  assert.equal(storage.getItem(G.BACKUP_KEY),backup);
  assert.equal(recovered.restoreBackup().ok,true);
  assert.equal(G.createStore(storage).load()[0].appearanceId,'male-rider-steady');
});

test('损坏形象无备份时保留原数据，混合导入失败不部分写入',()=>{
  const storage=new MemoryStorage(),bad={...fresh(),appearanceId:'__proto__'};
  const original=JSON.stringify({schemaVersion:G.VERSION,saves:[bad]});storage.setItem(G.STORAGE_KEY,original);
  const store=G.createStore(storage);assert.deepEqual(store.load(),[]);
  assert.match(store.warning,/没有覆盖原始数据/);
  assert.equal(storage.getItem(G.STORAGE_KEY),original);
  const writes=storage.writes.length;
  assert.throws(()=>store.import(G.exportSaves([fresh('male-rider-steady'),bad])),/玩家形象无效/);
  assert.equal(store.saves.length,0);
  assert.equal(storage.writes.length,writes);
  assert.equal(storage.getItem(G.STORAGE_KEY),original);
});

test('形象新增字段不访问、不迁移或删除历史存储键',()=>{
  const storage=new MemoryStorage(),oldKey='night-courier:saves:v24',old='historical-save';
  storage.setItem(oldKey,old);const store=G.createStore(storage);store.load();store.upsert(fresh('male-rider-steady'));
  assert.ok(storage.reads.every(key=>key===G.STORAGE_KEY||key===G.BACKUP_KEY));
  assert.equal(storage.data.get(oldKey),old);
});

test('形象不改变资源、时间、人物、seeded 订单和后续世界模拟',()=>{
  let clear=fresh('male-rider'),steady=fresh('male-rider-steady');
  assert.deepEqual(comparable(clear),comparable(steady));
  for(const minutes of [.5,14.5,30]){
    clear=G.advance(clear,minutes);steady=G.advance(steady,minutes);
    assert.deepEqual(comparable(clear),comparable(steady));
    assert.equal(clear.appearanceId,'male-rider');assert.equal(steady.appearanceId,'male-rider-steady');
  }
  const seed=steady.seed,orders=G.clone(steady.orders),original=G.clone(steady);
  const result=G.perform(steady,'setAppearance',{appearanceId:'male-rider'});
  assert.equal(result.ok,false);assert.equal(result.state,steady);
  assert.deepEqual(steady,original);assert.equal(steady.seed,seed);assert.deepEqual(steady.orders,orders);
});
