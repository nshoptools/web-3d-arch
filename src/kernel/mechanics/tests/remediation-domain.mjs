import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
import {createMechanicsDomainAdapter,DATUMS} from '../src/domain-adapter.mjs';
import {FIELD_MAP} from '../src/catalog-map.mjs';
const room=process.env.PROJECT_REVIEW_RUN;assert.ok(room&&process.env.PROJECT_ROOT&&!path.isAbsolute(path.relative(process.env.PROJECT_ROOT,room))&&!path.relative(process.env.PROJECT_ROOT,room).startsWith('..'),'Project run required');
const domain=await import(pathToFileURL(path.join(process.env.PROJECT_ROOT,'src/domain/index.mjs'))),encode=createMechanicsDomainAdapter(domain),cases=[];
function check(id,fn){fn();cases.push({id,pass:true});}
function projectWith(product,field,value){const p=structuredClone(domain.createProject({product,sourceKind:'svg'})),f=domain.getField(field);(f.scope==='common'?p.parameters.common:p.parameters.byProduct[product])[field]={origin:'user',value};return p;}
for(const product of domain.PRODUCT_IDS)check('002-import-'+product,()=>{
  const p=projectWith(product,'impOn',true),before=JSON.stringify(p),a=encode(p);assert.equal(JSON.stringify(p),before);const record=a.records.find(r=>r.fieldId===117);assert.equal(record.value,1);assert.equal(record.origin,1);
});
const mm={heightMode:'mm',mm:1.5,datum:{kind:'feature',featureId:'mech:cap:plate.underside'},referenceLayer:35};
check('003-exact-review-reproducer-record-binding-packed',()=>{
  const p=projectWith('clicky','plateT',mm),a=encode(p),record=a.records.find(r=>r.fieldId===24),i=a.records.indexOf(record),v=new DataView(a.parameterBytes.buffer);
  assert.equal(record.mode,1);assert.equal(record.value,1.5);assert.equal(record.datum,2);assert.equal(record.referenceLayer,35);
  assert.deepEqual(a.sourceRecipeBindings.find(r=>r.fieldId===24),record);assert.deepEqual(a.provenance[Number(record.provenanceId)-1].value,mm);
  assert.equal(v.getUint32(i*40+12,true),2);assert.equal(v.getUint32(i*40+16,true),35);assert.equal(v.getFloat64(i*40+24,true),1.5);assert.equal(v.getBigUint64(i*40+32,true),record.provenanceId);
});
for(const mode of ['mm','layers'])check('003-orphan-datum-'+mode,()=>{
  const value=mode==='mm'?{...mm,datum:{kind:'feature',featureId:'missing:datum'}}:{heightMode:'layers',layers:8,referenceLayer:35,datum:{kind:'feature',featureId:'missing:datum'}};
  assert.throws(()=>encode(projectWith('clicky','plateT',value)),{code:'ORPHAN_DATUM'});
});
for(const [h0,h,ref]of[[.2,.2,35],[.27,.16,43],[.16,.2,36],[.25,.25,29]])for(const count of [6,7])check('004-domain-nearest-'+h0+'-'+h+'-'+count,()=>{
  const schedule=domain.createSchedule({firstLayerHeight:h0,layerHeight:h}),value=+(h*(count+.5)).toFixed(6);
  const p=domain.previewMmToLayers(value,schedule,{datum:mm.datum,referenceLayer:ref});assert.equal(p.options[2].value.layers,count%2===0?count:count+1);assert.equal(p.options[2].deltaMm,+(count%2===0?-h/2:h/2).toFixed(6));
});
check('005-skirt-new-datum',()=>{assert.equal(DATUMS['mech:cap:skirt.bottom'],11);const a=encode(projectWith('clicky','skirtH',{heightMode:'layers',layers:40,datum:{kind:'feature',featureId:'mech:cap:skirt.bottom'},referenceLayer:0}));assert.equal(a.records.find(r=>r.fieldId===81).datum,11);});
check('006-native-catalog-scope-grid-derived-from-integrated-domain',()=>{
  const text=fs.readFileSync(new URL('../src/catalog.inc',import.meta.url),'utf8');const rows=[...text.matchAll(/\{"([^"]+)",(\d+),([^,]+),([^,]+),(\d+),(\d+),\{/g)];assert.equal(rows.length,128);
  const quanta=fs.readFileSync(new URL('../src/catalog_quantum.inc',import.meta.url),'utf8').split('\n')[1].split(',').map(Number);assert.equal(quanta.length,128);
  rows.forEach(([,id,,,,mask],i)=>{const schema=domain.getField(id),expectedMask=schema.applicability.products.reduce((a,p)=>a|(1<<domain.PRODUCT_IDS.indexOf(p)),0);assert.equal(+mask,expectedMask,id);if(schema.domain.kind==='range')assert.equal(quanta[i],schema.domain.quantum,id);});
  assert.throws(()=>domain.normalizeField('topBevelSeg',3.9),{code:'field-grid'});assert.equal(domain.normalizeField('topBevelSeg',3),3);
});
for(const [field,featureId]of[['artH','source:art.bottom'],['rimH','source:rim.bottom'],['flatTop','source:flat.bottom'],['bandCap','source:core-cap.top']])check('source-bridge-retained-'+field,()=>{
  const value={heightMode:'mm',mm:1.7,datum:{kind:'feature',featureId},referenceLayer:9},a=encode(projectWith('keychain',field,value)),record=a.records.find(r=>r.fieldId===FIELD_MAP.find(f=>f.id===field).abiId);assert.equal(record.datum,DATUMS[featureId]);assert.equal(record.referenceLayer,9);assert.equal(record.value,1.7);assert.deepEqual(a.sourceRecipeBindings.find(r=>r.fieldId===record.fieldId),record);
});
fs.writeFileSync(path.join(room,'evidence/remediation-domain-results.json'),JSON.stringify({total:cases.length,passed:cases.length,cases,qualification:'implementation regression, not independent review'},null,2)+'\n');console.log(`Domain remediation ${cases.length}/${cases.length}`);
