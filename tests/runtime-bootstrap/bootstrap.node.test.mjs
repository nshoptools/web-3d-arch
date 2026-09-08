import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {runtimeDigest,checkedEngineIntegrity,fetchRuntimePin,readRuntimeResponse,initializeEngineModule} from '../../src/core/runtime-integrity.mjs';
import {loadReleaseBootstrap,browserRuntime,deviceIdentity,createPrintingRuntimeEvidence} from '../../src/integration/release-bootstrap.mjs';
import {createSourceTransport} from '../../tools/release/source-transport.mjs';
const origin='https://bootstrap.test',utf8=new TextEncoder(),root=path.resolve(import.meta.dirname,'../..');
// Synthetic transport/factory test seams. Real permanent library config is used;
// no native Module, browser engine, account or printer is qualified by this suite.
async function pin(text,extension){const bytes=typeof text==='string'?utf8.encode(text):text,sha256=await runtimeDigest(bytes);return{bytes,pin:{url:'/assets/content.'+sha256+'.'+extension,sha256,bytes:bytes.length}};}
function response(url,bytes,change={}){const r=new Response(bytes,{status:200,headers:{'content-length':String(bytes.length),...change.headers}});Object.defineProperty(r,'url',{value:url});if(change.redirected)Object.defineProperty(r,'redirected',{value:true});return r;}
async function engineFixture(){const module=await pin('EXPLICIT TEST factory descriptor','mjs'),wasm=await pin(new Uint8Array([0,97,115,109,1,0,0,0]),'wasm'),calls=[];
 const integrity={version:'arch-engine-integrity/1',module:module.pin,wasm:wasm.pin},map=new Map([[new URL(module.pin.url,origin).href,module.bytes],[new URL(wasm.pin.url,origin).href,wasm.bytes]]);
 const fetchImpl=async(url,options)=>{calls.push({url,options});assert.ok(map.has(url));return response(url,map.get(url));};return{integrity,module,wasm,map,calls,fetchImpl};}

