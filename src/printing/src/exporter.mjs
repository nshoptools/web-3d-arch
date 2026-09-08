import {finalizeProjectPackage} from './vendor-package.mjs';
import {check, dataOnly, utf8, hashData, xmlText} from './contracts.mjs';
import {validateProfile,validateSchedule,validateMaterials,adapterAttachments} from './profiles.mjs';
import {inspect3MF} from './zip-inspect.mjs';
export const EXPORTER_VERSION='0.2.0';
function snapshot(request){
  check(request?.mesh?.vertices?.length<=3000000&&request.mesh.faces?.length<=6000000,'MESH_BUDGET');
  const r=structuredClone(request);
  check(r.schemaVersion===1&&r.purpose==='inspection','EXPORT_PURPOSE');
  check(typeof r.revision==='string'&&r.revision.length>0&&r.revision.length<=4096,'REVISION');
  check(r.mesh.state==='complete'&&r.mesh.revision===r.revision,'NO_SNAPSHOT_OR_STALE_REVISION');
  check(r.mesh.unit==='mm','MODEL_UNIT');
  check(!r.mesh.transform,'UNSUPPORTED_UNBAKED_TRANSFORM');
  const m=r.mesh;check(m.vertices.length%3===0&&m.faces.length%3===0,'MESH_ARRAY_SHAPE');
  check(m.facePartIds.length===m.faces.length/3&&Array.isArray(m.parts)&&m.parts.length>0&&m.parts.length<=128,'PART_COUNT');
  check(Array.from(m.vertices).every(x=>Number.isFinite(x)&&Math.abs(x)<=10000),'NONFINITE_OR_COORDINATE_BOUND');
  check(Array.from(m.faces).every(i=>Number.isInteger(i)&&i>=0&&i<m.vertices.length/3),'INDEX_BOUND');
  check(Array.isArray(r.sourceHashes)&&r.sourceHashes.length>0&&r.sourceHashes.length<=128,'SOURCE_HASH');
  for(const h of r.sourceHashes)check(typeof h.id==='string'&&/^[a-f0-9]{64}$/.test(h.sha256),'SOURCE_HASH');
  dataOnly(r.printerProfile);dataOnly(r.schedule);dataOnly(r.materialTable);
  return r;
}
function makeParts(mesh,table){
  const byId=new Map();
  for(const p of mesh.parts){
    xmlText(p.id);xmlText(p.name);check(p.id.length>0&&!byId.has(p.id)&&table.byId.has(p.materialId),'PART_MATERIAL_ID');
    byId.set(p.id,{...p,vertices:[],faces:[],lookup:new Map(),materialIndex:table.byId.get(p.materialId)});
  }
  for(let ti=0;ti<mesh.facePartIds.length;ti++){
    const p=byId.get(mesh.facePartIds[ti]);check(p,'PART_REFERENCE');
    for(let j=0;j<3;j++){
      const v=mesh.faces[3*ti+j];
      if(!p.lookup.has(v)){p.lookup.set(v,p.vertices.length/3);p.vertices.push(...mesh.vertices.slice(v*3,v*3+3));}
      p.faces.push(p.lookup.get(v));
    }
  }
  for(const p of byId.values())check(p.faces.length>=12,'EMPTY_PART');
  return [...byId.values()];
}
function nativeSession(module) {
  check(module._arch3mf_abi_version()===1,'ABI_VERSION');
  const context=module._arch3mf_create();check(context,'LIB3MF_CONTEXT');
  const buffers=new Set();
  const alloc=bytes=>{const ptr=module._malloc(bytes.length||1);check(ptr,'ALLOCATION');buffers.add(ptr);module.HEAPU8.set(bytes,ptr);return ptr;};
  const str=s=>alloc(utf8.encode(s+'\0'));
  const release=p=>{module._free(p);buffers.delete(p);};
  const errorText=()=>{const start=module._arch3mf_error(context);let end=start;while(end<module.HEAPU8.length&&end-start<4096&&module.HEAPU8[end])end++;return new TextDecoder().decode(new Uint8Array(module.HEAPU8.subarray(start,end)));};
  const invoke=(name,...args)=>{const v=module[name](context,...args);check(v>=0,'LIB3MF_TRANSACTION',v<0?errorText():'');return v;};
  return {context,str,alloc,release,invoke,close(){for(const p of buffers)module._free(p);module._arch3mf_destroy(context);}};
}
async function run(request,module,project) {
  // Copy before the first await; user changes cannot change an in-flight artifact.
  const r=snapshot(request);
  return runPrepared(r,module,project,table=>makeParts(r.mesh,table));
}
export async function runPrepared(r,module,project,buildParts) {
  const {profile,adapter,classification}=await validateProfile(r.printerProfile,r.printerProfile.payload.adapterId);
  const schedule=await validateSchedule(r.schedule,r.printerProfile);
  const table=validateMaterials(r.materialTable,profile),parts=buildParts(table);
  const session=nativeSession(module);
  try{
    for(const m of table.materials){const s=session.str(m.name);session.invoke('_arch3mf_add_material',s,parseInt(m.color.slice(1)+'FF',16));session.release(s);}
    const partInfo=[];
    for(const p of parts){
      let resourceId;
      if(p.appendNative)resourceId=p.appendNative(session);
      else {
        const name=session.str(p.name),v=new Float64Array(p.vertices),f=new Uint32Array(p.faces);
        const vp=session.alloc(new Uint8Array(v.buffer)),fp=session.alloc(new Uint8Array(f.buffer));
        resourceId=session.invoke('_arch3mf_add_part',name,vp,v.length/3,fp,f.length/3,p.materialIndex);
        session.release(name);session.release(vp);session.release(fp);
      }
      const material=table.materials[p.materialIndex];
      partInfo.push({id:p.id,name:p.name,resourceId,materialIndex:p.materialIndex,slot:material.slot,extruder:material.extruder});
    }
    const manifest={
      schemaVersion:1,exporterVersion:EXPORTER_VERSION,lib3mfVersion:'2.5.0',
      format:project?adapter.id:'3mf-core',adapterVersion:project?adapter.version:null,
      ...(r.kernelSnapshot?{kernelSnapshot:r.kernelSnapshot}:{}),
      revision:r.revision,profileId:profile.id,profileHash:r.printerProfile.sha256,
      scheduleHash:r.schedule.sha256,schedule,materialTableHash:await hashData(r.materialTable),
      materials:table.materials,materialAliases:table.aliases,sourceHashes:r.sourceHashes,parts:partInfo,
      qualification:{purpose:'inspection',selfIntersection:'unverified',interPartOverlap:'unverified',bedPlacement:'unverified',slicer:'unverified',physicalFit:'unverified'}
    };
    const addMeta=(ns,name,value)=>{const a=session.str(ns),b=session.str(name),c=session.str(value);session.invoke('_arch3mf_metadata',a,b,c);[a,b,c].forEach(session.release);};
    addMeta('','Application',project?adapter.application:'web-3d-arch lib3mf 2.5.0');
    // Vendor version metadata is owned by the adapter. No Core XML is handwritten.
    if(project)addMeta(adapter.namespace,'Version3mf','1');
    const attachments={'/Metadata/printing-manifest.json':JSON.stringify(manifest)};
    if(project)Object.assign(attachments,adapterAttachments(adapter,profile,schedule,table.materials,partInfo,module._arch3mf_assembly_id(session.context)));
    for(const [path,value] of Object.entries(attachments)){
      const pp=session.str(path),bytes=utf8.encode(value),bp=session.alloc(bytes);
      session.invoke('_arch3mf_attachment',pp,bp,bytes.length);session.release(pp);session.release(bp);
    }
    session.invoke('_arch3mf_finish');
    const length=module._arch3mf_size(session.context),ptr=module._arch3mf_bytes(session.context);
    check(length>0&&ptr,'NO_PARTIAL_OUTPUT');
    // Own JS copy: no live view into WASM memory escapes this function.
    let bytes=new Uint8Array(module.HEAPU8.subarray(ptr,ptr+length));
    if(project)bytes=finalizeProjectPackage(bytes,adapter);
    const readback=await inspect3MF(bytes,{adapterId:project?adapter.id:undefined,expectedManifest:manifest});
    const finalPtr=session.alloc(bytes);
    session.invoke('_arch3mf_validate_output',finalPtr,bytes.length);session.release(finalPtr);
    const report={schemaVersion:1,verdict:'unverified',purpose:'inspection',unit:'mm',
      checks:{lib3mfReadback:'pass',packageStructure:'pass',indicesAndFinite:'pass',perPartEdgeAndVertexManifold:'pass',positiveComponentVolume:'pass',
        materialReferences:'pass',scheduleReadback:project?'pass':'not-applicable',sourceHashSyntax:'pass',
        selfIntersection:'unverified',interPartIntersection:'unverified',bedPlacement:'unverified',slicer:'unverified',physicalFit:'unverified'},
      limits:{maxCoordinateMm:10000,floatConversionErrorMm:0.001,aggregateErrorBudget:'unverified'},
      warnings:['INSPECTION_ONLY','GEOMETRY_ORACLE_REQUIRED','SLICER_QUALIFICATION_REQUIRED','PHYSICAL_FIT_UNVERIFIED'],
      profileArrayClassification:classification};
    return {bytes,metadata:{mediaType:'model/3mf',formatVersion:'3MF Core 1.3 subset',sha256:readback.sha256,byteLength:bytes.length,manifest},report};
  }finally{session.close();}
}
export const export3MFCore=(request,module)=>run(request,module,false);
export const export3MFProject=(request,module)=>run(request,module,true);
