import {loadExportModule} from './export-module.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {serviceTransport,setup} from './export-fixture.mjs';
import {installFloatDouble,deferred} from './export-float-double.mjs';
import {stlOracle,near} from './export-oracles.mjs';
import {sha256} from '../../src/printing/src/contracts.mjs';
const M=await loadExportModule(),T=serviceTransport(M);
const rejects=(fn,code)=>assert.rejects(fn,e=>{assert.equal(e.code,code,e.stack);return true;});
async function fixture(fn){const h=await setup(T,{index:0}),d=installFloatDouble(T,h);try{await fn(h,d);}finally{h.close();assert.equal(d.resident,0);d.restore();assert.deepEqual(T.stats(),{liveTestRoots:0,releasedPointersRetired:true});}}
const format=h=>h.exporter.formats(h.input('stl-union')).find(f=>f.id==='stl-union');

test('FLOAT lifecycle double: no bytes or confirmation before explicit call; original options and source retained',()=>fixture(async(h,d)=>{
 const input=h.input('stl-union'),before=await sha256(h.root.bytes().slice()),state=JSON.stringify(h.state),options=JSON.stringify(h.exportOptions),released=T.counters.rootReleases;
 const p=await h.exporter.export(input);
 assert.deepEqual(Object.keys(p).sort(),['changes','confirm','proposalHash','release','status','ticket','version']);assert.equal(p.status,'prepared-proposal');
 assert.equal(d.confirms,0);assert.equal(d.resident,1);assert.equal('bytes'in p,false);assert.equal('artifact'in p,false);assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.changes)&&Object.isFrozen(p.ticket));
 assert.deepEqual(d.policy,{version:1,maximumDisplacementMm:.00001,workLimit:50_000_000});assert.equal(format(h).enabled,true);
 assert.equal(JSON.stringify(h.state),state);assert.equal(JSON.stringify(h.exportOptions),options);assert.equal(await sha256(h.root.bytes().slice()),before);assert.equal(T.counters.rootReleases,released);
 const a=await p.confirm(input);near(stlOracle(a.bytes).volume,1500);assert.equal(d.confirms,1);assert.equal(d.resident,1);
 assert.notEqual(d.prepareGeneration,d.confirmGeneration);assert.notEqual(input.ticket.generation,d.prepareGeneration);
 assert.deepEqual(a.metadata.conditioning.confirmation,d.prepared.confirmation);assert.equal(a.metadata.service.floatConditioning.confirmed,true);
 assert.equal(a.metadata.conditioning.policy.version,'arch-app-float-proposal-policy/1');assert.equal(a.metadata.qualification.mesh,'unverified');assert.equal(a.metadata.qualification.sourceMesh,'pass');assert.equal(a.metadata.qualification.physical,'unverified');assert.match(a.metadata.warnings.join(' '),/Whole-pipeline/);
 assert.equal(await sha256(h.root.bytes().slice()),before);await rejects(()=>p.confirm(input),'FLOAT_PROPOSAL_CONSUMED');p.release();p.release();assert.equal(d.releases,1);assert.equal(T.counters.rootReleases,released);
}));

test('FLOAT lifecycle double: live original abort listener persists after prepare and is removed on retirement',()=>fixture(async(h,d)=>{
 const a=new AbortController(),input={...h.input('stl-union'),signal:a.signal};let listeners=0;
 const add=a.signal.addEventListener.bind(a.signal),remove=a.signal.removeEventListener.bind(a.signal);
 a.signal.addEventListener=(...args)=>{listeners++;return add(...args);};a.signal.removeEventListener=(...args)=>{listeners--;return remove(...args);};
 const p=await h.exporter.export(input);assert.equal(listeners,1);a.abort();assert.equal(d.releases,1);assert.equal(listeners,0);
 await rejects(()=>p.confirm({...input,signal:new AbortController().signal}),'FLOAT_PROPOSAL_RETIRED');assert.equal(d.confirms,0);
}));

