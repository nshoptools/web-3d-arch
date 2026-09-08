import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {createFinalSceneEvidence} from './review-source/src/integration/final-scene-evidence.mjs';
import {sceneMaterialBindings} from './review-source/src/integration/product-services.mjs';
import {qualifyMesh} from './review-source/src/core/mesh-qualification.mjs';
import {sha256} from './review-source/src/storage/common.mjs';
import {encodeArch,cuboid,join} from './analytic-shapes.mjs';
// Independent boundary rig. Runtime/inspector are explicit trusted test doubles;
// mesh classification and application material table callback are captured product code.
async function rig({mutateArtifact=()=>{},beforeCheck=async()=>{},notify=()=>{}}={}){
 const meshes=[cuboid(),cuboid([5,0,0],[7,3,5])],bytes=encodeArch(meshes),leaseMap=new WeakMap(),calls=[],ticket={id:'review-q',userId:'u',projectId:'p',revision:3,generation:50};let releases=0;
 const state={revision:3,content:{app:{materials:[{id:'material-a'},{id:'material-z'},{id:'unused-material'}]}}},headHash=await sha256('independent authority head');
 const root={id:17,epoch:2,generation:7,metadata:{semanticBytes:new Uint8Array([11,12]),descriptor:new Uint8Array([21,22])},bytes:()=>bytes};
 const model={generation:7,leaseId:'owned:17',ticket:{...ticket,generation:1},stats:{verdict:'unverified'},bytes:root.bytes,release:()=>{releases++;leaseMap.delete(model);}},live={userId:'u',projectId:'p',state,model,headHash,sessionKey:{}};
 const inspection={version:'arch-product-model-state/1',modelLeaseId:model.leaseId,head:{headHash,revision:'3'},snapshot:{id:17,epoch:2,generation:7},semantics:{mechanicsSemantics:3,sourceSemantics:2},contextHash:await sha256('independent-context'),gates:{matchingHead:true,nativeBuildAccepted:true,sourceVerdict:0,mechanicsVerdict:0,exportBlocked:false},exportDescriptor:{parts:meshes.map((_,i)=>({partIndex:i,sourceIndex:i,slot:37,rgba:0xff00ffff,materialId:i===0?'material-a':'material-z',id:'part-'+i,sourceSemanticIds:['source-'+i]})),sourceHashes:[{id:'source-0',sha256:await sha256('source0')},{id:'source-1',sha256:await sha256('source1')}]}};
 const gate={key:'actual-gate-1',invalidInput:false,kernelFailure:false,assemblyView:false,unappliedMeshEdit:false};
 const runtime={epoch:2,disposed:false,serviceCapabilities:{finalSceneGeometry:true},finalSceneGeometry:async(r,request,transport)=>{
  const neutral=request.mapping.every(m=>m.materialSource===0xffffffff),out=encodeArch(neutral?join(meshes):meshes,{colors:neutral?[0xffffffff]:[],sourceIndices:neutral?[0]:[]});
  const groups=neutral?[{part:0,slot:1,rgba:0xffffffff,materialSource:0xffffffff,inputParts:[0,1],sourceIndices:[0,1]}]:request.mapping.map((m,i)=>({part:i,slot:m.slot,rgba:m.rgba,materialSource:m.materialSource,inputParts:[i],sourceIndices:[i]}));
  const artifact={bytes:out,metadata:{version:'arch-final-scene-geometry/1',format:'ARCH/1',geometry:'material-union',grouping:'slot-rgba-materialSource/1',coordinateFrame:'source-manufacturing-mm',sourceUnchanged:true,meshVerdict:'unverified',sourceSnapshotSha256:await sha256(bytes),sourceSnapshotId:17,sourceSnapshotGeneration:7,revision:'3',groups}};
  calls.push({mapping:structuredClone(request.mapping),transport});await mutateArtifact(artifact,calls.length,f);return artifact;
 }};
 const record={root,client:runtime};leaseMap.set(model,record);const abort=new AbortController(),control={version:'arch-app-adapters/1',ticket,signal:abort.signal,onProgress:()=>{}};
 const f={bytes,live,root,model,runtime,inspection,gate,calls,record,control,abort,leaseMap,releases:()=>releases};let checks=0;
 f.provider=createFinalSceneEvidence({kernelLeases:leaseMap,inspectModel:async()=>inspection,operation:async(c,fn)=>fn(runtime,60+calls.length),context:()=>live,gateState:()=>gate,materialSourceIds:sceneMaterialBindings,onChange:()=>notify(f),validationClient:{check:async(b,opts)=>{await beforeCheck(f,++checks);return qualifyMesh(b,opts);},reset:async()=>{}}});return f;
}
const outcomes=[];
async function observe(name,configure=()=>{},options={},expected='rejected'){
 const f=await rig(options);await configure(f);let result,code;try{result=await f.provider.qualify({model:f.model,control:f.control});code=result.evidence.meshVerdict;}catch(e){code=e.code??e.message;}
 const cached=f.provider.describe(f.record,f.live);outcomes.push({name,code,cached:cached.status,verdict:cached.meshVerdict,calls:f.calls.length,releases:f.releases()});
 if(expected==='rejected')assert.notEqual(cached.status,'ready',name);else assert.equal(code,expected,name);assert.equal(f.releases(),0);await f.provider.reset();return f;
}
const healthy=await observe('complete-current-material-table',()=>{},{},'pass');assert.deepEqual(healthy.calls[0].mapping.map(m=>m.materialSource),[1,2]);assert.deepEqual(healthy.calls[1].mapping.map(m=>[m.slot,m.rgba,m.materialSource]),[[1,0xffffffff,0xffffffff],[1,0xffffffff,0xffffffff]]);assert.equal(healthy.model.stats.verdict,'unverified');
for(const [name,change] of [
 ['hidden-model',f=>f.live.model={...f.model}],['obsolete-epoch',f=>f.runtime.epoch++],['missing-root-lease',f=>f.leaseMap.delete(f.model)],
 ['duplicate-full-material-id',f=>f.live.state.content.app.materials.push({id:'material-a'})],['duplicate-part-index',f=>f.inspection.exportDescriptor.parts[1].partIndex=0],
 ['upstream-assembly',f=>f.gate.assemblyView=true],['source-unverified',f=>f.inspection.gates.sourceVerdict=1],['mechanics-unsupported',f=>f.inspection.semantics.mechanicsSemantics=2],
 ['missing-actual-afgm-method',f=>delete f.runtime.finalSceneGeometry]
])await observe(name,change);
await observe('missing-capability-stays-unverified',f=>f.runtime.serviceCapabilities={},{},'unverified');
for(const [name,mutate] of [
 ['wrong-root-hash',a=>a.metadata.sourceSnapshotSha256='0'.repeat(64)],['wrong-generation',a=>a.metadata.sourceSnapshotGeneration++],
 ['missing-membership',a=>{a.metadata.groups[1].inputParts=[];a.metadata.groups[1].sourceIndices=[];}],['duplicate-membership',a=>a.metadata.groups[1].inputParts=[0]],
 ['wrong-source-index',a=>a.metadata.groups[0].sourceIndices=[100]],['wrong-full-material-key',a=>a.metadata.groups[0].materialSource=99],
 ['missing-group',a=>a.metadata.groups.pop()],['native-positive-label',a=>a.metadata.meshVerdict='pass'],
 ['wrong-analysis-membership',a=>{a.metadata.groups[0].inputParts=[0];a.metadata.groups[0].sourceIndices=[0];}]
])await observe(name,()=>{},{mutateArtifact:(a,n)=>{if(name.startsWith('wrong-analysis')?n===2:n===1)mutate(a);}});
for(const [name,mutate] of [
 ['state-changed-during-check',f=>f.live.state.extra='changed'],['session-changed-during-check',f=>f.live.sessionKey={}],
 ['source-bytes-changed-during-check',f=>f.bytes[129]^=1],['cancel-during-check',f=>f.abort.abort()],['semantic-bytes-changed',f=>f.root.metadata.semanticBytes[0]++],
 ['unused-material-changed',f=>f.live.state.content.app.materials[2].id='new-unused-material']
])await observe(name,()=>{},{beforeCheck:(f,n)=>{if(n===2)mutate(f);}});
const aba=await rig();await aba.provider.qualify({model:aba.model,control:aba.control});const old=aba.live.sessionKey;aba.live.sessionKey={};const b=aba.provider.describe(aba.record,aba.live);aba.live.sessionKey=old;const a=aba.provider.describe(aba.record,aba.live);outcomes.push({name:'observed-A-B-A',during:b.status,after:a.status});assert.equal(a.status,'unverified');await aba.provider.reset();
// Reorder mapping callback uses sorted full IDs, but changing current state order
// still changes the authority stamp and retires old evidence conservatively.
const reorder=await rig();await reorder.provider.qualify({model:reorder.model,control:reorder.control});reorder.live.state.content.app.materials.reverse();assert.equal(reorder.provider.describe(reorder.record,reorder.live).status,'unverified');await reorder.provider.reset();outcomes.push({name:'reordered-current-table-retires-old-evidence',verdict:'unverified'});
fs.writeFileSync(path.join(process.env.PROJECT_REVIEW_RUN,'evidence/independent-authority.json'),JSON.stringify({transport:'explicit independent doubles; production qualifier and sceneMaterialBindings',outcomes},null,2));console.log(JSON.stringify({cases:outcomes.length,outcomes},null,2));
