import {readFile,writeFile,mkdir,readdir,lstat,realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function environment(){
  const root=await realpath(process.env.PROJECT_ROOT),run=await realpath(process.env.PROJECT_REVIEW_RUN);
  if(!/^tmp[\\/]reviews[\\/](codex|opus|grok)[\\/]runs[\\/][A-Za-z0-9_-]+$/.test(path.relative(root,run)))throw Error('Explicit in-repo run environment required');
  const candidate=await realpath(fileURLToPath(new URL('../../',import.meta.url)));
  if(!candidate.startsWith(root+path.sep)&&candidate!==root)throw Error('Candidate outside repo');
  if(!process.env.ARCH_KERNEL_MODULE)throw Error('Set ARCH_KERNEL_MODULE to the existing ABI2 module inside the repo');
  const modulePath=await realpath(path.resolve(root,process.env.ARCH_KERNEL_MODULE));
  if(!modulePath.startsWith(root+path.sep)||!modulePath.endsWith('.mjs'))throw Error('Module outside repo');
  const sourceRoot=await realpath(path.resolve(root,process.env.TEXT_SOURCE_ROOT??'.'));
  if(sourceRoot!==root&&!sourceRoot.startsWith(root+path.sep))throw Error('Source dependency outside repo');
  async function output(relative,dir=false){
    const target=path.resolve(run,relative);if(!target.startsWith(run+path.sep))throw Error('Output escaped room');
    for(let p=target;p!==root;p=path.dirname(p)){try{if((await lstat(p)).isSymbolicLink())throw Error('Reparse path');}catch(e){if(e.code!=='ENOENT')throw e;}}
    await mkdir(dir?target:path.dirname(target),{recursive:true});return target;
  }
  const controllerRoot=await realpath(path.resolve(root,process.env.TEXT_APP_CONTROLLER_ROOT??'.'));
  if(controllerRoot!==root&&!controllerRoot.startsWith(root+path.sep))throw Error('Controller API outside repo');
  const stage=await output('work/text-app-stage',true),copied=[];
  async function copyFile(input,relative){
    const bytes=await readFile(input),target=await output('work/text-app-stage/'+relative);await writeFile(target,bytes);copied.push({input,relative,sha256:sha256(bytes),bytes:bytes.length});
  }
  async function copyTree(input,relative,filter=()=>true){
    for(const ent of await readdir(input,{withFileTypes:true})){
      const src=path.join(input,ent.name),dst=relative+'/'+ent.name;if((await lstat(src)).isSymbolicLink())throw Error('Reparse input');
      if(ent.isDirectory())await copyTree(src,dst,filter);else if(ent.isFile()&&filter(ent.name))await copyFile(src,dst);
    }
  }
  await copyTree(path.join(sourceRoot,'src/input'),'src/input',n=>n.endsWith('.mjs')||n.endsWith('.mts'));
  for(const relative of ['src/input/harfbuzz-engine.mjs','src/input/font-source-core.mjs','src/core/png-encode.mjs','src/core/source-preview.mjs','src/viewport/arch-view.mjs','src/domain/decimal.mjs','src/domain/safe.mjs','src/app/common.mjs','src/storage/common.mjs','src/contracts/app-bridge.ts'])
    await copyFile(path.join(root,relative),relative);
  for(const relative of ['src/app/adapters.d.mts','src/app/source-approval.mjs'])await copyFile(path.join(controllerRoot,relative),relative);
  for(const relative of ['src/integration/text-adapters.mjs','src/integration/source-catalog.mjs','src/core/text-operations.mjs'])await copyFile(path.join(candidate,relative),relative);
  await copyTree(path.join(candidate,'tests/text-app'),'tests/text-app',n=>/\.(mjs|mts|json)$/.test(n));
  await copyTree(path.join(candidate,'docs/text-app'),'docs/text-app',n=>n.endsWith('.mts'));
  return {root,run,candidate,stage,sourceRoot,modulePath,output,copied};
}
