import {initializeEngineModule} from './runtime-integrity.mjs';
import {createProductSourceOperations} from './product-source-operations.mjs';
import {buildProductRecipe,productSnapshotMetadata} from './product-worker-hook.mjs';
import {createProductOperations} from './product-operations.mjs';
let engine;
let ready=false;
let initializing=false;
let building=false;
let textService=null,textJob=null;
let rendererInitialization=null;
let rasterRPC=null;
let meshRPC=null;
const registryQueue=[];
const registryMethods=new Set(['copy','acquire','release','reset']);
const releaseTypes=new Set(['release','source-raster-release','product-release-proposal','final-float-release','mesh-release']);
function runRegistry(data){
  try{
    if(data.type==='mesh-release'){meshRPC?.release(data.token);return;}
    if(data.type==='final-float-release'){engine._arch_final_float_release?.(data.id);return;}
    if(data.type==='release'){engine._arch_snapshot_release(data.id);return;}
    if(data.type==='source-raster-release'){engine._arch_raster_release(data.id);return;}
    if(data.type==='product-release-proposal'){engine._arch_product_proposal_release(data.id);return;}
    if(!rasterRPC)throw new Error('RASTER_SERVICE_UNAVAILABLE');
    if(!registryMethods.has(data.method))throw new Error('RASTER_METHOD');
    const result=rasterRPC.dispatch(data.method,data.request);
    postMessage({type:'raster-result',requestId:data.requestId,method:data.method,result,
      memory:engine.HEAPU8.buffer,controlOffset:engine._arch_control_ptr()},rasterRPC.transferables(result));
  }catch(error){failure(data.requestId,error.code||error.message||'RASTER_REGISTRY_FAILED');}
}
function completeRootJob(){
  building=false;
  // Drain before yielding to another operation. A release/reset cannot reset
  // native control or race an asynchronous text/printing job sharing this heap.
  while(registryQueue.length)runRegistry(registryQueue.shift());
}
function errorText(){
  // Browser TextDecoder rejects shared-backed views. Diagnostics are bounded
  // metadata (<=512 bytes); copy just those bytes, never the mesh snapshot.
  return new TextDecoder().decode(new Uint8Array(engine.HEAPU8.subarray(engine._arch_error_ptr(),engine._arch_error_ptr()+engine._arch_error_len())));
}
function failure(requestId,code,proposal=null){
  try{postMessage({type:'failed',requestId,code,proposal});}
  catch(error){if(proposal?.id)engine._arch_product_proposal_release(proposal.id);throw error;}
}
function buildSVG(request,generation){
  if(typeof request.source!=='string'||request.source.length>1024*1024)throw new Error('SOURCE_SIZE_LIMIT');
  const source=new TextEncoder().encode(request.source);
  if(source.byteLength>1024*1024)throw new Error('SOURCE_SIZE_LIMIT');
  const handle=engine._arch_input_create(source.byteLength);
  if(!handle)throw new Error('INPUT_ALLOCATION_FAILED');
  try{
    engine.HEAPU8.set(source,engine._arch_input_ptr(handle));
    return engine._arch_build_svg(handle,request.thicknessMm??2,request.longEdgeMm??0,request.toleranceMm??0.004,generation);
  }finally{engine._arch_input_release(handle);}
}
function metadataFor(id){
  const length=engine._arch_metadata_len?.(id)??0;if(!length)return null;
  const start=engine._arch_metadata_ptr(id);
  const metadata=JSON.parse(new TextDecoder().decode(new Uint8Array(engine.HEAPU8.subarray(start,start+length))));
  if(metadata.kind==='product')Object.assign(metadata,productSnapshotMetadata(engine,id));
  return metadata;
}
function productRecipe(request){
  const s=request.source;
  if(s?.kind==='raster-token')return rasterRPC.withSourceReference(s.token,ref=>buildProductRecipe(engine,{...request,source:ref},request.transportGeneration));
  if(s?.kind==='contexts'){
    const contexts=s.contexts.map(c=>{
      if(!c.token)return c;
      return rasterRPC.withSourceReference(c.token,ref=>{
        if(ref.kind!=='snapshot')throw new Error('PRODUCT_CONTEXT_SOURCE_REQUIRED');
        return {...ref,sourceHash:c.sourceHash,...(c.translationNm?{translationNm:c.translationNm}:{})};
      });
    });
    return buildProductRecipe(engine,{...request,source:{kind:'contexts',contexts}},request.transportGeneration);
  }
  return buildProductRecipe(engine,request,request.transportGeneration);
}

