/** Registered ASFR/1 source-frame binding; caller supplies the existing Module. */
export class SourceFrameError extends Error{
 constructor(code){super(code);this.name='SourceFrameError';this.code=code;}
}
const fail=code=>{throw new SourceFrameError(code);};
const uint=v=>Number.isInteger(v)&&v>0&&v<0xffffffff;
/** The request shape the wire accepts; the same check runs before a raster
 * context token is sent to the Worker, which resolves the snapshot itself. */
export function checkSourceFrameRequest(request){
 if(!request||Object.keys(request).sort().join(',')!=='matrix,sourceHash,version'||request.version!=='arch-source-frame/1')fail('SOURCE_FRAME_REQUEST');
 if(typeof request.sourceHash!=='string'||!/^[0-9a-f]{64}$/.test(request.sourceHash))fail('SOURCE_FRAME_HASH');
 const m=request.matrix;
 if(!Array.isArray(m)||m.length!==6||m.some(v=>typeof v!=='number'||!Number.isFinite(v)))fail('SOURCE_FRAME_ISOMETRY_REQUIRED');
 const[a,b,c,d,x,y]=m;
 if(![a,b,c,d].every(v=>v===-1||v===0||v===1)||Math.abs(a)+Math.abs(c)!==1||Math.abs(b)+Math.abs(d)!==1||Math.abs(a)+Math.abs(b)!==1||Math.abs(c)+Math.abs(d)!==1)fail('SOURCE_FRAME_ISOMETRY_REQUIRED');
 if(Math.abs(x)>10000||Math.abs(y)>10000)fail('SOURCE_FRAME_TRANSLATION_RANGE');
 return request;
}
export function encodeSourceFrame(snapshotId,snapshotGeneration,request){
 if(!uint(snapshotId)||!uint(snapshotGeneration))fail('SOURCE_FRAME_HANDLE');
 checkSourceFrameRequest(request);
 const m=request.matrix;
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
/** The manufacturing frame is X right, Y up, with the printed face toward +Z:
 * the text wrapper, the preview bounds, the assembly and the section export all
 * use it. A parsed SVG and a raster source context arrive X right, Y down (the
 * SVG viewport, the pixel grid). This is the one reflection that places such a
 * context into the manufacturing frame, y' = heightMm - y, so the artwork keeps
 * its own rectangle. The translation is fixed in whole nanometres here, the
 * grid the native frame rounds to, so the expected grid can be compared with
 * the result. Text-derived SVG wrappers are already Y up and must not use it. */
export const MANUFACTURING_LINEAR=Object.freeze([1,0,0,-1]);
export function manufacturingFrame({sourceHash,heightMm}){
 if(typeof heightMm!=='number'||!Number.isFinite(heightMm)||heightMm<=0||heightMm>10000)fail('SOURCE_FRAME_DIMENSIONS');
 const heightNm=Math.round(heightMm*1e6);
 const request=Object.freeze({version:'arch-source-frame/1',sourceHash,matrix:Object.freeze([...MANUFACTURING_LINEAR,0,heightNm/1e6])});
 checkSourceFrameRequest(request);
 return Object.freeze({request,linearMatrix:MANUFACTURING_LINEAR,translationNm:Object.freeze(['0',String(heightNm)])});
}
