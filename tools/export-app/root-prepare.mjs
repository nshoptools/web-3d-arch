// Portable current-main/private-candidate capture. Every write is inside the
// caller's fresh run; no compiler, package install or shared cache write.
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const root=process.env.PROJECT_ROOT,run=process.env.PROJECT_REVIEW_RUN,source=fileURLToPath(new URL('../../',import.meta.url));
const moduleInput=process.env.ARCH_EXPORT_MODULE_INPUT,expectedMjs=process.env.ARCH_EXPORT_EXPECTED_MJS,expectedWasm=process.env.ARCH_EXPORT_EXPECTED_WASM;
if(!root||!run||!moduleInput||![expectedMjs,expectedWasm].every(x=>/^[a-f0-9]{64}$/.test(x)))throw Error('Own run and exact runtime pins required');
const prefix=p=>path.resolve(p)+path.sep,inside=(p,parent)=>path.resolve(p).startsWith(prefix(parent)),H=b=>createHash('sha256').update(b).digest('hex');
if(!inside(run,root)||!inside(source,root)&&path.resolve(source)!==path.resolve(root)||!inside(await fs.realpath(moduleInput),root))throw Error('Path escapes repo');
try{await fs.stat(path.join(run,'reports/FROZEN.json'));throw Error('Run is frozen');}catch(e){if(e.code!=='ENOENT')throw e;}
const tag=process.env.ARCH_EXPORT_CAPTURE_TAG??'initial';if(!/^[A-Za-z0-9_-]{1,48}$/.test(tag))throw Error('capture tag');
const suffix=tag==='initial'?'':'-'+tag,dest=path.join(run,'work/root-test-overlay'+suffix),rows=[];
async function put(file,b){if(!inside(file,run))throw Error('Write outside own run');await fs.mkdir(path.dirname(file),{recursive:true});
 const realParent=await fs.realpath(path.dirname(file));if(!inside(realParent,run))throw Error('Linked output outside own run');
 try{const prior=await fs.readFile(file);if(H(prior)!==H(b))throw Error('Captured input changed; use a fresh run: '+file);}catch(e){if(e.code!=='ENOENT')throw e;await fs.writeFile(file,b,{flag:'wx'});}
}
async function capture(rel){if(rows.some(r=>r.path===rel.replaceAll('\\','/')))return;const file=path.join(source,rel);if(!inside(await fs.realpath(file),root))throw Error('Linked input outside repo');const b=await fs.readFile(file);await put(path.join(dest,rel),b);rows.push({path:rel.replaceAll('\\','/'),sha256:H(b),bytes:b.length});}
async function walk(rel,filter,dependencies=false){for(const e of await fs.readdir(path.join(source,rel),{withFileTypes:true})){const p=path.join(rel,e.name);if(e.isSymbolicLink())throw Error('Linked source '+p);if(e.isDirectory()){if(dependencies||!['assets','node_modules','target'].includes(e.name))await walk(p,filter,dependencies);}else if(filter(p))await capture(p);}}
await walk('src',p=>/\.(mjs|js|ts|mts|json)$/.test(p));
await walk('src/printing/node_modules',()=>true,true);
for(const dir of ['tests/app','tests/integration','tests/export-root-integration','tests/final-scene','tests/product-runtime','tests/fixtures/slicer-profiles/v1'])await walk(dir,p=>/\.(mjs|js|mts|json|md)$/.test(p));
await capture('src/printing/tests/profile-fixtures.mjs');await walk('tools/export-app',()=>true);
let existing=null;try{existing=JSON.parse(await fs.readFile(path.join(run,'inputs/production-pair.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const pins={},moduleDirectory=existing?.moduleDirectory??'work/root-integration-module';for(const [name,expected]of Object.entries({'arch-kernel.mjs':expectedMjs,'arch-kernel.wasm':expectedWasm})){
 const file=name.endsWith('.mjs')?moduleInput:moduleInput.replace(/\.mjs$/,'.wasm'),b=await fs.readFile(file);if(H(b)!==expected)throw Error('Runtime SHA mismatch '+name);
 if(existing&&(existing.pins?.[name]?.sha256!==H(b)||existing.pins?.[name]?.bytes!==b.length))throw Error('Run has a different pinned pair; use a fresh run');
 await put(path.join(run,moduleDirectory,name),b);pins[name]={source:path.relative(root,file).replaceAll('\\','/'),sha256:H(b),bytes:b.length};
}
const module=pins['arch-kernel.mjs'],wasm=pins['arch-kernel.wasm'];
await put(path.join(run,'inputs/root-integration-source-preimages'+suffix+'.json'),JSON.stringify({source:path.relative(root,source).replaceAll('\\','/'),files:rows.sort((a,b)=>a.path.localeCompare(b.path))},null,2)+'\n');
if(!existing)await put(path.join(run,'inputs/production-pair.json'),JSON.stringify({moduleDirectory,pins},null,2)+'\n');
await put(path.join(run,'inputs/runtime-integrity.json'),JSON.stringify({version:'arch-engine-integrity/1',module:{url:'/runtime/arch-kernel-'+module.sha256.slice(0,16)+'.mjs',sha256:module.sha256,bytes:module.bytes},wasm:{url:'/runtime/arch-kernel-'+wasm.sha256.slice(0,16)+'.wasm',sha256:wasm.sha256,bytes:wasm.bytes}},null,2)+'\n');
console.log(JSON.stringify({overlay:dest,inputs:rows.length,pins}));
