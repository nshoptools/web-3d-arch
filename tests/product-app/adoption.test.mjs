import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';
import {adapters,svgState,rasterState,adoptState,ownTestState,change,client,live,setLive,controlFor,transportLog,noOwned,evidence,svgPreparation,txtSVG} from './harness.mjs';
import {prepareBindings,PRODUCT_ROLES} from '../../src/integration/product-adapters.mjs';
import {canonicalJSON,sha256} from '../../src/storage/common.mjs';
import {domainStateFingerprint} from '../../src/storage/history.mjs';
import * as domain from '../../src/domain/index.mjs';
const evidenceRows=[];
test('pure adoption installs defaults, inline identity ledger, and preserves user overrides on switch/rebuild',async()=>{
 const f=await adoptState(await svgState());
 const b=f.state.content.app.source.metadata.productBindings;
 assert.deepEqual(Object.keys(b.roles),PRODUCT_ROLES);
 assert.equal(f.adoption.changes.filter(c=>c.kind==='initialize-role').length,9);
 assert.ok(f.adoption.changes.some(c=>c.kind==='initialize-slot'));
 assert.equal(f.state.content.app.materials.length,11);
 assert.ok(f.state.content.app.materials.every(m=>m.slot>=1&&m.slot<=16&&!m.overridden));
 assert.equal(f.state.content.app.printerId,null);
 assert.equal(b.identityLedger.version,'arch-product-identities/1');
 assert.equal(await sha256(canonicalJSON(b.identityLedger)),f.adoption.identityLedgerHash);
 assert.deepEqual(f.adoption.source.assetHashes,f.state.content.app.source.assetHashes);
 const edited=structuredClone(domain.switchProductDraft(f.state,'clicky'));
 const body=edited.content.app.materials.find(m=>m.id===b.roles.body);
 body.color='#cd2345';body.slot=15;body.overridden=true;
 const west=edited.content.app.materials.find(m=>m.id===b.regions[0].materialId);
 west.color='#010203';west.slot=16;west.overridden=true;
 const pre=canonicalJSON(edited),count=transportLog.length;
 const result=await prepareBindings({projectId:live.projectId,state:edited,source:edited.content.app.source,canonicalContexts:f.canonicalContexts});
 assert.equal(transportLog.length,count,'pure initializer issues no runtime calls');
 assert.equal(canonicalJSON(edited),pre,'input state unchanged');
 assert.equal(result.status,'ready');assert.equal(result.expected.headHash,await domainStateFingerprint(edited));
 for(const override of [body,west]){
  const m=result.materials.find(m=>m.id===override.id);
  for(const key of ['id','color','slot','overridden'])assert.equal(m[key],override[key]);
 }
 assert.deepEqual(result.sourceMetadata.productBindings.roles,b.roles);
 assert.deepEqual(result.sourceMetadata.productBindings.regions.map(r=>r.sourceKey),b.regions.map(r=>r.sourceKey));
 evidenceRows.push({case:'adoption-and-switch',status:result.status,roles:9,materials:result.materials.length,identityLedgerHash:f.adoption.identityLedgerHash,printer:'unselected/unqualified'});
 noOwned();
});
test('uninitialized auto slots fill explicitly; user null and same slot/different color produce concrete decisions',async()=>{
 const f=await adoptState(await svgState()),b=f.state.content.app.source.metadata.productBindings;
 for(const type of ['auto-null','user-null','conflict','height']){
  const changed=change(f,s=>{
   const body=s.content.app.materials.find(m=>m.id===b.roles.body),west=s.content.app.materials.find(m=>m.id===b.regions[0].materialId);
   if(type==='auto-null')body.slot=null;
   if(type==='user-null'){body.slot=null;body.overridden=true;}
   if(type==='conflict'){body.slot=west.slot;body.overridden=true;}
   if(type==='height'){west.heightLayers=4;west.overridden=true;}
  });
  const result=await prepareBindings({projectId:live.projectId,state:changed.state,source:changed.state.content.app.source,canonicalContexts:f.canonicalContexts});
  if(type==='auto-null'){assert.equal(result.status,'ready');assert.ok(result.changes.some(c=>c.kind==='initialize-slot'&&c.materialId===b.roles.body));}
  else{
   assert.equal(result.status,'blocked');
   const code=type==='user-null'?'PRODUCT_USER_SLOT_UNRESOLVED':type==='conflict'?'PRODUCT_SLOT_CONFLICT':'PRODUCT_REGION_DATUM_REQUIRED';
   assert.ok(result.diagnostics.some(d=>d.code===code));
   if(type==='conflict'){assert.ok(result.proposals.some(p=>p.kind==='material-slot-remap'&&p.requiresExplicitDecision));assert.equal(result.materials.find(m=>m.id===b.roles.body).slot,changed.state.content.app.materials.find(m=>m.id===b.roles.body).slot);}
   if(type==='height')assert.equal(result.proposals.find(p=>p.kind==='resolve-region-height-datum').referenceLayer,null);
  }
  evidenceRows.push({case:type,status:result.status,diagnostics:result.diagnostics,proposals:result.proposals});
 }
 noOwned();
});
test('anonymous adoption persists IDs; exact geometry rebind survives selector order; split proposal retains old material',async()=>{
 const f=await adoptState(await svgState()),source=structuredClone(f.state.content.app.source),initial=structuredClone(f.state);
 delete source.metadata.productBindings;delete initial.content.app.source.metadata.productBindings;
 initial.content.app.materials=[];initial.content.app.materialDefaults=[];
 const canonical=structuredClone(f.canonicalContexts);canonical[0].regions.forEach(r=>r.authoredKey=null);
 const first=await prepareBindings({projectId:live.projectId,state:initial,source,canonicalContexts:canonical});
 assert.equal(first.status,'ready');const b=first.sourceMetadata.productBindings;
 assert.ok(b.regions.every(r=>r.sourceKey.startsWith('adopted:')));
 const accepted=structuredClone(initial);accepted.content.app.source=structuredClone(first.source);accepted.content.app.materials=structuredClone(first.materials);accepted.content.app.materialDefaults=structuredClone(first.materialDefaults);accepted.revision++;
 const next=structuredClone(first.source);next.revision++;next.metadata.sourceContext={...next.metadata.sourceContext,operation:'convert',revision:next.revision,predecessor:{id:next.id,revision:next.revision-1,rawHash:next.raw.hash}};
 const reordered=structuredClone(canonical);reordered[0].regions.reverse();reordered[0].regions.forEach((r,i)=>{r.nativeKey='new-selector-'+i;r.sourceIndex=i;});
 const retained=await prepareBindings({projectId:live.projectId,state:accepted,source:next,canonicalContexts:reordered});
 assert.equal(retained.status,'ready');assert.deepEqual(new Set(retained.sourceMetadata.productBindings.regions.map(r=>r.sourceKey)),new Set(b.regions.map(r=>r.sourceKey)));
 assert.ok(retained.sourceMetadata.productBindings.adoptionProvenance.matches.every(r=>r.proof==='unique-canonical-geometry'));
 const split=structuredClone(reordered);split[0].regions[0].geometryHash='9'.repeat(64);
 const proposal=await prepareBindings({projectId:live.projectId,state:accepted,source:next,canonicalContexts:split});
 assert.equal(proposal.status,'proposal');assert.equal(proposal.proposals[0].kind,'source-identity-rebind');
 assert.equal(proposal.proposals[0].retired.length,1);assert.equal(proposal.proposals[0].allocated.length,1);
 const retiredMaterial=proposal.proposals[0].retired[0].materialId;
 assert.equal(proposal.materials.find(m=>m.id===retiredMaterial).product.active,false);
 evidenceRows.push({case:'anonymous-rebind',retained:retained.sourceMetadata.productBindings.adoptionProvenance.matches,split:proposal.proposals});
 noOwned();
});
test('native geometry proposal is no-mesh, exact-head one-shot acknowledgement, separate from domain commit',async()=>{
 const f=await svgState('clicky');
 const changed=change(f,s=>{s.parameters.common.size.value=20;});
 let delivered;const a=adapters({onGeometryProposal:p=>{delivered=p;return true;}});
 const input=ownTestState(changed),stateBefore=canonicalJSON(changed.state);
 await assert.rejects(a.engine.build(input),{code:'PRODUCT_GEOMETRY_PROPOSAL'});
 assert.ok(delivered);assert.equal('bytes'in delivered,false);assert.ok(delivered.metadata.proposals.length>0);
 assert.equal(client.roots.size,0);
 const receipt=await delivered.confirm(controlFor(changed.state));
 assert.equal(receipt.length,192);assert.equal(canonicalJSON(live.state),stateBefore);
 await assert.rejects(delivered.confirm(controlFor(changed.state)),{code:'PRODUCT_PROPOSAL_CONSUMED'});
 await a.reset();noOwned();
 let stale;const b=adapters({onGeometryProposal:p=>{stale=p;return true;}});
 await assert.rejects(b.engine.build(ownTestState(changed)),{code:'PRODUCT_GEOMETRY_PROPOSAL'});
 setLive({...live,state:change(changed,s=>s.content.app.name='head moved without revision').state});
 await assert.rejects(stale.confirm(controlFor(changed.state)),{code:'PRODUCT_HEAD_CHANGED'});
 await b.reset();noOwned();
 const c=adapters();await assert.rejects(c.engine.build(ownTestState(changed)),{code:'PRODUCT_GEOMETRY_PROPOSAL_UNHANDLED'});await c.reset();noOwned();
 evidenceRows.push({case:'geometry-proposal',requestHash:delivered.head.requestHash,headHash:delivered.head.headHash,domainMutated:false,receiptBytes:receipt.length});
});
test('native text context preserves explicit 133/134 references; incomplete text controls block',async()=>{
 let f=await svgState();
 const textHash=await sha256(txtSVG),b=structuredClone(f.state.content.app.source.metadata.productBindings);
 const value={mode:2,origin:1,datum:133,referenceLayer:18,layerCount:4,value:0};
 b.contexts.push({key:'overlay',sha256:textHash,derivationHash:await sha256('synthetic prepared text layout receipt')});
 b.regions.push({sourceKey:'text-object-glyph-A',contextKey:'overlay',nativeKey:'text-A',materialId:'mat-text',textKey:'object-A',height:null});
 b.texts=[{sourceKey:'object-A',placement:0,baseOn:true,basePad:.5,baseRound:0,height:value,baseHeight:{...value,datum:134,referenceLayer:16,layerCount:2}}];
 f=change(f,s=>{
  s.content.app.text={...s.content.app.text,text:'A',heightLayers:'4',baseEnabled:true,baseThicknessLayers:'2'};
  s.content.app.source.assetHashes.push(textHash);s.content.app.source.metadata.productBindings=b;
 });
 b.textStateHash=await sha256(canonicalJSON(f.state.content.app.text));f.state.content.app.source.metadata.productBindings=b;
 f.assets=new Map([...f.assets,[textHash,new TextEncoder().encode(txtSVG)]]);
 const a=adapters(),model=await a.engine.build(ownTestState(f));
 const sem=model.product.semantics;
 assert.equal(sem.inputTexts[0].height.datum,133);assert.equal(sem.inputTexts[0].height.referenceLayer,18);
 assert.equal(sem.inputTexts[0].baseHeight.datum,134);assert.equal(sem.inputTexts[0].baseHeight.referenceLayer,16);
 assert.ok(model.blocks.some(b=>b.role==='text'));assert.ok(model.blocks.some(b=>b.role==='textBase'));
 assert.equal(sem.totalErrorBoundMm,null);
 const proposal=await a.prepareHeightBindings({model,control:controlFor(f.state),changes:[{target:{kind:'text',sourceKey:'object-A',field:'height'},mode:'layers',layers:5}]});
 assert.equal(proposal.status,'proposal');assert.equal(proposal.updates[0].after.referenceLayer,18);
 const next=change(f,s=>{s.content.app.source.metadata.productBindings=structuredClone(proposal.productBindings);s.content.app.materials=structuredClone(proposal.materials);s.content.app.text=structuredClone(proposal.text);s.revision++;});
 const raised=await a.engine.build(ownTestState(next));assert.equal(raised.product.semantics.inputTexts[0].height.referenceLayer,18);assert.equal(raised.product.semantics.inputTexts[0].height.layerCount,5);
 const heightInterval=raised.product.semantics.sourceIntervals.find(i=>i.datum===133);assert.ok(Math.abs(heightInterval.z0-3.6)<1e-12&&Math.abs(heightInterval.z1-4.6)<1e-12);
 const unavailable=await a.prepareHeightBindings({model:raised,control:controlFor(next.state),changes:[{target:{kind:'text',sourceKey:'object-A',field:'height'},mode:'mm',mm:1}]});assert.equal(unavailable.status,'blocked');assert.equal(unavailable.diagnostics[0].code,'PRODUCT_TEXT_MM_CONTROL_UNAVAILABLE');
 raised.release();model.release();await a.reset();noOwned();
 const bad=change(f,s=>s.content.app.text.bevelEnabled=true),x=adapters();
 await assert.rejects(x.engine.build(ownTestState(bad)),{code:'PRODUCT_TEXT_BEVEL_UNAVAILABLE'});await x.reset();noOwned();
 evidenceRows.push({case:'synthetic prepared text contour/reference plumbing',references:[133,134],referenceLayers:[18,16],shapingQualified:false,R2DatumQualification:'synthetic text actual-face references only'});
});
test.after(()=>{fs.writeFileSync(path.join(evidence,'initializer-and-proposals.json'),JSON.stringify(evidenceRows,null,2)+'\n');noOwned();});
