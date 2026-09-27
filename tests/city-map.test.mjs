import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/js/city-data.js';
import '../public/vendor/fflate/fflate.js';
import '../public/js/city-routes.js';
import '../public/js/data.js';
import '../public/js/chapters.js';
import '../public/js/sects.js';
import '../public/js/engine.js';
import '../public/js/sect-engine.js';
import '../public/js/sect-stories.js';
import '../public/js/storage.js';
import '../public/js/map-art.js';
const G=globalThis.NightCourier;
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('真实数据具备来源节点和边，原 110 个地点与新增全市地址落在连通路网',()=>{
  assert.equal(G.CITY_DATA.id,'shanghai-old-city-20260926');
  assert.equal(G.WORLD.metersPerUnit,1);
  assert.ok(G.ROAD_NODES.length>5000);assert.ok(G.ROAD_EDGES.length>6000);
  assert.equal(new Set(G.PLACES.map(p=>p.osmId)).size,G.PLACES.length);
  assert.equal(G.PLACES.filter(p=>!p.regional).length,110);
  assert.ok(G.PLACES.filter(p=>p.regional).length>=300);
  for(const p of G.PLACES){assert.equal(G.roadAnchors(p).length,1);assert.ok(G.route('home',p.id).meters>=0);}
  assert.ok(G.ROAD_EDGES.filter(e=>{const a=G.ROAD_NODES[e.from],b=G.ROAD_NODES[e.to];return a.x!==b.x&&a.y!==b.y;}).length>G.ROAD_EDGES.length*.8);
});

test('制图复用全部道路边，保持状态不变且只显示虚构地名',()=>{
  const before=JSON.stringify([G.PLACES,G.ROAD_NODES,G.ROAD_EDGES]),svg=G.MapArtwork.render();
  assert.equal(JSON.stringify([G.PLACES,G.ROAD_NODES,G.ROAD_EDGES]),before);
  for(const kind of new Set(G.CORE_ROAD_EDGES.map(e=>e.kind))){
    const expected=G.MapArtwork.edgePath(G.CORE_ROAD_EDGES.filter(e=>e.kind===kind));
    assert.ok(svg.includes(`data-road-kind="${kind}" d="${expected}"`));
  }
  assert.doesNotMatch(svg,/上海|人民路|中华路|河南南路|福佑路|豫园|老西门|黄浦江|NaN|Infinity/);
  assert.match(svg,/沧 江/);
});

test('真实道路任意线段中的位置可以继续寻路，偏离路面坐标拒绝',()=>{
  for(const edge of G.ROAD_EDGES.filter((_,i)=>i%Math.ceil(G.ROAD_EDGES.length/24)===0)){
    const a=G.ROAD_NODES[edge.from],b=G.ROAD_NODES[edge.to];
    const p={x:a.x+(b.x-a.x)*.371,y:a.y+(b.y-a.y)*.371};
    assert.ok(G.roadAnchors(p).length);const route=G.route(p,'home');
    assert.deepEqual(route.points[0],p);
    near(route.meters,route.points.slice(1).reduce((v,q,i)=>v+G.roadDistance(route.points[i],q),0));
  }
  assert.deepEqual(G.roadAnchors({x:-1,y:-1}),[]);
});

test('沿真实弯折行驶、停止再规划、多次读档均无瞬移或重复扣费',()=>{
  let s=G.newGame('路测','classic',123);s.unlockedPlaces=G.PLACES.filter(p=>!p.regional).map(p=>p.id);
  s=G.perform(s,'travel',{target:'temple'}).state;
  const total=s.activity.route.meters;s=G.advance(s,G.activityRemaining(s)*.371);
  assert.equal(s.position,null);near(s.stats.distance,total*.371);
  near(s.vehicle.battery,80-s.stats.distance*.005);
  for(let i=0;i<3;i++){const at=G.playerPoint(s),battery=s.vehicle.battery;s=G.sanitizeSave(G.clone(s));assert.deepEqual(G.playerPoint(s),at);near(s.vehicle.battery,battery);}
  const p=G.playerPoint(s);s=G.perform(s,'stop').state;s=G.perform(s,'travel',{target:'garage'}).state;
  assert.deepEqual(s.activity.route.points[0],p);assert.deepEqual(G.playerPoint(s),p);
});

test('v1–v23、缺少版本以及未来版本明确拒绝，现代存档仍正常往返',()=>{
  const s=G.newGame('新城','classic',42);
  for(const version of [...Array.from({length:23},(_,i)=>i+1),undefined,25]){
    const old={...G.clone(s),schemaVersion:version},before=JSON.stringify(old);
    assert.throws(()=>G.sanitizeSave(old),/不支持此存档版本/);assert.equal(JSON.stringify(old),before);
  }
  const copy=G.sanitizeSave(G.clone(s));assert.deepEqual(copy.player,s.player);assert.deepEqual(copy.orders,s.orders);
  assert.equal(G.LEGACY_STORAGE_KEYS,undefined);assert.equal(G.MapGeometry,undefined);assert.equal(G.GRID_X,undefined);
});

test('地点坐标损坏或漂移时明确拒绝，不能静默吸附回道路',()=>{
  const s=G.newGame('位置校验');
  for(const location of [{x:NaN,y:0},{x:0,y:Infinity},{},{x:G.place('home').x+1,y:G.place('home').y}]){
    assert.throws(()=>G.sanitizeSave({...s,location}),/地点与坐标/);
  }
});

test('旧存储键不读取、不迁移、不覆盖，新档备份独立',()=>{
  const values=new Map([['night-courier:saves:v22','old-data'],['night-courier:saves:backup','old-backup']]),reads=[];
  const storage={getItem:k=>{reads.push(k);return values.get(k)??null;},setItem:(k,v)=>values.set(k,String(v))};
  const store=G.createStore(storage);assert.deepEqual(store.load(),[]);assert.deepEqual(reads,[G.STORAGE_KEY]);
  const s=G.newGame('独立');assert.ok(store.upsert(s).ok);assert.ok(store.upsert(s).ok);
  assert.equal(values.get('night-courier:saves:v22'),'old-data');assert.equal(values.get('night-courier:saves:backup'),'old-backup');
  assert.ok(values.get(G.BACKUP_KEY));
});
