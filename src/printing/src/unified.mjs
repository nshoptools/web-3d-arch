import {check,dataOnly,xmlText} from './contracts.mjs';
import {runPrepared} from './exporter.mjs';

function snapshotInfo(module,id,generation){
 const ptr=module._arch_snapshot_ptr(id),length=module._arch_snapshot_len(id);
 check(ptr&&length>=128&&length<=256*1024*1024,'SNAPSHOT_LEASE_INVALID');
 check(ptr+length<=module.HEAPU8.byteLength,'SNAPSHOT_HEAP_RANGE');
 const d=new DataView(module.HEAPU8.buffer,ptr,length),u=o=>d.getUint32(o,true);
 check(u(0)===0x48435241&&u(4)===1&&u(8)===128&&u(12)===length,'SNAPSHOT_FORMAT');
 check(generation>0&&generation<0xffffffff&&u(16)===generation,'SNAPSHOT_GENERATION');
 const nv=u(20),nf=u(24),np=u(28),vo=u(48),fo=u(52),po=u(56);
 check(nv>0&&nv<=1000000&&nf>0&&nf<=2000000&&np>0&&np<=128,'MESH_BUDGET');
 check(vo>=128&&vo%8===0&&fo%4===0&&po%8===0&&vo+nv*24<=fo&&fo+nf*12<=po&&po+np*40<=length,'SNAPSHOT_LAYOUT');
 const parts=[];
 for(let i=0;i<np;i++){
  const o=po+i*40,vs=u(o),vc=u(o+4),ts=u(o+8),tc=u(o+12);
  check(vc>=4&&tc>=4&&vs+vc<=nv&&ts+tc<=nf,'SNAPSHOT_PART_RANGE');
  parts.push({partIndex:i,colorRgba:u(o+16),sourceIndex:u(o+20),vertexCount:vc,faceCount:tc});
 }
 return {runtimeABI:2,format:'ARCH/1',generation,vertexCount:nv,faceCount:nf,byteLength:length,parts};
}

const bindings=new WeakMap();

/** Bind to the injected, already initialized kernel Module. Never creates WASM. */
export function createUnifiedPrinting(module){
 if(bindings.has(module))return bindings.get(module);
 check(module?._arch_abi_version?.()===2&&module._arch3mf_abi_version?.()===1&&module._arch3mf_kernel_abi_version?.()===2,'UNIFIED_ABI_MISMATCH');
 check(typeof module._arch3mf_add_snapshot_part==='function'&&module.HEAPU8?.buffer instanceof SharedArrayBuffer,'UNIFIED_HEAP_REQUIRED');
 const tokens=new WeakMap(),liveIds=new Map();let busy=false;
 function adoptPrimaryLease(id,generation){
  check(Number.isSafeInteger(id)&&id>0&&id<0xffffffff,'SNAPSHOT_HANDLE');
  for(const [old,record] of liveIds)if(record.state==='released'&&!module._arch_snapshot_ptr(old))liveIds.delete(old);
  check(!liveIds.has(id),'PRIMARY_LEASE_ALREADY_ADOPTED');
  const info=snapshotInfo(module,id,generation);
  const token=Object.freeze({id,generation,byteLength:info.byteLength});
  const record={id,generation,state:'ready',info,kind:'primary'};tokens.set(token,record);liveIds.set(id,record);
  return token;
 }
 function acquireReaderLease(id,generation){
  const info=snapshotInfo(module,id,generation);
  check(module._arch_snapshot_acquire(id)>0,'SNAPSHOT_ACQUIRE_FAILED');
  const token=Object.freeze({id,generation,byteLength:info.byteLength});
  tokens.set(token,{id,generation,state:'ready',info,kind:'reader'});
  return token;
 }
 function owned(token){
  const record=tokens.get(token);check(record,'FOREIGN_LEASE');return record;
 }
 function finish(record){
  check(record.state!=='released','LEASE_ALREADY_CONSUMED');
  record.state='released';
  check(module._arch_snapshot_release(record.id)===1,'SNAPSHOT_RELEASE_FAILED');
  if(!module._arch_snapshot_ptr(record.id))liveIds.delete(record.id);
 }
 function releaseLease(token){
  const record=owned(token);check(record.state==='ready','LEASE_ALREADY_CONSUMED');finish(record);
 }
 async function exportSnapshot3MF(token,request,{format='core'}={}){
  const record=owned(token);check(record.state==='ready','LEASE_ALREADY_CONSUMED');
  record.state='exporting';let locked=false;
  try{
   check(!busy,'PRINTING_BUSY');busy=true;locked=true;
   // Only small metadata is cloned. Packed mesh remains in the same leased heap.
   dataOnly(request);const r=structuredClone(request);
   check(r.schemaVersion===1&&r.purpose==='inspection','EXPORT_PURPOSE');
   check(typeof r.revision==='string'&&r.revision.length>0&&r.revision.length<=4096,'REVISION');
   check(format==='core'||format==='project','EXPORT_FORMAT');
   const info=snapshotInfo(module,record.id,record.generation);
   check(Array.isArray(r.parts)&&r.parts.length===info.parts.length,'PART_COUNT');
   check(Array.isArray(r.sourceHashes)&&r.sourceHashes.length>0&&r.sourceHashes.length<=128,'SOURCE_HASH');
   for(const h of r.sourceHashes)check(typeof h.id==='string'&&/^[a-f0-9]{64}$/.test(h.sha256),'SOURCE_HASH');
   r.kernelSnapshot={runtimeABI:2,format:'ARCH/1',generation:record.generation,vertexCount:info.vertexCount,faceCount:info.faceCount};
   return await runPrepared(r,module,format==='project',table=>{
    const seen=new Set(),ids=new Set();
    return r.parts.map(p=>{
     xmlText(p.id);xmlText(p.name);
     check(p.id.length>0&&!ids.has(p.id)&&Number.isInteger(p.partIndex)&&p.partIndex>=0&&p.partIndex<info.parts.length&&!seen.has(p.partIndex),'SNAPSHOT_PART_MAPPING');
     ids.add(p.id);seen.add(p.partIndex);
     const materialIndex=table.byId.get(p.materialId);check(materialIndex!==undefined,'PART_MATERIAL_ID');
     const material=table.materials[materialIndex];
     check(parseInt(material.color.slice(1)+'FF',16)===info.parts[p.partIndex].colorRgba,'SNAPSHOT_MATERIAL_COLOR');
     return {...p,materialIndex,appendNative(session){
      const name=session.str(p.name);
      try{return session.invoke('_arch3mf_add_snapshot_part',record.id,record.generation,p.partIndex,name,materialIndex);}
      finally{session.release(name);}
     }};
    });
   });
  }finally{if(locked)busy=false;finish(record);}
 }
 const binding=Object.freeze({adoptPrimaryLease,acquireReaderLease,releaseLease,exportSnapshot3MF,describeLease(token){const r=owned(token);check(r.state==='ready','LEASE_ALREADY_CONSUMED');return structuredClone(r.info);}});
 bindings.set(module,binding);return binding;
}
