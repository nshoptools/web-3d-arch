import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
import cases from './cases.mjs';import {pack} from './options.mjs';import {oracle,oracleSources} from './oracles.mjs';
const run=process.env.PROJECT_REVIEW_RUN;if(!run)throw Error('run environment required');
const exe=process.env.ARCH_FINAL_NATIVE??path.join(run,'work/rust-target/release/examples/final-export-probe.exe');const out=path.join(run,'evidence/final-export-native');fs.mkdirSync(out,{recursive:true});
const results=[];
for(const test of cases){const stem=path.join(out,test.id);fs.writeFileSync(stem+'.options.bin',pack(test.config));fs.writeFileSync(stem+'.repro.json',JSON.stringify(test,null,2));
 const process=spawnSync(exe,[String(test.fixture),stem+'.options.bin',stem],{encoding:'utf8',timeout:45000});fs.writeFileSync(stem+'.log',(process.stdout??'')+(process.stderr??''));
 try{if(process.status!==0)throw Error(`native exit ${process.status}: ${process.stderr}`);const raw=JSON.parse(fs.readFileSync(stem+'.json'));const bytes=raw.ok?fs.readFileSync(stem+'.bin'):undefined;const metrics=oracle(test,raw,bytes);results.push({id:test.id,pass:true,metrics});}
 catch(error){results.push({id:test.id,pass:false,error:error.stack});console.log(JSON.stringify({id:test.id,error:error.message}));}
}
const result={target:'native',cases:results.length,passed:results.filter(r=>r.pass).length,oracleSources,results};fs.writeFileSync(path.join(run,'evidence/final-export-native-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({target:result.target,cases:result.cases,passed:result.passed}));if(result.passed!==result.cases)process.exitCode=1;
