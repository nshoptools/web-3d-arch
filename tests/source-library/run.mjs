import path from 'node:path';import fs from 'node:fs';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {environment,safe,cliArgs,writeJSON} from '../../tools/assets/source-library/common.mjs';import {stageContracts} from './stage.mjs';
const args=cliArgs(['--library']);const library=args['--library']??path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const {root,run,stage}=stageContracts(library),commands=[];
async function command(program,args,label){
 const chunks=[];const code=await new Promise((resolve,reject)=>{
  const child=spawn(program,args,{cwd:root,env:{...process.env,ARCH_LIBRARY_CANDIDATE:library,ARCH_LIBRARY_STAGE:stage},windowsHide:true,stdio:['ignore','pipe','pipe']});
  for(const p of [child.stdout,child.stderr])p.on('data',b=>{chunks.push(b);process.stdout.write(b);});child.on('error',reject);child.on('exit',resolve);
 });
 fs.writeFileSync(safe(run,path.join(run,'evidence/source-library-'+label+'.log'),{exists:false}),Buffer.concat(chunks));commands.push({program,args,exitCode:code});
 writeJSON(run,path.join(run,'evidence/source-library-node.json'),{version:'arch-source-library-node-tests/1',commands});
 if(code!==0)throw Error(label+' failed '+code);
}
await command(process.execPath,['--test',path.join(library,'tests/source-library/catalog.test.mjs'),path.join(library,'tests/source-library/deploy.test.mjs')],'node');
await command(process.execPath,[path.join(root,'.toolchain/app-runtime/node_modules/typescript/bin/tsc'),'--ignoreConfig','--noEmit','--strict','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','--skipLibCheck',path.join(stage,'tests/source-library/types.mts')],'types');
