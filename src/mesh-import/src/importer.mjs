import {decodeOBJ,resolveOBJMaterials} from './obj.mjs';
import {check,ImportError,decodeSTL,UNITS} from './stl.mjs';

export {ImportError,UNITS};
const decoder=new TextDecoder('utf-8',{fatal:true}),encoder=new TextEncoder();
const clone=x=>structuredClone(x);
const hex=b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
export async function sha256(bytes){return hex(await crypto.subtle.digest('SHA-256',bytes));}
const gate=Object.freeze({sourceOriginal:'read-only',generatedParameters:'unapplied',physicalFit:'unverified'});
function provenance(input,hash){
 check(typeof input.sourceId==='string'&&input.sourceId.length>0&&encoder.encode(input.sourceId).length<=256&&!input.sourceId.includes('\0')&&input.sourceId.isWellFormed(),'SOURCE_ID');
 check(typeof input.name==='string'&&encoder.encode(input.name).length<=4096&&!input.name.includes('\0')&&input.name.isWellFormed(),'SOURCE_NAME');
 return {schemaVersion:1,sourceId:input.sourceId,name:input.name,format:input.format,sha256:hash,originalByteLength:input.bytes.length};
}
export function createMeshImporter(module,{enable3mfExtension=false}={}){
 check(module&&module._arch_abi_version?.()===2&&module._archmi_abi_version?.()===1,'UNIFIED_ABI_REQUIRED');
 check(typeof module._malloc==='function'&&typeof module._free==='function','UNIFIED_IMPORT_EXPORTS');
 const owners=new WeakMap();let busy=false;
 const heap=()=>module.HEAPU8;
 const error=()=>{const p=module._archmi_error()>>>0,h=heap();let end=p;while(end<h.length&&end-p<4096&&h[end])end++;return decoder.decode(h.slice(p,end));};
 function bytes(ptr,len){ptr>>>=0;len>>>=0;check(ptr>0&&ptr+len<=heap().length,'ABI_BUFFER_RANGE');return heap().slice(ptr,ptr+len);}
 function report(id){return JSON.parse(decoder.decode(bytes(module._archmi_report(id),module._archmi_report_len(id))));}
 function own(id,source,audit){
  const token=Object.freeze({kind:'mesh-import-owner/v1'});
  owners.set(token,{id,source:clone(source),audit:clone(audit),released:false});return token;
 }
 function record(token){const r=owners.get(token);check(r&&!r.released,'IMPORT_LEASE_RELEASED');return r;}
 function output(token){const r=record(token),native=report(r.id);
  return {handle:token,state:native.state,source:clone(r.source),report:{...native,sourceAudit:clone(r.audit)},sourceGate:{...gate}};
 }
 function temporary(length,callback){
  check(length>0&&length<=64_000_000,'ALLOCATION_BOUND');const p=module._malloc(length)>>>0;check(p,'ALLOCATION_FAILED');
  try{return callback(p);}finally{module._free(p);}
 }
 async function importBytes(input){
  check(!busy,'IMPORT_BUSY');busy=true;let id=0,original,source;
  try{
   check(input?.bytes instanceof Uint8Array&&input.bytes.length>0&&input.bytes.length<=64_000_000,'SOURCE_BYTE_BOUND');
   check(input.format==='stl'||input.format==='obj'||input.format==='3mf','IMPORT_FORMAT');
   original=Uint8Array.from(input.bytes);source=provenance({...input,bytes:original},await sha256(original));
   check(input.format!=='3mf'||enable3mfExtension===true,'IMPORT_3MF_DEFERRED_V1');
   const budget=input.maxErrorMm??.002;check(Number.isFinite(budget)&&budget>0&&budget<=.002,'ERROR_BUDGET');
   if((input.format==='stl'||input.format==='obj')&&!input.unit){
    return {state:'unit-choice-required',source,sourceGate:{...gate},proposal:{schemaVersion:1,kind:input.format+'-unit-choice',choices:Object.keys(UNITS)},copyOriginal:()=>original.slice()};
   }
   const audit={schemaVersion:1,sourceSha256:source.sha256};
   let stl,obj,packageEntries,parseXml;
   if(input.format==='stl'){
    check(Object.hasOwn(UNITS,input.unit),'STL_UNIT_REQUIRED');stl=decodeSTL(original);
    audit.decoder=stl.decoder;audit.encoding=stl.encoding;audit.normals='retained-in-original; geometry-winding-is-authoritative';
   }else if(input.format==='obj'){
    check(Object.hasOwn(UNITS,input.unit),'OBJ_UNIT_REQUIRED');const parsed=decodeOBJ(original);
    obj={...parsed,...resolveOBJMaterials(parsed,input)};
    audit.decoder=obj.decoder;audit.encoding=obj.encoding;audit.indexing=obj.indexing;
    audit.materialChoices=clone(obj.choices);audit.sourceMaterialNames=obj.materialNames;
    audit.libraryDirectives=obj.libraries;audit.declarations=obj.declarations;
    audit.attributes={uvCount:obj.uvCount,normalCount:obj.normalCount,referenceStyle:obj.referenceStyle,
      retention:'original-bytes; imported flat mesh uses positions/winding/materials'};
    audit.triangulation=obj.triangulation;
   }else{
    // Independent bounded ZIP implementation. No scripts, gcode or embedded resources run.
    const zip=await import("../../printing/src/zip-inspect.mjs");parseXml=zip.parseXml;
    const entries=packageEntries=zip.readZip(original);audit.entries=[];
    for(const [path,value] of entries)audit.entries.push({path,byteLength:value.length,sha256:await sha256(value)});
   }
   id=module._archmi_begin(original.length)>>>0;check(id,error()||'IMPORT_BEGIN');
   const labels=[encoder.encode(source.sourceId+'\0'),encoder.encode(source.name+'\0')];
   temporary(labels[0].length+labels[1].length,ptr=>{
    heap().set(labels[0],ptr);heap().set(labels[1],ptr+labels[0].length);
    check(module._archmi_set_provenance(id,ptr,ptr+labels[0].length)===0,error());
   });
   const p=module._archmi_source_ptr(id)>>>0;check(p&&p+original.length<=heap().length,'ABI_BUFFER_RANGE');heap().set(original,p);
   if(stl){
    const table=input.materials??[],assignments=input.partMaterialIds??[];
    check(Array.isArray(table)&&table.length<=16&&Array.isArray(assignments),'STL_MATERIAL_TABLE');
    check(assignments.length===0||assignments.length===stl.groups.length,'STL_MATERIAL_MAPPING');
    const materials=new Map();
    for(const m of table){
     check(m&&typeof m.id==='string'&&m.id.length>0&&m.id.length<=256&&!m.id.includes('\0')&&!materials.has(m.id),'MATERIAL_ID');
     check(typeof m.name==='string'&&m.name.length<=256&&!m.name.includes('\0')&&Number.isInteger(m.rgba)&&m.rgba>=0&&m.rgba<=0xffffffff,'MATERIAL_VALUE');
     materials.set(m.id,m);
    }
    audit.materialChoices=clone({materials:table,partMaterialIds:assignments});
    const [unit,scale]=UNITS[input.unit];
    for(let i=0;i<stl.groups.length;i++){
     const g=stl.groups[i],m=assignments.length?materials.get(assignments[i]):null;
     check(assignments.length===0||m,'STL_MATERIAL_REFERENCE');
     const names=[g.name,m?.id??'',m?.name??''].map(s=>encoder.encode(s+'\0'));
     const coords=Float64Array.from(stl.positions.subarray(g.start*3,(g.start+g.count)*3));
     temporary(coords.byteLength+names.reduce((n,s)=>n+s.length,0),ptr=>{
      heap().set(new Uint8Array(coords.buffer),ptr);let at=ptr+coords.byteLength;const strings=[];
      for(const text of names){strings.push(at);heap().set(text,at);at+=text.length;}
      const result=module._archmi_stage_stl(id,ptr,g.count/3,unit,m?.rgba??0,m?1:0,...strings,stl.conversionError*scale);
      check(result===0,error());
     });
    }
    module._archmi_validate(id,budget);
   }else if(obj){
    function strings(values,fn){
     const encoded=values.map(s=>encoder.encode(s+'\0'));
     return temporary(encoded.reduce((n,b)=>n+b.length,0),ptr=>{
      let at=ptr;const addresses=encoded.map(b=>{const value=at;heap().set(b,at);at+=b.length;return value;});return fn(...addresses);
     });
    }
    for(let i=0;i<obj.table.length;i++){
     const m=obj.table[i];strings([m.id,m.name],(mid,name)=>check(module._archmi_add_material(id,i,mid,name,m.rgba)===0,error()));
    }
    for(let i=0;i<obj.materialNames.length;i++)strings([obj.materialNames[i]??''],name=>check(module._archmi_obj_source_material(id,i,name)===0,error()));
    for(const library of obj.libraries)strings([library],name=>check(module._archmi_obj_library(id,name)===0,error()));
    const [unit,scale]=UNITS[input.unit];
    for(const p of obj.parts){
     const arrays=[p.vertices,p.triangles,p.faceMaterialIds,p.sourceVertexIndices,p.sourceFaceIndices,p.sourceMaterialRefs];
     const name=encoder.encode(p.name+'\0'),length=arrays.reduce((n,a)=>n+a.byteLength,0);
     temporary(length+name.length,ptr=>{
      let at=ptr;const addresses=arrays.map(a=>{const value=at;heap().set(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),at);at+=a.byteLength;return value;});
      heap().set(name,at);
      check(module._archmi_stage_obj(id,addresses[0],p.vertices.length/3,addresses[1],p.triangles.length/3,...addresses.slice(2),unit,at,obj.conversionError*scale)===0,error());
     });
    }
    module._archmi_validate(id,budget);
   }else{
    module._archmi_decode_3mf(id,budget);
    const native=report(id);
    if(native.state!=='rejected'){
     // Native streaming guard runs before DOM construction to bound depth and grammar.
     const entries=packageEntries,doc=parseXml(entries.get(native.sourceModelPath));
     audit.originalModelAttributes=Array.from(doc.documentElement.attributes,a=>({name:a.name,namespace:a.namespaceURI,value:a.value}));
     audit.properties=[];
     for(const node of Array.from(doc.getElementsByTagName('*'))){
      if(['base','color','object','component','item','build'].includes(node.localName)){
       // Only property-bearing geometry attributes; original bytes retain every face and source tag.
       const attrs=Array.from(node.attributes,a=>({name:a.name,namespace:a.namespaceURI,value:a.value}));
       if(node.localName!=='triangle'||attrs.some(a=>['pid','p1','p2','p3'].includes(a.name))){
        check(audit.properties.length<33_024,'PROPERTY_AUDIT_BOUND');
        audit.properties.push({element:node.localName,attributes:attrs});
       }
      }
     }
    }
   }
   const token=own(id,source,audit);id=0;return output(token);
  }catch(e){
   if(id){module._archmi_release(id);id=0;}
   if(!original||!source)throw e;
   return {state:'rejected',source,sourceGate:{...gate},report:{schemaVersion:1,state:'rejected',diagnostic:e.code||e.message,parse:'rejected'},copyOriginal:()=>original.slice()};
  }finally{busy=false;}
 }
 return Object.freeze({
  importBytes,
  inspect:output,
  acquire(token){const r=record(token);check(module._archmi_acquire(r.id)===1,'IMPORT_LEASE_LIMIT');return own(r.id,r.source,r.audit);},
  release(token){const r=record(token);check(module._archmi_release(r.id)===1,'IMPORT_LEASE_RELEASED');r.released=true;},
  copyOriginal(token,sourceIndex=0){const r=record(token);check(Number.isInteger(sourceIndex)&&sourceIndex>=0&&sourceIndex<module._archmi_source_count(r.id),"SOURCE_INDEX");return bytes(module._archmi_source_at_ptr(r.id,sourceIndex),module._archmi_source_at_len(r.id,sourceIndex));},
  copyMesh(token){
   const r=record(token),id=r.id,nv=module._archmi_vertex_count(id),nf=module._archmi_face_count(id),np=module._archmi_part_count(id);
   const copy=(fn,length,T)=>length?new T(bytes(fn(id),length*T.BYTES_PER_ELEMENT).buffer):new T();
   return {vertices:copy(module._archmi_vertices,nv*3,Float64Array),triangles:copy(module._archmi_triangles,nf*3,Uint32Array),
    faceMaterialIds:copy(module._archmi_face_materials,nf,Uint32Array),
    sourceVertexIndices:copy(module._archmi_source_vertex_indices,module._archmi_source_vertex_index_count(id),Uint32Array),
    sourceFaceIndices:copy(module._archmi_source_face_indices,module._archmi_source_face_index_count(id),Uint32Array),
    sourceMaterialRefs:copy(module._archmi_source_material_refs,module._archmi_source_face_index_count(id),Uint32Array),
    parts:np?bytes(module._archmi_parts(id),np*40):new Uint8Array(),partStride:40,partCount:np,unit:'millimeter'};
  },
  // Trusted synchronous same-Module package adapter only. It borrows the
  // existing importer lease; callbacks must not reenter or release operands.
  withNativeHandle(token,callback){
   const r=record(token);check(typeof callback==='function','IMPORT_NATIVE_CALLBACK');
   const value=callback(module,r.id,clone(r.source),clone(r.audit));
   check(!value||typeof value.then!=='function','IMPORT_NATIVE_CALLBACK_MUST_BE_SYNCHRONOUS');
   return value;
  },
  publish(token,generation){
   check(typeof module._arch_import_publish==='function','ROOT_IMPORT_PUBLICATION_NOT_INTEGRATED');
   const r=record(token);check(Number.isInteger(generation)&&generation>0&&generation<=0xffffffff,'GENERATION');
   const id=module._arch_import_publish(r.id,generation)>>>0;
   check(id,'IMPORT_PUBLISH_FAILED');
   // Success already owns ONE primary ARCH/1 lease; do not acquire here.
   return Object.freeze({snapshotId:id,lease:'primary',abi:'ARCH/1',source:clone(r.source)});
  },
  proposeBoolean(target,tool,{operation,acknowledgeTargetMaterial,expectedRevision,maxErrorMm=.002}){
   const a=record(target),b=record(tool);
   check((operation==='union'||operation==='subtract')&&acknowledgeTargetMaterial===true,'CSG_EXPLICIT_TARGET_MATERIAL_REQUIRED');
   check(Number.isSafeInteger(expectedRevision)&&expectedRevision>=0,'TRANSACTION_REVISION');
   const id=module._archmi_boolean(a.id,b.id,operation==='union'?0:1,1,maxErrorMm)>>>0;check(id,error());
   const transaction={schemaVersion:1,kind:'analytic-axial-box-csg/v1',expectedRevision,operation,acknowledgeTargetMaterial:true,operands:[a.source,b.source]};
   const token=own(id,a.source,{transaction});
   return {schemaVersion:1,kind:'mesh-boolean-proposal',expectedRevision,candidate:output(token),committed:false};
  },
  proposeTransform(token,{matrix,maxErrorMm=.002,expectedRevision}){
   const r=record(token);check(Array.isArray(matrix)&&matrix.length===12&&matrix.every(Number.isFinite),'TRANSFORM_MATRIX');
   check(Number.isSafeInteger(expectedRevision)&&expectedRevision>=0,'TRANSACTION_REVISION');
   const values=new Float64Array(matrix);
   const id=temporary(96,p=>{heap().set(new Uint8Array(values.buffer),p);return module._archmi_transform(r.id,p,maxErrorMm)>>>0;});
   check(id,error());
   const candidate=own(id,r.source,{...r.audit,transaction:{schemaVersion:1,kind:'affine/v1',expectedRevision,matrix:[...matrix],sourceSha256:r.source.sha256}});
   return {schemaVersion:1,kind:'mesh-transform-proposal',expectedRevision,before:output(token),candidate:output(candidate),committed:false};
  }
 });
}
