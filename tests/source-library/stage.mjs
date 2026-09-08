import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {environment,safe,sha256,writeJSON} from '../../tools/assets/source-library/common.mjs';
export function stageContracts(library){
 const {root,run}=environment();library=safe(root,path.resolve(library));
 const stage=safe(run,path.join(run,'work/source-library-tests/stage'),{exists:false});fs.mkdirSync(stage,{recursive:true});const rows=[],done=new Set();
 function copy(base,rel,followTypes=false){
  const key=rel;if(done.has(key))return;done.add(key);
  const source=safe(base,path.join(base,rel)),b=fs.readFileSync(source),dest=safe(run,path.join(stage,rel),{exists:false});fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,b);
  rows.push({file:rel,source:base===root?'current-main':'candidate',bytes:b.length,sha256:sha256(b)});
  if(followTypes)for(const match of b.toString().matchAll(/(?:from\s+|import\s*\()['"]([^'"]+)['"]/g)){
   if(!match[1].startsWith('.'))continue;let next=path.posix.normalize(path.posix.join(path.posix.dirname(rel),match[1])).replace(/\.mjs$/,'.d.mts').replace(/\.js$/,'.d.ts');if(!fs.existsSync(path.join(root,next)))next=next.replace(/\.d\.ts$/,'.ts').replace(/\.d\.mts$/,'.mts');copy(root,next,true);
  }
 }
 for(const rel of ['src/integration/source-catalog.mjs','src/input/source-contract.mjs'])copy(root,rel);
 for(const rel of ['src/integration/source-library.mjs','src/integration/source-library.d.mts','tests/source-library/browser-worker.mjs','tests/source-library/types.mts'])copy(library,rel);
 copy(root,'docs/text-app/API.d.mts',true);
 writeJSON(run,path.join(stage,'stage-manifest.json'),{version:'arch-source-library-test-stage/1',files:rows});return {root,run,library,stage};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const s=stageContracts(process.argv[2]??path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'));console.log(s.stage);}
