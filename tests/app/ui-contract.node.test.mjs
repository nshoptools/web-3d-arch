import {exportContext,declaredFormats,gateExport,rescueOption} from '../../src/app/export-policy.mjs';
import {newDocument,parameterViews,contentEdit} from '../../src/app/documents.mjs';
import {ProposalOperations} from '../../src/app/proposals.mjs';
import {VERSION} from '../../src/app/common.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const hash='a'.repeat(64);
const option=(prerequisite='matching-model')=>({id:'test-format',label:'Explicit TEST serializer',extension:'test',enabled:true,verdict:'unverified',prerequisite});
async function context(){
 const {document}=await newDocument('keychain');
 const state=structuredClone(document.state);state.content.app.source={raw:{hash}};
 return {state,model:null,renderer:{available:false},projectId:'test-project',canEdit:true,assets:new Map([[hash,{bytes:new Uint8Array([1])}]])};
}
test('EXP-02 per-format gates require only their committed source/renderer/model inputs',async()=>{
 const c=await context();assert.equal(gateExport(option('committed-source'),c).enabled,true);
 assert.equal(gateExport(option('renderer'),c).reasonCode,'NO_SNAPSHOT');
 assert.equal(gateExport(option(),c).reasonCode,'NO_SNAPSHOT');
 c.renderer.available=true;assert.equal(gateExport(option('renderer'),c).enabled,true);
 c.model={ticket:{projectId:c.projectId,revision:c.state.revision}};assert.equal(gateExport(option(),c).enabled,true);
 c.state.revision++;assert.equal(gateExport(option(),c).reasonCode,'STALE_REVISION');
 assert.equal(gateExport(option('committed-source'),c).enabled,true);assert.equal(gateExport(option('renderer'),c).enabled,true);
 c.state.content.app.mesh={applied:false};c.model.ticket.revision++;
 assert.equal(gateExport(option(),c).reasonCode,'UNAPPLIED_MESH_EDIT');assert.equal(gateExport(option('committed-source'),c).enabled,true);
 c.assets.clear();assert.equal(gateExport(option('committed-source'),c).reasonCode,'NO_SNAPSHOT');
});
test('registry fails closed on unknown prerequisites/duplicates/reserved IDs; legacy exports still require matching model',async()=>{
 const c=await context(),adapter={version:VERSION,formats:()=>[{...option(),prerequisite:undefined,reason:''}]};
 const [legacy]=declaredFormats(adapter,exportContext(c.state,null,false));assert.equal(legacy.prerequisite,'matching-model');assert.equal(Object.hasOwn(legacy,'reason'),false);
 assert.equal(gateExport({...legacy,prerequisite:'invented bypass'},c).reasonCode,'UNSUPPORTED_EXPORTER');
 adapter.formats=()=>[option(),option()];assert.throws(()=>declaredFormats(adapter,c),{code:'EXPORT_REGISTRY_INVALID'});
 adapter.formats=()=>[{...option(),id:'project'}];assert.throws(()=>declaredFormats(adapter,c),{code:'EXPORT_REGISTRY_INVALID'});
 adapter.formats=()=>[{...option(),enabled:false,reason:'   '}];assert.ok(declaredFormats(adapter,c)[0].reason.trim());
});
test('blocked reasons are truthful while valid exports/parameters omit reason; rescue ignores an expired edit lease',async()=>{
 const c=await context();c.canEdit=false;
 for(const req of ['committed-source','renderer','matching-model']){const view=gateExport(option(req),c);assert.equal(view.reasonCode,'PROJECT_LOCKED');assert.ok(view.reason.trim());}
 assert.equal(rescueOption({projectId:'p',canRescue:true}).enabled,true);
 assert.equal(Object.hasOwn(rescueOption({projectId:'p',canRescue:true}),'reason'),false);
 assert.equal(rescueOption({projectId:'',canRescue:false}).reasonCode,'PROJECT_REQUIRED');
 assert.equal(rescueOption({projectId:'p',canRescue:false}).reasonCode,'PROJECT_LOCKED');
 for(const canEdit of [true,false])for(const p of parameterViews(c.state,canEdit)){
  if(p.enabled)assert.equal(Object.hasOwn(p,'reason'),false);else assert.ok(p.reason.trim());
 }
 const frozen=exportContext(c.state,null,true);assert.ok(Object.isFrozen(frozen.state.content.app));assert.ok(Object.isFrozen(frozen.renderer));assert.notEqual(frozen.state,c.state);
});
test('gesture project revision includes editor/material changes even when source pixel revision does not change',async()=>{
 const {document}=await newDocument('keychain'),first=document.state;
 const settings=contentEdit(first,app=>{app.editor.strokeWidthPx='3';});
 const materials=contentEdit(settings,app=>{app.materials=[{id:'m',label:'Test',color:'#ff0000',slot:1,role:'region',overridden:true,backgroundEligible:true,excluded:false}];});
 assert.equal(settings.revision,first.revision+1);assert.equal(materials.revision,first.revision+2);
});
function proposalHarness(){
 // Unit lifecycle harness only: browser cases use actual controller/IDB and backend.
 const controller=Object.assign(new ProposalOperations(),{epoch:1,projectId:'p',headRevision:1,doc:{state:{revision:0}},events:0,
  emit(){this.events++;},requireProject(){},guard(){},finishJob(job){if(this.job===job)this.job=null;}});
 return controller;
}
test('discard consumes only the exact proposal, aborts its owned job and releases once across late acceptance cleanup',async()=>{
 const c=proposalHarness(),abort=new AbortController(),ticket={id:'test-job'},control={ticket,signal:abort.signal};
 c.job={id:ticket.id,abort};let released=0;
 await assert.rejects(()=>c.proposeOperation({control,kind:'test',changes:['Explicit TEST proposal'],outputHash:hash,verify:()=>hash,apply(){},release(){released++;}}),{code:'PROPOSAL_REQUIRED'});
 const p=c.pendingOperation;assert.throws(()=>c.discardPendingProposal('other'),{code:'STALE_CONFIRMATION'});assert.equal(c.pendingOperation,p);assert.equal(released,0);
 c.discardPendingProposal(p.id);assert.equal(abort.signal.aborted,true);assert.equal(c.pendingOperation,null);assert.equal(released,1);assert.equal(c.job,null);
 p.release();assert.equal(released,1);assert.throws(()=>c.discardPendingProposal(p.id),{code:'STALE_CONFIRMATION'});
 await assert.rejects(()=>c.acceptOperation(p.id,true),{code:'STALE_CONFIRMATION'});
});
test('accept/discard race rejects discard after acceptance starts, never claims an in-progress commit was rolled back',async()=>{
 const c=proposalHarness();let releaseGate,enteredGate;
 const gate=new Promise(r=>{releaseGate=r;}),entered=new Promise(r=>{enteredGate=r;});let committed=0,released=0;
 c.store={async load(){return {headRevision:1};}};
 await assert.rejects(()=>c.proposeOperation({kind:'test',changes:['Explicit TEST approval'],outputHash:hash,
  async verify(){enteredGate();await gate;return hash;},async apply(){committed++;},release(){released++;}}),{code:'PROPOSAL_REQUIRED'});
 const id=c.pendingOperation.id,accept=c.acceptOperation(id,true);await entered;
 assert.throws(()=>c.discardPendingProposal(id),{code:'APPROVAL_IN_PROGRESS'});assert.equal(committed,0);
 await assert.rejects(()=>c.acceptOperation(id,true),{code:'APPROVAL_IN_PROGRESS'});releaseGate();await accept;
 assert.equal(committed,1);assert.equal(released,1);assert.equal(c.pendingOperation,null);
});
