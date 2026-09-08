import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {finalSceneGateState} from '../../src/integration/final-scene-gates.mjs';
import {createSchedule} from '../../src/domain/layers.mjs';import {effectiveValues,PRODUCT_IDS} from '../../src/domain/index.mjs';
import {domainStateFingerprint} from '../../src/storage/history.mjs';
// Explicit synthetic APMS binding fixture. It does not produce geometry or a
// mesh verdict; real native APMS bindings are tested in the browser matrix.
async function fixture(product='keychain',change=()=>{}){
 const state=JSON.parse(fs.readFileSync(new URL('./fixtures/'+product+'.json',import.meta.url))).state;change(state);
 const headHash=await domainStateFingerprint(state),v=effectiveValues(state),source=state.content.app.source;
 const model={leaseId:'synthetic-gate-model',ticket:{userId:'u',projectId:'project-persistent',revision:state.revision}};
 const context={state,userId:'u',projectId:'project-persistent',headHash,sessionKey:{},model};
 const inspection={version:'arch-product-model-state/1',modelLeaseId:model.leaseId,head:{headHash,revision:String(state.revision)},contextHash:'b'.repeat(64),
  snapshot:{id:1,epoch:1,generation:1},source:{id:source.id,revision:source.revision,rawHash:source.raw.hash},
  semantics:{schema:'APMS/1',mechanicsSemantics:3,sourceSemantics:2,product:PRODUCT_IDS.indexOf(product),revision:String(state.revision),
   parameters:[{field:'layerH',mode:0,value:v.layerH},{field:'impOn',mode:0,value:v.impOn?1:0},
    ...(product==='clicky'?[{field:'assemble',mode:0,value:v.assemble?1:0}]:product==='charm'?[{field:'charmRap',mode:0,value:v.charmRap?1:0}]:[])],
   layerBoundaries:[0,state.schedule.firstLayerHeight,state.schedule.firstLayerHeight+state.schedule.layerHeight]},
  gates:{matchingHead:true,nativeBuildAccepted:true,sourceVerdict:0,mechanicsVerdict:0,exportBlocked:false}};
 return {context,inspection};
}
test('actual schedule identifier keeps sha256 prefix and differs for first .16/regular .25 versus .20',async()=>{
 const a=await fixture('clicky',s=>{s.schedule=createSchedule({firstLayerHeight:.16,layerHeight:.25});}),b=await fixture('clicky');
 const x=finalSceneGateState(a.context,a.inspection),y=finalSceneGateState(b.context,b.inspection);
 assert.equal(x.projectScheduleHash,a.context.state.schedule.hash);assert.match(x.projectScheduleHash,/^sha256:[a-f0-9]{64}$/);
 assert.notEqual(x.projectScheduleHash,y.projectScheduleHash);assert.deepEqual([x.invalidInput,x.kernelFailure,x.assemblyView,x.unappliedMeshEdit],[false,false,false,false]);
 a.inspection.semantics.layerBoundaries[1]=.2;assert.throws(()=>finalSceneGateState(a.context,a.inspection),{code:'SCENE_GATE_BUILD_SCHEDULE'});
});
test('cached head/model/source claims cannot authorize a changed state or native input',async()=>{
 for(const mutate of [
  f=>f.context.state.schedule=createSchedule({firstLayerHeight:.16}),
  f=>f.context.model={...f.context.model,leaseId:'other'},
  f=>f.inspection.source.revision++,
  f=>f.inspection.semantics.product=99,
  f=>f.inspection.semantics.parameters[0].value=.25,
  f=>f.inspection.semantics.parameters.push({...f.inspection.semantics.parameters[0]})
 ]){
  const f=await fixture();mutate(f);assert.throws(()=>finalSceneGateState(f.context,f.inspection));
 }
});
test('native input/kernel/unknown gates cannot be replaced by plausible public success',async()=>{
 for(const change of [g=>delete g.exportBlocked,g=>g.sourceVerdict=1,g=>g.mechanicsVerdict=1,g=>g.nativeBuildAccepted=false,g=>g.matchingHead=false]){
  const f=await fixture();change(f.inspection.gates);f.context.model.stats={verdict:'pass'};
  assert.throws(()=>finalSceneGateState(f.context,f.inspection),{code:'SCENE_GATE_NATIVE_BLOCKED'});
 }
});
test('assembly preference is active-product native input; mismatch and unapplied mesh block',async()=>{
 const a=await fixture('clicky',s=>{s.parameters.byProduct.clicky.assemble.value=true;s.parameters.byProduct.clicky.assemble.origin='user';});
 assert.equal(finalSceneGateState(a.context,a.inspection).assemblyView,true);
 a.inspection.semantics.parameters.find(p=>p.field==='assemble').value=0;
 assert.throws(()=>finalSceneGateState(a.context,a.inspection),{code:'SCENE_GATE_ASSEMBLY'});
 const mesh={id:'input-mesh',revision:0,raw:{hash:'c'.repeat(64)},applied:false};
 const b=await fixture('keychain',s=>{s.content.app.mesh=mesh;});assert.equal(finalSceneGateState(b.context,b.inspection).unappliedMeshEdit,true);
 const c=await fixture('keychain',s=>{s.content.app.mesh={...mesh};delete s.content.app.mesh.applied;});
 assert.throws(()=>finalSceneGateState(c.context,c.inspection),{code:'SCENE_GATE_MESH_STATE'});
 const d=await fixture('keychain',s=>{s.content.app.mesh={...mesh,applied:true};s.parameters.common.impOn.value=true;s.parameters.common.impOn.origin='user';});
 assert.throws(()=>finalSceneGateState(d.context,d.inspection),{code:'SCENE_GATE_APPLIED_MESH_BINDING_REQUIRED'});
});
