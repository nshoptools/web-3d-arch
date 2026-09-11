import * as domain from '../domain/index.mjs';
import {assert,error,data,uuid,canonicalJSON} from './common.mjs';
import {newDocument,validateState,validateDocument,verifyDocument,contentEdit,domainCommand,appendDocument,moveDocument,commitInventory,setParameter,DEFAULT_TEXT,productLabel} from './documents.mjs';
import {candidateHash} from './proposals.mjs';
import {configureExport} from './export-configuration.mjs';
import {declaredFormats,exportContext} from './export-policy.mjs';
import {PROJECT_MESSAGES,libraryReason} from './project-messages.mjs';
/** The product switch consent, in words: what type changes and which settings the new type resets. */
export function describeProductSwitch(from,to,diff){
 const label=id=>{try{return domain.getField(id)?.ui?.label??id;}catch{return id;}};
 const lines=['Loại sản phẩm: '+productLabel(from)+' → '+productLabel(to)+'.'];const seen=new Set();
 for(const x of diff??[]){const path=String(x.path??'');if(path==='/revision'||path==='/product')continue;
  // Parameters live under /parameters/common/<id> or /parameters/byProduct/<product>/<id>; the field id is what a person recognises.
  const m=/^\/parameters\/(?:common|byProduct\/[^/]+)\/([^/]+)/.exec(path);const text=m?'Thông số “'+label(m[1])+'” được đặt lại theo loại mới.':path.startsWith('/schedule')?'Lịch lớp in được đặt lại theo loại mới.':'Một thiết lập khác thay đổi theo loại mới.';
  if(!seen.has(text)){seen.add(text);lines.push(text);}}
 if(lines.length===1)lines.push('Không có thông số nào cần đặt lại; giá trị bạn đã chọn tay vẫn hợp lệ.');
 return lines.slice(0,200);
}
export const loadedAssets=loaded=>new Map((loaded.assets??[]).map(a=>[a.hash,{...a,bytes:new Uint8Array(a.bytes)}]));
/** Library row that cannot be listed: `code` is the machine identifier, `reason` a Vietnamese sentence.
 * `transient` marks a failed read (I/O, abort, lock) that is retried on the next refresh rather than cached. */