test('FLOAT lifecycle double: release has no generation allocation or Worker operation',()=>fixture(async(h,d)=>{
 const p=await h.exporter.export(h.input('stl-union')),operations=T.counters.operations;
 T.client.disposed=true;try{p.release();p.release();assert.equal(T.counters.operations,operations);assert.equal(d.releases,1);}finally{T.client.disposed=false;}
}));

test('FLOAT lifecycle double: replacing the public input signal cannot move its retained listener or leak it on retirement',()=>fixture(async(h,d)=>{
 const original=new AbortController(),other=new AbortController();let listeners=0;
 const add=original.signal.addEventListener.bind(original.signal),remove=original.signal.removeEventListener.bind(original.signal);
 original.signal.addEventListener=(...args)=>{listeners++;return add(...args);};original.signal.removeEventListener=(...args)=>{listeners--;return remove(...args);};
 const input={...h.input('stl-union'),signal:original.signal},p=await h.exporter.export(input);assert.equal(listeners,1);
 input.signal=other.signal;other.abort();assert.equal(d.releases,0);p.release();assert.equal(listeners,0);assert.equal(d.releases,1);original.abort();assert.equal(d.releases,1);
}));

test('FLOAT lifecycle double: replacing confirmation signal still cancels from the original and removes that exact listener',()=>fixture(async(h,d)=>{
 const input=h.input('stl-union'),p=await h.exporter.export(input),original=new AbortController(),other=new AbortController(),started=deferred(),wait=deferred();let listeners=0;
 const add=original.signal.addEventListener.bind(original.signal),remove=original.signal.removeEventListener.bind(original.signal);
 original.signal.addEventListener=(...args)=>{listeners++;return add(...args);};original.signal.removeEventListener=(...args)=>{listeners--;return remove(...args);};
 const control={...input,signal:original.signal};d.beforeConfirm=()=>{started.resolve();return wait.promise;};
 const pending=p.confirm(control),rejection=rejects(()=>pending,'CANCELLED');await started.promise;assert.equal(listeners,1);control.signal=other.signal;original.abort();wait.resolve();await rejection;
 assert.equal(listeners,0);assert.equal(d.releases,1);p.release();assert.equal(d.releases,1);
}));

test('FLOAT lifecycle double: concurrent confirmation cannot cancel or duplicate the first artifact',()=>fixture(async(h,d)=>{
 const input=h.input('stl-union'),p=await h.exporter.export(input),wait=deferred(),started=deferred();
 d.beforeConfirm=()=>{started.resolve();return wait.promise;};const first=p.confirm(input);await started.promise;
 await rejects(()=>p.confirm(input),'FLOAT_CONFIRM_BUSY');assert.equal(d.releases,0);wait.resolve();await first;assert.equal(d.confirms,1);p.release();
}));

test('FLOAT lifecycle double: export is busy while proposal is owned; retirement restores ordinary operation',()=>fixture(async(h,d)=>{
 const input=h.input('stl-union'),p=await h.exporter.export(input);await rejects(()=>h.exporter.export(input),'EXPORT_BUSY');
 p.release();const next=await h.exporter.export(input);assert.equal(d.prepares,2);next.release();assert.equal(d.releases,2);
}));

for(const [name,change,code] of [
 ['session ABA',h=>h.context.sessionKey={new:true},'EXPORT_CONTEXT_STALE'],
 ['project head',h=>h.context.headHash='9'.repeat(64),'EXPORT_CONTEXT_STALE'],
 ['committed state',h=>h.state.content.app.changed=true,'EXPORT_STATE_STALE'],
 ['export pose',h=>h.exportOptions['stl-union'].pose={kind:'pattern-down-x',restOnBed:true},'EXPORT_OPTIONS_STALE'],
 ['lease identity',h=>h.bindings.kernelLeases.delete(h.model),'MODEL_LEASE_RETIRED'],
 ['upstream gate',h=>h.evidence.gates.assemblyView=true,'ASSEMBLY_VIEW'],
 ['mesh proof',h=>h.evidence.meshVerdict='unverified','FINAL_SCENE_EVIDENCE_STALE'],
 ['source primary retirement',h=>h.root.release(),'SNAPSHOT_RELEASED'],
 ['float runtime retirement',h=>T.client.serviceCapabilities.finalFloat=false,'FINAL_FLOAT_UNAVAILABLE'],
])test(`FLOAT lifecycle double: ${name} during pending proposal prevents publication and retires it`,()=>fixture(async(h,d)=>{
 const input=h.input('stl-union'),p=await h.exporter.export(input);change(h);await rejects(()=>p.confirm(input),code);assert.equal(d.confirms,0);assert.equal(d.releases,1);
}));

