import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';
const root=fs.realpathSync(process.env.PROJECT_ROOT),anchor=fs.realpathSync(process.env.PROJECT_REVIEW_RUN);
const args=process.argv.slice(2),opt={};for(let i=0;i<args.length;i+=2){if(!args[i]?.startsWith('--')||!args[i+1])throw Error('ARGS');opt[args[i].slice(2)]=args[i+1];}
for(const k of Object.keys(opt))if(!['source','module','wasm','mjs-sha','wasm-sha','target'].includes(k))throw Error('ARG:'+k);
const inside=(p,base=root)=>{const q=fs.realpathSync(p);if(q!==base&&!q.startsWith(base+path.sep))throw Error('OUTSIDE_REPO');return q;};
const source=inside(opt.source??path.resolve(import.meta.dirname,'../..')),run=path.resolve(opt.target??anchor);
if(run!==anchor&&!run.startsWith(anchor+path.sep))throw Error('OUTPUT_SCOPE');
for(let p=run;p!==anchor;p=path.dirname(p))if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('OUTPUT_LINK');
const h=b=>createHash('sha256').update(b).digest('hex'),pins=[],captured=new Map();
function put(p,b,origin){const dest=path.resolve(run,p);if(!dest.startsWith(run+path.sep))throw Error('OUTPUT_PATH');fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,b,{flag:'wx'});pins.push({path:p,bytes:b.length,sha256:h(b),source:origin});}
function capture(p){
 if(captured.has(p))return;if(captured.size>=512)throw Error('SOURCE_CLOSURE_LIMIT');
 const full=inside(path.join(source,p)),b=fs.readFileSync(full);captured.set(p,b);
 if(/\.(mjs|mts|ts)$/.test(p)){
  if(p.endsWith('.mjs')&&fs.existsSync(path.join(source,p.slice(0,-4)+'.d.mts')))capture(p.slice(0,-4)+'.d.mts');
  for(const m of b.toString().matchAll(/(?:from\s*|import\s*(?:\(\s*)?|new URL\(\s*)?['"](\.[^'"]+\.(?:mjs|js|ts))['"]/g)){
   const dep=path.posix.normalize(path.posix.join(path.posix.dirname(p),m[1]));
   // TypeScript resolves a type-only .mjs import to .d.mts even when no runtime
   // file exists; retain that declaration and its own relative dependencies.
   const candidates=[dep,...(dep.endsWith('.mjs')?[dep.slice(0,-4)+'.d.mts']:dep.endsWith('.js')?[dep.slice(0,-3)+'.ts',dep.slice(0,-3)+'.d.ts']:[])];
   const found=candidates.find(file=>fs.existsSync(path.join(source,file)));if(found)capture(found);
  }
 }
}
for(const e of fs.readdirSync(path.join(source,'tests/source-svg-export')))if(fs.statSync(path.join(source,'tests/source-svg-export',e)).isFile())capture('tests/source-svg-export/'+e);
for(const p of ['src/integration/source-svg-export.mjs','src/core/engine-worker.mjs','src/core/engine-text-renderer.mjs','tests/text-app/fixture-data.mjs','src/editing/index.mjs'])capture(p);
const module=[];
for(const [field,pinField,ext]of [['module','mjs-sha','mjs'],['wasm','wasm-sha','wasm']]){
 if(!/^[a-f0-9]{64}$/.test(opt[pinField]))throw Error('EXPLICIT_MODULE_HASH');
 const p=inside(opt[field]),b=fs.readFileSync(p);if(h(b)!==opt[pinField])throw Error('MODULE_HASH');
 module.push({path:path.relative(root,p).replaceAll('\\','/'),bytes:b.length,sha256:h(b)});put('work/module/arch-kernel.'+ext,b,path.relative(root,p));
}
for(const [p,b]of captured)if(h(fs.readFileSync(path.join(source,p)))!==h(b))throw Error('SOURCE_CHANGED:'+p);
for(const [p,b]of captured){put('inputs/test-source/'+p,b,path.relative(root,path.join(source,p)));put('work/source-svg-export/'+p,b,path.relative(root,path.join(source,p)));}
const {fixtureData}=await import(pathToFileURL(path.join(source,'tests/text-app/fixture-data.mjs'))),f=await fixtureData(root),fontHashes=new Set(Object.values(f.entries).map(f=>f.sha256));
const actual=[...f.assetRecords.values()].filter(r=>fontHashes.has(r.sha256)||r.mediaType==='image/svg+xml');
for(const a of actual){const p=inside(f.assetFiles.get(a.sha256)),b=fs.readFileSync(p);if(b.length!==a.bytes||h(b)!==a.sha256)throw Error('ORIGINAL_HASH');put('inputs/library/'+a.sha256,b,path.relative(root,p));}
for(const [name,version]of [['fflate','0.8.3'],['@xmldom/xmldom','0.9.12']]){
 const from=inside(path.join(root,'.toolchain/printing-js/node_modules',name));if(JSON.parse(fs.readFileSync(path.join(from,'package.json'))).version!==version)throw Error('DEP_VERSION');
 function cp(p,rel=''){for(const e of fs.readdirSync(p,{withFileTypes:true})){if(e.isSymbolicLink())throw Error('LINK');const r=rel?rel+'/'+e.name:e.name,src=path.join(p,e.name);if(e.isDirectory())cp(src,r);else put('work/node_modules/'+name+'/'+r,fs.readFileSync(src),path.relative(root,src));}}cp(from);
}
function legal(dir,rel){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.isSymbolicLink())throw Error('LINK');const p=path.join(dir,e.name),r=rel+'/'+e.name;if(e.isDirectory())legal(p,r);else put('inputs/legal/'+r,fs.readFileSync(p),r);}}
for(const p of ['src/assets/fonts/licenses','src/assets/emoji/licenses','src/assets/emoji/color/licenses'])legal(inside(path.join(root,p)),p);
put('inputs/source-fixture.json',Buffer.from(JSON.stringify({catalog:f.catalog,entries:f.entries,assetRecords:[...f.assetRecords.values()],actualAssets:actual},null,2)),'labelled synthetic selection; original font/artwork bytes');
const files=[...captured].map(([path,b])=>({path,bytes:b.length,sha256:h(b)}));
put('inputs/runtime-api-production.json',Buffer.from(JSON.stringify({version:'arch-source-svg-runtime-pins/1',module,files},null,2)),'explicit supplied Module; checked source closure');
put('inputs/test-dependencies.json',Buffer.from(JSON.stringify({version:'arch-source-svg-test-inputs/1',pins},null,2)),'captured test inputs');
console.log(JSON.stringify({status:'prepared',run,sourceFiles:captured.size,actualAssets:actual.length,module}));
