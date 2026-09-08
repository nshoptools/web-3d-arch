import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createPrintingAdapters,PRINTING_LIMITS} from '../../src/integration/printing-adapters.mjs';
import {validateSchedule as checkPrintingSchedule,validateMaterials} from '../../src/printing/src/profiles.mjs';
import {validateSettings} from '../../src/server/settings.mjs';
import {createSchedule} from '../../src/domain/layers.mjs';
import {profiles,environment,clone,checkedProfile,sealed,canonical,BAMBU,U1} from './fixtures.mjs';
const base=fileURLToPath(new URL('../../',import.meta.url)),P=await profiles(base);
const ready=async e=>{const r=await e.adapter.refresh();assert.equal(r.selection.status,'ready',JSON.stringify(r.selection));return r.selection;};
const issue=async(e,code)=>assert.equal((await e.adapter.refresh()).selection.reasonCode,code);
test('existing sealed profiles pass actual settings and printing validators; no fixture defaults',async()=>{
 for(const profile of Object.values(P)){
  validateSettings({printerProfiles:[profile]});const e=environment(profile),before=canonical(e.auth.settings);
  const list=await e.adapter.list();assert.deepEqual(list.map(p=>({id:p.id,slots:p.filamentSlots,qualified:p.qualified})),[{id:profile.payload.id,slots:4,qualified:false}]);
  const d=e.adapter.describe(profile.payload.adapterId,e.current);assert.equal(d.status,'ready');
  assert.equal(d.printerProfile.sha256,profile.sha256);assert.equal(canonical(e.auth.settings),before);assert.deepEqual(d.printerProfile,profile);
  assert.equal(d.provenance.qualification.slicer,'unverified');assert.equal(d.provenance.qualification.physicalFit,'unqualified');assert.equal(d.provenance.profileSourceBytesVerified,false);
 }
 const empty=environment(P.bambu);empty.auth.settings.values={};assert.deepEqual(await empty.adapter.list(),[]);
});
test('domain .25/.20 schedule/origins and source hash are preserved without defaults',async()=>{
 const e=environment(P.bambu),before=canonical(e.current.state);const d=await ready(e);
 await checkPrintingSchedule(d.schedule,d.printerProfile);assert.equal(d.schedule.payload.firstLayerHeight,.25);assert.equal(d.schedule.payload.layerHeight,.2);
 assert.deepEqual(d.schedule.payload.origin,{firstLayerHeight:'user',layerHeight:'user'});assert.equal(d.provenance.projectScheduleHash,e.current.state.schedule.hash);
 assert.equal(canonical(e.current.state),before);assert.equal(d.schedule.payload.profileHash,P.bambu.sha256);
});
test('sealed profile import byte/hash corruption is retained but not listed or used',async()=>{
 const e=environment(P.bambu);e.auth.settings.values.printerProfiles[0].payload.settings.layer_height='0.24';
 const raw=canonical(e.auth.settings);const r=await e.adapter.refresh();assert.deepEqual(r.printers,[]);
 assert.equal(r.diagnostics[0].reasonCode,'SNAPSHOT_HASH');assert.equal(r.selection.reasonCode,'PRINTING_PROFILE_INVALID');assert.equal(canonical(e.auth.settings),raw);
});
test('unknown profile version/nozzle/slicer rights fail explicitly',async()=>{
 for(const [modify,expected]of [[p=>p.schemaVersion=2,'PROFILE_VERSION'],[p=>p.printer.nozzleDiametersMm=[.6],'UNSUPPORTED_NOZZLE'],[p=>p.slicer.version='unverified-new','UNSUPPORTED_SLICER_VERSION'],[p=>p.rights='unknown','PROFILE_RIGHTS']]){
  const e=environment(await checkedProfile(P.bambu,modify)),r=await e.adapter.refresh();assert.equal(r.printers.length,0);assert.equal(r.diagnostics[0].reasonCode,expected);
 }
});
test('profile IDs are exact; duplicate IDs and wrapper aliases cannot select a different profile',async()=>{
 const e=environment(P.bambu);e.auth.settings.values.printerProfiles.push(await checkedProfile(P.bambu,p=>p.settings.layer_height='0.24'));
 let r=await e.adapter.refresh();assert.equal(r.printers.length,0);assert.ok(r.diagnostics.every(x=>x.reasonCode==='PRINTING_PROFILE_DUPLICATE'));assert.equal(r.selection.reasonCode,'PRINTING_PROFILE_DUPLICATE');
 const a=environment(P.bambu);a.auth.settings.values.printerProfiles[0].id='wrapper-alias';r=await a.adapter.refresh();assert.equal(r.diagnostics[0].reasonCode,'PRINTING_DATA_ONLY');
 const b=environment(P.bambu);b.current.state.content.app.printerId='other-id';await issue(b,'PRINTING_PROFILE_REQUIRED');
});
test('same-slot exact material aliases survive; same color at another slot stays separate',async()=>{
 const e=environment(P.bambu);e.current.state.content.app.materials[1].slot=1;e.current.state.content.app.materials[1].color='#FF0000';
 e.scene.parts[1].slot=1;e.scene.parts[1].rgba=0xff0000ff;
 let d=await ready(e),table=validateMaterials(d.materialTable,d.printerProfile.payload);assert.equal(table.materials.length,1);assert.equal(table.aliases['material:đỏ'],table.aliases['material:xanh']);
 e.current.state.content.app.materials[1].slot=2;e.scene.parts[1].slot=2;d=await ready(e);table=validateMaterials(d.materialTable,d.printerProfile.payload);assert.equal(table.materials.length,2);
});
test('missing/excluded material and conflicting slot/color never inferred from another record',async()=>{
 for(const [change,code]of [[e=>e.current.state.content.app.materials.splice(0,1),'PRINTING_MATERIAL_UNMAPPED'],[e=>e.current.state.content.app.materials[0].excluded=true,'PRINTING_MATERIAL_UNMAPPED'],[e=>e.current.state.content.app.materials[0].slot=2,'PRINTING_MATERIAL_CONFLICT'],[e=>e.current.state.content.app.materials[0].color='#00FF00','PRINTING_MATERIAL_CONFLICT'],[e=>e.scene.parts[0].rgba=0xff000080,'PRINTING_MATERIAL_CONFLICT']]){
  const e=environment(P.bambu);change(e);await issue(e,code);
 }
});
test('native material IDs, semantic IDs, project IDs and duplicate materials reject collisions',async()=>{
 for(const [change,code]of [[e=>e.scene.parts[1].materialSourceId=e.scene.parts[0].materialSourceId,'PRINTING_NATIVE_ID_COLLISION'],[e=>e.scene.parts[1].semanticId=e.scene.parts[0].semanticId,'PRINTING_MATERIAL_UNMAPPED'],[e=>e.scene.parts[1].partIndex=0,'PRINTING_MATERIAL_UNMAPPED'],[e=>e.current.state.content.app.materials.push(clone(e.current.state.content.app.materials[0])),'PRINTING_MATERIAL_CONFLICT'],[e=>e.scene.projectId='other','PRINTING_FINAL_EVIDENCE_REQUIRED']]){
  const e=environment(P.bambu);change(e);await issue(e,code);
 }
});
test('same-slot color/polymer conflicts rejected by existing actual material validator',async()=>{
 const e=environment(P.bambu);e.current.state.content.app.materials[1].slot=1;e.scene.parts[1].slot=1;await issue(e,'MATERIAL_SLOT_CONFLICT');
});
test('profile slot table supplies exact polymer/extruder including U1 head permutations',async()=>{
 const e=environment(await checkedProfile(P.u1,p=>p.printer.slotExtruders=[4,3,2,1]));const d=await ready(e);
 assert.deepEqual(d.materialTable.materials.map(m=>m.extruder),[4,3]);
 assert.deepEqual(d.materialTable.materials.map(m=>m.type),[P.u1.payload.settings.filament_type[0],P.u1.payload.settings.filament_type[1]]);
 assert.equal(e.adapter.describe(BAMBU,e.current).reasonCode,'PRINTING_ADAPTER_MISMATCH');
});
test('actual domain schedule hash, profile dependency and range checks block mismatches',async()=>{
 let e=environment(P.bambu);e.current.state.schedule={...e.current.state.schedule,layerHeight:.21};await issue(e,'schedule-hash');
 e=environment(P.bambu);e.scene.projectScheduleHash='sha256:'+'0'.repeat(64);await issue(e,'PRINTING_PROJECT_SCHEDULE_MISMATCH');
 e=environment(P.bambu);e.current.state.schedule=createSchedule({firstLayerHeight:.25,layerHeight:.2,sources:{firstLayerHeight:'profile',layerHeight:'user'},profileId:'wrong'});e.scene.projectScheduleHash=e.current.state.schedule.hash;await issue(e,'PRINTING_PROJECT_PROFILE_MISMATCH');
 e=environment(P.bambu);e.current.state.schedule=createSchedule({firstLayerHeight:.5,layerHeight:.2,sources:{firstLayerHeight:'user',layerHeight:'user'}});e.scene.projectScheduleHash=e.current.state.schedule.hash;await issue(e,'SCHEDULE_RANGE');
 e=environment(await checkedProfile(P.bambu,p=>p.settings.max_layer_height=['0.16']));await issue(e,'SCHEDULE_PROFILE_RANGE');
});
test('valid profile-origin schedule preserves explicit first-layer override and ID',async()=>{
 const e=environment(P.bambu);e.current.state.schedule=createSchedule({firstLayerHeight:.25,layerHeight:.2,sources:{firstLayerHeight:'user',layerHeight:'profile'},profileId:P.bambu.payload.id});e.scene.projectScheduleHash=e.current.state.schedule.hash;
 const d=await ready(e);assert.equal(d.schedule.payload.origin.layerHeight,'profile');assert.equal(d.schedule.payload.firstLayerHeight,.25);
});
test('explicit runtime ABI evidence must bind exact client/epoch/hash; no ready-bit guess',async()=>{
 for(const change of [e=>e.runtime=null,e=>e.runtime={...e.runtime,client:{export3MF(){}}},e=>e.runtime.printingABI=0,e=>e.runtime.epoch++,e=>e.runtime.wasmSha256='bad',e=>e.record.client.disposed=true]){
  const e=environment(P.bambu);change(e);const r=await e.adapter.refresh();assert.notEqual(r.selection.status,'ready');assert.ok(['PRINTING_RUNTIME_UNVERIFIED','PRINTING_MODEL_REQUIRED'].includes(r.selection.reasonCode));
 }
});
test('unknown/unsafe upstream gates and retired leases stay unavailable',async()=>{
 for(const [change,code]of [[e=>delete e.scene.gates.invalidInput,'PRINTING_FINAL_EVIDENCE_REQUIRED'],[e=>e.scene.gates.assemblyView=true,'ASSEMBLY_VIEW'],[e=>e.model.release(),'SNAPSHOT_RELEASED'],[e=>e.kernelLeases.delete(e.model),'PRINTING_MODEL_REQUIRED']]){
  const e=environment(P.bambu);change(e);await issue(e,code);
 }
});
test('describe refuses every changed authority input without reusing old prepared data',async()=>{
 for(const change of [e=>e.auth.settings.revision++,e=>e.auth.settings.values.printerProfiles[0].payload.settings.layer_height='0.29',e=>e.current.headHash='d'.repeat(64),e=>e.current.state.content.app.materials[0].label='new name',e=>e.scene.key='new evidence',e=>e.runtime.key='new runtime',e=>e.current.state.content.app.printerId=P.u1.payload.id,e=>e.scene.parts[0].slot=2]){
  const e=environment(P.bambu);await ready(e);change(e);assert.notEqual(e.adapter.describe(BAMBU,e.current).status,'ready');
 }
 const e=environment(P.bambu);await ready(e);const foreign={...e.current,headHash:'f'.repeat(64)};assert.equal(e.adapter.describe(BAMBU,foreign).reasonCode,'PRINTING_CONTEXT_STALE');
});
test('list reads current updated/imported/reset settings; no stale profile list',async()=>{
 const e=environment(P.bambu);assert.equal((await e.adapter.list())[0].id,P.bambu.payload.id);
 e.auth.settings={schemaVersion:1,revision:3,values:{printerProfiles:[clone(P.u1)]}};assert.equal((await e.adapter.list())[0].id,P.u1.payload.id);
 e.auth.settings={schemaVersion:1,revision:4,values:{}};assert.deepEqual(await e.adapter.list(),[]);assert.notEqual(e.adapter.describe(BAMBU,e.current).status,'ready');
});
test('account logout and user/session ABA cannot publish or reuse an earlier result',async()=>{
 const e=environment(P.bambu);await ready(e);const old=e.adapter.describe(BAMBU,e.current),pending=e.adapter.list();
 const original=e.auth;const newKey={};e.auth={...original,sessionKey:newKey};e.current={...e.current,sessionKey:newKey};
 await assert.rejects(pending,{code:'PRINTING_CONTEXT_STALE'});assert.notEqual(e.adapter.describe(BAMBU,e.current).status,'ready');
 const next=await ready(e);assert.notEqual(next.key,old.key);
 e.auth=null;e.current=null;e.adapter.reset();assert.deepEqual(await e.adapter.list(),[]);assert.equal(e.adapter.describe(BAMBU,null).reasonCode,'PRINTING_SIGNED_OUT');
});
test('reset/abort/concurrent refresh during digest publishes nothing stale',async()=>{
 let e=environment(P.bambu),pending=e.adapter.list();e.adapter.reset();await assert.rejects(pending,{code:'PRINTING_REFRESH_SUPERSEDED'});assert.equal(e.adapter.describe(BAMBU,e.current).reasonCode,'PRINTING_REFRESH_REQUIRED');
 e=environment(P.bambu);const abort=new AbortController();pending=e.adapter.list({signal:abort.signal});abort.abort();await assert.rejects(pending,{code:'CANCELLED'});
 e=environment(P.bambu);const first=e.adapter.list(),last=e.adapter.list();await assert.rejects(first,{code:'PRINTING_REFRESH_SUPERSEDED'});assert.equal((await last).length,1);
});
test('settings or profile caller alias changed during async hash cannot replace captured bytes',async()=>{
 const e=environment(P.bambu),pending=e.adapter.list();e.auth.settings.values.printerProfiles[0].payload.source.sha256='0'.repeat(64);
 await assert.rejects(pending,{code:'PRINTING_CONTEXT_STALE'});assert.notEqual(e.adapter.describe(BAMBU,e.current).status,'ready');
});
test('returned snapshots are immutable and never alias current settings/state',async()=>{
 const e=environment(P.bambu),d=await ready(e);assert.throws(()=>d.printerProfile.payload.settings.layer_height='1');assert.throws(()=>d.materialTable.materials.push({}));
 assert.equal(e.auth.settings.values.printerProfiles[0].payload.settings.layer_height,P.bambu.payload.settings.layer_height);
 e.current.state.content.app.materials[0].label='changed';assert.equal(d.materialTable.materials[0].name,'Vùng đỏ');
});
test('finite/depth/size/count/accessor/sparse/prototype data limits are bounded and actionable',async()=>{
 for(const [change,expected]of [[s=>s.values.printerProfiles=Array.from({length:51},()=>({})),'PRINTING_SETTINGS_SCHEMA'],[s=>s.values.printerProfiles[0].payload.x=Infinity,'PRINTING_DATA_ONLY'],[s=>s.values.x='a'.repeat(PRINTING_LIMITS.jsonBytes+1),'PRINTING_DATA_LIMIT'],[s=>{let a={};s.values.x=a;for(let i=0;i<25;i++)a=a.next={};},'PRINTING_DATA_LIMIT'],[s=>s.values.printerProfiles=new Array(2),'PRINTING_DATA_ONLY']]){
  const e=environment(P.bambu);change(e.auth.settings);await assert.rejects(e.adapter.list(),{code:expected});
 }
 const e=environment(P.bambu);let reads=0;Object.defineProperty(e.auth.settings.values,'bad',{get(){reads++;return 'bad';},enumerable:true});await assert.rejects(e.adapter.list(),{code:'PRINTING_DATA_ONLY'});assert.equal(reads,0);
 const q=environment(P.bambu);q.auth.settings.values.x=JSON.parse('{"__proto__":{}}');await assert.rejects(q.adapter.list(),{code:'PRINTING_DATA_ONLY'});
});
test('settings schema gate, no active project listing and disposal semantics',async()=>{
 const e=environment(P.bambu);e.current=null;assert.equal((await e.adapter.list()).length,1);assert.notEqual(e.adapter.describe(BAMBU,null).status,'ready');
 e.auth.settings.schemaVersion=2;await assert.rejects(e.adapter.list(),{code:'PRINTING_SETTINGS_SCHEMA'});
 e.adapter.dispose();await assert.rejects(e.adapter.list(),{code:'PRINTING_DISPOSED'});assert.equal(e.adapter.describe(BAMBU,null).reasonCode,'PRINTING_DISPOSED');
 assert.throws(()=>createPrintingAdapters(),{code:'PRINTING_BINDINGS'});
});
