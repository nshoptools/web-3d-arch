import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import cases from './cases.mjs';import {api,runCase,ownership} from './module-api.mjs';import {oracle,oracleSources} from './oracles.mjs';
import {configuration} from './options.mjs';import {encodeFinalExportOptions,exportFinalFileBytes} from '../runtime-helper.mjs';
const run=process.env.PROJECT_REVIEW_RUN;if(!run)throw Error('run environment required');
const modulePath=process.env.ARCH_FINAL_WASM??path.join(run,'work/module/arch-kernel.mjs');const create=(await import(pathToFileURL(modulePath))).default;
const M=await create();const A=api(M);const out=path.join(run,'evidence/final-export-wasm');fs.mkdirSync(out,{recursive:true});const results=[];
for(const test of cases){const stem=path.join(out,test.id);try{
 const {result,bytes,config}=runCase(A,test);fs.writeFileSync(stem+'.json',JSON.stringify(result,null,2));fs.writeFileSync(stem+'.repro.json',JSON.stringify({...test,config},null,2));if(bytes)fs.writeFileSync(stem+'.bin',bytes);
 const metrics=oracle(test,result,bytes?Buffer.from(bytes):undefined);results.push({id:test.id,pass:true,metrics});
}catch(error){results.push({id:test.id,pass:false,error:error.stack});console.log(JSON.stringify({id:test.id,error:error.message}));}}
let lifetime;try{lifetime=ownership(A);fs.writeFileSync(path.join(run,'evidence/final-export-wasm-ownership.json'),JSON.stringify(lifetime,null,2));}catch(error){lifetime={error:error.stack,passed:0};console.log(error.stack)}
let helper;
try{const s=A.source(2),c=configuration(2,{generation:s.g});const out=exportFinalFileBytes(M,s.id,encodeFinalExportOptions(c),A.next());
 const metrics=oracle({config:c,expect:{volume:736,euler:0}},{ok:true,phase:2,progress:1000,sourceUnchanged:true,inputConsumed:true,metadata:out.metadata},Buffer.from(out.bytes));
 let code;try{exportFinalFileBytes(M,s.id,encodeFinalExportOptions({...c,gates:1,inspection:1}),A.next());}catch(e){code=e.code}if(code!=='INVALID_INPUT')throw Error('helper invalid upstream gate');M._arch_snapshot_release(s.id);if(A.stats().some(n=>n!==0))throw Error('helper retained a root charge');helper={passed:2,metrics};
}catch(e){helper={passed:0,error:e.stack};console.log(e.stack)}
const result={target:'wasm',cases:results.length,passed:results.filter(r=>r.pass).length,oracleSources,results,ownership:lifetime,helper};fs.writeFileSync(path.join(run,'evidence/final-export-wasm-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({target:result.target,cases:result.cases,passed:result.passed,ownership:lifetime.passed,helper:helper.passed}));if(result.passed!==result.cases||lifetime.passed===0||helper.passed===0)process.exitCode=1;
