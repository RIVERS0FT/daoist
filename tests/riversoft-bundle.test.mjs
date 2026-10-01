import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {collect,publish} from '../tools/riversoft.mjs';

async function fixture(t){
  const root=resolve('artifacts/riversoft-bundle-tests');
  await mkdir(root,{recursive:true});
  const directory=await mkdtemp(join(root,'bundle-'));
  assert.equal(dirname(directory),root);
  t.after(()=>rm(directory,{recursive:true,force:true}));
  await writeFile(join(directory,'index.html'),'<!doctype html><title>Bundle fixture</title>');
  return directory;
}

test('static bundles above 10 MiB retain all bytes and file hashes',async t=>{
  const directory=await fixture(t),data=Buffer.alloc(4*1048576,32);
  for(let i=0;i<3;i++)await writeFile(join(directory,`map-${i}.json`),data);
  const bundle=await collect(directory);
  assert.equal(bundle.files.length,4);
  assert.equal(bundle.bytes,bundle.files.reduce((total,file)=>total+file.size,0));
  assert.ok(bundle.bytes>10*1048576);
  for(const file of bundle.files){assert.equal(file.data.length,file.size);assert.match(file.sha256,/^[a-f0-9]{64}$/);}
});

test('files above 5 MiB collect and upload fully in contiguous chunks',async t=>{
  const directory=await fixture(t);
  const data=Buffer.alloc(6*1048576+17,32);
  await writeFile(join(directory,'oversize.json'),data);
  const bundle=await collect(directory),offsets=bundle.files.map(()=>0),hashes=bundle.files.map(()=>createHash('sha256'));
  const result=await publish(bundle,{slug:'bundle-fixture',title:'Fixture'},async(path,body,method)=>{
    if(path==='/deployments'){assert.equal(body.files.length,2);return {deploymentId:'fixture'};}
    if(path.endsWith('/commit'))return {committed:true};
    const index=Number(path.match(/\/files\/(\d+)$/)[1]),chunk=Buffer.from(body.data,'base64');
    assert.equal(method,'PUT');assert.equal(body.offset,offsets[index]);assert.ok(chunk.length<=256*1024);
    offsets[index]+=chunk.length;hashes[index].update(chunk);return {};
  });
  assert.equal(result.committed,true);
  for(const [index,file] of bundle.files.entries()){
    assert.equal(offsets[index],file.size);assert.equal(hashes[index].digest('hex'),file.sha256);
  }
});

test('bundles above 250 files collect every resource',async t=>{
  const directory=await fixture(t);
  await Promise.all(Array.from({length:250},(_,i)=>writeFile(join(directory,`map-${i}.json`),'{}')));
  const bundle=await collect(directory);
  assert.equal(bundle.files.length,251);
  assert.equal(new Set(bundle.files.map(file=>file.path)).size,251);
  assert.ok(bundle.files.some(file=>file.path==='map-249.json'));
});
