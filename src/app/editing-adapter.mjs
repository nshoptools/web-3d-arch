import {VERSION as EDIT_VERSION,gapFromDesign} from '../editing/index.mjs';
import {parseDecimal} from '../domain/index.mjs';
import {VERSION,assert} from './common.mjs';
import {createEditingClient as defaultEditingClient} from './editing-client.mjs';
/** Production: actual Dedicated Worker RPC. A pure-core client may only be explicitly injected in Node tests. */
export function createRasterEditingAdapter({encodePNG,createEditingClient,workerURL,workerFactory}){
 assert(typeof encodePNG==='function','PNG_ENCODER_REQUIRED');
 const available=typeof createEditingClient==='function'||typeof workerFactory==='function'||typeof Worker==='function',active=new Set();
 const factory=createEditingClient??(()=>defaultEditingClient({workerURL,workerFactory}));
 return {version:VERSION,capabilities:[{id:'source.edit',available,...(!available?{reason:'Không có Dedicated Worker để sửa ảnh nguồn.'}:{})}],
  reset(){for(const client of active)client.dispose();active.clear();},
  async edit({ticket,gesture,editor,color,source,raster,signal,onProgress}){
   assert(available,'EDIT_WORKER_UNAVAILABLE');assert(!signal.aborted,'CANCELLED');
   const client=await factory();active.add(client);const stop=()=>client.dispose();signal.addEventListener('abort',stop,{once:true});
   try{
    assert(!signal.aborted,'CANCELLED');
    const expected=await client.initialize({source:{id:source.id,hash:source.hash,adapterId:'app-rgba',adapterVersion:'1'},revision:source.revision,image:{width:raster.width,height:raster.height,data:raster.data,colorSpace:'srgb',alphaMode:'straight'}},{signal});
    const base={version:EDIT_VERSION,id:gesture.id,expected,tool:gesture.tool};
    const width=parseDecimal(editor.strokeWidthPx).value,points=gesture.points,stroke={points,width,brush:'round',snap:gesture.snap};
    let c;
    switch(gesture.tool){
     case 'paint':c={...base,seeds:points,color};break;
     case 'line':case 'curve':c={...base,...stroke,color};break;
     case 'erase':case 'cut':c={...base,...stroke,mode:editor.cutMode,...(editor.cutMode==='merge'?{color:editor.healAuto?'auto':color}:{})};break;
     case 'crop':assert(points.length>=2,'CROP_POINTS');c={...base,from:points[0],to:points.at(-1),shape:gesture.cropShape??'rectangle',keep:gesture.cropKeep??'inside',square:gesture.square??false,mode:editor.cutMode,...(editor.cutMode==='merge'?{color:editor.healAuto?'auto':color}:{})};break;
     case 'heal':c={...base,color:editor.healAuto?'auto':color,...(editor.healAllGaps?{method:'all-gaps',...gapFromDesign(parseDecimal(editor.healThresholdMm).value,raster.pixelSizeMm)}:{method:'region',seeds:points})};delete c.resolvedGapMm;break;
     default:assert(false,'EDIT_TOOL');
    }
    await client.prepare(c,{signal,onProgress:p=>onProgress({stage:'edit-source',progress:p?.total>0&&Number.isFinite(p.completed)?Math.min(1,p.completed/p.total):null})});
    assert(!signal.aborted,'CANCELLED');const result=await client.commit(gesture.id,expected,{signal});
    assert(result?.version===EDIT_VERSION&&['committed','unchanged'].includes(result.status),'EDIT_RPC_RESULT');
    if(result.status==='unchanged')return {version:VERSION,ticket,changed:false,raster};
    const preview=await encodePNG(result.image,{signal});assert(!signal.aborted,'CANCELLED');
    return {version:VERSION,ticket,changed:true,raster:{width:result.image.width,height:result.image.height,data:new Uint8ClampedArray(result.image.data),pixelSizeMm:raster.pixelSizeMm,preview,previewMediaType:'image/png'}};
   }finally{signal.removeEventListener('abort',stop);client.dispose();active.delete(client);}
  }};
}
