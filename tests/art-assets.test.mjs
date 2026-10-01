import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {inflateSync} from 'node:zlib';

const context=vm.createContext({NightCourier:{}});
vm.runInContext(readFileSync(new URL('../public/js/art.js',import.meta.url),'utf8'),context);
const Art=context.NightCourier.Art;
const playerPrompts=JSON.parse(readFileSync(new URL('../docs/player-appearance-prompts.json',import.meta.url),'utf8'));
const keys=['delivery','cultivation','alchemy','auction','sect','system','inventory','bonds','vehicle','rest','regions','help'];
const state=(id,stage=0,met=true)=>Object.freeze({minutes:481.25,bonds:Object.freeze({[id]:Object.freeze({met,stage,path:'none'})})});
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url));
const prompts=JSON.parse(read('docs/art-prompts.json'));
const iconPrompts=JSON.parse(read('docs/icon-prompts.json'));
const uiPrompts=JSON.parse(read('docs/ui-prompts.json'));
const wukongPrompts=JSON.parse(read('docs/ui-wukong-prompts.json'));
const crcTable=Uint32Array.from({length:256},(_,value)=>{
  for(let i=0;i<8;i++)value=value&1?0xedb88320^(value>>>1):value>>>1;
  return value>>>0;
});
function png(path,width,height){
  const bytes=read(path);
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a',path);
  assert.equal(bytes.readUInt32BE(16),width,path);
  assert.equal(bytes.readUInt32BE(20),height,path);
  let offset=8,ended=false;
  while(offset<bytes.length){
    assert.ok(offset+12<=bytes.length,`${path}: truncated chunk`);
    const length=bytes.readUInt32BE(offset),end=offset+8+length;
    assert.ok(end+4<=bytes.length,`${path}: invalid chunk size`);
    let value=0xffffffff;
    for(const byte of bytes.subarray(offset+4,end))value=crcTable[(value^byte)&255]^(value>>>8);
    assert.equal((value^0xffffffff)>>>0,bytes.readUInt32BE(end),`${path}: chunk CRC`);
    if(bytes.toString('ascii',offset+4,offset+8)==='IEND'){
      assert.equal(length,0);assert.equal(end+4,bytes.length);ended=true;
    }
    offset=end+4;
  }
  assert.ok(ended,`${path}: missing IEND`);
  return bytes;
}

function rgbaAlpha(bytes,width,height){
  assert.equal(bytes[24],8);assert.equal(bytes[25],6);
  assert.equal(bytes[26],0);assert.equal(bytes[27],0);assert.equal(bytes[28],0);
  const idat=[];
  for(let offset=8;offset<bytes.length;){
    const length=bytes.readUInt32BE(offset);
    if(bytes.toString('ascii',offset+4,offset+8)==='IDAT')idat.push(bytes.subarray(offset+8,offset+8+length));
    offset+=length+12;
  }
  assert.ok(idat.length,'RGBA image must contain compressed pixels');
  const scanlines=inflateSync(Buffer.concat(idat)),stride=width*4;
  assert.equal(scanlines.length,height*(stride+1));
  let previous=new Uint8Array(stride),row=new Uint8Array(stride),transparent=0,visible=0;
  const paeth=(left,up,upperLeft)=>{
    const prediction=left+up-upperLeft,a=Math.abs(prediction-left),b=Math.abs(prediction-up),c=Math.abs(prediction-upperLeft);
    return a<=b&&a<=c?left:b<=c?up:upperLeft;
  };
  for(let y=0;y<height;y++){
    const offset=y*(stride+1),filter=scanlines[offset];assert.ok(filter<=4,'Unknown PNG row filter');
    for(let x=0;x<stride;x++){
      const left=x>=4?row[x-4]:0,up=previous[x],upperLeft=x>=4?previous[x-4]:0;
      const predictor=filter===0?0:filter===1?left:filter===2?up:filter===3?Math.floor((left+up)/2):paeth(left,up,upperLeft);
      row[x]=(scanlines[offset+1+x]+predictor)&255;
      if(x%4===3){if(row[x]===0)transparent++;else visible++;}
    }
    [previous,row]=[row,previous];
  }
  return {transparent,visible};
}