const libraryIssue=(row,e,transient)=>{const code=typeof e.code==='string'?e.code:(transient?'LIBRARY_READ_RETRY':'PROJECT_READ_ONLY');return {id:row.projectId,title:row.title,revision:row.revision,code,reason:libraryReason(code,transient),transient};};
export class ProjectOperations {
 async refreshLibrary(){
  if(!this.store)return;const epoch=this.epoch,store=this.store,rows=await store.listProjects({rescue:!store.status().canEdit}),entries=[],unrecognized=[];
  for(const row of rows){const cached=this.libraryCache.get(row.projectId);if(cached?.revision===row.revision){if(cached.entry)entries.push(cached.entry);if(cached.unknown)unrecognized.push(cached.unknown);continue;}
  let loaded;
  // A failed read says nothing about the stored data: report it, never cache it, retry on the next refresh.
  try{loaded=await store.load(row.projectId);}catch(e){unrecognized.push(libraryIssue(row,e,true));continue;}
  try{
   assert(loaded.status==='editable',loaded.reason??(loaded.status==='unrecoverable'?'PROJECT_UNRECOVERABLE':'PROJECT_READ_ONLY'));const d=validateDocument(loaded.manifest.document);
   const entry=d.state.content.app.deleted?null:{id:row.projectId,name:d.state.content.app.name,product:d.state.product,updatedAt:d.updatedAt??'',sizeBytes:loaded.manifest.assets.reduce((n,a)=>n+a.byteLength,0),backup:null};
   this.libraryCache.set(row.projectId,{revision:row.revision,entry});if(entry)entries.push(entry);
  }catch(e){const unknown=libraryIssue(row,e,false);this.libraryCache.set(row.projectId,{revision:row.revision,unknown});unrecognized.push(unknown);}}
  assert(epoch===this.epoch,'ACCESS_CHANGED');this.library=entries;this.unrecognizedProjects=unrecognized;this.emit();
 }
 async persist(candidate,{id=this.projectId,expectedRevision=this.headRevision,signal,epoch=this.epoch}={}){
  this.guard(epoch);const transactionId=uuid(),store=this.store;
  // Whether this commit changes the design. Every edit, undo/redo, delete and create bumps the state
  // revision or opens another id; recording the design as saved (project.save) keeps both.
  const designChanged=id!==this.projectId||!this.doc||candidate.document.state.revision!==this.doc.state.revision;
  const input={projectId:id,expectedRevision,transactionId,engine:this.adapters.engine?.identity??{id:'domain-only',version:'1'},domainSchemaVersion:1,document:{...candidate.document,title:candidate.document.state.content.app.name,controllerVersion:1,updatedAt:new Date(this.now()).toISOString()},assets:commitInventory(candidate.document,candidate.assets),provenance:{}};
  let ack;
  try{ack=await store.commit(input,{signal});}
  catch(e){
   if(epoch!==this.epoch)throw error('ACCESS_CHANGED');let loaded;try{loaded=await store.load(id);}catch{}
   if(loaded?.status==='editable'&&loaded.head.transactionId===transactionId&&canonicalJSON(loaded.manifest.document)===canonicalJSON(input.document)){
    ack={head:loaded.head};this.record({code:'COMMIT_ACK_RECOVERED',message:PROJECT_MESSAGES.COMMIT_ACK_RECOVERED,severity:'warning'});
   }else{if(e.code==='CONFLICT')await this.recordConflict({projectId:id,transactionId,expectedRevision,epoch,error:e});throw e;}
  }
  // The generation is durable now: reflect it locally before any lease/lock check may reject this call.
  assert(epoch===this.epoch&&!this.closed,'ACCESS_CHANGED');assert(ack.head,'COMMIT_ACK_INVALID');if(id!==this.projectId){this.projectContextGeneration++;this.clearExportReceipts();this.editorTool=null;}this.doc=validateDocument(input.document);const kept=new Set([...Object.keys(this.doc.history.assets),...(this.doc.retainedAssets??[])]);this.assets=new Map([...candidate.assets].filter(([h])=>kept.has(h)));
  for(const [hash,url]of this.urls)if(!kept.has(hash)){this.objectURLs.revokeObjectURL(url);this.urls.delete(hash);}this.projectId=id;this.headRevision=ack.head.revision;this.readOnly=false;
  // The acknowledged document/bytes were already verified by commit (or exact ack recovery).
  this.libraryCache.set(id,{revision:ack.head.revision,entry:this.doc.state.content.app.deleted?null:{id,name:this.doc.state.content.app.name,product:this.doc.state.product,updatedAt:this.doc.updatedAt,sizeBytes:input.assets.reduce((n,a)=>n+a.bytes.byteLength,0),backup:null}});
  if(candidate.pruned?.length)this.truncated=true;
  // A changed design retires what was computed or asked about the previous one: the running job, the
  // preview, the pending consent and the selection. A save that changes nothing about the design keeps
  // them (audit F-02: "Lưu dự án" on the busy card cancelled the very build it sat next to and left the
  // model "chưa kiểm"); a pending consent pinned to the head just replaced moves to the new head, since
  // it still asks the same question about the same design.
  if(designChanged){this.pendingChange=null;this.discardProposal();this.job?.abort.abort();this.discardPreview();this.selection=null;}
  else for(const pending of [this.pendingChange,this.pendingOperation])if(pending&&pending.headRevision===expectedRevision)pending.headRevision=ack.head.revision;
  if(ack.supersededRetained)this.record({code:'SUPERSEDED_GENERATION_RETAINED',message:PROJECT_MESSAGES.SUPERSEDED_GENERATION_RETAINED,severity:'warning',detail:'Bản '+ack.supersededRetained.revision+' được giữ lại với mã '+ack.supersededRetained.transactionId+'.'});
  this.emit();
  try{this.guard(epoch);}
  catch(e){
   // Durable commit, then the lease/lock check failed: local state already matches storage, so say so instead of implying a rollback.
   this.record({code:'COMMIT_DURABLE_BEFORE_LOCK',message:PROJECT_MESSAGES.COMMIT_DURABLE_BEFORE_LOCK,severity:'warning'});
   e.details={...(e.details??{}),committed:true,headRevision:ack.head.revision};this.emit();throw e;
  }
  try{await this.refreshLibrary();}catch(e){this.report(e);}return ack;
 }
 async recordConflict({projectId,transactionId,expectedRevision,epoch,error:e}){
  // The losing candidate only duplicates this session's in-memory change; release its pins so it never holds
  // storage. The CONFLICT diagnostic tells the person to reopen the project. A failed discard keeps the candidate rescuable.
  let candidateDiscarded=false;
  try{if(epoch===this.epoch&&typeof this.store?.discardPending==='function'){await this.store.discardPending(transactionId);candidateDiscarded=true;}}catch{}
  this.conflicts=this.conflicts.concat({projectId,transactionId,expectedRevision,currentRevision:e.details?.currentHead?.revision??null,candidateDiscarded});this.emit();
 }
 async edit(state,command,{acceptPruning=false,assets=this.assets,signal}={}){
  this.requireProject();const base=this.doc,head=this.headRevision,epoch=this.epoch;
  try{const candidate=await appendDocument(base,state,assets,command,{acceptPruning});this.guard(epoch);assert(this.doc===base,'STALE_PROJECT');await this.persist(candidate,{expectedRevision:head,epoch,signal});}
  catch(e){if(e.code==='HISTORY_PRUNING_REQUIRED'){const pending={id:uuid(),epoch,projectId:this.projectId,headRevision:head,revision:base.state.revision,command:data(command),state,assets:new Map(assets),kind:'edit',acceptPruning:true,outputHash:await candidateHash({state,command},assets)};this.guard(epoch);this.pendingChange=pending;this.emit();}throw e;}
 }
 acceptChange({proposalId,consent}){return this.result(async()=>{
  const p=this.pendingChange;assert(consent===true&&p?.id===proposalId,'STALE_CONFIRMATION');
  assert(!p.accepting,'APPROVAL_IN_PROGRESS');p.accepting=true;this.acceptingProposal=p;
  try{return await this.enqueue(async()=>{
   this.requireProject();assert(this.pendingChange===p&&p.epoch===this.epoch&&p.projectId===this.projectId&&p.headRevision===this.headRevision&&p.revision===this.doc.state.revision,'STALE_CONFIRMATION');
   assert(await candidateHash(p.kind==='move'?{document:this.doc,direction:p.direction}:{state:p.state,command:p.command},p.assets??this.assets)===p.outputHash,'PROPOSAL_OUTPUT_CHANGED');
   this.guard(p.epoch);assert(this.pendingChange===p&&p.headRevision===this.headRevision&&p.revision===this.doc.state.revision,'STALE_CONFIRMATION');
   if(p.kind==='move')await this.persist(await moveDocument(this.doc,this.assets,p.direction,{acceptPruning:true}),{epoch:p.epoch});
   else await this.edit(p.state,p.command,{acceptPruning:p.acceptPruning,assets:p.assets});
  });}finally{p.accepting=false;if(this.acceptingProposal===p)this.acceptingProposal=null;}
 });}
 async open(id){
  this.guard();const epoch=this.epoch;if(this.onlineSession)await this.preflight(epoch);const loaded=await this.store.load(id);this.guard(epoch);assert(loaded.status!=='empty','PROJECT_NOT_FOUND');
  if(loaded.status!=='editable'){this.rawImport={kind:'stored',projectId:id};throw error(loaded.reason??'PROJECT_READ_ONLY');}
  const assets=loadedAssets(loaded);let doc;try{doc=await verifyDocument(loaded.manifest.document,assets);}catch(e){this.rawImport={kind:'stored',projectId:id};throw e;}
  doc.retainedAssets=[...new Set([...(doc.retainedAssets??[]),...loaded.manifest.dependencies.filter(h=>!Object.hasOwn(doc.history.assets,h))])];
  assert(!doc.state.content.app.deleted,'PROJECT_DELETED');if(this.onlineSession)await this.preflight(epoch);this.guard(epoch);
  this.job?.abort.abort();this.discardProposal();this.discardPreview();this.clearVisible();this.clearExportReceipts();this.projectContextGeneration++;this.doc=doc;this.assets=assets;this.projectId=id;this.headRevision=loaded.headRevision;this.selection=null;this.editorTool=null;this.readOnly=false;this.pendingChange=null;
  if(loaded.recoveredPrevious){
   const head=loaded.head?.revision,opened=loaded.manifest?.revision;
   this.record({code:'RECOVERED_PREVIOUS',message:PROJECT_MESSAGES.RECOVERED_PREVIOUS,severity:'warning',
    ...(Number.isInteger(head)?{detail:'Bản lưu '+head+' không đọc được'+(Number.isInteger(opened)?'; đã mở bản '+opened:'')+'.'}:{})});
  }
  this.emit();
 }
 dispatch(command){return this.result(async()=>{
  assert(command&&typeof command.type==='string','COMMAND_REQUIRED');
  // Choosing a tool changes what the next gesture does, not the design: it is held like the workspace step,
  // so it never bumps the revision, adds an undo entry or makes the built model stale (audit RO-03).
  if(command.type==='editor.tool'){this.requireProject();assert(['paint','line','curve','erase','cut','crop','heal'].includes(command.tool),'EDITOR_SCHEMA');this.editorTool=command.tool;this.emit();return;}
  if(command.type==='proposal.discard'){this.discardPendingProposal(command.id);return;}
  if(command.type==='proposal.accept'&&this.pendingOperation){await this.acceptOperation(command.id,command.confirmed);return;}
  if(command.type==='text.update'&&this.doc&&(command.values?.asSource??this.doc.state.content.app.text.asSource)===true&&this.adapters.productTransactions){await this.adoptTextSource(data(command));return;}
  if(command.type==='text.remove'&&this.doc?.state.content.app.text.asSource){await this.enqueue(()=>this.edit(contentEdit(this.doc.state,(a,n)=>{a.text=data(DEFAULT_TEXT);a.source=null;n.sourceKind='none';}),data(command)));return;}
  if(command.type==='source.convert'){await this.convertSource(command.target);return;}
  if(command.type==='proposal.accept'){const r=await this.acceptChange({proposalId:command.id,consent:command.confirmed});if(!r.ok)throw Object.assign(error(r.diagnostic.code),{confirmation:r.confirmation});return;}
  if(command.type==='job.cancel'){assert(this.job?.id===command.id,'JOB_NOT_FOUND');const job=this.job;job.abort.abort();this.discardProposal();this.discardPreview();this.finishJob(job);return;}
  if(command.type==='geometry.build'){await this.build(true);return;}
  if(command.type==='mesh.apply'){await this.applyMesh(command);return;}
  if(command.type.startsWith('printer.profile-')){
   this.requireOnline();
   const profileEpoch=this.epoch,profileUser=this.api.userId;
   if(command.type==='printer.profile-accept')await this.profileLibrary.accept(command.id,command.confirmed);
   else if(command.type==='printer.profile-delete')await this.profileLibrary.remove(command);
   else if(command.type==='printer.profile-export')await this.profileLibrary.exportFile(command);
   else throw error('COMMAND_UNSUPPORTED');
   assert(profileEpoch===this.epoch&&profileUser===this.api.userId&&!this.closed,'ACCESS_CHANGED');
   if(command.type!=='printer.profile-export'){this.pendingChange=null;this.discardProposal();this.job?.abort.abort();this.discardPreview();this.emit();}
   return;
  }
  if(command.type==='export.receipt'){await this.downloadExportReceipt(command.id);return;}
  if(command.type==='project.step'){this.requireProject();assert(command.step===1||command.step===2,'PROJECT_STEP');assert(command.step===1||this.visible,'MODEL_REQUIRED');this.workspaceStep=command.step;this.emit();return;}
  if(command.type==='viewport.action'){this.requireProject();assert(this.adapters.viewport,'VIEWPORT_REQUIRED');const proposal=await this.adapters.viewport.action(command.action);if(proposal)this.placementProposal=data(proposal);this.emit();return;}
  if(command.type==='selection.set'){this.requireProject();assert(command.blockId===null||this.visible?.lease.blocks.some(b=>b.id===command.blockId),'BLOCK_NOT_FOUND');this.adapters.viewport?.setSelection(command.blockId);this.selection=command.blockId;this.emit();return;}
  if(command.type.startsWith('ai.')||command.type.startsWith('settings.')||command.type==='policy.update'||command.type==='emoji.favorite'){this.requireOnline();await this.networkCommand(command);if(command.type.startsWith('settings.')||command.type==='policy.update'){this.pendingChange=null;this.discardProposal();this.job?.abort.abort();this.discardPreview();this.emit();}return;}
  if(this.adapters.productTransactions?.handles({state:this.doc?.state,command})){await this.productCommand(data(command));return;}
  await this.enqueue(()=>this.projectCommand(data(command)));
 },'command:'+String(command?.type??''));}
 async projectCommand(c){
  const epoch=this.epoch;
  if(c.type==='project.create'){this.guard();const candidate=await newDocument(c.product);await this.persist(candidate,{id:uuid(),expectedRevision:0,epoch});this.guard(epoch);this.clearVisible();this.emit();return;}
  if(c.type==='project.open'){await this.open(c.id);return;}
  if(c.type==='project.delete'){
   this.guard();assert(c.confirmed===true,'CONFIRMATION_REQUIRED');const loaded=await this.store.load(c.id);assert(loaded.status==='editable','PROJECT_READ_ONLY');const assets=loadedAssets(loaded),d=await verifyDocument(loaded.manifest.document,assets);
   const next=contentEdit(d.state,a=>{a.deleted=true;}),candidate=await appendDocument(d,next,assets,c);
   this.guard(epoch);if(c.id===this.projectId){await this.persist(candidate,{epoch});this.guard(epoch);this.clearVisible();this.clearExportReceipts();this.doc=null;this.projectId='';this.headRevision=0;this.assets=new Map();this.emit();}
   else{await this.store.commit({projectId:c.id,expectedRevision:loaded.headRevision,engine:loaded.manifest.engine,domainSchemaVersion:1,document:candidate.document,assets:commitInventory(candidate.document,candidate.assets)});this.guard(epoch);await this.refreshLibrary();}
   return;
  }
  this.requireProject();const s=this.doc.state;
  if(c.type==='project.save'){await this.persist({document:{...this.doc,savedRevision:s.revision},assets:this.assets},{epoch});this.guard(epoch);await this.writeMirror();return;}
  if(c.type==='history.undo'||c.type==='history.redo'){
   const direction=c.type.slice(8);try{await this.persist(await moveDocument(this.doc,this.assets,direction),{epoch});}
   catch(e){if(e.code==='HISTORY_PRUNING_REQUIRED'){const pending={id:uuid(),kind:'move',direction,epoch,projectId:this.projectId,headRevision:this.headRevision,revision:s.revision,outputHash:await candidateHash({document:this.doc,direction},this.assets)};this.guard(epoch);this.pendingChange=pending;this.emit();}throw e;}return;
  }
  if(c.type==='preset.save'){
   this.requireOnline();assert(typeof c.name==='string'&&c.name.length>0&&c.name.length<=200,'PRESET_NAME');
   const presets=this.remote.settings?.values.presets??[];assert(presets.length<20,'PRESET_BUDGET');
   await this.remote.settingsUpdate({presets:[...presets,{kind:'app-preset',version:1,id:uuid(),name:c.name,product:s.product,parameters:s.parameters,schedule:s.schedule}]});return;
  }
  if(c.type==='preset.delete'){this.requireOnline();assert(c.confirmed,'CONFIRMATION_REQUIRED');const presets=this.remote.settings?.values.presets??[];assert(presets.some(p=>p.id===c.id),'PRESET_NOT_FOUND');await this.remote.settingsUpdate({presets:presets.filter(p=>p.id!==c.id)});return;}
  let next;
  switch(c.type){
   case 'export.configure':{
    const formats=declaredFormats(this.adapters.exporter,exportContext(s,this.visible?.lease,false));
    assert(formats.some(f=>f.id===c.id),'UNSUPPORTED_EXPORTER');
    const configuration=configureExport(s,c);if(configuration===null)return;
    next=contentEdit(s,a=>{a.exportOptions=configuration;});break;
   }
   case 'project.rename':next=contentEdit(s,a=>{a.name=c.name;});break;
   case 'project.product':{
    const p=domainCommand(s,{id:'product.switch',args:{product:c.product}});
    if(!c.confirmed&&c.product!==s.product){const id=uuid();const pending={id,kind:'edit',epoch,projectId:this.projectId,headRevision:this.headRevision,revision:s.revision,state:p.state,command:c,assets:new Map(this.assets),acceptPruning:false,outputHash:await candidateHash({state:p.state,command:c},this.assets)};this.guard(epoch);this.pendingChange=pending;this.emit();const e=error('PRODUCT_CONFIRMATION_REQUIRED');e.confirmation={title:'Đổi loại sản phẩm',changes:describeProductSwitch(s.product,c.product,p.diff),retry:{type:'proposal.accept',id,confirmed:true}};throw e;}
    next=p.state;break;
   }
   case 'parameter.set':next=setParameter(s,c.id,c.value);break;
   case 'parameter.reset':next=c.id==='layerH'?domainCommand(s,{id:'schedule.set',args:{layerHeight:0.2}}).state:domainCommand(s,{id:'parameters.reset',args:{ids:[c.id]}}).state;break;
   case 'source.remove':next=contentEdit(s,(a,n)=>{a.source=null;n.sourceKind='none';});break;
   case 'text.update':next=contentEdit(s,a=>{a.text={...a.text,...data(c.values)};});break;
   case 'text.remove':next=contentEdit(s,a=>{a.text=data(DEFAULT_TEXT);});break;
   case 'editor.settings':next=contentEdit(s,a=>{a.editor={...a.editor,...data(c.values)};});break;
   case 'material.update':next=contentEdit(s,a=>{const m=a.materials.find(m=>m.id===c.id);assert(m,'MATERIAL_NOT_FOUND');for(const k of ['color','slot','excluded','heightLayers'])if(Object.hasOwn(c,k))m[k]=k==='heightLayers'?domain.parseDecimal(c[k]).value:c[k];m.overridden=true;m.slotOverridden=Object.hasOwn(c,'slot')?true:m.slotOverridden??false;});break;
   case 'material.reset':next=contentEdit(s,a=>{const i=a.materials.findIndex(m=>m.id===c.id),original=a.materialDefaults.find(m=>m.id===c.id);assert(i>=0&&original,'MATERIAL_NOT_FOUND');a.materials[i]=data(original);});break;
   case 'printer.select':assert(this.printers.some(p=>p.id===c.id),'PRINTER_NOT_FOUND');next=contentEdit(s,a=>{a.printerId=c.id;});break;

   case 'preset.apply':{const p=(this.remote.settings?.values.presets??[]).find(p=>p.id===c.id);assert(p?.kind==='app-preset'&&p.version===1,'PRESET_VERSION');assert(c.confirmed===true,'CONFIRMATION_REQUIRED');next=validateState({...data(s),product:p.product,parameters:data(p.parameters),schedule:data(p.schedule),revision:s.revision+1});break;}
   default:throw error('COMMAND_UNSUPPORTED');
  }
  await this.edit(next,c);
 }
 async networkCommand(c){
  switch(c.type){
   case 'settings.update':return this.remote.settingsUpdate(c.values);
   case 'settings.import':return this.remote.importSettings(c.mode,c.document,c.confirmed);
   case 'settings.reset':return this.remote.resetSettings(c.confirmed);
   case 'policy.update':return this.remote.updatePolicy(c.version,c.document,c.confirmed);
   case 'ai.budget':return this.remote.setBudget(c);
   case 'ai.cancel':return this.remote.cancel(c.jobId);
   case 'ai.close-unknown':return this.remote.closeUnknown(c.jobId,c.reason,c.confirmed);
   case 'ai.apply-result':assert(c.confirmed===true,'CONFIRMATION_REQUIRED');return this.sourceJob(async control=>({file:await this.remote.artifact(c.artifactId,control.signal)}),'source');
   case 'emoji.favorite':{const f=data(this.remote.settings?.values.favorites??[]).filter(x=>!(x.id===c.id&&x.collectionId===c.collectionId));if(c.favorite)f.push({id:c.id,collectionId:c.collectionId});return this.remote.settingsUpdate({favorites:f});}
   default:throw error('COMMAND_UNSUPPORTED');
  }
 }
 async queryPresets(product){domain.assertProduct(product);return (this.remote.settings?.values.presets??[]).filter(p=>p.product===product&&p.kind==='app-preset'&&p.version===1).map(p=>({id:p.id,name:p.name,product:p.product,custom:true}));}
}
