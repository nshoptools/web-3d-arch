// Parallel scheduling only: each case uses the unchanged curved-products runner.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),run=fs.realpathSync(process.env.PROJECT_REVIEW_RUN);
const [target,tag,corpus='corpus-production']=process.argv.slice(2);
assert.ok(['native','wasm'].includes(target));assert.match(tag,/^[\w-]+$/);assert.ok(['corpus-production','corpus-variants'].includes(corpus));
const ids=fs.readdirSync(path.join(run,'inputs',corpus)).filter(f=>f.endsWith('.aprq')).map(f=>f.slice(0,-5)).sort();assert.equal(ids.length,corpus==='corpus-production'?40:12);
const out=path.join(run,'evidence',tag);fs.mkdirSync(out,{recursive:false});
let next=0;const results=[],commands=[];
async function worker(){while(next<ids.length){const id=ids[next++],single=tag+'-'+id;
 const argv=[path.join(here,'../curved-products/run.mjs'),target,single],env={...process.env,CURVED_CORPUS:corpus,CURVED_FILTER:'^'+id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$'};
 const log=fs.createWriteStream(path.join(out,id+'.log'),{flags:'wx'});
 const status=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,argv,{env,stdio:['ignore','pipe','pipe']});child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});child.once('error',reject);child.once('close',code=>log.end(()=>resolve(code)));});
 commands.push({id,executable:process.execPath,argv,exit:status});
 const source=path.join(run,'evidence',single),summaryPath=path.join(source,'summary.json');
 if(fs.existsSync(summaryPath)){const rows=JSON.parse(fs.readFileSync(summaryPath));assert.equal(rows.length,1);assert.equal(rows[0].id,id);results.push(rows[0]);
  for(const f of fs.readdirSync(source))if(f!=='summary.json')fs.copyFileSync(path.join(source,f),path.join(out,f),fs.constants.COPYFILE_EXCL);}
 console.log(id+': exit '+status);
 fs.writeFileSync(path.join(out,'commands.json'),JSON.stringify(commands,null,2)+'\n');
 fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(results.sort((a,b)=>a.id.localeCompare(b.id)),null,2)+'\n');
}}
await Promise.all([worker(),worker()]);assert.equal(results.length,ids.length);assert.ok(commands.every(c=>c.exit===0));assert.ok(results.every(r=>r.sourceVerdict===0&&r.mechanicsVerdict===0&&!r.blocked&&r.parts>0));
console.log(`${target} ${results.length}/${ids.length} unchanged corpus requests PASS`);