for(const method of ['reset','dispose'])test(`FLOAT lifecycle double: ${method} retires a pending proposal once`,()=>fixture(async(h,d)=>{
 const input=h.input('stl-union'),p=await h.exporter.export(input);h.exporter[method]();assert.equal(d.releases,1);p.release();await rejects(()=>p.confirm(input),'FLOAT_PROPOSAL_RETIRED');
}));

test('FLOAT lifecycle double: invalid ticket and an aborted confirmation control never dispatch confirmation',()=>fixture(async(h,d)=>{
 const input=h.input('stl-union'),p=await h.exporter.export(input);await rejects(()=>p.confirm({...input,ticket:{...input.ticket,id:'other-job'}}),'FLOAT_CONFIRM_CONTROL');assert.equal(d.releases,1);
 const next=await h.exporter.export(input),a=new AbortController();a.abort();await rejects(()=>next.confirm({...input,signal:a.signal}),'CANCELLED');assert.equal(d.confirms,0);assert.equal(d.releases,2);
}));

test('FLOAT lifecycle double: stale late prepare and aborted late prepare both release returned native proposal',()=>fixture(async(h,d)=>{
 for(const action of ['stale','abort']){
  const a=new AbortController(),input={...h.input('stl-union'),signal:a.signal},wait=deferred(),started=deferred();
  d.beforePrepare=()=>{started.resolve();return wait.promise;};const pending=h.exporter.export(input);await started.promise;
  if(action==='stale')h.context.sessionKey={changed:true};else a.abort();wait.resolve();await rejects(()=>pending,action==='stale'?'EXPORT_CONTEXT_STALE':'CANCELLED');
 }
 assert.equal(d.releases,2);assert.equal(d.confirms,0);
}));

test('FLOAT lifecycle double: cancellation during confirm rejects late bytes and preserves primary model',()=>fixture(async(h,d)=>{
 const input=h.input('stl-union'),p=await h.exporter.export(input),wait=deferred(),started=deferred(),a=new AbortController(),before=await sha256(h.root.bytes().slice());
 d.beforeConfirm=()=>{started.resolve();return wait.promise;};const pending=p.confirm({...input,signal:a.signal});await started.promise;a.abort();wait.resolve();
 await rejects(()=>pending,'CANCELLED');assert.equal(d.releases,1);assert.equal(await sha256(h.root.bytes().slice()),before);
}));

test('FLOAT lifecycle double: changed options during late confirm cannot publish captured bytes',()=>fixture(async(h,d)=>{
 const input=h.input('stl-union'),p=await h.exporter.export(input);d.afterConfirm=()=>{h.exportOptions['stl-union'].filename='changed.stl';};
 await rejects(()=>p.confirm(input),'EXPORT_OPTIONS_STALE');assert.equal(d.releases,1);
}));

