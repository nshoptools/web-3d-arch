import {ProductOperationError} from './product-operations.mjs';
/** Root raster ABI1 on the injected root Module. Explicit user confirmation is
 * a separate call; prepare never confirms or builds a product implicitly. */
export function createProductSourceOperations(M){
 if(M?._arch_abi_version?.()!==2||M._arch_raster_abi_version?.()!==1)throw new ProductOperationError('RASTER_RUNTIME_UNAVAILABLE');
 const message=()=>new TextDecoder().decode(new Uint8Array(M.HEAPU8.subarray(M._arch_error_ptr(),M._arch_error_ptr()+M._arch_error_len())));
 const input=(b,optional=false)=>{if(optional&&!b)return 0;if(!(b instanceof Uint8Array)||!b.length||b.length>16*1024*1024)throw new ProductOperationError('RASTER_INPUT_SIZE');const id=M._arch_input_create(b.length);if(!id)throw new ProductOperationError('INPUT_ALLOCATION_FAILED');M.HEAPU8.set(b,M._arch_input_ptr(id));return id;};
 const copy=(id,kind,cap)=>{const p=M._arch_raster_buffer_ptr(id,kind),n=M._arch_raster_buffer_bytes(id,kind);if(n>cap||n&&!p||p+n>M.HEAPU8.length)throw new ProductOperationError('RASTER_BUFFER_ABI');return new Uint8Array(M.HEAPU8.subarray(p,p+n));};
 const describe=id=>({summary:copy(id,1,256),metadata:copy(id,18,1024*1024),regions:copy(id,23,1024*1024),palette:copy(id,7,384),options:copy(id,20,200)});
 return Object.freeze({
  prepare(request,generation){
   if(!Number.isInteger(generation)||generation<1||generation>0xfffffffe)throw new ProductOperationError('GENERATION_RANGE');
   if(request?.kind==='rgba'&&(![request.width,request.height].every(v=>Number.isInteger(v)&&v>0&&v<=0xffffffff)||request.width*request.height*4!==request.bytes?.length))throw new ProductOperationError('RASTER_DIMENSIONS');
   const handles=[];const add=(b,optional)=>{const h=input(b,optional);handles.push(h);return h;};
   let id=0;try{
    const source=add(request.bytes),options=add(request.options),limits=add(request.limits,true);
    if(request.kind==='rgba'){const origin=add(request.origin,true);id=M._arch_raster_prepare_rgba(source,request.width,request.height,options,limits,origin,generation);}
    else if(request.kind==='encoded')id=M._arch_raster_prepare_encoded(source,options,limits,generation);
    else throw new ProductOperationError('RASTER_SOURCE_KIND');
    if(!id)throw new ProductOperationError(message()||'RASTER_PREPARE_FAILED');
    return {id,...describe(id)};
   }catch(e){if(id)M._arch_raster_release(id);throw e;}finally{handles.forEach(h=>{if(h)M._arch_input_release(h);});}
  },
  confirm(id,acceptedHash,generation){
   if(!Number.isInteger(id)||id<1||id>0xffffffff||!Number.isInteger(generation)||generation<1||generation>0xfffffffe)throw new ProductOperationError('RASTER_HANDLE_OR_GENERATION');
   let h=0,accepted=0;try{if(!(acceptedHash instanceof Uint8Array)||acceptedHash.length!==32)throw new ProductOperationError('RASTER_HASH_SIZE');
    h=input(acceptedHash);accepted=M._arch_raster_confirm(id,h,generation);if(!accepted)throw new ProductOperationError(message()||'RASTER_CONFIRM_FAILED');
    return {id:accepted,...describe(accepted)};
   }catch(e){if(accepted)M._arch_raster_release(accepted);throw e;}finally{if(h)M._arch_input_release(h);}
  },
  release:id=>M._arch_raster_release(id)
 });
}
