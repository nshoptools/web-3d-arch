import {createTextOperations} from './text-operations.mjs';
import {previewPlanarSnapshot} from './source-preview.mjs';
import {multiply} from '../input/source-contract.mjs';

const fail=code=>{throw Object.assign(new Error(code),{code});};
/** Text uses the existing engine allocator and the scheduler's current generation.
 * The temporary planar preview lease never becomes a finished product. */
export function createEngineTextService(Module,config,{origin}){
  if(!config||config.origin!==origin)fail('TEXT_SERVICE_ORIGIN');
  let current=null;
  function check(){
    if(!current||current.signal.aborted||Atomics.load(new Int32Array(Module.HEAPU8.buffer,Module._arch_control_ptr(),4),3)===current.generation)fail('CANCELLED');
  }
  async function previewPaths({prepared,signal,resolution}){
    check();const svg=prepared.kind==='paths'?prepared.svg:prepared.originalSvg;
    const restore=prepared.kind==='paths'?prepared.svgExport?.parserViewportToSourceMm:prepared.sourceToMm;
    if(!(svg instanceof Uint8Array)||!Array.isArray(restore)||restore.length!==6)fail('TEXT_PREVIEW_SOURCE_FRAME');
    if(svg.length>1048576)fail('SOURCE_SIZE_LIMIT');
    const input=Module._arch_input_create(svg.length);if(!input)fail('INPUT_ALLOCATION_FAILED');let id=0;
    try{
      Module.HEAPU8.set(svg,Module._arch_input_ptr(input));
      id=Module._arch_build_svg(input,.2,0,.004,current.generation);
      if(!id){const code=new TextDecoder().decode(new Uint8Array(Module.HEAPU8.subarray(Module._arch_error_ptr(),Module._arch_error_ptr()+Module._arch_error_len())));fail(code||'TEXT_PREVIEW_FAILED');}
      const p=await previewPlanarSnapshot(new Uint8Array(Module.HEAPU8.buffer,Module._arch_snapshot_ptr(id),Module._arch_snapshot_len(id)),{resolution,includeRGBA:true});
      check();if(signal.aborted)fail('CANCELLED');
      return {...p,data:p.rgba,pixelToSourceMm:multiply(restore,[p.pixelSizeMm,0,0,-p.pixelSizeMm,p.frame.leftMm,p.frame.topMm]),
        renderer:{id:'arch-engine-planar-preview',engine:'arch-kernel-ABI2',version:'scanline-2x2-v1'}};
    }finally{if(id)Module._arch_snapshot_release(id);Module._arch_input_release(input);}
  }
  const service=createTextOperations({Module,catalog:config.catalog,assetURLs:config.assetURLs,
    runtime:config.runtime,origin,previewPaths,fetchImpl:globalThis.fetch.bind(globalThis)});
  return Object.freeze({
    capabilities:service.capabilities,
    async run(request,{generation,signal,onProgress,isCurrent}){
      if(current)fail('TEXT_OPERATIONS_BUSY');current={generation,signal};
      try{return await service.run(request,{signal,onProgress,isCurrent:ticket=>{check();return isCurrent(ticket);}});}
      finally{current=null;}
    },
    cancel:()=>service.cancel(),reset:options=>service.reset(options),dispose:()=>service.dispose(),stats:()=>service.stats()
  });
}
