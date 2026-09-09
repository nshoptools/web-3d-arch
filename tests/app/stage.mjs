import {mkdir,readFile,writeFile,readdir,access} from 'node:fs/promises';
import {join,relative,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {parseArgs,loadContext,ownPath,check} from './runner-env.mjs';
const scriptDir=dirname(fileURLToPath(import.meta.url)),args=parseArgs(),context=await loadContext(args['run-id'],{start:scriptDir});
const {root,run,runId}=context,stageId=Date.now()+'-'+randomUUID(),candidateRoot=dirname(dirname(scriptDir));
const runtime=await ownPath(run,join(run,'work/app-controller-tests',stageId,'runtime')),evidenceDirectory=await ownPath(run,join(run,'evidence/app-controller-tests',stageId)),temporaryDirectory=await ownPath(run,join(run,'temp/app-controller-tests',stageId));
const candidate=candidateRoot!==root;let inputRoot=root,baseline=null,origins=new Map();
if(candidate){
 await ownPath(run,candidateRoot);inputRoot=await ownPath(run,join(candidateRoot,'inputs/baseline'));
 baseline=JSON.parse(await readFile(join(candidateRoot,'inputs/baseline.json'),'utf8'));
 check(baseline.kind==='arch-app-ui-contract-baseline'&&baseline.version===1,'BASELINE_SCHEMA');
 origins=new Map(baseline.files.map(f=>[f.path,f]));
}
const sources=new Map(),code=new Set(['.mjs','.cjs','.mts','.ts','.json']);
async function tree(dir,extensions){
 for(const e of await readdir(join(inputRoot,dir),{withFileTypes:true})){
  const path=join(dir,e.name).replaceAll('\\','/');await ownPath(root,join(inputRoot,path));
  if(e.isDirectory())await tree(path,extensions);else if(extensions.has(extname(e.name)))sources.set(path,join(inputRoot,path));
 }
}
// src/printing/src: src/app/printer-profiles.mjs validates imported profiles through it.
for(const dir of ['src/app','src/domain','src/storage','src/editing','src/contracts','src/server','src/input','src/printing/src'])await tree(dir,code);
for(const name of ['arch-view.mjs','three-viewport.mjs'])sources.set('src/viewport/'+name,join(inputRoot,'src/viewport',name));
await tree('tests/app',new Set([...code,'.html','.ps1']));
sources.set('tests/server/helpers.mjs',join(inputRoot,'tests/server/helpers.mjs'));
await tree('tests/server/fixtures',new Set(['.json','.png','.jpg']));
for(const [name,path]of [['three.module.js','build/three.module.js'],['three.core.js','build/three.core.js'],['OrbitControls.js','examples/jsm/controls/OrbitControls.js']])sources.set('vendor/three/'+name,candidate?join(inputRoot,'vendor/three',name):join(root,'.toolchain/app-runtime/node_modules/three',path));
for(const file of ['src/integration/text-adapters.mjs','src/integration/source-catalog.mjs','src/integration/raster-adapters.mjs','src/core/raster-schema.mjs','src/core/png-encode.mjs'])sources.set(file,join(inputRoot,file));
// Exact bounded delta. Integrated tests stage current main; candidate tests use their frozen input tree.
if(candidate)for(const file of [
 'src/app/controller.mjs','src/app/jobs.mjs','src/app/projects.mjs','src/app/proposals.mjs','src/app/documents.mjs','src/app/adapters.d.mts','src/app/export-policy.mjs','src/contracts/app-bridge.ts',
 'tests/app/browser-cases.mjs','tests/app/ui-contract.browser.mjs','tests/app/ui-contract.node.test.mjs','tests/app/ui-contract.examples.ts'])
 sources.set(file,join(candidateRoot,file));
for(const name of ['run.ps1','stage.mjs','run-browser.mjs','runner-env.mjs','portability.node.test.mjs'])sources.set('tests/app/'+name,join(scriptDir,name));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),files=[];
await mkdir(runtime,{recursive:true});await mkdir(evidenceDirectory,{recursive:true});await mkdir(temporaryDirectory,{recursive:true});
for(const [path,input]of [...sources].sort(([a],[b])=>a.localeCompare(b))){
 await ownPath(root,input);const bytes=await readFile(input);check(bytes.length<=32*1024*1024,'STAGE_FILE_BUDGET');
 const origin=origins.get(path);
 if(input===join(inputRoot,path)&&candidate)check(origin?.sha256===sha(bytes),'FROZEN_BASELINE_CHANGED');
 const target=await ownPath(run,join(runtime,path));await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes,{flag:'wx'});
 files.push({path,source:relative(root,input).replaceAll('\\','/'),...(input===join(inputRoot,path)&&origin?{origin:origin.source}:{}),bytes:bytes.length,sha256:sha(bytes)});
}
for(const f of files)check(sha(await readFile(join(root,f.source)))===f.sha256,'SOURCE_CHANGED_DURING_STAGE');
const stage={kind:'arch-app-test-stage',version:2,runId,seat:context.seat,stageId,repoRoot:root,runtime,evidenceDirectory,temporaryDirectory,baseline:candidate?'frozen-main-plus-alignment':'current-main',files};
await writeFile(join(runtime,'stage.json'),JSON.stringify(stage,null,2));
await writeFile(join(evidenceDirectory,'stage.json'),JSON.stringify(stage,null,2));
console.log(JSON.stringify({runId,stageId,runtime,evidenceDirectory,temporaryDirectory,fileCount:files.length}));
