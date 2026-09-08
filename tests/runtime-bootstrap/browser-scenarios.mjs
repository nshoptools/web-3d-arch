import {EngineClient} from '../../src/core/engine-client.mjs';
const must=(ok,message)=>{if(!ok)throw Error(message);};
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes))),v=>v.toString(16).padStart(2,'0')).join('');
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="0 0 20 10"><path fill-rule="evenodd" d="M0 0H20V10H0Z M8 3H12V7H8Z"/></svg>';
const source={kind:'svg',source:svg,thicknessMm:.2,longEdgeMm:0,toleranceMm:.001};
const equal=(a,b,label)=>must(JSON.stringify(a)===JSON.stringify(b),label);
function observed(client){const state={events:[],worker:client.worker,ready:null};state.worker.addEventListener('message',({data})=>{if(data.type==='integrity-test-observation')state.events.push(data);if(data.type==='ready'&&state.ready===null)state.ready=data;});return state;}
function drain(worker,id=1){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{worker.removeEventListener('message',receive);reject(Error('Observer drain deadline'));},10000);
 function receive({data}){if(data.type!=='integrity-test-drained'||data.id!==id)return;clearTimeout(timer);worker.removeEventListener('message',receive);resolve(data);}
 worker.addEventListener('message',receive);worker.postMessage({type:'integrity-test-drain',id});
});}
const make=cfg=>new EngineClient({moduleURL:cfg.integrity.module.url,integrity:cfg.integrity,workerURL:cfg.workerURL});
const pending=new Map();
export async function beginPositive(cfg){
 const pins=structuredClone(cfg.integrity),client=new EngineClient({moduleURL:pins.module.url,integrity:pins,workerURL:cfg.workerURL});
 const expected=structuredClone(client.integrity);
 // Input mutation occurs before start: the constructor must already own pins.
 pins.module.bytes=1;pins.wasm.sha256='0'.repeat(64);pins.wasm.url='https://outside.invalid/changed.wasm';
 equal(client.integrity,expected,'constructor pin copy');
 const started=client.start(),observation=observed(client);pending.set(cfg.id,{client,started,observation,expected});
 // Attach rejection immediately while the host intentionally holds WASM.
 started.catch(()=>{});return{started:true};
}
export async function finishPositive(id){
 const {client:c,started,observation:o,expected}=pending.get(id);pending.delete(id);let original=null,frame=null;
 try{
  await Promise.all([started,c.start(),c.start()]);
  const epoch=c.epoch,worker=c.worker,proof=c.runtimeIntegrity;
  must(proof?.version==='arch-engine-integrity/1','actual proof version');equal(proof.module,expected.module,'module pins');equal(proof.wasm,expected.wasm,'wasm pins');
  must(proof.wasmLoading==='verified-owned-wasmBinary'&&proof.moduleLoading==='immutable-host-content-addressed-import','exact loading declaration');
  must(Object.isFrozen(proof)&&Object.isFrozen(proof.module)&&Object.isFrozen(proof.wasm),'owned frozen proof');
  equal(c.serviceCapabilities.printingVersions,{rootABI:2,arch3mfABI:1,kernel3mfABI:2,epoch},'actual ready printing tuple');
  must(c.serviceCapabilities.sourceFrameVersion===1,'actual frame ABI1');
  const oldControl=new Int32Array(c.memory,c.controlOffset,4);
  original=await c.build(source,{generation:1});
  const originalBytes=original.bytes().slice(),before=await digest(originalBytes),header=new DataView(originalBytes.buffer);
  must(header.getUint32(0,true)===0x48435241&&header.getUint32(4,true)===1,'real ARCH/1');
  must(header.getUint32(20,true)>0&&header.getUint32(24,true)>0,'real geometry after verified initialization');
  frame=await c.sourceFrame(original,{version:'arch-source-frame/1',sourceHash:original.metadata.sourceHash,matrix:[1,0,0,-1,-2,3]},{generation:2});
  must(Atomics.load(oldControl,0)===2,'old ready heap aliases same actual root control');
  const framed=frame.bytes(),fh=new DataView(framed.buffer,framed.byteOffset,framed.byteLength);
  must(fh.getUint32(20,true)===0&&fh.getUint32(24,true)===0&&fh.getUint32(32,true)>0,'actual planar frame output');
  must(await digest(original.bytes())===before,'source immutable');must(frame.metadata.sourceFrame.geometrySha256===await digest(framed),'frame exact derived bytes');
  const result=await drain(worker);
  must(result.instantiateCount===1&&result.streamingCount===0,'exactly one native WASM instance, no streaming fetch: '+JSON.stringify({result,events:o.events}));
  equal(result.versions,{rootABI:2,arch3mfABI:1,kernel3mfABI:2,sourceFrameVersion:1},'same instance exported versions');
  must(o.events.filter(e=>e.event==='instantiate').length===1,'one instantiation observation');
  const inst=o.events.find(e=>e.event==='instantiate');must(inst.shared&&inst.sha256===expected.wasm.sha256&&inst.bytes===expected.wasm.bytes,'exact checked byte array passed to real instantiate');
  must(o.events.filter(e=>e.event==='ready').every(e=>e.memoryMatchesInstance&&e.controlMatchesInstance),'ready uses actual single heap');
  must(o.events.filter(e=>e.event==='snapshot').length===2&&o.events.filter(e=>e.event==='snapshot').every(e=>e.memoryMatchesInstance),'source/frame same heap');
  must(worker===c.worker&&epoch===c.epoch,'same client Worker epoch');
  const summary={proof,epoch,printing:c.serviceCapabilities.printingVersions,sourceFrameVersion:c.serviceCapabilities.sourceFrameVersion,geometry:{sourceHash:original.metadata.sourceHash,archSha256:before,vertices:header.getUint32(20,true),triangles:header.getUint32(24,true),frameHash:frame.metadata.sourceFrame.geometrySha256},observer:result,events:o.events};
  c.dispose();original.release();frame.release();original=frame=null;
  must(c.runtimeIntegrity===null&&c.memory===null&&c.serviceCapabilities.printingVersions===null&&c.serviceCapabilities.sourceFrameVersion===null,'dispose retires all proof');
  const count=c.requestSequence;let code;try{await c.start();}catch(e){code=e.code;}must(code==='ENGINE_DISPOSED'&&count===c.requestSequence&&c.worker===null,'dispose never restarts');
  return summary;
 }finally{frame?.release();original?.release();c.dispose();}
}
export async function runRefusal(cfg){
 const c=make(cfg);const phases=[];c.onStatus=s=>phases.push(s.phase);
 try{
  // Queue an actual geometry operation; invalid init must stop before dispatch.
  const work=c.build(source,{generation:1}),o=observed(c);
  let code;try{await work;code='ACCEPTED';}catch(e){code=e.code??e.message;}
  must(code===cfg.expected,'expected '+cfg.expected+', got '+code);
  must(c.runtimeIntegrity===null&&c.memory===null&&c.worker===null,'refusal retires local runtime');
  must(c.requestSequence===0&&!phases.includes('ready'),'no geometry/public ready before refusal');
  must(!o.events.some(e=>e.event==='request'&&e.requestType==='build'),'invalid initialization never dispatched build');
  return{code,requestSequence:c.requestSequence,phases,events:o.events};
 }finally{c.dispose();}
}
export async function runDuplicate(cfg){
 const c=make(cfg);const retired=new Promise(resolve=>c.onRetirement(resolve));
 try{
  const p=c.start(),o=observed(c);await p;const acceptedEpoch=c.epoch;
  must(await retired==='DUPLICATE_READY','real ready duplicate rejected');
  must(c.epoch>acceptedEpoch&&c.worker===null&&c.memory===null&&c.runtimeIntegrity===null,'duplicate retires proof and heap');
  must(c.serviceCapabilities.printingVersions===null&&c.serviceCapabilities.sourceFrameVersion===null,'duplicate retires ABI proof');
  return{code:'DUPLICATE_READY',events:o.events,requestSequence:c.requestSequence};
 }finally{c.dispose();}
}
export function rejectMixedRequest(cfg){
 const before=performance.getEntriesByType('resource').length;let code;
 try{new EngineClient({moduleURL:cfg.otherModuleURL,integrity:cfg.integrity,workerURL:cfg.workerURL});}catch(e){code=e.code;}
 must(code==='RUNTIME_MODULE_PAIR','mixed requested module vs release pins rejected before Worker');
 return{code,resourceEntriesBefore:before,resourceEntriesAfter:performance.getEntriesByType('resource').length};
}
export function beginDispose(cfg){
 const c=make(cfg),p=c.build(source,{generation:1}),o=observed(c),settled=p.then(()=>({code:'ACCEPTED'}),e=>({code:e.code}));
 pending.set(cfg.id,{client:c,settled,observation:o});return{started:true};
}
export async function runReplacement(cfg){
 const c=make(cfg);let a=null,b=null;
 try{
  const pa=c.start(),oa=observed(c),oldDispatch=oa.worker.onmessage;await pa;
  a=await c.build(source,{generation:1});const oldEpoch=c.epoch,oldId=a.id,oldReady=oa.ready;
  const first=await drain(oa.worker);must(first.instantiateCount===1&&first.streamingCount===0,'first epoch one owned Module');
  c.terminate('TEST_RETIRE');must(c.runtimeIntegrity===null&&c.memory===null,'retire proof before replacement');
  const pb=c.start(),ob=observed(c),epoch=c.epoch;
  // Replay the saved ORIGINAL ready envelope through the original epoch's
  // handler, modeling a late queued transport delivery. Both Workers are real.
  oldDispatch({data:oldReady});must(c.runtimeIntegrity===null&&c.epoch===epoch,'old ready ignored during replacement init');
  await pb;const proof=c.runtimeIntegrity;oldDispatch({data:oldReady});
  must(c.runtimeIntegrity===proof&&c.worker===ob.worker&&c.epoch===epoch,'old ready cannot replace current proof or act as duplicate');
  b=await c.build(source,{generation:1});must(b.id===oldId,'actual fresh-Module numeric handle ABA');must(epoch!==oldEpoch,'different client epoch');
  let code;try{c.sourceFrame(a,{version:'arch-source-frame/1',sourceHash:a.metadata.sourceHash,matrix:[1,0,0,1,0,0]},{generation:2});}catch(e){code=e.code;}
  must(code==='SNAPSHOT_RETIRED','old numeric collision cannot authorize geometry');
  const before=await digest(b.bytes()),currentControl=new Int32Array(c.memory,c.controlOffset,4),oldControl=new Int32Array(oldReady.memory,oldReady.controlOffset,4);
  Atomics.store(oldControl,0,123456);must(Atomics.load(currentControl,0)===1,'retired heap does not alias replacement root');
  a.release();a=null;must(await digest(b.bytes())===before&&c.runtimeIntegrity===proof,'old cleanup cannot release current result/proof');
  equal(c.serviceCapabilities.printingVersions,{rootABI:2,arch3mfABI:1,kernel3mfABI:2,epoch},'replacement printing epoch');
  const second=await drain(ob.worker);must(second.instantiateCount===1&&second.streamingCount===0,'replacement one owned Module');
  return{oldEpoch,epoch,oldId,newId:b.id,oldLeaseCode:code,first,second,events:[...oa.events,...ob.events],lateEnvelope:'actual-old-ready-through-saved-old-handler'};
 }finally{a?.release();b?.release();c.dispose();}
}
export async function finishDispose(id){
 const {client:c,settled,observation:o}=pending.get(id);pending.delete(id);c.dispose();const result=await settled;
 must(result.code==='ENGINE_DISPOSED','pending initialization disposed');must(c.runtimeIntegrity===null&&c.memory===null&&c.worker===null,'no partial proof after dispose');
 let code;try{await c.start();}catch(e){code=e.code;}must(code==='ENGINE_DISPOSED','no restart');
 return{...result,events:o.events,requestSequence:c.requestSequence};
}
