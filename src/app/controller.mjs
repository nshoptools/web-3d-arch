import {openProjectStore,historyCost} from '../storage/index.mjs';
import {ApiClient,verifyOnlineLease,isVerifiedLease} from './http.mjs';
import {AuthenticatedOnlineSession} from './session-policy.mjs';
import {RemoteServices,userView} from './remote.mjs';
import {VERSION,assert,error,data,freeze,diagnostic,adapter,capable,sameOrigin,moneyText} from './common.mjs';
import {parameterViews,DEFAULT_EDITOR,DEFAULT_TEXT} from './documents.mjs';
import {ProjectOperations} from './projects.mjs';
import {JobOperations} from './jobs.mjs';
import {MeshTransactionOperations} from './mesh-transactions.mjs';
import {ProductTransactionOperations} from './product-transactions.mjs';
import {SourceOperations} from './sources.mjs';
import {ProposalOperations} from './proposals.mjs';
import {exportContext,declaredFormats,gateExport,rescueOption,settingsOption} from './export-policy.mjs';
import {exportConfigurationView} from './export-configuration.mjs';
import {createPrinterProfileLibrary} from './printer-profiles.mjs';
const cap=(id,available,reason)=>({id,available:!!available,...(!available?{reason:typeof reason==='string'&&reason.trim()?reason:'Bản dựng hiện tại chưa cung cấp chức năng này.'}:{})});
export function createAppController(options){return new AppController(options);}
export class AppController {
 constructor({origin,deviceId,adapters={},fetchImpl,storeFactory=openProjectStore,clock=Date.now,deviceMode='private',navigate=url=>globalThis.location.assign(url),objectURLs=globalThis.URL,storagePolicy={},leasePolicy='signed-offline',allowAuthenticatedLeaseResponse=false}){
  assert(['signed-offline','allow-authenticated-online'].includes(leasePolicy),'LEASE_POLICY');
  assert(!allowAuthenticatedLeaseResponse,'EXPLICIT_LEASE_POLICY_REQUIRED');
  assert(typeof deviceId==='string','DEVICE_REQUIRED');assert(['private','shared'].includes(deviceMode),'DEVICE_MODE');
  Object.assign(this,{origin,deviceId,adapters,storeFactory,clock,navigate,objectURLs,leasePolicy});
  this.offset=0;this.lastNow=0;this.timeAnchor=this.clock();this.clockMark=globalThis.performance.now();this.resetBarrier=Promise.resolve();this.storagePolicy={backend:'prefer-opfs',allowIDBFallback:true,fallbackWhen:['unsupported','verification-failed'],...storagePolicy};
  this.onlineSession=null;this.listeners=new Set();this.epoch=0;this.version=0;this.queue=Promise.resolve();this.store=null;this.doc=null;this.assets=new Map();this.projectId='';this.headRevision=0;
  this.session={status:'checking',user:null,deviceMode};this.workspaceStep=1;this.online=true;this.diagnostics=[];this.library=[];this.libraryCache=new Map();this.unrecognizedProjects=[];this.printers=[];this.selection=null;this.job=null;this.generation=0;this.visible=null;this.preview=null;this.pendingChange=null;this.urls=new Map();this.closed=false;this.readOnly=false;this.rawImport=null;this.conflicts=[];this.truncated=false;
  this.exportReceipts=new Map();this.receiptBytes=0;this.projectContextGeneration=0;
  this.storageEstimate={usedBytes:0,quotaBytes:null,estimate:true,warning:'Chưa ước tính được dung lượng lưu trữ.'};
  this.api=new ApiClient({origin,fetchImpl,onAuthLost:()=>this.invalidate('expired',{rescue:!!this.onlineSession}),
   onAccessFailure:()=>this.onlineSession?this.invalidate('expired',{rescue:true}):undefined});
  this.remote=new RemoteServices(this.api,{notify:()=>this.emit(),context:()=>this.doc?{id:this.projectId,revision:this.doc.state.revision}:null,now:()=>this.now()});
  this.profileLibrary=createPrinterProfileLibrary({
   context:()=>this.online&&this.session.status==='signed-in'&&this.api.userId?{userId:this.api.userId,epoch:this.epoch,settings:this.remote.settings,etag:this.remote.settingsETag}:null,
   preflight:async(capture,signal)=>{this.requireOnline();if(this.onlineSession)await this.onlineSession.preflight(signal);this.requireOnline();assert(this.epoch===capture.epoch&&!this.closed,'PROFILE_SETTINGS_CHANGED');},
   write:(values,capture)=>{this.requireOnline();assert(this.epoch===capture.epoch&&this.api.userId===capture.userId&&this.remote.settings===capture.settings&&this.remote.settingsETag===capture.etag,'PROFILE_SETTINGS_CHANGED');return this.remote.settingsUpdate(values);},
   download:result=>this.deliver(result.bytes,result.mimeType,result.filename,result.signal),onChange:()=>this.emit()});
  this.snapshot=this.makeSnapshot();
 }
 now(){this.lastNow=Math.max(this.lastNow,Math.floor(this.clock()+this.offset),Math.floor(this.timeAnchor+Math.max(0,globalThis.performance.now()-this.clockMark)));return this.lastNow;}
 emit(){this.version++;this.snapshot=this.makeSnapshot();for(const f of [...this.listeners]){try{f();}catch{}}void this.profileLibrary?.refresh().catch(()=>{});}
 subscribe(f){assert(typeof f==='function','LISTENER');this.listeners.add(f);return ()=>this.listeners.delete(f);}
 getSnapshot(){return this.snapshot;}
 report(e){if(e.code==='HISTORY_PRUNING_REQUIRED'&&this.pendingChange)e.confirmation={title:'Giảm lịch sử được giữ lại',changes:['Giữ bản chụp hiện tại; cắt bớt các giao dịch cũ nhất để về trong hạn mức.'],retry:{type:'proposal.accept',id:this.pendingChange.id,confirmed:true}};const d=diagnostic(e);this.diagnostics=this.diagnostics.slice(-19).concat(d);this.emit();return {ok:false,diagnostic:d,...(e.confirmation?{confirmation:e.confirmation}:{})};}
 async result(fn){try{const value=await fn();return {ok:true,...value};}catch(e){try{await this.resetBarrier;}catch(reset){return this.report(reset);}return this.report(e);}}
 enqueue(fn){const epoch=this.epoch;const p=this.queue.then(()=>{assert(epoch===this.epoch&&!this.closed,'ACCESS_CHANGED');if(this.onlineSession)return this.preflight(epoch).then(()=>{this.guard(epoch);return fn();});return fn();});this.queue=p.catch(()=>{});return p;}
 editingAllowed(){const s=this.store?.status();return !!s&&!this.readOnly&&s.canEdit&&!s.writeBlocked&&!s.capabilities.database.readOnly;}
 guard(epoch=this.epoch){assert(epoch===this.epoch&&!this.closed,'ACCESS_CHANGED');if(!this.editingAllowed()){
   if(this.onlineSession&&this.store)this.invalidate('expired',{rescue:true});
   throw error('PROJECT_LOCKED');
  }
 } 
 async preflight(epoch=this.epoch,signal){
  assert(epoch===this.epoch&&!this.closed,'ACCESS_CHANGED');
  if(this.onlineSession)await this.onlineSession.preflight(signal);
  this.guard(epoch);
 }
 requireProject(){this.guard();assert(this.doc,'PROJECT_REQUIRED');}
 requireOnline(){assert(this.online&&this.session.status==='signed-in'&&this.api.userId,'AUTH_REQUIRED');}
 async initialize(){return this.result(async()=>{
  this.invalidate('checking');const epoch=this.epoch;let opened=null;
  try{
   await this.resetBarrier;assert(epoch===this.epoch&&!this.closed,'ACCESS_CHANGED');
   const fresh=this.leasePolicy==='allow-authenticated-online';
   const meResponse=await this.api.request('/api/v1/me',{fresh}),me=meResponse.value;
   assert(me.deviceId===this.deviceId,'DEVICE_MISMATCH');this.api.bind(me);
   this.offset=me.serverTime-this.clock();this.lastNow=me.serverTime;this.timeAnchor=me.serverTime;this.clockMark=globalThis.performance.now();
   const leaseResponse=await this.api.request('/api/v1/offline/lease',{method:'POST',body:{deviceId:this.deviceId},fresh});
   let proof=null,online=null;
   try{proof=await verifyOnlineLease(leaseResponse.value,me,{onCapability:value=>{this.leaseCapability=value;}});}
   catch(e){
    if(e.code!=='LEASE_SIGNATURE_UNSUPPORTED'||!fresh)throw e;
    online=new AuthenticatedOnlineSession(this,me,this.api.consumeOnlineExchange(meResponse,leaseResponse));
   }
   assert(epoch===this.epoch,'ACCESS_CHANGED');this.online=true;this.onlineSession=online;
   opened=await this.storeFactory({userId:me.user.id,deviceId:this.deviceId,now:()=>this.now(),policy:this.storagePolicy});
   assert(epoch===this.epoch,'ACCESS_CHANGED');
   if(online){assert(typeof opened.unlockOnline==='function','ONLINE_STORAGE_REQUIRED');await opened.unlockOnline(online.grant());
    this.leaseCapability={signature:'unsupported',reason:'NotSupportedError',trust:'authenticated-online'};
   }else await opened.unlock(proof);
   assert(epoch===this.epoch,'ACCESS_CHANGED');this.store=opened;opened=null;
   this.session={...this.session,status:'signed-in',user:userView(me.user)};this.emit();await this.remote.refresh();
   if(this.adapters.printing){adapter(this.adapters.printing);const printers=data(await this.adapters.printing.list());assert(epoch===this.epoch,'ACCESS_CHANGED');this.printers=printers;}
   await this.refreshLibrary();await this.estimate();assert(epoch===this.epoch,'ACCESS_CHANGED');this.emit();
  }catch(e){
   opened?.close();
   if(epoch===this.epoch){
    const capability=this.leaseCapability;
    this.invalidate(e.status===401?'signed-out':'expired',{rescue:!!this.session.user&&!!this.onlineSession});
    if(e.code==='LEASE_SIGNATURE_UNSUPPORTED'){this.leaseCapability=capability;this.emit();}
   }else if(e.status===401&&epoch+1===this.epoch&&this.session.status==='expired'&&!this.session.user){this.session.status='signed-out';this.emit();}
   await this.resetBarrier;
   if(e.status===401)return;
   throw e;
  }
 });}
 resumeOffline({user,verifiedLease}){return this.result(async()=>{
  assert(isVerifiedLease(verifiedLease),'OFFLINE_PROOF_REQUIRED');
  this.invalidate('signed-out');const epoch=this.epoch;await this.resetBarrier;assert(epoch===this.epoch,'ACCESS_CHANGED');assert(verifiedLease?.userId===user?.id&&verifiedLease?.deviceId===this.deviceId,'LEASE_IDENTITY');
  const store=await this.storeFactory({userId:user.id,deviceId:this.deviceId,now:()=>this.now(),policy:this.storagePolicy});await store.unlock(verifiedLease);if(epoch!==this.epoch){store.close();throw error('ACCESS_CHANGED');}
  this.store=store;this.online=false;this.session={...this.session,user:data(user),status:store.status().canEdit?'offline-lease':'expired'};await this.refreshLibrary();this.emit();
 });}
 invalidate(status='signed-out',{rescue=false}={}){
  this.profileLibrary?.reset();
  const keep=!!(rescue&&this.onlineSession&&this.session.user&&this.store?.status().canRescue);
  const saved=keep?{store:this.store,user:this.session.user,id:this.projectId,head:this.headRevision}:null;
  this.discardProposal();this.clearExportReceipts();this.epoch++;
  if(keep)this.onlineSession.suspend(this.epoch);else{this.onlineSession?.close();this.onlineSession=null;this.leaseCapability=null;}
  this.api?.reset();this.remote?.clear();this.job?.abort.abort();this.job=null;this.discardPreview();this.clearVisible();if(keep)this.store.suspend();else this.store?.close();this.store=null;
  const resets=[this.resetBarrier],invoke=(a,fn)=>{try{resets.push(fn.call(a));}catch(e){resets.push(Promise.reject(e));}};
  if(this.adapters.reset)invoke(this.adapters,this.adapters.reset);else for(const a of Object.values(this.adapters)){const fn=a?.reset??a?.clearPrivateState??a?.dispose;if(fn)invoke(a,fn);}
  this.resetBarrier=Promise.allSettled(resets).then(results=>{assert(results.every(r=>r.status==='fulfilled'),'PRIVATE_RESET_FAILED');});this.resetBarrier.catch(()=>{});
  this.doc=null;this.assets=new Map();this.projectId='';this.headRevision=0;this.workspaceStep=1;this.library=[];this.libraryCache.clear();this.unrecognizedProjects=[];this.printers=[];this.pendingChange=null;this.rawImport=null;this.selection=null;this.conflicts=[];this.readOnly=false;this.mirror=null;
  for(const url of this.urls.values())this.objectURLs.revokeObjectURL(url);this.urls.clear();this.session={...this.session,status,user:null};
  if(saved){this.store=saved.store;this.projectId=saved.id;this.headRevision=saved.head;this.readOnly=true;this.session.user=saved.user;}
  this.emit();return this.resetBarrier;
 }
 setOnline(online){this.online=!!online;
  if(!online&&this.onlineSession){void this.invalidate('expired',{rescue:true});return;}
  if(!online&&this.session.user)this.session={...this.session,status:this.store?.status().canEdit?'offline-lease':'expired'};this.emit();}
 async estimate(){try{const v=await globalThis.navigator?.storage?.estimate();if(v)this.storageEstimate={usedBytes:v.usage??0,quotaBytes:v.quota??null,estimate:true};}catch{}}
 signIn(options={}){return this.result(async()=>{
  const r=await this.api.request('/api/v1/auth/start',{method:'POST',authStart:true,body:{deviceId:this.deviceId,...(options.inviteToken?{inviteToken:options.inviteToken}:{}),...(options.reauthenticate?{reauth:true}:{})}});
  const raw=r.value.authorizationUrl;assert(typeof raw==='string'&&raw.length<=8192,'OIDC_REDIRECT_INVALID');let url;try{url=new URL(raw);}catch{throw error('OIDC_REDIRECT_INVALID');}
  assert(url.protocol==='https:'&&!url.username&&!url.password&&!url.hash,'OIDC_REDIRECT_INVALID');this.navigate(url.href);
 });}
 signOut(options={}){return this.result(async()=>{
  if(options.eraseLocal){assert(options.confirmed===true,'CONFIRMATION_REQUIRED');assert(this.adapters.purge?.eraseUser,'LOCAL_PURGE_ADAPTER_REQUIRED');}
  const user=this.session.user;try{if(this.api.userId)await this.api.request('/api/v1/logout',{method:'POST',body:{}});}finally{this.invalidate('signed-out');}
  if(options.eraseLocal&&user)await this.adapters.purge.eraseUser({userId:user.id,deviceId:this.deviceId});
 });}
 connectAI(id,secret){return this.result(()=>{this.requireOnline();return this.remote.connect(id,secret);});}
 disconnectAI(id){return this.result(()=>{this.requireOnline();return this.remote.disconnect(id);});}
 prepareImage(r){return this.result(async()=>{this.requireOnline();this.requireProject();return {quote:await this.remote.prepare(r)};});}
 submitImage(r){return this.result(()=>{this.requireOnline();return this.remote.submit(r);});}
 queryAIJobs(f){this.requireOnline();return this.remote.queryJobs(f);}
 listUsers(){this.requireOnline();return this.remote.listUsers();}
 inviteUser(v){return this.result(async()=>{this.requireOnline();return {inviteUrl:await this.remote.invite(v)};});}
 updateUser(id,v){return this.result(()=>{this.requireOnline();return this.remote.updateUser(id,v);});}
 makeSnapshot(){
  const s=this.doc?.state,a=s?.content.app,canEdit=this.editingAllowed(),r=a?.source?.raster,p=a?.source?.preview,display=r??p,cost=this.doc?historyCost(this.doc.history):null;
  const current=this.visible?.lease,matching=!!current&&current.ticket.projectId===this.projectId&&current.ticket.revision===s?.revision;
  const providers=this.remote?.registry()??[],printer=this.printers.find(p=>p.id===a?.printerId);
  const source=a?.source?{id:a.source.id,name:a.source.name,kind:a.source.kind,...(display?{previewUrl:this.url(r?.preview??p.png),widthMm:display.width*display.pixelSizeMm,heightMm:display.height*display.pixelSizeMm}:{})}:null;
  const caps=[cap('project.write',canEdit,'Cần người dùng đã đăng nhập và kho dữ liệu cho phép ghi.'),cap('viewport.webgl',capable(this.adapters.viewport,'viewport.webgl')),cap('viewport.center-bed',capable(this.adapters.viewport,'viewport.center-bed')),cap('ai.generate',this.online&&providers.some(p=>p.available)),cap('printer.list',!!this.adapters.printing&&this.printers.length>0),cap('storage.mirror',capable(this.adapters.mirror,'storage.mirror')),cap('source.emoji',capable(this.adapters.source,'source.emoji')),cap('source.font-import',capable(this.adapters.source,'source.font-import')),cap('source.clipboard',capable(this.adapters.source,'source.clipboard')),cap('account.member-admin',this.session.status==='signed-in'&&this.session.user?.role==='owner'),cap('account.system-policy',this.session.status==='signed-in'&&this.session.user?.role==='owner'),cap('mesh.import',capable(this.adapters.source,'mesh.import')),cap('geometry.build',capable(this.adapters.engine,'geometry.build')),cap('source.edit',canEdit&&!!r&&capable(this.adapters.editing,'source.edit'))];
  const context=exportContext(s,current,capable(this.adapters.viewport,'viewport.webgl'));
  let formats=[];try{formats=s&&this.adapters.exporter?declaredFormats(this.adapters.exporter,context):[];}catch{}
  const exports=[rescueOption({projectId:this.projectId,canRescue:!!this.store?.status().canRescue}),
   settingsOption({authenticated:!this.closed&&this.session.status==='signed-in'&&!!this.api.userId,online:this.online,canDownload:typeof this.adapters.download?.save==='function'}),...formats.map(f=>{
   const option=gateExport(f,{...context,projectId:this.projectId,canEdit,assets:this.assets}),configuration=exportConfigurationView(f.id,s,canEdit);
   return {...option,...(configuration?{configuration}:{})};
  })];
  const editable=canEdit&&!!r&&capable(this.adapters.editing,'source.edit');
  const canvasReason=!canEdit?'Hãy đăng nhập và mở khóa dự án này trước khi sửa.':!r?'Hãy chuyển nguồn này sang raster và xác nhận rõ ràng trước khi sửa.':'Cần bộ xử lý sửa ảnh (Worker) đang khả dụng.';
  const selection=current?.blocks.find(b=>b.id===this.selection);
  let stats=current?.stats??{materialCount:a?.materials.length??0,verdict:'unverified'};
  if(current&&this.adapters.preparation?.modelVerdict){
   let verdict='unverified';try{const checked=matching?this.adapters.preparation.modelVerdict(current):null;if(['pass','fail','unverified','unsupported'].includes(checked))verdict=checked;}catch{}
   stats={...stats,verdict};
  }
  return freeze({contractVersion:'0.3',environment:'application',version:String(this.version),online:this.online,capabilities:caps,session:{...this.session,...(this.store&&!this.store.status().canEdit&&this.session.user?{status:'expired'}:{})},
   project:{id:this.projectId,name:a?.name??'',revision:s?.revision??0,savedRevision:this.doc?.savedRevision??null,product:s?.product??'keychain',step:this.workspaceStep,visibleModelRevision:current?.ticket.revision??null,visibleModelStale:!!current&&!matching,source,parameters:s?parameterViews(s,canEdit):[],materials:a?.materials??[],text:a?.text??data(DEFAULT_TEXT),
   canUndo:canEdit&&(this.doc?.history.cursor??0)>0,canRedo:canEdit&&!!this.doc&&this.doc.history.cursor<this.doc.history.transactions.length,
   sourceCanvas:display?{revision:a.source.revision,widthPx:display.width,heightPx:display.height,pixelSizeMm:display.pixelSizeMm,currentUrl:this.url(r?.preview??p.png),originalUrl:this.url(r?.originalPreview??p.png),editable,...(!editable?{reason:canvasReason}:{})}:null,
   history:{undoCount:this.doc?.history.cursor??0,redoCount:this.doc?this.doc.history.transactions.length-this.doc.history.cursor:0,payloadBytes:cost?.totalBytes??0,truncated:this.truncated},
   importedMesh:{present:!!a?.mesh,targets:this.adapters.meshTransactions?.targetOptions?.(s,this.visible?.lease??null)??[],...(a?.mesh?.metadata?.meshImport?.inventory?{triangles:a.mesh.metadata.meshImport.inventory.parts.reduce((n,p)=>n+p.triangles,0)}:{}),unappliedFields:a?.mesh&&(this.adapters.meshTransactions?this.adapters.meshTransactions.needsApply(s,this.assets):!a.mesh.applied)?['impOp','impScale','impX','impY','impZ','impRX','impRY','impRZ']:[]},
   blocks:current?.blocks??[],selection:selection?{blockId:selection.id,label:selection.label,kind:selection.kind}:null,stats},
   job:this.job?{id:this.job.id,state:this.job.state,stage:this.job.stage,progress:this.job.progress,cancellable:true}:null,diagnostics:[...this.diagnostics],library:[...this.library],exports,exportReceipts:[...this.exportReceipts.values()].map(r=>r.receipt.view).reverse(),aiProviders:providers,printer:printer??{id:null,label:'Chưa chọn máy in',filamentSlots:0,qualified:false},
   printerProfiles:this.profileLibrary?.snapshot(),settings:this.remote?.settingsViews()??[],editor:a?.editor??data(DEFAULT_EDITOR),aiJobs:[...(this.remote?.jobs.values()??[])].map(j=>this.remote.jobView(j)),aiBudget:{revision:this.remote?.budget.revision??0,limits:(this.remote?.budget.money??[]).map(b=>({currency:b.currency,perOperation:moneyText(b.perOperationMicros),perDay:moneyText(b.perDayMicros),perMonth:moneyText(b.perMonthMicros)}))},
   printers:[...this.printers],policy:this.remote?.policy?{version:this.remote.policy.version,document:this.remote.policy}:null,storage:this.storageEstimate,
   controller:{version:1,unrecognizedProjects:[...this.unrecognizedProjects],leaseCapability:this.leaseCapability??null,headRevision:this.headRevision,visibleRevision:current?.ticket.revision??null,previewTicket:this.preview?.job.id??null,pendingChange:this.pendingChange?{id:this.pendingChange.id,revision:this.pendingChange.revision,outputHash:this.pendingChange.outputHash,kind:this.pendingChange.kind}:this.pendingOperation?{id:this.pendingOperation.id,revision:this.pendingOperation.revision,outputHash:this.pendingOperation.outputHash,kind:this.pendingOperation.kind}:null,conflicts:[...this.conflicts],settingsConflicts:[...(this.remote?.conflicts??[])],rawExportAvailable:!!this.rawImport,placementProposal:this.placementProposal??null}});
 }
 dispose(){const reset=this.invalidate();this.closed=true;this.listeners.clear();return reset;}
}
for(const mixin of [ProjectOperations,JobOperations,ProductTransactionOperations,MeshTransactionOperations,SourceOperations,ProposalOperations])for(const name of Object.getOwnPropertyNames(mixin.prototype))if(name!=='constructor')Object.defineProperty(AppController.prototype,name,Object.getOwnPropertyDescriptor(mixin.prototype,name));
