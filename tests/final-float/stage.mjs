import{readFile,writeFile,readdir,mkdir,realpath,lstat}from'node:fs/promises';import path from'node:path';import{createHash}from'node:crypto';
const repo=await realpath(process.env.PROJECT_ROOT??'.'),run=await realpath(process.env.PROJECT_REVIEW_RUN??''),source=await realpath(process.env.ARCH_FLOAT_SOURCE_ROOT??repo);
const inside=(p,r)=>p===r||p.startsWith(r+path.sep);if(!inside(run,repo)||!inside(source,repo)||run===repo)throw Error('Own repo run/source required');
const dest=path.join(run,'work/float-test-snapshot'),inputs=path.join(run,'inputs/float-test-source'),records=[];
async function put(file,b){await mkdir(path.dirname(file),{recursive:true});try{assertSame(await readFile(file),b,file);}catch(e){if(e.code!=='ENOENT')throw e;await writeFile(file,b);}}
function assertSame(a,b,file){if(!a.equals(b))throw Error('Existing private capture changed: '+file);}
async function copyTree(root,rel,prefix='source'){
 const p=path.join(root,rel),stat=await lstat(p);if(stat.isSymbolicLink()||!inside(await realpath(p),repo))throw Error('Source path link/escape '+p);
 if(stat.isDirectory()){for(const e of await readdir(p))if(e!=='node_modules'&&e!=='.git')await copyTree(root,path.join(rel,e),prefix);return;}
 if(!stat.isFile())throw Error('Non-file input '+p);const b=await readFile(p),r=rel.replaceAll('\\','/');records.push({kind:prefix,path:r,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')});
 await put(path.join(inputs,prefix,rel),b);await put(path.join(dest,rel),b);
}
for(const p of ['src/kernel','src/core','src/domain','src/input','src/integration/source-catalog.mjs','src/viewport/arch-view.mjs','src/printing','tests/kernel','tests/product-runtime','tests/oracles','tests/final-float'])await copyTree(source,p);
// Copy existing pinned tool installations; never install or write into them.
async function deps(from,to){for(const e of await readdir(from,{withFileTypes:true})){const a=path.join(from,e.name),b=path.join(to,e.name);if(e.isSymbolicLink()||!inside(await realpath(a),repo))throw Error('Dependency link/escape');if(e.isDirectory())await deps(a,b);else if(e.isFile())await put(b,await readFile(a));}}
await deps(path.join(repo,'.toolchain/app-runtime/node_modules'),path.join(dest,'node_modules'));await deps(path.join(repo,'.toolchain/printing-js/node_modules'),path.join(dest,'src/printing/node_modules'));
await put(path.join(inputs,'manifest.json'),Buffer.from(JSON.stringify(records,null,2)+'\n'));console.log(dest);
