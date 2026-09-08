import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {M,client,operation,raster,setLive,controlFor,noOwned} from '../product-app/harness.mjs';
import {createProductSourceContexts} from '../../src/integration/product-source-contexts.mjs';
import {prepareBindings,createProductAdapters} from '../../src/integration/product-adapters.mjs';
import {SourceOperations} from '../../src/app/sources.mjs';import {createSourceContext} from '../../src/app/source-approval.mjs';
import {createEditor} from '../../src/editing/index.mjs';
import * as domain from '../../src/domain/index.mjs';import {appContent,validateState} from '../../src/app/documents.mjs';
import {sha256,canonicalJSON} from '../../src/storage/common.mjs';import {encodeRasterPNG} from '../../src/core/png-encode.mjs';
import {readSnapshot,inspectMesh} from '../oracles/mesh-oracle.mjs';
const clone=structuredClone,run=process.env.PROJECT_REVIEW_RUN;
client.serviceCapabilities={geometryVersions:{mechanicsAbi:M._arch_mech_abi_version(),mechanicsSemantics:M._arch_mech_semantics_version(),sourceAbi:M._arch_source_abi_version(),sourceSemantics:M._arch_source_semantics_version(),datumExtension:M._arch_mech_source_datum_extension_version()}};
test('production 16x12 erase/reconvert refreshes parser palette without weakening full identity or consent',async()=>{
 let state=clone(domain.createProject({product:'keychain',content:{app:appContent('Real palette reconversion')}})),live;
 const records=new Map(),assets=new Map(),writer=new SourceOperations(),kernel={operation,ensureRuntime:async()=>client,kernelLeases:new WeakMap()};
 const sync=()=>{live={state,userId:'user-a',projectId:'project-persistent',sessionKey:'palette:1',assetsMap:assets};setLive(live);};sync();
 const bridge=createProductSourceContexts({frameTransport:'product-context-bundle/2',kernel,sources:{source:raster.source,raster:raster.source},context:()=>live});
 const product=createProductAdapters({operation,kernelLeases:kernel.kernelLeases,context:()=>live,withPreparedSource:bridge.withPreparedSource});
 const rgba=new Uint8ClampedArray(16*12*4);
 for(let y=0;y<12;y++)for(let x=0;x<16;x++){if((x>=3&&x<6&&y>=2&&y<5)||(x<2&&y>8))continue;rgba.set(x<9?[224,68,68,255]:[51,136,238,255],4*(y*16+x));}
 const bytes=await encodeRasterPNG({width:16,height:12,data:rgba}),file={name:'palette-regression.png',mediaType:'image/png',bytes};
 async function candidate(reply,c){
  const r=reply.result,raw=await writer.addAsset(bytes,'source',records);for(const a of r.assets)await writer.addAsset(a.bytes,a.kind,records);
  const descriptor=await writer.rasterDescriptor(r.raster,records);for(const [h,r]of records)assets.set(h,new Uint8Array(r.bytes));
  const source={id:c.sourceContext.id,revision:c.sourceContext.revision,kind:r.kind,name:file.name,mediaType:file.mediaType,raw,assetHashes:[...records.keys()],raster:descriptor,metadata:clone(r.metadata)};
  return {...c,state,source,assets,purpose:'source',operation:c.sourceContext.operation,materials:clone(r.materials),materialDefaults:clone(r.materials)};
 }
 async function commit(request,reply,plan){
  const source=clone(request.source);source.metadata.productBindings=clone(plan.productBindings);
  const acceptance=await bridge.source.acceptProposal({...request,source,confirmation:reply.confirmation,acceptedAtRevision:state.revision+1});
  source.metadata.confirmationReceipt=acceptance.receipt;
  state=clone(state);state.revision++;state.sourceKind='raster';state.content.app.source=source;state.content.app.materials=clone(plan.materials);state.content.app.materialDefaults=clone(plan.materialDefaults);state=validateState(state);sync();
 }
 const c={...controlFor(state),sourceContext:createSourceContext('import',null)},first=await bridge.source.ingest({...c,state,file,purpose:'source'});
 const initial=await candidate(first,c),adopt=await bridge.prepareAdoption(initial);
 assert.equal(initial.materials.length,2);await commit(initial,first,adopt);
 const original=clone(state.content.app.source),paletteId=adopt.productBindings.adoptionProvenance.sourcePalette[0].materialId;
 const editor=await createEditor({source:{id:original.id,hash:original.raw.hash,adapterId:'palette-real-editor',adapterVersion:'1'},image:{width:16,height:12,data:assets.get(original.raster.rgba),colorSpace:'srgb',alphaMode:'straight'}});
 const edit=await editor.apply({version:'arch-raster-edit/1',id:'erase-current',expected:editor.token(),tool:'erase',points:[{x:10,y:8},{x:13,y:8}],width:3});
 assert.ok(edit.changedPixels>0);assert.deepEqual(editor.original().image.data,new Uint8Array(rgba));
 const edited=new Uint8Array(edit.image.data),eh=await sha256(edited),png=await encodeRasterPNG({width:16,height:12,data:new Uint8ClampedArray(edited)}),ph=await sha256(png);
 await writer.addAsset(edited,'derived',records);await writer.addAsset(png,'derived',records);assets.set(eh,edited);assets.set(ph,png);
 state=clone(state);state.revision++;Object.assign(state.content.app.source.raster,{rgba:eh,preview:ph});state.content.app.source.assetHashes.push(eh,ph);sync();
 const cc={...controlFor(state),sourceContext:createSourceContext('convert',state.content.app.source)},reply=await bridge.source.convert({...cc,state,source:state.content.app.source,assets,target:'raster'});
 const request=await candidate(reply,cc),before=canonicalJSON(state);fs.writeFileSync(path.join(run,"evidence/palette-inputs.json"),JSON.stringify({previous:state.content.app.materials,defaults:state.content.app.materialDefaults,source:state.content.app.source,candidate:request.source,incoming:request.materials},null,2));const plan=await bridge.prepareAdoptionPlan(request);
 assert.equal(request.source.id,original.id);assert.equal(request.source.revision,1);
 assert.equal(plan.status,'proposal');assert.ok(plan.proposals.some(p=>p.kind==='source-identity-rebind'));
 assert.equal(plan.changes.filter(p=>['refresh-source-palette','initialize-source-palette'].includes(p.kind)).length,2);
 await assert.rejects(bridge.prepareAdoption(request),{code:'PRODUCT_ADOPTION_DECISION_REQUIRED'});
 assert.equal(canonicalJSON(state),before);
 let contexts;await bridge.withValidatedRegions({control:controlFor(state),state,assets},()=>{}).then(()=>assert.fail('changed pixels must require current conversion'),e=>assert.equal(e.code,'RASTER_SOURCE_CONVERSION_REQUIRED'));
 // Explicit test-host consent, matching the real controller's separate identity
 // and raster approvals; production never auto-confirms this plan.
 await commit(request,reply,plan);
 await bridge.withValidatedRegions({control:controlFor(state),state,assets},checked=>{contexts=checked.contexts.map(({regions,...c})=>({key:c.key,sourceHash:c.sourceHash,derivationHash:c.derivationHash,regions:regions.map(({ringsNm,...r})=>r)}));assert.ok(checked.contexts[0].regions.some(r=>r.ringsNm.length>1));});
 const model=await product.engine.build({...controlFor(state),state,assets});const oracle=inspectMesh(readSnapshot(model.bytes()));
 assert.ok(oracle.volume>0);model.release();
 const currentPaletteId=state.content.app.source.metadata.productBindings.adoptionProvenance.sourcePalette[0].materialId;
 const observed=state.content.app.materials.find(m=>m.id===currentPaletteId);
 assert.equal(observed.product.active,false);assert.notEqual(currentPaletteId,paletteId);
 const pure=async(s,incoming)=>prepareBindings({projectId:live.projectId,state:s,source:s.content.app.source,canonicalContexts:contexts,sourceMaterials:incoming,sourceMaterialDefaults:incoming});
 const palette=clone(request.materials);palette[0].areaPercent=42;
 const measured=await pure(state,palette);assert.equal(measured.materials.find(m=>m.id===currentPaletteId).areaPercent,42);
 const user=clone(state),choice=user.content.app.materials.find(m=>m.id===currentPaletteId);Object.assign(choice,{overridden:true,label:'User choice',slot:14,color:'#abcdef',excluded:true,heightLayers:4});
 const kept=(await pure(user,palette)).materials.find(m=>m.id===currentPaletteId);
 for(const k of ['id','label','slot','color','excluded','heightLayers','overridden'])assert.equal(kept[k],choice[k]);assert.equal(kept.areaPercent,42);
 const recolored=clone(palette);recolored[0].color='#010203';const rebound=await pure(user,recolored);assert.ok(rebound.proposals.some(p=>p.kind==='source-palette-rebind'));assert.equal(rebound.materials.find(m=>m.id===currentPaletteId).color,'#abcdef');
 const negatives=[];
 for(const [name,mutate]of [
  ['role',p=>p[0].role='body'],['slot',p=>p[0].slot=2],['override',p=>p[0].overridden=true],
  ['duplicate',p=>p.push(clone(p[0]))],['foreign-tuple',p=>{p[0].product=clone(observed.product);p[0].product.identityTuple[1]='other-project';}]
 ]){
  const bad=clone(palette);mutate(bad);await assert.rejects(pure(user,bad),{code:'PRODUCT_MATERIAL_ID_CONFLICT'});negatives.push(name);
 }
 const wrong=clone(state);wrong.content.app.materials.find(m=>m.id===currentPaletteId).product.identityTuple[2]='foreign-source';
 await assert.rejects(pure(wrong,palette),{code:'PRODUCT_MATERIAL_ID_CONFLICT'});negatives.push('stored-foreign-tuple');
 fs.writeFileSync(path.join(run,'evidence/palette-erase-regression.json'),JSON.stringify({version:1,sourceId:original.id,fromRevision:0,toRevision:1,changedPixels:edit.changedPixels,originalHash:original.raw.hash,rgbaHash:eh,pngHash:ph,plan,oracle,negativeConflicts:negatives,implementationOnly:true},null,2));
 await product.reset();bridge.reset();await raster.reset();noOwned();
});

