/** Registered ASFR/1 source-frame binding; caller supplies the existing Module. */
export class SourceFrameError extends Error{
 constructor(code){super(code);this.name='SourceFrameError';this.code=code;}
}
const fail=code=>{throw new SourceFrameError(code);};
const uint=v=>Number.isInteger(v)&&v>0&&v<0xffffffff;
export function encodeSourceFrame(snapshotId,snapshotGeneration,request){
 if(!uint(snapshotId)||!uint(snapshotGeneration))fail('SOURCE_FRAME_HANDLE');
 if(!request||Object.keys(request).sort().join(',')!=='matrix,sourceHash,version'||request.version!=='arch-source-frame/1')fail('SOURCE_FRAME_REQUEST');
 if(typeof request.sourceHash!=='string'||!/^[0-9a-f]{64}$/.test(request.sourceHash))fail('SOURCE_FRAME_HASH');
 const m=request.matrix;
 if(!Array.isArray(m)||m.length!==6||m.some(v=>typeof v!=='number'||!Number.isFinite(v)))fail('SOURCE_FRAME_ISOMETRY_REQUIRED');
 const[a,b,c,d,x,y]=m;
 if(![a,b,c,d].every(v=>v===-1||v===0||v===1)||Math.abs(a)+Math.abs(c)!==1||Math.abs(b)+Math.abs(d)!==1||Math.abs(a)+Math.abs(b)!==1||Math.abs(c)+Math.abs(d)!==1)fail('SOURCE_FRAME_ISOMETRY_REQUIRED');
 if(Math.abs(x)>10000||Math.abs(y)>10000)fail('SOURCE_FRAME_TRANSLATION_RANGE');
 const bytes=new Uint8Array(112),view=new DataView(bytes.buffer);
 [0x52465341,1,112,0,snapshotId,snapshotGeneration].forEach((v,i)=>view.setUint32(i*4,v,true));
 for(let i=0;i<32;i++)bytes[24+i]=parseInt(request.sourceHash.slice(i*2,i*2+2),16);
 m.forEach((v,i)=>view.setFloat64(56+i*8,v,true));return bytes;
}
/** Control is already reset by root Worker. Returns the new PRIMARY snapshot ID. */
export function applySourceFrame(module,snapshotId,snapshotGeneration,request,generation){
 if(module?._arch_abi_version?.()!==2||module?._arch_source_frame_version?.()!==1)fail('SOURCE_FRAME_ABI');
 if(!uint(generation))fail('GENERATION_RANGE');
 const bytes=encodeSourceFrame(snapshotId,snapshotGeneration,request),input=module._arch_input_create(bytes.length);
 if(!input)fail('SOURCE_FRAME_INPUT_ALLOCATION');
 try{
  const at=module._arch_input_ptr(input),heap=module.HEAPU8;
  if(!at||at+bytes.length>heap.byteLength)fail('SOURCE_FRAME_INPUT_ABI');
  heap.set(bytes,at);
  const id=module._arch_source_frame(input,generation);
  if(!id){
   const p=module._arch_error_ptr(),n=module._arch_error_len(),fresh=module.HEAPU8;
   if(n>512||p+n>fresh.byteLength)fail('SOURCE_FRAME_ERROR_ABI');
   fail(new TextDecoder().decode(new Uint8Array(fresh.subarray(p,p+n)))||'SOURCE_FRAME_FAILED');
  }
  return id;
 }finally{module._arch_input_release(input);}
}

