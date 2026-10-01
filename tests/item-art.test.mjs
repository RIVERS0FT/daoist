import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
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
import '../public/js/art.js';

const G=globalThis.NightCourier;
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url));
const manifest=JSON.parse(read('docs/item-prompts.json'));
const assets=new Map(manifest.assets.map(asset=>[asset.id,asset]));

// Manifest-driven PNG decoding: chunk CRC, complete zlib stream and actual
// alpha pixels. No item names, shape families or paths are repeated here.
const crcTable=Uint32Array.from({length:256},(_,n)=>{
  for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;
  return n>>>0;
});
function transparentPNG(asset){
  const bytes=read(asset.path),chunks=[];
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a',asset.path);
  assert.equal(bytes.readUInt32BE(16),asset.width);assert.equal(bytes.readUInt32BE(20),asset.height);
  assert.deepEqual([...bytes.subarray(24,29)],[8,6,0,0,0],'8-bit non-interlaced RGBA required');
  let ended=false;
  for(let at=8;at<bytes.length;){
    assert.ok(at+12<=bytes.length,'Truncated chunk');
    const length=bytes.readUInt32BE(at),end=at+8+length;
    assert.ok(end+4<=bytes.length,'Invalid chunk length');
    let crc=0xffffffff;
    for(const byte of bytes.subarray(at+4,end))crc=crcTable[(crc^byte)&255]^(crc>>>8);
    assert.equal((crc^0xffffffff)>>>0,bytes.readUInt32BE(end),'PNG chunk CRC');
    const type=bytes.toString('ascii',at+4,at+8);
    if(type==='IDAT')chunks.push(bytes.subarray(at+8,end));
    if(type==='IEND'){assert.equal(length,0);assert.equal(end+4,bytes.length);ended=true;}
    at=end+4;
  }
  assert.ok(ended&&chunks.length,'Complete PNG required');
  const pixels=inflateSync(Buffer.concat(chunks)),stride=asset.width*4;
  assert.equal(pixels.length,asset.height*(stride+1));
  let previous=new Uint8Array(stride),row=new Uint8Array(stride),transparent=0,visible=0;
  for(let y=0;y<asset.height;y++){
    const at=y*(stride+1),filter=pixels[at];assert.ok(filter<=4,'Invalid PNG predictor');
    for(let x=0;x<stride;x++){
      const left=x>=4?row[x-4]:0,up=previous[x],corner=x>=4?previous[x-4]:0;
      const p=left+up-corner,a=Math.abs(p-left),b=Math.abs(p-up),c=Math.abs(p-corner);
      const predict=filter===0?0:filter===1?left:filter===2?up:filter===3?Math.floor((left+up)/2):a<=b&&a<=c?left:b<=c?up:corner;
      row[x]=(pixels[at+1+x]+predict)&255;
      if(x%4===3){if(row[x]===0)transparent++;else visible++;}
    }
    [previous,row]=[row,previous];
  }
  assert.ok(transparent>asset.width*asset.height/10&&visible>asset.width*asset.height/100,
    `${asset.id}: actual transparent cutout and visible subject required`);
  return createHash('sha256').update(bytes).digest('hex');
}

test('37 independent item images follow the manifest, have complete PNGs and real alpha',()=>{
  assert.equal(manifest.transparent_background,true);
  assert.equal(manifest.assets.length,37);assert.equal(assets.size,37);
  assert.equal(new Set(manifest.assets.map(asset=>asset.path)).size,37);
  const hashes=[];
  for(const asset of manifest.assets){
    assert.match(asset.path,/^public\/art\/items\/[a-z0-9-]+-v1\.png$/);
    assert.equal(asset.width,1254);assert.equal(asset.height,1254);
    assert.ok(asset.prompt.length>100,`${asset.id}: missing creation prompt`);
    hashes.push(transparentPNG(asset));
  }
  assert.equal(new Set(hashes).size,37,'Independent subjects must not duplicate the same PNG bytes');
});

test('every current item, 36 techniques and both equipment items map to a trusted frozen asset',()=>{
  assert.equal(G.ITEMS.length,213);assert.equal(new Set(G.ITEMS.map(item=>item.id)).size,213);
  assert.deepEqual(Object.keys(manifest.mappings).sort(),G.ITEMS.map(item=>item.id).sort());
  assert.deepEqual(Object.keys(G.Art.itemMap).sort(),Object.keys(manifest.mappings).sort());
  assert.equal(G.ITEMS.filter(item=>item.type==='technique').length,36);
  assert.equal(G.ITEMS.filter(item=>item.type==='equipment').length,2);
  assert.ok(Object.isFrozen(G.Art)&&Object.isFrozen(G.Art.items)&&Object.isFrozen(G.Art.itemMap));
  const used=new Set();
  for(const item of G.ITEMS){
    const key=manifest.mappings[item.id],asset=assets.get(key),result=G.Art.item(item.id);
    assert.ok(asset,`${item.id}: manifest asset missing`);
    assert.equal(result.key,key);assert.equal(result.path,asset.path.slice('public/'.length));
    assert.ok(Object.isFrozen(result));assert.match(result.path,/^art\/items\/[a-z0-9-]+-v1\.png$/);
    assert.equal(G.Art.item(item.id),result,'Repeated lookup must reuse the frozen record');
    used.add(key);
  }
  assert.equal(used.size,37,'All authored item assets must be used');
});

test('unknown IDs, prototype names and caller-supplied paths cannot select item art',()=>{
  const inputs=[undefined,null,{},[],1,Symbol('qi'),'','unknown','constructor','toString','__proto__',
    '../../.env','art/items/qi-v1.png','https://example.test/item.png','qi\" onerror=alert(1)',
    {toString(){throw new Error('Item lookup must not coerce an object');}}];
  for(const id of inputs)assert.equal(G.Art.item(id),null);
});

test('item art is a pure query and never grants inventory, unlocks NPCs or advances time',()=>{
  const s=G.newGame('物件查询', 'classic',25123),before=JSON.stringify(s),data=JSON.stringify(G.ITEMS);
  for(let i=0;i<3;i++)for(const item of G.ITEMS)G.Art.item(item.id);
  assert.equal(JSON.stringify(s),before);assert.equal(JSON.stringify(G.ITEMS),data);
  assert.equal(Object.values(s.bonds).filter(bond=>bond.met).length,0);
});