test('exact owned WASM reaches one factory; proof separates pinned-host module from byte loading',async()=>{
 const f=await engineFixture();let imported=0,factories=0,captured;
 const result=await initializeEngineModule({moduleURL:f.module.pin.url,integrity:f.integrity,origin,fetchImpl:f.fetchImpl,importModule:async url=>{imported++;assert.equal(url,new URL(f.module.pin.url,origin).href);return{default:async options=>{factories++;captured=options;assert.deepEqual(options.wasmBinary,f.wasm.bytes);return{explicitSyntheticFactory:true};}};}});
 assert.equal(imported,1);assert.equal(factories,1);assert.equal(f.calls.length,2);assert.deepEqual(captured.wasmBinary,f.wasm.bytes);assert.notEqual(captured.wasmBinary,f.wasm.bytes);assert.equal(captured.locateFile('old-name.wasm'),new URL(f.wasm.pin.url,origin).href);assert.throws(()=>captured.locateFile('extra.js'),{code:'RUNTIME_RESOURCE_UNDECLARED'});
 assert.equal(result.integrity.moduleLoading,'immutable-host-content-addressed-import');assert.equal(result.integrity.wasmLoading,'verified-owned-wasmBinary');assert.ok(Object.isFrozen(result.integrity));assert.ok(f.calls.every(r=>r.options.credentials==='omit'&&r.options.redirect==='error'&&r.options.cache==='no-store'));
});
test('altered bytes, same-length content and module binding mismatch stop before importing code',async()=>{
 const f=await engineFixture();f.map.set(new URL(f.module.pin.url,origin).href,new Uint8Array(f.module.bytes.length));let imports=0;
 await assert.rejects(initializeEngineModule({moduleURL:f.module.pin.url,integrity:f.integrity,origin,fetchImpl:f.fetchImpl,importModule:async()=>{imports++;}}),{code:'RUNTIME_HASH'});assert.equal(imports,0);
 assert.throws(()=>checkedEngineIntegrity(f.integrity,origin,'/other.mjs'),{code:'RUNTIME_MODULE_PAIR'});
 for(const change of [{...f.integrity,unknown:true},{...f.integrity,version:'wrong'}])assert.throws(()=>checkedEngineIntegrity(change,origin,f.module.pin.url));
});
test('same-origin content-addressed pins reject cross-origin, credentials, fragments and unbounded sizes',async()=>{
 const f=await engineFixture();for(const url of ['https://elsewhere.test'+f.wasm.pin.url,'https://u:p@bootstrap.test'+f.wasm.pin.url,f.wasm.pin.url+'#x',f.wasm.pin.url+'?x','/unhashed.wasm'])await assert.rejects(fetchRuntimePin({...f.wasm.pin,url},{origin,fetchImpl:f.fetchImpl}));
 await assert.rejects(fetchRuntimePin({...f.wasm.pin,bytes:1000000000},{origin,fetchImpl:f.fetchImpl}));assert.equal(f.calls.length,0);
});
test('redirect, response-URL drift, short or oversized stream and cancellation cannot produce bytes',async()=>{
 const url=origin+'/x',bytes=new Uint8Array([1,2,3]);
 await assert.rejects(readRuntimeResponse(response(origin+'/y',bytes),{url,maxBytes:3}),{code:'RUNTIME_RESPONSE'});
 await assert.rejects(readRuntimeResponse(response(url,bytes,{redirected:true}),{url,maxBytes:3}),{code:'RUNTIME_RESPONSE'});
 await assert.rejects(readRuntimeResponse(response(url,bytes),{url,maxBytes:2}),{code:'RUNTIME_BYTES'});
 await assert.rejects(readRuntimeResponse(response(url,bytes),{url,maxBytes:4,expectedBytes:4}),{code:'RUNTIME_BYTES'});
 const abort=new AbortController();abort.abort();await assert.rejects(readRuntimeResponse(response(url,bytes),{url,maxBytes:3,signal:abort.signal}),{code:'CANCELLED'});
 let cancelled=false;const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(4));},cancel(){cancelled=true;}});const r=new Response(stream);Object.defineProperty(r,'url',{value:url});await assert.rejects(readRuntimeResponse(r,{url,maxBytes:3}),{code:'RUNTIME_BYTES'});assert.equal(cancelled,true);
});
test('legacy fixture loading has no release integrity proof',async()=>{
 let calls=0;const result=await initializeEngineModule({origin,moduleURL:'/legacy.mjs',importModule:async()=>({default:async()=>{calls++;return {};}}),fetchImpl:()=>{throw Error('Legacy fixture should not claim pin fetching');}});assert.equal(calls,1);assert.equal(result.integrity,null);
});

let libraryPromise;
async function actualLibraryFixture(){return libraryPromise??=(async()=>{
 const dir=path.join(root,'src/assets/source-library'),catalog=fs.readFileSync(path.join(dir,'catalog.json')),deployment=fs.readFileSync(path.join(dir,'deployment.json'));
 const transport=utf8.encode(JSON.stringify(await createSourceTransport({catalogBytes:new Uint8Array(catalog),deploymentBytes:new Uint8Array(deployment)})));
 const rows={catalog:await pin(new Uint8Array(catalog),'json'),deployment:await pin(new Uint8Array(deployment),'json'),transport:await pin(transport,'json'),artwork:await pin('{}','json'),receipt:await pin('{}','json')};
 return rows;
})();}
async function bootstrapFixture(){const f=await engineFixture(),library=await actualLibraryFixture();const entry='/assets/app.entry.mjs',bindings={version:'arch-release-bindings/1',entry,engine:{moduleUrl:f.module.pin.url,wasmUrl:f.wasm.pin.url,binaryRequest:new URL(f.wasm.pin.url,origin).pathname,abi:2,semantics:3,source:2,module:f.module.pin,wasm:f.wasm.pin},library:Object.fromEntries(Object.entries(library).map(([k,v])=>[k,v.pin]))};
 for(const item of Object.values(library))f.map.set(new URL(item.pin.url,origin).href,item.bytes);
 f.map.set(origin+'/release-bindings.json',utf8.encode(JSON.stringify(bindings)));return{...f,entry,bindings,library};}

