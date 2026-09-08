import{readFile,writeFile,readdir,mkdir,realpath,lstat}from'node:fs/promises';import path from'node:path';import{createHash}from'node:crypto';
const repo=await realpath(process.env.PROJECT_ROOT??'.'),run=await realpath(process.env.PROJECT_REVIEW_RUN??''),source=await realpath(process.env.ARCH_SOURCE_TEST_ROOT??repo);
const inside=(p,r)=>p===r||p.startsWith(r+path.sep);if(!inside(run,repo)||run===repo||!inside(source,repo))throw Error('Own run and source must be inside repo');
const dest=path.join(run,'work/native-source-test-snapshot'),inputs=path.join(run,'inputs/native-source-tests'),records=[];
async function put(p,b){await mkdir(path.dirname(p),{recursive:true});try{if(!(await readFile(p)).equals(b))throw Error('Private capture changed: '+p);}catch(e){if(e.code!=='ENOENT')throw e;await writeFile(p,b);}}
async function copyTree(from,rel,prefix='source',to=dest){
 const p=path.join(from,rel),s=await lstat(p);if(s.isSymbolicLink()||!inside(await realpath(p),repo))throw Error('Source path link/escape '+p);
 if(s.isDirectory()){for(const n of await readdir(p))if(!['.git','node_modules'].includes(n))await copyTree(from,path.join(rel,n),prefix,to);return;}
 if(!s.isFile())throw Error('Nonfile input');const b=await readFile(p),r=rel.replaceAll('\\','/');
 records.push({kind:prefix,path:r,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')});
 if(prefix==='source')await put(path.join(inputs,rel),b);await put(path.join(to,rel),b);
}
for(const p of ['src/kernel','src/core','src/domain','src/input','src/integration','src/printing','src/viewport/arch-view.mjs','tests/native-source','tests/kernel','tests/product-runtime','tests/oracles','tests/fixtures/corpus-v1'])await copyTree(source,p);
for(const[from,to]of [['.toolchain/app-runtime/node_modules','node_modules'],['.toolchain/printing-js/node_modules','src/printing/node_modules']]){
 const folder=path.join(repo,from);for(const name of await readdir(folder))await copyTree(folder,name,'dependency',path.join(dest,to));
}
await put(path.join(inputs,'manifest.json'),Buffer.from(JSON.stringify(records,null,2)+'\n'));console.log(dest);

