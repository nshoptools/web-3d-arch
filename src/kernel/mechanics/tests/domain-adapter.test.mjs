import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {createMechanicsDomainAdapter,proposalCommand,MechanicsContractError,DATUMS} from '../src/domain-adapter.mjs';
// Persistent integrated domain is the dependency under test, not a draft/sample.
const domain=await import(pathToFileURL(path.join(process.env.PROJECT_ROOT,'src/domain/index.mjs')));
const encode=createMechanicsDomainAdapter(domain);
for(const product of ['keychain','clicky','strap','lego','charm']){
  const p=domain.createProject({product,sourceKind:'svg'}),before=JSON.stringify(p),x=encode(p);
  assert.equal(JSON.stringify(p),before);assert.equal(x.fitQualification,'unqualified');
  assert.equal(x.abiVersion,2);
  const buffer=new DataView(x.parameterBytes.buffer);
  x.records.forEach((r,i)=>{assert.equal(buffer.getUint32(i*40,true),r.fieldId);assert.equal(buffer.getFloat64(i*40+24,true),r.value);assert.equal(buffer.getBigUint64(i*40+32,true),r.provenanceId);});
  assert.ok(x.sourceRecipeBindings.some(p=>p.fieldId===8)); // size
  assert.equal(x.schedule.firstNm,200000n);assert.equal(x.schedule.regularNm,200000n);
  if(product==='clicky')for(const [id,value] of [[85,5.5],[97,1.7],[89,1.85]]){
    // Look up names through the real catalog instead of trusting hardcoded IDs.
    const name=id===85?'socketD':id===97?'pinD':'collarH';
    const ordinal=domain.CATALOG.fields.findIndex(f=>f.id===name)+1;
    assert.equal(x.records.find(r=>r.fieldId===ordinal).value,value);
  }
}
const lego=domain.createProject({product:'lego',sourceKind:'svg'});
const grooveId=domain.CATALOG.fields.findIndex(f=>f.id==='legoRanhZ')+1;
assert.equal(encode(lego).records.find(r=>r.fieldId===grooveId).mode,4);
const zeroPreview=domain.previewCommand(lego,{id:'parameters.set',args:{changes:[{id:'legoRanhZ',value:0}]}});
assert.equal(zeroPreview.ok,true);
const explicitZero=encode(domain.commitPreview(lego,zeroPreview).state).records.find(r=>r.fieldId===grooveId);
assert.equal(explicitZero.value,0);assert.equal(explicitZero.mode,0);assert.equal(explicitZero.origin,1);
assert.equal(DATUMS['source:attachment.bottom'],10);
let p=domain.createProject({product:'clicky',sourceKind:'svg',schedule:domain.createSchedule({firstLayerHeight:.16,layerHeight:.25})});
const preview=domain.previewCommand(p,{id:'parameters.set',args:{changes:[{id:'plateT',value:{heightMode:'layers',layers:8,datum:{kind:'feature',featureId:'mech:cap:plate.underside'},referenceLayer:20}}]}});
assert.equal(preview.ok,true);p=domain.commitPreview(p,preview).state;
const x=encode(p),plate=x.records.find(r=>r.fieldId===domain.CATALOG.fields.findIndex(f=>f.id==='plateT')+1);
assert.equal(plate.mode,2);assert.equal(plate.datum,2);assert.equal(plate.referenceLayer,20);assert.equal(plate.layerCount,8);
const project=domain.createProject({product:'keychain',sourceKind:'svg'});
const command=proposalCommand([{field:'baseH',before:2.4,after:3.2,mode:1,applicable:1}]);
const acceptedPreview=domain.previewCommand(project,command);assert.equal(acceptedPreview.ok,true);
assert.equal(domain.resolveFieldMm(project,'baseH'),2.4);assert.equal(domain.resolveFieldMm(domain.commitPreview(project,acceptedPreview).state,'baseH'),3.2);
assert.throws(()=>proposalCommand([{field:'baseH',after:40,applicable:0}]),MechanicsContractError);
assert.throws(()=>encode(project,{matingToleranceMm:.02}),/MATING_TOLERANCE/);
const strap=domain.createProject({product:'strap',sourceKind:'svg'});
const change=domain.previewCommand(strap,{id:'parameters.set',args:{changes:[{id:'strapTolerance',value:{mode:'selected',maxDeviationMm:.0005,capabilityId:'circle-inscribed-equal-angle',capabilityVersion:'1'}}]}});
assert.equal(change.ok,true);assert.throws(()=>encode(domain.commitPreview(strap,change).state),/CONVENTION_REQUIRES_EXPLICIT_MIGRATION/);
console.log('PASS domain adapter: five products, nominal mm, ABI 2, provenance, explicit datum, auto groove versus literal user zero, proposal command, convention mismatch');
