import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createExportAdapters,EXPORT_FORMATS} from '../../src/integration/export-adapters.mjs';
import {declaredFormats,gateExport} from '../../src/app/export-policy.mjs';
import {inspect3MF} from '../../src/printing/src/zip-inspect.mjs';
import {sha256,sealed} from '../../src/printing/src/contracts.mjs';
import {fixtureProfile} from '../../src/printing/tests/profile-fixtures.mjs';
import {geometryToSvg} from '../../src/input/text-layout.mjs';
import {createSchedule} from '../../src/domain/layers.mjs';
import {encodeRasterPNG} from '../../src/core/png-encode.mjs';
import {serviceTransport,setup,sourceSVG,rgba} from './export-fixture.mjs';
import {stlOracle,sectionOracle,zipOracle,near} from './export-oracles.mjs';
const run=process.env.PROJECT_REVIEW_RUN,root=process.env.PROJECT_ROOT;
if(!run||!root)throw Error('own run environment required');
const {unzlibSync}=createRequire(new URL('../../src/printing/package.json',import.meta.url))('fflate');
const modulePath=process.env.ARCH_EXPORT_TEST_MODULE??path.join(run,'work/module/arch-kernel.mjs');
const factory=(await import(pathToFileURL(modulePath))).default,M=await factory(),T=serviceTransport(M);
const profiles={'export.3mf.bambu-project':await fixtureProfile(root,'bambu'),'export.3mf.snapmaker-project':await fixtureProfile(root,'u1')};
const out=path.join(run,'evidence/export-app');await fs.mkdir(out,{recursive:true});
const rejected=(f,code)=>assert.rejects(f,e=>{assert.equal(e.code,code,e.stack);return true;});
async function fixture(options,fn){const h=await setup(T,{profiles,...options});try{return await fn(h);}finally{h.close();assert.deepEqual(T.stats(),[0,0,0,0,0]);}}
async function save(name,a){await fs.writeFile(path.join(out,name),a.bytes);await fs.writeFile(path.join(out,name+'.json'),JSON.stringify(a.metadata,null,2)+'\n');}

