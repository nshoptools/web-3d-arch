import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {existsSync,readFileSync,writeFileSync,symlinkSync,mkdirSync} from 'node:fs';
import {deriveWrapper} from '../../tools/application/engine.mjs';
import {inspectFrontend} from '../../tools/application/frontend.mjs';
import {environment,outputPath,pin,checked,table,assertTable,walk,sourceName} from '../../tools/application/core.mjs';
import {validateInput} from '../../tools/application/snapshot.mjs';
import {directory,write,wasm,wrapper,digest,frontendFixture} from './helpers.mjs';
const code=c=>e=>e.code===c;
test('two exact quoted wrapper replacements preserve every unrelated byte and original pair',()=>{
 const original=Buffer.from(wrapper),w=Uint8Array.from(wasm),a=deriveWrapper(original,w),b=deriveWrapper(original,w);
 assert.deepEqual(a,b);assert.deepEqual(original,wrapper);assert.deepEqual(w,wasm);
 assert.equal(a.receipt.replacementCount,2);assert.equal(a.receipt.wasmSHA256,digest(w));assert.equal(a.receipt.moduleSHA256,digest(a.bytes));
 assert.equal(a.bytes.toString().replaceAll(a.receipt.wasmName,'arch-kernel.wasm'),wrapper.toString());
 assert.deepEqual(a.receipt.occurrences.map(r=>r.quote),['"',"'"]);
 assert.equal(a.receipt.moduleName,'arch-kernel.'+digest(a.bytes)+'.mjs');
});
for(const [name,bytes,expected]of [
 ['one literal',Buffer.from('export const wasm="arch-kernel.wasm";'),'ENGINE_LITERAL_COUNT'],
 ['three literals',Buffer.concat([wrapper,Buffer.from('"arch-kernel.wasm";')]),'ENGINE_LITERAL_COUNT'],
 ['unquoted extra mention',Buffer.concat([wrapper,Buffer.from('//arch-kernel.wasm')]),'ENGINE_UNEXPECTED_REFERENCE'],
 ['already addressed',Buffer.from(wrapper.toString().replaceAll('arch-kernel.wasm','arch-kernel.'+'a'.repeat(64)+'.wasm')),'ENGINE_LITERAL_COUNT']
])test('wrapper refuses '+name,()=>assert.throws(()=>deriveWrapper(bytes,wasm),code(expected)));
test('invalid UTF8 wrapper is refused',()=>assert.throws(()=>deriveWrapper(Buffer.concat([wrapper,Buffer.from([255])]),wasm)));
test('a different WASM changes both complete content addresses',()=>{
 const a=deriveWrapper(wrapper,wasm),b=deriveWrapper(wrapper,Uint8Array.from([...wasm,0,1,0]));
 assert.notEqual(a.receipt.wasmName,b.receipt.wasmName);assert.notEqual(a.receipt.moduleName,b.receipt.moduleName);
});
test('output outside own run, repository root, and other rooms is refused before creation',()=>{
 for(const p of [resolve(environment().root,'new-build-unowned'),resolve(environment().root,'tmp/reviews/opus/runs/unauthorized/work/new-build'),resolve(environment().root,'..','application-build-unowned')]){
  const before=existsSync(p);assert.throws(()=>outputPath(p),code('OUTPUT_OUTSIDE_RUN'));assert.equal(existsSync(p),before);
 }
});
test('junction to even another owned directory is rejected',()=>{
 const d=directory('link'),target=directory('target'),link=resolve(d,'linked');symlinkSync(target,link,'junction');
 assert.throws(()=>outputPath(resolve(link,'result')),code('SYMLINK_REJECTED'));
});
test('actual byte pin catches same-size tampering and restored exact bytes pass',()=>{
 const d=directory('pin'),p=write(d,'source.mjs','export const value=1;\n'),r=pin(p);
 writeFileSync(p,'export const value=2;\n');assert.throws(()=>checked(r),code('INPUT_INTEGRITY'));
 writeFileSync(p,'export const value=1;\n');assert.equal(digest(checked(r)),r.sha256);
});
test('snapshot verifies all source bytes and detects removal',()=>{
 const d=directory('snapshot'),a=write(d,'a.mjs','ab'),b=write(d,'b.mjs','cd'),rows=table([a,b]);assertTable(rows);
 writeFileSync(b,'ce');assert.throws(()=>assertTable(rows),code('INPUT_CHANGED'));
});
test('resource admission rejects count and cumulative bytes without compiler',()=>{
 const d=directory('limits');write(d,'a.mjs','ab');write(d,'b.mjs','cd');
 assert.throws(()=>walk(d,{maxFiles:1}),code('FILE_COUNT_LIMIT'));assert.throws(()=>table(walk(d),{maxBytes:3}),code('INPUT_TOTAL_BYTES'));
});
test('source discovery omits tests, fixtures, node_modules and secrets by path',()=>{
 for(const p of ['tests/a.mjs','fixtures/a.tsx','node_modules/a.js','credentials.json','user.keys','docs/a.md'])assert.equal(sourceName(p),false,p);
 assert.equal(sourceName('stage/View3D.tsx'),true);
});
test('required ABI/semantics/source mismatch rejects before reading module, library or licenses',()=>{
 const root=environment().root;
 assert.throws(()=>validateInput({version:'arch-application-input/1',sourceRoot:root,appToolchainRoot:root,printingToolchainRoot:root,engine:{module:{},wasm:{},abi:1,semantics:3,source:2,buildReceipt:{}},library:{},licenses:[],privateLicenseRef:'test'}),code('ENGINE_VERSION_REQUIRED'));
});
test('compiled inventory declares exact module pair and all four ES Worker entries',()=>{
 const x=frontendFixture(),r=inspectFrontend(x.root,x.graph,x.engine,['application']);
 assert.equal(r.frontend.entry,'/'+x.entry);assert.equal(r.receipt.workerEntries.length,4);
 assert.equal(r.frontend.assets.filter(a=>a.cache==='immutable').length,2);
 assert.ok(r.frontend.assets.filter(a=>a.url.startsWith('/assets/')).every(a=>a.cache==='revalidate'));
 assert.ok(r.frontend.references.some(r=>r.to==='/release-bindings.json'));
 assert.equal(r.frontend.assets.some(r=>r.url.startsWith('/.vite/')),false);
});
for(const [name,mutate,expected]of [
 ['raw worker emitted as an asset',x=>write(x.root,'assets/unbundled.mjs',"import './missing.mjs';"),'UNBUNDLED_SCRIPT_ASSET'],
 ['source map marker',x=>write(x.root,x.entry,'export const x=1;\n//# sourceMappingURL=x.map'),'SOURCEMAP_REJECTED'],
 ['map file',x=>write(x.root,'assets/index.map','{}'),'FRONTEND_MIME'],
 ['embedded CSS bitmap',x=>write(x.root,'assets/main.css','body{background:url(data:image/png;base64,AA)}'),'INLINE_OR_REMOTE_ASSET'],
 ['remote CSS image',x=>write(x.root,'assets/main.css','body{background:url(https://invalid.example/a.png)}'),'INLINE_OR_REMOTE_ASSET'],
 ['private credentials asset',x=>write(x.root,'credentials.json','{}'),'ASSET_PATH_REJECTED'],
 ['unknown dynamic dependency',x=>x.graph.bundles[0].dynamicImports.push('assets/missing.js'),'FRONTEND_REFERENCE'],
 ['dangling Vite manifest import',x=>{x.manifest['index.html'].imports=['missing'];write(x.root,'.vite/manifest.json',JSON.stringify(x.manifest));},'VITE_MANIFEST_REFERENCE'],
 ['raw production document',x=>write(x.root,'index.html','<script type="module" src="/src/main.mjs"></script>'),'COMPILED_HTML_REQUIRED'],
 ['a missing Worker entry',x=>x.graph.bundles.find(r=>r.fileName.includes('png-worker')).isEntry=false,'PRODUCTION_WORKERS_REQUIRED']
])test('frontend refuses '+name,()=>{const x=frontendFixture();mutate(x);assert.throws(()=>inspectFrontend(x.root,x.graph,x.engine,['application']),code(expected));});

