import {createRasterOperations,createRasterDispatcher,createRasterTransport} from '../../src/core/raster-operations.mjs';
import {createRasterAdapters} from '../../src/integration/raster-adapters.mjs';
import {encodeRasterPNG} from '../../src/core/png-encode.mjs';
import {bufferMap,validatePacket} from '../../src/core/raster-schema.mjs';
import {buildProductRecipe,productSnapshotMetadata} from '../../src/core/product-worker-hook.mjs';
import {packProductRequest,readProductSemantics,readProductHead} from '../../src/core/product-operations.mjs';
import {createMechanicsDomainAdapter} from '../../src/kernel/mechanics/src/domain-adapter.mjs';
import * as domain from '../../src/domain/index.mjs';
import {newDocument,contentEdit,validateState} from '../../src/app/documents.mjs';
import {SourceOperations} from '../../src/app/sources.mjs';
import {createSourceContext,sourceReceipt} from '../../src/app/source-approval.mjs';
import {sha256,canonicalJSON} from '../../src/storage/common.mjs';
const assert=(ok,label)=>{if(!ok)throw Error(label);};
const fail=code=>Object.assign(Error(code),{code});
async function rejects(fn,code){try{await fn();}catch(e){assert(e.code===code,code+' got '+(e.code??e.message));return e;}throw Error('Expected '+code);}
const latch=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};

/** Test-only fixture publication uses the actual controller descriptor/receipt
 * validators. Consent below is an explicit synthetic test action. */
async function acceptedProject(service,grid){
 const base=(await newDocument('keychain')).document.state,map=new Map(),owner=Object.create(SourceOperations.prototype);
 let serial=0;
 const control=(state=base,abort=new AbortController())=>({version:'arch-app-adapters/1',ticket:{id:'callback-'+(++serial),userId:'test-user',projectId:'callback-project',revision:state.revision,generation:serial},signal:abort.signal,onProgress:()=>{}});
 const bytes=await encodeRasterPNG(grid('curve'),{signal:new AbortController().signal});
 const sourceContext=createSourceContext('import',null),c={...control(),state:base,sourceContext,file:{name:'authored-grid.png',mediaType:'image/png',bytes},purpose:'source'};
 const p=await service.source.ingest(c);assert(p.status==='proposal','import awaits explicit consent');
 const result=p.result,raw=await owner.addAsset(bytes,'source',map);
 for(const a of result.assets)await owner.addAsset(a.bytes,a.kind,map);
 const raster=await owner.rasterDescriptor(result.raster,map),preview=await owner.previewDescriptor(result.preview,map);
 const src={id:sourceContext.id,name:c.file.name,mediaType:c.file.mediaType,kind:'raster',revision:0,raw,raster,preview,metadata:structuredClone(result.metadata),assetHashes:[...map.keys()]};
 const assets=new Map([...map].map(([h,a])=>[h,a.bytes]));
 const answer=await service.source.acceptProposal({...c,confirmation:p.confirmation,source:src,assets,acceptedAtRevision:base.revision+1});
 src.metadata.confirmationReceipt=sourceReceipt(answer,{control:c,confirmation:p.confirmation,source:src,acceptedAtRevision:base.revision+1});
 const state=contentEdit(base,(a,n)=>{a.source=src;a.materials=structuredClone(result.materials);a.materialDefaults=structuredClone(result.materials);n.sourceKind='raster';});
 return {state,assets,control:(s=state,a)=>({...control(s,a),state:s,assets}),originalHash:raw.hash};
}

/** Small fixture compositor: official main request packer + main Worker hook.
 * Explicit material/source IDs are test data, not a production palette policy. */
