import path from 'node:path';
import {spawnSync} from 'node:child_process';
export function typecheck(env){
 const compiler=path.join(env.root,'.toolchain/app-runtime/node_modules/typescript/bin/tsc');
 const command=[compiler,'--ignoreConfig','--noEmit','--strict','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','--skipLibCheck',path.join(env.stage,'tests/raster-app/types.test.mts')];
 const p=spawnSync(process.execPath,command,{cwd:env.stage,env:process.env,encoding:'utf8',timeout:60000});
 if(p.status!==0)throw Error('Callback declaration check: '+p.stdout+p.stderr);
 return {pass:true,exitCode:p.status,scope:'Actual production standalone declaration and required-ModelLease callback overload, including negative ownership examples'};
}