test('license input helper rejects key-file paths before attempting to read any key',async()=>{
 const {pinApplicationInput}=await import('../../tools/application/pin-input.mjs'),d=directory('pin-license'),module=pin(write(d,'module.mjs',wrapper)),binary=pin(write(d,'module.wasm',wasm)),out=resolve(d,'input');
 const root=environment().root;
 assert.throws(()=>pinApplicationInput({version:'arch-application-request/1',sourceRoot:root,appToolchainRoot:root,printingToolchainRoot:root,engine:{module,wasm:binary,abi:2,semantics:3,source:2,buildReceipt:{}},libraryRoot:root,licenses:[{id:'application',spdx:'LicenseRef-Private-Project',source:'private',revision:'1',file:resolve(d,'nonexistent-user.keys')}],privateLicenseRef:'private'},out),code('LICENSE_FILE_NAME'));
 assert.equal(existsSync(out),false);
});

import {inspectIncomingBinding,validateEngineBuild} from '../../tools/application/engine-build.mjs';
import {SOURCE_FILES} from '../../tools/application/snapshot.mjs';
const incoming=['locateFile','print','printErr','wasmBinary'],linker='module-incoming-api.json "-sINCOMING_MODULE_JS_API=$kernelIncomingApi"',bound='if(Module["wasmBinary"])wasmBinary=Module["wasmBinary"];';
test('incoming API receipt records syntax admission without manufacturing runtime proof',()=>{
 const source=[...incoming],result=inspectIncomingBinding(source,linker,bound);assert.deepEqual(result.incomingModuleApi,source);result.incomingModuleApi.push('extra');assert.deepEqual(source,incoming);assert.equal(result.actualWorkerIntegrity,'requires-separate-execution-evidence');
});
for(const [name,api,script,module,expected]of [
 ['missing wasmBinary',incoming.filter(v=>v!=='wasmBinary'),linker,bound,'ENGINE_INCOMING_API'],
 ['duplicate incoming name',[...incoming,'wasmBinary'],linker,bound,'ENGINE_INCOMING_API'],
 ['omitted explicit build flag',incoming,'module-incoming-api.json',bound,'ENGINE_BUILD_FLAG'],
 ['old generated factory ignores incoming bytes',incoming,linker,'var wasmBinary;','ENGINE_WASM_INPUT_BINDING']
])test('incoming contract rejects '+name,()=>assert.throws(()=>inspectIncomingBinding(api,script,module),code(expected)));
test('main snapshot contains canonical native link flag and API sources',()=>{for(const path of ['tools/kernel/build.ps1','tools/kernel/module-incoming-api.json','src/kernel/native/product-exports.json'])assert.ok(SOURCE_FILES.includes(path));});
test('native build receipt rejects a key path before reading any bytes',()=>assert.throws(()=>validateEngineBuild({buildReceipt:{file:resolve(directory('receipt-key'),'user.keys')}},environment().root),code('ENGINE_BUILD_RECEIPT_PATH')));
