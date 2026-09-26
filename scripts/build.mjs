import {writeFile,mkdir,rm,lstat,realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';
import {collect} from '../tools/riversoft.mjs';

const root=dirname(dirname(fileURLToPath(import.meta.url))),out=resolve(root,'dist');
// Only validated public assets enter the bundle; no environment files or saves.
const bundle=await collect(join(root,'public'));
const info=await lstat(out).catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
if(info&&(info.isSymbolicLink()||await realpath(out)!==out))throw Error('Refusing to clean redirected dist directory.');
if(out!==join(root,'dist'))throw Error('Build output must be the project dist directory.');
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
for(const file of bundle.files){
  const dest=join(out,file.path);
  await mkdir(dirname(dest),{recursive:true});
  await writeFile(dest,file.data);
}
await writeFile(join(out,'asset-manifest.json'),JSON.stringify({files:bundle.files.map(({path,size,sha256})=>({path,size,sha256}))},null,2)+'\n');
console.log(`已生成 dist/：${bundle.files.length} 个本地静态资源及校验清单。请完整发布目录；本机使用 npm start。`);
