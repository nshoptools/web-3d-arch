import {fetchRuntimePin,readRuntimeResponse,runtimeURL,checkedEngineIntegrity,runtimeDigest,RuntimeIntegrityError} from '../core/runtime-integrity.mjs';
import {materializeReleaseSourceLibrary} from '../../tools/release/source-transport.mjs';
const need=(ok,code)=>{if(!ok)throw new RuntimeIntegrityError(code);};
const exact=(v,fields)=>need(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===fields.length&&fields.every(k=>Object.hasOwn(v,k)),'RELEASE_BINDINGS_SCHEMA');
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
/** Version labels describe the browser reporting them; actual capabilities are
 * probed by the renderer in the same Worker. No UA match certifies rendering. */
export function browserRuntime(userAgent=globalThis.navigator?.userAgent??''){
 const firefox=/Firefox\/([\d.]+)/.exec(userAgent),chrome=/(?:Chrome|Chromium)\/([\d.]+)/.exec(userAgent),safari=/Version\/([\d.]+).*Safari\//.exec(userAgent);
 if(firefox)return {engine:'firefox',version:firefox[1]};if(chrome)return {engine:'chromium',version:chrome[1]};if(safari||/AppleWebKit\//.test(userAgent))return {engine:'webkit',version:safari?.[1]??'reported-webkit'};
 return {engine:'unknown',version:'unreported'};
}
export function deviceIdentity(storage=globalThis.localStorage){
 const key='arch-device-v1',valid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
 let value;try{value=storage.getItem(key);if(value!==null){need(valid(value),'DEVICE_IDENTITY_INVALID');return value;}value=crypto.randomUUID();storage.setItem(key,value);need(storage.getItem(key)===value,'DEVICE_STORAGE_UNAVAILABLE');return value;}catch(e){if(e instanceof RuntimeIntegrityError)throw e;throw new RuntimeIntegrityError('DEVICE_STORAGE_UNAVAILABLE');}
}
export async function loadReleaseBootstrap({origin=location.origin,entryURL,fetchImpl=globalThis.fetch,signal}={}){
 const url=runtimeURL('/release-bindings.json',origin).href,response=await fetchImpl(url,{method:'GET',mode:'same-origin',credentials:'omit',redirect:'error',cache:'no-store',signal});
 const bytes=await readRuntimeResponse(response,{url,maxBytes:1024*1024,signal});let bindings;try{bindings=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new RuntimeIntegrityError('RELEASE_BINDINGS_JSON');}
 exact(bindings,['version','entry','engine','library']);need(bindings.version==='arch-release-bindings/1','RELEASE_BINDINGS_VERSION');
 need(entryURL&&runtimeURL(bindings.entry,origin).href===runtimeURL(entryURL,origin).href,'RELEASE_ENTRY_MISMATCH');
 const e=bindings.engine;exact(e,['moduleUrl','wasmUrl','binaryRequest','abi','semantics','source','module','wasm']);need(e.abi===2&&e.semantics===3&&e.source===2,'RELEASE_ENGINE_VERSION');
 need(e.moduleUrl===e.module.url&&e.wasmUrl===e.wasm.url&&runtimeURL(new URL(e.binaryRequest,runtimeURL(e.moduleUrl,origin)).href,origin).href===runtimeURL(e.wasmUrl,origin).href,'RELEASE_MODULE_PAIR');
 const engineIntegrity=checkedEngineIntegrity({version:'arch-engine-integrity/1',module:e.module,wasm:e.wasm},origin,e.moduleUrl);
 exact(bindings.library,['catalog','deployment','artwork','receipt','transport']);
 const [catalogBytes,deploymentBytes,transportBytes]=await Promise.all(['catalog','deployment','transport'].map(key=>fetchRuntimePin(bindings.library[key],{origin,fetchImpl,signal,maxBytes:64*1024*1024})));
 const library=await materializeReleaseSourceLibrary({catalogBytes,deploymentBytes,transportBytes,origin});need(!signal?.aborted,'CANCELLED');
 const sourceLibrary={...library,runtime:browserRuntime()},bindingsHash=await runtimeDigest(bytes);
 return freeze({version:'arch-product-bootstrap/1',bindingsHash,moduleURL:engineIntegrity.module.url,engineIntegrity,sourceLibrary,engineIdentity:{id:'arch-kernel',version:'wasm-'+engineIntegrity.wasm.sha256}});
}
/** Join an actual ready proof to the very EngineClient retaining this model.
 * Presence of API methods or config labels cannot qualify printing. */
export function createPrintingRuntimeEvidence(bootstrap){
 need(bootstrap?.version==='arch-product-bootstrap/1','RELEASE_BOOTSTRAP_REQUIRED');
 return record=>{
  const client=record?.client,p=client?.runtimeIntegrity,v=client?.serviceCapabilities?.printingVersions;
  const b=bootstrap.engineIntegrity,matched=client&&!client.disposed&&p?.version==='arch-engine-integrity/1'&&p.module?.sha256===b.module.sha256&&p.wasm?.sha256===b.wasm.sha256&&p.module?.url===b.module.url&&p.wasm?.url===b.wasm.url&&p.wasmLoading==='verified-owned-wasmBinary'&&p.moduleLoading==='immutable-host-content-addressed-import';
  if(!matched||!v||v.epoch!==client.epoch||v.rootABI!==2||v.arch3mfABI!==1||v.kernel3mfABI!==2)return {status:'unverified',verdict:'unverified',reasonCode:'PRINTING_RUNTIME_UNVERIFIED',reason:'Bản nhân đang chạy chưa khớp hồ sơ kiểm chứng của bản phát hành.'};
  return Object.freeze({version:'arch-printing-runtime/1',status:'ready',key:bootstrap.bindingsHash+':'+client.epoch,client,epoch:client.epoch,runtimeABI:2,printingABI:1,kernelPrintingABI:2,moduleSha256:p.module.sha256,wasmSha256:p.wasm.sha256,evidenceId:'release:'+bootstrap.bindingsHash});
 };
}