test('EXP-01 public controller registry exposes exactly seven scoped paths and uses no legacy IDs',()=>fixture({},async h=>{
 const formats=declaredFormats(h.exporter,h.input('svg-color'));assert.equal(formats.length,7);assert.equal(new Set(formats.map(f=>f.id)).size,7);assert.ok(formats.every(f=>f.enabled));
 for(const f of formats)assert.equal(gateExport(f,{state:h.state,model:h.context.model,renderer:{available:true},projectId:h.context.projectId,canEdit:true,assets:h.assets}).enabled,true);
 assert.equal(formats.filter(f=>f.extension==='3mf').every(f=>f.verdict==='unverified'),true);
 assert.equal(T.counters.operations,0);
}));
test('EXP-01 union of overlapping 10 mm cubes has 1500 mm³, not summed 2000; exact source lease survives',()=>fixture({index:0},async h=>{
 const before=await sha256(h.root.bytes().slice()),released=T.counters.rootReleases,a=await h.exporter.export(h.input('stl-union')),m=stlOracle(a.bytes);
 near(m.volume,1500);assert.deepEqual(m.bbox,[0,0,0,15,10,10]);assert.equal(await sha256(h.root.bytes().slice()),before);assert.equal(T.counters.rootReleases,released);
 assert.equal(a.ticket.generation,902);assert.equal(a.metadata.service.sourceSnapshotGeneration,h.root.generation);assert.notEqual(902,h.root.generation);
 assert.equal(a.metadata.semanticParts[0].materialProvenanceId,'18446744073709551001');assert.equal(a.metadata.semanticParts[0].materialId,'user:đỏ');await save('union-overlap.stl',a);
}));
test('EXP-01 ZIP groups repeated red parts by slot/color and keeps common coordinates',()=>fixture({index:12},async h=>{
 const a=await h.exporter.export(h.input('stl-material-zip')),o=zipOracle(a.bytes);assert.equal(o.groups.length,2);
 near(o.groups[0].volume,2000);near(o.groups[1].volume,1000);assert.deepEqual(o.groups[0].bbox,[0,0,0,30,10,10]);assert.deepEqual(o.groups[1].bbox,[10,0,0,20,10,10]);
 assert.equal(o.manifest.mapping.length,3);assert.equal(o.manifest.mapping[0].materialSourceId,o.manifest.mapping[2].materialSourceId);await save('grouped-shared-seams.zip',a);
}));
test('EXP-01 same color in a different explicit slot remains a different ZIP group',()=>fixture({index:12},async h=>{
 Object.assign(h.evidence.parts[2],{slot:3,materialId:'manual:red-other-slot',materialSourceId:1203,materialProvenanceId:'90071992547409931'});
 const a=await h.exporter.export(h.input('stl-material-zip')),z=zipOracle(a.bytes);assert.equal(z.groups.length,3);z.groups.forEach(g=>near(g.volume,1000));
 assert.deepEqual(z.manifest.mapping.map(p=>p.slot),[1,2,3]);await save('different-slot.zip',a);
}));
test('EXP-01 final-section sequence sees blind opening below its floor and closed roof above; in/back explicit',()=>fixture({index:3},async h=>{
 h.exportOptions['svg-section'].section={mode:'sequence',startMm:1,endMm:3,stepMm:2,units:'in',side:'back',color:'material'};
 const a=await h.exporter.export(h.input('svg-section')),o=sectionOracle(a.bytes);assert.equal(o.samples.length,2);near(o.samples[0].area,184/(25.4**2));near(o.samples[1].area,200/(25.4**2));
 assert.deepEqual(o.samples.map(s=>s.rings),[2,1]);assert.ok(o.width.endsWith('in'));await save('blind-opening-sequence.svg',a);
}));
test('EXP-01 pattern-down is export-only with resting Z=0 and correct normals',()=>fixture({index:7},async h=>{
 h.exportOptions['stl-union'].pose={kind:'pattern-down-x',restOnBed:true};const hash=await sha256(h.root.bytes().slice());
 const a=await h.exporter.export(h.input('stl-union')),o=stlOracle(a.bytes);near(o.volume,120);assert.deepEqual(o.bbox,[1,-7,0,5,-2,6]);assert.equal(await sha256(h.root.bytes().slice()),hash);await save('pattern-down.stl',a);
}));
test('EXP-01 reflection reverses winding correctly and does not move manufacturing geometry',()=>fixture({index:7},async h=>{
 h.exportOptions['stl-union'].pose={kind:'isometry',restOnBed:true,matrix:[-1,0,0,0,0,1,0,0,0,0,1,0]};
 const a=await h.exporter.export(h.input('stl-union')),o=stlOracle(a.bytes);near(o.volume,120);assert.deepEqual(o.bbox,[-5,2,0,-1,7,6]);await save('reflected.stl',a);
}));
test('EXP-01 source SVG preserves committed cubic, gradient, clip, holes and colors without any model',()=>fixture({model:false},async h=>{
 const count=T.counters.operations,releases=T.counters.providerReleases,a=await h.exporter.export(h.input('svg-color'));
 assert.equal(new TextDecoder().decode(a.bytes),sourceSVG);assert.equal(T.counters.operations,count);assert.equal(T.counters.providerReleases,releases+1);assert.equal(a.metadata.service.source.rawHash,h.rawHash);await save('committed-source.svg',a);
}));
test('EXP-01 existing prepared font geometryToSvg serializer retains cubic curves and source datum',()=>fixture({model:false},async h=>{
 const geometry={paths:[{id:'outline-A',commands:[{type:'M',values:[0,0]},{type:'C',values:[0,5,10,5,10,0]},{type:'L',values:[0,0]},{type:'Z',values:[]}]}],instances:[{pathId:'outline-A',matrix:[1,0,0,1,2,3]}],bounds:{minX:2,minY:3,maxX:12,maxY:8,width:10,height:5}};
 const raw=new TextEncoder().encode(JSON.stringify(geometry)),hash=await sha256(raw);Object.assign(h.source,{rawHash:hash,serializer:'src/input/text-layout.mjs:geometryToSvg',dependencies:[{sha256:hash,bytes:raw.length}]});h.state.content.app.source.raw.hash=hash;h.assets.clear();h.assets.set(hash,raw);
 h.bindings.sourceSnapshot.acquire=async()=>({serializeSVG:async()=>({bytes:geometryToSvg(geometry,[12,34,56,255]),key:h.source.key,sourceId:h.source.sourceId,sourceRevision:h.source.sourceRevision,rawHash:hash}),release(){T.counters.providerReleases++;}});
 const a=await h.exporter.export(h.input('svg-color')),s=new TextDecoder().decode(a.bytes);assert.match(s,/C0 5 10 5 10 0/);assert.deepEqual(s.match(/matrix\(([^)]+)\)/)[1].split(/[ ,]+/).map(Number),[1,0,0,-1,2,-3]);assert.match(s,/rgb\(12,34,56\)/);await save('prepared-text-curve.svg',a);
}));
test('EXP-01 viewport PNG uses actual portable encoder; independent zlib pixel readback',()=>fixture({model:false},async h=>{
 const before=T.counters.operations,a=await h.exporter.export(h.input('png-viewport')),b=a.bytes,v=new DataView(b.buffer);let at=8,compressed;
 while(at<b.length){const n=v.getUint32(at),tag=new TextDecoder().decode(b.subarray(at+4,at+8));if(tag==='IDAT')compressed=b.subarray(at+8,at+8+n);at+=n+12;}
 const pixels=unzlibSync(compressed);assert.deepEqual([...pixels],[0,...rgba.slice(0,8),0,...rgba.slice(8)]);assert.equal(T.counters.operations,before);await save('viewport.png',a);
}));
for(const id of ['3mf-bambu-project','3mf-snapmaker-project'])test('EXP-01 '+id+' real same-Module lib3mf project, independent package/material/schedule readback',()=>fixture({index:12,firstLayerHeight:id.includes('bambu')?.16:.25},async h=>{
 const profile=h.profileDescriptors[EXPORT_FORMATS.find(f=>f.id===id).adapterId],before=JSON.stringify(profile),rootBefore=await sha256(h.root.bytes().slice()),a=await h.exporter.export(h.input(id)),read=await inspect3MF(a.bytes,{adapterId:profile.printerProfile.payload.adapterId});
 assert.equal(read.manifest.format,profile.printerProfile.payload.adapterId);assert.equal(read.meshes.length,3);assert.equal(read.manifest.materials.length,2);assert.equal(read.manifest.parts[0].id,'source:chữ-á:part-0');
 assert.equal(Number(read.settings.initial_layer_print_height),id.includes('bambu')?.16:.25);assert.equal(Number(read.settings.layer_height),.20);
 assert.equal(JSON.stringify(profile),before);assert.equal(await sha256(h.root.bytes().slice()),rootBefore);assert.equal(a.metadata.qualification.slicer,'unverified');assert.equal(a.metadata.qualification.physical,'unverified');
 await save(id+'.3mf',a);
}));
test('EXP-02 source/viewport gates ignore invalid mesh/assembly, while every mesh route blocks',()=>fixture({},async h=>{
 h.evidence.gates.assemblyView=true;h.evidence.gates.invalidInput=true;
 const fs=h.exporter.formats(h.input('svg-color'));assert.ok(fs.filter(f=>f.prerequisite!=='matching-model').every(f=>f.enabled));assert.ok(fs.filter(f=>f.prerequisite==='matching-model').every(f=>!f.enabled&&f.reasonCode==='INVALID_INPUT'));
 const operations=T.counters.operations;await rejected(()=>h.exporter.export(h.input('stl-union')),'INVALID_INPUT');assert.equal(T.counters.operations,operations);
}));
test('EXP-02 unknown final evidence is visible unverified, never replaced by an INVALID_INPUT bit',()=>fixture({},async h=>{
 h.evidence={status:'unverified',reasonCode:'SCENE_ORACLE_MISSING',reason:'Run final mesh oracle.'};const f=h.exporter.formats(h.input('stl-union')).find(x=>x.id==='stl-union');assert.equal(f.reasonCode,'SCENE_ORACLE_MISSING');assert.equal(f.verdict,'unverified');
 await rejected(()=>h.exporter.export(h.input('stl-union')),'SCENE_ORACLE_MISSING');
}));
test('EXP-02 all mandatory gate booleans are required, and fail/unverified need explicit inspection',()=>fixture({},async h=>{
 const gates=structuredClone(h.evidence.gates);
 for(const [key,code] of [['invalidInput','INVALID_INPUT'],['kernelFailure','KERNEL_FAILURE'],['assemblyView','ASSEMBLY_VIEW'],['unappliedMeshEdit','UNAPPLIED_MESH_EDIT']]){
  h.evidence.gates={...gates,[key]:true};await rejected(()=>h.exporter.export(h.input('stl-union')),code);
  h.evidence.gates={...gates};delete h.evidence.gates[key];await rejected(()=>h.exporter.export(h.input('stl-union')),'FINAL_SCENE_EVIDENCE_UNVERIFIED');}
 h.evidence.gates=gates;
 for(const verdict of ['fail','unverified']){h.evidence.meshVerdict=verdict;await rejected(()=>h.exporter.export(h.input('stl-union')),'MESH_INSPECTION_REQUIRED');h.exportOptions['stl-union'].inspection=true;
  const a=await h.exporter.export(h.input('stl-union'));assert.equal(a.metadata.qualification.mesh,verdict);assert.ok(a.metadata.warnings.some(w=>w.includes(verdict)));h.exportOptions['stl-union'].inspection=false;}
}));
test('EXP-02 current parent finalExport capability is mandatory; method presence alone never enables',()=>fixture({},async h=>{
 const cap=T.client.serviceCapabilities.finalExport;try{T.client.serviceCapabilities.finalExport=false;await rejected(()=>h.exporter.export(h.input('stl-union')),'FINAL_EXPORT_UNAVAILABLE');}finally{T.client.serviceCapabilities.finalExport=cap;}
}));
test('EXP-02 actual final evidence controls readiness independently of model.stats',()=>fixture({},async h=>{
 h.model.generation++;await rejected(()=>h.exporter.export(h.input('stl-union')),'SNAPSHOT_GENERATION');h.model.generation--;
 h.model.stats={verdict:'unverified'};assert.equal(h.exporter.formats(h.input('stl-union')).find(f=>f.id==='stl-union').enabled,true);
 const a=await h.exporter.export(h.input('stl-union'));assert.equal(a.metadata.qualification.mesh,'pass');
 h.model.stats.verdict='pass';h.evidence.meshVerdict='unverified';await rejected(()=>h.exporter.export(h.input('stl-union')),'MESH_INSPECTION_REQUIRED');
}));
test('EXP-02 missing actual build schedule evidence disables only dependent project 3MF',()=>fixture({},async h=>{
 delete h.evidence.projectScheduleHash;const f=h.exporter.formats(h.input('svg-color'));assert.ok(f.filter(x=>x.extension==='3mf').every(x=>!x.enabled&&x.reasonCode==='FINAL_SCHEDULE_EVIDENCE_UNVERIFIED'));
 assert.ok(f.filter(x=>x.extension!=='3mf').every(x=>x.enabled));await rejected(()=>h.exporter.export(h.input('3mf-bambu-project')),'FINAL_SCHEDULE_EVIDENCE_UNVERIFIED');
}));
test('EXP-01 manual .20 and .25 first layers override Bambu profile .16 without input mutation',async()=>{
 for(const first of [.20,.25])await fixture({firstLayerHeight:first},async h=>{const before=JSON.stringify(h.state),a=await h.exporter.export(h.input('3mf-bambu-project')),r=await inspect3MF(a.bytes);near(Number(r.settings.initial_layer_print_height),first);assert.equal(JSON.stringify(h.state),before);assert.equal(a.metadata.projectScheduleHash,h.state.schedule.hash);await save('manual-first-'+first+'.3mf',a);});
});
test('EXP-02 same slot different colors retain ZIP warning but block invalid project mapping',()=>fixture({index:1},async h=>{
 h.evidence.parts[1].slot=1;const a=await h.exporter.export(h.input('stl-material-zip'));assert.equal(zipOracle(a.bytes).groups.length,2);assert.ok(a.metadata.warnings.includes('SLOT_HAS_MULTIPLE_COLORS'));
 const p=h.profileDescriptors['export.3mf.bambu-project'];p.materialTable.materials[1].slot=1;await rejected(()=>h.exporter.export(h.input('3mf-bambu-project')),'MATERIAL_SLOT_CONFLICT');
}));
test('EXP-02 explicit stable material IDs, slot and ARCH source/color mapping reject ambiguity before dispatch',()=>fixture({index:12},async h=>{
 const p=structuredClone(h.evidence.parts),before=T.counters.operations;
 for(const [change,code] of [[()=>delete h.evidence.parts[0].materialSourceId,'FINAL_MATERIAL_MAPPING'],[()=>h.evidence.parts[0].sourceIndex=999,'FINAL_MATERIAL_MAPPING'],[()=>h.evidence.parts[0].rgba=0x00ff00ff,'FINAL_MATERIAL_MAPPING'],[()=>h.evidence.parts[1].materialSourceId=1201,'FINAL_NATIVE_ID_COLLISION'],[()=>h.evidence.parts[1].semanticId=h.evidence.parts[0].semanticId,'FINAL_SEMANTIC_IDS'],[()=>h.evidence.parts[0].materialProvenanceId=9007199254740992,'FINAL_SEMANTIC_IDS']]){h.evidence.parts=structuredClone(p);change();await rejected(()=>h.exporter.export(h.input('stl-union')),code);}
 assert.equal(T.counters.operations,before);
}));
test('EXP-02 invalid upstream hash never reaches final helper, independent of claimed pass',()=>fixture({},async h=>{
 h.evidence.snapshotSha256='0'.repeat(64);const count=T.counters.final;await rejected(()=>h.exporter.export(h.input('stl-union')),'FINAL_SCENE_HASH');assert.equal(T.counters.final,count);
}));
test('EXP-02 source bytes/hash failures release no model and publish nothing',()=>fixture({model:false},async h=>{
 const raw=h.assets.get(h.rawHash);h.assets.set(h.rawHash,raw.slice());h.assets.get(h.rawHash)[0]^=1;
 await rejected(()=>h.exporter.export(h.input('svg-color')),'SOURCE_ASSET_HASH');assert.ok(h.root.bytes().length>128);
}));
test('EXP-02 source active/external/invalid XML outputs reject and release provider exactly once',()=>fixture({model:false},async h=>{
 for(const [svg,code] of [['<html/>','INVALID_SERIALIZATION'],['<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>','SVG_ACTIVE_CONTENT'],['<svg xmlns="http://www.w3.org/2000/svg"><use href="https://example.invalid/a"/></svg>','SVG_EXTERNAL_RESOURCE'],['<!DOCTYPE svg [<!ENTITY x "foo">]><svg/>','XML_EXTERNAL_ENTITY']]){
  const r=T.counters.providerReleases;h.bindings.sourceSnapshot.acquire=async()=>({serializeSVG:async()=>({bytes:new TextEncoder().encode(svg),key:h.source.key,sourceId:h.source.sourceId,sourceRevision:h.source.sourceRevision,rawHash:h.rawHash}),release(){T.counters.providerReleases++;}});
  await rejected(()=>h.exporter.export(h.input('svg-color')),code);assert.equal(T.counters.providerReleases,r+1);}
}));
test('EXP-02 successful native output corrupted in transit never publishes',()=>fixture({},async h=>{
 const original=T.client.finalExport;try{T.client.finalExport=async(...args)=>{const r=await original(...args);r.bytes[0]^=1;return r;};await rejected(()=>h.exporter.export(h.input('stl-union')),'FINAL_OUTPUT_HASH');}finally{T.client.finalExport=original;}
}));
test('EXP-02 output owns bytes even when a Node Buffer provider mutates its buffer during release',()=>fixture({model:false},async h=>{
 const borrowed=Buffer.from(sourceSVG);h.bindings.sourceSnapshot.acquire=async()=>({serializeSVG:async()=>({bytes:borrowed,key:h.source.key,sourceId:h.source.sourceId,sourceRevision:h.source.sourceRevision,rawHash:h.rawHash}),release(){T.counters.providerReleases++;borrowed.fill(0);}});
 const a=await h.exporter.export(h.input('svg-color'));assert.equal(new TextDecoder().decode(a.bytes),sourceSVG);assert.equal(await sha256(a.bytes),a.metadata.sha256);assert.ok(borrowed.every(v=>v===0));
}));
test('EXP-02 malformed PNG dimensions/CRC discard receipt and preserve model',()=>fixture({},async h=>{
 for(const wrongDimensions of [false,true]){const b=await encodeRasterPNG({width:2,height:2,data:rgba});if(wrongDimensions)h.frame.width=3;else b[b.length-1]^=1;const count=T.counters.frameReleases;
  h.bindings.viewport.capture=async()=>({bytes:b,key:h.frame.key,frameKey:h.frame.frameKey,release(){T.counters.frameReleases++;}});
  await rejected(()=>h.exporter.export(h.input('png-viewport')),wrongDimensions?'PNG_FRAME_DIMENSIONS':'PNG_CRC');assert.equal(T.counters.frameReleases,count+1);assert.ok(h.root.bytes().length>128);}
}));
test('EXP-02 serializer exception is a typed no-publish failure with provider cleanup',()=>fixture({model:false},async h=>{
 const count=T.counters.providerReleases;T.before.serialize=async()=>{throw new TypeError('test provider failure');};await rejected(()=>h.exporter.export(h.input('svg-color')),'INVALID_SERIALIZATION');assert.equal(T.counters.providerReleases,count+1);
}));
test('EXP-02 Core 3MF cannot masquerade as either vendor project',()=>fixture({},async h=>{
 const original=T.client.export3MF;try{T.client.export3MF=(lease,req,ctl)=>original(lease,req,{...ctl,format:'core'});await rejected(()=>h.exporter.export(h.input('3mf-bambu-project')),'PRINTING_OUTPUT_IDENTITY');}finally{T.client.export3MF=original;}
}));
test('EXP-02 profile/schedule seal and wrong material slot reject before printing and preserve caller values',()=>fixture({},async h=>{
 const p=h.profileDescriptors['export.3mf.snapmaker-project'],before=T.counters.printing;
 p.schedule.payload.firstLayerHeight=.25;await rejected(()=>h.exporter.export(h.input('3mf-snapmaker-project')),'PRINTING_PROJECT_SCHEDULE_MISMATCH');assert.equal(p.schedule.payload.firstLayerHeight,.25);
 p.schedule.payload.firstLayerHeight=.16;p.schedule.sha256='a'.repeat(64);await rejected(()=>h.exporter.export(h.input('3mf-snapmaker-project')),'SNAPSHOT_HASH');
 p.schedule=await sealed(p.schedule.payload);p.materialTable.materials[0].slot=5;await rejected(()=>h.exporter.export(h.input('3mf-snapmaker-project')),'MATERIAL_SLOT_MISMATCH');assert.equal(p.materialTable.materials[0].slot,5);assert.equal(T.counters.printing,before);
}));
test('EXP-02 section Z, pose, inactive values, resource limits and unknown options never silently normalize',()=>fixture({},async h=>{
 const original=structuredClone(h.exportOptions['svg-section']);
 for(const [mutate,code] of [[o=>delete o.section,'EXPORT_OPTIONS_REQUIRED'],[o=>o.section.zMm=NaN,'JSON_NONFINITE'],[o=>o.section.startMm=0,'EXPORT_SECTION_RANGE'],[o=>o.pose={kind:'pattern-down-x',restOnBed:true},'EXPORT_POSE_UNSUPPORTED'],[o=>o.errorMm=.005,'EXPORT_ERROR_BUDGET'],[o=>o.unknown=true,'EXPORT_OPTION_UNKNOWN'],[o=>o.limits=[1,1,1,1,1,1,1,1],'EXPORT_RESOURCE_BUDGET']]){
  const o=structuredClone(original);mutate(o);h.exportOptions['svg-section']=o;await rejected(()=>h.exporter.export(h.input('svg-section')),code);assert.equal(h.exportOptions['svg-section'],o);}
}));
test('EXP-02 pose remains unsupported on printing rather than ignoring user pattern-down request',()=>fixture({},async h=>{
 h.exportOptions['3mf-bambu-project'].pose={kind:'pattern-down-x',restOnBed:true};await rejected(()=>h.exporter.export(h.input('3mf-bambu-project')),'EXPORT_POSE_UNSUPPORTED');
}));
test('EXP-01 Unicode filename survives with concrete sanitization warning and actual hash/bytes',()=>fixture({},async h=>{
 h.exportOptions['stl-union'].filename='Móc:á?.STL';const a=await h.exporter.export(h.input('stl-union'));assert.equal(a.filename,'Móc_á_.stl');assert.equal(a.metadata.bytes,a.bytes.length);assert.equal(a.metadata.sha256,await sha256(a.bytes));assert.ok(a.metadata.warnings.some(w=>w.includes('Filename')));
}));

