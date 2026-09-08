// Test-only observation/fault seam around the UNMODIFIED production Worker.
// The imported factory and WASM are the actual pinned production bytes.
import '../../src/core/engine-worker.mjs';
const nativePost=self.postMessage.bind(self);
const mode=new URL(self.location.href).searchParams.get('mode')??'normal';
const records=[];let rootMemory=null,rootExports=null,instantiateCount=0,streamingCount=0;
const emit=(event,detail={})=>{const record={type:'integrity-test-observation',event,...detail};records.push(record);nativePost(record);};
const digest=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');
const getter=name=>{const f=rootExports?.[name]??rootExports?.['_'+name];return typeof f==='function'?f():null;};
const versions=()=>({rootABI:getter('arch_abi_version'),arch3mfABI:getter('arch3mf_abi_version'),kernel3mfABI:getter('arch3mf_kernel_abi_version'),sourceFrameVersion:getter('arch_source_frame_version')});
const instantiate=WebAssembly.instantiate;
WebAssembly.instantiate=async function(source,imports,...rest){
 instantiateCount++;
 const actualBytes=source instanceof WebAssembly.Module?null:new Uint8Array(ArrayBuffer.isView(source)?source.buffer:source,ArrayBuffer.isView(source)?source.byteOffset:0,ArrayBuffer.isView(source)?source.byteLength:source.byteLength).slice();
 const result=await Reflect.apply(instantiate,WebAssembly,[source,imports,...rest]),instance=result.instance??result;
 rootExports=instance.exports;
 const memories=[...Object.values(instance.exports),...Object.values(imports??{}).flatMap(v=>Object.values(v))].filter(v=>v instanceof WebAssembly.Memory);
 rootMemory=memories[0]??null;
 emit('instantiate',{count:instantiateCount,streamingCount,sha256:actualBytes?await digest(actualBytes):null,bytes:actualBytes?.byteLength??null,versions:versions(),shared:rootMemory?.buffer instanceof SharedArrayBuffer,memoryBytes:rootMemory?.buffer.byteLength??0});
 return result;
};
if(typeof WebAssembly.instantiateStreaming==='function'){
 const streaming=WebAssembly.instantiateStreaming;
 WebAssembly.instantiateStreaming=function(...args){streamingCount++;emit('instantiate-streaming',{streamingCount});return Reflect.apply(streaming,WebAssembly,args);};
}
self.postMessage=(message,...rest)=>{
 if(message?.type==='ready'){
  emit('ready',{versions:versions(),memoryMatchesInstance:message.memory===rootMemory?.buffer,controlMatchesInstance:message.controlOffset===getter('arch_control_ptr'),instantiateCount,streamingCount});
  let sent=message;
  if(mode==='missing-proof'){sent={...message};delete sent.runtimeIntegrity;}
  if(mode==='forged-wasm-hash')sent={...message,runtimeIntegrity:{...message.runtimeIntegrity,wasm:{...message.runtimeIntegrity.wasm,sha256:message.runtimeIntegrity.wasm.sha256.slice(0,63)+(message.runtimeIntegrity.wasm.sha256.endsWith('0')?'1':'0')}}};
  if(mode==='mixed-proof')sent={...message,runtimeIntegrity:{...message.runtimeIntegrity,wasm:{...message.runtimeIntegrity.wasm,url:message.runtimeIntegrity.wasm.url.replace('/assets/','/other-assets/')}}};
  if(mode==='invalid-abi')sent={...message,abi:999,serviceCapabilities:{}};
  if(mode==='invalid-heap')sent={...message,memory:new ArrayBuffer(128)};
  if(mode==='invalid-control')sent={...message,controlOffset:3};
  nativePost(sent,...rest);if(mode==='duplicate-ready')nativePost(sent,...rest);return;
 }
 if(message?.type==='snapshot')emit('snapshot',{id:message.id,generation:message.generation,memoryMatchesInstance:message.memory===rootMemory?.buffer});
 nativePost(message,...rest);
};
const rootMessage=self.onmessage;
self.onmessage=event=>{
 if(event.data?.type==='integrity-test-drain'){nativePost({type:'integrity-test-drained',id:event.data.id,instantiateCount,streamingCount,versions:versions(),received:records.filter(r=>r.event==='request').map(r=>r.requestType)});return;}
 emit('request',{requestType:event.data?.type});
 return rootMessage.call(self,event);
};

