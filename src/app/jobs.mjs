import {VERSION,assert,error,data,freeze,uuid,canonicalJSON,adapter,capable,boundedBytes,fileName,utf8,sha256,assertTicket} from './common.mjs';
import {exportRescuePackage} from '../storage/index.mjs';
import {exportContext,declaredFormats,gateExport,rescueOption} from './export-policy.mjs';
import {domainCommand} from './documents.mjs';
import {candidateHash} from './proposals.mjs';
import {exportOptionsFor} from './export-configuration.mjs';
import {prepareExportReceipt} from './export-receipts.mjs';
export class JobOperations {
 startJob(stage){
  this.requireProject();this.pendingChange=null;this.discardProposal();this.job?.abort.abort();this.discardPreview();const id=uuid(),abort=new AbortController(),ticket={id,userId:this.session.user.id,projectId:this.projectId,revision:this.doc.state.revision,generation:++this.generation};
  this.job={id,abort,ticket,state:'running',stage,progress:null,epoch:this.epoch};this.emit();return this.job;
 }
 jobControl(job){return {version:VERSION,ticket:freeze(data(job.ticket)),signal:job.abort.signal,onProgress:p=>{
  if(this.job!==job||job.abort.signal.aborted)return;assert(typeof p.stage==='string'&&(p.progress===null||Number.isFinite(p.progress)&&p.progress>=0&&p.progress<=1),'JOB_PROGRESS');job.stage=p.stage;job.progress=p.progress;this.emit();
 }};}
 jobGuard(j){this.guard(j.epoch);assert(this.job===j&&!j.abort.signal.aborted&&j.ticket.projectId===this.projectId&&j.ticket.revision===this.doc.state.revision,'STALE_JOB');}
 finishJob(j){if(this.job===j){this.job=null;this.emit();}}
 retain(lease){let count=1,released=false;return {lease,acquire(){assert(!released,'LEASE_RELEASED');count++;},release(){if(!released&&--count===0){released=true;lease.release();}}};}
 clearVisible(){try{this.adapters.viewport?.clear();}finally{this.visible?.release();this.visible=null;this.selection=null;this.workspaceStep=1;}}
 discardPreview(){this.preview?.record.release();this.preview=null;}
 async build(commit){
  if(this.doc?.state.content.app.mesh?.applied){assert(commit,'MESH_REPLAY_COMMIT_REQUIRED');return this.rebuildMesh();}
  const a=adapter(this.adapters.engine);assert(capable(a,'geometry.build'),'GEOMETRY_CAPABILITY_REQUIRED');
  const job=this.startJob('build'),state=freeze(data(this.doc.state)),assets=new Map([...this.assets].map(([h,a])=>[h,new Uint8Array(a.bytes)]));let lease=null,owned=false,proposal=null;
  try{
   if(this.onlineSession){await this.preflight(job.epoch,job.abort.signal);this.jobGuard(job);}
   const response=await a.build({...this.jobControl(job),state,assets});
   if(response?.status==='parameters-proposal'){
    try{
     this.jobGuard(job);assertTicket(response,job.ticket);
     assert(typeof response.confirm==='function'&&typeof response.release==='function','GEOMETRY_PROPOSAL_ADAPTER');
     const head=freeze(data(response.head)),parameters=freeze(data(response.parameters)),description=data(response.changes);
     assert(await sha256(canonicalJSON({head,parameters}))===response.fingerprint,'GEOMETRY_PROPOSAL_CHANGED');
     const command={id:'parameters.set',args:{changes:parameters}},next=domainCommand(state,command).state,map=new Map(this.assets);
     const output={state:next,head,command},outputHash=await candidateHash(output,map);this.jobGuard(job);job.stage='geometry confirmation';
     await this.proposeOperation({kind:'geometry parameter change',control:this.jobControl(job),changes:description,outputHash,
      verify:()=>candidateHash(output,map),
      apply:async()=>{
       this.jobGuard(job);await response.confirm(this.jobControl(job));this.jobGuard(job);
       await this.enqueue(()=>{this.jobGuard(job);return this.edit(next,{type:'geometry.parameters',command,nativeHead:head},{assets:map,signal:job.abort.signal});});
       this.finishJob(job);return this.build(commit);
      },release:()=>{response.release();this.finishJob(job);}});
    }catch(e){if(e.code!=='PROPOSAL_REQUIRED')response.release?.();throw e;}
   }
   proposal=response?.status==='proposal'?response:null;lease=proposal?proposal.model:response;assert(lease&&typeof lease.release==='function','MODEL_LEASE');this.jobGuard(job);
   if(this.onlineSession){await this.preflight(job.epoch,job.abort.signal);this.jobGuard(job);}
   assert(lease.version===VERSION&&canonicalJSON(lease.ticket)===canonicalJSON(job.ticket)&&Number.isSafeInteger(lease.generation)&&lease.generation>0&&typeof lease.bytes==='function'&&lease.bytes() instanceof Uint8Array,'MODEL_TICKET');
   for(const k of ['widthMm','depthMm','heightMm','triangles','materialCount'])assert(Number.isFinite(lease.stats[k])&&lease.stats[k]>=0,'MODEL_STATS');
   assert(['pass','fail','unverified','unsupported'].includes(lease.stats.verdict)&&Array.isArray(lease.blocks),'MODEL_STATS');
   this.preview={job,record:this.retain(lease)};owned=true;job.stage='preview';this.emit();
   if(proposal){const outputHash=await sha256(lease.bytes());this.jobGuard(job);await this.proposeOperation({kind:'geometry approximation',control:this.jobControl(job),changes:proposal.changes,outputHash,verify:()=>sha256(lease.bytes()),apply:()=>this.promote(job.id),release:()=>{if(this.preview?.job===job)this.discardPreview();this.finishJob(job);}});}
   if(commit)await this.promote(job.id);return {ticketId:job.id};
  }catch(e){if(e.code==='PROPOSAL_REQUIRED')throw e;if(lease&&!owned)lease.release();if(owned&&this.preview?.job===job)this.discardPreview();this.finishJob(job);throw e;}
 }
 async promote(ticketId){
  assert(!this.pendingOperation,'PROPOSAL_REQUIRED');const p=this.preview;assert(p?.job.id===ticketId,'BUILD_PREVIEW_REQUIRED');this.jobGuard(p.job);
  if(this.onlineSession){await this.preflight(p.job.epoch,p.job.abort.signal);this.jobGuard(p.job);}
  assert(this.preview===p&&!this.pendingOperation,'STALE_JOB');
  this.adapters.viewport?.setModel({lease:p.record.lease,revision:p.job.ticket.revision,blocks:p.record.lease.blocks});
  const old=this.visible;this.visible=p.record;this.preview=null;this.workspaceStep=2;old?.release();this.emit();
  try{
   if(this.adapters.preparation?.qualifyModel){
    p.job.stage='Kiểm tra mô hình';this.emit();
    // The model is already promoted and drawn. A qualification that cannot
    // finish (watchdog, worker failure) leaves the verdict "unverified" and is
    // reported as a problem to review, not as a failed build: the command that
    // produced the model did succeed (Grok R-02).
    try{await this.adapters.preparation.qualifyModel({...this.jobControl(p.job),model:p.record.lease});}
    catch(e){if(p.job.abort.signal.aborted||!/^MESH_/.test(String(e?.code??'')))throw e;this.report(e);}
    this.jobGuard(p.job);assert(this.visible===p.record,'STALE_JOB');
   }
  }finally{this.finishJob(p.job);}
 }
 /** Derived data never creates a journal transaction. The shared controller job
  * makes preparation visible/cancellable and retires it on a newer command. */
 async prepareCurrent(){
  const a=this.adapters.preparation;if(!a?.prepare)return;
  assert(!this.job&&!this.pendingOperation&&!this.pendingChange,'PREPARATION_BUSY');
  const job=this.startJob('Chuẩn bị nguồn và cấu hình'),model=this.visible?.lease??null;
  try{
   if(this.onlineSession){await this.preflight(job.epoch,job.abort.signal);this.jobGuard(job);}
   if(this.adapters.printing){const printers=data(await this.adapters.printing.list());this.jobGuard(job);this.printers=printers;this.emit();}
   await a.prepare({...this.jobControl(job),state:freeze(data(this.doc.state)),assets:new Map([...this.assets].map(([h,a])=>[h,new Uint8Array(a.bytes)])),model});
   this.jobGuard(job);assert((this.visible?.lease??null)===model,'STALE_JOB');
  }catch(e){
   // A preparation retired by a newer job or by a session change is not a problem to show: each
   // adapter names its own cancellation (SOURCE_SVG_CANCELLED, RASTER_CANCELLED, …) and every one
   // of them means only that this job was aborted. The scheduler ignores CANCELLED (Grok F-03).
   if(job.abort.signal.aborted&&e?.code!=='PROPOSAL_REQUIRED')throw error('CANCELLED');
   throw e;
  }finally{this.finishJob(job);}
 }
 previewBuild(){return this.result(()=>this.build(false));}
 commitBuild(ticketId){return this.result(()=>this.promote(ticketId));}
 exportPlan(id){
  this.requireProject();const a=adapter(this.adapters.exporter),context=exportContext(this.doc.state,this.visible?.lease,capable(this.adapters.viewport,'viewport.webgl'));
  const declared=declaredFormats(a,context).find(f=>f.id===id);assert(declared,'UNSUPPORTED_EXPORTER');
  const option=gateExport(declared,{...context,projectId:this.projectId,canEdit:this.editingAllowed(),assets:this.assets});
  assert(option.enabled,option.reasonCode??'UNSUPPORTED_EXPORTER');
  // A source serializer cannot accidentally borrow a 3D model as its committed 2D snapshot.
  return {adapter:a,option,projectId:this.projectId,epoch:this.epoch,context:{...context,model:option.prerequisite==='committed-source'?null:context.model}};
 }
 assertExportPlan(plan){
  const live=this.exportPlan(plan.option.id);
  assert(live.projectId===plan.projectId&&live.epoch===plan.epoch&&live.context.state.revision===plan.context.state.revision,'STALE_REVISION');
  assert(live.option.prerequisite===plan.option.prerequisite,'EXPORT_REQUIREMENT_CHANGED');
  assert(live.context.model===plan.context.model,'STALE_REVISION');return live;
 }
 async exportFile(id){return this.result(async()=>{
  if(id==='raw-project'&&this.rawImport?.kind==='bytes'){await this.deliver(this.rawImport.bytes,'application/octet-stream',this.rawImport.name,new AbortController().signal);return;}
  if(['project','rescue-project','raw-project'].includes(id)){
   const projectId=id==='raw-project'&&this.rawImport?.projectId?this.rawImport.projectId:this.projectId;
   const rescue=rescueOption({projectId,canRescue:!!this.store?.status().canRescue});assert(rescue.enabled,rescue.reasonCode);
   const epoch=this.epoch,result=await exportRescuePackage(this.store,projectId);assert(epoch===this.epoch,'ACCESS_CHANGED');await this.deliver(result.bytes,'application/zip','project-'+projectId+'.arch-project.zip',new AbortController().signal);return;
  }
  if(id==='settings'){
   this.requireOnline();const epoch=this.epoch,apiEpoch=this.api.epoch,userId=this.api.userId;
   const r=await this.remote.read('/api/v1/settings/export');
   assert(epoch===this.epoch&&apiEpoch===this.api.epoch&&userId===this.api.userId&&!this.closed,'ACCESS_CHANGED');this.requireOnline();
   await this.deliver(utf8.encode(canonicalJSON(r)),'application/json','settings.json',new AbortController().signal);return;
  }
  const plan=this.exportPlan(id),record=plan.context.model?this.visible:null,a=plan.adapter;
  const job=this.startJob('export'),control=this.jobControl(job),assets=new Map([...this.assets].map(([hash,asset])=>[hash,new Uint8Array(asset.bytes)]));
  let prepared=null,proposalOwns=false;
  record?.acquire();
  try{
   if(this.onlineSession){await this.preflight(job.epoch,job.abort.signal);this.jobGuard(job);}
   this.assertExportPlan(plan);
   const reply=await a.export({...control,...plan.context,formatId:id,prerequisite:plan.option.prerequisite,assets});
   if(reply?.status==='prepared-proposal')prepared=reply;
   this.jobGuard(job);
   const capture=async r=>{
    assertTicket(r,job.ticket);const bytes=boundedBytes(r.bytes),name=fileName(r.filename);
    const receipt=await prepareExportReceipt({artifact:r,bytes,filename:name,format:plan.option,projectId:plan.projectId,revision:job.ticket.revision,inspection:exportOptionsFor(id,plan.context.state)?.inspection??false,now:this.now()});
    this.guard(job.epoch);this.assertExportPlan(plan);return {bytes,name,mimeType:r.mimeType,receipt};
   };
   const publish=async output=>{
    if(this.onlineSession)await this.preflight(job.epoch,job.abort.signal);
    this.guard(job.epoch);this.assertExportPlan(plan);assert(!job.abort.signal.aborted,'CANCELLED');
    await this.deliver(output.bytes,output.mimeType,output.name,job.abort.signal);
    this.guard(job.epoch);this.assertExportPlan(plan);assert(!job.abort.signal.aborted,'CANCELLED');
    this.recordExportReceipt(output.receipt);
   };
   const resume=async action=>{
    this.guard(job.epoch);this.assertExportPlan(plan);assert(!job.abort.signal.aborted,'CANCELLED');assert(!this.job,'JOB_BUSY');
    this.job=job;job.stage='export';job.progress=null;this.emit();
    try{return await action();}finally{this.finishJob(job);}
   };
   if(reply.status==='prepared-proposal'){
    assertTicket(reply,job.ticket);assert(/^[a-f0-9]{64}$/.test(reply.proposalHash)&&typeof reply.confirm==='function'&&typeof reply.release==='function','EXPORT_PROPOSAL_ADAPTER');
    const hash=reply.proposalHash;
    try{await this.proposeOperation({kind:'export conditioning',control,changes:reply.changes,outputHash:hash,
     verify:()=>{this.assertExportPlan(plan);assert(reply.proposalHash===hash,'PROPOSAL_OUTPUT_CHANGED');return hash;},
     apply:()=>resume(async()=>{await publish(await capture(await reply.confirm(control)));}),release:()=>reply.release()});
    }catch(e){if(e.code==='PROPOSAL_REQUIRED')proposalOwns=true;throw e;}
   }
   const output=await capture(reply.status==='proposal'?reply.artifact:reply);
   if(reply.status==='proposal'){
    this.jobGuard(job);
    await this.proposeOperation({kind:'export approximation',control,changes:reply.changes,outputHash:output.receipt.contentHash,
     verify:()=>{this.assertExportPlan(plan);return sha256(canonicalJSON(output.receipt.document));},apply:()=>resume(()=>publish(output))});
   }
   this.jobGuard(job);await publish(output);
  }finally{if(prepared&&!proposalOwns)prepared.release?.();record?.release();this.finishJob(job);}
 },'export:'+String(id));}

