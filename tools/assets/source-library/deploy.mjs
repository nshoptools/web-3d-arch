import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {environment,safe,sha256,readJSON,writeJSON,cliArgs} from './common.mjs';
import {materializeSourceLibrary} from '../../../src/integration/source-library.mjs';
const PREFIX='src/assets/source-library';
export function deploySourceLibrary({library,output}){
 const {root,run}=environment();library=safe(root,path.resolve(library));output=safe(run,path.resolve(output),{exists:false});
 const catalog=readJSON(path.join(library,PREFIX,'catalog.json')),manifest=readJSON(path.join(library,PREFIX,'deployment.json'));
 materializeSourceLibrary({catalog,manifest,origin:'https://library.invalid'});
 const ready=path.join(output,'source-library/ready.json');if(fs.existsSync(ready))throw Error('Deployment already complete; choose a fresh output');
 const rows=[];for(const r of manifest.records){
  const local=safe(library,path.join(library,r.file),{exists:false}),source=fs.existsSync(local)?local:safe(root,path.join(root,r.file)),b=fs.readFileSync(source);
  if(b.length!==r.bytes||sha256(b)!==r.sha256)throw Error('Deployment source mismatch '+r.file);
  const target=safe(run,path.join(output,r.url),{exists:false});fs.mkdirSync(path.dirname(target),{recursive:true});
  if(fs.existsSync(target)){const old=fs.readFileSync(target);if(old.length!==b.length||sha256(old)!==r.sha256)throw Error('Refuse conflicting deployment output');}
  else fs.writeFileSync(target,b,{flag:'wx'});
  rows.push({url:r.url,bytes:r.bytes,sha256:r.sha256});
 }
 for(const name of ['catalog.json','deployment.json','artwork.json','build-receipt.json']){
  const b=fs.readFileSync(path.join(library,PREFIX,name)),target=safe(run,path.join(output,'source-library',name),{exists:false});fs.mkdirSync(path.dirname(target),{recursive:true});
  if(fs.existsSync(target))throw Error('Refuse partial config overwrite');fs.writeFileSync(target,b,{flag:'wx'});rows.push({url:'source-library/'+name,bytes:b.length,sha256:sha256(b)});
 }
 // Written only after all verified bytes exist. Parent owns atomic publication.
 const receipt={version:'arch-source-deployment-ready/1',files:rows};writeJSON(run,ready,receipt);console.log('Materialized '+manifest.records.length+' deduplicated source assets');return receipt;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const a=cliArgs(['--library','--output']);if(!a['--library']||!a['--output'])throw Error('--library and --output required');deploySourceLibrary({library:a['--library'],output:a['--output']});}