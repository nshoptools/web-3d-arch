
import {readdirSync,readFileSync,writeFileSync,mkdirSync,lstatSync,existsSync,statSync} from 'node:fs';import {join,resolve,relative} from 'node:path';import {createHash} from 'node:crypto';
const run=resolve(process.env.PROJECT_REVIEW_RUN??''),repo=resolve(process.env.PROJECT_ROOT??'');if(!run.startsWith(repo+'\\tmp\\reviews\\codex\\runs\\'))throw Error('owned run env required');
const report=join(run,'reports'),candidate=join(run,'work/product-acceptance'),hash=b=>createHash('sha256').update(b).digest('hex'),slash=p=>p.replaceAll('\\','/');
const out=(p,v)=>writeFileSync(p,JSON.stringify(v,null,2)+'\n',{flag:'wx'});if(existsSync(join(report,'FROZEN.json')))throw Error('already frozen');
function files(root){const result=[];for(const e of readdirSync(root,{withFileTypes:true})){const p=join(root,e.name);if(lstatSync(p).isSymbolicLink())throw Error('link');if(e.isDirectory())result.push(...files(p));else if(e.isFile())result.push(p);}return result.sort();}
const entries=[];for(const p of files(candidate)){const b=readFileSync(p),destination=slash(relative(candidate,p)),main=join(repo,destination);entries.push({path:slash(relative(run,p)),destination,sha256:hash(b),bytes:b.length,preimage:existsSync(main)?hash(readFileSync(main)):null});}
const manifest={schema:'product-acceptance-checked-manifest/1',role:'implementation acceptance, not configured independent review',runId:'20260908-product-acceptance-wave1',entries};
out(join(report,'checked-manifest.json'),manifest);
const evidenceRoot=join(run,'evidence'),snapshot=join(report,'frozen-evidence');mkdirSync(snapshot);
const evidence=[],summary=[],excluded=[];
for(const e of readdirSync(evidenceRoot,{withFileTypes:true})){
 const dir=join(evidenceRoot,e.name);
 if(!e.isDirectory()||!/(?:chromium|firefox|webkit)$/.test(e.name))continue;
 if(!existsSync(join(dir,'cleanup.json'))){excluded.push({name:e.name,reason:'no complete cleanup record at cutoff; raw files retained, not accepted'});continue;}
 const target=join(snapshot,e.name);mkdirSync(target);
 for(const p of files(dir)){const r=relative(dir,p);if(r.startsWith('downloads'))continue;const b=readFileSync(p),dest=join(target,r);mkdirSync(resolve(dest,'..'),{recursive:true});writeFileSync(dest,b,{flag:'wx'});evidence.push({path:slash(relative(run,dest)),original:slash(relative(run,p)),sha256:hash(b),bytes:b.length});
  if(p.endsWith('-result.json')){const v=JSON.parse(b);summary.push({run:e.name,id:r.replace('-result.json',''),verdict:v.verdict,expected:v.expected,durationMs:v.durationMs,error:v.actual?.error?.split('\n')[0]??null});}
 }
 const log=join(evidenceRoot,e.name+'.log');if(existsSync(log)){const b=readFileSync(log),p=join(snapshot,e.name+'.log');writeFileSync(p,b,{flag:'wx'});evidence.push({path:slash(relative(run,p)),original:slash(relative(run,log)),sha256:hash(b),bytes:b.length});}
}
for(const e of readdirSync(evidenceRoot,{withFileTypes:true})){
 if(!e.isFile()||!(/-exit\.json$/.test(e.name)||/abort|correction|resource-observation|download-readback|artifact-verify|reader/.test(e.name)))continue;
 const b=readFileSync(join(evidenceRoot,e.name)),p=join(snapshot,e.name);writeFileSync(p,b,{flag:'wx'});evidence.push({path:slash(relative(run,p)),original:'evidence/'+e.name,sha256:hash(b),bytes:b.length});
}
for(const p of [...files(join(run,'inputs/owned-r2')),join(run,'inputs/source-capture-preparation.json')]){
 if(!existsSync(p))throw Error('missing integrity input');const b=readFileSync(p),r=relative(run,p),dest=join(snapshot,r);mkdirSync(resolve(dest,'..'),{recursive:true});writeFileSync(dest,b,{flag:'wx'});evidence.push({path:slash(relative(run,dest)),original:slash(r),sha256:hash(b),bytes:b.length});
}
out(join(report,'evidence-manifest.json'),{schema:'product-acceptance-evidence-manifest/1',entries:evidence,excluded});
out(join(report,'case-summary.json'),{schema:'product-acceptance-case-summary/1',note:'Historical repetitions, harness errors and interrupted cases are retained; not an aggregate acceptance percentage.',cases:summary,excluded});
for(const e of entries.concat(evidence))if(hash(readFileSync(join(run,e.path)))!==e.sha256)throw Error('seal verification mismatch');
const bindings=['checked-manifest.json','evidence-manifest.json','case-summary.json','handoff.md'].map(name=>{const b=readFileSync(join(report,name));return {path:'reports/'+name,sha256:hash(b),bytes:b.length};});
const originalZip=readFileSync(join(run,'evidence/campaign-r1-chromium/svg-after.arch-project.zip'));if(hash(originalZip)!=='d2fb8df8efa5a28d3813fdc822472ea49ce6e700a93db97c69308e19f258ab15')throw Error('original failure ZIP changed');
out(join(report,'FROZEN.json'),{schema:'product-acceptance-frozen/1',at:new Date().toISOString(),files:entries.length,evidenceFiles:evidence.length,bindings,excluded,artifact:JSON.parse(readFileSync(join(run,'inputs/owned-r2/artifact-check.json'))),limitations:['inherited Astra/max; fast mode not exposed','not independent configured review','baseline not ready for general release','all active/incomplete results excluded; no physical fit or whole-pipeline tolerance claim']});
console.log(JSON.stringify({files:entries.length,evidenceFiles:evidence.length,excluded,bindings,frozenSHA256:hash(readFileSync(join(report,'FROZEN.json')))}));
