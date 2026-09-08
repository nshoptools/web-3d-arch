import test from 'node:test';import assert from 'node:assert/strict';
import {ProposalOperations} from '../../src/app/proposals.mjs';
const digest='a'.repeat(64);
function host(){const c=new ProposalOperations(),abort=new AbortController(),control={ticket:{id:'first'},signal:abort.signal};const job={id:'first',abort};
 Object.assign(c,{pendingOperation:null,pendingChange:null,acceptingProposal:null,projectId:'project',headRevision:1,epoch:0,doc:{state:{revision:2}},job,store:{load:async()=>({headRevision:1})},guard(){},requireProject(){},emit(){},finishJob(value){if(this.job===value)this.job=null;}});return {c,control,job};}
for(const outcome of ['accept','discard'])test('consent handoff keeps same geometry job until '+outcome,async()=>{
 const {c,control,job}=host();let releaseFirst=0,releaseSecond=0,applied=0;
 await assert.rejects(c.proposeOperation({kind:'interpret',changes:['units'],control,handoff:true,outputHash:digest,verify:async()=>digest,release:()=>releaseFirst++,
  apply:()=>c.proposeOperation({kind:'geometry',changes:['target'],control,outputHash:digest,verify:async()=>digest,apply:()=>{assert.equal(control.signal.aborted,false);applied++;},release:()=>releaseSecond++})}),{code:'PROPOSAL_REQUIRED'});
 const first=c.pendingOperation.id;await assert.rejects(c.acceptOperation(first,true),{code:'PROPOSAL_REQUIRED'});
 assert.equal(releaseFirst,1);assert.equal(control.signal.aborted,false);assert.equal(c.job,job);const second=c.pendingOperation.id;assert.notEqual(second,first);
 await assert.rejects(c.acceptOperation(first,true),{code:'STALE_CONFIRMATION'});
 if(outcome==='accept')await c.acceptOperation(second,true);else c.discardPendingProposal(second);
 assert.equal(applied,outcome==='accept'?1:0);assert.equal(control.signal.aborted,true);assert.equal(c.job,null);assert.equal(releaseSecond,1);assert.equal(c.pendingOperation,null);
});
test('discard first stage releases geometry and never starts second',async()=>{const {c,control}=host();let released=0,applied=0;
 await assert.rejects(c.proposeOperation({kind:'interpret',changes:['units'],control,handoff:true,outputHash:digest,verify:async()=>digest,apply:()=>applied++,release:()=>released++}),{code:'PROPOSAL_REQUIRED'});
 c.discardPendingProposal(c.pendingOperation.id);assert.equal(released,1);assert.equal(applied,0);assert.equal(control.signal.aborted,true);
});
test('handoff refuses an unrelated job control',async()=>{const {c,control}=host(),other={...control,signal:new AbortController().signal};
 await assert.rejects(c.proposeOperation({kind:'first',changes:['units'],control,handoff:true,outputHash:digest,verify:async()=>digest,apply:()=>c.proposeOperation({kind:'second',changes:['target'],control:other,outputHash:digest,verify:async()=>digest,apply:()=>{}})}),{code:'PROPOSAL_REQUIRED'});
 await assert.rejects(c.acceptOperation(c.pendingOperation.id,true),{code:'PROPOSAL_REQUIRED'});assert.equal(control.signal.aborted,true);assert.equal(c.job,null);c.discardProposal();
});
