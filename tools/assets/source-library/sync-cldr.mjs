/** Explicit, checksum-locked upstream refresh. Normal builder stays offline. */
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {environment,safe,sha256,readJSON,writeJSON,cliArgs} from './common.mjs';
import {checkedLibraryPath} from '../../../src/integration/source-library.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
export async function syncCLDR({output}){
 const {run}=environment();output=safe(run,path.resolve(output),{exists:false});
 const lock=readJSON(path.resolve(here,'../../../src/assets/source-library/search/cldr-lock.json'));
 if(!/^[a-f0-9]{40}$/.test(lock.commit))throw Error('CLDR commit');
 const verified=[];for(const r of lock.files){
  checkedLibraryPath(r.file);if(!r.url.startsWith('https://raw.githubusercontent.com/unicode-org/cldr-json/'+lock.commit+'/'))throw Error('Unapproved CLDR URL');
  const response=await fetch(r.url,{redirect:'error',signal:AbortSignal.timeout(45000)});if(!response.ok)throw Error('CLDR HTTP '+response.status);
  const reader=response.body.getReader(),chunks=[];let n=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>r.bytes||n>2000000)throw Error('CLDR byte budget');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  const b=Buffer.concat(chunks);if(n!==r.bytes||sha256(b)!==r.sha256)throw Error('CLDR digest mismatch');verified.push([r,b]);
 }
 for(const [r,b]of verified){const p=safe(run,path.join(output,'src/assets/source-library/search/upstream',r.file),{exists:false});fs.mkdirSync(path.dirname(p),{recursive:true});if(fs.existsSync(p)&&sha256(fs.readFileSync(p))!==r.sha256)throw Error('Refuse different existing source');fs.writeFileSync(p,b);}
 writeJSON(run,path.join(output,'src/assets/source-library/search/cldr-lock.json'),lock);return lock;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const a=cliArgs(['--output']);if(!a['--output'])throw Error('--output required');await syncCLDR({output:a['--output']});}