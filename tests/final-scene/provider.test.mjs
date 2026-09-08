import test from 'node:test';import assert from 'node:assert/strict';
import {providerFixture} from './provider-fixture.mjs';
import {qualifyMesh} from '../../src/core/mesh-qualification.mjs';
import {sha256,canonicalJSON} from '../../src/storage/common.mjs';
import {arch,box} from './fixtures.mjs';
const reject=(promise,code)=>assert.rejects(promise,e=>e.code===code);
// Explicit synthetic native reply for protocol tests; geometry uses the real checker.
const geometryMetadata=async f=>({
 version:'arch-final-scene-geometry/1',format:'ARCH/1',geometry:'material-union',
 sourceSnapshotSha256:await sha256(f.bytes),sourceSnapshotId:11,sourceSnapshotGeneration:7,revision:'2',
 grouping:'slot-rgba-materialSource/1',coordinateFrame:'source-manufacturing-mm',sourceUnchanged:true,meshVerdict:'unverified',
 groups:[{part:0,slot:1,rgba:0xff0000ff,materialSource:401,inputParts:[0],sourceIndices:[0]}]
});
test('real checker + explicit synthetic transport publishes exact frozen evidence without releasing caller',async()=>{
 const f=await providerFixture();assert.equal(f.provider.refresh,f.provider.qualify);
 const r=await f.provider.refresh({model:f.model,control:f.control});
 assert.equal(r.evidence.meshVerdict,'pass');assert.equal(r.evidence.snapshotSha256,await sha256(f.bytes));
 assert.equal(r.evidence.parts[0].materialSourceId,401);assert.equal(r.evidence.parts[0].materialProvenanceId,'18446744073709550000');
 assert.equal(f.provider.describe(f.record,f.live),r.evidence);assert.ok(Object.isFrozen(r.evidence.parts));assert.equal(f.calls(),1);assert.equal(f.released(),false);
 await f.provider.reset();assert.equal(f.provider.describe(f.record,f.live).status,'unverified');assert.equal(f.released(),false);
});
test('plausible model stats/public metadata cannot forge a registered lease',async()=>{
 const f=await providerFixture(),fake={...f.model,stats:{verdict:'pass'}};f.live.model=fake;
 await reject(f.provider.qualify({model:fake,control:f.control}),'SCENE_MODEL_UNOWNED');assert.equal(f.calls(),0);
});
test('truthful failed geometry never calls union and cannot become pass',async()=>{
 const f=await providerFixture(),d=new DataView(f.bytes.buffer),off=d.getUint32(52,true);d.setUint32(off,d.getUint32(off+4,true),true);
 const r=await f.provider.qualify({model:f.model,control:f.control});assert.equal(r.evidence.meshVerdict,'fail');assert.equal(f.calls(),0);
});
test('unknown gate, duplicate uint32 material and slot zero reject',async()=>{
 for(const mutate of [f=>delete f.gates.assemblyView,f=>f.inspection.exportDescriptor.parts[0].slot=0,f=>f.gates.invalidInput=true]){
  const f=await providerFixture();mutate(f);await assert.rejects(f.provider.qualify({model:f.model,control:f.control}));assert.equal(f.calls(),0);
 }
 const f=await providerFixture({materialSourceIds:()=>[{materialId:'stable-material',materialSourceId:1},{materialId:'other',materialSourceId:1}]});
 await reject(f.provider.qualify({model:f.model,control:f.control}),'SCENE_MATERIAL_BINDINGS');
});
test('head/session/project/lease and byte changes invalidate cached eligibility immediately',async()=>{
 for(const mutate of [f=>f.live.headHash='a'.repeat(64),f=>f.live.sessionKey={},f=>f.live.projectId='other',f=>f.kernelLeases.delete(f.model),f=>f.bytes[130]^=1,f=>f.root.metadata.semanticBytes[0]^=1]){
  const f=await providerFixture();await f.provider.qualify({model:f.model,control:f.control});mutate(f);assert.notEqual(f.provider.describe(f.record,f.live).status,'ready');
 }
});
test('head or gate changes during Worker completion cannot publish stale results',async()=>{
 for(const mutate of [f=>f.live.state.revision++,f=>f.gates.key='gate-2']){
  let proceed,entered;const started=new Promise(r=>entered=r),wait=new Promise(r=>proceed=r);
  const f=await providerFixture({validationClient:{check:async(b,o)=>{entered();await wait;return qualifyMesh(b,o);},reset:async()=>{}}});
  const p=f.provider.qualify({model:f.model,control:f.control});await started;mutate(f);proceed();await assert.rejects(p);assert.equal(f.calls(),0);
 }
});
test('reset awaits in-flight publication barrier; cancel retains caller lease',async()=>{
 let entered,proceed;const wait=new Promise(r=>proceed=r),started=new Promise(r=>entered=r);
 const f=await providerFixture({validationClient:{check:async(b,o)=>{entered();await wait;return qualifyMesh(b,o);},reset:async()=>{proceed();}}});
 const p=f.provider.qualify({model:f.model,control:f.control});await started;await f.provider.reset();await assert.rejects(p);assert.equal(f.calls(),0);assert.equal(f.released(),false);
});
test('invalid union binding cannot borrow actual snapshot pass',async()=>{
 const f=await providerFixture();f.runtime.finalExport=async()=>({bytes:new Uint8Array(84),metadata:{sourceSnapshotSha256:'a'.repeat(64)}});
 await reject(f.provider.qualify({model:f.model,control:f.control}),'SCENE_UNION_BINDING');
});
test('no union capability explicitly stays unverified',async()=>{
 const f=await providerFixture();f.runtime.serviceCapabilities.finalExport=false;
 const r=await f.provider.qualify({model:f.model,control:f.control});assert.equal(r.evidence.meshVerdict,'unverified');assert.equal(r.evidence.provenance.union,null);
});
test('reported float64 union capability requires exact typed source bindings',async()=>{
 const f=await providerFixture();f.runtime.serviceCapabilities.finalSceneGeometry=true;
 f.runtime.finalSceneGeometry=async()=>({bytes:f.bytes.slice(),metadata:await geometryMetadata(f)});
 const r=await f.provider.qualify({model:f.model,control:f.control});assert.equal(r.evidence.meshVerdict,'pass');assert.equal(r.evidence.provenance.unionScope,'independent-binary64-union-readback');assert.equal(f.calls(),0);
});

