import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';
import * as domain from '../../src/domain/index.mjs';
import {canonicalJSON,sha256} from '../../src/storage/common.mjs';
import {domainStateFingerprint} from '../../src/storage/history.mjs';
import {validateState} from '../../src/app/documents.mjs';
import {readSnapshot,inspectMesh} from '../oracles/mesh-oracle.mjs';
import {partMesh} from '../../src/kernel/source-assembly/tests/oracles/spatial-oracle.mjs';
import {adapters,svgState,adoptState,ownTestState,change,client,live,setLive,controlFor,noOwned,evidence,M} from './harness.mjs';
const rows=[];
function setParameters(f,changes){
 const p=domain.previewCommand(f.state,{id:'parameters.set',args:{changes}});assert.ok(p.ok,JSON.stringify(p));
 return {...f,state:validateState(domain.commitPreview(f.state,p).state)};
}
async function accept(f,p){
 assert.equal(p.status,'proposal');assert.equal(p.expected.headHash,await domainStateFingerprint(f.state));
 assert.equal(p.expected.revision,f.state.revision);assert.equal(p.geometryVerified,false);
 let state=structuredClone(f.state);
 if(p.parameterCommand){const q=domain.previewCommand(state,p.parameterCommand);assert.ok(q.ok,JSON.stringify(q));state=structuredClone(domain.commitPreview(state,q).state);}
 else state.revision++;
 state.content.app.source.metadata.productBindings=structuredClone(p.productBindings);
 state.content.app.materials=structuredClone(p.materials);state.content.app.text=structuredClone(p.text);
 return {...f,state:validateState(state)};
}
const checked=model=>{
 const mesh=readSnapshot(model.bytes());mesh.parts.forEach(p=>inspectMesh(partMesh(mesh,p)));return mesh;
};
function planeCheck(model,semanticId,z0,z1){
 const sem=model.product.semantics,mesh=checked(model),slabs=new Set(sem.lineage.filter(x=>x.sourceId===semanticId).map(x=>x.slabId));
 const parts=sem.parts.filter(x=>x.role===1&&slabs.has(x.sourceId));assert.ok(parts.length);
 for(const p of parts){const z=partMesh(mesh,mesh.parts[p.meshPart]).vertices.map(v=>v[2]);assert.ok(Math.abs(Math.min(...z)-z0)<2e-6);assert.ok(Math.abs(Math.max(...z)-z1)<2e-6);}
}
test('R2 model inspection checks live ownership/head/metadata and exposes no final-export qualification',async()=>{
 assert.equal(M._arch_mech_semantics_version(),3);assert.equal(M._arch_source_semantics_version(),2);
 const f=await adoptState(await svgState()),a=adapters(),m=await a.engine.build(ownTestState(f)),c=controlFor(f.state);
 const info=await a.inspectModel({model:m,control:c});assert.equal(info.semantics.mechanicsSemantics,3);assert.equal(info.semantics.sourceSemantics,2);
 assert.equal(info.exportDescriptor.mechanicsSemantics,3);assert.equal(info.exportDescriptor.sourceSemantics,2);
 assert.deepEqual(info.gates,{matchingHead:true,nativeBuildAccepted:true,sourceVerdict:0,mechanicsVerdict:0,exportBlocked:false,independentMeshVerdict:0,requiresParentGateState:true,finalSceneValidation:'unverified',totalErrorBoundMm:null,fitQualification:'unqualified',printerQualification:'unverified'});
 const wire=new DataView(m.bytes().buffer,m.bytes().byteOffset,m.bytes().byteLength),partAt=wire.getUint32(56,true);
 for(const p of info.exportDescriptor.parts)assert.equal(p.sourceIndex,wire.getUint32(partAt+p.partIndex*40+20,true));
 const fake={...m};a.kernelLeases.set(fake,a.kernelLeases.get(m));await assert.rejects(a.inspectModel({model:fake,control:c}),{code:'PRODUCT_MODEL_UNREGISTERED'});a.kernelLeases.delete(fake);
 const raw=a.kernelLeases.get(m).root.metadata.semanticBytes,saved=raw[16];raw[16]^=1;
 await assert.rejects(a.inspectModel({model:m,control:c}),{code:'PRODUCT_MODEL_METADATA_CHANGED'});raw[16]=saved;
 const cancelled=controlFor(f.state),pending=a.inspectModel({model:m,control:cancelled});cancelled.abort.abort();await assert.rejects(pending,{code:'PRODUCT_CANCELLED'});
 const changedTicket=controlFor(f.state),pendingTicket=a.inspectModel({model:m,control:changedTicket});changedTicket.ticket.id='replaced';await assert.rejects(pendingTicket,{code:'PRODUCT_TICKET_CHANGED'});
 const epoch=client.epoch;client.epoch++;await assert.rejects(a.inspectModel({model:m,control:c}),{code:'PRODUCT_MODEL_RETIRED'});client.epoch=epoch;
 setLive({...live,state:change(f,s=>s.content.app.name='other head').state});
 await assert.rejects(a.inspectModel({model:m,control:c}),{code:'PRODUCT_HEAD_CHANGED'});setLive({...live,state:f.state});
 rows.push({case:'actual-current-model-gates',head:info.head,gates:info.gates});
 m.release();await assert.rejects(a.inspectModel({model:m,control:c}),{code:'PRODUCT_MODEL_UNREGISTERED'});await a.reset();noOwned();
});
test('R2 current art faces produce parameter and per-region layer bindings for unequal first layers',async()=>{
 for(const first of [.16,.25]){
  let f=await adoptState(await svgState());f.state=structuredClone(f.state);f.state.schedule=domain.createSchedule({firstLayerHeight:first,layerHeight:.2});
  f=setParameters(f,[{id:'baseH',value:{heightMode:'layers',layers:12,datum:{kind:'bed'},referenceLayer:0}}]);
  const a=adapters(),m=await a.engine.build(ownTestState(f)),c=controlFor(f.state),before=canonicalJSON(f.state),key=f.state.content.app.source.metadata.productBindings.regions[0].sourceKey;
  const p=await a.prepareHeightBindings({model:m,control:c,changes:[
   {target:{kind:'parameter',field:'artH'},mode:'layers',layers:4},
   {target:{kind:'region',sourceKey:key},mode:'layers',layers:4}
  ]});
  assert.equal(canonicalJSON(f.state),before);assert.equal(p.status,'proposal',JSON.stringify(p.diagnostics));
  assert.ok(p.updates.every(u=>u.after.datum===128&&u.after.referenceLayer===12));
  const next=await accept(f,p),newModel=await a.engine.build(ownTestState(next)).catch(e=>{throw new Error(JSON.stringify({code:e.code,details:e.details}));});
  const sem=newModel.product.semantics,ident=sem.provenance.identities.find(x=>x.kind==='region'&&x.key===key).id;
  const interval=sem.sourceIntervals.find(x=>x.semanticId===ident&&x.datum===128),z0=first+11*.2;
  assert.ok(Math.abs(interval.z0-z0)<1e-12);assert.ok(Math.abs(interval.z1-z0-.8)<1e-12);assert.equal(interval.referenceLayer,12);
  assert.equal(interval.coordinateFrame,'manufacturing-z');assert.equal(interval.conversionAvailable,true);planeCheck(newModel,ident,z0,z0+.8);
  assert.equal(sem.inputRegions.find(x=>x.semanticId===ident).height.fieldId,27);
  rows.push({case:'actual-art-height',first,interval,changes:p.updates});
  for(const badTag of ['reference','datum']){
   const bad=change(next,s=>{const r=s.content.app.source.metadata.productBindings.regions.find(x=>x.sourceKey===key);if(badTag==='reference')r.height.referenceLayer=0;else r.height.datum=133;});
   await assert.rejects(a.engine.build(ownTestState(bad)),e=>e.code==='PRODUCT_NATIVE_BLOCKED'&&e.details.sourceDiagnostics.some(d=>/SOURCE_(REFERENCE_LAYER_DOES_NOT_MEET_FACE|DATUM_MISMATCH)/.test(d.message)));
  }
  for(const binding of [{datum:{kind:'feature',featureId:'source:art.bottom'},referenceLayer:0},{datum:{kind:'feature',featureId:'source:text.bottom'},referenceLayer:12}]){
   const badMM=setParameters(f,[{id:'artH',value:{heightMode:'mm',mm:.8,...binding}}]);
   await assert.rejects(a.engine.build(ownTestState(badMM)),e=>e.code==='PRODUCT_NATIVE_BLOCKED'&&e.details.sourceDiagnostics.some(d=>/SOURCE_(REFERENCE_LAYER_DOES_NOT_MEET_FACE|DATUM_MISMATCH)/.test(d.message)));
  }
  newModel.release();m.release();await a.reset();noOwned();
 }
});
test('R2 off-grid nominal MM remains unchanged; explicit conversion blocks and never invents layer0',async()=>{
 let f=await adoptState(await svgState());f.state=structuredClone(f.state);f.state.schedule=domain.createSchedule({firstLayerHeight:.16,layerHeight:.2});f.state=validateState(f.state);
 const a=adapters(),m=await a.engine.build(ownTestState(f)),c=controlFor(f.state),info=await a.inspectModel({model:m,control:c});
 const interval=info.semantics.sourceIntervals.find(i=>i.datum===128);
 assert.equal(interval.z0,2.4);assert.equal(interval.referenceLayer,null);assert.equal(interval.conversionAvailable,false);
 assert.ok(info.semantics.sourceDiagnostics.some(d=>d.code===109));
 for(const request of [{mode:'layers',layers:4},{mode:'mm',mm:.8}]){
  const p=await a.prepareHeightBindings({model:m,control:c,changes:[{target:{kind:'parameter',field:'artH'},...request}]});
  assert.equal(p.status,'blocked');assert.equal(p.productBindings,null);assert.equal(p.parameterCommand,null);
  assert.equal(p.diagnostics[0].code,'PRODUCT_HEIGHT_CONVERSION_UNAVAILABLE');assert.equal(p.diagnostics[0].referenceLayer,null);
 }
 const p=await a.prepareHeightBindings({model:m,control:c,changes:[{target:{kind:'parameter',field:'artH'},mode:'mm',mm:.8,binding:'unspecified-mm'}]});
 const next=await accept(f,p),out=await a.engine.build(ownTestState(next));
 const param=out.product.semantics.parameters.find(x=>x.field==='artH');assert.equal(param.value,.8);assert.equal(param.datum,0);assert.equal(param.referenceLayer,0);
 assert.equal(out.product.semantics.sourceIntervals.find(i=>i.datum===128).referenceLayer,null);
 rows.push({case:'off-grid-nominal-MM',interval,input:param});out.release();m.release();await a.reset();noOwned();
});
test('R2 downward recess uses its actual top reference; underflow and distinct column tops block',async()=>{
 let f=await adoptState(await svgState('keychain','chim'));f.state=structuredClone(f.state);f.state.schedule=domain.createSchedule({firstLayerHeight:.16,layerHeight:.2});
 f=setParameters(f,[{id:'baseH',value:{heightMode:'layers',layers:4,datum:{kind:'bed'},referenceLayer:0}},{id:'artH',value:{heightMode:'mm',mm:.4}}]);
 const a=adapters(),m=await a.engine.build(ownTestState(f)),c=controlFor(f.state);
 const p=await a.prepareHeightBindings({model:m,control:c,changes:[{target:{kind:'parameter',field:'artH'},mode:'layers',layers:3}]});
 assert.equal(p.updates[0].after.datum,131);assert.equal(p.updates[0].after.referenceLayer,4);assert.equal(p.updates[0].faces[0].direction,'down');
 const tooDeep=await a.prepareHeightBindings({model:m,control:c,changes:[{target:{kind:'parameter',field:'artH'},mode:'layers',layers:5}]});
 assert.equal(tooDeep.status,'blocked');assert.equal(tooDeep.diagnostics[0].code,'PRODUCT_HEIGHT_LAYER_RANGE');
 const next=await accept(f,p),out=await a.engine.build(ownTestState(next)),i=out.product.semantics.sourceIntervals.find(i=>i.datum===131);
 assert.ok(Math.abs(i.z1-.76)<1e-12);assert.ok(Math.abs(i.z0-.16)<1e-12);checked(out);rows.push({case:'downward-recess',interval:i});
 out.release();m.release();await a.reset();noOwned();
 let bands=await adoptState(await svgState());bands=setParameters(bands,[{id:'layerBand',value:true},{id:'bandCore',value:true}]);
 const b=adapters(),bm=await b.engine.build(ownTestState(bands));
 const ambiguous=await b.prepareHeightBindings({model:bm,control:controlFor(bands.state),changes:[{target:{kind:'parameter',field:'bandCap'},mode:'layers',layers:1}]});
 assert.equal(ambiguous.status,'blocked');assert.equal(ambiguous.diagnostics[0].code,'PRODUCT_HEIGHT_FACE_AMBIGUOUS');
 rows.push({case:'multi-column-cap',diagnostics:ambiguous.diagnostics});bm.release();await b.reset();noOwned();
});
test('R2 elevated clicky intervals are already manufacturing Z, no body-datum addition',async()=>{
 const f=await adoptState(await svgState('clicky')),a=adapters(),m=await a.engine.build(ownTestState(f)),sem=m.product.semantics;
 assert.ok(sem.bodyDatumZ>0);
 for(const i of sem.sourceIntervals.filter(i=>i.datum===128))planeCheck(m,i.semanticId,i.z0,i.z1);
 rows.push({case:'elevated-current-face',bodyDatumZ:sem.bodyDatumZ,intervals:sem.sourceIntervals});m.release();await a.reset();noOwned();
});
test.after(()=>{fs.writeFileSync(path.join(evidence,'r2-faces-and-gates.json'),JSON.stringify(rows,null,2)+'\n');noOwned();});
