import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';
import {source,products,artModes,makeRequest} from './fixtures.mjs';
import {readProductSemantics} from '../../src/core/product-operations.mjs';
import {run,nativePath} from './environment.mjs';
const dir=path.join(run,'evidence/native-product');fs.mkdirSync(dir,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex'),sha=hash(source),records=[];
const executable=nativePath;
const selected=process.argv[2]??'all';
for(const product of products)for(const art of selected==='defaults'?[null]:artModes){
 const name=product+'-'+(art??'default'),base=path.join(dir,name),packed=makeRequest(product,art,{sourceHash:sha,headHash:hash(name)}).packed;
 fs.writeFileSync(base+'.svg',source);fs.writeFileSync(base+'.request',packed);
 if(selected==='prepare')continue;
 const started=performance.now(),p=spawnSync(executable,[base+'.svg',base+'.request',base],{encoding:'utf8',timeout:120000,env:process.env});
 fs.writeFileSync(base+'.log',(p.stdout??'')+(p.stderr??''));
 if(p.status!==0){records.push({name,status:'fail',exit:p.status,error:p.error?.message,log:p.stderr});console.log(name,records.at(-1));continue;}
 const result=JSON.parse(fs.readFileSync(base+'.json'));
 if(fs.existsSync(base+'.buf1')){const m=readProductSemantics(new Uint8Array(fs.readFileSync(base+'.buf1')));
 result.semantic={sourceVerdict:m.sourceVerdict,mechanicsVerdict:m.mechanicsVerdict,parts:m.parts.length,features:m.features.length,sourceDiagnostics:m.sourceDiagnostics,diagnostics:m.diagnostics,sourceProposals:m.sourceProposals,proposals:m.proposals};
 }
 records.push({name,seconds:(performance.now()-started)/1000,result});console.log(name,JSON.stringify(result));
}
fs.writeFileSync(path.join(dir,'results-'+selected+'.json'),JSON.stringify(records,null,2)+'\n');
if(records.some(r=>r.status==='fail'||r.result.stage!=='complete'))process.exitCode=1;