test('control signal replacement cannot retain the original private cancellation listener',async()=>{
 let entered,proceed;const started=new Promise(r=>entered=r),wait=new Promise(r=>proceed=r);
 const f=await providerFixture({validationClient:{check:async(b,o)=>{entered();await wait;return qualifyMesh(b,o);},reset:async()=>{}}});
 const signal=f.control.signal,add=signal.addEventListener.bind(signal),remove=signal.removeEventListener.bind(signal);let added=0,removed=0;
 signal.addEventListener=(...args)=>{added++;return add(...args);};signal.removeEventListener=(...args)=>{removed++;return remove(...args);};
 const p=f.provider.refresh({model:f.model,control:f.control});await started;f.control.signal=new AbortController().signal;proceed();
 await p;assert.equal(added,1);assert.equal(removed,1);await f.provider.reset();
});
test('AFGM original full keys/membership, never private group ordinals, determine material identity',async()=>{
 for(const mode of ['valid-dense','single-group-no-extra-buffer','wrong-slot','wrong-source','wrong-members','wrong-label','wrong-source-index','wrong-grouping','wrong-verdict','wrong-generation','wrong-extra-key']){
  const f=await providerFixture();f.runtime.serviceCapabilities.finalSceneGeometry=true;
  f.inspection.exportDescriptor.parts[0].slot=37;f.inspection.exportDescriptor.parts[0].sourceIndex=99;
  const original=new DataView(f.bytes.buffer),originalPart=original.getUint32(56,true);original.setUint32(originalPart+20,99,true);
  f.runtime.finalSceneGeometry=async()=>{
   const bytes=f.bytes.slice(),d=new DataView(bytes.buffer),part=d.getUint32(56,true);d.setUint32(part+20,0,true);
   const metadata=await geometryMetadata(f),row=metadata.groups[0];row.slot=37;row.sourceIndices=[99];
   if(mode==='wrong-slot')row.slot=1;if(mode==='wrong-source')row.materialSource=2;
   if(mode==='wrong-members'){row.inputParts=[0,0];row.sourceIndices=[99,99];}
   if(mode==='wrong-label')d.setUint32(part+20,99,true);
   if(mode==='wrong-source-index')row.sourceIndices=[0];
   if(mode==='wrong-grouping')metadata.grouping='slot-rgba/1';
   if(mode==='wrong-verdict')metadata.meshVerdict='pass';
   if(mode==='wrong-extra-key')row.realSlot=37;
   if(mode==='wrong-generation')d.setUint32(16,8,true);
   return {bytes,metadata};
  };
  if(mode.startsWith('wrong-')){
   const code=mode==='wrong-generation'?'SCENE_GEOMETRY_GENERATION':'SCENE_GEOMETRY_MAPPING';
   await reject(f.provider.refresh({model:f.model,control:f.control}),code);continue;
  }
  const r=await f.provider.refresh({model:f.model,control:f.control});assert.equal(r.evidence.parts[0].slot,37);assert.equal(r.evidence.parts[0].sourceIndex,99);
  const mapped=r.evidence.provenance.materialReadbackParts[0];assert.equal(mapped.archSourceIndex,0);assert.equal(mapped.materialKey.slot,37);assert.deepEqual(mapped.inputSourceIndices,[99]);
  assert.equal(r.evidence.meshVerdict,'pass');assert.equal(r.evidence.provenance.unionMethod,'afgm-single-material-group/1');
  assert.equal(r.evidence.provenance.unionAnalysisParts,null);
  await f.provider.reset();
 }
});
test('same slot and RGBA do not collapse two full material-source IDs in AFGM metadata',async()=>{
 const meshes=[box(),box([2,0,0],[3,1,1])];
 for(const mode of ['full-keys','collapsed','swapped-keys']){
  const f=await providerFixture({fixtureMeshes:meshes,materialSourceIds:()=>[
   {materialId:'stable-material',materialSourceId:401},{materialId:'other-full-material-id',materialSourceId:402}
  ]});
  f.inspection.exportDescriptor.parts.push({...f.inspection.exportDescriptor.parts[0],partIndex:1,sourceIndex:1,id:'other-part',materialId:'other-full-material-id'});
  f.runtime.serviceCapabilities.finalSceneGeometry=true;
  let nativeCalls=0;
  f.runtime.finalSceneGeometry=async(root,request)=>{
   const metadata=await geometryMetadata(f);
   if(++nativeCalls===2){
    assert.deepEqual(request.mapping.map(p=>[p.part,p.source,p.slot,p.rgba,p.materialSource]),[[0,0,1,0xffffffff,0xffffffff],[1,1,1,0xffffffff,0xffffffff]]);
    const bytes=arch(meshes,{separateParts:false}),view=new DataView(bytes.buffer);view.setUint32(view.getUint32(56,true)+16,0xffffffff,true);
    metadata.groups=[{part:0,slot:1,rgba:0xffffffff,materialSource:0xffffffff,inputParts:[0,1],sourceIndices:[0,1]}];
    return {bytes,metadata};
   }
   metadata.groups.push({...metadata.groups[0],part:1,materialSource:402,inputParts:[1],sourceIndices:[1]});
   if(mode==='collapsed'){metadata.groups[0].inputParts=[0,1];metadata.groups[0].sourceIndices=[0,1];metadata.groups.pop();}
   if(mode==='swapped-keys'){metadata.groups[0].materialSource=402;metadata.groups[1].materialSource=401;}
   return {bytes:f.bytes.slice(),metadata};
  };
  if(mode!=='full-keys'){await reject(f.provider.refresh({model:f.model,control:f.control}),'SCENE_GEOMETRY_MAPPING');continue;}
  const {evidence}=await f.provider.refresh({model:f.model,control:f.control});assert.equal(evidence.meshVerdict,'pass');
  assert.deepEqual(evidence.parts.map(p=>[p.slot,p.rgba,p.materialId,p.materialSourceId]),[
   [1,0xff0000ff,'stable-material',401],[1,0xff0000ff,'other-full-material-id',402]
  ]);
  assert.equal(nativeCalls,2);assert.equal(evidence.provenance.materialReadbackParts.length,2);assert.equal(evidence.provenance.union.stats.parts,1);
  assert.equal(evidence.provenance.unionMethod,'afgm-neutral-analysis-group/1');
  assert.equal(evidence.provenance.unionAnalysisParts[0].materialKey.materialSourceId,0xffffffff);
  await f.provider.reset();
 }
});
test('full material table retains unused IDs and digest; any changed row invalidates cached proof',async()=>{
 const bindings=[{materialId:'unused-retained-material',materialSourceId:999},{materialId:'stable-material',materialSourceId:401}];
 const f=await providerFixture({materialSourceIds:()=>bindings}),r=await f.provider.refresh({model:f.model,control:f.control});
 const table=r.evidence.provenance.materialSourceTable,{digest,...body}=table;
 assert.equal(digest,await sha256(canonicalJSON(body)));assert.equal(table.bindings.length,2);assert.equal(r.evidence.parts.length,1);
 assert.deepEqual(table.bindings.map(r=>r.materialId),['stable-material','unused-retained-material']);
 bindings[0].materialSourceId=998;assert.notEqual(f.provider.describe(f.record,f.live).status,'ready');
 assert.equal(table.bindings[1].materialSourceId,999);await f.provider.reset();
});
test('trusted build schedule gate preserves the domain namespaced hash for printing',async()=>{
 const f=await providerFixture();f.gates.projectScheduleHash='sha256:'+'b'.repeat(64);
 const r=await f.provider.refresh({model:f.model,control:f.control});assert.equal(r.evidence.projectScheduleHash,f.gates.projectScheduleHash);
 const bad=await providerFixture();bad.gates.projectScheduleHash='b'.repeat(64);
 await reject(bad.provider.refresh({model:bad.model,control:bad.control}),'SCENE_SCHEDULE_HASH');
});