import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createApp} from '../server.mjs';
import {verifyPublic} from '../scripts/verify-public.mjs';

test('本地 Leaflet JS/CSS 与官方 1.9.4 SHA-256 一致，许可证随源码保存',async()=>{
  for(const [file,hash] of [['leaflet.js','20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='],['leaflet.css','p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=']]){
    const bytes=await readFile(new URL(`../public/vendor/leaflet/${file}`,import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('base64'),hash);
  }
  assert.match(await readFile(new URL('../public/vendor/leaflet/LICENSE.txt',import.meta.url),'utf8'),/Redistribution/);
});

test('本机服务可读取 Leaflet 样式、脚本和图片，未知文件保持拒绝',async t=>{
  const {server}=createApp({host:'127.0.0.1',port:0});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));
  const url=`http://127.0.0.1:${server.address().port}`;
  for(const [file,mime] of [['leaflet.js','javascript'],['leaflet.css','text/css'],['images/layers.png','image/png'],['LICENSE.txt','text/plain']]){
    const r=await fetch(`${url}/vendor/leaflet/${file}`);assert.equal(r.status,200);assert.ok(r.headers.get('content-type').includes(mime));
    const bytes=Buffer.from(await r.arrayBuffer());assert.deepEqual(bytes,await readFile(new URL(`../public/vendor/leaflet/${file}`,import.meta.url)));
  }
  for(const file of ['.env','../../server.mjs','leaflet.js.map','missing.js'])assert.equal((await fetch(`${url}/vendor/leaflet/${file}`)).status,404);
  for(const name of ['map-art','city-data']){
    const artwork=await fetch(`${url}/js/${name}.js`);
    assert.equal(artwork.status,200);assert.match(artwork.headers.get('content-type'),/javascript/);
    assert.equal(await artwork.text(),await readFile(new URL(`../public/js/${name}.js`,import.meta.url),'utf8'));
  }
});

async function fixture(t){
  const dir=await mkdtemp(join(tmpdir(),'daoist-assets-'));
  // mkdtemp returns a concrete owned directory, never an arbitrary user path.
  t.after(()=>rm(dir,{recursive:true,force:true}));
  await mkdir(join(dir,'js'));await writeFile(join(dir,'index.html'),'<script src="js/map.js"></script>');await writeFile(join(dir,'js/map.js'),'map');
  return dir;
}
test('公网校验包含子目录资源，并保留部署路径前缀',async t=>{
  const dir=await fixture(t),seen=[];
  const result=await verifyPublic(dir,'https://example.invalid/daoist/',{attempts:1,fetchImpl:async url=>{seen.push(url.pathname);return new Response(await readFile(join(dir,url.pathname.replace('/daoist/',''))));}});
  assert.equal(result.files,2);assert.deepEqual(seen,['/daoist/index.html','/daoist/js/map.js']);
});
test('首页成功但地图资源缺失或字节不符时，公网校验仍失败',async t=>{
  const dir=await fixture(t);
  for(const failure of [()=>new Response('missing',{status:404}),()=>new Response('different bytes')]){
    await assert.rejects(verifyPublic(dir,'https://example.invalid/daoist/',{attempts:1,fetchImpl:async url=>url.pathname.endsWith('index.html')?new Response(await readFile(join(dir,'index.html'))):failure()}),/js\/map.js/);
  }
});
