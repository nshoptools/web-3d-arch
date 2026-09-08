import test from 'node:test';
import assert from 'node:assert/strict';
import {EngineClient} from '../../src/core/engine-client.mjs';

// Controlled RPC envelopes test client rejection/retirement. Actual getter
// execution and same-Module 2/1/2 proof are tested in worker.test.mjs.
test('printing ready proof validates exact ABI tuple and retires with its epoch',async()=>{
 const saved=new Map(['location','crossOriginIsolated','Worker'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 class HeldWorker {static last;constructor(){HeldWorker.last=this;this.terminated=false;}postMessage(){}terminate(){this.terminated=true;}deliver(data){this.onmessage({data});}}
 Object.defineProperties(globalThis,{location:{configurable:true,value:{href:'https://fixture.invalid/'}},crossOriginIsolated:{configurable:true,value:true},Worker:{configurable:true,value:HeldWorker}});
 const make=()=>new EngineClient({moduleURL:'/same-module.mjs'});
 const envelope=(printingVersions,abi=2)=>({type:'ready',abi,memory:new SharedArrayBuffer(64),controlOffset:0,serviceCapabilities:{printingVersions}});
 const good={rootABI:2,arch3mfABI:1,kernel3mfABI:2};
 try{
  for(const [versions,abi] of [[{...good,rootABI:1},2],[{...good,arch3mfABI:2},2],[{...good,kernel3mfABI:1},2],[{rootABI:2,arch3mfABI:1},2],[{...good,arch3mfABI:'1'},2],[good,1]]){
   const c=make(),p=c.start(),w=HeldWorker.last;const rejected=assert.rejects(p,{code:abi===2?'PRINTING_ABI_MISMATCH':'CORE_ABI_MISMATCH'});w.deliver(envelope(versions,abi));await rejected;assert.ok(w.terminated);assert.equal(c.worker,null);assert.equal(c.serviceCapabilities.printingVersions,null);c.dispose();
  }
  const c=make();let p=c.start(),old=HeldWorker.last;old.deliver(envelope(good));await p;const first=c.serviceCapabilities.printingVersions;assert.deepEqual(first,{...good,epoch:c.epoch});assert.ok(Object.isFrozen(first));
  c.terminate('TEST_RETIRE');assert.equal(c.serviceCapabilities.printingVersions,null);
  p=c.start();const current=HeldWorker.last;old.deliver(envelope(good));assert.equal(c.serviceCapabilities.printingVersions,null,'retired ready cannot republish old proof');current.deliver(envelope(null));await p;assert.equal(c.serviceCapabilities.printingVersions,null,'missing exports never become a method-presence claim');c.dispose();
 }finally{for(const[k,d]of saved){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}}
});
