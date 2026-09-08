import {previewPlanarSnapshot} from '../../src/core/source-preview.mjs';
import {multiply} from '../../src/input/source-contract.mjs';
export function parentPreview(Module){
  let generation=1;
  const callback=async({prepared,signal,resolution})=>{
    if(prepared.kind==='paths'&&!prepared.svg)return null;
    const svg=prepared.kind==='paths'?prepared.svg:prepared.originalSvg;
    const restore=prepared.kind==='paths'?prepared.svgExport.parserViewportToSourceMm:prepared.sourceToMm;
    if(!(svg instanceof Uint8Array)||!restore)throw Error('Parent preview requires validated source coordinates');
    const g=generation++;if(!Module._arch_control_reset(g))throw Error('Parent generation reset failed');
    const handle=Module._arch_input_create(svg.length);if(!handle)throw Error('Input allocation failed');let id=0;
    try{
      Module.HEAPU8.set(svg,Module._arch_input_ptr(handle));id=Module._arch_build_svg(handle,.2,0,.004,g);
      if(!id){const diagnostic=new TextDecoder().decode(new Uint8Array(Module.HEAPU8.subarray(Module._arch_error_ptr(),Module._arch_error_ptr()+Module._arch_error_len())));throw Object.assign(Error(diagnostic),{code:diagnostic});}
      const p=await previewPlanarSnapshot(new Uint8Array(Module.HEAPU8.buffer,Module._arch_snapshot_ptr(id),Module._arch_snapshot_len(id)),{resolution,includeRGBA:true});
      if(signal.aborted)throw Object.assign(Error('Cancelled'),{code:'CANCELLED'});
      return {...p,data:p.rgba,pixelToSourceMm:multiply(restore,[p.pixelSizeMm,0,0,-p.pixelSizeMm,p.frame.leftMm,p.frame.topMm]),
        renderer:{id:'parent-portable-planar-preview',engine:'arch-kernel-ABI2',version:'scanline-2x2-v1'}};
    }finally{if(id)Module._arch_snapshot_release(id);Module._arch_input_release(handle);}
  };
  return {callback,generation:()=>generation};
}
