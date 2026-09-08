import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import assert from 'node:assert/strict';
import {configuration,pack} from './options.mjs';
const run=process.env.PROJECT_REVIEW_RUN;if(!run)throw Error('run environment required');
const exe=process.env.ARCH_FINAL_NATIVE??path.join(run,'work/rust-target/release/examples/final-export-probe.exe');const dir=path.join(run,'evidence/final-export-native-runtime');fs.mkdirSync(dir,{recursive:true});
const config=configuration(2);const options=path.join(dir,'ownership.options.bin');fs.writeFileSync(options,pack(config));
let p=spawnSync(exe,['runtime',options,path.join(dir,'ownership')],{encoding:'utf8',timeout:45000});fs.writeFileSync(path.join(dir,'ownership.log'),p.stdout+p.stderr);assert.equal(p.status,0,p.stderr);
const ownership=JSON.parse(fs.readFileSync(path.join(dir,'ownership.json')));const results=[];
for(const threshold of [0,200,250,800,900]){
 const settings=configuration(200,{format:threshold>=800?2:1}),stem=path.join(dir,`cancel-${threshold}`);fs.writeFileSync(stem+'.options.bin',pack(settings));fs.writeFileSync(stem+'.repro.json',JSON.stringify({fixture:200,cancelAt:threshold,options:settings},null,2));
 p=spawnSync(exe,['200',stem+'.options.bin',stem],{encoding:'utf8',timeout:45000,env:{...process.env,ARCH_FINAL_CANCEL_AT:String(threshold)}});fs.writeFileSync(stem+'.log',p.stdout+p.stderr);assert.equal(p.status,0,p.stderr);
 const result=JSON.parse(fs.readFileSync(stem+'.json'));assert.equal(result.ok,false);assert.equal(result.error,'CANCELLED');assert.equal(result.phase,4);assert.equal(result.sourceUnchanged,true);assert.equal(result.inputConsumed,true);results.push({threshold,result});
}
const report={ownership,cancellation:{passed:results.length,results}};fs.writeFileSync(path.join(run,'evidence/final-export-native-runtime.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({ownership:ownership.passed,cancellation:results.length}));
