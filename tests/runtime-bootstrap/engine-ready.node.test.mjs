import test from 'node:test';
import assert from 'node:assert/strict';
import {EngineClient} from '../../src/core/engine-client.mjs';

// Protocol fault injection only. No factory or native Module exists in this file.
const origin='https://integrity-client.test';
const binding=()=>({version:'arch-engine-integrity/1',
 module:{url:origin+'/assets/kernel.'+'1'.repeat(64)+'.mjs',sha256:'1'.repeat(64),bytes:128},
 wasm:{url:origin+'/assets/kernel.'+'2'.repeat(64)+'.wasm',sha256:'2'.repeat(64),bytes:256}});
const proof=()=>({...binding(),wasmLoading:'verified-owned-wasmBinary',moduleLoading:'immutable-host-content-addressed-import'});
class ControlledWorker {
 static instances=[];
 constructor(){this.sent=[];this.terminated=false;ControlledWorker.instances.push(this);}
 postMessage(m){this.sent.push(structuredClone(m));}
 terminate(){this.terminated=true;}
 send(data){this.onmessage?.({data});}
}
const globals=new Map(['location','crossOriginIsolated','Worker'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
Object.defineProperties(globalThis,{location:{configurable:true,value:{href:origin+'/'}},crossOriginIsolated:{configurable:true,value:true},Worker:{configurable:true,value:ControlledWorker}});
test.after(()=>{for(const[k,d]of globals){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}});
const make=options=>new EngineClient({moduleURL:binding().module.url,integrity:binding(),...options});
const ready=()=>({type:'ready',abi:2,memory:new SharedArrayBuffer(65536),controlOffset:32,runtimeIntegrity:proof(),serviceCapabilities:{sourceFrameVersion:1,printingVersions:{rootABI:2,arch3mfABI:1,kernel3mfABI:2}}});
const settle=p=>p.then(()=>({accepted:true}),e=>({accepted:false,code:e.code}));

test('constructor captures immutable release pins before initialization',async()=>{
 const pin=binding(),c=make({integrity:pin});try{
  pin.module.bytes=1;pin.wasm.sha256='0'.repeat(64);pin.wasm.url='https://elsewhere.test/evil.wasm';
  assert.deepEqual(c.integrity,binding());assert.ok(Object.isFrozen(c.integrity)&&Object.isFrozen(c.integrity.wasm));
  const p=c.start(),w=c.worker;assert.deepEqual(w.sent[0].integrity,binding());w.send(ready());await p;
  assert.deepEqual(c.runtimeIntegrity,proof());assert.ok(Object.isFrozen(c.runtimeIntegrity));assert.ok(Object.isFrozen(c.runtimeIntegrity.module));
 }finally{c.dispose();}
});
test('missing or forged integrity ready proof never publishes proof or memory',async()=>{
 for(const [name,change]of [
  ['missing',r=>delete r.runtimeIntegrity],
  ['extra-field',r=>r.runtimeIntegrity.extra=true],
  ['version',r=>r.runtimeIntegrity.version='arch-engine-integrity/2'],
  ['module-hash',r=>r.runtimeIntegrity.module.sha256='1'.repeat(63)+'3'],
  ['wasm-hash',r=>r.runtimeIntegrity.wasm.sha256='2'.repeat(63)+'3'],
  ['mixed-pair',r=>r.runtimeIntegrity.wasm.url=origin+'/other/kernel.'+'2'.repeat(64)+'.wasm'],
  ['byte-count',r=>r.runtimeIntegrity.wasm.bytes++],
  ['loading-mode',r=>r.runtimeIntegrity.wasmLoading='streamed-unverified']
 ]){
  const c=make();try{const p=settle(c.start()),w=c.worker,r=ready();change(r);w.send(r);const result=await p;
   assert.equal(result.accepted,false,name);assert.match(result.code,/^RUNTIME_/);assert.equal(c.runtimeIntegrity,null);assert.equal(c.memory,null);assert.equal(c.worker,null);assert.equal(w.terminated,true);
  }finally{c.dispose();}
 }
});
test('legacy caller rejects unexpected integrity proof',async()=>{
 const c=make({integrity:null});try{const p=settle(c.start());c.worker.send(ready());assert.deepEqual(await p,{accepted:false,code:'RUNTIME_INTEGRITY_UNEXPECTED'});}finally{c.dispose();}
});
test('duplicate ready retires its proof, heap, printing/frame capability and lease epoch',async()=>{
 const c=make();try{const p=c.start(),w=c.worker,r=ready();w.send(r);await p;const epoch=c.epoch;let reason;c.onRetirement(code=>reason=code);w.send(r);
  assert.equal(reason,'DUPLICATE_READY');assert.ok(c.epoch>epoch);assert.equal(w.terminated,true);assert.equal(c.worker,null);assert.equal(c.memory,null);assert.equal(c.runtimeIntegrity,null);assert.equal(c.serviceCapabilities.printingVersions,null);assert.equal(c.serviceCapabilities.sourceFrameVersion,null);
 }finally{c.dispose();}
});
test('retired epoch ready cannot install proof during or after a replacement epoch',async()=>{
 const c=make();try{
  const pending=settle(c.start()),a=c.worker;c.terminate('TEST_RETIRE');assert.equal((await pending).accepted,false);
  const current=c.start(),b=c.worker,epoch=c.epoch,forged=ready();forged.runtimeIntegrity.wasm.sha256='0'.repeat(64);
  a.send(forged);assert.equal(c.worker,b);assert.equal(c.epoch,epoch);assert.equal(c.runtimeIntegrity,null);
  const r=ready();b.send(r);await current;const accepted=c.runtimeIntegrity;
  a.send(ready());a.send({type:'failed',code:'LATE_OLD_FAILURE'});assert.equal(c.runtimeIntegrity,accepted);assert.equal(c.worker,b);assert.equal(c.epoch,epoch);
 }finally{c.dispose();}
});
test('dispose rejects pending start and cannot restart or restore ready proof',async()=>{
 const c=make(),p=settle(c.start()),w=c.worker,count=ControlledWorker.instances.length;c.dispose();
 assert.deepEqual(await p,{accepted:false,code:'ENGINE_DISPOSED'});w.send(ready());assert.equal(c.runtimeIntegrity,null);assert.equal(c.memory,null);
 await assert.rejects(c.start(),{code:'ENGINE_DISPOSED'});await assert.rejects(c.build({kind:'svg',source:'unused'},{generation:1}),{code:'ENGINE_DISPOSED'});
 assert.equal(ControlledWorker.instances.length,count);
});
for(const [name,change]of [
 ['missing root ABI',r=>{delete r.abi;r.serviceCapabilities={};}],
 ['invalid root ABI without optional capabilities',r=>{r.abi=999;r.serviceCapabilities={};}],
 ['non-shared heap',r=>r.memory=new ArrayBuffer(65536)],
 ['missing heap',r=>delete r.memory],
 ['unaligned control offset',r=>r.controlOffset=3],
 ['out-of-range control offset',r=>r.controlOffset=r.memory.byteLength-4]
])test('ready envelope rejects '+name,async()=>{
 const c=make();try{const p=settle(c.start()),r=ready();change(r);c.worker.send(r);const result=await p;
  assert.deepEqual(result,{accepted:false,code:'CORE_ABI_MISMATCH'},name+' must not publish a usable runtime');assert.equal(c.runtimeIntegrity,null);assert.equal(c.memory,null);
 }finally{c.dispose();}
});

test('core control bounds reject nonintegers and accept the exact 16-byte boundary without optional capabilities',async()=>{
 for(const controlOffset of [-4,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1,undefined]){
  const c=make();try{const p=settle(c.start()),r=ready();r.controlOffset=controlOffset;c.worker.send(r);
   assert.deepEqual(await p,{accepted:false,code:'CORE_ABI_MISMATCH'});assert.equal(c.runtimeIntegrity,null);assert.equal(c.memory,null);
  }finally{c.dispose();}
 }
 for(const controlOffset of [0,65536-16]){
  const c=make();try{const p=c.start(),r=ready();r.controlOffset=controlOffset;r.serviceCapabilities={};c.worker.send(r);await p;
   assert.equal(c.memory,r.memory);assert.equal(c.controlOffset,controlOffset);assert.deepEqual(c.runtimeIntegrity,proof());
   assert.equal(c.serviceCapabilities.printingVersions,null);
  }finally{c.dispose();}
 }
});
