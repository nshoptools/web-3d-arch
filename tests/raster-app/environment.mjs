import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
export const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const contains=(root,target)=>target===root||target.startsWith(root+path.sep);
export function safePath(root,input,{exists=true}={}){
 const absolute=path.resolve(input);
 if(!contains(root,absolute))throw Error('Path escapes root: '+absolute);
 for(let p=absolute;p!==root;p=path.dirname(p)){
  if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('Reparse path: '+p);
 }
 if(exists&&!contains(root,fs.realpathSync(absolute)))throw Error('Resolved path escapes root');
 return absolute;
}
export function stageEnvironment(){
 if(!process.env.PROJECT_ROOT||!process.env.PROJECT_REVIEW_RUN)throw Error('Dot-source tools/development/env.ps1 with an explicit seat and RunId');
 const root=fs.realpathSync(process.env.PROJECT_ROOT),run=safePath(root,process.env.PROJECT_REVIEW_RUN);
 if(!/^tmp[\\/]reviews[\\/](codex|opus|grok)[\\/]runs[\\/][A-Za-z0-9_-]+$/.test(path.relative(root,run)))throw Error('Explicit review run required');
 const testRoot=safePath(root,fileURLToPath(new URL('./',import.meta.url)));
 const label=process.env.ARCH_RASTER_TEST_LABEL??'main';
 if(!/^[A-Za-z0-9_-]{1,64}$/.test(label))throw Error('Invalid test label');
 const stage=safePath(run,path.join(run,'work/raster-app-stage',label),{exists:false});
 const evidence=safePath(run,path.join(run,'evidence/raster-app',label),{exists:false});
 const moduleInput=safePath(root,path.resolve(root,process.env.ARCH_KERNEL_MODULE||path.join(run,'work/module/arch-kernel.mjs')));
 if(path.basename(moduleInput)!=='arch-kernel.mjs')throw Error('ARCH_KERNEL_MODULE must select arch-kernel.mjs from tools/kernel/build.ps1');
 const wasmInput=safePath(root,path.join(path.dirname(moduleInput),'arch-kernel.wasm'));
 if(fs.existsSync(stage)||fs.existsSync(evidence))throw Error('Test label already used; choose a fresh ARCH_RASTER_TEST_LABEL');
 fs.mkdirSync(stage,{recursive:true});fs.mkdirSync(evidence,{recursive:true});
 const rows=[],seen=new Set();
 function copy(input,relative,category){
  input=safePath(root,input);const target=safePath(stage,path.join(stage,relative),{exists:false}),bytes=fs.readFileSync(input);
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);
  rows.push({path:relative,input:path.relative(root,input).replaceAll('\\','/'),byteLength:bytes.length,sha256:sha256(bytes),category});
 }
 const roots=['src/app/adapters.d.mts','src/contracts/app-bridge.ts','src/core/product-worker-hook.mjs','src/kernel/mechanics/src/domain-adapter.mjs','src/core/raster-schema.mjs','src/core/raster-operations.mjs','src/core/raster-operations.d.mts','src/integration/raster-adapters.mjs','src/integration/raster-adapters.d.mts','src/app/documents.mjs','src/app/sources.mjs','src/app/proposals.mjs','src/app/source-approval.mjs'];
 const queue=[...roots];
 while(queue.length){
  const relative=queue.shift();if(seen.has(relative))continue;seen.add(relative);
  if(!relative.startsWith('src/'))throw Error('Dependency outside main src');
  const input=safePath(root,path.join(root,relative));copy(input,relative,'current-main-component');
  if(!relative.endsWith('.mjs'))continue;
  const source=fs.readFileSync(input,'utf8');
  for(const match of source.matchAll(/(?:from|import)\s*['"](\.[^'"]+)['"]/g)){
   const dep=path.posix.normalize(path.posix.join(path.posix.dirname(relative),match[1]));
   if(!dep.endsWith('.mjs'))throw Error('Unexpected component dependency '+dep);
   queue.push(dep);
  }
 }
 for(const relative of ['src/kernel/native/product-runtime.h','src/kernel/native/product-exports.json','src/kernel/Cargo.toml','src/kernel/Cargo.lock','src/kernel/src/lib.rs','src/kernel/native/raster-runtime.h','src/kernel/native/raster-exports.json','tools/kernel/build.ps1'])
  copy(path.join(root,relative),'input-records/'+relative,'current-main-root-record');
 function copyTests(dir,relative){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
   const input=safePath(root,path.join(dir,entry.name)),target=relative+'/'+entry.name;
   if(entry.isDirectory())copyTests(input,target);else copy(input,target,'permanent-test');
  }
 }
 copyTests(testRoot,'tests/raster-app');
 copy(moduleInput,'runtime/arch-kernel.mjs','selected-main-build');copy(wasmInput,'runtime/arch-kernel.wasm','selected-main-build');
 const moduleBytes=fs.readFileSync(wasmInput),exports=WebAssembly.Module.exports(new WebAssembly.Module(moduleBytes)).map(x=>x.name);
 const required=JSON.parse(fs.readFileSync(path.join(root,'src/kernel/native/raster-exports.json'),'utf8')).map(x=>x.replace(/^_/,''));
 for(const name of [...required,'arch_abi_version','arch_control_reset','arch_build_svg','arch_snapshot_release','arch_product_prepare_raster','arch_product_build','arch_product_buffer_ptr','arch_product_buffer_len'])if(!exports.includes(name))throw Error('Selected main Module missing export '+name);
 const fixtureDir=path.join(stage,'tests/raster-app/fixtures'),synthetic=JSON.parse(fs.readFileSync(path.join(fixtureDir,'synthetic-manifest.json'),'utf8')),vp8=JSON.parse(fs.readFileSync(path.join(fixtureDir,'vp8-manifest.json'),'utf8'));
 for(const row of [...synthetic,...vp8.fixtures]){
  const bytes=fs.readFileSync(path.join(fixtureDir,path.basename(row.path)));
  if(bytes.length!==row.bytes||sha256(bytes)!==row.sha256)throw Error('Pinned fixture mismatch: '+row.path);
 }
 // Detect input changes DURING staging rather than mix parent edits into one run.
 for(const row of rows)if(sha256(fs.readFileSync(path.join(root,row.input)))!==row.sha256)throw Error('Input changed during staging: '+row.input);
 const manifest={version:1,kind:'current-main staging for implementation tests',capturedUtc:new Date().toISOString(),label,rootModule:{input:path.relative(root,moduleInput).replaceAll('\\','/'),glueSha256:sha256(fs.readFileSync(moduleInput)),wasmSha256:sha256(moduleBytes),bytes:moduleBytes.length,exports:{raster:required.length,harfbuzz:exports.filter(x=>x.startsWith('hb_')).length,printing:exports.filter(x=>x.startsWith('arch3mf')).length,product:exports.filter(x=>x.startsWith('arch_product')).length}},files:rows};
 fs.writeFileSync(path.join(evidence,'staging.json'),JSON.stringify(manifest,null,2)+'\n');
 return {root,run,testRoot,label,stage,evidence,manifest};
}
