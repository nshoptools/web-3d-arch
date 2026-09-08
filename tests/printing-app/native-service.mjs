import {createUnifiedPrinting} from '../../src/printing/src/unified.mjs';
import {exportFinalFileBytes,encodeFinalExportOptions} from '../../src/kernel/final-scene-export/runtime-helper.mjs';
import {SOURCE} from './runtime-fixture.mjs';
export function nativeService(M){
 const printing=createUnifiedPrinting(M);let generation=0;
 const counters={build:0,printing:0,final:0},hooks={afterPrinting:null},live=new Set();
 function next(){const g=++generation;if(M._arch_control_reset(g)!==1)throw Error('CONTROL_RESET');return g;}
 const client={epoch:1,disposed:false,serviceCapabilities:{finalExport:M._arch_final_export_version()===1},
  async export3MF(root,request,{format}){counters.printing++;const lease=printing.acquireReaderLease(root.id,root.generation);
   const out=await printing.exportSnapshot3MF(lease,request,{format});await hooks.afterPrinting?.(out);return out;},
  async finalExport(root,request,{generation}){counters.final++;return exportFinalFileBytes(M,root.id,encodeFinalExportOptions({...request,generation:root.generation}),generation);},
 };
 function build(){
  const g=next(),b=new TextEncoder().encode(SOURCE),input=M._arch_input_create(b.length);if(!input)throw Error('INPUT');
  M.HEAPU8.set(b,M._arch_input_ptr(input));const id=M._arch_build_svg(input,2,20,.004,g);if(!id)throw Error('SVG_BUILD');counters.build++;live.add(id);let released=false;
  return {id,generation:g,epoch:client.epoch,bytes(){if(released)throw Object.assign(Error('released'),{code:'SNAPSHOT_RELEASED'});return M.HEAPU8.subarray(M._arch_snapshot_ptr(id),M._arch_snapshot_ptr(id)+M._arch_snapshot_len(id));},
   release(){if(!released){released=true;live.delete(id);if(M._arch_snapshot_release(id)!==1)throw Error('SNAPSHOT_RELEASE');}}};
 }
 return {M,client,counters,hooks,build,live,operation:async(control,invoke)=>{if(control.signal.aborted)throw Object.assign(Error('cancelled'),{code:'CANCELLED'});return invoke(client,next());}};
}
