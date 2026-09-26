import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {collect} from '../tools/riversoft.mjs';

// Compare every built asset, including the manifest, against one public route.
export async function verifyPublic(directory,base,{fetchImpl=fetch,attempts=6,delay=3000}={}){
  const url=new URL(base.endsWith('/')?base:`${base}/`);
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error('Expected a plain HTTP(S) deployment URL.');
  const bundle=await collect(resolve(directory));
  for(const file of bundle.files){
    let failure;
    for(let attempt=0;attempt<attempts;attempt++){
      try{
        const response=await fetchImpl(new URL(file.path,url),{signal:AbortSignal.timeout(20000),redirect:'error',cache:'no-store'});
        if(!response.ok)throw Error(`${file.path}: HTTP ${response.status}`);
        const data=new Uint8Array(await response.arrayBuffer());
        if(data.byteLength!==file.size||createHash('sha256').update(data).digest('hex')!==file.sha256)throw Error(`${file.path}: published bytes differ from the build`);
        failure=null;break;
      }catch(e){failure=e;if(attempt+1<attempts)await new Promise(r=>setTimeout(r,delay));}
    }
    if(failure)throw failure;
  }
  return {url:url.href,files:bundle.files.length,bytes:bundle.bytes};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [directory,canonical,deploymentId]=process.argv.slice(2);
  if(!directory||!canonical)throw Error('Usage: node scripts/verify-public.mjs <dist> <public-url> [deployment-id]');
  let base=canonical;
  try{
    const probe=await fetch(new URL('index.html',canonical),{signal:AbortSignal.timeout(20000),redirect:'error'});
    await probe.body?.cancel();
    if(!probe.ok)throw Error(`HTTP ${probe.status}`);
  }catch(error){
    if(!deploymentId||!/^https:\/\/[a-z0-9-]+\.riversoft\.top\/daoist\/$/.test(canonical)||!/^[a-zA-Z0-9_-]+$/.test(deploymentId))throw error;
    base=`https://riversoft.top/api/hosting/content/daoist/${deploymentId}/`;
    console.warn('::warning::Canonical route is unavailable; checking every asset through the HTTPS compatibility route.');
  }
  console.log(JSON.stringify(await verifyPublic(directory,base)));
  if(base!==canonical){
    const page=await fetch('https://riversoft.top/p/daoist',{signal:AbortSignal.timeout(20000)});
    await page.body?.cancel();if(!page.ok)throw Error(`Compatibility page returned HTTP ${page.status}`);
  }
}
