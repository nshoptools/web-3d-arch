import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createServer} from 'node:http';
import {M,client,operation,dispatcher,setLive,noOwned,transportLog} from '../product-app/harness.mjs';
import {createApplicationSources} from '../../src/integration/source-compositor.mjs';
import {createEngineTextService} from '../../src/core/engine-text-service.mjs';
import {previewPlanarSnapshot} from '../../src/core/source-preview.mjs';
import {readSnapshot,inspectMesh} from '../oracles/mesh-oracle.mjs';
import {inspectCapturedProduct} from './capture-oracle.mjs';
import {runBridgeCases} from './bridge-cases.mjs';
const run=process.env.PROJECT_REVIEW_RUN,fixture=JSON.parse(fs.readFileSync(path.join(run,'inputs/source-fixture.json')));
const server=createServer((req,res)=>{const h=req.url.slice('/library/'.length);if(!/^[a-f0-9]{64}$/.test(h)||!fixture.actualAssets.some(r=>r.sha256===h)){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type','application/octet-stream');res.end(fs.readFileSync(path.join(run,'inputs/library',h)));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
test.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
const assetURLs=fixture.assetRecords.map(r=>({...r,url:origin+'/library/'+r.sha256})),versions={
 mechanicsAbi:M._arch_mech_abi_version(),mechanicsSemantics:M._arch_mech_semantics_version(),sourceAbi:M._arch_source_abi_version(),sourceSemantics:M._arch_source_semantics_version(),datumExtension:M._arch_mech_source_datum_extension_version()
};
assert.deepEqual(versions,{mechanicsAbi:2,mechanicsSemantics:3,sourceAbi:1,sourceSemantics:2,datumExtension:1});
let live;const driver={get:()=>live,set(v){live={sessionKey:'test-session-1',...v};setLive(v);}};
Object.assign(client,{worker:{testTransport:true},memory:M.HEAPU8.buffer,serviceCapabilities:{raster:true,geometryVersions:versions},onRetirement:()=>()=>{},
 async rasterOperation(method,request,{generation}){
  assert.equal(M._arch_control_reset(generation),1);transportLog.push({method:'raster.'+method,generation});
  return dispatcher.dispatch(method,request,{generation});
 },async rasterRegistry(method,request){transportLog.push({registry:method});return dispatcher.dispatch(method,request);}
});
const textService=createEngineTextService(M,{catalog:fixture.catalog,assetURLs,origin,runtime:{engine:'node',version:process.versions.node}},{origin});
client.textOperation=async(request,{generation})=>{
 assert.equal(M._arch_control_reset(generation),1);transportLog.push({method:'text.'+request.op,generation});
 return textService.run(request,{generation,signal:new AbortController().signal,onProgress:()=>{},isCurrent:t=>t.projectId===live.projectId&&t.revision===live.state.revision});
};
const kernel={operation,ensureRuntime:async()=>client,kernelLeases:new WeakMap(),
 async svgPreview(input,file,{resolution=64,includeRGBA=false,longEdgeMm=0}={}){
  const lease=await operation(input,(a,g)=>a.build({kind:'svg',source:new TextDecoder().decode(file.bytes),thicknessMm:.2,toleranceMm:.004,longEdgeMm},{generation:g}));
  try{const p=await previewPlanarSnapshot(lease.bytes(),{resolution,includeRGBA});
   return {version:'arch-app-adapters/1',ticket:structuredClone(input.ticket),kind:'svg',metadata:{...lease.metadata,previewDerivation:p.derivation,frame:p.frame},
    materials:p.colors.map((color,i)=>({id:'source-'+color.slice(1),label:'Color '+i,color,slot:null,role:'region',overridden:false,backgroundEligible:true,excluded:false})),
    preview:{width:p.width,height:p.height,pixelSizeMm:p.pixelSizeMm,png:p.png,mediaType:'image/png'},
    ...(includeRGBA?{raster:{width:p.width,height:p.height,data:p.rgba,pixelSizeMm:p.pixelSizeMm,preview:p.png,previewMediaType:'image/png'}}:{})};
  }finally{lease.release();}
 }
};
const sources=createApplicationSources({kernel,catalog:fixture.catalog,assetURLs,origin,context:driver.get});

import {createProductSourceContexts} from '../../src/integration/product-source-contexts.mjs';
import {createProductAdapters} from '../../src/integration/product-adapters.mjs';
import {canonicalJSON,sha256} from '../../src/storage/common.mjs';
import * as domain from '../../src/domain/index.mjs';
import {domainStateFingerprint} from '../../src/storage/history.mjs';
import {readProductSemantics} from '../../src/core/product-operations.mjs';
const bridge=createProductSourceContexts({frameTransport:'product-context-bundle/2',kernel,sources,context:driver.get,probeDatums:input=>product.probeDatums(input)});
const product=createProductAdapters({operation:kernel.operation,kernelLeases:kernel.kernelLeases,context:driver.get,
 withPreparedSource:bridge.withPreparedSource,withPreparedDatumSource:bridge.withPreparedDatumSource,
 probeNative:(client,recipe,c)=>client.probeProduct(recipe,c)});
let serial=1000;
function control(){
 const x=driver.get();return {version:'arch-app-adapters/1',ticket:{id:'wave2-'+ ++serial,userId:x.userId,projectId:x.projectId,revision:x.state.revision,generation:serial},
 signal:new AbortController().signal,onProgress:()=>{}};
}
function loadFixture(name='svg-keychain-noi'){
 const dir=path.join(run,'evidence/source-node-smoke-wave2-r2'),saved=JSON.parse(fs.readFileSync(path.join(dir,name+'.json')));
 const assets=new Map(saved.assetHashes.map(h=>[h,new Uint8Array(fs.readFileSync(path.join(dir,'assets',h)))]));
 driver.set({state:saved.state,userId:'source-bridge-user',projectId:'source-bridge-project',sessionKey:'wave2-test-session',assetsMap:assets});
 return {state:structuredClone(saved.state),assets};
}
async function commit(plan,c){
 const base=driver.get(),delta=await plan.confirm(c);
 assert.equal(delta.expected.headHash,await domainStateFingerprint(base.state));
 const assets=new Map(base.assetsMap);for(const a of delta.assets){assert.equal(await sha256(a.bytes),a.sha256);assets.set(a.sha256,a.bytes);}
 driver.set({...base,state:delta.state,assetsMap:assets});
 return delta;
}
test.after(async()=>{bridge.reset();await product.reset();await sources.reset();textService.dispose();noOwned();});
test('atomic real on-model text: new-head probe, confirm once, then ordinary build including negative glyph XY',async()=>{
 loadFixture();const c=control(),before=canonicalJSON(driver.get().state);
 const plan=await bridge.prepareUpdate({...c,state:driver.get().state,assets:driver.get().assetsMap,
  text:{text:'O',placement:'on-model',xMm:'-2',yMm:'-2',sizeMm:'4',sizeDisplay:'4',baseEnabled:true,baseRadiusMm:'0',baseThicknessLayers:'2',heightLayers:'3'}});
 fs.writeFileSync(path.join(run,'evidence/update-first-plan.json'),JSON.stringify(plan,null,2));
 assert.equal(plan.status,'proposal',JSON.stringify(plan));assert.equal(canonicalJSON(driver.get().state),before);
 assert.equal(plan.faces.length,2);assert.ok(plan.faces.every(f=>f.conversionAvailable&&f.referenceLayer>0));
 const delta=await commit(plan,c);assert.equal(delta.source.metadata.productArtifacts.overlay.frame.version,'arch-text-manufacturing-frame/2');
 await assert.rejects(plan.confirm(c),{code:'PRODUCT_PROPOSAL_CONSUMED'});
 const model=await product.engine.build({...control(),state:driver.get().state,assets:driver.get().assetsMap});
 assert.equal(model.product.semantics.mechanicsSemantics,3);assert.ok(model.product.semantics.sourceIntervals.some(f=>f.datum===133));
 const oracle=inspectCapturedProduct(new Uint8Array(model.bytes()),model.product.semantics,'wave2-on-model');fs.writeFileSync(path.join(run,'evidence/update-on-model-oracle.json'),JSON.stringify(oracle,null,2));
 model.release();noOwned();
});
test('raster plus actual negative on-model text uses accepted31 graph and same prospective-head datum protocol',async()=>{
 loadFixture('raster-keychain-noi');const c=control();
 const plan=await bridge.prepareUpdate({...c,state:driver.get().state,assets:driver.get().assetsMap,text:{text:'I',placement:'on-model',xMm:'-1',yMm:'-1',sizeMm:'4',sizeDisplay:'4',baseEnabled:true,baseRadiusMm:'0',baseThicknessLayers:'2',heightLayers:'3'}});
 assert.equal(plan.status,'proposal',JSON.stringify(plan));await commit(plan,c);
 const model=await product.engine.build({...control(),state:driver.get().state,assets:driver.get().assetsMap});assert.ok(model.blocks.length>0);model.release();noOwned();
});
test('source-only callback has owned real rings, no model prerequisite, and detects forged text replay',async()=>{
 loadFixture('text-keychain-noi');let called=0;
 await bridge.withValidatedRegions({...control(),state:driver.get().state,assets:driver.get().assetsMap,frame:'source'},async r=>{
  called++;assert.equal(r.version,'arch-validated-source-regions/1');assert.ok(r.contexts[0].regions[0].ringsNm.length>=2);
  assert.equal(r.contexts[0].validation.kind,'same-module-fresh-shaping-and-native-source');assert.ok(r.contexts[0].sourceBytes instanceof Uint8Array);
 });
 assert.equal(called,1);noOwned();
 const modified=structuredClone(driver.get().state);modified.content.app.text.fontId='noto-sans';driver.set({...driver.get(),state:modified});
 await assert.rejects(bridge.withValidatedRegions({...control(),state:modified,assets:driver.get().assetsMap},async()=>{called++;}));
 assert.equal(called,1);
});

test('per-region four layers use current face at nonuniform first layer, never reference zero',async()=>{
 loadFixture();let state=driver.get().state;
 for(const command of [
  {id:'schedule.set',args:{firstLayerHeight:.16,layerHeight:.2}},
  {id:'parameters.set',args:{changes:[{id:'baseH',value:{heightMode:'layers',layers:12,datum:{kind:'bed'},referenceLayer:0}},{id:'splitObj',value:true}]}}
 ]){
  const p=domain.previewCommand(state,command);assert.ok(p.ok,JSON.stringify(p));state=structuredClone(domain.commitPreview(state,p).state);
 }
 driver.set({...driver.get(),state});
 const before=canonicalJSON(state),materialId=state.content.app.source.metadata.productBindings.regions.find(r=>r.contextKey==='art').materialId,c=control();
 const plan=await bridge.prepareUpdate({...c,state,assets:driver.get().assetsMap,materialChanges:[{materialId,heightLayers:4}]});
 assert.equal(plan.status,'proposal',JSON.stringify(plan));assert.equal(canonicalJSON(driver.get().state),before);
 const f=plan.faces.find(f=>f.datum===128);assert.equal(f.referenceLayer,12);assert.ok(Math.abs(f.z0-2.36)<1e-9);assert.ok(Math.abs(f.z1-f.z0-.8)<1e-9);
 await commit(plan,c);const model=await product.engine.build({...control(),state:driver.get().state,assets:driver.get().assetsMap});
 const actual=model.product.semantics.sourceIntervals.find(i=>i.datum===128&&i.semanticId===f.semanticId);
 assert.equal(actual.referenceLayer,12);assert.ok(Math.abs(actual.z1-actual.z0-.8)<1e-9);model.release();noOwned();
});
test('off-grid new-head text returns concrete domain-checked plane choices; chosen edit is re-probed before consent',async()=>{
 loadFixture();const old=driver.get(),p=domain.previewCommand(old.state,{id:'schedule.set',args:{firstLayerHeight:.16,layerHeight:.2}});
 assert.ok(p.ok);driver.set({...old,state:structuredClone(domain.commitPreview(old.state,p).state)});
 const text={text:'I',placement:'on-model',xMm:'-1',yMm:'-1',sizeMm:'4',sizeDisplay:'4',baseEnabled:true,baseRadiusMm:'0',baseThicknessLayers:'2',heightLayers:'3'},c=control(),state=driver.get().state;
 const blocked=await bridge.prepareUpdate({...c,state,assets:driver.get().assetsMap,text});
 assert.equal(blocked.status,'blocked');assert.ok(blocked.faces.some(f=>f.referenceLayer===null));
 assert.ok(blocked.planeChoices.some(p=>p.strategy==='ceil'&&p.domainValid&&p.deltaMm>0));
 fs.writeFileSync(path.join(run,'evidence/offgrid-datum-plan.json'),JSON.stringify(blocked,null,2));
 await assert.rejects(blocked.confirm(c),{code:'PRODUCT_DATUM_PROBE_BLOCKED'});
 const choice=blocked.planeChoices.find(p=>p.strategy==='ceil'&&p.domainValid),next=control();
 const ready=await bridge.prepareUpdate({...next,state,assets:driver.get().assetsMap,text,parameterChanges:choice.parameterChanges});
 assert.equal(ready.status,'proposal',JSON.stringify(ready));assert.notEqual(ready.nativeHead.requestHash,blocked.nativeHead.requestHash);
 await commit(ready,next);
 const model=await product.engine.build({...control(),state:driver.get().state,assets:driver.get().assetsMap});
 assert.ok(model.blocks.length>0);model.release();noOwned();
});
test('proposal authority rejects A-B-A session change and cancellation; no partial text/assets commit',async()=>{
 for(const kind of ['session','cancel']){
  loadFixture();const c=control(),base=driver.get(),abort=new AbortController();c.signal=abort.signal;
  const plan=await bridge.prepareUpdate({...c,state:base.state,assets:base.assetsMap,text:{text:'I',placement:'on-model',sizeMm:'4',sizeDisplay:'4',baseEnabled:true,baseRadiusMm:'0'}});
  assert.equal(plan.status,'proposal');
  if(kind==='session')driver.set({...base,sessionKey:'wave2-test-session-after-A-B-A'});else abort.abort();
  await assert.rejects(plan.confirm(c));assert.equal(canonicalJSON(driver.get().state),canonicalJSON(base.state));noOwned();
 }
});


test('private reset releases pending native plan and no datum query is made for inactive region controls',async()=>{
 loadFixture();let c=control();const p=await bridge.prepareUpdate({...c,state:driver.get().state,assets:driver.get().assetsMap,text:{text:'I',placement:'on-model',sizeMm:'4',sizeDisplay:'4',baseRadiusMm:'0'}});
 bridge.reset();await assert.rejects(p.confirm(c),{code:'PRODUCT_PROPOSAL_CONSUMED'});noOwned();
 loadFixture();const prior=driver.get(),preview=domain.previewCommand(prior.state,{id:'parameters.set',args:{changes:[{id:'splitObj',value:false}]}});
 assert.ok(preview.ok);driver.set({...prior,state:structuredClone(domain.commitPreview(prior.state,preview).state)});
 c=control();const materialId=driver.get().state.content.app.source.metadata.productBindings.regions[0].materialId;
 await assert.rejects(bridge.prepareUpdate({...c,state:driver.get().state,assets:driver.get().assetsMap,materialChanges:[{materialId,heightLayers:3}]}),{code:'PRODUCT_REGION_HEIGHT_INACTIVE'});noOwned();
});
import {runUpdateCase} from './update-case.mjs';
if(process.env.ARCH_UPDATE_MATRIX==='1')test('all five products and four styles, real SVG and accepted raster default adoption then atomic on-model update',{timeout:240000},async()=>{
 const dir=path.join(run,'evidence/source-node-final'),rows=[];
 for(const family of ['svg','raster'])for(const p of ['keychain','clicky','strap','lego','charm'])for(const a of ['noi','chim','phang','phang2']){
  const name=family+'-'+p+'-'+a,saved=JSON.parse(fs.readFileSync(path.join(dir,name+'.json')));
  const assets=new Map(saved.assetHashes.map(h=>[h,new Uint8Array(fs.readFileSync(path.join(dir,'assets',h)))]));
  driver.set({state:saved.state,assetsMap:assets,userId:'source-bridge-user',projectId:'source-bridge-project',sessionKey:'wave2-update-matrix'});
  rows.push(await runUpdateCase({kernel,sources,driver,id:'update-'+name,capture:async(id,r)=>{
   const oracle=inspectCapturedProduct(r.bytes,r.semantics,id),out=path.join(run,'evidence/update-matrix');fs.mkdirSync(out,{recursive:true});
   fs.writeFileSync(path.join(out,id+'.arch'),r.bytes);fs.writeFileSync(path.join(out,id+'.json'),JSON.stringify({row:r.row,semantics:r.semantics,oracle}));
  }}));
 }
 assert.equal(rows.length,40);fs.writeFileSync(path.join(run,'evidence/update-matrix-summary.json'),JSON.stringify(rows));
});

test('initial SVG source with on-model text uses one prospective adoption plan before any source/material/text commit',async()=>{
 const incoming=loadFixture(),source=structuredClone(incoming.state.content.app.source),materials=structuredClone(incoming.state.content.app.materials),materialDefaults=structuredClone(incoming.state.content.app.materialDefaults);
 let base=structuredClone(incoming.state);base.content.app.source=null;base.sourceKind='none';base.content.app.materials=[];base.content.app.materialDefaults=[];
 driver.set({...driver.get(),state:base});
 const c=control(),p=await bridge.prepareUpdate({...c,state:base,source,materials,materialDefaults,assets:incoming.assets,text:{text:'I',placement:'on-model',xMm:'-1',yMm:'-1',sizeMm:'4',sizeDisplay:'4',baseRadiusMm:'0'}});
 assert.equal(p.status,'proposal');assert.equal(driver.get().state.content.app.source,null);
 await commit(p,c);const model=await product.engine.build({...control(),state:driver.get().state,assets:driver.get().assetsMap});assert.ok(model.blocks.length>0);model.release();noOwned();
});
test('source-only raw SVG and accepted raster preserve holes and owned 31 buffers; callback cancellation cleans leases',async()=>{
 for(const name of ['svg-keychain-noi','raster-keychain-noi']){
  loadFixture(name);const c=control(),base=driver.get(),abort=new AbortController();c.signal=abort.signal;let called=0,late=0;
  await assert.rejects(bridge.withValidatedRegions({...c,control:c,state:base.state,assets:base.assetsMap},async r=>{
   called++;assert.ok(r.contexts[0].regions.some(r=>r.ringsNm.length>1));
   if(name.startsWith('raster'))assert.equal(r.contexts[0].packet.buffers.length,31);
   const held=new Uint8Array(r.contexts[0].sourceBytes);r.contexts[0].sourceBytes[0]^=1;
   assert.deepEqual(base.assetsMap.get(base.state.content.app.source.raw.hash),held);
   abort.abort();return {release(){late++;}};
  }));assert.equal(called,1);assert.equal(late,1);noOwned();
 }
});