async function productWire(ready,state){
 const {summary}=validatePacket(ready.packet),b=bufferMap(ready.packet),table=new Uint32Array(b.get(23).buffer),palette=new Uint32Array(b.get(7).buffer),colors=new Map();
 for(let i=0;i<palette.length;i+=6){const v=palette[i+1];colors.set(palette[i],(((v&255)*0x1000000)+((v>>>8&255)<<16)+((v>>>16&255)<<8)+255)>>>0);}
 const regions=[];
 for(let i=0;i<table.length;i+=12)regions.push({sourceIndex:i/12,semanticId:BigInt(1000+i/12),provenanceId:BigInt(2000+i/12),material:{role:1,rgba:colors.get(table[i+1]),slot:table[i+1]+1,origin:1,provenanceId:BigInt(4000+i/12)}});
 assert(regions.length===2&&summary.curves>0,'real two-material default curved grid');
 const materials=Array.from({length:9},(_,role)=>({role,rgba:0x30353bff,slot:1,origin:0,provenanceId:BigInt(3000+role)}));
 const provenance={kind:'authored-raster-callback-test/1',regionSources:regions.map((r,i)=>({sourceIndex:r.sourceIndex,sourceKey:'raster-region:'+table[i*12],semanticId:r.semanticId.toString()})),materials:[...materials,...regions.map(r=>r.material)].map(m=>({...m,id:'test-material-'+m.provenanceId})),notes:'Synthetic two-color grid with the actual seven catalog defaults; lifecycle test, not a mechanics qualification.'};
 const record=createMechanicsDomainAdapter(domain)(state),headHash=await sha256(canonicalJSON(state));
 return packProductRequest({domainRecord:record,headHash,sourceHash:summary.sourceHash,sourceId:9000n,provenanceId:9001n,regions,materials,provenance,upstreamBindings:record.records.filter(r=>r.fieldId<=7).sort((a,b)=>a.fieldId-b.fieldId)});
}

