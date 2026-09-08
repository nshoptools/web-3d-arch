import {encodeFinalExportOptions} from './runtime-helper.mjs';
const fail=code=>{throw Object.assign(Error(code),{code});};
const uint=(v,min,max,code)=>{if(!Number.isInteger(v)||v<min||v>max)fail(code);return v;};
const keys=(o,list,code)=>{if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).length!==list.length||list.some(k=>!Object.hasOwn(o,k)))fail(code);};
const hash=v=>{if(typeof v!=='string'||!/^[0-9a-f]{64}$/.test(v))fail('FLOAT_CONFIRM_HASH');return Uint8Array.from(v.match(/../g),x=>parseInt(x,16));};
export function encodeFinalFloatPrepare(options,conditioning){
 keys(conditioning,['version','maximumDisplacementMm','workLimit'],'FLOAT_CONDITIONING_OPTIONS');
 if(conditioning.version!==1||typeof conditioning.maximumDisplacementMm!=='number'||!Number.isFinite(conditioning.maximumDisplacementMm)||conditioning.maximumDisplacementMm<=0||conditioning.maximumDisplacementMm>0.004)fail('FLOAT_CONDITIONING_OPTIONS');
 uint(conditioning.workLimit,1,1_000_000_000,'FLOAT_CONDITIONING_OPTIONS');
 const afex=encodeFinalExportOptions(options),out=new Uint8Array(64+afex.length),d=new DataView(out.buffer);
 [0x50434641,1,64,out.length,afex.length].forEach((v,i)=>d.setUint32(4*i,v,true));
 d.setFloat64(32,conditioning.maximumDisplacementMm,true);d.setBigUint64(40,BigInt(conditioning.workLimit),true);out.set(afex,64);return out;
}
export function encodeFinalFloatConfirmation(c){
 keys(c,['version','proposalHash','sourceHash','sourceGeneration','sourceRevision','optionsHash'],'FLOAT_CONFIRM_DESCRIPTOR');
 if(c.version!=='arch-final-float-confirmation/1'||typeof c.sourceRevision!=='string'||!/^[1-9][0-9]*$/.test(c.sourceRevision)||c.sourceRevision.length>20||BigInt(c.sourceRevision)>0xffffffffffffffffn)fail('FLOAT_CONFIRM_DESCRIPTOR');
 const out=new Uint8Array(128),d=new DataView(out.buffer);[0x43434641,1,128,0,uint(c.sourceGeneration,1,0xfffffffe,'FLOAT_CONFIRM_GENERATION')].forEach((v,i)=>d.setUint32(4*i,v,true));
 d.setBigUint64(24,BigInt(c.sourceRevision),true);out.set(hash(c.sourceHash),32);out.set(hash(c.proposalHash),64);out.set(hash(c.optionsHash),96);return out;
}
function range(M,p,n,align,max){
 if(!Number.isInteger(p)||!Number.isInteger(n)||p<1||n<0||n>max||p%align||n%align||p+n>M.HEAPU8.byteLength)fail('FLOAT_BUFFER_ABI');return {byteOffset:p,byteLength:n};
}
function invoke(M,method,id,bytes,generation){
 if(M._arch_abi_version()!==2||(method==='_arch_final_scene_geometry'?M._arch_final_scene_geometry_version?.():M._arch_final_float_version?.())!==1)fail('FLOAT_RUNTIME_ABI');
 uint(id,1,0xfffffffe,'FLOAT_HANDLE');uint(generation,1,0xfffffffe,'GENERATION_RANGE');
 if(!(bytes instanceof Uint8Array)||bytes.byteLength>128*1024)fail('FLOAT_INPUT_BYTES');
 const input=M._arch_input_create(bytes.byteLength);if(!input)fail('FLOAT_INPUT_RESOURCE_LIMIT');let consumed=false;
 try{const p=M._arch_input_ptr(input);range(M,p,bytes.byteLength,1,128*1024);M.HEAPU8.set(bytes,p);consumed=true;const output=M[method](id,input,generation);if(!output){const p=M._arch_error_ptr(),n=M._arch_error_len();range(M,p,n,1,512);fail(new TextDecoder().decode(M.HEAPU8.slice(p,p+n))||'FLOAT_RUNTIME_FAILURE');}return output;}
 finally{if(!consumed)M._arch_input_release(input);}
}
export function prepareFinalFloat(M,snapshot,request,conditioning,generation){
 const id=invoke(M,'_arch_final_float_prepare',snapshot,encodeFinalFloatPrepare(request,conditioning),generation);let returned=false;
 try{
  const p=M._arch_final_float_buffer_ptr(id,9),n=M._arch_final_float_buffer_len(id,9);range(M,p,n,1,65536);
  const metadata=JSON.parse(new TextDecoder().decode(M.HEAPU8.slice(p,p+n)));
  if(metadata.version!=='arch-final-float-proposal/1')fail('FLOAT_METADATA_ABI');encodeFinalFloatConfirmation(metadata.confirmation);
  const buffers=Array.from({length:8},(_,i)=>{const kind=i+1,align=kind===1||kind===3?8:4;return {kind,...range(M,M._arch_final_float_buffer_ptr(id,kind),M._arch_final_float_buffer_len(id,kind),align,4*1024*1024)};});
  returned=true;return {id,metadata,buffers};
 }finally{if(!returned)M._arch_final_float_release(id);}
}
export function confirmFinalFloat(M,proposal,confirmation,generation){
 const id=invoke(M,'_arch_final_float_confirm',proposal,encodeFinalFloatConfirmation(confirmation),generation);
 try{const p=M._arch_final_output_ptr(id),n=M._arch_final_output_len(id);range(M,p,n,1,128*1024*1024);const bytes=M.HEAPU8.slice(p,p+n);
  const mp=M._arch_final_output_metadata_ptr(id),mn=M._arch_final_output_metadata_len(id);range(M,mp,mn,1,2*1024*1024);const metadata=JSON.parse(new TextDecoder().decode(M.HEAPU8.slice(mp,mp+mn)));return {bytes,metadata};
 }finally{M._arch_final_output_release(id);}
}

