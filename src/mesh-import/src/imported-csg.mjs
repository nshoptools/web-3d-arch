// Trusted serial Worker adapter. Inject the existing ABI2 Module; this file
// never instantiates WASM, publishes a root snapshot, or approves final gates.
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const need=(v,c)=>{if(!v)throw Object.assign(new Error(c),{code:c});};
const u32=x=>{need(Number.isInteger(x)&&x>=0&&x<=0xffffffff,'CSG_U32');return x;};
const u64=x=>{need(typeof x==='bigint'||typeof x==='string'&&/^(0|[1-9][0-9]*)$/.test(x),'CSG_EXACT_U64');const n=BigInt(x);need(n>=0n&&n<=0xffffffffffffffffn,'CSG_U64');return n;};
const stringify=o=>JSON.stringify(o,(_,x)=>typeof x==='bigint'?x.toString():x);
const hex=b=>Array.from(new Uint8Array(b),n=>n.toString(16).padStart(2,'0')).join('');
export function createImportedCSG(module){
 need(module?._arch_abi_version?.()===2&&module?._archcsg_abi_version?.()===1,'CSG_SAME_MODULE_ABI');
 need(typeof module.addFunction==='function'&&typeof module.removeFunction==='function','CSG_CALLBACK_EXPORTS');
 const owners=new WeakMap();let busy=false;
 const heap=()=>module.HEAPU8,dv=()=>new DataView(heap().buffer);
 const layout=(t,n)=>Array.from({length:n},(_,i)=>module._archcsg_layout(t,i)>>>0);
 const R=layout(0,27),V=layout(1,17),C=layout(2,5);
 need(R.every(x=>x<256)&&V.every(x=>x<256)&&C.every(x=>x<64),'CSG_LAYOUT');
 function bytes(p,n){p>>>=0;n>>>=0;need((p>0||n===0)&&p+n<=heap().length,'CSG_BUFFER');return heap().slice(p,p+n);}
 function view(id,fn){
  const p=module._malloc(V[0])>>>0;need(p,'CSG_ALLOC');
  try{
   need(module._archcsg_view(id,p)===1,'CSG_RESULT_LEASE');
   const d=dv(),u=i=>d.getUint32(p+V[i],true);
   return fn(u);
  }finally{module._free(p);}
 }
 function record(token){const r=owners.get(token);need(r&&!r.released,'CSG_RESULT_LEASE');return r;}
 function own(id){const token=Object.freeze({kind:'imported-csg-proposal/v1'});owners.set(token,{id,released:false});return token;}
 function inspect(token){return view(record(token).id,u=>({verdict:u(2),requiresFinalGates:u(3)===1,report:JSON.parse(decoder.decode(bytes(u(13),u(14))))}));}
 async function preview(input){
  need(!busy,'CSG_BUSY');busy=true;
  let block=0,callbacks=[],id=0;
  try{
   need(input&&typeof input.getHead==='function'&&typeof input.cancelled==='function','CSG_HEAD_CONTROL_REQUIRED');
   need(input.importer&&typeof input.importer.withNativeHandle==='function','CSG_IMPORT_OWNER_REQUIRED');
   const generation=u32(input.generation),revision=u64(input.revision),feature=u64(input.featureId);
   const current=()=>{try{const h=input.getHead();return h.generation===generation&&u64(h.revision)===revision;}catch{return false;}};
   const cancelled=()=>{try{return input.cancelled()===true;}catch{return true;}};
   need(current()&&!cancelled(),'CSG_STALE_OR_CANCELLED');
   const snapshot=u32(input.snapshotId),ptr=module._arch_snapshot_ptr(snapshot)>>>0,len=module._arch_snapshot_len(snapshot)>>>0;
   need(ptr&&len>=128,'CSG_ROOT_LEASE_REQUIRED');
   // Exactly one temporary host copy is needed by WebCrypto (shared heap
   // buffers are not accepted). Mesh arrays stay in the same native heap.
   const archHash=hex(await crypto.subtle.digest('SHA-256',bytes(ptr,len)));
   need(current()&&!cancelled()&&module._arch_snapshot_ptr(snapshot)>>>0===ptr&&module._arch_snapshot_len(snapshot)>>>0===len,'CSG_STALE_ROOT_LEASE');
   return input.importer.withNativeHandle(input.importHandle,(importModule,importId,source,audit)=>{
    need(importModule===module,'CSG_CROSSED_MODULE');
    const bindings=input.bindings,materials=input.materials,targets=input.targets,transform=input.transform;
    need(Array.isArray(bindings)&&bindings.length>0&&bindings.length<=128&&Array.isArray(materials)&&materials.length>0&&materials.length<=16,'CSG_BINDINGS');
    need(Array.isArray(targets)&&(input.operation==='import-as-part'?targets.length===0:targets.length>0&&targets.length<=bindings.length)&&Array.isArray(transform)&&transform.length===12&&transform.every(Number.isFinite),'CSG_TARGET_TRANSFORM');
    need(typeof input.moduleSessionId==='string'&&input.moduleSessionId.length>=16&&input.moduleSessionId.length<=128,'CSG_MODULE_SESSION_ID');
    const provenance=encoder.encode(stringify({schemaVersion:1,moduleSessionId:input.moduleSessionId,generatedArchSha256:archHash,
     generatedSource:input.generatedSource,importedSource:source,importedSourceAudit:audit,
     approvalStatus:'parent-authoritative-exact-check-required',context:input.provenance??{}}));
    need(provenance.length<=65536,'CSG_PROVENANCE_BOUND');
    let size=0;const allocate=n=>{size=(size+7)&~7;const p=size;size+=n;return p;};
    const req=allocate(R[0]),bp=allocate(bindings.length*32),mp=allocate(materials.length*16),tp=allocate(targets.length*8),
     xp=allocate(96),pp=allocate(provenance.length),cp=allocate(C[0]);
    block=module._malloc(size)>>>0;need(block,'CSG_ALLOC');heap().fill(0,block,block+size);const d=dv();
    const ru=(i,x)=>d.setUint32(block+req+R[i],u32(x),true),rq=(i,x)=>d.setBigUint64(block+req+R[i],u64(x),true);
    bindings.forEach((b,i)=>{const p=block+bp+i*32;[b.semanticId,b.sourceId,b.provenanceId].forEach((x,j)=>d.setBigUint64(p+j*8,u64(x),true));d.setUint32(p+24,u32(b.sourceIndex),true);d.setUint32(p+28,u32(b.materialIndex),true);});
    materials.forEach((m,i)=>{const p=block+mp+i*16;d.setBigUint64(p,u64(m.materialId),true);d.setUint32(p+8,u32(m.rgba),true);d.setUint32(p+12,u32(m.slot),true);});
    targets.forEach((t,i)=>d.setBigUint64(block+tp+i*8,u64(t),true));transform.forEach((x,i)=>d.setFloat64(block+xp+i*8,x,true));heap().set(provenance,block+pp);
    const operation={union:0,difference:1,intersection:2,'import-as-part':3}[input.operation];
    const policy={requireDisjointMaterials:0,keepSelectedTargetMaterial:1}[input.materialPolicy];
    need(operation!==undefined&&policy!==undefined,'CSG_EXPLICIT_OPERATION_POLICY');
    [[1,1],[2,operation],[3,policy],[4,generation],[7,snapshot],[8,d.getUint32(ptr+16,true)],[9,importId],[10,0],[11,ptr],[12,len],
     [13,bindings.length],[14,block+bp],[15,block+mp],[16,materials.length],[17,targets.length],[18,block+tp],[19,block+xp],
     [21,input.limits?.vertices??1000000],[22,input.limits?.triangles??400000],[23,input.limits?.parts??128],[24,input.limits?.work??2000000],[25,block+pp],[26,provenance.length]].forEach(([i,x])=>ru(i,x));
    rq(5,revision);rq(6,feature);d.setFloat64(block+req+R[20],input.queryToleranceCeilingMm??.002,true);
    callbacks.push(module.addFunction((_,g,rev)=>current()&&g===generation&&BigInt.asUintN(64,rev)===revision?1:0,'iiij'));
    callbacks.push(module.addFunction(()=>cancelled()?1:0,'ii'));
    dv().setUint32(block+cp+C[2],callbacks[0],true);dv().setUint32(block+cp+C[3],callbacks[1],true);
    id=module._archcsg_compute(block+req,block+cp)>>>0;need(id,'CSG_COMPUTE_FAILED');
    const token=own(id);try{const inspected=inspect(token);id=0;return {handle:token,...inspected};}catch(e){record(token).released=true;throw e;}
   });
  }finally{
   if(id)module._archcsg_release(id);for(const fn of callbacks)module.removeFunction(fn);
   if(block)module._free(block);busy=false;
  }
 }
 return Object.freeze({
  preview,inspect,
  // Trusted synchronous root staging only; one borrowed result primary.
  // The callback MUST NOT publish, reenter this adapter, or retain raw pointers.
  withNativeHandle(token,callback){
   need(!busy&&typeof callback==='function'&&callback.constructor.name!=='AsyncFunction','CSG_SYNCHRONOUS_BORROW_REQUIRED');
   const id=record(token).id;busy=true;
   try{const value=callback(module,id);need(!value||typeof value.then!=='function','CSG_SYNCHRONOUS_BORROW_REQUIRED');return value;}
   finally{busy=false;}
  },
  copyMesh(token){return view(record(token).id,u=>({
   vertices:new Float64Array(bytes(u(5),u(9)*24).buffer),triangles:new Uint32Array(bytes(u(6),u(10)*12).buffer),
   parts:bytes(u(7),u(11)*40),faceOrigins:new Uint32Array(bytes(u(8),u(12)*16).buffer),partStride:40,unit:'millimeter'
  }));},
  copyConfirmation(token){return view(record(token).id,u=>bytes(u(15),u(16)));},
  copyOriginal(token,index=0){const id=record(token).id;u32(index);need(index<module._archcsg_source_count(id),'CSG_SOURCE_INDEX');return bytes(module._archcsg_source_ptr(id,index),module._archcsg_source_len(id,index));},
  copyOBJFaceMap(token){const id=record(token).id,n=module._archcsg_import_source_face_count(id)>>>0;return new Uint32Array(bytes(module._archcsg_import_source_faces(id),n*4).buffer);},
  matches(token,descriptor,{generation,revision}){
   need(descriptor instanceof Uint8Array&&descriptor.length>0&&descriptor.length<=131072,'CSG_CONFIRMATION');
   const p=module._malloc(descriptor.length)>>>0;need(p,'CSG_ALLOC');try{heap().set(descriptor,p);return module._archcsg_confirmation_matches(record(token).id,p,descriptor.length,u32(generation),u64(revision))===1;}finally{module._free(p);}
  },
  acquire(token){const id=record(token).id;need(module._archcsg_acquire(id)===1,'CSG_LEASE_LIMIT');return own(id);},
  release(token){const r=record(token);need(!busy&&module._archcsg_release(r.id)===1,'CSG_LEASE_RELEASE');r.released=true;}
 });
}
