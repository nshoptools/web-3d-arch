// Portable private overlay. No root file, dependency, or frozen room is edited.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=process.env.PROJECT_ROOT,run=process.env.PROJECT_REVIEW_RUN;
if(!root||!run)throw Error('Dot-source tools/development/env.ps1 with an own run first');
const candidate=fileURLToPath(new URL('../../',import.meta.url)),dest=path.join(run,'work/app-overlay');
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const under=(a,b)=>path.relative(a,b)!==''&&!path.relative(a,b).startsWith('..')&&!path.isAbsolute(path.relative(a,b));
if(!under(root,run)||!under(run,dest))throw Error('Run/overlay path escapes authorized repo');
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e=>{
 const p=path.join(dir,e.name);if(e.isSymbolicLink())throw Error('No linked paths: '+p);return e.isDirectory()?walk(p):[p];});}
function put(src,out){if(!under(run,out))throw Error('Output path');if(path.resolve(src)===path.resolve(out))return;fs.mkdirSync(path.dirname(out),{recursive:true});
 if(!under(fs.realpathSync(run),fs.realpathSync(path.dirname(out))))throw Error('Linked output path');
 if(fs.existsSync(out))fs.chmodSync(out,0o666);fs.copyFileSync(src,out);fs.chmodSync(out,0o666);
 if(hash(src)!==hash(out))throw Error('Input changed during copy: '+src);}
const records=[];
const file=rel=>{const src=path.join(root,rel);put(src,path.join(dest,rel));records.push({path:rel.replaceAll('\\','/'),bytes:fs.statSync(src).size,sha256:hash(src)});};
// Freeze dependency preimages once. Subsequent preparation only refreshes our files.
if(!fs.existsSync(path.join(run,'inputs/app-preimages.json'))){
 for(const rel of ['src/printing/src','src/printing/node_modules/@xmldom/xmldom','src/printing/node_modules/fflate'])for(const f of walk(path.join(root,rel)))file(path.relative(root,f));
 for(const rel of ['src/printing/package.json','src/printing/package-lock.json','src/printing/tests/profile-fixtures.mjs','src/viewport/arch-view.mjs','src/app/adapters.d.mts','src/app/export-policy.mjs','src/app/common.mjs','src/contracts/app-bridge.ts','src/input/text-layout.mjs','src/input/source-contract.mjs','src/core/png-encode.mjs','src/kernel/final-scene-export/runtime-helper.mjs'])file(rel);
 const docs=['AGENTS.md','docs/development/README.md','docs/reviews/seat-config.json','docs/reviews/SEAT-CONFIG.md','tmp/reviews/README.md','docs/assets/INPUT-CONTRACT.md','tests/AGENTS.md','tests/README.md','docs/specs/01-chuc-nang.md','docs/specs/03-ky-thuat.md','docs/specs/04-nghiem-thu.md','docs/app/adapter-contract.md','docs/app/controller-ui-contract.md','src/core/engine-client.mjs','src/core/engine-worker.mjs','src/integration/application.mjs','src/integration/kernel-adapters.mjs','src/core/product-export-descriptor.mjs'];
 for(const rel of docs)records.push({path:rel,bytes:fs.statSync(path.join(root,rel)).size,sha256:hash(path.join(root,rel)),readOnlyReference:true});
 fs.writeFileSync(path.join(run,'inputs/app-preimages.json'),JSON.stringify(records,null,2)+'\n');
}
const preimages=JSON.parse(fs.readFileSync(path.join(run,'inputs/app-preimages.json')));
for(const rel of ['src/storage/common.mjs','src/app/export-messages.mjs','src/contracts/product-material.mjs','src/contracts/product-material.d.mts','src/domain/layers.mjs','src/domain/safe.mjs','src/domain/decimal.mjs','src/domain/hash.mjs'])if(!preimages.some(p=>p.path===rel)){file(rel);preimages.push(records.at(-1));}
for(const dir of ['tests/fixtures/slicer-profiles/v1'])for(const f of walk(path.join(root,dir))){const rel=path.relative(root,f).replaceAll('\\','/');if(!preimages.some(p=>p.path===rel))preimages.push({path:rel,bytes:fs.statSync(f).size,sha256:hash(f),readOnlyReference:true});}
fs.writeFileSync(path.join(run,'inputs/app-preimages.json'),JSON.stringify(preimages,null,2)+'\n');
// Explicit owned paths work both in a candidate and after integration into main.
// Never recursively copy a repo root (which could contain other runs/toolchains).
const ownFiles=['src/integration/export-adapters.mjs','src/integration/export-adapters.d.mts',
 ...['export-adapters.test.mjs','export-fixture.mjs','export-oracles.mjs','export-types.mts','export-browser-worker.mjs'].map(n=>'tests/integration/'+n),
 ...['docs/export-app','tools/export-app'].flatMap(dir=>walk(path.join(candidate,dir)).map(f=>path.relative(candidate,f)))];
for(const rel of ownFiles)put(path.join(candidate,rel),path.join(dest,rel));
// A caller supplies a same-Module build; test scripts do not fetch/build another engine.
if(process.env.ARCH_EXPORT_TEST_MODULE){const src=path.resolve(process.env.ARCH_EXPORT_TEST_MODULE);
 if(!under(root,src)||path.basename(src)!=='arch-kernel.mjs')throw Error('Pass an in-repository arch-kernel.mjs test build');
 const moduleFiles=[src,src.replace(/\.mjs$/,'.wasm')];
 for(const p of moduleFiles)put(p,path.join(run,'work/module',path.basename(p)));
 if(src!==path.join(run,'work/module/arch-kernel.mjs')||!fs.existsSync(path.join(run,'inputs/test-module.json')))
  fs.writeFileSync(path.join(run,'inputs/test-module.json'),JSON.stringify({role:'actual same-Module final helper; client/provider test transport explicitly labelled',files:moduleFiles.map(p=>({path:path.relative(root,p).replaceAll('\\','/'),sha256:hash(p),bytes:fs.statSync(p).size}))},null,2)+'\n');
}
console.log(JSON.stringify({candidate,dest,rootWrites:false}));
