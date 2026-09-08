import {readFile,writeFile,readdir,mkdir,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const repo=await realpath(process.env.PROJECT_ROOT??'.'),run=await realpath(process.env.PROJECT_REVIEW_RUN??''),source=await realpath(process.env.ARCH_RUNTIME_TEST_SOURCE??repo);
const inside=(p,r)=>p===r||p.startsWith(r+path.sep);
if(!inside(run,repo)||run===repo||!inside(source,repo))throw Error('Explicit own in-repo run/source required');
const name=process.env.ARCH_RUNTIME_TEST_STAGE_NAME??'runtime-bootstrap-snapshot';
if(!/^[a-zA-Z0-9_-]{1,64}$/.test(name))throw Error('Stage name');
const dest=path.join(run,'work',name),inputs=path.join(run,'inputs',name),records=[];
async function put(p,b){await mkdir(path.dirname(p),{recursive:true});try{if(!(await readFile(p)).equals(b))throw Error('Changed private capture '+p);}catch(e){if(e.code!=='ENOENT')throw e;await writeFile(p,b);}}
async function copy(from,rel,kind='source',to=dest){
 const at=path.join(from,rel),stat=await lstat(at);
 if(stat.isSymbolicLink()||!inside(await realpath(at),repo))throw Error('Source link/escape '+at);
 if(stat.isDirectory()){for(const n of (await readdir(at)).sort())if(n!=='.git'&&(kind==='dependency'||n!=='node_modules'))await copy(from,path.join(rel,n),kind,to);return;}
 if(!stat.isFile())throw Error('Non-file input');
 const b=await readFile(at);records.push({kind,path:rel.replaceAll('\\','/'),destination:path.relative(dest,path.join(to,rel)).replaceAll('\\','/'),bytes:b.length,sha256:sha(b)});
 if(kind==='source')await put(path.join(inputs,'source',rel),b);await put(path.join(to,rel),b);
}
for(const p of ['src/core','src/kernel','src/domain','src/input','src/integration','src/printing','src/viewport/arch-view.mjs'])await copy(source,p);
for(const name of ['engine-ready.node.test.mjs','observed-worker.mjs','browser-scenarios.mjs','integrity-host.mjs','integrity.worker.test.mjs','stage.mjs'])await copy(source,'tests/runtime-bootstrap/'+name);
for(const[from,to]of [['.toolchain/app-runtime/node_modules','node_modules'],['.toolchain/printing-js/node_modules','src/printing/node_modules']]){
 const p=path.join(repo,from);for(const n of (await readdir(p)).sort())await copy(p,n,'dependency',path.join(dest,to));
}
const modulePath=await realpath(process.env.ARCH_KERNEL_MODULE??'');
if(!inside(modulePath,repo)||!modulePath.endsWith('.mjs'))throw Error('Explicit in-repo completed Module pair required');
const expected={mjs:process.env.ARCH_KERNEL_MODULE_SHA256,wasm:process.env.ARCH_KERNEL_WASM_SHA256},pins=[];
for(const ext of ['mjs','wasm']){
 const b=await readFile(modulePath.replace(/\.mjs$/,'.'+ext)),digest=sha(b);
 if(!/^[a-f0-9]{64}$/.test(expected[ext]??'')||digest!==expected[ext])throw Error('Explicit completed pair pin mismatch '+ext);
 if(!b.length||b.length>(ext==='mjs'?16:64)*1024*1024)throw Error('Pair byte limit');
 await put(path.join(inputs,'module/arch-kernel.'+ext),b);pins.push({file:'arch-kernel.'+ext,bytes:b.length,sha256:digest});
}
await put(path.join(inputs,'manifest.json'),Buffer.from(JSON.stringify({version:'arch-runtime-bootstrap-capture/1',files:records,pins},null,2)+'\n'));
console.log(JSON.stringify({sourceRoot:dest,modulePath:path.join(inputs,'module/arch-kernel.mjs'),pins},null,2));
