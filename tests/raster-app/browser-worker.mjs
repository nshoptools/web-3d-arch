import createModule from '../../runtime/arch-kernel.mjs';
import {exercise} from './suite.mjs';
import {createRasterOperations,createRasterDispatcher} from '../../src/core/raster-operations.mjs';
import {validatePacket} from '../../src/core/raster-schema.mjs';
import {sha256} from '../../src/storage/common.mjs';
let moduleInstances=0;
self.onmessage=async(event)=>{
  if(event.data?.type!=='run')return;
  try {
    moduleInstances++;
    const module=await createModule({print:()=>{},printErr:()=>{}}); // Exactly one root module, test host only.
    const result=await exercise(module,{browser:true,readFixture:async n=>new Uint8Array(await (await fetch(new URL('./fixtures/'+n,import.meta.url))).arrayBuffer())});
    const root=createRasterOperations(module),next=()=>{const generation=root.control().generation+1;if(module._arch_control_reset(generation)!==1)throw Error('root reset');return {generation};};
    const old=root.prepareRGBA({data:new Uint8ClampedArray([255,0,0,255]),width:1,height:1},next());
    const saved=await sha256(old.copy().buffers[0].bytes),owned=root.ownedBytes();
    const outgoing=old.copy(),expected=outgoing.buffers[0].bytes.slice();
    const echoed=new Promise(resolve=>{const handler=e=>{if(e.data?.type==='echo-packet'){self.removeEventListener('message',handler);resolve(e.data.packet);}};self.addEventListener('message',handler);});
    postMessage({type:'echo-packet',packet:outgoing},outgoing.buffers.map(b=>b.bytes.buffer));
    if(outgoing.buffers.some(b=>b.bytes.byteLength!==0))throw Error('Typed transfer did not detach owned buffers');
    const returned=await echoed;validatePacket(returned);
    if(await sha256(returned.buffers[0].bytes)!==await sha256(expected))throw Error('Typed cross-Worker packet changed');
    const size=512,data=new Uint8ClampedArray(size*size*4);for(let i=0;i<data.length;i+=4){data[i]=255;data[i+3]=255;}
    const c=next();postMessage({type:'cancel-window',generation:c.generation,memory:module.HEAPU8.buffer,offset:module._arch_control_ptr()});
    await new Promise(r=>setTimeout(r,0));
    let code=null;
    try {const unexpected=root.prepareRGBA({data,width:size,height:size},c);unexpected.release();throw Error('cancel missed');}
    catch(e){code=e.code;if(code!=='RASTER_CANCELLED')throw e;}
    const control=root.control();if(control.phase!==4||root.ownedBytes()!==owned||await sha256(old.copy().buffers[0].bytes)!==saved)throw Error('cancel changed old lease / partial publish');
    old.release();if(root.ownedBytes()!==0)throw Error('cancel leaked');
    const rpc=createRasterDispatcher(root);
    self.addEventListener('message',({data})=>{
      if(data?.type!=='raster-rpc')return;
      if(data.hold){postMessage({type:'raster-rpc-held',id:data.id});return;}
      try{
        const control=['prepareEncoded','prepareRGBA','confirm','buildSourceContext'].includes(data.method)?next():undefined;
        const result=rpc.dispatch(data.method,data.request,control);
        postMessage({type:'raster-rpc-result',id:data.id,result},rpc.transferables(result));
      }catch(error){postMessage({type:'raster-rpc-result',id:data.id,error:{code:error.code,message:error.message}});}
    });
    postMessage({type:'complete',result:{...result,cancel:{code,phase:control.phase,oldLeasePreserved:true,rootOwnedBytes:0},moduleInstances,typedTransferRoundTrip:true,detachedAfterTransfer:true}});
  }catch(e){postMessage({type:'failed',error:String(e.stack||e)});}
};