 clearExportReceipts(){this.exportReceipts.clear();this.receiptBytes=0;}
 recordExportReceipt(receipt){
  const bytes=utf8.encode(canonicalJSON(receipt.document));
  this.exportReceipts.set(receipt.view.id,{receipt,bytes});this.receiptBytes+=bytes.length;
  while(this.exportReceipts.size>50||this.receiptBytes>16*1024*1024){const [id,old]=this.exportReceipts.entries().next().value;this.exportReceipts.delete(id);this.receiptBytes-=old.bytes.length;}
  this.emit();
 }
 async downloadExportReceipt(id){
  this.requireProject();const record=this.exportReceipts.get(id);assert(record?.receipt.view.metadataAvailable,'EXPORT_RECEIPT_NOT_FOUND');
  const job=this.startJob('export receipt');
  try{if(this.onlineSession)await this.preflight(job.epoch,job.abort.signal);this.jobGuard(job);assert(this.exportReceipts.get(id)===record,'EXPORT_RECEIPT_NOT_FOUND');
   await this.deliver(record.bytes,'application/json','export-'+id+'.json',job.abort.signal);this.jobGuard(job);
  }finally{this.finishJob(job);}
 }

 async deliver(bytes,mimeType,filename,signal){assert(this.adapters.download?.save,'DOWNLOAD_ADAPTER_REQUIRED');assert(!signal.aborted,'CANCELLED');await this.adapters.download.save({bytes:new Uint8Array(bytes),mimeType,filename,signal});}
 attachViewport(element){
  const a=adapter(this.adapters.viewport),detach=a.attach(element);let detached=false;
  const release=()=>{if(detached)return;detached=true;try{detach();}finally{this.emit();}};
  try{if(this.visible)a.setModel({lease:this.visible.lease,revision:this.visible.lease.ticket.revision,blocks:this.visible.lease.blocks});a.setSelection(this.selection);this.emit();return release;}catch(e){release();throw e;}
 }
 pickMirrorDirectory(){
  // Keep this synchronous call before any await/queue to preserve user activation.
  try{this.requireProject();const a=adapter(this.adapters.mirror);assert(capable(a,'storage.mirror'),'MIRROR_UNSUPPORTED');const chosen=a.pickDirectory(),epoch=this.epoch;
   return this.result(async()=>{const info=await chosen;if(this.onlineSession)await this.preflight(epoch);this.guard(epoch);this.mirror=data(info);this.emit();});}
  catch(e){return Promise.resolve(this.report(e));}
 }
 async writeMirror(){
  if(!this.mirror)return;const epoch=this.epoch,id=this.projectId,revision=this.doc.state.revision,pkg=await exportRescuePackage(this.store,id);
  if(this.onlineSession)await this.preflight(epoch);this.guard(epoch);const backup=await this.adapters.mirror.write({projectId:id,revision,bytes:pkg.bytes,sha256:pkg.sha256});this.guard(epoch);this.library=this.library.map(x=>x.id===id?{...x,backup}:x);this.emit();
 }
}
