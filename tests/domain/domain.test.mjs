import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as domain from '../../src/domain/index.mjs';
import { sha256 } from '../../src/domain/hash.mjs';
import { cloneData, parseJsonStrict, stableStringify } from '../../src/domain/safe.mjs';
import { exactJsonNumber } from '../../src/domain/json-number.mjs';
const { CATALOG,FIELD_SCHEMA,PRODUCT_IDS,getField,normalizeField,candidateDefault,createSchedule,
  layerBoundary,layerSpan,previewMmToLayers,parseDecimal,quantizeDecimal,decimalUnits,unitsDecimal,
  createProject,effectiveValues,previewCommand,commitPreview,undoTransaction,openProjectDocument,serializeProjectDocument }=domain;
const uniform=createSchedule();
const rejects=(fn,code)=>assert.throws(fn,error=>error.code===code);
function apply(state,command){
  const preview=previewCommand(state,command);
  assert.equal(preview.ok,true,JSON.stringify(preview.issues));
  const committed=commitPreview(state,preview);
  assert.equal(committed.ok,true,JSON.stringify(committed.issues));
  return committed;
}
const set=(state,changes)=>apply(state,{id:'parameters.set',args:{changes:Object.entries(changes).map(([id,value])=>({id,value}))}});
const switchTo=(state,product)=>apply(state,{id:'product.switch',args:{product}});
const mm=mm=>({heightMode:'mm',mm});
const bed=(layers)=>({heightMode:'layers',layers,datum:{kind:'bed'},referenceLayer:0});

