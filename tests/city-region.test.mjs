import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
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
const G=NightCourier;

test('扩图保留已发布数据库字节、全部原地点和节点坐标；新增地址只在连通道路上',async()=>{
  const bytes=await readFile(new URL('../public/js/city-data.js',import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),'804b67e2d48d54646c322c92b8125b0c3425c083db41fcd29902eff45fe4d582');
  for(const [i,[osmId,x,y]] of G.CITY_DATA.nodes.entries())assert.deepEqual(G.ROAD_NODES[i],{osmId,x,y});
  assert.equal(G.PLACES.filter(p=>!p.regional).length,110);
  assert.ok(G.REGION_ROADS.places.length>=300);
  assert.equal(new Set(G.PLACES.map(p=>p.id)).size,G.PLACES.length);
  for(const p of G.PLACES)assert.ok(Number.isFinite(G.routeMeters(G.place('home'),p.id)));
  assert.ok(G.ROAD_EDGES.every(e=>!['ferry','motorway','trunk'].includes(e.kind)));
  assert.ok(G.CITY_REGION.bounds[0]<-50000&&G.CITY_REGION.bounds[1]<-70000&&G.CITY_REGION.bounds[2]>70000&&G.CITY_REGION.bounds[3]>60000);
  assert.doesNotMatch(JSON.stringify(G.REGION_ROADS.places),/上海|浦东|崇明|黄浦|嘉定|松江/);
});

test('新城与郊区订单都按当前位置的真实路程生成，长途行进和负坐标存档正确',()=>{
  for(const origin of [G.place('home'),...G.PLACES.filter(p=>p.regional&&p.x< -10000).filter((_,i)=>i%40===0)]){
    let s=G.newGame('全市配送','classic',123);s.player.realm=9;s.stats.delivered=150;s.flags.systemAwakened=true;s.flags.firstOrder=true;s.bonds.lin.met=true;s.bonds.chen.met=true;for(const key of G.STORY_FLAG_KEYS)s.flags[key]=true;s.position=origin.id;s.location={x:origin.x,y:origin.y};s.orders=[];
    G.syncFeatureUnlocks(s,true);s.unlockNotices=[];G.refreshOrders(s);assert.ok(s.orders.length>0);
    for(const o of s.orders)assert.ok(G.routeFrom(s,o.target).meters<=10000);
    const ticket=s.orders.find(o=>!G.travelBlock(s,G.travelPlan(s,o.target)));assert.ok(ticket);
    s=G.perform(s,'deliver',{id:ticket.id}).state;assert.ok(s.activity);
    const before=G.playerPoint(s);s=G.advance(s,.25);assert.notDeepEqual(G.playerPoint(s),before);
    const loaded=G.sanitizeSave(G.clone(s));assert.deepEqual(loaded.activity.route,s.activity.route);assert.deepEqual(loaded.location,s.location);
  }
});

test('v23 进行中存档保留原文件但拒绝导入，新版路线仍不能穿越非道路区域',async()=>{
  const context=vm.createContext({console});
  for(const name of ['city-data','city-region-data','data','chapters','sects','engine','sect-engine','sect-stories'])vm.runInContext(await readFile(new URL(`../public/js/${name}.js`,import.meta.url),'utf8'),context);
  const old=context.NightCourier;let s=old.newGame('原路继续','classic',123);s.unlockedPlaces=old.PLACES.map(p=>p.id);
  s=old.perform(s,'travel',{target:'bookshop'}).state;s=old.advance(s,.73);s=JSON.parse(JSON.stringify(s));
  const legacy={...G.clone(s),schemaVersion:23};assert.throws(()=>G.sanitizeSave(legacy),/仅支持 v25/);
  const loaded=G.sanitizeSave(s);assert.deepEqual(loaded.location,s.location);assert.deepEqual(loaded.activity.route,s.activity.route);
  const broken=G.clone(s);broken.activity.route.points[1].x+=7;
  assert.throws(()=>G.sanitizeSave(broken),/道路路线/);
});
