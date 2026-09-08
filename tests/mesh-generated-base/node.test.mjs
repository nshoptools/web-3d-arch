import {runControllerCases} from './seed.mjs';
import {rasterSeed} from './raster-seed.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {kernel,fixture,assetURLs,origin,context,updateContext} from './runtime.mjs';
import {client,noOwned,transportLog,M} from './native.mjs';
import {createApplicationSources} from '../../src/integration/source-compositor.mjs';
import {createMeshGeneratedBase} from '../../src/integration/mesh-generated-base.mjs';
import {createProductAdapters} from '../../src/integration/product-adapters.mjs';
import {createProductSourceContexts} from '../../src/integration/product-source-contexts.mjs';
import {createMeshReplayRecord,replayMeshRequest,meshParameterBindings} from '../../src/mesh-import/src/app-csg-transaction.mjs';
import {sha256,canonicalJSON} from '../../src/storage/common.mjs';
import {domainStateFingerprint} from '../../src/storage/history.mjs';
import {domainCommand} from '../../src/app/documents.mjs';
import {readArchSnapshot} from '../../src/viewport/arch-view.mjs';
import {inspectCapturedProduct} from '../product-source/capture-oracle.mjs';
const copy=structuredClone,engineIdentity={id:'arch-product-app',version:'1'},out=path.join(process.env.PROJECT_REVIEW_RUN,'evidence/generated-base');
fs.mkdirSync(out,{recursive:true});
let job=800;
function control(ctx=context()){const abort=new AbortController();return {version:'arch-app-adapters/1',ticket:{id:'base-'+(++job),userId:ctx.userId,projectId:ctx.projectId,revision:ctx.state.revision,generation:job},signal:abort.signal,onProgress:()=>{},abort};}
function geometry(bytes){
 const m=readArchSnapshot(bytes);
 const owned=bytes.slice();owned.fill(0,16,20);return {bounds:m.bounds,parts:m.parts,vertices:m.vertices,triangles:m.triangles,allGeometryBytesExceptGeneration:owned};
}
async function put(map,bytes,kind='dependency'){
 const hash=await sha256(bytes);map.set(hash,{hash,bytes,byteLength:bytes.length,kind});return hash;
}
async function savedRecipe(baseState,bytesMap){
 const assets=new Map();for(const [hash,bytes]of bytesMap)assets.set(hash,{hash,bytes:bytes.slice(),byteLength:bytes.length,kind:'source'});
 const raw=new TextEncoder().encode('TEST-import-unexecuted-by-this-suite'),h=await put(assets,raw,'source');
 const original={id:'TEST-import-source',name:'explicit-test.stl',kind:'mesh',revision:0,raw:{hash:h,byteLength:raw.length},assetHashes:[h],metadata:{meshImport:{format:'stl'}}};
 const transform=[1,0,0,0,0,1,0,0,0,0,1,0],buffer=new ArrayBuffer(96),view=new DataView(buffer);transform.forEach((x,i)=>view.setFloat64(i*8,x,true));
 const bits=[...new Uint8Array(buffer)].map(x=>x.toString(16).padStart(2,'0')).join('');
 const parser={unit:'millimeter'},approval={version:'arch-mesh-input-selection/1',repair:'none',conditioning:'none',unit:'millimeter',transform,
  transformBinary64LE:bits,sourceNumericId:'101',provenanceNumericId:'102',materials:[{id:'103',slot:4,rgba:0xeeeeeeff}]};
 const command={operation:'union',transform},parameters=meshParameterBindings(baseState,{transformConvention:'row-major-3x4-source-to-mm',transformBinary64LE:bits,resolved:{}});
 const stored=await createMeshReplayRecord({original,baseState,assets,engine:engineIdentity,parser,approval,command,materialNames:{103:'TEST-import-material'},
  sourceHashes:[{id:baseState.content.app.source.id,sha256:baseState.content.app.source.raw.hash},{id:original.id,sha256:h}],parameters});
 return {...stored,original};
}
for(const family of ['svg','raster'])test('real '+family+' generated operand: first apply, replay and retirement',{timeout:60000},async()=>{
 let captured;
 await (family==='raster'?rasterSeed:runControllerCases)({kernel,catalog:fixture.catalog,assetURLs,origin,families:[family],products:['keychain'],styles:['noi'],
  onContext:updateContext,capture:async(_id,r)=>{captured=r;},beforeDispose:async()=>{
   const originalLive=context(),originalState=copy(originalLive.state),originalGeometry=geometry(captured.bytes),originalModel=originalLive.model;
   const enabled=domainCommand(originalState,{id:'parameters.set',args:{changes:[{id:'impOn',value:true},{id:'impOp',value:'han'}]}}).state;
   const saved=await savedRecipe(enabled,captured.assets);
   let current={...originalLive,state:enabled,headHash:await domainStateFingerprint(enabled),assetsMap:new Map([...saved.assets].map(([h,a])=>[h,a.bytes]))};
   updateContext(current);
   const sources=createApplicationSources({kernel,catalog:fixture.catalog,assetURLs,origin,context});
   const service=createMeshGeneratedBase({kernel,sources,context,engineIdentity});
   const reports=[],base=saved.recipe.generatedBase,ownedBefore=client.roots.size;let escaped,scopeSaved;
   async function inspect(mode){
    const c=control();const started=performance.now();
    await service.withBase({control:c,mode,base,assets:saved.assets},async scope=>{
     escaped=scope.model;scopeSaved=scope;
     assert.notEqual(scope.model,originalModel);assert.notEqual(scope.model.leaseId,originalModel.leaseId);
     assert.equal(scope.model.generatedBaseOnly,true);assert.equal(scope.model.product.head.headHash,current.headHash);
     assert.equal(scope.model.product.head.revision,String(current.state.revision));
     assert.equal(scope.binding.base.stateFingerprint,base.stateFingerprint);
     assert.equal(scope.binding.delegatedImportFields.find(r=>r.id==='impOn').current.value,true);
     assert.equal(service.assertScope(scope,{control:c,model:scope.model}),scope.binding);
     assert.throws(()=>service.assertScope({...scope},{control:c,model:scope.model}),{code:'GENERATED_BASE_SCOPE'});
     assert.deepEqual(geometry(scope.model.bytes()),originalGeometry,'actual canonical mesh unchanged by head delegation');
     const oracle=inspectCapturedProduct(new Uint8Array(scope.model.bytes()),scope.model.product.semantics,family+'-'+mode);
     await scope.operation((a,g)=>{assert.equal(a,client);assert.ok(g>scope.model.generation);});
     assert.equal(context().model,originalModel,'generated base never visible');
     reports.push({mode,binding:scope.binding,oracle,elapsedMs:performance.now()-started});
    });
    assert.equal(client.roots.size,ownedBefore);
    assert.equal(kernel.kernelLeases.has(escaped),false);assert.throws(()=>escaped.bytes(),{code:'GENERATED_BASE_RETIRED'});
    assert.throws(()=>service.assertScope(scopeSaved,{control:c,model:escaped}),{code:'GENERATED_BASE_SCOPE'});
    await scopeSaved.release();assert.equal(client.roots.size,ownedBefore);
   }
   try{
    // Normal engine still refuses impOn and cannot use the scoped token option.
    const normalContexts=createProductSourceContexts({kernel,sources,context}),normal=createProductAdapters({operation:kernel.operation,kernelLeases:kernel.kernelLeases,context,withPreparedSource:normalContexts.withPreparedSource});
    await assert.rejects(normal.engine.build({...control(),state:enabled,assets:current.assetsMap}),{code:'IMPORT_CSG_UNAVAILABLE'});
    await assert.rejects(normal.engine.build({...control(),state:enabled,assets:current.assetsMap,generatedBase:{}}),{code:'PRODUCT_GENERATED_BASE_AUTHORITY'});
    await normal.reset();await normalContexts.reset();
    await inspect('prepare');
    const initialControl=control(),scope=await service.prepare({control:initialControl,savedBaseState:enabled,currentState:current.state,mode:'prepare',assets:saved.assets});
    try{
     assert.equal(scope.exportDescriptor,scope.inspection.exportDescriptor);scope.check(initialControl);
     assert.equal(service.verifyGeneratedBase({model:scope.model,control:initialControl}),scope.binding);
     assert.throws(()=>service.verifyGeneratedBase({model:{...scope.model},control:initialControl}),{code:'GENERATED_BASE_MODEL_UNREGISTERED'});
     await assert.rejects(service.prepare({control:control(),savedBaseState:enabled,assets:saved.assets}),{code:'GENERATED_BASE_BUSY'});
    }finally{await scope.release();}
    assert.throws(()=>service.verifyGeneratedBase({model:scope.model,control:initialControl}),{code:'GENERATED_BASE_MODEL_UNREGISTERED'});

    // Labelled persisted-recipe fixture. This test does NOT execute/qualify CSG.
    current={...current,state:copy(enabled)};current.state.revision+=7;
    current.state.content.app.mesh={...saved.original,assetHashes:saved.assetHashes,applied:true,metadata:{...saved.original.metadata,meshCsg:saved.recipe}};
    current.headHash=await domainStateFingerprint(current.state);updateContext(current);
    const replay=await replayMeshRequest({state:current.state,assets:saved.assets,engine:engineIdentity});
    assert.deepEqual(replay.baseState,enabled);await inspect('replay');
    async function rejects(input,code){const n=transportLog.length;await assert.rejects(service.withBase(input,()=>assert.fail('must not deliver')),{code});assert.equal(transportLog.length,n,'rejected before native dispatch');assert.equal(client.roots.size,ownedBefore);}
    await rejects({control:control(),mode:'replay',base:{...base,stateFingerprint:'a'.repeat(64)},assets:saved.assets},'GENERATED_BASE_STATE_FINGERPRINT');
    const wrong=control();wrong.ticket.projectId='wrong-project';await rejects({control:wrong,mode:'replay',base,assets:saved.assets},'GENERATED_BASE_AUTHORITY');
    const aborted=control();aborted.abort.abort();await rejects({control:aborted,mode:'replay',base,assets:saved.assets},'GENERATED_BASE_CANCELLED');
    const damaged=new Map(saved.assets),rawHash=enabled.content.app.source.raw.hash,raw=damaged.get(rawHash),broken=raw.bytes.slice();broken[0]^=1;damaged.set(rawHash,{...raw,bytes:broken});
    await rejects({control:control(),mode:'replay',base,assets:damaged},'GENERATED_BASE_CURRENT_ASSET_CHANGED');
    const stable=current;
    if(family==='svg'){
     // A real changed generated parameter, not a borrowed derived head.
     const changed=domainCommand(current.state,{id:'parameters.set',args:{changes:[{id:'size',value:55}]}}).state;
     current={...current,state:changed,headHash:await domainStateFingerprint(changed)};updateContext(current);
     const savedNew=copy(changed);savedNew.content.app.mesh.applied=false;delete savedNew.content.app.mesh.metadata.meshCsg;
     await assert.rejects(service.prepare({control:control(),savedBaseState:savedNew,assets:saved.assets,mode:'replay'}),{code:'GENERATED_BASE_REPLAY_BINDING'});
     const c=control(),scope=await service.prepare({control:c,savedBaseState:savedNew,assets:saved.assets,mode:'prepare'});
     try{
      assert.equal(scope.binding.mode,'prepare');assert.equal(scope.binding.replacedRecipeHash,await sha256(canonicalJSON(saved.recipe)));
      assert.equal(scope.model.product.head.headHash,current.headHash);assert.notEqual(scope.model.stats.widthMm,originalModel.stats.widthMm);
      assert.equal(scope.model.product.semantics.provenance.generatedBase.current.headHash,current.headHash);
      service.verifyGeneratedBase({model:scope.model,control:c});
     }finally{await scope.release();}
     assert.equal(client.roots.size,ownedBefore);current=stable;updateContext(current);
    }

    current={...stable,state:copy(stable.state)};current.state.content.app.source.metadata.productBindings.regions[0].geometryHash='a'.repeat(64);current.headHash=await domainStateFingerprint(current.state);updateContext(current);
    await rejects({control:control(),mode:'replay',base,assets:saved.assets},'GENERATED_BASE_RECIPE_CHANGED');current=stable;updateContext(current);
    for(const failure of (family==='svg'?['session','head','abort','epoch','reset','consumer']:['reset'])){
     const c=control(),stamp=canonicalJSON(current.state);let released;
     try{
      await service.withBase({control:c,mode:'replay',base,assets:saved.assets},async scope=>{
       released=scope.model;
       if(failure==='session'){current={...current,sessionKey:current.sessionKey+':retired'};updateContext(current);}
       if(failure==='head'){current={...current,state:copy(current.state)};current.state.revision++;updateContext(current);}
       if(failure==='abort')c.abort.abort();
       if(failure==='epoch')client.epoch++;
       if(failure==='reset')await service.reset();
       if(failure==='consumer')throw Object.assign(new Error('TEST-consumer'),{code:'TEST_CONSUMER'});
       assert.throws(()=>scope.assertCurrent());await assert.rejects(scope.operation(()=>assert.fail('stale native dispatch')));
      });
     }catch(e){assert.equal(failure,'consumer');assert.equal(e.code,'TEST_CONSUMER');}
     finally{if(failure==='epoch')client.epoch--;current=stable;updateContext(current);}
     assert.equal(canonicalJSON(current.state),stamp);assert.equal(client.roots.size,ownedBefore);assert.equal(kernel.kernelLeases.has(released),false);
    }
    if(family==='svg'){
     let nativeReady,continueNative;
     const ready=new Promise(r=>nativeReady=r),gate=new Promise(r=>continueNative=r),build=client.build;
     client.build=async function(recipe,options){const root=await build.call(this,recipe,options);if(recipe.kind==='product'){nativeReady();await gate;}return root;};
     const pending=service.prepare({control:control(),savedBaseState:enabled,assets:saved.assets});
     try{await ready;await service.reset();continueNative();await assert.rejects(pending);assert.equal(client.roots.size,ownedBefore);}
     finally{continueNative();client.build=build;}
    }
    fs.writeFileSync(path.join(out,family+'.json'),JSON.stringify({status:'passed',reports,negativeChecks:'named assertions in node.test.mjs; no multiplied test count',trace:transportLog,limitations:['CSG import/boolean/commit not executed','labelled saved-recipe fixture','native base and source/controller adoption are real']},null,2));
   }finally{await service.dispose();await sources.reset();updateContext(originalLive);}
  }});
 noOwned();
});
