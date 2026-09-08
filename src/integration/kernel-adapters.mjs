import {EngineClient} from '../core/engine-client.mjs';
import {readArchSnapshot} from '../viewport/arch-view.mjs';
import {effectiveValues} from '../domain/index.mjs';
import {writeStoredZip} from '../storage/zip.mjs';
const VERSION='arch-app-adapters/1';
const requireValue=(condition,code)=>{if(!condition)throw Object.assign(new Error(code),{code});};
const clone=value=>structuredClone(value);
const utf8=new TextDecoder('utf-8',{fatal:true});

/** Product-specific recipes are injected and must reject every active feature
 * they cannot implement. The binding never replaces a product with extrusion.
 * Source/printing extensions share this same service, allocator and generation.
 * Controller owns ModelLease; exporter borrows it through an exact WeakMap. */
export function createKernelAdapters({moduleURL,workerURL,engineIntegrity=null,selectRecipe,sourceExtension=null,exportExtension=null,textConfig=null,createTextRenderer=null,identity={id:'arch-kernel',version:'runtime-2.ARCH-1'}}={}){
  requireValue(typeof selectRecipe==='function','PRODUCT_RECIPE_REQUIRED');
  requireValue([identity.id,identity.version].every(v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(v)),'ENGINE_IDENTITY');
  let client=null,generation=0;
  const leases=new WeakMap(),listeners=new Map();
  function native(){return client??=new EngineClient({moduleURL,integrity:engineIntegrity,textConfig,createTextRenderer,...(workerURL?{workerURL}:{}),onStatus:status=>{
    const listener=listeners.get(status.generation);if(listener)listener({stage:status.phase,progress:status.progress??null});
  }});}
  /** Initialization is not a native job and does not allocate a generation.
   * Trusted source composers use the returned client to bind one epoch's leases. */
  async function ensureRuntime(control){
    requireValue(control?.version===VERSION&&control.ticket&&control.signal&&!control.signal.aborted,'ADAPTER_CONTROL');
    const current=native();await current.start();
    requireValue(!control.signal.aborted,'CANCELLED');requireValue(current===client&&!current.disposed,'PRIVATE_RESET');
    return current;
  }
  async function operation(control,invoke){
    requireValue(control?.version===VERSION&&control.ticket&&control.signal&&!control.signal.aborted,'ADAPTER_CONTROL');
    requireValue(generation<0xfffffffe,'TRANSPORT_GENERATION_EXHAUSTED');
    const current=native(),id=++generation;listeners.set(id,control.onProgress);
    const cancel=()=>{if(current.active?.generation===id)void current.cancel();};
    control.signal.addEventListener('abort',cancel,{once:true});
    try{return await invoke(current,id);}
    finally{listeners.delete(id);control.signal.removeEventListener('abort',cancel);}
  }
  const engine={version:VERSION,identity:clone(identity),capabilities:[{id:'geometry.build',available:globalThis.crossOriginIsolated===true,reason:globalThis.crossOriginIsolated?'':'Cần HTTPS và cô lập nguồn để chạy nhân xử lý.'}],
    async build(input){
      const recipe=await selectRecipe({state:input.state,assets:input.assets,signal:input.signal});
      requireValue(recipe&&typeof recipe.kind==='string','BUILD_RECIPE');
      return operation(input,async(current,id)=>{
        let root,retained=false;
        try{
          root=await current.build(recipe,{generation:id});requireValue(!input.signal.aborted,'CANCELLED');
          const snapshot=readArchSnapshot(root.bytes());requireValue(snapshot.bounds&&snapshot.generation===id,'SNAPSHOT_GENERATION');
          const [widthMm,depthMm,heightMm]=snapshot.bounds.size,materials=input.state.content.app.materials;
          const blocks=snapshot.parts.map(p=>({id:'part-'+p.index,label:'Khối '+(p.index+1),kind:'region',materialId:materials.find(m=>parseInt(m.color.slice(1)+'ff',16)===p.color)?.id??null}));
          let released=false;
          const model={version:VERSION,ticket:clone(input.ticket),generation:id,leaseId:root.epoch+':'+root.id,
            stats:{widthMm,depthMm,heightMm,triangles:snapshot.triangles.length/3,materialCount:new Set(snapshot.parts.map(p=>p.color)).size,verdict:'unverified'},blocks,
            bytes(){requireValue(!released,'LEASE_RELEASED');return root.bytes();},
            release(){if(!released){released=true;leases.delete(model);root.release();}}};
          leases.set(model,{root,client:current});retained=true;return model;
        }finally{if(!retained)root?.release();}
      });
    }};
  async function svgPreview(input,file,{resolution=520,includeRGBA=false,longEdgeMm=0}={}){
    requireValue(file.bytes instanceof Uint8Array&&file.bytes.length<=1048576,'SVG_BYTE_BUDGET');
    const source=utf8.decode(file.bytes);
    const result=await operation(input,(current,id)=>current.previewSVG({kind:'svg',source,thicknessMm:.2,longEdgeMm,toleranceMm:.004},{generation:id,resolution,includeRGBA}));
    requireValue(!input.signal.aborted,'CANCELLED');const p=result.preview;
    return {version:VERSION,ticket:clone(input.ticket),kind:'svg',metadata:{...result.metadata,previewDerivation:p.derivation,frame:p.frame},
      materials:p.colors.map((color,index)=>({id:'source-'+color.slice(1),label:'Màu '+(index+1),color,slot:null,role:'region',overridden:false,backgroundEligible:true,excluded:false})),
      preview:{width:p.width,height:p.height,pixelSizeMm:p.pixelSizeMm,png:p.png,mediaType:'image/png'},
      ...(includeRGBA?{raster:{width:p.width,height:p.height,data:p.rgba,pixelSizeMm:p.pixelSizeMm,preview:p.png,previewMediaType:'image/png'}}:{})};
  }
  const source={version:VERSION,capabilities:[{id:'source.svg',available:true},...(sourceExtension?.capabilities??[])],
    ingest(input){const {file,purpose}=input;
      if(purpose==='source'&&(file.mediaType==='image/svg+xml'||/\.svg$/i.test(file.name)))return svgPreview(input,file);
      requireValue(sourceExtension?.ingest,'SOURCE_FORMAT_UNSUPPORTED');return sourceExtension.ingest(input);
    },
    async convert(input){
      if(input.source.kind!=='svg'){requireValue(sourceExtension?.convert,'SOURCE_CONVERSION_UNSUPPORTED');return sourceExtension.convert(input);}
      requireValue(input.target==='raster','SOURCE_CONVERSION_TARGET');const values=effectiveValues(input.state),bytes=input.assets.get(input.source.raw.hash);requireValue(bytes,'SOURCE_ASSET_MISSING');
      const result=await svgPreview(input,{bytes},{resolution:Number(values.res),longEdgeMm:values.size,includeRGBA:true});
      return {status:'proposal',result,changes:['Chuyển SVG thành raster tại '+values.res+' pixel để chỉnh sửa; giữ tệp gốc.','Chi tiết nhỏ hơn pixel có thể thay đổi; chưa xác minh việc giữ topology.']};
    },
    ...(sourceExtension?.queryFonts?{queryFonts:(...args)=>sourceExtension.queryFonts(...args)}:{}),
    ...(sourceExtension?.queryEmoji?{queryEmoji:(...args)=>sourceExtension.queryEmoji(...args)}:{}),
    ...(sourceExtension?.selectEmoji?{selectEmoji:input=>sourceExtension.selectEmoji(input)}:{}),
    ...(sourceExtension?.acceptProposal?{acceptProposal:input=>sourceExtension.acceptProposal(input)}:{})};
  const exporter={version:VERSION,capabilities:[{id:'export.stl',available:true}],
    formats(context){
      const {model}=context,extensions=exportExtension?.formats(context)??[];
      if(!model)return extensions;let count;
      try{count=readArchSnapshot(model.bytes()).parts.length;}catch{return extensions;}
      return [{id:count===1?'stl':'stl-parts-zip',label:count===1?'STL (mm)':'Các khối STL riêng (ZIP, mm)',extension:count===1?'stl':'zip',enabled:count>0&&count<=128,verdict:'unverified',prerequisite:'matching-model',...(count>128?{reason:'Gói xuất giới hạn 128 khối.'}:{})},...extensions];
    },
    async export(input){
      if(!['stl','stl-parts-zip'].includes(input.formatId)){requireValue(exportExtension?.export,'EXPORT_FORMAT_UNSUPPORTED');return exportExtension.export(input);}
      const record=leases.get(input.model);requireValue(record&&record.client===client,'MODEL_LEASE_RETIRED');
      const snapshot=readArchSnapshot(input.model.bytes());requireValue(snapshot.parts.length>0&&snapshot.parts.length<=128,'EXPORT_PART_BUDGET');
      requireValue(input.formatId==='stl'?snapshot.parts.length===1:snapshot.parts.length>1,'EXPORT_FORMAT_PARTS');
      const parts=[],manifest=[];let total=0;
      for(const part of snapshot.parts){
        const bytes=await operation(input,(current,id)=>current.exportSTL(record.root,part.index,{generation:id}));requireValue(!input.signal.aborted,'CANCELLED');
        total+=bytes.length;requireValue(total<=128*1024*1024,'EXPORT_BYTE_BUDGET');
        const name='part-'+String(part.index+1).padStart(3,'0')+'.stl';parts.push({name,bytes});
        manifest.push({file:name,color:'#'+(part.color>>>8).toString(16).padStart(6,'0'),materialId:input.model.blocks[part.index]?.materialId??null,sourceIndex:part.sourceIndex});
      }
      let bytes=parts[0].bytes,mimeType='model/stl',extension='stl';
      if(parts.length>1){
        const document={kind:'web-3d-arch.stl-parts',version:1,projectId:input.ticket.projectId,revision:input.ticket.revision,units:'mm',coordinates:'common manufacturing frame',fitQualification:'unqualified',parts:manifest};
        parts.push({name:'manifest.json',bytes:new TextEncoder().encode(JSON.stringify(document,null,2))});bytes=writeStoredZip(parts);mimeType='application/zip';extension='zip';
      }
      return {version:VERSION,ticket:clone(input.ticket),bytes,mimeType,filename:'model-r'+input.ticket.revision+'.'+extension};
    }};
  return {engine,source,exporter,operation,ensureRuntime,svgPreview,kernelLeases:leases,async reset(){
    client?.dispose();client=null;generation=0;listeners.clear();
    const settled=await Promise.allSettled([sourceExtension,exportExtension].map(async a=>a?.reset?.()));
    requireValue(settled.every(r=>r.status==='fulfilled'),'PRIVATE_RESET_FAILED');
  }};
}