test('三张最终插画尺寸、完整 PNG 与制作提示词一致',()=>{
  const expected=new Map([
    ['city_keyart',['public/art/night-courier-keyart-v1.png',1672,941]],
    ['zhou_portrait',['public/art/zhou-rider-v1.png',1086,1448]],
    ['lin_portrait',['public/art/lin-office-v1.png',1086,1448]],
  ]);
  assert.equal(prompts.assets.length,expected.size);
  const direction=read('docs/ART_DIRECTION.md').toString('utf8');
  for(const asset of prompts.assets){
    const [path,width,height]=expected.get(asset.id)||[];
    assert.ok(path,asset.id);assert.equal(asset.path,path);assert.ok(asset.prompt.length>100);
    assert.ok(direction.includes(path.slice('public/'.length)),`${path}: absent from art documentation`);
    png(path,width,height);
  }
  assert.ok(prompts.assets.find(x=>x.id==='lin_portrait').correction.includes('ONE pen'));
});

test('应用图标为独立完整 RGBA PNG，保留单独提示词与文档入口',()=>{
  const asset=iconPrompts.application;
  assert.equal(asset.path,'public/art/game-icon-v1.png');
  assert.ok(asset.prompt.length>100);
  const bytes=png(asset.path,1254,1254),idat=[];
  assert.equal(bytes[24],8);assert.equal(bytes[25],6);assert.equal(bytes[28],0);
  for(let offset=8;offset<bytes.length;){
    const length=bytes.readUInt32BE(offset);
    if(bytes.toString('ascii',offset+4,offset+8)==='IDAT')idat.push(bytes.subarray(offset+8,offset+8+length));
    offset+=length+12;
  }
  const scanlines=inflateSync(Buffer.concat(idat));
  assert.equal(scanlines.length,1254*(1254*4+1));
  // Every PNG predictor is zero at the first pixel of the first scanline.
  // This checks real transparent alpha, not only a color-type declaration.
  assert.equal(scanlines[4],0,'Application icon corner must be transparent');
  assert.ok(read('docs/ICON_ASSETS.md').toString('utf8').includes('game-icon-v1.png'));
});

test('玩家立绘是独立的本地白名单素材，未知路径不返回图片且查询不改状态',()=>{
  assert.deepEqual(playerPrompts.assets.map(asset=>asset.id),['male-rider','male-rider-steady']);
  for(const asset of playerPrompts.assets){
    assert.equal(asset.path,`public/art/player-${asset.id}-v1.png`);
    assert.equal(asset.width,1086);assert.equal(asset.height,1448);assert.ok(asset.prompt.length>100);
    png(asset.path,asset.width,asset.height);
    const saved=Object.freeze({appearanceId:asset.id,minutes:480.5,bonds:Object.freeze({})});
    const before=JSON.stringify(saved);
    assert.equal(Art.playerPortrait(asset.id),asset.path.slice(7));
    assert.equal(Art.playerPortrait(saved),asset.path.slice(7));
    assert.equal(JSON.stringify(saved),before);
    assert.equal(Art.portrait(saved,'zhou'),null);assert.equal(Art.portrait(saved,'lin'),null);
  }
  for(const input of [null,undefined,{},[],17,'','female-rider','constructor','toString','__proto__','zhou','lin','../../.env','https://example.test/avatar.png']){
    assert.equal(Art.playerPortrait(input),null);
    assert.equal(Art.playerPortrait({appearanceId:input}),null);
  }
});

test('12 枚功能素材、提示词和图标清单一一对应且 PNG 完整',()=>{
  assert.deepEqual(iconPrompts.assets.map(x=>x.id),keys);
  assert.equal(new Set(iconPrompts.assets.map(x=>x.path)).size,keys.length);
  const list=read('docs/ICON_ASSETS.md').toString('utf8');
  for(const asset of iconPrompts.assets){
    assert.equal(asset.path,`public/art/icons/${asset.id}-v1.png`);
    assert.ok(asset.prompt.length>100);assert.ok(list.includes(`icons/${asset.id}-v1.png`));
    assert.equal(png(asset.path,1254,1254)[25],6);
  }
});

