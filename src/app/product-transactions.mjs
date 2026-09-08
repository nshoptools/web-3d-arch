import {VERSION,assert,error,data,freeze,assertTicket,canonicalJSON,sha256} from './common.mjs';
import {validateState} from './documents.mjs';
import {candidateHash} from './proposals.mjs';
import {domainStateFingerprint} from '../storage/index.mjs';
/** Controller ownership only. The integration plan supplies all native semantics;
 * the controller seals and publishes exactly the approved state and asset set. */
export class ProductTransactionOperations {
 async adoptTextSource(command){
  this.requireProject();const next=validateState({...data(this.doc.state),content:{...data(this.doc.state.content),app:{...data(this.doc.state.content.app),text:{...data(this.doc.state.content.app.text),...data(command.values),asSource:true}}}});
  assert(next.content.app.text.text.length>0,'TEXT_REQUIRED');
  const file={name:'project-text.txt',mediaType:'text/plain',bytes:new TextEncoder().encode(next.content.app.text.text)};
  return this.sourceJob(async()=>({file}),'source',{sourceState:next,sourceCommand:data(command)});
 }
 async productCommand(command){
  this.requireProject();const job=this.startJob('Prepare product update'),control=this.jobControl(job),state=freeze(data(this.doc.state)),map=new Map(this.assets);
  try{
   if(this.onlineSession){await this.preflight(job.epoch,job.abort.signal);this.jobGuard(job);}
   const plan=await this.adapters.productTransactions.prepareCommand({control,state,assets:new Map([...map].map(([h,a])=>[h,new Uint8Array(a.bytes)])),command:data(command)});
   await this.proposeProductTransaction({plan,job,control,map,command});
  }finally{if(this.pendingOperation?.control!==control)this.finishJob(job);}
 }
 async prepareProductAdoption({source,materials,materialDefaults,map,operation,command,sourceAuthority,text}){
  const state=freeze(data(this.doc.state)),job=this.startJob('Prepare source datums'),control=this.jobControl(job);
  try{
   if(this.onlineSession){await this.preflight(job.epoch,job.abort.signal);this.jobGuard(job);}
   const plan=await this.adapters.productTransactions.prepareAdoption({control,state,source:freeze(data(source)),materials:freeze(data(materials)),materialDefaults:freeze(data(materialDefaults)),
    operation,sourceAuthority,text,assets:new Map([...map].map(([h,a])=>[h,new Uint8Array(a.bytes)]))});
   await this.proposeProductTransaction({plan,job,control,map,command});
  }finally{if(this.pendingOperation?.control!==control)this.finishJob(job);}
 }
 async proposeProductTransaction({plan,job,control,map,command}){
  let proposalOwns=false;
  try{
   this.jobGuard(job);assert(plan?.version==='arch-product-transaction/1'&&typeof plan.preview==='function'&&typeof plan.confirm==='function'&&typeof plan.release==='function','PRODUCT_TRANSACTION_ADAPTER');
   assert(plan.expected.userId===job.ticket.userId&&plan.expected.projectId===job.ticket.projectId&&plan.expected.revision===job.ticket.revision&&plan.expected.headHash===await domainStateFingerprint(this.doc.state),'PRODUCT_TRANSACTION_HEAD');
   if(plan.status!=='proposal'){
    const choices=plan.planeChoices.map((choice,index)=>({choice,index})).filter(r=>r.choice.strategy==='ceil'&&r.choice.domainValid);
    const distinct=new Set(choices.map(r=>canonicalJSON(r.choice.parameterChanges)));
    if(!choices.length||distinct.size!==1||typeof plan.replan!=='function')throw Object.assign(error('PRODUCT_DATUM_PROPOSAL_BLOCKED'),{details:{diagnostics:plan.diagnostics,planeChoices:plan.planeChoices,proposalHash:plan.proposalHash}});
    const selected=choices[0],head=data(plan.nativeHead),output={proposalHash:plan.proposalHash,head,choice:data(selected.choice),command:data(command)},outputHash=await candidateHash(output,map);
    // Ceil is an explicit offer. No geometry is changed and no reference is
    // selected until the user confirms this exact proposal. Reprobe then gets
    // a new job at the unchanged committed head and requires its own consent.
    try{await this.proposeOperation({kind:'align manufacturing face',control,changes:[
     `Actual face ${selected.choice.faceZMm} mm is outside the layer schedule.`,
     `Propose ${selected.choice.proposedFaceZMm} mm (delta ${selected.choice.deltaMm} mm): ${canonicalJSON(selected.choice.parameterChanges)}`,
     'Reprobe the prospective geometry before source/material commit; a further datum confirmation is required.'
    ],outputHash,verify:()=>candidateHash(output,map),apply:async()=>{
     this.jobGuard(job);this.finishJob(job);const nextJob=this.startJob('Probe explicitly selected face'),nextControl=this.jobControl(nextJob);
     try{const nextPlan=await plan.replan(nextControl,selected.index);return await this.proposeProductTransaction({plan:nextPlan,job:nextJob,control:nextControl,map,command});}
     finally{if(this.pendingOperation?.control!==nextControl)this.finishJob(nextJob);}
    },release:()=>{plan.release();this.finishJob(job);}});}catch(e){if(e.code==='PROPOSAL_REQUIRED')proposalOwns=true;throw e;}
   }
   const preview=plan.preview(),next=validateState(data(preview.state)),base=data(this.doc.state),staged=new Map(map);
   assert(next.revision===base.revision+1,'PRODUCT_TRANSACTION_REVISION');
   const extraHashes=[];for(const asset of preview.assets){const ref=await this.addAsset(asset.bytes,asset.kind,staged);assert(ref.hash===asset.sha256,'PRODUCT_TRANSACTION_ASSET_HASH');extraHashes.push(ref.hash);}
   assert(await domainStateFingerprint(next)===plan.proposedStateHash,'PRODUCT_TRANSACTION_STATE_HASH');
   const head=data(plan.nativeHead),proposalHash=plan.proposalHash;
   assert(/^[a-f0-9]{64}$/.test(proposalHash),'PRODUCT_TRANSACTION_PROPOSAL_HASH');
   const sealed={state:next,nativeHead:head,proposalHash,command:data(command)},outputHash=await candidateHash(sealed,staged);this.jobGuard(job);
   job.stage='Source and datum confirmation';
   try{
    await this.proposeOperation({kind:'product source update',changes:plan.changes,control,outputHash,
     verify:()=>candidateHash(sealed,staged),
     apply:async()=>{
      this.jobGuard(job);const reply=await plan.confirm(control);this.jobGuard(job);
      assert(reply?.version==='arch-product-source-update-commit/1'&&reply.proposalHash===proposalHash&&reply.requiresAtomicCommit===true,'PRODUCT_TRANSACTION_COMMIT');
      assert(canonicalJSON(reply.expected)===canonicalJSON(plan.expected)&&canonicalJSON(reply.state)===canonicalJSON(next),'PRODUCT_TRANSACTION_COMMIT_CHANGED');
      const accepted=new Map(map),confirmedHashes=[];
      for(const asset of reply.assets){const ref=await this.addAsset(asset.bytes,asset.kind,accepted);assert(ref.hash===asset.sha256,'PRODUCT_TRANSACTION_ASSET_HASH');confirmedHashes.push(ref.hash);}
      assert(canonicalJSON(confirmedHashes.sort())===canonicalJSON(extraHashes.sort())&&await candidateHash(sealed,accepted)===outputHash,'PRODUCT_TRANSACTION_COMMIT_CHANGED');this.jobGuard(job);
      // A receipt is evidence, never an executable replay or a replacement state.
      assert(reply.nativeReceipt===null||reply.nativeReceipt instanceof Uint8Array&&reply.nativeReceipt.length>0&&reply.nativeReceipt.length<=4096&&head!==null,'PRODUCT_TRANSACTION_RECEIPT');
      const nativeReceipt=reply.nativeReceipt===null?null:{version:'arch-native-confirmation-evidence/1',sha256:await sha256(reply.nativeReceipt),bytes:reply.nativeReceipt.length};
      assert(canonicalJSON(nativeReceipt).length<=1048576,'PRODUCT_TRANSACTION_RECEIPT_LIMIT');
      await this.enqueue(()=>{this.jobGuard(job);return this.edit(next,{type:'product.atomic-update',command:data(command),proposalHash,nativeHead:head,nativeReceipt},{assets:accepted,signal:job.abort.signal});});
      this.finishJob(job);
      if(reply.requiresNativeRebuild)return this.build(true);
     },release:()=>{plan.release();this.finishJob(job);}});
   }catch(e){if(e.code==='PROPOSAL_REQUIRED')proposalOwns=true;throw e;}
  }finally{if(!proposalOwns)plan?.release?.();}
 }
}
