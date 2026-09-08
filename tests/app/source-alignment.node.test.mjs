import test from 'node:test';
import assert from 'node:assert/strict';
import {createSourceContext,sourceConfirmation,sourcePreparation,sourceReceipt} from '../../src/app/source-approval.mjs';
import {testBinding,testFlatReceipt} from './source-approval.fixtures.mjs';
import {createRasterAdapters} from '../../src/integration/raster-adapters.mjs';
import {createTextAdapters} from '../../src/integration/text-adapters.mjs';
import {createProject} from '../../src/domain/index.mjs';
import {appContent} from '../../src/app/documents.mjs';
import {sha256} from '../../src/app/common.mjs';
test('source identity: new imports, same-ID conversion increments, frozen predecessors and overflow',()=>{
 const initial=createSourceContext('import');assert.equal(initial.revision,0);assert.equal(initial.predecessor,null);
 const previous={id:initial.id,revision:7,raw:{hash:'a'.repeat(64)}},converted=createSourceContext('convert',previous);
 assert.equal(converted.id,initial.id);assert.equal(converted.revision,8);assert.deepEqual(converted.predecessor,{id:initial.id,revision:7,rawHash:previous.raw.hash});
 assert.ok(Object.isFrozen(converted)&&Object.isFrozen(converted.predecessor));assert.notEqual(createSourceContext('import',previous).id,initial.id);
 assert.throws(()=>createSourceContext('convert',{...previous,revision:Number.MAX_SAFE_INTEGER}),{code:'SOURCE_REVISION_OVERFLOW'});
 assert.throws(()=>createSourceContext('convert'));
});
test('all three descriptor kinds use one flat schema; absent/extra/nested fields fail',()=>{
 for(const kind of ['raster','text','emoji']){
  const b=testBinding(kind),make=()=>testFlatReceipt({...b.control,...b});assert.equal(sourceReceipt(make(),b).kind,kind);
  for(const key of ['kind','version','approvalHash','proposalHash']){const c={...b.confirmation};delete c[key];assert.throws(()=>sourceConfirmation(c));}
  for(const key of Object.keys(make().receipt)){const r=make();delete r.receipt[key];assert.throws(()=>sourceReceipt(r,b),key);}
  const nested=make();nested.receipt={version:'arch-source-acceptance/1',source:{id:b.source.id},metadata:{}};assert.throws(()=>sourceReceipt(nested,b));
  const wrongProject=make();wrongProject.receipt.projectId='another';assert.throws(()=>sourceReceipt(wrongProject,b));
  const withArtifact=make();b.source.metadata.artifactHash='f'.repeat(64);withArtifact.receipt.artifactHash='f'.repeat(64);
  if(kind==='raster')assert.throws(()=>sourceReceipt(withArtifact,b));else{
   assert.equal(sourceReceipt(withArtifact,b).artifactHash,'f'.repeat(64));
   withArtifact.receipt.artifactHash='c'.repeat(64);assert.throws(()=>sourceReceipt(withArtifact,b),{code:'SOURCE_RECEIPT_ARTIFACT'});
  }
 }
});
test('edited raster conversion rejects implicit reset and actual raster adapter honors controller context',async()=>{
 const b=testBinding('raster',{id:'source-A',revision:6,raw:{hash:'c'.repeat(64)}});
 assert.equal(b.source.revision,7);sourcePreparation(b);
 for(const mutate of [
  b=>{b.source.metadata.rasterPreparation.context.sourceRevision=0;},
  b=>{b.source.metadata.rasterPreparation.input.parentSourceRevision=0;},
  b=>{b.source.metadata.rasterPreparation.context.projectId='other';},
  b=>{b.source.metadata.rasterPreparation.context.baseRevision--;},
  b=>{b.source.metadata.rasterPreparation.input.rgbaHash='0'.repeat(64);},
  b=>{b.source.metadata.rasterPreparation.approvalHash='0'.repeat(64);},
  b=>{b.source.id='another-source';}
 ]){const changed=structuredClone(b);mutate(changed);assert.throws(()=>sourcePreparation(changed));}
 const rawBytes=new Uint8Array([1,2,3]),rgba=new Uint8Array([255,0,0,255]),raw={hash:await sha256(rawBytes),byteLength:3};
 const previous={id:'raster-source',revision:6,kind:'raster',raw,raster:{width:1,height:1,pixelSizeMm:1,rgba:await sha256(rgba)},metadata:{},assetHashes:[]};
 const state=createProject({content:{app:{...appContent(),source:previous}}}),seen=[];
 const marker=()=>Object.assign(Error('TEST transport boundary reached'),{code:'TEST_RUNTIME_REACHED'});
 const runtime={version:'arch-raster-operations/1',async prepareRGBA(_input,c){seen.push(c.sourceContext);throw marker();},async prepareEncoded(_input,c){seen.push(c.sourceContext);throw marker();}};
 const adapter=createRasterAdapters({runtime}).source,control={version:'arch-app-adapters/1',ticket:{id:'test',userId:'u',projectId:'p',revision:state.revision,generation:1},signal:new AbortController().signal,onProgress(){}};
 const input={...control,target:'raster',state,source:previous,assets:new Map([[raw.hash,rawBytes],[previous.raster.rgba,rgba]]),sourceContext:createSourceContext('convert',previous)};
 await assert.rejects(()=>adapter.convert(input),{code:'TEST_RUNTIME_REACHED'});assert.equal(seen[0].id,previous.id);assert.equal(seen[0].revision,7);
 await assert.rejects(()=>adapter.convert({...input,sourceContext:{...input.sourceContext,revision:0}}),{code:'RASTER_SOURCE_CONTEXT'});
 await assert.rejects(()=>adapter.ingest({...control,state,purpose:'source',file:{bytes:rawBytes},sourceContext:createSourceContext('import',previous)}),{code:'TEST_RUNTIME_REACHED'});
 assert.equal(seen[1].revision,0);assert.notEqual(seen[1].id,previous.id);
 // Actual wrapper validation only; no native pixel/mesh algorithm is simulated as a successful result.
});
test('actual text/emoji adapter returns flat receipt matching incremented source context (transport fixture only)',async()=>{
 for(const kind of ['text','emoji']){
  const bytes=new TextEncoder().encode('TEST native transport fixture'),raw={hash:await sha256(bytes),byteLength:bytes.length};
  const previous={id:'actual-text-wrapper',revision:4,kind,raw,metadata:{},assetHashes:[raw.hash]},state=structuredClone(createProject({content:{app:{...appContent(),source:previous}}}));
  state.revision=12;const rgba=new Uint8ClampedArray([255,0,0,255]),png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==','base64'));
  const rgbaHash=await sha256(new Uint8Array(rgba.buffer)),artifactHash='f'.repeat(64),sourceContext=createSourceContext('convert',previous);
  const control={version:'arch-app-adapters/1',ticket:{id:'transport-fixture',userId:'test-user',projectId:'test-project',revision:12,generation:2},signal:new AbortController().signal,onProgress(){},sourceContext};
  const assets=new Map([[raw.hash,bytes]]);let confirms=0;
  const adapter=createTextAdapters({catalog:{font(){},reset(){}},context:()=>({state,assetsMap:assets}),
   // Explicit native transport test double. The actual source adapter constructs/hashes/validates the receipt.
   async invoke(request){
    if(request.op==='source.confirm'){confirms++;return {version:control.version,ticket:request.ticket,status:'confirmed'};}
    assert.equal(request.op,'source.convert');
    return {version:control.version,ticket:request.ticket,sourceContext:request.sourceContext,parameters:{},assembly:{},prepared:{artifactHash,sourceAssets:[],claims:{},geometry:{options:{}}},
     preview:{width:1,height:1,pixelSizeMm:1,data:rgba,png,sha256:rgbaHash,pixelToSourceMm:{},renderer:{}},
     conversion:{status:'proposal',receipt:{ticket:request.ticket,proposalHash:'b'.repeat(64),artifactHash},details:{testTransport:true}}};
   }});
  const proposal=await adapter.convert({...control,target:'raster',state,source:previous,assets});
  const r=proposal.result;for(const a of r.assets??[])assets.set(await sha256(a.bytes),a.bytes);assets.set(rgbaHash,new Uint8Array(rgba.buffer));assets.set(await sha256(png),png);
  const source={...previous,id:sourceContext.id,revision:sourceContext.revision,metadata:{...r.metadata,sourceContext},assetHashes:[...assets.keys()],raster:{width:1,height:1,pixelSizeMm:1,rgba:rgbaHash,preview:await sha256(png),originalPreview:await sha256(png)}};
  const input={...control,confirmation:proposal.confirmation,source,assets,acceptedAtRevision:13};
  const result=await adapter.acceptProposal(input);assert.equal(confirms,1);assert.equal(sourceReceipt(result,{control,...input}).sourceRevision,5);assert.equal(result.receipt.artifactHash,artifactHash);assert.equal(result.receipt.kind,kind);
  await assert.rejects(()=>adapter.acceptProposal(input),{code:'NO_PROPOSAL'});
 }
});
