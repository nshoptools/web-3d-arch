import {handleMeshMessage,releaseLateMeshResult} from '../mesh-import/src/root-client.mjs';
import {checkedEngineIntegrity,checkedRuntimeProof} from './runtime-integrity.mjs';
import {encodeSourceFrame} from './source-frame.mjs';

export class EngineError extends Error {
  constructor(code,proposal=null){super(code);this.name='EngineError';this.code=code;this.proposal=proposal;}
}

function captureRequest(message){
  let owned;
  try{owned=structuredClone(message);}catch{throw new EngineError('REQUEST_SERIALIZATION');}
  // structuredClone preserves shared backing memory. Requests use owned input
  // bytes or registered snapshot IDs; borrowed mutable WASM views are rejected.
  const pending=[owned],seen=new Set();
  while(pending.length){
    const value=pending.pop();if(!value||typeof value!=='object'||seen.has(value))continue;
    seen.add(value);
    const buffer=ArrayBuffer.isView(value)?value.buffer:value;
    if(typeof SharedArrayBuffer!=='undefined'&&buffer instanceof SharedArrayBuffer)throw new EngineError('REQUEST_SHARED_MEMORY');
    if(ArrayBuffer.isView(value)||value instanceof ArrayBuffer)continue;
    if(value instanceof Map){for(const [key,item]of value)pending.push(key,item);}
    else if(value instanceof Set){for(const item of value)pending.push(item);}
    else pending.push(...Object.values(value));
  }
  return owned;
}

/** Dedicated Worker controller. Main-thread waits are Promises/timers only.
 * Snapshot bytes are immutable and owned through explicit leases. */
