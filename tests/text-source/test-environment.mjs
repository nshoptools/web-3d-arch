import {realpath,mkdir,lstat} from 'node:fs/promises';
import path from 'node:path';
export async function testEnvironment(){
  if(!process.env.PROJECT_ROOT||!process.env.PROJECT_REVIEW_RUN)throw Error('Dot-source project-env before running tests');
  const root=await realpath(process.env.PROJECT_ROOT),run=await realpath(process.env.PROJECT_REVIEW_RUN);
  if(!/^tmp[\\/]reviews[\\/](codex|opus|grok)[\\/]runs[\\/][A-Za-z0-9_-]+$/.test(path.relative(root,run)))throw Error('Test run must be inside a repo seat room');
  return {root,run};
}
export async function testModule(root){
  if(!process.env.ARCH_KERNEL_MODULE)throw Error('Set ARCH_KERNEL_MODULE to the existing ABI2 module');
  const modulePath=await realpath(path.resolve(root,process.env.ARCH_KERNEL_MODULE));
  if(!modulePath.startsWith(root+path.sep)||!modulePath.endsWith('.mjs'))throw Error('Module must resolve inside the repo');
  const wasm=await realpath(modulePath.replace(/\.mjs$/,'.wasm'));
  if(!wasm.startsWith(root+path.sep))throw Error('WASM must resolve inside the repo');
  return modulePath;
}
export async function testOutput(relative){
  const {root,run}=await testEnvironment(),file=path.resolve(run,relative);
  if(!file.startsWith(run+path.sep))throw Error('Test output escaped room');
  for(let p=file;p!==root;p=path.dirname(p)){try{if((await lstat(p)).isSymbolicLink())throw Error('Reparse output');}catch(e){if(e.code!=='ENOENT')throw e;}}
  await mkdir(path.dirname(file),{recursive:true});return file;
}
