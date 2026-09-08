import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
import {stageEnvironment,safePath} from './environment.mjs';
const root=fs.realpathSync(process.env.PROJECT_ROOT),run=safePath(root,process.env.PROJECT_REVIEW_RUN),here=fileURLToPath(new URL('./',import.meta.url));
test('input/output escape and invalid module are rejected before staging writes',()=>{
 assert.throws(()=>safePath(run,path.join(run,'../escape'),{exists:false}),/escapes/);
 const prior=process.env.ARCH_KERNEL_MODULE,priorLabel=process.env.ARCH_RASTER_TEST_LABEL;
 try{
  process.env.ARCH_RASTER_TEST_LABEL='portability-invalid';
  process.env.ARCH_KERNEL_MODULE=path.join(root,'../external/arch-kernel.mjs');
  assert.throws(stageEnvironment,/escapes/);
  process.env.ARCH_KERNEL_MODULE=path.join(here,'fixtures/synthetic-rgba.png');
  assert.throws(stageEnvironment,/must select arch-kernel/);
  assert.equal(fs.existsSync(path.join(run,'work/raster-app-stage/portability-invalid')),false);
 }finally{
  if(prior===undefined)delete process.env.ARCH_KERNEL_MODULE;else process.env.ARCH_KERNEL_MODULE=prior;
  if(priorLabel===undefined)delete process.env.ARCH_RASTER_TEST_LABEL;else process.env.ARCH_RASTER_TEST_LABEL=priorLabel;
 }
});
test('relocated permanent tests stage ONLY current main components, then execute real Node Module',()=>{
 const label=process.env.ARCH_RASTER_PORTABILITY_LABEL??'relocated';
 assert.match(label,/^[A-Za-z0-9_-]{1,64}$/);
 const target=safePath(run,path.join(run,'work/raster-app-portability',label,'tests/raster-app'),{exists:false});
 assert.equal(fs.existsSync(target),false,'use fresh portability label');
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.cpSync(here,target,{recursive:true,errorOnExist:true,force:false});
 const child=spawnSync(process.execPath,[path.join(target,'stage-probe.mjs')],{cwd:path.dirname(path.dirname(target)),env:{...process.env,ARCH_RASTER_TEST_LABEL:label},encoding:'utf8',timeout:60000});
 assert.equal(child.status,0,child.stdout+child.stderr);console.log(child.stdout.trim());
 const evidence=path.join(run,'evidence/raster-app',label),manifest=JSON.parse(fs.readFileSync(path.join(evidence,'staging.json')));
 const components=manifest.files.filter(x=>x.category==='current-main-component');
 assert.ok(components.length>10);assert.ok(components.every(x=>x.input===x.path&&x.path.startsWith('src/')));
 assert.ok(manifest.files.filter(x=>x.category==='permanent-test').every(x=>x.input.includes('/raster-app-portability/'+label+'/')));
 const result=JSON.parse(fs.readFileSync(path.join(evidence,'portability.json')));
 assert.equal(result.pass,true);assert.equal(result.checks,25);assert.equal(result.moduleInstances,1);
});