export class EngineClient {
  constructor({moduleURL,workerURL=new URL(/* @vite-ignore */ './engine-worker.mjs',import.meta.url),integrity=null,textConfig=null,createTextRenderer=null,watchdogMs=45000,cancelGraceMs=350,onStatus=()=>{}}){
    this.moduleURL=new URL(moduleURL,location.href).href;this.workerURL=workerURL;
    this.runtimeIntegrity=null;this.integrity=integrity===null?null:checkedEngineIntegrity(captureRequest(integrity),new URL(location.href).origin,this.moduleURL);
    this.watchdogMs=watchdogMs;this.cancelGraceMs=cancelGraceMs;this.onStatus=onStatus;
    this.worker=null;this.epoch=0;this.requestSequence=0;this.latestTicket=0;
    this.active=null;this.memory=null;this.readyPromise=null;this.initialization=null;this.disposed=false;
    this.textConfig=captureRequest(textConfig);
    if(createTextRenderer!==null&&(!this.textConfig||typeof createTextRenderer!=='function'))throw new EngineError('TEXT_RENDERER_FACTORY');
    this.createTextRenderer=createTextRenderer;this.textRenderer=null;
    this.registryPending=new Map();this.retirementListeners=new Set();
    this.productSourceLeases=new Map();this.productProposals=new Map();this.rasterTokens=new Set();
    this.snapshotLeases=new WeakMap();
    this.finalFloatLeases=new WeakMap();
  }
  async start(){
    if(this.disposed)throw new EngineError('ENGINE_DISPOSED');
    if(this.readyPromise)return this.readyPromise;
    if(!crossOriginIsolated||typeof SharedArrayBuffer==='undefined')throw new EngineError('CORE_UNAVAILABLE');
    const epoch=++this.epoch;
    const worker=this.worker=new Worker(this.workerURL,{type:'module',name:'arch-engine'});
    this.readyPromise=new Promise((resolve,reject)=>{
      let initialized=false;
      const timer=setTimeout(()=>{if(!initialized&&epoch===this.epoch)this.terminate('ENGINE_INIT_TIMEOUT');},20000);
      this.initialization={epoch,abort:code=>{clearTimeout(timer);if(!initialized)reject(new EngineError(code));}};
      worker.onerror=()=>{if(epoch!==this.epoch)return;this.terminate('ENGINE_CRASH');};
      worker.onmessage=({data})=>{
        if(epoch!==this.epoch)return;
        if(data.type==='text-renderer-needed'){
          let channel,renderer;
          try{
            if(initialized||this.textRenderer||!this.createTextRenderer||this.textConfig?.runtime?.engine!=='webkit'||data.capabilities?.canvas2d!==false)
              throw new EngineError('TEXT_RENDERER_HANDSHAKE');
            channel=new MessageChannel();
            renderer=this.createTextRenderer({port:channel.port1,capabilities:captureRequest(data.capabilities),runtime:captureRequest(this.textConfig.runtime),
              isCurrent:expected=>{
                const active=this.active;
                return epoch===this.epoch&&worker===this.worker&&active?.type==='text-operation'&&!active.cancelled&&
                  active.sourceToken?.sourceId===expected?.sourceId&&active.sourceToken?.revision===expected?.revision;
              }});
            if(!renderer||typeof renderer.dispose!=='function')throw new EngineError('TEXT_RENDERER_FACTORY');
            this.textRenderer=renderer;
            worker.postMessage({type:'text-renderer-init',port:channel.port2},[channel.port2]);
          }catch(error){
            channel?.port1.close();channel?.port2.close();
            if(renderer!==this.textRenderer)renderer?.dispose?.();
            clearTimeout(timer);reject(new EngineError(error.code??'TEXT_RENDERER_INIT'));this.terminate(error.code??'TEXT_RENDERER_INIT');
          }
          return;
        }
        if(data.type==='ready'){
          if(initialized){this.terminate('DUPLICATE_READY');return;}
          if(data.abi!==2||!(data.memory instanceof SharedArrayBuffer)||!Number.isSafeInteger(data.controlOffset)||data.controlOffset<0||data.controlOffset%4!==0||data.controlOffset>data.memory.byteLength-16){this.terminate('CORE_ABI_MISMATCH');return;}
          let proof;try{proof=checkedRuntimeProof(data.runtimeIntegrity,this.integrity,new URL(location.href).origin,this.moduleURL);}catch(error){this.terminate(error.code??'RUNTIME_INTEGRITY_MISMATCH');return;}
          const frameVersion=data.serviceCapabilities?.sourceFrameVersion??null;
          if(frameVersion!==null&&(data.abi!==2||frameVersion!==1)){this.terminate('SOURCE_FRAME_ABI');return;}
          const printing=data.serviceCapabilities?.printingVersions??null;
          if(printing!==null&&(data.abi!==2||printing.rootABI!==2||printing.arch3mfABI!==1||printing.kernel3mfABI!==2)){
            this.terminate('PRINTING_ABI_MISMATCH');return;
          }
          clearTimeout(timer);initialized=true;this.initialization=null;this.memory=data.memory;this.controlOffset=data.controlOffset;
          this.serviceCapabilities=Object.freeze({...data.serviceCapabilities,printingVersions:printing===null?null:Object.freeze({...printing,epoch})});
          this.runtimeIntegrity=proof;this.onStatus({phase:'ready'});resolve(this);return;
        }
        if(data.type==='failed'&&!initialized){clearTimeout(timer);reject(new EngineError(data.code));this.terminate(data.code);return;}
        const registry=this.registryPending.get(data.requestId);
        if(registry){
          this.registryPending.delete(data.requestId);clearTimeout(registry.timeout);
          if(data.memory){this.memory=data.memory;this.controlOffset=data.controlOffset;}
          if(data.type==='failed')registry.reject(new EngineError(data.code));
          else if(data.type!=='raster-result'||data.method!==registry.method)registry.reject(new EngineError('RASTER_RESULT_ABI'));
          else {if(data.result?.token)this.rasterTokens.add(data.result.token);registry.resolve(data.result);}
          return;
        }
        if(!this.active||data.requestId!==this.active.id){
          releaseLateMeshResult(data,worker);
          if(data.type==='snapshot')worker.postMessage({type:'release',id:data.id});
          if(data.type==='final-float-proposal')worker.postMessage({type:'final-float-release',id:data.id});
          if(data.type==='raster-result')this.releaseRasterResult(data.result,worker,epoch);
          if(data.type==='raster-source')worker.postMessage({type:'source-raster-release',id:data.id});
          if(data.proposal?.id)worker.postMessage({type:'product-release-proposal',id:data.proposal.id});
          return;
        }
        const active=this.active;
        if(data.memory){this.memory=data.memory;this.controlOffset=data.controlOffset;}
        if(data.type==='running'){
          if(active.cancelled)this.writeCancel();
          this.onStatus({phase:'running',generation:active.generation});return;
        }
        if(data.type==='failed'){
          let proposal=data.proposal?Object.freeze({...data.proposal,epoch}):null;
          if(active.cancelled&&proposal?.id){worker.postMessage({type:'product-release-proposal',id:proposal.id});proposal=null;}
          if(proposal)this.productProposals.set(proposal.id,proposal);
          const failed=new EngineError(active.cancelled?'CANCELLED':data.code,proposal);if(typeof data.detail==='string'&&data.detail)failed.detail=data.detail.slice(0,512);
          this.finish(false,failed);return;
        }
        if(data.type==='raster-source'){
          if(active.cancelled||data.generation!==active.generation||!['source-raster-prepare','source-raster-confirm'].includes(active.type)){
            worker.postMessage({type:'source-raster-release',id:data.id});this.finish(false,new EngineError(active.cancelled?'CANCELLED':'STALE_GENERATION'));return;
          }
          if(!(data.summary instanceof Uint8Array)||data.summary.length!==256){worker.postMessage({type:'source-raster-release',id:data.id});this.finish(false,new EngineError('RASTER_BUFFER_ABI'));return;}
          this.productSourceLeases.set(data.id,{kind:'raster',generation:data.generation,epoch});
          let released=false;const lease=Object.freeze({id:data.id,epoch,generation:data.generation,summary:data.summary,metadata:data.metadata,regions:data.regions,palette:data.palette,options:data.options,
            assertOwned:()=>{if(released)throw new EngineError('SNAPSHOT_RELEASED');if(epoch!==this.epoch)throw new EngineError('SNAPSHOT_RETIRED');},
            release:()=>{if(!released){released=true;if(epoch===this.epoch){this.productSourceLeases.delete(data.id);worker.postMessage({type:'source-raster-release',id:data.id});}}}
          });this.finish(true,lease);return;
        }
        if(data.type==='product-receipt'){
          if(active.cancelled){this.finish(false,new EngineError('CANCELLED'));return;}
          if(active.type!=='product-confirm'||data.generation!==active.generation||!(data.receipt instanceof Uint8Array)||data.receipt.length!==192){this.finish(false,new EngineError('PRODUCT_RECEIPT_ABI'));return;}
          this.finish(true,data.receipt);return;
        }
        if(data.type==='source-progress'){
          if(data.generation!==active.generation||active.type!=='text-operation')return;
          if(!active.cancelled)this.onStatus({phase:'processing',stage:data.stage,generation:active.generation,progress:data.progress});return;
        }
        if(data.type==='text-result'){
          if(active.cancelled){this.finish(false,new EngineError('CANCELLED'));return;}
          if(active.type!=='text-operation'||data.generation!==active.generation||data.result?.version!=='arch-app-adapters/1'){
            this.finish(false,new EngineError('TEXT_RESULT_ABI'));return;
          }
          this.finish(true,data.result);return;
        }
        if(data.type==='raster-result'){
          if(active.cancelled||active.type!=='raster-operation'||data.method!==active.method||data.generation!==active.generation){
            this.releaseRasterResult(data.result,worker,epoch);
            this.finish(false,new EngineError(active.cancelled?'CANCELLED':'RASTER_RESULT_ABI'));return;
          }
          if(data.result?.token)this.rasterTokens.add(data.result.token);
          this.finish(true,data.result);return;
        }
        if(data.type==='source-preview'){
          if(active.cancelled){this.finish(false,new EngineError('CANCELLED'));return;}
          if(data.generation!==active.generation||data.preview?.version!==1||!(data.preview.png instanceof Uint8Array)){
            this.finish(false,new EngineError('PREVIEW_ABI'));return;
          }
          this.finish(true,{preview:data.preview,metadata:data.metadata});return;
        }
        if(data.type==='final-float-proposal'){
          if(active.cancelled||active.type!=='final-float-prepare'||data.generation!==active.generation){worker.postMessage({type:'final-float-release',id:data.id});this.finish(false,new EngineError(active.cancelled?'CANCELLED':'FLOAT_RESULT_ABI'));return;}
          const valid=data.metadata?.version==='arch-final-float-proposal/1'&&Array.isArray(data.buffers)&&data.buffers.length===8&&data.buffers.every((b,i)=>b.kind===i+1&&Number.isInteger(b.byteOffset)&&b.byteOffset>0&&Number.isInteger(b.byteLength)&&b.byteLength>=0&&b.byteLength<=4*1024*1024&&b.byteOffset+b.byteLength<=this.memory.byteLength&&b.byteOffset%([1,3].includes(b.kind)?8:4)===0&&b.byteLength%([1,3].includes(b.kind)?8:4)===0);
          if(!valid){worker.postMessage({type:'final-float-release',id:data.id});this.finish(false,new EngineError('FLOAT_RESULT_ABI'));return;}
          let released=false;
          const lease=Object.freeze({version:'arch-final-float-proposal/1',id:data.id,epoch,confirmation:Object.freeze({...data.metadata.confirmation}),metadata:data.metadata,
            view:kind=>{this.assertFinalFloat(lease);if(!Number.isInteger(kind)||kind<1||kind>8)throw new EngineError('FLOAT_BUFFER_KIND');const b=data.buffers[kind-1],T=kind===1||kind===3?Float64Array:Uint32Array;return new T(new T(this.memory,b.byteOffset,b.byteLength/T.BYTES_PER_ELEMENT));},
            release:()=>{if(released)return;released=true;const owned=this.finalFloatLeases.get(lease);if(owned)owned.released=true;if(epoch===this.epoch&&worker===this.worker)worker.postMessage({type:'final-float-release',id:data.id});}});
          this.finalFloatLeases.set(lease,{id:data.id,epoch,released:false});this.finish(true,lease);return;
        }
        if(handleMeshMessage(this,data,worker,epoch))return;
        if(data.type==='artifact'){

          if(active.cancelled){this.finish(false,new EngineError('CANCELLED'));return;}
          const expected=active.type==='final-scene-geometry'?'final-scene-geometry':active.type==='export-3mf'?'3mf':['export-final','final-float-confirm'].includes(active.type)?'final-scene':'stl';
          if(data.generation!==active.generation||data.format!==expected||!(data.bytes instanceof Uint8Array)){this.finish(false,new EngineError('OUTPUT_ABI'));return;}
          this.finish(true,expected==='3mf'?{bytes:data.bytes,metadata:data.metadata,report:data.report}:['final-scene','final-scene-geometry'].includes(expected)?{bytes:data.bytes,metadata:data.metadata}:data.bytes);return;
        }
        if(data.type==='snapshot'){
          if(active.cancelled){worker.postMessage({type:'release',id:data.id});this.finish(false,new EngineError('CANCELLED'));return;}
          if(data.generation!==active.generation){worker.postMessage({type:'release',id:data.id});this.finish(false,new EngineError('STALE_GENERATION'));return;}
          this.productSourceLeases.set(data.id,{kind:'snapshot',generation:data.generation,epoch});
          let released=false;
          const lease=Object.freeze({
            id:data.id,generation:data.generation,epoch,byteLength:data.byteLength,metadata:data.metadata,
            bytes:()=>{
              if(released)throw new EngineError('SNAPSHOT_RELEASED');
              if(epoch!==this.epoch)throw new EngineError('SNAPSHOT_RETIRED');
              // Always obtain a fresh view; memory.grow replaces the buffer
              // exposed by Emscripten, while the lease's offset stays stable.
              return new Uint8Array(this.memory,data.byteOffset,data.byteLength);
            },
            release:()=>{if(!released){released=true;const owned=this.snapshotLeases.get(lease);if(owned)owned.released=true;if(epoch===this.epoch){this.productSourceLeases.delete(data.id);worker.postMessage({type:'release',id:data.id});}}}
          });
          this.snapshotLeases.set(lease,{id:data.id,generation:data.generation,epoch});
          this.finish(true,lease);
        }
      };
    });
    worker.postMessage({type:'init',moduleURL:this.moduleURL,integrity:this.integrity,textConfig:this.textConfig,textRendererAvailable:!!this.createTextRenderer});
    return this.readyPromise;
  }
  build(request,{generation}={}){
    let requiredEpoch=null;
    if(request?.kind==='product'&&request.source?.kind!=='svg'){
      const source=request.source,refs=source?.kind==='contexts'?source.contexts:[source];
      if(!Array.isArray(refs)||!refs.length)return Promise.reject(new EngineError('PRODUCT_SOURCE_LEASE_OWNERSHIP'));
      for(const ref of refs){
        if(!ref||ref.epoch!==this.epoch)return Promise.reject(new EngineError('SNAPSHOT_RETIRED'));
        if(ref.token){if(!this.rasterTokens.has(ref.token))return Promise.reject(new EngineError('PRODUCT_SOURCE_LEASE_OWNERSHIP'));continue;}
        const id=source.kind==='raster'?ref.acceptedHandle:ref.id,owned=this.productSourceLeases.get(id),kind=source.kind==='raster'?'raster':'snapshot';
        if(!owned||owned.kind!==kind||owned.epoch!==ref.epoch||(kind==='snapshot'&&owned.generation!==ref.generation))
          return Promise.reject(new EngineError('PRODUCT_SOURCE_LEASE_OWNERSHIP'));
      }
      requiredEpoch=this.epoch;
    }
    return this.operation({type:'build',request},generation,requiredEpoch);
  }
  async probeProduct(recipe,{generation}={}){
    try{
      const unexpected=await this.build({...recipe,datumProbe:true},{generation});
      unexpected.release();throw new EngineError('PRODUCT_DATUM_PROBE_RETURNED_MODEL');
    }catch(error){
      if(error.code==='PRODUCT_DATUM_PROBE'&&error.proposal)return error.proposal;
      throw error;
    }
  }
  textOperation(request,{generation}={}){return this.operation({type:'text-operation',request},generation);}
  prepareRaster(request,{generation}={}){return this.operation({type:'source-raster-prepare',request},generation);}
  confirmRaster(lease,acceptedHash,{generation}={}){
    lease.assertOwned();return this.operation({type:'source-raster-confirm',id:lease.id,acceptedHash},generation,lease.epoch);
  }
  releaseProductProposal(proposal){
    if(proposal?.epoch===this.epoch&&this.productProposals.get(proposal.id)===proposal){
      this.productProposals.delete(proposal.id);this.worker?.postMessage({type:'product-release-proposal',id:proposal.id});
    }
  }
  confirmProduct(proposal,current,{generation}={}){
    if(!proposal||proposal.epoch!==this.epoch)return Promise.reject(new EngineError('SNAPSHOT_RETIRED'));
    if(this.productProposals.get(proposal.id)!==proposal)return Promise.reject(new EngineError('PRODUCT_PROPOSAL_OWNERSHIP'));
    return this.operation({type:'product-confirm',proposalId:proposal.id,descriptor:proposal.descriptor,current},generation,proposal.epoch);
  }
  rasterOperation(method,request,{generation,epoch=null}={}){
    if(!['prepareEncoded','prepareRGBA','confirm','buildSourceContext'].includes(method))return Promise.reject(new EngineError('RASTER_METHOD'));
    if(epoch!==null&&(epoch!==this.epoch||!this.worker))return Promise.reject(new EngineError('RASTER_RUNTIME_RETIRED'));
    return this.operation({type:'raster-operation',method,request},generation,epoch);
  }
  /** Registry calls share the live Worker queue but do not supersede jobs, allocate
   * generations, or initialize a replacement runtime for an old token. */
  async rasterRegistry(method,request,{epoch=this.epoch}={}){
    if(!['copy','acquire','release','reset'].includes(method))throw new EngineError('RASTER_METHOD');
    request=captureRequest(request);
    if(!this.worker||!this.readyPromise||epoch!==this.epoch)throw new EngineError('RASTER_RUNTIME_RETIRED');
    await this.readyPromise;
    if(!this.worker||epoch!==this.epoch)throw new EngineError('RASTER_RUNTIME_RETIRED');
    const id=++this.requestSequence;
    return new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{if(this.registryPending.has(id))this.terminate('REGISTRY_WATCHDOG');},this.watchdogMs);
      this.registryPending.set(id,{method,resolve,reject,timeout});
      if(method==='release')this.rasterTokens.delete(request.token);
      if(method==='reset')this.rasterTokens.clear();
      try{this.worker.postMessage({type:'raster-registry',requestId:id,method,request});}
      catch{clearTimeout(timeout);this.registryPending.delete(id);reject(new EngineError('REQUEST_SERIALIZATION'));}
    });
  }
  releaseRasterResult(result,worker,epoch){
    if(epoch===this.epoch&&worker===this.worker&&typeof result?.token==='string'){
      this.rasterTokens.delete(result.token);
      worker.postMessage({type:'raster-registry',requestId:0,method:'release',request:{token:result.token}});
    }
  }
  onRetirement(callback){
    if(typeof callback!=='function')throw new EngineError('RETIREMENT_CALLBACK');
    this.retirementListeners.add(callback);return()=>this.retirementListeners.delete(callback);
  }
  previewSVG(request,{generation,resolution=520,includeRGBA=false}={}){
    return this.operation({type:'source-preview',request,resolution,includeRGBA},generation);
  }
  exportSTL(lease,part,{generation}={}){
    this.assertSnapshot(lease);
    return this.operation({type:'export-stl',snapshotId:lease.id,part},generation,lease.epoch);
  }
  export3MF(lease,request,{generation,format='core'}={}){
    this.assertSnapshot(lease);
    return this.operation({type:'export-3mf',snapshotId:lease.id,snapshotGeneration:lease.generation,request,format},generation,lease.epoch);
  }
  assertSnapshot(lease){
    if(lease?.epoch!==this.epoch)throw new EngineError('SNAPSHOT_RETIRED');
    const owned=this.snapshotLeases.get(lease);
    if(!owned||owned.id!==lease.id||owned.generation!==lease.generation)throw new EngineError('SNAPSHOT_LEASE_OWNERSHIP');
    if(owned.released)throw new EngineError('SNAPSHOT_RELEASED');
    lease.bytes();
  }
  finalExport(lease,options,{generation}={}){
    this.assertSnapshot(lease);
    const request=captureRequest(options);
    if(!request||typeof request!=='object'||Array.isArray(request))throw new EngineError('FINAL_OPTIONS_REQUIRED');
    if(request.generation!==undefined&&request.generation!==lease.generation)throw new EngineError('SNAPSHOT_GENERATION');
    request.generation=lease.generation;
    return this.operation({type:'export-final',snapshotId:lease.id,snapshotGeneration:lease.generation,request},generation,lease.epoch);
  }
  sourceFrame(lease,options,{generation}={}){
    this.assertSnapshot(lease);
    if(this.serviceCapabilities?.sourceFrameVersion!==1)throw new EngineError('SOURCE_FRAME_ABI');
    const request=captureRequest(options);encodeSourceFrame(lease.id,lease.generation,request);
    return this.operation({type:'source-frame',snapshotId:lease.id,snapshotGeneration:lease.generation,request},generation,lease.epoch);
  }
  finalSceneGeometry(lease,request,{generation}={}){
    this.assertSnapshot(lease);return this.operation({type:'final-scene-geometry',snapshotId:lease.id,snapshotGeneration:lease.generation,request:captureRequest(request)},generation,lease.epoch);
  }
  prepareFinalFloat(lease,options,conditioning,{generation}={}){
    this.assertSnapshot(lease);const request=captureRequest(options),policy=captureRequest(conditioning);
    if(!request||typeof request!=='object'||Array.isArray(request))throw new EngineError('FINAL_OPTIONS_REQUIRED');
    if(request.generation!==undefined&&request.generation!==lease.generation)throw new EngineError('SNAPSHOT_GENERATION');
    request.generation=lease.generation;
    return this.operation({type:'final-float-prepare',snapshotId:lease.id,snapshotGeneration:lease.generation,request,conditioning:policy},generation,lease.epoch);
  }
  assertFinalFloat(proposal){
    if(proposal?.epoch!==this.epoch)throw new EngineError('SNAPSHOT_RETIRED');
    const owned=this.finalFloatLeases.get(proposal);if(!owned||owned.id!==proposal.id||owned.epoch!==proposal.epoch)throw new EngineError('FLOAT_PROPOSAL_OWNERSHIP');
    if(owned.released)throw new EngineError('FLOAT_PROPOSAL_RELEASED');
  }
  confirmFinalFloat(proposal,confirmation,{generation}={}){
    this.assertFinalFloat(proposal);return this.operation({type:'final-float-confirm',proposalId:proposal.id,confirmation:captureRequest(confirmation)},generation,proposal.epoch);
  }
  releaseFinalFloat(proposal){
    const owned=this.finalFloatLeases.get(proposal);if(!owned){if(proposal?.epoch!==this.epoch)return;throw new EngineError('FLOAT_PROPOSAL_OWNERSHIP');}proposal.release();
  }
  async operation(message,generation,requiredEpoch=null){
    if(!Number.isInteger(generation)||generation<1||generation>0xfffffffe)throw new EngineError('GENERATION_RANGE');
    // Capture the requested source/profile before initialization or cancellation
    // yields. Later caller edits must not change the job that was dispatched.
    // Reject unsupported values before disturbing the current operation.
    message=captureRequest(message);
    const ticket=++this.latestTicket;
    if(this.active)await this.cancel();
    if(ticket!==this.latestTicket)throw new EngineError('SUPERSEDED');
    await this.start();
    if(ticket!==this.latestTicket)throw new EngineError('SUPERSEDED');
    if(requiredEpoch!==null&&requiredEpoch!==this.epoch)throw new EngineError('SNAPSHOT_RETIRED');
    const id=++this.requestSequence;
    return new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>this.terminate('ENGINE_WATCHDOG'),this.watchdogMs);
      const poll=setInterval(()=>{
        if(!this.memory)return;
        const control=new Int32Array(this.memory,this.controlOffset,4);
        this.onStatus({phase:'processing',generation,progress:Math.max(0,Math.min(1000,Atomics.load(control,2)))/1000});
      },100);
      const source=message.request?.state?.content?.app?.source,requestTicket=message.request?.ticket;
      const sourceToken=message.type==='text-operation'?{sourceId:source?.id??requestTicket?.projectId+'/text',revision:source?.revision??requestTicket?.revision}:null;
      this.active={id,generation,type:message.type,method:message.method,sourceToken,resolve,reject,timeout,poll,cancelled:false,cancelDone:[]};
      try{this.worker.postMessage({...message,requestId:id,generation});}
      catch{this.finish(false,new EngineError('REQUEST_SERIALIZATION'));}
    });
  }
  writeCancel(){if(this.memory&&this.active)Atomics.store(new Int32Array(this.memory,this.controlOffset,4),3,this.active.generation);}
  async cancel(){
    const active=this.active;if(!active)return;
    if(active.cancelled)return new Promise(resolve=>active.cancelDone.push(resolve));
    active.cancelled=true;this.writeCancel();
    if(active.type==='text-operation')this.worker?.postMessage({type:'cancel-text',requestId:active.id,generation:active.generation});
    active.cancelTimer=setTimeout(()=>{if(this.active===active)this.terminate('CANCELLED');},this.cancelGraceMs);
    return new Promise(resolve=>active.cancelDone.push(resolve));
  }
  finish(ok,value){
    const active=this.active;if(!active)return;
    this.active=null;clearTimeout(active.timeout);clearTimeout(active.cancelTimer);clearInterval(active.poll);
    if(ok)active.resolve(value);else active.reject(value);
    for(const resolve of active.cancelDone)resolve();
    this.onStatus({phase:ok?'complete':value.code==='CANCELLED'?'cancelled':'failed',generation:active.generation,code:ok?undefined:value.code});
  }
  terminate(code){
    const initialization=this.initialization;this.initialization=null;initialization?.abort(code);
    this.worker?.terminate();this.worker=null;this.readyPromise=null;this.memory=null;this.runtimeIntegrity=null;this.epoch++;
    this.serviceCapabilities=Object.freeze({...this.serviceCapabilities,printingVersions:null,sourceFrameVersion:null});
    const renderer=this.textRenderer;this.textRenderer=null;try{renderer?.dispose();}catch{}
    this.productSourceLeases.clear();this.productProposals.clear();this.rasterTokens.clear();
    this.snapshotLeases=new WeakMap();
    for(const pending of this.registryPending.values()){clearTimeout(pending.timeout);pending.reject(new EngineError(code));}
    this.registryPending.clear();
    for(const listener of [...this.retirementListeners]){try{listener(code);}catch{}}
    this.finish(false,new EngineError(code));this.onStatus({phase:'unavailable',code});
  }
  dispose(){this.disposed=true;this.latestTicket++;this.terminate('ENGINE_DISPOSED');}
}
