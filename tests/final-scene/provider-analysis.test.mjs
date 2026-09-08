import test from 'node:test';import assert from 'node:assert/strict';
import {providerFixture} from './provider-fixture.mjs';
import {arch,box} from './fixtures.mjs';
import {sha256} from '../../src/storage/common.mjs';

// Explicit analytic two-box root transport double. Every mesh report still
// comes from the actual checker. Browser tests exercise the production AFGM.
async function twoMaterialFixture({afterSecond=async()=>{},alterMaterial=()=>{},alterUnion=()=>{}}={}){
 const meshes=[box(),box([2,0,0],[3,1,1])],calls=[];
 const f=await providerFixture({fixtureMeshes:meshes,materialSourceIds:()=>[
  {materialId:'stable-material',materialSourceId:401},{materialId:'second-full-id',materialSourceId:402}
 ]});
 const parts=f.inspection.exportDescriptor.parts;
 parts[0].slot=37;parts[0].sourceIndex=41;
 parts.push({...parts[0],partIndex:1,sourceIndex:99,slot:64,id:'second-part',materialId:'second-full-id'});
 const raw=new DataView(f.bytes.buffer),offset=raw.getUint32(56,true);
 raw.setUint32(offset+20,41,true);raw.setUint32(offset+60,99,true);
 f.runtime.serviceCapabilities.finalSceneGeometry=true;
 f.runtime.finalSceneGeometry=async(root,request,{generation})=>{
  assert.equal(root,f.root);assert.equal(request.revision,'2');assert.equal(request.expectedRevision,'2');
  calls.push({request:structuredClone(request),generation});const analysis=calls.length===2;
  assert.ok(calls.length<=2);
  const bytes=analysis?arch(meshes,{separateParts:false}):arch(meshes),view=new DataView(bytes.buffer);
  const mapped=analysis?parts.map(p=>({...p,slot:1,rgba:0xffffffff,materialSourceId:0xffffffff})):parts.map((p,i)=>({...p,materialSourceId:401+i}));
  assert.deepEqual(request.mapping,mapped.map(p=>({part:p.partIndex,source:p.sourceIndex,slot:p.slot,rgba:p.rgba,materialSource:p.materialSourceId})));
  const groups=analysis?[{part:0,slot:1,rgba:0xffffffff,materialSource:0xffffffff,inputParts:[0,1],sourceIndices:[41,99]}]:
   parts.map((p,i)=>({part:i,slot:p.slot,rgba:p.rgba,materialSource:401+i,inputParts:[i],sourceIndices:[p.sourceIndex]}));
  if(analysis)view.setUint32(view.getUint32(56,true)+16,0xffffffff,true);
  const metadata={version:'arch-final-scene-geometry/1',format:'ARCH/1',geometry:'material-union',
   sourceSnapshotSha256:await sha256(f.bytes),sourceSnapshotId:11,sourceSnapshotGeneration:7,revision:'2',
   grouping:'slot-rgba-materialSource/1',coordinateFrame:'source-manufacturing-mm',sourceUnchanged:true,meshVerdict:'unverified',groups};
  if(analysis){alterUnion({bytes,metadata,f});await afterSecond(f);}else alterMaterial({bytes,metadata,f});
  return {bytes,metadata};
 };
 return {...f,nativeCalls:calls};
}

test('analysis union preserves source indices and real material provenance under one ticket with monotonic transport',async()=>{
 const f=await twoMaterialFixture(),before=f.bytes.slice(),ticket=structuredClone(f.control.ticket);
 const {evidence,ticket:echo}=await f.provider.qualify({model:f.model,control:f.control});
 assert.equal(evidence.meshVerdict,'pass');assert.equal(evidence.provenance.unionMethod,'afgm-neutral-analysis-group/1');
 assert.deepEqual(f.nativeCalls.map(c=>c.generation),[100,101]);assert.deepEqual(echo,ticket);assert.deepEqual(f.bytes,before);
 assert.deepEqual(evidence.parts.map(p=>[p.sourceIndex,p.slot,p.materialId,p.materialSourceId]),[[41,37,'stable-material',401],[99,64,'second-full-id',402]]);
 assert.deepEqual(evidence.provenance.materialReadbackParts.map(p=>p.materialKey.slot),[37,64]);
 assert.deepEqual(evidence.provenance.unionAnalysisParts[0].inputSourceIndices,[41,99]);
 assert.equal(evidence.provenance.materialSourceTable.bindings.some(p=>p.materialSourceId===0xffffffff),false);
 assert.equal(f.provider.describe(f.record,f.live),evidence);assert.equal(f.released(),false);await f.provider.reset();
});

