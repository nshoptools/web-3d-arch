import {assert,error,data,freeze,VERSION} from './common.mjs';
/** Mesh apply has two owned proposals. The same controller job is explicitly handed to the second proposal;
 * discarding either proposal retires all its owned resources. */
export class MeshTransactionOperations {
 meshHost(){return {
  current:()=>({document:this.doc,assets:this.assets,store:this.store,userId:this.session.user?.id,projectId:this.projectId,sessionKey:this.epoch+':'+this.projectContextGeneration,model:this.visible?.lease??null,headRevision:this.headRevision}),
  preflight:async control=>{assert(control.ticket.userId===this.session.user?.id&&control.ticket.projectId===this.projectId&&control.ticket.revision===this.doc?.state.revision,'MESH_HOST_STALE');await this.preflight(this.epoch,control.signal);assert(!control.signal.aborted,'CANCELLED');},
  adopt:input=>this.adoptMesh(input),
 };}
 adoptMesh({expected,candidate,model,head}){
  this.requireProject();assert(this.doc===expected.document&&this.assets===expected.assets&&this.store===expected.store&&this.session.user.id===expected.userId&&this.projectId===expected.projectId&&this.epoch+':'+this.projectContextGeneration===expected.sessionKey&&this.headRevision===expected.headRevision&&(this.visible?.lease??null)===expected.model,'MESH_HOST_STALE');
  const document=candidate?.document??this.doc,assets=candidate?.assets??this.assets;
  assert(model?.version===VERSION&&model.ticket.userId===expected.userId&&model.ticket.projectId===expected.projectId&&model.ticket.revision===document.state.revision,'MESH_MODEL_TICKET');
  assert(!candidate||head?.revision===expected.headRevision+1,'MESH_HEAD_REVISION');
  // Rendering may throw before ownership transfer. The transaction will then
  // report a durable commit whose model must be rebuilt, never a rollback.
  this.adapters.viewport?.setModel({lease:model,revision:document.state.revision,blocks:model.blocks});
  const previous=this.visible;this.doc=document;this.assets=assets;this.visible=this.retain(model);this.headRevision=head?.revision??this.headRevision;this.preview=null;this.selection=null;this.workspaceStep=2;this.pendingChange=null;this.readOnly=false;this.clearExportReceipts();
  if(candidate?.pruned?.length)this.truncated=true;
  // No throwing work after taking the primary model lease.
  // Every diagnostic goes through record(): it numbers the entry, which is how the strip tells new from seen (Codex R3-C09).
  try{previous?.release();}catch{this.record({code:'PREVIOUS_MODEL_RELEASE_FAILED',message:'Mô hình mới đã lưu; không giải phóng được một bộ đệm cũ.',severity:'warning'});}
  try{this.libraryCache.delete(this.projectId);this.emit();}catch{}
  return true;
 }
 async finishMeshResult(result,job){
  this.finishJob(job);
  if(result?.committed&&result.visible===false){
   // Durable state may be newer than the local view. Retire the latter and
   // reopen the verified journal instead of allowing an edit against old data.
   const id=this.projectId;if(this.epoch===job.epoch&&this.editingAllowed())await this.open(id);
   throw Object.assign(error('COMMITTED_MODEL_UNAVAILABLE'),{details:result.diagnostic});
  }
  assert(result?.committed&&result.visible&&this.visible?.lease===result.model,'MESH_ADOPTION_REQUIRED');
  try{await this.refreshLibrary();}catch(e){this.report(e);}
  return {committed:true};
 }
 async applyMesh(command){
  const service=this.adapters.meshTransactions,options=freeze(data(command));assert(service,'MESH_APPLY_UNSUPPORTED');this.requireProject();
  const job=this.startJob('Kiểm tra tệp khối nhập'),control=this.jobControl(job),host=this.meshHost();let input;
  try{
   await this.preflight(job.epoch,control.signal);this.jobGuard(job);
   input=await service.prepare({control,state:freeze(data(this.doc.state)),assets:this.assets,options,host,engine:this.adapters.engine.identity});this.jobGuard(job);
   await this.proposeOperation({kind:'đơn vị và vật liệu khối nhập',control,handoff:true,changes:input.changes,outputHash:input.outputHash,verify:input.verify,
    apply:async()=>{
     this.jobGuard(job);const next=job,nextControl=control;next.stage='Tính hình học ghép';this.emit();let output;
     try{
      output=await input.confirm(nextControl);this.jobGuard(next);
      await this.proposeOperation({kind:'áp dụng khối nhập',control:nextControl,changes:output.changes,outputHash:output.outputHash,verify:output.verify,
       apply:()=>this.enqueue(async()=>{this.jobGuard(next);const result=await output.confirm();return this.finishMeshResult(result,next);}),release:output.release});
     }catch(e){if(e.code!=='PROPOSAL_REQUIRED'){output?.release();this.finishJob(next);}throw e;}
    },release:input.release});
  }catch(e){if(e.code!=='PROPOSAL_REQUIRED'){input?.release();this.finishJob(job);}throw e;}
 }
 async rebuildMesh(){
  const service=this.adapters.meshTransactions;assert(service,'MESH_REPLAY_UNAVAILABLE');this.requireProject();
  assert(!service.needsApply(this.doc.state,this.assets),'MESH_REAPPLY_REQUIRED');
  const job=this.startJob('Dựng lại khối đã ghép'),control=this.jobControl(job);
  try{await this.preflight(job.epoch,control.signal);this.jobGuard(job);const result=await service.replay({control,host:this.meshHost(),engine:this.adapters.engine.identity});return await this.finishMeshResult(result,job);}finally{this.finishJob(job);}
 }
}