/** A part of the engine that is fetched on demand. A network drop or a stale deployment makes
 * that fetch fail with a browser sentence and a URL; the client sees one code instead, and the
 * next request starts a fresh worker so the load is retried once the network is back. The
 * import() calls keep literal specifiers so the bundler can see and emit the chunks. */
function moduleUnavailable(error){
  const failure=new Error('ENGINE_MODULE_UNAVAILABLE');failure.code='ENGINE_MODULE_UNAVAILABLE';failure.cause=error;throw failure;
}
self.onmessage=async({data})=>{
  if(!data||typeof data!=='object')return;
  try{
    if(data.type==='text-renderer-init'){
      if(!initializing||ready||!rendererInitialization||!(data.port instanceof MessagePort)){
        data.port?.close?.();throw new Error('TEXT_RENDERER_HANDSHAKE');
      }
      const resolve=rendererInitialization;rendererInitialization=null;resolve(data.port);return;
    }
    if(data.type==='init'){
      if(engine||ready||initializing)throw new Error('DUPLICATE_INIT');
      initializing=true;
      if(!self.crossOriginIsolated||typeof SharedArrayBuffer==='undefined')throw new Error('CORE_UNAVAILABLE');
      const url=new URL(data.moduleURL,self.location.href);
      if(url.origin!==self.location.origin)throw new Error('ENGINE_ORIGIN');
      const loaded=await initializeEngineModule({moduleURL:url.href,integrity:data.integrity??null,origin:self.location.origin});
      engine=loaded.engine;
      if(engine._arch_abi_version()!==2||!(engine.HEAPU8.buffer instanceof SharedArrayBuffer))throw new Error('CORE_ABI_MISMATCH');
      if(data.textConfig){
        const {createEngineTextService}=await import('./engine-text-service.mjs').catch(moduleUnavailable);
        textService=createEngineTextService(engine,data.textConfig,{origin:self.location.origin});
        if(data.textRendererAvailable&&data.textConfig.runtime?.engine==='webkit'&&!textService.capabilities.canvas2d){
          const port=await new Promise(resolve=>{
            rendererInitialization=resolve;postMessage({type:'text-renderer-needed',capabilities:textService.capabilities});
          });
          textService.reset({rendererPort:port});
        }
      }
      if(engine._arch_raster_prepare_encoded){
        const {createRasterOperations,createRasterDispatcher}=await import('./raster-operations.mjs').catch(moduleUnavailable);
        rasterRPC=createRasterDispatcher(createRasterOperations(engine));
      }
      ready=true;
      postMessage({type:'ready',runtimeIntegrity:loaded.integrity,memory:engine.HEAPU8.buffer,controlOffset:engine._arch_control_ptr(),abi:2,serviceCapabilities:{text:textService?.capabilities??null,raster:!!rasterRPC,product:engine._arch_product_abi_version?.()===1,finalExport:engine._arch_final_export_version?.()===1,finalFloat:engine._arch_final_float_version?.()===1,finalSceneGeometry:engine._arch_final_scene_geometry_version?.()===1,mesh:engine._arch_mesh_runtime_version?.()===1,
        sourceFrameVersion:engine._arch_source_frame_version?.()??null,
        printingVersions:(typeof engine._arch3mf_abi_version==='function'||typeof engine._arch3mf_kernel_abi_version==='function')?{rootABI:engine._arch_abi_version(),arch3mfABI:engine._arch3mf_abi_version?.()??null,kernel3mfABI:engine._arch3mf_kernel_abi_version?.()??null}:null,
        geometryVersions:{mechanicsAbi:engine._arch_mech_abi_version?.(),mechanicsSemantics:engine._arch_mech_semantics_version?.(),sourceAbi:engine._arch_source_abi_version?.(),sourceSemantics:engine._arch_source_semantics_version?.(),datumExtension:engine._arch_mech_source_datum_extension_version?.()}}});
      return;
    }
    if(!ready)throw new Error('CORE_UNAVAILABLE');
    if(data.type==='raster-registry'||releaseTypes.has(data.type)){
      if(data.type==='raster-registry'&&!registryMethods.has(data.method))throw new Error('RASTER_METHOD');
      if(building){if(registryQueue.length>=512)throw new Error('REGISTRY_QUEUE_LIMIT');registryQueue.push(data);}
      else runRegistry(data);
      return;
    }
    if(data.type==='mesh-operation'){
      if(building)throw new Error('BUILD_IN_PROGRESS');
      const {requestId,generation,method,request}=data;
      if(!Number.isInteger(generation)||generation<1||generation>0xfffffffe)throw new Error('GENERATION_RANGE');
      if(!['previewImport','approveImport','prepare','confirm'].includes(method))throw new Error('MESH_RPC_METHOD');
      if(engine._arch_mesh_runtime_version?.()!==1)throw new Error('MESH_ROOT_RUNTIME_UNAVAILABLE');
      if(!engine._arch_control_reset(generation))throw new Error(errorText()||'GENERATION_RANGE');
      building=true;let unpublished=null;
      try{
        postMessage({type:'running',requestId,memory:engine.HEAPU8.buffer,controlOffset:engine._arch_control_ptr()});
        await new Promise(resolve=>setTimeout(resolve,0));
        if(!meshRPC){const {createMeshRootOperations}=await import('../mesh-import/src/root-runtime.mjs');meshRPC=createMeshRootOperations(engine);}
        unpublished=await meshRPC.dispatch(method,request,{generation});
        if(Atomics.load(new Int32Array(engine.HEAPU8.buffer,engine._arch_control_ptr(),4),3)===generation)throw new Error('CANCELLED');
        if(unpublished.snapshotId){
          const id=unpublished.snapshotId;
          postMessage({type:'snapshot',requestId,generation,id,metadata:metadataFor(id),memory:engine.HEAPU8.buffer,
            byteOffset:engine._arch_snapshot_ptr(id),byteLength:engine._arch_snapshot_len(id),controlOffset:engine._arch_control_ptr()});
        }else{
          postMessage({type:'mesh-result',requestId,generation,method,result:unpublished,memory:engine.HEAPU8.buffer,controlOffset:engine._arch_control_ptr()});
        }
        unpublished=null;
      }finally{
        if(unpublished?.snapshotId)engine._arch_snapshot_release(unpublished.snapshotId);
        else if(unpublished?.token)meshRPC.release(unpublished.token);
        completeRootJob();
      }return;
    }
    if(data.type==='raster-operation'){
      if(building)throw new Error('BUILD_IN_PROGRESS');
      if(!rasterRPC)throw new Error('RASTER_SERVICE_UNAVAILABLE');
      const {requestId,generation,method,request}=data;
      if(!['prepareEncoded','prepareRGBA','confirm','buildSourceContext'].includes(method))throw new Error('RASTER_METHOD');
      if(!Number.isInteger(generation)||generation<1||generation>0xfffffffe)throw new Error('GENERATION_RANGE');
      if(!engine._arch_control_reset(generation))throw new Error(errorText()||'GENERATION_RANGE');
      building=true;let result;
      try{
        postMessage({type:'running',requestId,memory:engine.HEAPU8.buffer,controlOffset:engine._arch_control_ptr()});
        await new Promise(resolve=>setTimeout(resolve,0));
        result=rasterRPC.dispatch(method,request,{generation});
        if(Atomics.load(new Int32Array(engine.HEAPU8.buffer,engine._arch_control_ptr(),4),3)===generation)throw new Error('CANCELLED');
        postMessage({type:'raster-result',requestId,generation,method,result,memory:engine.HEAPU8.buffer,
          controlOffset:engine._arch_control_ptr()},rasterRPC.transferables(result));
        result=null;
      }finally{
        if(result?.token)rasterRPC.dispatch('release',{token:result.token});
        completeRootJob();
      }
      return;
    }
    if(data.type==='cancel-text'){
      if(textJob?.requestId===data.requestId&&textJob.generation===data.generation)textJob.abort.abort();return;
    }
    if(data.type==='text-operation'){
      if(building)throw new Error('BUILD_IN_PROGRESS');
      if(!textService)throw new Error('TEXT_SERVICE_UNAVAILABLE');
      const {requestId,generation,request}=data;
      if(!Number.isInteger(generation)||generation<1||generation>0xfffffffe)throw new Error('GENERATION_RANGE');
      if(!engine._arch_control_reset(generation))throw new Error(errorText()||'GENERATION_RANGE');
      const job=textJob={requestId,generation,abort:new AbortController()};building=true;
      try{
        postMessage({type:'running',requestId,memory:engine.HEAPU8.buffer,controlOffset:engine._arch_control_ptr()});
        await new Promise(resolve=>setTimeout(resolve,0));
        const result=await textService.run(request,{generation,signal:job.abort.signal,
          isCurrent:ticket=>textJob===job&&!job.abort.signal.aborted&&['id','userId','projectId','revision','generation'].every(key=>ticket[key]===request.ticket?.[key]),
          onProgress:p=>postMessage({type:'source-progress',requestId,generation,stage:p.stage,progress:p.progress})});
        if(job.abort.signal.aborted||Atomics.load(new Int32Array(engine.HEAPU8.buffer,engine._arch_control_ptr(),4),3)===generation){textService.cancel();throw new Error('CANCELLED');}
        // The service can retain proposal bytes. Clone the bounded source result;
        // transferring its buffers would detach the retained approval candidate.
        postMessage({type:'text-result',requestId,generation,result,memory:engine.HEAPU8.buffer,controlOffset:engine._arch_control_ptr()});
      }finally{textJob=null;completeRootJob();}
      return;
    }
    if(data.type==='source-raster-prepare'||data.type==='source-raster-confirm'){
      if(building)throw new Error('BUILD_IN_PROGRESS');
      const {requestId,generation}=data;
      if(!Number.isInteger(generation)||generation<1||generation>0xfffffffe)throw new Error('GENERATION_RANGE');
      if(!engine._arch_control_reset(generation))throw new Error(errorText());
      building=true;let published=0;
      try{
        postMessage({type:'running',requestId,memory:engine.HEAPU8.buffer,controlOffset:engine._arch_control_ptr()});
        await new Promise(resolve=>setTimeout(resolve,0));
        const source=createProductSourceOperations(engine);
        const result=data.type==='source-raster-prepare'?source.prepare(data.request,generation):source.confirm(data.id,data.acceptedHash,generation);
        published=result.id;
        postMessage({type:'raster-source',requestId,generation,...result,memory:engine.HEAPU8.buffer,controlOffset:engine._arch_control_ptr()});
        published=0;
      }finally{if(published)engine._arch_raster_release(published);completeRootJob();}return;
    }
    if(data.type==='product-confirm'){
      if(building)throw new Error('BUILD_IN_PROGRESS');
      const {requestId,generation,proposalId,descriptor,current}=data;
      if(!Number.isInteger(generation)||generation<1||generation>0xfffffffe)throw new Error('GENERATION_RANGE');
      if(!engine._arch_control_reset(generation))throw new Error(errorText());
      building=true;
      try{
        postMessage({type:'running',requestId,memory:engine.HEAPU8.buffer,controlOffset:engine._arch_control_ptr()});
        await new Promise(resolve=>setTimeout(resolve,0));
        const receipt=createProductOperations(engine).confirm(proposalId,descriptor,current,generation);
        postMessage({type:'product-receipt',requestId,generation,receipt,memory:engine.HEAPU8.buffer,controlOffset:engine._arch_control_ptr()},[receipt.buffer]);
      }finally{completeRootJob();}return;
    }
    if(data.type==='source-preview'){
      if(building)throw new Error('BUILD_IN_PROGRESS');
      const {requestId,generation,request,resolution,includeRGBA}=data;
      if(!Number.isInteger(generation)||generation<1||generation>0xfffffffe||request?.kind!=='svg'||typeof includeRGBA!=='boolean')throw new Error('PREVIEW_REQUEST');
      if(!engine._arch_control_reset(generation))throw new Error(errorText()||'GENERATION_RANGE');
      building=true;let id=0;
      try{
        postMessage({type:'running',requestId,memory:engine.HEAPU8.buffer,controlOffset:engine._arch_control_ptr()});
        await new Promise(resolve=>setTimeout(resolve,0));
        id=buildSVG(request,generation);if(!id)throw new Error(errorText()||'PREVIEW_FAILED');
        const {previewPlanarSnapshot}=await import('./source-preview.mjs').catch(moduleUnavailable);
        const preview=await previewPlanarSnapshot(new Uint8Array(engine.HEAPU8.buffer,engine._arch_snapshot_ptr(id),engine._arch_snapshot_len(id)),{resolution,includeRGBA});
        if(Atomics.load(new Int32Array(engine.HEAPU8.buffer,engine._arch_control_ptr(),4),3)===generation)throw new Error('CANCELLED');
        postMessage({type:'source-preview',requestId,generation,preview,metadata:metadataFor(id),memory:engine.HEAPU8.buffer,controlOffset:engine._arch_control_ptr()},[preview.png.buffer,...(preview.rgba?[preview.rgba.buffer]:[])]);
      }finally{if(id)engine._arch_snapshot_release(id);completeRootJob();}
      return;
    }
    if(data.type==='source-frame'){
      if(building)throw new Error('BUILD_IN_PROGRESS');
      const {requestId,generation,snapshotId,snapshotGeneration,request}=data;
      if(!Number.isInteger(generation)||generation<1||generation>0xfffffffe)throw new Error('GENERATION_RANGE');
      if(engine._arch_source_frame_version?.()!==1)throw new Error('SOURCE_FRAME_ABI');
      if(!engine._arch_control_reset(generation))throw new Error(errorText()||'GENERATION_RANGE');
      building=true;let unpublished=0;
      try{
        postMessage({type:'running',requestId,memory:engine.HEAPU8.buffer,controlOffset:engine._arch_control_ptr()});
        await new Promise(resolve=>setTimeout(resolve,0));
        const {applySourceFrame}=await import('./source-frame.mjs').catch(moduleUnavailable);
        unpublished=applySourceFrame(engine,snapshotId,snapshotGeneration,request,generation);
        if(Atomics.load(new Int32Array(engine.HEAPU8.buffer,engine._arch_control_ptr(),4),3)===generation)throw new Error('CANCELLED');
        const metadata=metadataFor(unpublished);
        postMessage({type:'snapshot',requestId,generation,id:unpublished,metadata,memory:engine.HEAPU8.buffer,
          byteOffset:engine._arch_snapshot_ptr(unpublished),byteLength:engine._arch_snapshot_len(unpublished),controlOffset:engine._arch_control_ptr()});
        unpublished=0;
      }finally{if(unpublished)engine._arch_snapshot_release(unpublished);completeRootJob();}return;
    }
    if(data.type==='final-scene-geometry'){
      if(building)throw new Error('BUILD_IN_PROGRESS');const {requestId,generation,snapshotId,snapshotGeneration,request}=data;
      if(!Number.isInteger(generation)||generation<1||generation>0xfffffffe)throw new Error('GENERATION_RANGE');
      if(engine._arch_final_scene_geometry_version?.()!==1)throw new Error('FINAL_GEOMETRY_ABI');
      if(!engine._arch_control_reset(generation))throw new Error(errorText()||'GENERATION_RANGE');building=true;
      try{postMessage({type:'running',requestId,memory:engine.HEAPU8.buffer,controlOffset:engine._arch_control_ptr()});await new Promise(resolve=>setTimeout(resolve,0));
        const {finalSceneGeometry}=await import('../kernel/final-scene-export/float-runtime.mjs');const result=finalSceneGeometry(engine,snapshotId,snapshotGeneration,request,generation);
        if(Atomics.load(new Int32Array(engine.HEAPU8.buffer,engine._arch_control_ptr(),4),3)===generation)throw new Error('CANCELLED');
        postMessage({type:'artifact',requestId,generation,format:'final-scene-geometry',...result,memory:engine.HEAPU8.buffer,controlOffset:engine._arch_control_ptr()},[result.bytes.buffer]);
      }finally{completeRootJob();}return;
    }
    if(data.type==='final-float-prepare'||data.type==='final-float-confirm'){
      if(building)throw new Error('BUILD_IN_PROGRESS');
      const {requestId,generation}=data;
      if(!Number.isInteger(generation)||generation<1||generation>0xfffffffe)throw new Error('GENERATION_RANGE');
      if(engine._arch_final_float_version?.()!==1)throw new Error('FLOAT_RUNTIME_ABI');
      if(data.type==='final-float-prepare'&&data.request?.generation!==data.snapshotGeneration)throw new Error('SNAPSHOT_GENERATION');
      if(!engine._arch_control_reset(generation))throw new Error(errorText()||'GENERATION_RANGE');
      building=true;let unpublished=0;
      try{
        postMessage({type:'running',requestId,memory:engine.HEAPU8.buffer,controlOffset:engine._arch_control_ptr()});
        await new Promise(resolve=>setTimeout(resolve,0));
        const runtime=await import('../kernel/final-scene-export/float-runtime.mjs');
        if(data.type==='final-float-prepare'){
          const result=runtime.prepareFinalFloat(engine,data.snapshotId,data.request,data.conditioning,generation);unpublished=result.id;
          if(Atomics.load(new Int32Array(engine.HEAPU8.buffer,engine._arch_control_ptr(),4),3)===generation)throw new Error('CANCELLED');
          postMessage({type:'final-float-proposal',requestId,generation,...result,memory:engine.HEAPU8.buffer,controlOffset:engine._arch_control_ptr()});unpublished=0;
        }else{
          const result=runtime.confirmFinalFloat(engine,data.proposalId,data.confirmation,generation);
          if(Atomics.load(new Int32Array(engine.HEAPU8.buffer,engine._arch_control_ptr(),4),3)===generation)throw new Error('CANCELLED');
          postMessage({type:'artifact',requestId,generation,format:'final-scene',...result,memory:engine.HEAPU8.buffer,controlOffset:engine._arch_control_ptr()},[result.bytes.buffer]);
        }
      }finally{if(unpublished)engine._arch_final_float_release(unpublished);completeRootJob();}return;
    }
    if(data.type==='export-final'){
      if(building)throw new Error('BUILD_IN_PROGRESS');
      const {requestId,generation,snapshotId,snapshotGeneration,request}=data;
      if(!Number.isInteger(generation)||generation<1||generation>0xfffffffe||!Number.isInteger(snapshotId)||snapshotId<1||request?.generation!==snapshotGeneration)throw new Error('INVALID_EXPORT_REQUEST');
      if(engine._arch_final_export_version?.()!==1)throw new Error('EXPORT_UNSUPPORTED');
      if(!engine._arch_control_reset(generation))throw new Error(errorText()||'GENERATION_RANGE');
      building=true;
      try{
        postMessage({type:'running',requestId,memory:engine.HEAPU8.buffer,controlOffset:engine._arch_control_ptr()});
        await new Promise(resolve=>setTimeout(resolve,0));
        const {encodeFinalExportOptions,exportFinalFileBytes}=await import('../kernel/final-scene-export/runtime-helper.mjs');
        const result=exportFinalFileBytes(engine,snapshotId,encodeFinalExportOptions(request),generation);
        if(Atomics.load(new Int32Array(engine.HEAPU8.buffer,engine._arch_control_ptr(),4),3)===generation)throw new Error('CANCELLED');
        if(!(result.bytes instanceof Uint8Array)||result.bytes.length>128*1024*1024)throw new Error('OUTPUT_BUDGET');
        postMessage({type:'artifact',requestId,generation,format:'final-scene',...result,memory:engine.HEAPU8.buffer,controlOffset:engine._arch_control_ptr()},[result.bytes.buffer]);
      }finally{completeRootJob();}
      return;
    }
    if(data.type==='export-stl'){
      if(building)throw new Error('BUILD_IN_PROGRESS');
      const {requestId,generation,snapshotId,part}=data;
      if(!Number.isInteger(generation)||generation<1||generation>0xfffffffe||!Number.isInteger(snapshotId)||snapshotId<1||!Number.isInteger(part)||part<0)throw new Error('INVALID_EXPORT_REQUEST');
      if(!engine._arch_export_stl)throw new Error('EXPORT_UNSUPPORTED');
      if(!engine._arch_control_reset(generation))throw new Error(errorText()||'GENERATION_RANGE');
      building=true;let output=0;
      try{
        postMessage({type:'running',requestId,memory:engine.HEAPU8.buffer,controlOffset:engine._arch_control_ptr()});
        await new Promise(resolve=>setTimeout(resolve,0));
        output=engine._arch_export_stl(snapshotId,part,generation);
        if(!output)throw new Error(errorText()||'EXPORT_FAILED');
        const start=engine._arch_output_ptr(output),length=engine._arch_output_len(output);
        if(!start||length<84||length>256*1024*1024||start+length>engine.HEAPU8.byteLength)throw new Error('OUTPUT_ABI');
        const bytes=new Uint8Array(engine.HEAPU8.subarray(start,start+length));
        postMessage({type:'artifact',requestId,generation,format:'stl',bytes,memory:engine.HEAPU8.buffer,controlOffset:engine._arch_control_ptr()},[bytes.buffer]);
      }finally{if(output)engine._arch_output_release(output);completeRootJob();}
      return;
    }
    if(data.type==='export-3mf'){
      if(building)throw new Error('BUILD_IN_PROGRESS');
      const {requestId,generation,snapshotId,snapshotGeneration,request,format}=data;
      if(!Number.isInteger(generation)||generation<1||generation>0xfffffffe||!Number.isInteger(snapshotId)||snapshotId<1||!['core','project'].includes(format))throw new Error('INVALID_EXPORT_REQUEST');
      if(!engine._arch3mf_add_snapshot_part)throw new Error('EXPORT_UNSUPPORTED');
      if(!engine._arch_control_reset(generation))throw new Error(errorText()||'GENERATION_RANGE');
      building=true;
      try{
        postMessage({type:'running',requestId,memory:engine.HEAPU8.buffer,controlOffset:engine._arch_control_ptr()});
        const {createUnifiedPrinting}=await import('../printing/src/unified.mjs');
        const printing=createUnifiedPrinting(engine);
        // UI retains its primary lease. This export owns and consumes one reader.
        const reader=printing.acquireReaderLease(snapshotId,snapshotGeneration);
        const result=await printing.exportSnapshot3MF(reader,request,{format});
        if(Atomics.load(new Int32Array(engine.HEAPU8.buffer,engine._arch_control_ptr(),4),3)===generation)throw new Error('CANCELLED');
        if(!(result.bytes instanceof Uint8Array)||result.bytes.length>128*1024*1024)throw new Error('OUTPUT_BUDGET');
        postMessage({type:'artifact',requestId,generation,format:'3mf',...result,memory:engine.HEAPU8.buffer,controlOffset:engine._arch_control_ptr()},[result.bytes.buffer]);
      }finally{completeRootJob();}
      return;
    }
    if(data.type==='build'){
      if(building)throw new Error('BUILD_IN_PROGRESS');
      const {requestId,generation,request}=data;
      if(!Number.isInteger(generation)||generation<1||generation>0xfffffffe)throw new Error('GENERATION_RANGE');
      if(!request||typeof request!=='object')throw new Error('INVALID_BUILD_REQUEST');
      if(!engine._arch_control_reset(generation))throw new Error(errorText()||'GENERATION_RANGE');
      building=true;
      let published=0;
      try{
      postMessage({type:'running',requestId,memory:engine.HEAPU8.buffer,controlOffset:engine._arch_control_ptr()});
      // Yield once so cancellation can be written by the main thread before
      // entering a synchronous native operation. Native work never runs there.
      await new Promise(resolve=>setTimeout(resolve,0));
      let id=0;
      if(request.kind==='test-fixture'&&engine._arch_test_fixture){
        id=engine._arch_test_fixture(request.index,generation);
      }else if(request.kind==='product'){
        id=productRecipe({...request,transportGeneration:generation});
      }else if(request.kind==='svg'&&engine._arch_build_svg){
        id=buildSVG(request,generation);
      }else{throw new Error('UNSUPPORTED_BUILD_REQUEST');}
      if(!id){failure(requestId,errorText()||'BUILD_FAILED');return;}
      published=id;
      const metadata=metadataFor(id);
      postMessage({type:'snapshot',requestId,generation,id,metadata,memory:engine.HEAPU8.buffer,
        byteOffset:engine._arch_snapshot_ptr(id),byteLength:engine._arch_snapshot_len(id),controlOffset:engine._arch_control_ptr()});
      published=0;
      }finally{if(published)engine._arch_snapshot_release(published);completeRootJob();}
    }
  }catch(error){
    // Preserve only these final-file diagnostics; every other RPC/error keeps its existing code.
    const finalReason=data.type==='export-final'&&error.code==='INVALID_SERIALIZATION'&&
      /^INVALID_SERIALIZATION:(STL_FLOAT_COLLISION|SECTION_SUBGRID_RAW_EDGE)$/.exec(error.message??'');
    failure(data.requestId??null,finalReason&&finalReason[0]===error.message?finalReason[1]:error.code||error.message||'ENGINE_FAILURE',error.proposal??null);
  }
};