test('strict decimal grammar, exact nm values, Vietnamese comma and dot are equivalent',()=>{
  for(const [input,expected] of [[' 1,700 ',1.7],['1.700',1.7],['+,05',0.05],['.05',0.05],['-0,000',0],['0001.0000000000',1],['1,234',1.234],[-1.7,-1.7],['0.000001',0.000001]])
    assert.equal(parseDecimal(input).value,expected);
  assert.equal(parseDecimal('5,500').canonical,'5.5');
  for(const input of ['1,000.20','1.000,20','1 000','1,2,3','1e2','0x10','1.','1,','+','NaN','Infinity','',' ','5mm'])
    assert.throws(()=>parseDecimal(input),{name:'DomainError'});
  for(const input of [true,null,{},[],undefined,NaN,Infinity,-Infinity])
    assert.throws(()=>parseDecimal(input),{name:'DomainError'});
  rejects(()=>parseDecimal('0.0000001'),'decimal-precision');
  rejects(()=>parseDecimal(0.1+0.2),'decimal-precision');
  assert.equal(unitsDecimal(decimalUnits('2.45')-decimalUnits('2.36')),0.09);
});
test('explicit rounding uses signed ties to even; input parsing never rounds',()=>{
  for(const [raw,want]of [['1.25',1.2],['1.35',1.4],['-1.25',-1.2],['-1.35',-1.4],['0.0000005',0],['0.0000015',0.000002]])
    assert.equal(quantizeDecimal(raw,raw.includes('000000')||raw.includes('000001')?0.000001:0.1,'nearest-ties-even'),want);
  assert.equal(quantizeDecimal('-1.21',0.1,'floor'),-1.3);
  assert.equal(quantizeDecimal('-1.21',0.1,'ceil'),-1.2);
  rejects(()=>quantizeDecimal('1',0.2),'rounding-required');
});
test('strict JSON rejects duplicate/prototype keys and numeric precision loss without coercion',()=>{
  for(const raw of ['{"x":1,"x":2}','{"__proto__":{"polluted":true}}','{"c":{"constructor":1}}','{"protot\\u0079pe":1}'])
    assert.throws(()=>parseJsonStrict(raw),{name:'DomainError'});
  for(const raw of ['1.70000000000000001','9007199254740993','1e9999','1e-9999'])
    assert.throws(()=>exactJsonNumber(raw),{name:'DomainError'});
  assert.equal(exactJsonNumber('1.700000'),1.7);
  assert.equal(exactJsonNumber('17e-1'),1.7);
  assert.equal(exactJsonNumber('1e21'),1e21);
  assert.equal({}.polluted,undefined);
  let invoked=0;
  rejects(()=>cloneData(Object.defineProperty({},'value',{get(){invoked++;return 1;},enumerable:true})),'unsafe-property');
  assert.equal(invoked,0);
  for(const id of ['__proto__','constructor','prototype'])rejects(()=>getField(id),'unsafe-key');
  rejects(()=>getField('toString'),'unknown-field');
});
test('schedule hash SHA-256 matches independent Node crypto including UTF-8 and multi-block input',()=>{
  for(const text of ['','abc','Tiếng Việt 👩🏽‍💻','x'.repeat(1000)])
    assert.equal(sha256(text),createHash('sha256').update(text).digest('hex'));
  assert.notEqual(createSchedule({sources:{firstLayerHeight:'profile',layerHeight:'profile'},profileId:'p'}).hash,uniform.hash);
  rejects(()=>domain.validateSchedule({...uniform,firstLayerHeight:0.16}),'schedule-hash');
});
test('first .16/.25 and regular .20 differ from uniform; spans after first layer use correct endpoints',()=>{
  const bambu=createSchedule({firstLayerHeight:0.16,layerHeight:0.20});
  const u1=createSchedule({firstLayerHeight:0.25,layerHeight:0.20});
  assert.equal(layerBoundary(0,bambu),0); assert.equal(layerBoundary(12,bambu),2.36);
  assert.equal(layerBoundary(12,u1),2.45); assert.equal(layerBoundary(12,uniform),2.4);
  assert.equal(layerSpan(1,12,bambu),2.4); assert.equal(layerSpan(1,12,u1),2.4);
  assert.equal(layerSpan(5,0,u1),0);
  rejects(()=>layerBoundary(1.2,bambu),'layer-index');
  rejects(()=>layerBoundary(-1,bambu),'layer-index');
  rejects(()=>layerBoundary(1000000,bambu),'z-range');
  rejects(()=>createSchedule({firstLayerHeight:0}),'first-layer-domain');
  rejects(()=>createSchedule({layerHeight:'0,31'}),'layer-domain');
  assert.equal(createSchedule({layerHeight:0.25}).layerHeight,0.25);
});
test('nominal-to-layer preview requires datum and shows all signed choices without changing mm',()=>{
  rejects(()=>previewMmToLayers(1.7,uniform,{}),'missing-property');
  rejects(()=>previewMmToLayers(1.7,uniform,{datum:{kind:'bed'},referenceLayer:1}),'bed-reference');
  const proposal=previewMmToLayers('1,7',uniform,{datum:{kind:'bed'},referenceLayer:0});
  assert.deepEqual(proposal.options.map(o=>[o.rounding,o.value.layers,o.mm,o.deltaMm]),[
    ['floor',8,1.6,-0.1],['ceil',9,1.8,0.1],['nearest-ties-even',8,1.6,-0.1]]);
  const socket=previewMmToLayers(5.5,uniform,{datum:{kind:'bed'},referenceLayer:0});
  assert.deepEqual(socket.options.map(o=>o.value.layers),[27,28,28]);
  assert.equal(socket.original.mm,5.5);
  const onFeature=previewMmToLayers(0.3,uniform,{datum:{kind:'feature',featureId:'body.top'},referenceLayer:1});
  assert.equal(onFeature.options[2].value.layers,2);
  assert.equal(onFeature.datumVerified,'requires-feature-resolution');
  const firstHalf=previewMmToLayers(0.08,createSchedule({firstLayerHeight:0.16}),{datum:{kind:'bed'},referenceLayer:0});
  assert.equal(firstHalf.options[2].value.layers,0);
});
test('catalog has complete stable field/group/disposition/default coverage and 5 preserved presets',()=>{
  assert.equal(CATALOG.fields.length,126);
  assert.deepEqual(CATALOG.fields.reduce((a,f)=>(a[f.kieu]++,a),{r:0,s:0,c:0}),{r:94,s:10,c:22});
  assert.equal(FIELD_SCHEMA.length,128); assert.equal(domain.GROUPS.length,11);
  assert.deepEqual(domain.MODE_DEFAULTS,CATALOG.modeDefaults);
  assert.equal(domain.MODE_DEFAULTS.length,5);
  for(const legacy of CATALOG.fields){
    const field=getField(legacy.id);
    assert.ok(field.disposition.reason); assert.ok(field.semanticScope); assert.ok(field.group);
    assert.equal(field.legacy.default,legacy.macDinh);
    for(const product of PRODUCT_IDS)
      normalizeField(field.id,candidateDefault(field.id,product),{schedule:uniform,allowLegacy:true});
  }
  for(const product of PRODUCT_IDS)assert.equal(createProject({product}).product,product);
});
test('range boundaries, discrete counts and every enum/boolean enforce domain independently of visibility',()=>{
  for(const f of FIELD_SCHEMA.filter(f=>f.lifecycle==='active')){
    if(f.type==='decimal'||f.type==='height'){
      for(const value of [f.domain.min,f.domain.max]){
        if(f.id==='ringH'&&value===0)continue;
        normalizeField(f.id,f.type==='height'?mm(value):value,{schedule:uniform});
      }
      const below=unitsDecimal(decimalUnits(f.domain.min)-1000000n);
      rejects(()=>normalizeField(f.id,f.type==='height'?mm(below):below,{schedule:uniform}),'field-domain');
    }else if(f.type==='enum')rejects(()=>normalizeField(f.id,'unknown-option',{schedule:uniform}),'enum-domain');
    else if(f.type==='boolean')rejects(()=>normalizeField(f.id,1,{schedule:uniform}),'boolean-required');
  }
  rejects(()=>normalizeField('k','2,1'),'field-grid');
  assert.equal(normalizeField('size','45,123456'),45.123456);
});
test('clr .05 survives UI .02 increment without snap and fit remains unverified',()=>{
  const f=getField('clr');
  assert.equal(f.defaultValue,0.05); assert.equal(f.ui.increment,0.02);
  assert.equal(f.domain.quantum,0.000001);
  assert.equal(normalizeField('clr','0,05'),0.05);
  assert.equal(normalizeField('clr','0.02'),0.02);
  assert.equal(normalizeField('clr','0.051234'),0.051234);
  assert.equal(f.verification.fit,'unverified');
  assert.ok(f.blockers.some(b=>b.id.includes('clearance-convention')));
});
test('auto enum is explicit; unresolved zero/coordinates are retained with blockers, never layer converted',()=>{
  assert.deepEqual(candidateDefault('ringH','keychain'),{heightMode:'auto',mode:'body-height'});
  rejects(()=>normalizeField('ringH',0,{schedule:uniform}),'height-mode');
  rejects(()=>normalizeField('ringH',mm(0),{schedule:uniform}),'zero-height-use-auto');
  rejects(()=>normalizeField('ringH',{heightMode:'auto',mode:'unknown'},{schedule:uniform}),'auto-mode');
  assert.deepEqual(normalizeField('skirtH',mm(0),{schedule:uniform}),mm(0));
  assert.ok(getField('skirtH').blockers.some(b=>b.id.includes('zero')));
  for(const id of ['strapZ','legoRanhZ','impZ','rimOver'])
    rejects(()=>normalizeField(id,bed(5),{schedule:uniform}),'decimal-type');
  assert.equal(domain.resolveFieldMm(createProject(),'ringH'),2.4);
});
test('source/product/dependency gates explain invisibility and all five products retain imported controls',()=>{
  const key=createProject({sourceKind:'svg'}),values=effectiveValues(key);
  const rasterGate=domain.fieldAvailability('res',{product:'keychain',sourceKind:'svg',values});
  assert.ok(rasterGate.reasons.some(r=>r.gate==='source')); assert.equal(rasterGate.valueRetained,true);
  assert.ok(domain.fieldAvailability('topBevelR',{product:'keychain',values}).reasons.some(r=>r.gate==='dependency'));
  assert.equal(domain.fieldAvailability('topBevelR',{product:'keychain',values:{...values,topBevel:true}}).applicable,true);
  for(const product of PRODUCT_IDS){
    for(const id of ['impOn','impOp','impX','impZ','meshJoinTolerance'])
      assert.ok(getField(id).applicability.products.includes(product));
    assert.equal(domain.fieldAvailability('impOp',{product,values:{impOn:true}}).applicable,true);
  }
  assert.equal(domain.CAPABILITIES.find(c=>c.id==='csg-union').status,'unsupported');
});
test('product roundtrip preserves shared manual values, all source content and per-product overrides',()=>{
  const content={source:{kind:'svg',hash:'fixture-source',raw:'<svg>Tiếng Việt</svg>'},text:['A 👩🏽‍💻'],
    regions:[{id:'r1',origin:'user',color:'#abcdef',slot:3}],overrides:{roles:{body:{origin:'user',color:'#123456',slot:1}},blocks:{'b:1':{height:mm(1.7)}}}};
  let state=createProject({content,sourceKind:'svg'});
  state=set(state,{size:55,artMode:'chim',baseH:mm('3,17')}).state;
  const keyValues=effectiveValues(state);
  state=switchTo(state,'clicky').state;
  assert.equal(effectiveValues(state).size,55);assert.equal(effectiveValues(state).artMode,'chim');
  assert.equal(effectiveValues(state).baseH,undefined);assert.equal(effectiveValues(state).artH.mm,0.6);
  state=set(state,{socketD:mm('5,5'),pinD:mm('1,7'),clr:'0,05'}).state;
  state=switchTo(state,'strap').state;
  assert.equal(effectiveValues(state).baseH.mm,10);
  state=set(state,{baseH:mm(11.125),strapD:5.25}).state;
  for(const p of ['lego','charm','keychain'])state=switchTo(state,p).state;
  assert.deepEqual(effectiveValues(state),keyValues);
  assert.deepEqual(state.content,content);
  state=switchTo(state,'strap').state;
  assert.equal(effectiveValues(state).baseH.mm,11.125);assert.equal(effectiveValues(state).strapD,5.25);
  state=switchTo(state,'clicky').state;
  assert.equal(effectiveValues(state).socketD.mm,5.5);assert.equal(effectiveValues(state).pinD.mm,1.7);
  assert.equal(effectiveValues(state).clr,0.05);
  const reopened=openProjectDocument(serializeProjectDocument(state));
  assert.equal(reopened.status,'editable');assert.deepEqual(reopened.state,state);
});
test('rejected parameter batches are atomic; interdependent valid final state can commit together',()=>{
  const state=createProject(),before=stableStringify(state);
  const rejected=previewCommand(state,{id:'parameters.set',args:{changes:[{id:'size',value:60},{id:'ringOuterD',value:4}]}});
  assert.equal(rejected.ok,false);assert.strictEqual(rejected.state,state);assert.equal(stableStringify(state),before);
  assert.equal(rejected.issues[0].code,'parameter-conflict');
  const valid=set(state,{ringOuterD:4,ringInnerD:3});
  assert.equal(effectiveValues(valid.state).ringOuterD,4);
  const bad=previewCommand(state,{id:'parameters.set',args:{changes:[{id:'size',value:60},{id:'size',value:80}]}});
  assert.equal(bad.ok,false);assert.equal(bad.issues[0].code,'duplicate-change');
  const unknown=previewCommand(state,{id:'parameters.set',args:{changes:[{id:'__proto__',value:1}]}});
  assert.equal(unknown.ok,false);assert.strictEqual(unknown.state,state);
});
test('preview lists changed values and activation; stale/tampered previews cannot commit',()=>{
  const state=createProject(),preview=previewCommand(state,{id:'product.switch',args:{product:'clicky'}});
  assert.equal(state.product,'keychain');assert.ok(preview.diff.some(d=>d.path==='/product'));
  assert.ok(preview.effects.some(e=>e.id==='ringOn'&&!e.after.applicable));
  assert.ok(preview.effects.some(e=>e.id==='plateT'&&e.after.applicable));
  const tampered=structuredClone(preview);tampered.candidate.content.overwrite=true;
  const failed=commitPreview(state,tampered);assert.equal(failed.ok,false);assert.strictEqual(failed.state,state);
  const changed=set(state,{size:50}).state;
  assert.equal(commitPreview(changed,preview).issues[0].code,'stale-preview');
});
test('undo and redo restore every snapshot value and preserve monotonic revision',()=>{
  const state=createProject({content:{source:'immutable source',color:'#123456'}});
  const changed=switchTo(set(state,{size:57}).state,'clicky');
  const undone=undoTransaction(changed.state,changed.transaction);
  assert.equal(undone.ok,true);assert.equal(undone.state.product,'keychain');
  assert.equal(effectiveValues(undone.state).size,57);
  const redone=undoTransaction(undone.state,undone.transaction);
  assert.equal(redone.ok,true);assert.equal(redone.state.product,'clicky');
  assert.ok(redone.state.revision>changed.state.revision);
  assert.deepEqual(redone.state.content,state.content);
  assert.equal(undoTransaction(redone.state,changed.transaction).issues[0].code,'stale-history');
});
test('schedule changes retain layer counts and nominal mm, with signed deviation previews',()=>{
  let state=createProject({product:'clicky'});
  state=set(state,{pinD:{...mm(1.7),datum:{kind:'bed'},referenceLayer:0},socketD:mm(5.5),plateT:bed(12)}).state;
  const proposed=previewCommand(state,{id:'schedule.set',args:{firstLayerHeight:'0,16'}});
  assert.equal(proposed.ok,true);assert.equal(proposed.candidate.schedule.firstLayerHeight,0.16);
  assert.equal(effectiveValues(proposed.candidate).plateT.layers,12);
  assert.equal(domain.resolveFieldMm(proposed.candidate,'plateT'),2.36);
  assert.equal(effectiveValues(proposed.candidate).pinD.mm,1.7);
  assert.equal(effectiveValues(proposed.candidate).socketD.mm,5.5);
  const pinEffect=proposed.effects.find(e=>e.id==='pinD');
  assert.equal(pinEffect.after.height.mm,1.7);
  assert.ok(pinEffect.after.height.manufacturing.options.some(o=>o.deltaMm!==0));
  const changed=commitPreview(state,proposed);
  const u1=apply(changed.state,{id:'schedule.set',args:{firstLayerHeight:0.25}});
  assert.equal(domain.resolveFieldMm(u1.state,'plateT'),2.45);
  assert.equal(effectiveValues(u1.state).socketD.mm,5.5);
});
test('explicit layer migration plus conflicting schedule/product changes stay atomic',()=>{
  let state=createProject();
  const converted=apply(state,{id:'parameter.convert-to-layers',args:{id:'baseH',binding:{datum:{kind:'bed'},referenceLayer:0},rounding:'nearest-ties-even'}});
  assert.equal(effectiveValues(converted.state).baseH.layers,12);
  state=set(converted.state,{baseH:bed(3)}).state;
  const rejected=previewCommand(state,{id:'schedule.set',args:{firstLayerHeight:0.16}});
  assert.equal(rejected.ok,false);assert.strictEqual(rejected.state,state);
  assert.equal(effectiveValues(state).baseH.layers,3);assert.equal(state.schedule.firstLayerHeight,0.2);
  let lego=createProject({product:'lego'});
  lego=set(lego,{baseH:bed(10)}).state;
  lego=switchTo(lego,'keychain').state;
  lego=apply(lego,{id:'schedule.set',args:{firstLayerHeight:0.16,layerHeight:0.16}}).state;
  const conflict=previewCommand(lego,{id:'product.switch',args:{product:'lego'}});
  assert.equal(conflict.ok,false);assert.strictEqual(conflict.state,lego);
  assert.equal(lego.parameters.byProduct.lego.baseH.value.layers,10);
});
test('profile proposals retain each user override and report incompatible requested heights, with undo',()=>{
  const state=createProject({schedule:createSchedule({firstLayerHeight:0.16,layerHeight:0.20,profileId:'bambu-fixture',sources:{firstLayerHeight:'profile',layerHeight:'user'}})});
  const preview=previewCommand(state,{id:'profile.apply',args:{profileId:'u1-fixture',firstLayerHeight:0.25,layerHeight:0.25}});
  assert.equal(preview.ok,true);assert.equal(preview.candidate.schedule.firstLayerHeight,0.25);assert.equal(preview.candidate.schedule.layerHeight,0.20);
  assert.deepEqual(preview.profileCompatibility.userOverridesOutsideProposal,['layerHeight']);
  assert.equal(preview.profileCompatibility.status,'unverified');
  const changed=commitPreview(state,preview),undo=undoTransaction(changed.state,changed.transaction);
  assert.equal(undo.ok,true);assert.deepEqual(undo.state.schedule,state.schedule);
});
test('reset clears only selected user overrides and re-enables product auto defaults',()=>{
  let state=set(createProject({content:{roles:{body:{origin:'user',color:'#ffffff'}}}}),{size:57,offset:2}).state;
  state=apply(state,{id:'parameters.reset',args:{ids:['size']}}).state;
  assert.equal(state.parameters.common.size.origin,'auto');assert.equal(effectiveValues(state).size,45);
  state=switchTo(state,'clicky').state;
  assert.equal(effectiveValues(state).size,40);assert.equal(effectiveValues(state).offset,2);
  assert.equal(state.content.roles.body.color,'#ffffff');
});
test('unknown project versions, fields, schedules, enum values and exact decimals retain raw source text',()=>{
  const future=' { "kind":"web-3d-arch.project-domain", "schemaVersion":999, "futureNumber":900719925474099312345, "x":1.70000000000000001 }\n';
  const opened=openProjectDocument(future);
  assert.equal(opened.status,'read-only');assert.equal(serializeProjectDocument(opened),future);
  const unknownField=structuredClone(createProject());
  unknownField.parameters.common.future={origin:'user',value:17};
  const raw=JSON.stringify(unknownField);
  assert.equal(serializeProjectDocument(openProjectDocument(raw)),raw);
  for(const mutate of [p=>p.product='future-product',p=>p.schedule.version=9,p=>p.parameters.common.artMode.value='future-enum']){
    const state=structuredClone(createProject());mutate(state);
    const text=JSON.stringify(state),result=openProjectDocument(text);
    assert.equal(result.status,'read-only');assert.equal(serializeProjectDocument(result),text);
  }
  const precise=JSON.stringify(createProject()).replace('"value":45','"value":45.000000000000000001');
  assert.equal(openProjectDocument(precise).issue.code,'json-number-loss');
  assert.equal(serializeProjectDocument(openProjectDocument(precise)),precise);
  const unsafe='{"__proto__":{"polluted":true}}';
  assert.equal(openProjectDocument(unsafe).status,'rejected');
  assert.equal(serializeProjectDocument(openProjectDocument(unsafe)),unsafe);
  assert.equal({}.polluted,undefined);
});
test('circular tessellation bound is conservative, signed, radius-dependent and never a geometry verdict',()=>{
  for(const d of [2,4,7.5,12])for(let n=6;n<=40;n+=2){
    const bound=domain.circularTessellationBound(d,n);
    const independent=(d/2)*(1-Math.cos(Math.PI/n));
    assert.ok(bound.lowerMm<=independent && independent<=bound.upperMm);
    assert.ok(bound.upperMm-bound.lowerMm<=0.000001000001);
    assert.equal(bound.deviationSign,'inward');assert.equal(bound.geometryVerified,false);
  }
  const preview=domain.previewStrapMigration(18,{diameterMm:4});
  assert.equal(preview.proposedValue,null);assert.ok(preview.blockers.length>0);
  assert.equal(preview.budgets.withinExportTarget,false);
  const confirmed=domain.previewStrapMigration(18,{diameterMm:4,confirmedConvention:'circle-inscribed-equal-angle'});
  assert.equal(confirmed.proposedValue.maxDeviationMm,0.030385);
  assert.equal(confirmed.requiresAcceptance,true);
  const doubled=domain.circularTessellationBound(8,18);
  assert.ok(doubled.upperMm>confirmed.bound.upperMm);
});
test('legacy catalog migration covers every field, keeps sources and replaces impVox without numeric identity',()=>{
  for(const product of PRODUCT_IDS){
    const values=Object.fromEntries(CATALOG.fields.map(f=>[f.id,f.macDinh]));
    Object.assign(values,CATALOG.modeDefaults.find(m=>m.mode===product).preset);
    const raw=JSON.stringify({catalogVersion:'1.0.1',product,values});
    const plan=domain.planLegacyMigration(raw,uniform);
    assert.equal(plan.status,'preview',JSON.stringify(plan.issues));
    assert.equal(plan.rows.length,126);assert.equal(plan.source.raw,raw);
    const vox=plan.rows.find(r=>r.id==='impVox');
    assert.equal(vox.legacyValue,0.25);assert.equal(vox.numericMapping,'none');
    assert.deepEqual(vox.proposedValue,{mode:'unselected'});
    assert.equal(plan.proposedValues.socketD.mm,5.5);assert.equal(plan.proposedValues.pinD.mm,1.7);
    assert.equal(plan.proposedValues.ringH.mode,'body-height');
    assert.equal(plan.geometryVerified,false);assert.equal(plan.fit,'unverified');
  }
  const unknown='{"catalogVersion":"next","product":"next","values":{"precise":1.70000000000000001}}';
  assert.equal(domain.planLegacyMigration(unknown,uniform).raw,unknown);
  const futureField=domain.planLegacyMigration('{"catalogVersion":"1.0.1","product":"keychain","values":{"future":99}}',uniform);
  assert.equal(futureField.status,'blocked');assert.equal(futureField.rows[0].legacyValue,99);
  const precision=domain.planLegacyMigration('{"catalogVersion":"1.0.1","product":"keychain","values":{"baseH":1.70000000000000001}}',uniform);
  assert.equal(precision.status,'blocked');assert.equal(precision.issues[0].code,'json-number-loss');
});

