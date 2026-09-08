const HASH=/^[a-f0-9]{64}$/,MAX_MODULE=16*1024*1024,MAX_WASM=64*1024*1024;
export class RuntimeIntegrityError extends Error{constructor(code){super(code);this.name='RuntimeIntegrityError';this.code=code;}}
const need=(ok,code)=>{if(!ok)throw new RuntimeIntegrityError(code);};
export const runtimeDigest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
const exact=(v,fields)=>need(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===fields.length&&fields.every(k=>Object.hasOwn(v,k)),'RUNTIME_INTEGRITY_SCHEMA');
export function runtimeURL(value,origin){
 need(typeof value==='string'&&value.length>0&&value.length<=2048,'RUNTIME_URL');let url;try{url=new URL(value,origin);}catch{throw new RuntimeIntegrityError('RUNTIME_URL');}
 need(url.origin===origin&&['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&!url.search&&!url.hash&&!/%2f|%5c|%00/i.test(url.pathname),'RUNTIME_ORIGIN');return url;
}
export function checkedRuntimePin(pin,origin,maxBytes){
 exact(pin,['url','sha256','bytes']);need(HASH.test(pin.sha256)&&Number.isSafeInteger(pin.bytes)&&pin.bytes>0&&pin.bytes<=maxBytes,'RUNTIME_PIN');
 const url=runtimeURL(pin.url,origin);need(url.pathname.split('/').at(-1).includes(pin.sha256.slice(0,16)),'RUNTIME_CONTENT_ADDRESS');return Object.freeze({...pin,url:url.href});
}
export async function readRuntimeResponse(response,{url,maxBytes,expectedBytes,signal}={}){
 need(response?.ok===true&&!response.redirected&&response.url===url,'RUNTIME_RESPONSE');need(!signal?.aborted,'CANCELLED');
 const declared=response.headers.get('content-length');if(declared!==null)need(/^\d+$/.test(declared)&&Number(declared)<=maxBytes&&(expectedBytes===undefined||Number(declared)===expectedBytes),'RUNTIME_BYTES');
 const reader=response.body?.getReader();need(reader,'RUNTIME_RESPONSE_BODY');const chunks=[];let total=0;
 try{for(;;){const {value,done}=await reader.read();need(!signal?.aborted,'CANCELLED');if(done)break;need(value instanceof Uint8Array,'RUNTIME_RESPONSE_BODY');total+=value.length;if(total>maxBytes||expectedBytes!==undefined&&total>expectedBytes){await reader.cancel();throw new RuntimeIntegrityError('RUNTIME_BYTES');}chunks.push(value);}}
 finally{reader.releaseLock();}
 need(total>0&&(expectedBytes===undefined||total===expectedBytes),'RUNTIME_BYTES');const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
export async function fetchRuntimePin(pin,{origin,fetchImpl=globalThis.fetch,signal,maxBytes=MAX_WASM}={}){
 const checked=checkedRuntimePin(pin,origin,maxBytes),response=await fetchImpl(checked.url,{method:'GET',mode:'same-origin',credentials:'omit',redirect:'error',cache:'no-store',signal});
 const bytes=await readRuntimeResponse(response,{url:checked.url,maxBytes:checked.bytes,expectedBytes:checked.bytes,signal});need(await runtimeDigest(bytes)===checked.sha256,'RUNTIME_HASH');need(!signal?.aborted,'CANCELLED');return bytes;
}
export function checkedEngineIntegrity(value,origin,moduleURL){
 exact(value,['version','module','wasm']);need(value.version==='arch-engine-integrity/1','RUNTIME_INTEGRITY_VERSION');
 const module=checkedRuntimePin(value.module,origin,MAX_MODULE),wasm=checkedRuntimePin(value.wasm,origin,MAX_WASM);
 need(module.url===runtimeURL(moduleURL,origin).href&&/\.m?js$/.test(new URL(module.url).pathname)&&new URL(wasm.url).pathname.endsWith('.wasm')&&module.url!==wasm.url,'RUNTIME_MODULE_PAIR');
 return Object.freeze({version:value.version,module,wasm});
}
/** The immutable HTTPS host hashes public files once and retains their verified
 * bytes. Import uses that same content-addressed URL (CSP forbids blob scripts).
 * WASM is instantiated from the exact checked owned byte array, not fetched a
 * second time. Wrapper evidence is explicitly the pinned-host import path; this
 * is not a browser SRI attestation for dynamic import or trust in an arbitrary
 * server. Legacy component harnesses omit integrity and receive no proof. */
export async function initializeEngineModule({moduleURL,integrity=null,origin,fetchImpl=globalThis.fetch,importModule=url=>import(/* @vite-ignore */ url)}={}){
 const url=runtimeURL(moduleURL,origin);if(integrity===null){const factory=(await importModule(url.href)).default;need(typeof factory==='function','RUNTIME_FACTORY');return {engine:await factory({print:()=>{},printErr:()=>{}}),integrity:null};}
 const pin=checkedEngineIntegrity(integrity,origin,url.href);
 const [moduleBytes,wasmBytes]=await Promise.all([fetchRuntimePin(pin.module,{origin,fetchImpl,maxBytes:MAX_MODULE}),fetchRuntimePin(pin.wasm,{origin,fetchImpl,maxBytes:MAX_WASM})]);
 need(moduleBytes.length===pin.module.bytes,'RUNTIME_BYTES');
 const factory=(await importModule(pin.module.url)).default;need(typeof factory==='function','RUNTIME_FACTORY');
 let binaryRead=false;
 const options={get wasmBinary(){binaryRead=true;return wasmBytes;},locateFile:name=>{need(typeof name==='string'&&name.endsWith('.wasm'),'RUNTIME_RESOURCE_UNDECLARED');return pin.wasm.url;},print:()=>{},printErr:()=>{}};
 const engine=await factory(options);
 // A wrapper compiled without the incoming API must never publish this proof.
 // Exact one-instance / no-refetch behavior is also checked on the real release
 // factory in all supported browser engines, not inferred from this read alone.
 need(binaryRead,'RUNTIME_WASM_INPUT_IGNORED');
 const proof=Object.freeze({version:'arch-engine-integrity/1',module:pin.module,wasm:pin.wasm,wasmLoading:'verified-owned-wasmBinary',moduleLoading:'immutable-host-content-addressed-import'});
 return {engine,integrity:proof};
}

/** Validate the ready envelope against the caller's captured release binding. */
export function checkedRuntimeProof(value,expected,origin,moduleURL){
 if(expected===null){need(value===null||value===undefined,'RUNTIME_INTEGRITY_UNEXPECTED');return null;}
 exact(value,['version','module','wasm','wasmLoading','moduleLoading']);
 const received=checkedEngineIntegrity({version:value.version,module:value.module,wasm:value.wasm},origin,moduleURL),pin=checkedEngineIntegrity(expected,origin,moduleURL);
 for(const kind of ['module','wasm'])for(const field of ['url','bytes','sha256'])need(received[kind][field]===pin[kind][field],'RUNTIME_INTEGRITY_MISMATCH');
 need(value.wasmLoading==='verified-owned-wasmBinary'&&value.moduleLoading==='immutable-host-content-addressed-import','RUNTIME_INTEGRITY_LOADING');
 return Object.freeze({...received,wasmLoading:value.wasmLoading,moduleLoading:value.moduleLoading});
}
