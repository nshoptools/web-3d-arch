import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createServer} from 'node:http';
import {M,client,operation,raster,svg,svgState,rasterState,setLive,controlFor,noOwned} from '../product-app/harness.mjs';
import {createProductSourceContexts} from '../../src/integration/product-source-contexts.mjs';
import {createProductAdapters} from '../../src/integration/product-adapters.mjs';
import {createTextAdapters} from '../../src/integration/text-adapters.mjs';import {createSourceCatalog} from '../../src/integration/source-catalog.mjs';
import {createEngineTextService} from '../../src/core/engine-text-service.mjs';import {createSourceContext} from '../../src/app/source-approval.mjs';
import {sha256,canonicalJSON} from '../../src/storage/common.mjs';import {appContent,validateState} from '../../src/app/documents.mjs';import * as domain from '../../src/domain/index.mjs';
import {inspectMesh,readSnapshot} from '../oracles/mesh-oracle.mjs';
const run=process.env.PROJECT_REVIEW_RUN,{applySourceFrame}=await import(pathToFileURL(process.env.PRODUCT_FRAME_HELPER??path.resolve('src/core/source-frame.mjs')));
assert.equal(M._arch_source_frame_version(),1);
const fixture=JSON.parse(fs.readFileSync(path.join(run,'inputs/source-fixture.json'))),server=createServer((req,res)=>{const h=req.url.slice(1);if(!fixture.actualAssets.some(r=>r.sha256===h)){res.writeHead(404);res.end();return;}res.end(fs.readFileSync(path.join(run,'inputs/library',h)));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,assetURLs=fixture.assetRecords.map(r=>({...r,url:origin+'/'+r.sha256})),catalog=createSourceCatalog({catalog:fixture.catalog,assetURLs,origin});
const service=createEngineTextService(M,{catalog:fixture.catalog,assetURLs,origin,runtime:{engine:'node',version:process.versions.node}},{origin});
client.serviceCapabilities={sourceFrameVersion:M._arch_source_frame_version(),geometryVersions:{mechanicsAbi:M._arch_mech_abi_version(),mechanicsSemantics:M._arch_mech_semantics_version(),sourceAbi:M._arch_source_abi_version(),sourceSemantics:M._arch_source_semantics_version(),datumExtension:M._arch_mech_source_datum_extension_version()}};
const frames=[];let corrupt=false;
client.sourceFrame=async(original,request,{generation})=>{
 assert.ok(client.roots.has(original));assert.equal(M._arch_control_reset(generation),1);
 const id=applySourceFrame(M,original.id,original.generation,request,generation);let released=false;
 const metadata=JSON.parse(new TextDecoder().decode(M.HEAPU8.slice(M._arch_metadata_ptr(id),M._arch_metadata_ptr(id)+M._arch_metadata_len(id))));
 frames.push({request:structuredClone(request),metadata:structuredClone(metadata)});
 if(corrupt)metadata.sourceFrame.translationGrid[0]++;
 const result={id,generation,epoch:client.epoch,metadata,bytes(){assert.ok(!released);return new Uint8Array(M.HEAPU8.buffer,M._arch_snapshot_ptr(id),M._arch_snapshot_len(id));},
 release(){if(!released){released=true;client.roots.delete(result);assert.equal(M._arch_snapshot_release(id),1);}}};client.roots.add(result);return result;
};
let live;function set(v){live={sessionKey:'native-frame:1',...v};setLive(live);}
const text=createTextAdapters({catalog,context:()=>live,invoke:(request,c)=>operation(c,(_,generation)=>{assert.equal(M._arch_control_reset(generation),1);return service.run(request,{generation,signal:c.signal,onProgress:()=>{},isCurrent:t=>t.revision===live.state.revision});})});
client.textOperation=(request,{generation})=>{assert.equal(M._arch_control_reset(generation),1);return service.run(request,{generation,signal:new AbortController().signal,onProgress:()=>{},isCurrent:t=>t.revision===live.state.revision});};
const kernel={operation,ensureRuntime:async()=>client,kernelLeases:new WeakMap()};
const bridge=createProductSourceContexts({kernel,sources:{source:text,text,raster:raster.source},context:()=>live}); // Default ASFR/1, no legacy transport fallback.
const product=createProductAdapters({operation,kernelLeases:kernel.kernelLeases,context:()=>live,withPreparedSource:bridge.withPreparedSource});
test.after(async()=>{await product.reset();bridge.reset();text.reset();service.dispose();await raster.reset();await new Promise(r=>{server.closeAllConnections();server.close(r);});noOwned();});
async function adopted(productId='keychain',style='noi'){
 let state=structuredClone(domain.createProject({product:productId,content:{app:appContent('Actual negative source frame')}}));
 state=structuredClone(domain.commitPreview(state,domain.previewCommand(state,{id:'parameters.set',args:{changes:[{id:'artMode',value:style}]}})).state);
 Object.assign(state.content.app.text,{text:'I',placement:'beside',xMm:'-20',yMm:'-8',sizeMm:'4',sizeDisplay:'4',baseEnabled:true,baseRadiusMm:'0',baseThicknessLayers:'2',heightLayers:'3'});
 const rawBytes=new TextEncoder().encode(svg),rawHash=await sha256(rawBytes),assets=new Map([[rawHash,rawBytes]]);
 set({state,userId:'user-a',projectId:'project-persistent',assetsMap:assets});const c={...controlFor(state),sourceContext:createSourceContext('import',null)};
 const capture=await bridge.captureArtifacts(c);for(const a of capture.assets)assets.set(await sha256(a.bytes),a.bytes);
 const source={id:c.sourceContext.id,revision:0,kind:'svg',name:'real-shared-hole.svg',mediaType:'image/svg+xml',raw:{hash:rawHash,byteLength:rawBytes.length},assetHashes:[...assets.keys()],
 metadata:{sourceContext:c.sourceContext,productArtifacts:{version:'arch-product-artifacts/1',overlay:capture.overlay,sourceTextStateHash:await sha256(canonicalJSON(state.content.app.text))}}};
 const a=await bridge.prepareAdoption({...c,state,source,assets,purpose:'source',operation:'import',materials:[],materialDefaults:[]});
 source.metadata.productBindings=structuredClone(a.productBindings);state=structuredClone(state);state.revision++;state.sourceKind='svg';state.content.app.source=source;
 state.content.app.materials=structuredClone(a.materials);state.content.app.materialDefaults=structuredClone(a.materialDefaults);state=validateState(state);set({state,userId:'user-a',projectId:'project-persistent',assetsMap:assets});return {state,assets};
}
test('checked Boole ASFR/1 replays exact confirmed on-model heads across five products/four styles; source-only contours',{timeout:240000},async()=>{
 const rows=[];
 for(const p of ['keychain','clicky','strap','lego','charm'])for(const s of ['noi','chim','phang','phang2']){
  const dir=path.join(run,'evidence/source-browser-final-wk-'+p,'webkit'),saved=JSON.parse(fs.readFileSync(path.join(dir,'update-svg-'+p+'-'+s+'.json')));
  const assets=new Map(saved.assetHashes.map(h=>[h,new Uint8Array(fs.readFileSync(path.join(dir,'assets',h)))]));
  const f={state:saved.state,assets};set({state:f.state,assetsMap:assets,userId:'source-bridge-user',projectId:'source-bridge-project'});
  const start=frames.length,model=await product.engine.build({...controlFor(f.state),...f}).catch(e=>{fs.writeFileSync(path.join(run,"evidence/source-frame-native-blocked.json"),JSON.stringify({p,s,details:e.details,state:f.state},null,2));throw e;});
  try{const oracle=inspectMesh(readSnapshot(model.bytes()));assert.ok(oracle.volume>0);assert.ok(model.blocks.some(b=>b.role==='text'));
   assert.ok(frames.length>start);assert.equal(model.product.semantics.mechanicsSemantics,3);assert.equal(model.product.semantics.sourceSemantics,2);
   rows.push({product:p,style:s,requestHash:model.product.head.requestHash,oracle,geometryVerified:false});
  }finally{model.release();}
  await bridge.withValidatedRegions({control:controlFor(f.state),...f,includeOverlay:true},r=>{
   const overlay=r.contexts.find(c=>c.key==='text:primary');assert.ok(overlay.metadata.sourceFrame);
   assert.ok(overlay.regions.flatMap(r=>r.ringsNm.flat()).some(p=>BigInt(p[0])<0n&&BigInt(p[1])<0n));
  });noOwned();
 }
 fs.writeFileSync(path.join(run,'evidence/source-frame-app-native.json'),JSON.stringify({rows,frames,booleDependencies:JSON.parse(fs.readFileSync(path.join(run,'inputs/boole-source-frame.json'))),independentReview:false},null,2));
});
test('source frame result corruption and missing checked getter reject; original leases release',async()=>{
 const f=await adopted();corrupt=true;
 await assert.rejects(product.engine.build({...controlFor(f.state),...f}),{code:'PRODUCT_SOURCE_FRAME_RESULT'});corrupt=false;noOwned();
 client.serviceCapabilities.sourceFrameVersion=undefined;
 await assert.rejects(product.engine.build({...controlFor(f.state),...f}),{code:'PRODUCT_SOURCE_FRAME_CAPABILITY_REQUIRED'});noOwned();client.serviceCapabilities.sourceFrameVersion=1;
});
test('accepted RASP full transparent image rectangle is retained for source export',async()=>{
 const f=await rasterState();set({state:f.state,userId:'user-a',projectId:'project-persistent',assetsMap:f.assets});
 await bridge.withValidatedRegions({control:controlFor(f.state),...f},r=>{
  const m=r.contexts[0].metadata,p=m.rasterFrame;assert.equal(p.version,'arch-raster-frame/1');assert.equal(p.widthPx,64);assert.equal(p.heightPx,48);
  assert.equal(p.source,'sealed-RASP/2');assert.equal(p.axis,'x-right-y-down');assert.equal(p.widthMm,m.preparation.summary.widthMm);assert.equal(p.heightMm,m.preparation.summary.heightMm);
 });noOwned();
});