test('bootstrap validates actual permanent catalog/transport and retains original semantic media types',async()=>{
 const f=await bootstrapFixture(),b=await loadReleaseBootstrap({origin,entryURL:origin+f.entry,fetchImpl:f.fetchImpl});assert.equal(b.version,'arch-product-bootstrap/1');assert.equal(b.sourceLibrary.catalog.fonts.length,62);assert.equal(b.sourceLibrary.catalog.previews.length,7751);assert.equal(b.sourceLibrary.assetURLs.length,21391);
 assert.ok(b.sourceLibrary.assetURLs.filter(r=>r.mediaType==='image/svg+xml').every(r=>r.url.endsWith('.bin')));assert.equal(b.engineIntegrity.wasm.sha256,f.wasm.pin.sha256);assert.equal(f.calls.length,4,'bootstrap fetches descriptors only; engine starts separately');assert.ok(Object.isFrozen(b));
});
test('entry/version drift and corrupt catalog cannot bootstrap a mixed release',async()=>{
 const f=await bootstrapFixture();await assert.rejects(loadReleaseBootstrap({origin,entryURL:origin+'/other.mjs',fetchImpl:f.fetchImpl}),{code:'RELEASE_ENTRY_MISMATCH'});assert.equal(f.calls.length,1);
 f.bindings.engine.semantics=999;f.map.set(origin+'/release-bindings.json',utf8.encode(JSON.stringify(f.bindings)));await assert.rejects(loadReleaseBootstrap({origin,entryURL:origin+f.entry,fetchImpl:f.fetchImpl}),{code:'RELEASE_ENGINE_VERSION'});
 f.bindings.engine.semantics=3;f.map.set(origin+'/release-bindings.json',utf8.encode(JSON.stringify(f.bindings)));f.map.set(new URL(f.library.catalog.pin.url,origin).href,new Uint8Array(f.library.catalog.bytes.length));await assert.rejects(loadReleaseBootstrap({origin,entryURL:origin+f.entry,fetchImpl:f.fetchImpl}),{code:'RUNTIME_HASH'});
});
test('printing runtime gate joins exact ready epoch/proof and never accepts presence of methods alone',async()=>{
 const f=await bootstrapFixture(),b=await loadReleaseBootstrap({origin,entryURL:origin+f.entry,fetchImpl:f.fetchImpl}),read=createPrintingRuntimeEvidence(b),client={epoch:1,disposed:false,finalSceneGeometry(){}};
 assert.equal(read({client}).status,'unverified');client.runtimeIntegrity={...b.engineIntegrity,wasmLoading:'verified-owned-wasmBinary',moduleLoading:'immutable-host-content-addressed-import'};client.serviceCapabilities={printingVersions:{rootABI:2,arch3mfABI:1,kernel3mfABI:2,epoch:1}};
 assert.equal(read({client}).status,'ready');client.epoch=2;assert.equal(read({client}).status,'unverified');client.serviceCapabilities.printingVersions.epoch=2;client.runtimeIntegrity={...client.runtimeIntegrity,wasm:{...client.runtimeIntegrity.wasm,sha256:'0'.repeat(64)}};assert.equal(read({client}).status,'unverified');
});
test('device identity is origin-local and stable; blocked storage never silently changes device',()=>{
 const map=new Map(),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};const id=deviceIdentity(storage);assert.equal(deviceIdentity(storage),id);assert.equal(map.size,1);
 assert.throws(()=>deviceIdentity({getItem(){throw Error('blocked');}}),{code:'DEVICE_STORAGE_UNAVAILABLE'});map.set('arch-device-v1','bad');assert.throws(()=>deviceIdentity(storage),{code:'DEVICE_IDENTITY_INVALID'});
 assert.equal(browserRuntime('Firefox/155.0').engine,'firefox');assert.equal(browserRuntime('AppleWebKit/537.36 Chrome/153.0 Safari/537.36').engine,'chromium');assert.equal(browserRuntime('AppleWebKit/605.1.15 Version/26.6 Safari/605.1.15').engine,'webkit');assert.equal(browserRuntime('unrecognized').engine,'unknown');
});

test('a factory that ignores the incoming binary cannot publish a verified proof',async()=>{
 const f=await engineFixture();await assert.rejects(initializeEngineModule({moduleURL:f.module.pin.url,integrity:f.integrity,origin,fetchImpl:f.fetchImpl,importModule:async()=>({default:async()=>({explicitIgnoredOptions:true})})}),{code:'RUNTIME_WASM_INPUT_IGNORED'});
});
