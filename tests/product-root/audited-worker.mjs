let booting=true;const queued=[];
const queue=e=>{if(booting){queued.push(e.data);e.stopImmediatePropagation();}};
self.addEventListener('message',queue);
// Test instrumentation only. Load the unmodified production Worker and observe
// actual instantiate inputs/instances; never substitute Module/provider output.
const engine=new URL(import.meta.url).searchParams.get('engine');
if(!['chromium','firefox','webkit'].includes(engine))throw Error('AUDIT_ENGINE');
let serial=0;const sends=new Set(),moduleBytes=new WeakMap();
const send=data=>{const pending=(async()=>{const r=await fetch('/instance-audit/'+engine,{method:'POST',body:JSON.stringify(data)});if(!r.ok)throw Error('INSTANCE_AUDIT_WRITE');})();sends.add(pending);return pending;};
const OriginalModule=WebAssembly.Module;WebAssembly.Module=new Proxy(OriginalModule,{construct(target,args,newTarget){const bytes=args[0] instanceof ArrayBuffer?new Uint8Array(args[0]):new Uint8Array(args[0].buffer,args[0].byteOffset,args[0].byteLength);const result=Reflect.construct(target,args,newTarget);moduleBytes.set(result,bytes.slice());return result;}});
self.addEventListener('message',e=>{if(e.data?.type==='test-owned-audit-flush'){e.stopImmediatePropagation();Promise.all([...sends]).then(()=>e.ports[0].postMessage('ok'),()=>e.ports[0].postMessage('failed'));}});
const originalInstantiate=WebAssembly.instantiate;
WebAssembly.instantiate=async function(input,...args){
 const bytes=input instanceof ArrayBuffer?new Uint8Array(input):ArrayBuffer.isView(input)?new Uint8Array(input.buffer,input.byteOffset,input.byteLength):null;
 const inputHash=bytes?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join(''):null;
 const result=await originalInstantiate.call(this,input,...args);
 const instance=result instanceof WebAssembly.Instance?result:result.instance;
 await send({kind:'instantiate',serial:++serial,inputHash,inputBytes:bytes?.length??null,instance:instance instanceof WebAssembly.Instance,exports:WebAssembly.Module.exports(result.module??input).map(r=>({name:r.name,kind:r.kind})),imports:WebAssembly.Module.imports(result.module??input).map(r=>({module:r.module,name:r.name,kind:r.kind}))});return result;
};
const OriginalInstance=WebAssembly.Instance;
WebAssembly.Instance=new Proxy(OriginalInstance,{construct(target,args,newTarget){const result=Reflect.construct(target,args,newTarget);void send({kind:'constructor',serial:++serial,inputHash:null,inputBytes:moduleBytes.get(args[0])?.length??null,bytes:moduleBytes.get(args[0])?Array.from(moduleBytes.get(args[0])):null,instance:true,exports:WebAssembly.Module.exports(args[0]),imports:WebAssembly.Module.imports(args[0])});return result;}});
await import('../../src/core/engine-worker.mjs');

booting=false;self.removeEventListener('message',queue);for(const data of queued)self.dispatchEvent(new MessageEvent('message',{data}));
