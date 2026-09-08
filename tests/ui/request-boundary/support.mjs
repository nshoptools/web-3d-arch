import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
export const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
export const json=p=>JSON.parse(fs.readFileSync(p,'utf8'));
export function safe(root,value,exists=true){root=fs.realpathSync(root);const p=path.resolve(value);if(p!==root&&!p.startsWith(root+path.sep))throw Error('Outside authorized root');
 for(let a=p;a!==root;a=path.dirname(a))if(fs.existsSync(a)&&fs.lstatSync(a).isSymbolicLink())throw Error('Reparse path');if(exists&&!fs.realpathSync(p).startsWith(root+path.sep)&&p!==root)throw Error('Resolved escape');return p;}
export function env(){if(!process.env.PROJECT_ROOT||!process.env.PROJECT_REVIEW_RUN)throw Error('Dot-source tools/development/env.ps1 first');const root=fs.realpathSync(process.env.PROJECT_ROOT),run=safe(root,process.env.PROJECT_REVIEW_RUN);if(!/^tmp[\\/]reviews[\\/](codex|opus|grok)[\\/]runs[\\/][A-Za-z0-9_-]+$/.test(path.relative(root,run)))throw Error('Explicit run required');return {root,run};}
export function write(file,value){const {run}=env();safe(run,file,false);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');}
export function walk(root){return fs.readdirSync(root,{withFileTypes:true}).flatMap(e=>{if(e.isSymbolicLink())throw Error('Reparse input');return e.isDirectory()?walk(path.join(root,e.name)):[path.join(root,e.name)];});}
export function capture(candidate){
 const {root,run}=env();candidate=safe(root,path.resolve(candidate));const revision=process.env.ARCH_UI_INPUT_REVISION??'initial';if(!/^[A-Za-z0-9_-]+$/.test(revision))throw Error('Invalid input revision');
 const base=revision==='initial'?path.join(run,'inputs'):path.join(run,'inputs/revisions',revision),input=path.join(base,'main'),recordFile=path.join(base,'capture.json');let records=[];const bytes=new Map();
 const sources=[...walk(path.join(root,'src/ui')),...walk(path.join(root,'src/contracts')),...['AGENTS.md','docs/development/README.md','docs/reviews/seat-config.json','docs/reviews/SEAT-CONFIG.md','tests/AGENTS.md','tools/development/env.ps1','tools/project-env.ps1','package.json','tsconfig.json','.toolchain/app-runtime/package.json','.toolchain/app-runtime/package-lock.json'].map(f=>path.join(root,f))];
 for(const file of sources){const rel=path.relative(root,file).replaceAll('\\','/'),b=fs.readFileSync(safe(root,file));records.push({file:rel,bytes:b.length,sha256:sha(b)});bytes.set(rel,b);}
 records.sort((a,b)=>a.file<b.file?-1:a.file>b.file?1:0);
 if(fs.existsSync(recordFile)){const prior=json(recordFile);if(JSON.stringify(prior.files)!==JSON.stringify(records))throw Error('Main changed since immutable capture; use a new RunId or explicitly capture an announced revision');}
 else{for(const r of records){const dest=safe(run,path.join(input,r.file),false);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes.get(r.file));}write(recordFile,{version:'arch-ui-request-test-inputs/1',files:records});}
 const stage=path.join(run,'work/h');fs.mkdirSync(stage,{recursive:true});
 for(const r of records.filter(r=>r.file.startsWith('src/')||r.file==='tsconfig.json')){const b=fs.readFileSync(safe(run,path.join(input,r.file)));if(sha(b)!==r.sha256)throw Error('Captured input changed');const dest=safe(run,path.join(stage,r.file),false);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,b);}
 for(const file of walk(path.join(candidate,'tests/ui/request-boundary'))){const rel=path.relative(candidate,file),dest=safe(run,path.join(stage,rel),false);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(file,dest);}
 fs.copyFileSync(path.join(candidate,'tests/ui/request-boundary/index.html'),path.join(stage,'index.html'));
 return {root,run,candidate,input,stage,records,recordFile,revision};
}

