// Copy/pin an authorized composed source tree and build one test entry around
// the actual product factory. This is not a production release assembler.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir,lstat,realpath} from 'node:fs/promises';
import {resolve,join,dirname,relative,isAbsolute,extname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
export const hash=b=>createHash('sha256').update(b).digest('hex');
export const put=async(p,b)=>{await mkdir(dirname(p),{recursive:true});await writeFile(p,b,{flag:'wx'});};
export const json=v=>JSON.stringify(v,null,2)+'\n';
async function plain(root,file){
 root=resolve(root);file=resolve(file);const r=relative(root,file);
 assert.ok(r&&!r.startsWith('..')&&!isAbsolute(r),'path stays inside declared root');
 let at=root;for(const part of r.split(/[\\/]/)){at=join(at,part);const st=await lstat(at);assert.equal(st.isSymbolicLink(),false);}
 assert.equal((await realpath(file)).toLowerCase(),file.toLowerCase());return file;
}
async function walk(root){
 const rows=[];async function visit(dir){for(const e of await readdir(dir,{withFileTypes:true})){
  assert.equal(e.isSymbolicLink(),false);const p=join(dir,e.name);
  if(e.isDirectory())await visit(p);else{assert.ok(e.isFile());rows.push(p);}
 }}await visit(root);return rows.sort();
}
async function checked(pin,root){
 await plain(root,pin.file);const st=await lstat(pin.file);assert.equal(st.nlink,1);
 const b=await readFile(pin.file);assert.equal(b.length,pin.bytes);assert.equal(hash(b),pin.sha256);return b;
}
const SOURCE_DIRS=['src/app','src/contracts','src/core','src/domain','src/editing','src/host','src/input','src/integration','src/kernel','src/mesh-import/src','src/printing/src','src/server','src/storage','src/ui','src/viewport','tools/release'];
export async function stage(inputPath,label){
 const root=process.env.PROJECT_ROOT,run=process.env.PROJECT_REVIEW_RUN;
 assert.ok(root&&run);await plain(root,run);await plain(root,inputPath);
 assert.match(label,/^[a-z0-9-]{1,32}$/);
 const inputBytes=await readFile(inputPath),input=JSON.parse(inputBytes);
 assert.equal(input.version,'arch-csg-controller-ready/1');
 assert.equal(input.authorization,'parent-composition-ready');
 assert.equal(typeof input.testFixtures,'boolean');assert.equal(typeof input.printing,'boolean');
 assert.equal(input.scope,'actual-controller-test-only');
 await plain(root,input.sourceRoot);await plain(root,input.libraryReleaseRoot);
 const out=join(run,'work',label),source=join(out,'source'),webroot=join(out,'public');
 await mkdir(out);await mkdir(source);await mkdir(webroot);
 await put(join(out,'input.json'),inputBytes);
 const sourcePins=[];
 for(const folder of SOURCE_DIRS){
  for(const p of await walk(join(input.sourceRoot,folder))){
   if(!/\.(mjs|cjs|js|json|ts|tsx|jsx|css|sql|svg|png|woff2?)$/.test(p))continue;
   if(/[\\/](tests?|fixtures?|node_modules|target)[\\/]/i.test(relative(input.sourceRoot,p)))continue;
   const r=relative(input.sourceRoot,p).replaceAll('\\','/'),b=await readFile(p);
   assert.ok(b.length<=64*1024*1024);await put(join(source,r),b);
   sourcePins.push({source:p,file:r,sha256:hash(b),bytes:b.length});
  }
 }
 for(const name of ['package.json','tsconfig.json']){
  const b=await readFile(join(input.sourceRoot,name));await put(join(source,name),b);
  sourcePins.push({source:join(input.sourceRoot,name),file:name,sha256:hash(b),bytes:b.length});
 }
 const codeRoot=fileURLToPath(new URL('./',import.meta.url)),harnessPins=[];
 for(const p of await walk(codeRoot)){
  const r=relative(codeRoot,p).replaceAll('\\','/'),b=await readFile(p);
  await put(join(source,'tests/csg-controller',r),b);harnessPins.push({file:r,sha256:hash(b),bytes:b.length});
 }
 await put(join(out,'source-pins.json'),json(sourcePins));await put(join(out,'harness-pins.json'),json(harnessPins));
 const original=await checked(input.engine.module,root),wasm=await checked(input.engine.wasm,root);
 assert.ok(WebAssembly.validate(wasm));
 const exported=new Set(WebAssembly.Module.exports(new WebAssembly.Module(wasm)).map(e=>e.name));
 assert.equal(exported.has('arch_test_fixture'),input.testFixtures,'module test-fixture flag must match actual exports');
 assert.equal(exported.has('arch3mf_abi_version'),input.printing,'module printing flag must match actual exports');
 const copyBuildTools=async()=>{
  // engine.mjs is a build tool, not application code. Copy its exact small
  // dependency set from the same authorized source tree; never run live main.
  for(const n of ['engine.mjs','core.mjs']){
   const p=join(input.sourceRoot,'tools/application',n),b=await readFile(p);
   await put(join(source,'tools/application',n),b);sourcePins.push({source:p,file:'tools/application/'+n,sha256:hash(b),bytes:b.length});
  }
  return import(pathToFileURL(join(source,'tools/application/engine.mjs')).href);
 };
 const {deriveWrapper}=await copyBuildTools();
 const derived=deriveWrapper(original,wasm),engine=derived.receipt;
 await put(join(out,'canonical/arch-kernel.mjs'),original);await put(join(out,'canonical/arch-kernel.wasm'),wasm);
 await put(join(webroot,engine.moduleName),derived.bytes);await put(join(webroot,engine.wasmName),wasm);
 await put(join(out,'engine-derivation.json'),json(engine));
 const releaseBytes=await readFile(join(input.libraryReleaseRoot,'release-manifest.json'));
 assert.equal(hash(releaseBytes),input.libraryReleaseSHA256);
 const release=JSON.parse(releaseBytes),releaseRows=new Map(release.files.map(p=>[p.path,p]));
 async function libraryFile(name){
  const pin=releaseRows.get('public/'+name);assert.ok(pin,'whitelisted library file '+name);
  return checked({file:join(input.libraryReleaseRoot,'public',name),bytes:pin.bytes,sha256:pin.sha256},input.libraryReleaseRoot);
 }
 const bindings=JSON.parse(await libraryFile('release-bindings.json'));
 const transport=JSON.parse(await libraryFile(bindings.library.transport.url.slice(1)));
 // The whole pinned asset pack is copied read-only; only the new private
 // webroot is served. No old application or old engine enters this build.
 const names=[...new Set([...Object.values(bindings.library).map(r=>r.url.slice(1)),...transport.records.map(r=>r.url)])];
 const libraryPins=[];let done=0,index=0;
 await Promise.all(Array.from({length:12},async()=>{while(index<names.length){
  const name=names[index++];assert.ok(!name.startsWith('/')&&!name.includes('..')&&!name.includes('\\'));
  const b=await libraryFile(name);await put(join(webroot,name),b);
  libraryPins.push({file:name,sha256:hash(b),bytes:b.length});done++;
  if(done%5000===0)console.log(JSON.stringify({stage:'library',copied:done,total:names.length}));
 }}));
 const app=join(root,'.toolchain/app-runtime/node_modules'),printing=join(root,'.toolchain/printing-js/node_modules');
 const {build}=await import(pathToFileURL(join(app,'vite/dist/node/index.js')).href);
 const aliases=[
  {find:/^three\/addons\//,replacement:join(app,'three/examples/jsm/').replaceAll('\\','/')+'/'},
  ...['react-dom','react','scheduler'].map(n=>({find:new RegExp('^'+n+'(?=/|$)'),replacement:join(app,n).replaceAll('\\','/')})),
  {find:/^three$/,replacement:join(app,'three/build/three.module.js').replaceAll('\\','/')},
  {find:/^fflate$/,replacement:join(printing,'fflate/esm/browser.js').replaceAll('\\','/')},
  {find:/^@xmldom\/xmldom$/,replacement:join(printing,'@xmldom/xmldom/lib/index.js').replaceAll('\\','/')}
 ];
 const loaded=new Map(),audit=()=>({name:'csg-owned-input-audit',enforce:'pre',
  async load(id){const p=id.split('?')[0];if(!isAbsolute(p))return;
   const owned=[source,app,printing].some(base=>{const r=relative(base,p);return r&&!r.startsWith('..')&&!isAbsolute(r);});
   assert.ok(owned,'compiler load outside owned source/read-only deps: '+p);
   try{const b=await readFile(p);loaded.set(p,{file:p,sha256:hash(b),bytes:b.length});}catch(e){if(e.code!=='EISDIR')throw e;}
  }
 });
 await build({root:source,configFile:false,envDir:false,publicDir:false,cacheDir:join(run,'cache',label),mode:'production',resolve:{alias:aliases},plugins:[audit()],
  build:{target:'es2022',outDir:webroot,emptyOutDir:false,sourcemap:false,minify:false,assetsInlineLimit:0,copyPublicDir:false,
   rolldownOptions:{input:join(source,'tests/csg-controller/entry.mjs'),output:{entryFileNames:'assets/csg-acceptance.mjs'}}},
  worker:{format:'es',plugins:()=>[audit()]},logLevel:'warn'});
 const styles=(await readdir(join(webroot,'assets'))).filter(n=>n.endsWith('.css'));
 await put(join(webroot,'index.html'),'<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CSG controller — local test identity</title>'+styles.map(n=>'<link rel="stylesheet" href="/assets/'+n+'">').join('')+'<body><div id="app"></div><script type="module" src="/assets/csg-acceptance.mjs"></script></body></html>');
 const entry='/assets/csg-acceptance.mjs',newBindings={...bindings,entry,engine:{abi:2,semantics:3,source:2,binaryRequest:engine.wasmName,
  moduleUrl:'/'+engine.moduleName,wasmUrl:'/'+engine.wasmName,module:{url:'/'+engine.moduleName,sha256:engine.moduleSHA256,bytes:engine.moduleBytes},
  wasm:{url:'/'+engine.wasmName,sha256:engine.wasmSHA256,bytes:engine.wasmBytes}}};
 await put(join(webroot,'release-bindings.json'),json(newBindings));
 const {MIME}=await import(pathToFileURL(join(source,'src/host/manifest.mjs')).href),assets=[];
 for(const p of await walk(webroot)){
  const b=await readFile(p),file=relative(webroot,p).replaceAll('\\','/');
  assets.push({url:'/'+file,file,bytes:b.length,sha256:hash(b),mime:MIME[extname(p)]??'application/octet-stream',cache:'revalidate'});
 }
 const manifestPath=join(out,'public-manifest.json'),manifestBytes=Buffer.from(json({schemaVersion:1,buildId:'csg-controller-'+label,assets,navigations:{'/':'/index.html'}}));
 await put(manifestPath,manifestBytes);
 for(const p of sourcePins)assert.equal(hash(await readFile(p.source)),p.sha256,'authorized source changed while capturing/building: '+p.file);
 // Updated table includes the two build-helper files used above.
 await put(join(out,'source-complete-pins.json'),json(sourcePins));
 await put(join(out,'compiler-inputs.json'),json([...loaded.values()]));
 await put(join(out,'library-pins.json'),json(libraryPins));
 const ready={version:'arch-csg-controller-stage/1',scope:input.scope,authorization:input.authorization,source,webroot,manifestPath,
  inputSHA256:hash(inputBytes),sourceSHA256:hash(Buffer.from(json(sourcePins))),manifestSHA256:hash(manifestBytes),engine,
  testFixtures:input.testFixtures,printing:input.printing,libraryReleaseSHA256:input.libraryReleaseSHA256,libraryFiles:libraryPins.length,harnessPins};
 await put(join(out,'stage.json'),json(ready));return ready;
}