test('FLOAT lifecycle double: bad proposal source/hash/budget/mapping metadata is rejected and released',()=>fixture(async(h,d)=>{
 const mutations=[p=>{p.confirmation={...p.confirmation,sourceHash:'0'.repeat(64)};},p=>{p.metadata.conditioning.proposalHash='0'.repeat(64);},p=>{p.metadata.conditioning.hausdorffUpperBoundMm=.004;},p=>{p.metadata.materialMapping[0].materialSource++;},p=>{p.metadata.conditioning.confirmed=true;},p=>{p.metadata.conditioning.qualification.wholePipelineErrorBoundMm=0;}];
 for(const mutate of mutations){d.afterPrepare=mutate;await rejects(()=>h.exporter.export(h.input('stl-union')),'FLOAT_PROPOSAL_METADATA');assert.equal(d.resident,0);}
 assert.equal(d.releases,mutations.length);assert.equal(d.confirms,0);
}));

test('FLOAT lifecycle double: mutable native metadata cannot change the captured confirmation',()=>fixture(async(h,d)=>{
 const input=h.input('stl-union'),p=await h.exporter.export(input);d.prepared.metadata.conditioning.proposalHash='0'.repeat(64);
 await rejects(()=>p.confirm(input),'FLOAT_PROPOSAL_METADATA');assert.equal(d.confirms,0);assert.equal(d.releases,1);
}));

test('FLOAT lifecycle double: bad STL identity/hash or conditioning receipt after confirm never publishes',()=>fixture(async(h,d)=>{
 const changes=[a=>{a.metadata.sourceProjectRevision='999';},a=>{a.bytes[90]^=1;},a=>{a.metadata.floatConditioning.confirmed=false;},a=>{a.metadata.floatConditioning.proposalHash='0'.repeat(64);}];
 const codes=['FINAL_OUTPUT_IDENTITY','FINAL_OUTPUT_HASH','FLOAT_CONFIRM_OUTPUT','FLOAT_CONFIRM_OUTPUT'];
 for(let i=0;i<changes.length;i++){const input=h.input('stl-union'),p=await h.exporter.export(input);d.afterConfirm=changes[i];await rejects(()=>p.confirm(input),codes[i]);assert.equal(d.resident,0);}
 assert.equal(d.releases,changes.length);
}));

test('FLOAT lifecycle double: current error budget only bounds a candidate, never confirms one',()=>fixture(async(h,d)=>{
 for(const errorMm of [.004,.000008,.000001]){h.exportOptions['stl-union'].errorMm=errorMm;const p=await h.exporter.export(h.input('stl-union'));assert.equal(d.policy.maximumDisplacementMm,Math.min(errorMm,.00001));assert.equal(d.confirms,0);p.release();}
}));

test('FLOAT lifecycle double: inspection and ZIP collision remain typed disabled; mesh unverified remains gated',()=>fixture(async(h,d)=>{
 h.exportOptions['stl-union'].inspection=true;await rejects(()=>h.exporter.export(h.input('stl-union')),'STL_FLOAT_COLLISION');assert.equal(format(h).enabled,false);
 await rejects(()=>h.exporter.export(h.input('stl-material-zip')),'STL_FLOAT_COLLISION');assert.equal(d.prepares,0);
 h.exportOptions['stl-union'].inspection=false;h.evidence.meshVerdict='unverified';await rejects(()=>h.exporter.export(h.input('stl-union')),'MESH_INSPECTION_REQUIRED');assert.equal(d.prepares,0);
}));

test('FLOAT lifecycle double: exact native collision and ready bit required; unavailable capability can later become ready',()=>fixture(async(h,d)=>{
 T.client.serviceCapabilities.finalFloat=false;await rejects(()=>h.exporter.export(h.input('stl-union')),'STL_FLOAT_COLLISION');assert.equal(format(h).enabled,false);assert.equal(d.prepares,0);
 T.client.serviceCapabilities.finalFloat=true;assert.equal(format(h).enabled,true);const p=await h.exporter.export(h.input('stl-union'));p.release();
 T.client.finalExport=async()=>{throw Object.assign(Error('approx STL_FLOAT_COLLISION'),{code:'INVALID_SERIALIZATION'});};
 await rejects(()=>h.exporter.export(h.input('stl-union')),'INVALID_SERIALIZATION');assert.equal(d.prepares,1);
}));