export async function callbackLifecycleChecks({test,root,module:M,next,grid,notes}){
 assert(M._arch_product_abi_version?.()===1,'selected main root includes product runtime');
 const local=createRasterOperations(M),dispatcher=createRasterDispatcher(local);
 const runtime=createRasterTransport({call:async(method,request,c)=>dispatcher.dispatch(method,request,['prepareEncoded','prepareRGBA','confirm','buildSourceContext'].includes(method)?{...c,...next()}:c)});
 const service=createRasterAdapters({runtime}),fixture=await acceptedProject(service,grid);
 assert(root.ownedBytes()===0,'fixture holds no native leases');
 const zero=()=>assert(root.ownedBytes()===0,'callback leaked root bytes '+root.ownedBytes());
 const retired=token=>rejects(()=>dispatcher.withSourceReference(token,()=>null),'RASTER_LEASE_RETIRED');
 const original=canonicalJSON(fixture.state),assetDigests=await Promise.all([...fixture.assets].map(async([h,b])=>[h,await sha256(b)]));
 let lastToken=null;
 async function build(ready,c,{releaseGate=null,releaseEntered=null}={}){
  assert(ready.status==='ready'&&ready.coordinateKind===28&&ready.sourceAssemblyRequired,'ready indexed source contract');
  assert(ready.nativeSource.kind==='raster-token'&&typeof ready.nativeSource.token==='string'&&!('acceptedHandle'in ready.nativeSource),'opaque callback source');
  assert(ready.receipt.proposalHash===validatePacket(ready.packet).summary.proposalHash,'callback exact consent');
  const packed=await productWire(ready,c.state),generation=next().generation;
  lastToken=ready.nativeSource.token;
  const id=dispatcher.withSourceReference(lastToken,source=>buildProductRecipe(M,{kind:'product',source,packed},generation));
  assert(id>0,'real product publication');
  const metadata=productSnapshotMetadata(M,id),sem=readProductSemantics(metadata.semanticBytes),head=readProductHead(metadata.descriptor);
  assert(sem.sourceVerdict===0&&sem.mechanicsVerdict===0&&sem.parts.length>2,'finished product includes mechanics/body beyond two art regions');
  assert(metadata.sourceMetadata.confirmation==='accepted-runtime-proposal'&&head.sourceHash===fixture.originalHash,'product bound to original PNG');
  assert(sem.inputRegions.length===2&&metadata.sourceMetadata.sourceLedgerTlvHex.length>0,'source regions and ledger retained');
  let released=false,releaseCalls=0;let releasePromise;
  const bytes=()=>{if(released)throw fail('SNAPSHOT_RELEASED');const p=M._arch_snapshot_ptr(id),n=M._arch_snapshot_len(id);assert(p&&n>=128,'independent live root snapshot');return new Uint8Array(M.HEAPU8.buffer,p,n);};
  const header=new DataView(bytes().buffer,bytes().byteOffset,128),count=header.getUint32(20,true),offset=header.getUint32(48,true),d=new DataView(bytes().buffer,bytes().byteOffset,bytes().byteLength),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<count;i++)for(let axis=0;axis<3;axis++){const v=d.getFloat64(offset+i*24+axis*8,true);min[axis]=Math.min(min[axis],v);max[axis]=Math.max(max[axis],v);}
  const model=Object.freeze({version:'arch-app-adapters/1',ticket:c.ticket,generation,leaseId:'test-root-product:'+id,bytes,metadata,
   stats:{widthMm:max[0]-min[0],depthMm:max[1]-min[1],heightMm:max[2]-min[2],triangles:header.getUint32(24,true),materialCount:new Set(sem.parts.map(p=>p.slot)).size,verdict:'unverified'},
   blocks:sem.parts.map(p=>({id:p.id,label:p.id,kind:p.role===1?'region':'body',materialId:'test-slot-'+p.slot})),
   release(){releaseCalls++;if(releasePromise)return releasePromise;releaseEntered?.resolve();releasePromise=(async()=>{if(releaseGate)await releaseGate.promise;if(!released){released=true;assert(M._arch_snapshot_release(id)===1,'release finished native snapshot');}})();return releasePromise;}
  });
  return {model,id,get releaseCalls(){return releaseCalls;}};
 }
 try{
  await test('callback success: actual default product on same root outlives both raster readers',async()=>{
   const c=fixture.control();let built;
   const result=await service.source.prepareRecipe(c,async ready=>(built=await build(ready,c)).model);
   assert(result===built.model&&typeof result.release==='function','consumer transfers a releasable ModelLease');
   await retired(lastToken);const before=await sha256(new Uint8Array(result.bytes()));
   await service.reset();assert(await sha256(new Uint8Array(result.bytes()))===before,'source reset cannot release independent product');
   const alloc=M._malloc(M.HEAPU8.byteLength+65536);assert(alloc,'force memory growth');
   assert(await sha256(new Uint8Array(result.bytes()))===before,'product view reacquired after grow');M._free(alloc);
   assert(result.stats.triangles>0&&result.stats.heightMm>0,'real model stats');
   await result.release();assert(M._arch_snapshot_len(built.id)===0&&built.releaseCalls===1,'product released once');zero();
  });
  await test('consumer failure: two accepted readers released; unreturned product cleaned by consumer',async()=>{
   await rejects(()=>service.source.prepareRecipe(fixture.control(),ready=>{lastToken=ready.nativeSource.token;assert(root.ownedBytes()>0,'accepted lease alive in consumer');throw fail('TEST_CONSUMER_FAILED');}),'TEST_CONSUMER_FAILED');
   await retired(lastToken);zero();
   const c=fixture.control();let built;
   await rejects(()=>service.source.prepareRecipe(c,async ready=>{built=await build(ready,c);try{throw fail('TEST_AFTER_ALLOCATION');}finally{await built.model.release();}}),'TEST_AFTER_ALLOCATION');
   assert(built.releaseCalls===1&&M._arch_snapshot_len(built.id)===0,'unreturned allocation owner cleaned');await retired(lastToken);zero();
  });
  for(const mode of ['cancel','private-reset','logout'])await test('consumer fulfilled -> '+mode+' before publication releases returned ModelLease and awaits cleanup',async()=>{
   const abort=new AbortController(),c=fixture.control(fixture.state,abort),entered=latch(),returned=latch(),releaseGate=latch(),releaseEntered=latch();let built,settled=false;
   const operation=service.source.prepareRecipe(c,async ready=>{built=await build(ready,c,{releaseGate,releaseEntered});entered.resolve();return returned.promise;});
   const outcome=operation.then(v=>{settled=true;return {value:v};},error=>{settled=true;return {error};});
   await entered.promise;
   // Resolve consumer FIRST, then invalidate before the adapter continuation.
   returned.resolve(built.model);
   let reset;
   if(mode==='cancel')abort.abort();
   else {if(mode==='logout')abort.abort('test identity invalidated');reset=service.reset();}
   await reset; // This must not wait for the still-pending controller operation.
   await Promise.race([releaseEntered.promise,outcome.then(()=>{throw Error('Final guard omitted returned ModelLease release');})]);
   // Let all promise/finally continuations drain: a non-awaited release must fail.
   await new Promise(resolve=>setTimeout(resolve,0));
   assert(!settled,'post-consume guard awaits returned async release');
   assert(built.releaseCalls===1&&M._arch_snapshot_len(built.id)>0,'exact final release path entered');
   releaseGate.resolve();const result=await outcome;
   assert(result.error?.code===(mode==='cancel'?'RASTER_CANCELLED':'RASTER_PRIVATE_RESET')&&!result.value,'no partial publication');
   assert(built.releaseCalls===1&&M._arch_snapshot_len(built.id)===0,'returned independent product retired');await retired(lastToken);zero();
  });
  await test('unapproved/changed raster produces proposal and never invokes consumer; stale receipt rejects',async()=>{
   for(const mode of ['unapproved','changed']){
    const state=structuredClone(fixture.state);if(mode==='unapproved')delete state.content.app.source.metadata.confirmationReceipt;
    else {state.parameters.common.eps={origin:'user',value:36};state.revision++;}
    validateState(state);let calls=0;const c={...fixture.control(state),sourceContext:createSourceContext('convert',state.content.app.source)};
    const result=await service.source.prepareRecipe(c,()=>{calls++;throw fail('UNAPPROVED_CONSUMER');});
    assert(result.status==='proposal'&&calls===0&&!result.sourceProposal.result.metadata.confirmationReceipt,'new proposal stays unapproved');
    if(mode==='changed')assert(result.sourceProposal.confirmation.proposalHash!==fixture.state.content.app.source.metadata.confirmationReceipt.proposalHash,'changed eps exact new hash');zero();
   }
   const stale=structuredClone(fixture.state);stale.content.app.source.metadata.confirmationReceipt.proposalHash='0'.repeat(64);
   await rejects(()=>service.source.prepareRecipe(fixture.control(stale),()=>{throw fail('STALE_CONSUMER');}),'RASTER_CONFIRMATION_STALE');zero();
  });
  await test('legacy direct Module scheduling: standalone works; callback requires product transport',async()=>{
   // Direct binding remains scheduler-owned and deliberately has no productSource.
   const direct=createRasterOperations(M),scheduled={...direct};
   for(const method of ['prepareEncoded','prepareRGBA'])scheduled[method]=(request,c)=>direct[method](request,{...c,...next()});
   scheduled.confirm=(p,h,c)=>direct.confirm(p,h,{...c,...next()});
   const legacy=createRasterAdapters({runtime:scheduled});let calls=0;
   assert((await legacy.source.prepareRecipe(fixture.control())).status==='ready','standalone direct binding remains supported');zero();
   await rejects(()=>legacy.source.prepareRecipe(fixture.control(),()=>{calls++;}),'RASTER_PRODUCT_TRANSPORT_REQUIRED');
   assert(calls===0,'legacy cannot invoke consumer');await legacy.reset();zero();
   await rejects(()=>service.source.prepareRecipe(fixture.control(),{}),'RASTER_SOURCE_CONSUMER');
  });
  assert(canonicalJSON(fixture.state)===original,'lifecycle tests never mutate source/project');
  for(const [h,digest]of assetDigests)assert(await sha256(fixture.assets.get(h))===digest,'original/derived immutable asset '+h);
 }finally{await service.reset();}
 notes.push('Callback tests use main createRasterDispatcher.withSourceReference + buildProductRecipe on the single injected root Module; actual finished product snapshots/APMS, not a flat source extrusion. ModelLease host wrapper and identity/logout invalidation are explicit test harnesses; real Worker termination is covered separately.');
}