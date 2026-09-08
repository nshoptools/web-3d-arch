import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const run=process.env.PROJECT_REVIEW_RUN,base=path.resolve(import.meta.dirname,'../..'),[stage,label]=process.argv.slice(2);
if(!['before','after'].includes(stage)||!/^[-_a-zA-Z0-9]{1,60}$/.test(label))throw Error('ARGS');
const hash=b=>createHash('sha256').update(b).digest('hex'),rows=[];
function scan(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.isSymbolicLink())throw Error('LINK');const p=path.join(dir,e.name);if(e.isDirectory())scan(p);else{const b=fs.readFileSync(p);rows.push({path:path.relative(base,p).replaceAll('\\','/'),bytes:b.length,sha256:hash(b)});}}}
for(const p of ['src','tests'])scan(path.join(base,p));rows.sort((a,b)=>a.path.localeCompare(b.path));
const pins=JSON.parse(fs.readFileSync(path.join(run,'inputs/runtime-api-production.json')));
for(const [i,e]of ['mjs','wasm'].entries()){const b=fs.readFileSync(path.join(run,'work/module/arch-kernel.'+e));if(hash(b)!==pins.module[i].sha256)throw Error('MODULE_CHANGED');}
const target=path.join(run,'evidence',stage+'-'+label+'.json');
fs.writeFileSync(target,JSON.stringify({version:'arch-source-svg-run-inputs/1',rows,module:pins.module,node:process.version},null,2),{flag:'wx'});
if(stage==='after'){const before=JSON.parse(fs.readFileSync(path.join(run,'evidence','before-'+label+'.json')));if(JSON.stringify(before.rows)!==JSON.stringify(rows))throw Error('CODE_CHANGED');console.log(JSON.stringify({codeStable:true,files:rows.length,moduleStable:true}));}