test('analysis readback rejects altered source authority, membership, layout and key without cached eligibility',async()=>{
 const mutations=[
  ({metadata})=>{metadata.sourceSnapshotSha256='a'.repeat(64);},
  ({metadata})=>{metadata.sourceSnapshotId=12;},
  ({metadata})=>{metadata.revision='3';},
  ({metadata})=>{metadata.groups[0].inputParts=[0];metadata.groups[0].sourceIndices=[41];},
  ({metadata})=>{metadata.groups[0].sourceIndices=[41,1];},
  ({metadata})=>{metadata.groups[0].materialSource=401;},
  ({metadata})=>{metadata.groups[0].slot=64;},
  ({bytes})=>{new DataView(bytes.buffer).setUint32(16,8,true);},
  ({metadata})=>{metadata.sourceUnchanged=false;},
  ({metadata})=>{metadata.meshVerdict='pass';},
 ];
 for(const alterUnion of mutations){
  const f=await twoMaterialFixture({alterUnion});
  await assert.rejects(f.provider.qualify({model:f.model,control:f.control}),e=>e.code?.startsWith('SCENE_'));
  assert.equal(f.nativeCalls.length,2);assert.notEqual(f.provider.describe(f.record,f.live).status,'ready');await f.provider.reset();
 }
});

test('failed material check stops before analysis; degenerate whole union never inherits material pass',async()=>{
 const makeDegenerate=({bytes})=>{const v=new DataView(bytes.buffer),o=v.getUint32(52,true);v.setUint32(o,v.getUint32(o+4,true),true);};
 for(const stage of ['material','union']){
  const f=await twoMaterialFixture(stage==='material'?{alterMaterial:makeDegenerate}:{alterUnion:makeDegenerate});
  const {evidence}=await f.provider.qualify({model:f.model,control:f.control});
  assert.equal(evidence.meshVerdict,'fail');assert.equal(f.nativeCalls.length,stage==='material'?1:2);
  if(stage==='material')assert.equal(evidence.provenance.union,null);
  else{assert.equal(evidence.provenance.materialReadback.verdict,'pass');assert.equal(evidence.provenance.union.verdict,'fail');}
  await f.provider.reset();
 }
});

test('cancel or authority loss during second AFGM call cannot publish and does not release source',async()=>{
 for(const afterSecond of [f=>f.abort.abort(),f=>{f.live.sessionKey={};},f=>{f.live.state.revision++;},f=>{f.control.ticket.generation++;},f=>{f.bytes[130]^=1;}]){
  const f=await twoMaterialFixture({afterSecond});
  await assert.rejects(f.provider.qualify({model:f.model,control:f.control}));
  assert.equal(f.nativeCalls.length,2);assert.notEqual(f.provider.describe(f.record,f.live).status,'ready');
  assert.equal(f.released(),false);await f.provider.reset();
 }
});

test('reset awaits an in-flight analysis readback before a new qualification can publish',async()=>{
 let entered,proceed;const started=new Promise(r=>entered=r),wait=new Promise(r=>proceed=r);
 const f=await twoMaterialFixture({afterSecond:async()=>{entered();await wait;}});
 f.validator.reset=async()=>{proceed();};
 const pending=f.provider.qualify({model:f.model,control:f.control}),rejected=assert.rejects(pending);
 await started;await f.provider.reset();await rejected;
 assert.equal(f.nativeCalls.length,2);assert.equal(f.provider.describe(f.record,f.live).status,'unverified');assert.equal(f.released(),false);
});