test('当前三张古铜界面装饰与提示词匹配，旧原稿保留，PNG 完整且具有真实透明像素',()=>{
  const expected=new Map([
    ['panel_corners',['public/art/ui/panel-corners-v2.png',1254,1254]],
    ['title_ornament',['public/art/ui/title-ornament-v2.png',2172,724]],
    ['divider',['public/art/ui/divider-v2.png',2172,724]],
  ]);
  assert.equal(wukongPrompts.transparent_background,true);
  assert.equal(wukongPrompts.assets.length,expected.size);
  assert.equal(new Set(wukongPrompts.assets.map(asset=>asset.id)).size,expected.size);
  assert.equal(new Set(wukongPrompts.assets.map(asset=>asset.path)).size,expected.size);
  const css=read('public/styles.css').toString('utf8');
  for(const asset of wukongPrompts.assets){
    const [path,width,height]=expected.get(asset.id)||[];
    assert.ok(path,asset.id);assert.equal(asset.path,path);
    assert.equal(asset.width,width);assert.equal(asset.height,height);assert.ok(asset.prompt.length>100);
    assert.ok(css.includes(`url("${path.slice('public/'.length)}")`),`${path}: absent from UI styles`);
    const alpha=rgbaAlpha(png(path,width,height),width,height);
    assert.ok(alpha.transparent>width*height/2,`${path}: transparent space must remain outside the ornament`);
    assert.ok(alpha.visible>0,`${path}: ornament must contain visible pixels`);
  }
  for(const asset of uiPrompts.assets){
    assert.equal(asset.path,wukongPrompts.assets.find(current=>current.id===asset.id).path.replace('-v2.png','-v1.png'));
    png(asset.path,asset.width,asset.height);
  }
});

test('功能图标只接受 12 个可信用途，所有路径为包内透明 PNG',()=>{
  for(const key of keys){
    assert.equal(Art.icon(key),`art/icons/${key}-v1.png`);
    const bytes=readFileSync(new URL(`../public/${Art.icon(key)}`,import.meta.url));
    assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16),1254);
    assert.equal(bytes.readUInt32BE(20),1254);
    assert.equal(bytes[25],6,'Expected an RGBA PNG');
  }
});

test('外来路径、未知用途和原型名称无法取得图片',()=>{
  for(const key of [null,undefined,{},[],17,'','character','chapters','constructor','toString','__proto__','../../.env','https://example.test/image.png','delivery\" onerror=alert(1)']){
    assert.equal(Art.icon(key),null);
    assert.equal(Art.portrait(state('lin'),key),null);
  }
});

test('未结识 NPC 不显示立绘，其他角色没有冒用现有立绘',()=>{
  for(const id of ['lin','zhou']){
    assert.equal(Art.portrait(null,id),null);
    assert.equal(Art.portrait({},id),null);
    assert.equal(Art.portrait(state(id,0,false),id),null);
    assert.equal(Art.portrait({bonds:{[id]:{met:1,stage:0}}},id),null);
  }
  for(const id of ['chen','lu','han','zhao'])assert.equal(Art.portrait(state(id),id),null);
});

test('早期周野有骑手立绘，反目阶段不使用友好图像',()=>{
  for(let stage=0;stage<9;stage++)assert.equal(Art.portrait(state('zhou',stage),'zhou'),'art/zhou-rider-v1.png');
  for(const stage of [9,10])assert.equal(Art.portrait(state('zhou',stage),'zhou'),null);
  for(const stage of [0,1,4])assert.equal(Art.portrait(state('lin',stage),'lin'),'art/lin-office-v1.png');
  for(const stage of [-1,1.5,NaN,Infinity,undefined,'8'])assert.equal(Art.portrait({bonds:{zhou:{met:true,stage}}},'zhou'),null);
});

test('美术查询只读且不推进时间，不需要游戏引擎或 DOM',()=>{
  const s=state('zhou',8),before=JSON.stringify(s);
  for(let i=0;i<20;i++){for(const key of keys)Art.icon(key);Art.portrait(s,'zhou');Art.portrait(s,'lin');}
  assert.equal(JSON.stringify(s),before);
  assert.equal(s.minutes,481.25);
});