for(const [label,mutate,code] of [
 ['session',h=>h.context.sessionKey={opaque:'session-2'},'EXPORT_CONTEXT_STALE'],
 ['head',h=>h.context.headHash='a'.repeat(64),'EXPORT_CONTEXT_STALE'],
 ['revision',h=>h.state.revision++,'EXPORT_CONTEXT_STALE'],
 ['schedule without revision',h=>h.state.schedule=createSchedule({firstLayerHeight:.25,layerHeight:.2,sources:{firstLayerHeight:'user',layerHeight:'user'},profileId:null}),'EXPORT_STATE_STALE'],
 ['options',h=>h.exportOptions['stl-union'].pose.restOnBed=true,'EXPORT_OPTIONS_STALE'],
 ['evidence',h=>h.evidence.key='final:2','FINAL_SCENE_EVIDENCE_STALE'],
 ['retired model',h=>h.context.model=null,'MODEL_LEASE_RETIRED'],
 ['retired root during native dispatch',h=>h.root.release(),'NO_SNAPSHOT'],
])test('EXP-02 native result after '+label+' changes is discarded',()=>fixture({},async h=>{
 T.before.final=async()=>mutate(h);await rejected(()=>h.exporter.export(h.input('stl-union')),code);
}));
test('EXP-02 source change during acquire releases returned lease even before serialization',()=>fixture({model:false},async h=>{
 const r=T.counters.providerReleases;T.before.acquire=async()=>{h.source.key='source:new-view';};await rejected(()=>h.exporter.export(h.input('svg-color')),'EXPORT_PROVIDER_STALE');assert.equal(T.counters.providerReleases,r+1);
}));
test('EXP-02 camera/source-view change during PNG capture discards bytes and releases receipt',()=>fixture({model:false},async h=>{
 const r=T.counters.frameReleases;T.before.capture=async()=>{h.frame.frameKey='source-view:new';};await rejected(()=>h.exporter.export(h.input('png-viewport')),'EXPORT_PROVIDER_STALE');assert.equal(T.counters.frameReleases,r+1);
}));
test('EXP-02 PNG cleanup itself yields into a stale session; final guard still discards',()=>fixture({model:false},async h=>{
 const r=T.counters.frameReleases;T.before.release=async()=>{h.context.sessionKey={new:true};};await rejected(()=>h.exporter.export(h.input('png-viewport')),'EXPORT_CONTEXT_STALE');assert.equal(T.counters.frameReleases,r+1);
}));
test('EXP-02 old viewport frame keeps its displayed revision; no current-model relabelling',()=>fixture({model:false},async h=>{
 h.frame.displayedRevision=3;const a=await h.exporter.export(h.input('png-viewport'));assert.equal(a.metadata.service.frame.displayedRevision,3);assert.ok(a.metadata.warnings.some(w=>w.includes('bản sửa đang hiển thị 3')));
}));
test('EXP-02 assembly PNG is labelled as preview while assembly mesh export remains blocked',()=>fixture({},async h=>{
 h.evidence.gates.assemblyView=true;h.frame.view='assembly';const a=await h.exporter.export(h.input('png-viewport'));assert.equal(a.metadata.service.frame.view,'assembly');await rejected(()=>h.exporter.export(h.input('stl-union')),'ASSEMBLY_VIEW');
}));
test('EXP-01 new project at domain revision zero can capture its viewport without a model',()=>fixture({model:false},async h=>{
 h.state.revision=0;h.frame.displayedRevision=0;const input=h.input('png-viewport');input.ticket.revision=0;
 assert.equal(h.exporter.formats(input).find(f=>f.id==='png-viewport').enabled,true);const a=await h.exporter.export(input);assert.equal(a.metadata.revision,0);assert.equal(a.metadata.service.frame.displayedRevision,0);
}));
test('EXP-02 abort/reset cancellation cleans source resources without disposing shared runtime',()=>fixture({model:false},async h=>{
 for(const mode of ['abort','reset']){
  const a=new AbortController(),input={...h.input('svg-color'),signal:a.signal},r=T.counters.providerReleases;
  T.before.serialize=async()=>{if(mode==='abort')a.abort();else h.exporter.reset();};
  await rejected(()=>h.exporter.export(input),'CANCELLED');assert.equal(T.counters.providerReleases,r+1);assert.equal(T.client.disposed,false);assert.ok(h.root.bytes().length>128);
 }
 T.before.serialize=null;assert.ok((await h.exporter.export(h.input('svg-color'))).bytes.length>0);
}));
test('EXP-02 native cancellation observes exact transport generation; retained source and reader survive',()=>fixture({},async h=>{
 const before=await sha256(h.root.bytes().slice());assert.ok(M._arch_snapshot_acquire(h.root.id));
 try{T.before.operation=async(control,g)=>Atomics.store(M.HEAPU32,M._arch_control_ptr()/4+3,g);await rejected(()=>h.exporter.export(h.input('stl-union')),'CANCELLED');
  assert.equal(await sha256(h.root.bytes().slice()),before);assert.ok(M._arch_snapshot_ptr(h.root.id));}
 finally{M._arch_snapshot_release(h.root.id);}
}));
test('EXP-02 failed native output budget preserves root; later normal export succeeds',()=>fixture({},async h=>{
 h.exportOptions['stl-union'].limits=[200000,400000,256,256,200000,84,128*1024*1024,0];const before=await sha256(h.root.bytes().slice());
 await assert.rejects(()=>h.exporter.export(h.input('stl-union')),e=>/LIMIT|BUDGET/.test(e.code??e.message));assert.equal(await sha256(h.root.bytes().slice()),before);
 delete h.exportOptions['stl-union'].limits;const a=await h.exporter.export(h.input('stl-union'));near(stlOracle(a.bytes).volume,736);
}));
test('EXP-02 concurrent adapter job rejected without a second common operation',()=>fixture({model:false},async h=>{
 let entered,unblock;const waiting=new Promise(r=>entered=r),hold=new Promise(r=>unblock=r);T.before.serialize=async()=>{entered();await hold;};
 const one=h.exporter.export(h.input('svg-color'));await waiting;try{await rejected(()=>h.exporter.export(h.input('png-viewport')),'EXPORT_BUSY');}finally{unblock();}await one;
}));
test('EXP-02 actual source approximation remains an explicit controller proposal',()=>fixture({model:false},async h=>{
 h.bindings.sourceSnapshot.acquire=async()=>({serializeSVG:async()=>({bytes:h.sourceBytes,key:h.source.key,sourceId:h.source.sourceId,sourceRevision:h.source.sourceRevision,rawHash:h.rawHash,changes:['Fixture approximation requiring confirmation.']}),release(){T.counters.providerReleases++;}});
 const a=await h.exporter.export(h.input('svg-color'));assert.equal(a.status,'proposal');assert.equal(a.changes.length,1);assert.equal(a.artifact.ticket.id,h.input('svg-color').ticket.id);
}));
test('EXP-02 seeded malformed option/state regressions have explicit reproducible no-dispatch cases',()=>fixture({},async h=>{
 const seed=0xAE012069,records=[];let n=seed;const base=structuredClone(h.exportOptions['stl-union']),count=T.counters.operations;
 for(let i=0;i<24;i++){n=(Math.imul(n,1664525)+1013904223)>>>0;const mode=n%3,o=structuredClone(base);
  if(mode===0)o.pose={kind:'isometry',restOnBed:false,matrix:[1+(n%9+1)/10,0,0,0,0,1,0,0,0,0,1,0]};else if(mode===1)o.errorMm=-(n%100+1)/1000;else o.limits=[1,1,1,1,1,1,1,n];
  h.exportOptions['stl-union']=o;let error;try{await h.exporter.export(h.input('stl-union'));assert.fail('malformed seeded case accepted');}catch(e){error=e.code;assert.ok(['EXPORT_ISOMETRY','EXPORT_ERROR_BUDGET','EXPORT_RESOURCE_BUDGET'].includes(error));}records.push({seed,index:i,options:o,error});}
 assert.equal(T.counters.operations,count);await fs.writeFile(path.join(out,'seeded-reproducers.json'),JSON.stringify(records,null,2)+'\n');
}));