test('UI stepping from clr .05 by .02 yields .07 and refuses overflow rather than snapping/clamping',()=>{
  assert.equal(domain.stepFieldValue('clr',0.05,1),0.07);
  assert.equal(domain.stepFieldValue('clr',0.05,-1),0.03);
  rejects(()=>domain.stepFieldValue('clr',0.4,1),'field-domain');
  assert.equal(domain.stepFieldValue('baseH',bed(12),1,{schedule:uniform,layerStep:3}).layers,15);
  rejects(()=>domain.stepFieldValue('ringH',{heightMode:'auto',mode:'body-height'},1,{schedule:uniform}),'auto-step');
});
test('successful commit/undo do not freeze or mutate caller-owned mutable input snapshots',()=>{
  const input=structuredClone(createProject({content:{source:{id:'mutable-input'}}}));
  const before=JSON.stringify(input);
  const proposal=previewCommand(input,{id:'product.switch',args:{product:'clicky'}});
  const committed=commitPreview(input,proposal);
  assert.equal(committed.ok,true);
  assert.equal(JSON.stringify(input),before);
  assert.equal(Object.isFrozen(input),false);assert.equal(Object.isFrozen(input.content.source),false);
  assert.notStrictEqual(committed.transaction.before,input);
  const mutableResult=structuredClone(committed.state);
  const undone=undoTransaction(mutableResult,committed.transaction);
  assert.equal(undone.ok,true);assert.equal(Object.isFrozen(mutableResult),false);
});