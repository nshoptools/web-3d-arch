import {resolve,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {MIME,assetPath,MAX_MANIFEST_ASSETS,MAX_MANIFEST_BYTES} from '../../src/host/manifest.mjs';
import {RUNTIME_FILES} from './runtime-files.mjs';
import {createSourceTransport,materializeReleaseSourceLibrary,CONFIG_BYTES} from './source-transport.mjs';
import {need,exact,hash,sha,count,sorted,canonical,jsonBytes,pinned,parse,readPlain,plainPath,inside,portable,environment,LIMITS} from './core.mjs';
export const TOOL_FILES=Object.freeze(['core.mjs','runtime-files.mjs','syntax.mjs','source-transport.mjs','plan.mjs','build.mjs',
 'verify.mjs','config.mjs','operator.mjs','cli.mjs','run.ps1','vendor/source-library.mjs']);
export const DOC_FILES=Object.freeze(['README.md','API.md','RUNBOOK.md','PROVENANCE.md','operator.example.json']);
const codeRoot=fileURLToPath(new URL('../../',import.meta.url));
const ref=(file,bytes)=>({file,bytes:bytes.length,sha256:hash(bytes)});
function localRoot(raw){const root=plainPath(raw);need(inside(environment().root,root),'INPUT_OUTSIDE_REPOSITORY');return root;}
export function pinRuntime(root){
 root=localRoot(root);
 return {version:'arch-release-runtime-lock/1',node:'24.19.0',databaseSchema:5,files:RUNTIME_FILES.map(file=>{
  const bytes=readPlain(resolve(root,file),LIMITS.assetBytes);return ref(file,bytes);
 })};
}
export async function planRelease(inputPath){
 environment();
 need(inside(environment().root,plainPath(inputPath)),'INPUT_OUTSIDE_REPOSITORY');
 const inputBytes=readPlain(plainPath(inputPath),LIMITS.inputBytes),input=parse(inputBytes);
 exact(input,['version','frontendRoot','frontend','engine','library','runtimeRoot','runtimeLock','licenses']);
 need(input.version==='arch-release-input/1','INPUT_VERSION');
 const frontendRoot=localRoot(input.frontendRoot),runtimeRoot=localRoot(input.runtimeRoot),libraryRoot=localRoot(input.library?.root);
 const f=input.frontend;exact(f,['entry','document','assets','navigations','references']);
 need(Array.isArray(f.assets)&&f.assets.length>=3&&f.assets.length<=4096,'FRONTEND_FILES_LIMIT');
 need(Array.isArray(f.references)&&f.references.length<=16384,'FRONTEND_REFERENCES_LIMIT');
 const publicEntries=new Map(),all=new Map(),licenses=new Set(),publicFiles=new Set();let publicBytes=0,packageBytes=0;
 function addFile(path,b,source=null){
  portable(path);need(!all.has(path.toLowerCase()),'PACKAGE_DUPLICATE');
  packageBytes+=b.length;need(packageBytes<=LIMITS.packageBytes,'PACKAGE_BYTES_LIMIT');
  const r={path,sha256:hash(b),bytes:b.length,source,generated:source?null:b};all.set(path.toLowerCase(),r);return r;
 }
 function addPublic(url,b,cache='immutable',source=null,licenseIds=[]){
  assetPath(url);need(MIME[extname(url)],'MIME_REJECTED');
  need(!publicEntries.has(url.toLowerCase()),'MANIFEST_DUPLICATE');
  need(['immutable','revalidate'].includes(cache),'CACHE_POLICY_INVALID');
  if(cache==='immutable')need(extname(url)!=='.html'&&url.split('/').at(-1).includes(hash(b).slice(0,16)),'IMMUTABLE_HASH_REQUIRED');
  count(b.length,LIMITS.assetBytes);publicBytes+=b.length;need(publicBytes<=LIMITS.publicBytes,'PUBLIC_BYTES_LIMIT');
  need(publicEntries.size<MAX_MANIFEST_ASSETS,'MANIFEST_ASSETS_LIMIT');
  if(['.mjs','.js','.css','.html'].includes(extname(url)))need(!/(?:sourceMappingURL|sourceURL)\s*=/.test(b.toString('utf8')),'SOURCEMAP_REFERENCE_REJECTED');
  const path='public'+url,r=addFile(path,b,source);
  const e={url,file:url.slice(1),sha256:r.sha256,bytes:r.bytes,mime:MIME[extname(url)],cache};
  publicEntries.set(url.toLowerCase(),e);publicFiles.add(path);return {url,sha256:r.sha256,bytes:r.bytes,...(licenseIds.length?{licenseIds}: {})};
 }
 need(Array.isArray(input.licenses)&&input.licenses.length>0&&input.licenses.length<=256,'LICENSES_REQUIRED');
 const notices=[];
 for(const l of input.licenses){
  exact(l,['id','spdx','source','revision','file','sha256','bytes']);
  need(/^[A-Za-z0-9_-]{1,80}$/.test(l.id)&&!licenses.has(l.id),'LICENSE_ID');
  for(const k of ['spdx','source','revision'])need(typeof l[k]==='string'&&l[k].length>0&&l[k].length<=2048,'LICENSE_PROVENANCE');
  // A key file is never inspected to try to decide whether it is a license.
  need(/(?:LICENSE|NOTICE|OFL)(?:[._-][A-Za-z0-9_-]+)?(?:\.txt)?$|\.LICENSE$/i.test(l.file.split(/[\\/]/).at(-1)),'LICENSE_FILE_NAME');
  need(inside(environment().root,plainPath(l.file)),'INPUT_OUTSIDE_REPOSITORY');
  const p=pinned(null,{file:l.file,sha256:l.sha256,bytes:l.bytes},1024*1024);
  const file='licenses/'+l.id+'/'+l.sha256+'.txt';addFile(file,p.bytes,p.path);licenses.add(l.id);
  notices.push({id:l.id,spdx:l.spdx,source:l.source,revision:l.revision,file,sha256:l.sha256,bytes:l.bytes});
 }
 const frontPins=[],scripts=[],textByUrl=new Map();
 for(const a of f.assets){
  exact(a,['file','url','sha256','bytes','cache','licenseIds']);assetPath('/'+a.file);assetPath(a.url);
  need(extname(a.file)===extname(a.url),'MIME_REJECTED');
  need(!/(?:^|[\/._-])(?:test|tests|fixture|fixtures|profile|profiles|provider|providers|auth|server|user\.keys)(?:[\/._-]|$)/i.test(a.file+' '+a.url),'PRIVATE_BUILD_INPUT');
  need(Array.isArray(a.licenseIds)&&a.licenseIds.length>0&&a.licenseIds.every(id=>licenses.has(id)),'LICENSE_REFERENCE');
  const p=pinned(frontendRoot,{file:a.file,sha256:a.sha256,bytes:a.bytes});
  frontPins.push(addPublic(a.url,p.bytes,a.cache,p.path,a.licenseIds));
  if(['.js','.mjs','.html','.css'].includes(extname(a.url)))textByUrl.set(a.url,p.bytes.toString('utf8'));
  if(['.js','.mjs'].includes(extname(a.url)))scripts.push({url:a.url,text:p.bytes.toString('utf8')});
 }
 function entry(url){assetPath(url);const e=publicEntries.get(url.toLowerCase());need(e?.url===url,'PUBLIC_REFERENCE');return e;}
 need(['.js','.mjs'].includes(extname(entry(f.entry).url))&&extname(entry(f.document).url)==='.html','ENTRY_REQUIRED');
 need(f.navigations&&f.navigations['/']===f.document,'ROOT_NAVIGATION_REQUIRED');
 // Approved compiled HTML only. This is a compatibility check, not an untrusted HTML sanitizer.
 const html=textByUrl.get(f.document);
 need(html.includes(f.entry)&&!/\bon[a-z]+\s*=|\bstyle\s*=|<base\b|<iframe\b|<object\b/i.test(html),'COMPILED_HTML_POLICY');
 for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi))need(/\bsrc\s*=/.test(m[1])&&!m[2].trim(),'INLINE_SCRIPT_REJECTED');
 const eng=input.engine;exact(eng,['moduleUrl','wasmUrl','binaryRequest','abi','semantics','source']);
 const moduleEntry=entry(eng.moduleUrl),wasmEntry=entry(eng.wasmUrl);
 need(['.js','.mjs'].includes(extname(moduleEntry.url))&&extname(wasmEntry.url)==='.wasm','MODULE_PAIR_REQUIRED');
 need([...publicEntries.values()].filter(e=>e.mime==='application/wasm').length===1,'UNIFIED_WASM_REQUIRED');
 for(const k of ['abi','semantics','source'])need(Number.isSafeInteger(eng[k])&&eng[k]>0&&eng[k]<=1000,'ENGINE_VERSION_REQUIRED');
 portable(eng.binaryRequest);
 const wasmURL=new URL(eng.binaryRequest,'https://release.invalid'+eng.moduleUrl);
 need(wasmURL.pathname===eng.wasmUrl&&!wasmURL.search&&!wasmURL.hash,'MODULE_BINARY_REFERENCE');
 need(textByUrl.get(eng.moduleUrl).includes(JSON.stringify(eng.binaryRequest))||
  textByUrl.get(eng.moduleUrl).includes("'"+eng.binaryRequest+"'"),'MODULE_BINARY_REFERENCE');
 const wasmBytes=readPlain(all.get(('public'+eng.wasmUrl).toLowerCase()).source,LIMITS.assetBytes);
 need(WebAssembly.validate(wasmBytes),'WASM_INVALID');
 const wm=new WebAssembly.Module(wasmBytes);
 const engine={...eng,module:moduleEntry,wasm:wasmEntry,
  wasmImports:WebAssembly.Module.imports(wm),wasmExports:WebAssembly.Module.exports(wm)};
 // Frozen source-library validator consumes original documents, never rewritten URLs.
 const l=input.library;exact(l,['root','catalog','deployment','artwork','receipt','ready']);
 const configs={};
 for(const [name,file]of Object.entries({catalog:'catalog',deployment:'deployment',artwork:'artwork',receipt:'build-receipt',ready:'ready'})){
  need(l[name]?.file==='source-library/'+file+'.json','LIBRARY_CONFIG_PATH');
  configs[name]=pinned(libraryRoot,l[name],CONFIG_BYTES);
 }
 const catalogBytes=configs.catalog.bytes,deploymentBytes=configs.deployment.bytes;
 const catalog=parse(catalogBytes),deployment=parse(deploymentBytes),ready=parse(configs.ready.bytes);
 need(ready.version==='arch-source-deployment-ready/1'&&Array.isArray(ready.files)&&ready.files.length===deployment.records.length+4,'LIBRARY_READY');
 const transport=await createSourceTransport({catalogBytes,deploymentBytes}),transportBytes=jsonBytes(transport);
 // Independently exercise the same browser rebind path against original bytes.
 await materializeReleaseSourceLibrary({catalogBytes,deploymentBytes,transportBytes,origin:'https://release.invalid'});
 const readyFiles=new Map();
 for(const r of ready.files){exact(r,['url','bytes','sha256']);portable(r.url);need(!readyFiles.has(r.url),'LIBRARY_READY_DUPLICATE');readyFiles.set(r.url,r);}
 const readyMatch=(url,sha256,bytes)=>{const r=readyFiles.get(url);need(r?.sha256===sha256&&r.bytes===bytes,'LIBRARY_READY_INTEGRITY');};
 const wireByHash=new Map(transport.records.map(r=>[r.sha256,r]));
 for(const r of deployment.records){
  readyMatch(r.url,r.sha256,r.bytes);
  const p=pinned(libraryRoot,{file:r.url,sha256:r.sha256,bytes:r.bytes},16_000_000),w=wireByHash.get(r.sha256);
  const a=addPublic('/'+w.url,p.bytes,'immutable',p.path);
  need(publicEntries.get(a.url.toLowerCase()).mime===w.wireMime,'WIRE_MIME_MISMATCH');
 }
 const library={version:'arch-release-library/1',originalResources:deployment.records.length,totalUniqueBytes:deployment.totalUniqueBytes,previews:catalog.previews.length,documents:{}};
 for(const name of ['catalog','deployment','artwork','receipt']){
  const b=configs[name].bytes,r=l[name];readyMatch(r.file,r.sha256,r.bytes);
  library.documents[name]=addPublic('/source-library/'+name+'.'+hash(b)+'.json',b,'immutable',configs[name].path);
 }
 library.documents.transport=addPublic('/source-library/transport.'+hash(transportBytes)+'.json',transportBytes);
 library.readySha256=hash(configs.ready.bytes);
 addFile('provenance/library-ready.json',configs.ready.bytes,configs.ready.path);
 // This public descriptor contains only paths and hashes for public bytes, no runtime config.
 const bindings={version:'arch-release-bindings/1',entry:f.entry,engine:{...eng,module:{url:moduleEntry.url,sha256:moduleEntry.sha256,bytes:moduleEntry.bytes},
  wasm:{url:wasmEntry.url,sha256:wasmEntry.sha256,bytes:wasmEntry.bytes}},library:library.documents};
 const bindingBytes=jsonBytes(bindings);addPublic('/release-bindings.json',bindingBytes,'revalidate');
 // Explicit dynamic references and parser-derived static imports must name declared public assets.
 for(const r of f.references){exact(r,['from','to']);entry(r.from);entry(r.to);}
 const syntax=spawnSync(process.execPath,['--experimental-vm-modules','--max-old-space-size=256',fileURLToPath(new URL('./syntax.mjs',import.meta.url))],{
  input:JSON.stringify(scripts),encoding:'utf8',maxBuffer:4*1024*1024,timeout:15000,windowsHide:true,
  env:{...process.env,NODE_OPTIONS:'',NODE_PATH:''}});
 need(syntax.status===0,'COMPILED_MODULE_INVALID');
 for(const m of JSON.parse(syntax.stdout))for(const spec of m.imports){
  need(spec.startsWith('./')||spec.startsWith('../')||spec.startsWith('/')&&!spec.startsWith('//'),'BARE_MODULE_UNSUPPORTED');
  const u=new URL(spec,'https://release.invalid'+m.url);
  need(u.origin==='https://release.invalid'&&!u.search&&!u.hash,'MODULE_IMPORT_URL');entry(u.pathname);
 }
 const runtimePinned=pinned(null,input.runtimeLock,LIMITS.inputBytes),lock=parse(runtimePinned.bytes);
 exact(lock,['version','node','databaseSchema','files']);
 need(lock.version==='arch-release-runtime-lock/1'&&lock.node==='24.19.0'&&lock.databaseSchema===5,'RUNTIME_LOCK_VERSION');
 need(canonical(lock.files.map(r=>r.file).sort())===canonical([...RUNTIME_FILES].sort()),'RUNTIME_LOCK_FILES');
 for(const r of lock.files){const p=pinned(runtimeRoot,r);addFile(r.file,p.bytes,p.path);}
 addFile('provenance/runtime-lock.json',runtimePinned.bytes,runtimePinned.path);
 // Tools/docs are an explicit build recipe, never recursively copied from a runtime directory.
 for(const path of [...TOOL_FILES.map(f=>'tools/release/'+f),...DOC_FILES.map(f=>'docs/release/'+f)]){
  const source=resolve(codeRoot,path),b=readPlain(source,LIMITS.assetBytes);addFile(path,b,source);
 }
 const assets=sorted([...publicEntries.values()],r=>r.url),navigations=JSON.parse(canonical(f.navigations));
 const buildId='release-'+hash(jsonBytes({assets,navigations})).slice(0,32);
 const publicManifest={schemaVersion:1,buildId,assets,navigations},publicManifestBytes=jsonBytes(publicManifest);
 need(publicManifestBytes.length<=MAX_MANIFEST_BYTES,'MANIFEST_BYTES_LIMIT');
 addFile('public-manifest.json',publicManifestBytes);
 const manifest={version:'arch-release-package/1',node:'24.19.0',databaseSchema:5,applicationQualification:'parent-required',
  inputSha256:hash(inputBytes),buildId,publicManifestSha256:hash(publicManifestBytes),publicBytes,engine,library,bindings,
  frontend:frontPins,licenses:sorted(notices,r=>r.id),runtimeLockSha256:hash(runtimePinned.bytes),
  files:sorted([...all.values()].map(({path,sha256,bytes})=>({path,sha256,bytes})),r=>r.path)};
 return {manifest,manifestBytes:jsonBytes(manifest),files:sorted([...all.values()],r=>r.path),publicManifest};
}
