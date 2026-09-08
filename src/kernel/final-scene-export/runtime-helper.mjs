// Small typed command/file helper for the parent Worker. No scene construction,
// mesh JSON, root readers or engine-worker/client state are implemented here.
const u32=(n,label)=>{if(!Number.isInteger(n)||n<0||n>0xffffffff)throw Error(`FINAL_OPTIONS_U32:${label}`);return n;};
const finite=(n,label)=>{if(typeof n!=='number'||!Number.isFinite(n))throw Error(`FINAL_OPTIONS_F64:${label}`);return n;};
const revision=(n,label)=>{if((typeof n==='number'&&!Number.isSafeInteger(n))||!['number','bigint','string'].includes(typeof n)||!/^[1-9][0-9]*$/.test(String(n)))throw Error(`FINAL_OPTIONS_REVISION:${label}`);const v=BigInt(n);if(v>0xffffffffffffffffn)throw Error(`FINAL_OPTIONS_REVISION:${label}`);return v;};
export function encodeFinalExportOptions(c){
 for(const field of ['format','generation','gates','verdict','inspection','revision','expectedRevision','filename','mapping'])if(c[field]===undefined)throw Error(`FINAL_OPTIONS_REQUIRED:${field}`);
 if(typeof c.filename!=='string'||!c.filename.isWellFormed()||c.filename.includes('\0'))throw Error('FINAL_OPTIONS_FILENAME');const name=new TextEncoder().encode(c.filename);
 if(name.length<1||name.length>240||!Array.isArray(c.mapping)||!c.mapping.length||c.mapping.length>4096)throw Error('FINAL_OPTIONS_LENGTH');
 const defaults={orientation:0,rest:0,sectionMode:0,side:0,color:0,units:0,z0:0,z1:0,step:0,error:.004,matrix:Array(12).fill(0),limits:[200000,400000,256,256,200000,16*1024*1024,128*1024*1024,0]};
 c={...defaults,...c};if(c.matrix.length!==12||c.limits.length!==8)throw Error('FINAL_OPTIONS_ARRAY_LENGTH');
 const bytes=new Uint8Array(256+c.mapping.length*24+name.length),view=new DataView(bytes.buffer);
 [1,208,c.format,c.orientation,c.rest,c.sectionMode,c.side,c.color,c.units,c.inspection,0,0].forEach((v,i)=>view.setUint32(i*4,u32(v,`header${i}`),true));
 [c.z0,c.z1,c.step,c.error].forEach((v,i)=>view.setFloat64(48+i*8,finite(v,`section${i}`),true));c.matrix.forEach((v,i)=>view.setFloat64(80+8*i,finite(v,`matrix${i}`),true));c.limits.forEach((v,i)=>view.setUint32(176+4*i,u32(v,`limits${i}`),true));
 [0x58454641,1,c.generation,c.gates,c.verdict,c.inspection,c.mapping.length,name.length].forEach((v,i)=>view.setUint32(208+4*i,u32(v,`wire${i}`),true));
 view.setBigUint64(240,revision(c.revision,'source'),true);view.setBigUint64(248,revision(c.expectedRevision,'expected'),true);
 c.mapping.forEach((m,i)=>[m.part,m.slot,m.rgba,m.source,m.materialSource,m.reserved??0].forEach((v,j)=>view.setUint32(256+24*i+4*j,u32(v,`mapping${i}:${j}`),true)));bytes.set(name,256+c.mapping.length*24);return bytes;
}
export function exportFinalFileBytes(M,snapshot,optionsBytes,generation){
 u32(snapshot,'snapshot handle');u32(generation,'job generation');if(!(optionsBytes instanceof Uint8Array))throw Error('FINAL_OPTIONS_BYTES');
 if(M._arch_abi_version()!==2||M._arch_final_export_version()!==1)throw Error('FINAL_EXPORT_ABI');
 // Parent owns the fresh generation reset, snapshot lease and trusted gates.
 const input=M._arch_input_create(optionsBytes.byteLength);if(!input)throw Error('FINAL_INPUT_RESOURCE_LIMIT');let invoked=false,output=0;
 try{
  M.HEAPU8.set(optionsBytes,M._arch_input_ptr(input));invoked=true;output=M._arch_export_final(snapshot,input,generation);
  if(!output){const error=new TextDecoder().decode(M.HEAPU8.slice(M._arch_error_ptr(),M._arch_error_ptr()+M._arch_error_len()));throw Object.assign(Error(error),{code:error.split(':')[0]});}
  const pointer=M._arch_final_output_ptr(output),length=M._arch_final_output_len(output);const bytes=M.HEAPU8.slice(pointer,pointer+length);
  const metaPointer=M._arch_final_output_metadata_ptr(output),metaLength=M._arch_final_output_metadata_len(output);
  const metadata=JSON.parse(new TextDecoder().decode(M.HEAPU8.slice(metaPointer,metaPointer+metaLength)));return {bytes,metadata};
 }finally{if(output)M._arch_final_output_release(output);if(!invoked)M._arch_input_release(input);}
}
