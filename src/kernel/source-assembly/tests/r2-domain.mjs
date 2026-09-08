import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {createMechanicsDomainAdapter,MECHANICS_SEMANTICS_VERSION,SOURCE_HEIGHT_SEMANTICS_VERSION as ADAPTER_SOURCE_VERSION,DATUMS} from '../../mechanics/src/domain-adapter.mjs';
import {SOURCE_DATUMS,SOURCE_DATUM_EXTENSION_VERSION,SOURCE_HEIGHT_SEMANTICS_VERSION} from '../src/source-datums.mjs';
const repo=process.env.PROJECT_ROOT,room=process.env.PROJECT_REVIEW_RUN;
assert.ok(repo&&room&&path.relative(repo,room)&&!path.relative(repo,room).startsWith('..')&&!path.isAbsolute(path.relative(repo,room)),'own run required');
const domain=await import(pathToFileURL(path.join(repo,'src/domain/index.mjs')));
const encode=createMechanicsDomainAdapter(domain),cases=[];
assert.equal(MECHANICS_SEMANTICS_VERSION,3);assert.equal(ADAPTER_SOURCE_VERSION,2);
assert.equal(SOURCE_HEIGHT_SEMANTICS_VERSION,2);assert.equal(SOURCE_DATUM_EXTENSION_VERSION,1);
for(const[key,id]of Object.entries(SOURCE_DATUMS))assert.equal(DATUMS[key],id);
for(const first of [.16,.25])for(const [name,value,tag,ref,count]of[
 ['legacy-nominal-mm',{heightMode:'mm',mm:1.7},0,0,0],
 ['declared-mm-offgrid',{heightMode:'mm',mm:1.7,datum:{kind:'feature',featureId:'source:art.bottom'},referenceLayer:12},128,12,0],
 ['wrong-declared-tag',{heightMode:'mm',mm:1.7,datum:{kind:'feature',featureId:'source:rim.bottom'},referenceLayer:12},129,12,0],
 ['accepted-blocker-input',{heightMode:'layers',layers:4,datum:{kind:'feature',featureId:'source:art.bottom'},referenceLayer:0},128,0,4],
 ['valid-reference-input',{heightMode:'layers',layers:4,datum:{kind:'feature',featureId:'source:art.bottom'},referenceLayer:12},128,12,4]
]){
 const project=domain.createProject({product:'keychain',sourceKind:'svg',schedule:domain.createSchedule({firstLayerHeight:first,layerHeight:.2})});
 const preview=domain.previewCommand(project,{id:'parameters.set',args:{changes:[{id:'artH',value}]}});
 assert.ok(preview.ok);const changed=domain.commitPreview(project,preview).state,before=JSON.stringify(changed),a=encode(changed);
 assert.equal(JSON.stringify(changed),before);assert.equal(a.mechanicsSemanticsVersion,3);assert.equal(a.sourceHeightSemanticsVersion,2);assert.equal(a.abiVersion,2);
 assert.equal(a.fitQualification,'unqualified');assert.equal(a.requiresSourceContext,true);
 assert.ok(!('proposals'in a)&&!('conversionReceipt'in a)&&!('conversionReceipts'in a));
 const ordinal=domain.CATALOG.fields.findIndex(f=>f.id==='artH')+1,record=a.records.find(r=>r.fieldId===ordinal),i=a.records.indexOf(record),bytes=new DataView(a.parameterBytes.buffer,a.parameterBytes.byteOffset,a.parameterBytes.byteLength);
 assert.equal(record.value,value.mm??0);assert.equal(record.mode,count?2:1);assert.equal(record.datum,tag);assert.equal(record.referenceLayer,ref);assert.equal(record.layerCount,count);
 assert.equal(bytes.getUint32(i*40+12,true),tag);assert.equal(bytes.getUint32(i*40+16,true),ref);assert.equal(bytes.getUint32(i*40+20,true),count);assert.equal(bytes.getFloat64(i*40+24,true),value.mm??0);assert.equal(bytes.getBigUint64(i*40+32,true),record.provenanceId);
 assert.deepEqual(a.sourceRecipeBindings.find(r=>r.fieldId===ordinal),record);
 assert.deepEqual(a.provenance[Number(record.provenanceId)-1].value,value);
 assert.equal(a.schedule.firstNm,BigInt(Math.round(first*1e6)));assert.equal(a.schedule.regularNm,200000n);
 assert.deepEqual(a.provenance[Number(a.schedule.provenanceId)-1],{kind:'schedule',...changed.schedule});
 cases.push({id:name+'-'+first,pass:true,datum:tag,reference:ref,nominalMm:value.mm??null});
}
fs.writeFileSync(path.join(room,'evidence/r2-domain-results.json'),JSON.stringify({total:cases.length,passed:cases.length,cases,mechanicsSemantics:3,sourceSemantics:2,datumExtension:1,scope:'encoding only; source geometry independently validates or rejects the unchanged records; no conversion receipt'},null,2)+'\n');
console.log('R2 domain preservation '+cases.length+'/'+cases.length);