export function encodeFinalSceneGeometry(c,generation){
 keys(c,['revision','expectedRevision','mapping'],'FINAL_GEOMETRY_OPTIONS');
 const rev=v=>{if(typeof v!=='string'||!/^[1-9][0-9]*$/.test(v)||v.length>20||BigInt(v)>0xffffffffffffffffn)fail('FINAL_GEOMETRY_REVISION');return BigInt(v);};
 if(!Array.isArray(c.mapping)||!c.mapping.length||c.mapping.length>4096)fail('FINAL_GEOMETRY_MAPPING');
 const b=new Uint8Array(64+c.mapping.length*24),d=new DataView(b.buffer);
 [0x4d474641,1,64,b.length,c.mapping.length,uint(generation,1,0xfffffffe,'SNAPSHOT_GENERATION')].forEach((v,i)=>d.setUint32(4*i,v,true));d.setBigUint64(24,rev(c.revision),true);d.setBigUint64(32,rev(c.expectedRevision),true);
 c.mapping.forEach((m,i)=>{keys(m,['part','slot','rgba','source','materialSource'],'FINAL_GEOMETRY_MAPPING');[m.part,m.slot,m.rgba,m.source,m.materialSource,0].forEach((v,j)=>d.setUint32(64+24*i+4*j,uint(v,0,0xffffffff,'FINAL_GEOMETRY_MAPPING'),true));});return b;
}
export function finalSceneGeometry(M,snapshot,sourceGeneration,request,generation){
 if(M._arch_final_scene_geometry_version?.()!==1)fail('FINAL_GEOMETRY_ABI');
 const id=invoke(M,'_arch_final_scene_geometry',snapshot,encodeFinalSceneGeometry(request,sourceGeneration),generation);
 try{const p=M._arch_final_output_ptr(id),n=M._arch_final_output_len(id);range(M,p,n,1,16*1024*1024);const bytes=M.HEAPU8.slice(p,p+n);
  const mp=M._arch_final_output_metadata_ptr(id),mn=M._arch_final_output_metadata_len(id);range(M,mp,mn,1,256*1024);const metadata=JSON.parse(new TextDecoder().decode(M.HEAPU8.slice(mp,mp+mn)));
  if(metadata.version!=='arch-final-scene-geometry/1'||metadata.format!=='ARCH/1'||metadata.geometry!=='material-union'||metadata.sourceSnapshotId!==snapshot||metadata.sourceSnapshotGeneration!==sourceGeneration||metadata.revision!==request.revision||bytes.length<128||new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(0,true)!==0x48435241)fail('FINAL_GEOMETRY_ABI');return {bytes,metadata};
 }finally{M._arch_final_output_release(id);}
}
