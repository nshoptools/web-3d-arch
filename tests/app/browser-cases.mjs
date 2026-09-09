import {sourceAdoptionBrowserCases} from './source-adoption.browser.mjs';
import {createUIContractCases} from './ui-contract.browser.mjs';
import {onlinePolicyCases} from './online-policy.browser.mjs';
import {createAppController,createRasterEditingAdapter,createThreeViewportAdapter} from '../../src/app/index.mjs';
import {openProjectStore} from '../../src/storage/index.mjs';
import {canonicalJSON,assert,uuid} from '../../src/app/common.mjs';
import {effectiveValues} from '../../src/domain/index.mjs';
import {namedTestAdapters,deferred,testPNG} from './test-doubles.mjs';
import {ThreeViewport} from '../../src/viewport/three-viewport.mjs';
import {readRecord,atomic} from '../../src/storage/idb.mjs';
const equal=(a,b)=>assert(JSON.stringify(a)===JSON.stringify(b),'TEST_EQUAL',{a,b});
const ok=r=>{if(!r.ok)throw Object.assign(new Error(r.diagnostic.code),{code:r.diagnostic.code});return r;};
const bad=(r,code)=>{assert(!r.ok,'TEST_EXPECTED_FAILURE');if(code)equal(r.diagnostic.code,code);return r;};
const instances=[],fixtureStores=[];
async function fixture(options={}){
 const test=namedTestAdapters(),me=await (await fetch('/api/v1/me')).json();let armed=null;
 const factory=async args=>{const store=await openProjectStore({...args,...(options.storage??{}),policy:{...args.policy,...(options.casOnly?{coordination:'cas-only'}:{})},checkpoint:async(name,ctx)=>{if(armed?.name===name){const current=armed;armed=null;await current.action(ctx);}}} );fixtureStores.push(store);return store;};
 const controller=createAppController({origin:location.origin,deviceId:me.deviceId,adapters:test.adapters,storeFactory:factory,leasePolicy:'allow-authenticated-online'});
 instances.push(controller);ok(await controller.initialize());ok(await controller.dispatch({type:'project.create',product:'keychain'}));
 return {controller,...test,arm(name,action){armed={name,action};}};
}
const svg=()=>new File(['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 5"><path d="M0 0H10V5H0Z"/></svg>'],'rectangle.svg',{type:'image/svg+xml'});
const cases={
 ...sourceAdoptionBrowserCases,...onlinePolicyCases,...createUIContractCases({fixture,ok,bad,equal,svg}),
 async completeSvgFlow(){
  const {controller:c,controls}=await fixture();ok(await c.importFile(svg()));const sourceHash=c.doc.state.content.app.source.raw.hash;
  ok(await c.dispatch({type:'parameter.set',id:'size',value:'51'}));ok(await c.dispatch({type:'parameter.set',id:'baseH',value:'1,7'}));ok(await c.dispatch({type:'geometry.build'}));
  equal(c.getSnapshot().project.stats.heightMm,1.7);equal(c.getSnapshot().project.stats.widthMm,51);
  ok(await c.dispatch({type:'history.undo'}));bad(await c.exportFile('stl'),'STALE_REVISION');ok(await c.dispatch({type:'geometry.build'}));ok(await c.dispatch({type:'project.save'}));
  const id=c.projectId,state=canonicalJSON(c.doc.state),head=c.headRevision;ok(await c.dispatch({type:'project.open',id}));equal(canonicalJSON(c.doc.state),state);equal(c.headRevision,head);equal(c.doc.state.content.app.source.raw.hash,sourceHash);
  ok(await c.dispatch({type:'geometry.build'}));ok(await c.exportFile('stl'));equal(new DataView(controls.downloads.at(-1).bytes.buffer).getUint32(80,true),12);
  ok(await c.exportFile('project'));const packageBytes=controls.downloads.at(-1).bytes;
  // A package of a project that is still in the library opens that project (same id, no copy) and says so.
  ok(await c.importFile(new File([packageBytes],'copy.arch-project.zip'),'project'));equal(c.projectId,id);equal(c.doc.state.content.app.source.raw.hash,sourceHash);
  assert(c.getSnapshot().diagnostics.some(d=>d.code==='PACKAGE_PROJECT_EXISTS'),'TEST_PACKAGE_EXISTS_DIAGNOSTIC');
  // After the project is deleted, the package restores it under its own id, with the document it carried, and the model rebuilds.
  ok(await c.dispatch({type:'project.delete',id,confirmed:true}));equal(c.projectId,'');
  ok(await c.importFile(new File([packageBytes],'restore.arch-project.zip'),'project'));equal(c.projectId,id);equal(canonicalJSON(c.doc.state),state);equal(c.doc.state.content.app.source.raw.hash,sourceHash);
  assert(c.library.some(entry=>entry.id===id),'TEST_RESTORED_LISTED');ok(await c.dispatch({type:'geometry.build'}));
  return {head,stlBytes:684,sourceHash,analyticalKernel:true,backend:c.store.capabilities.selectedBackend,storageCapabilities:c.store.capabilities,leaseCapability:c.leaseCapability};
 },
 async multiStepHistoryAtomic(){
  const {controller:c}=await fixture();
  for(const size of ['51','52','53'])ok(await c.dispatch({type:'parameter.set',id:'size',value:size}));
  for(const expected of [52,51,45]){ok(await c.dispatch({type:'history.undo'}));equal(effectiveValues(c.doc.state).size,expected);}
  for(const expected of [51,52,53]){ok(await c.dispatch({type:'history.redo'}));equal(effectiveValues(c.doc.state).size,expected);}
  equal(c.doc.state.revision,9);ok(await c.dispatch({type:'history.undo'}));ok(await c.dispatch({type:'parameter.set',id:'size',value:'67'}));bad(await c.dispatch({type:'history.redo'}),'HISTORY_EMPTY');
  const before=canonicalJSON(c.doc),head=c.headRevision;bad(await c.dispatch({type:'parameter.set',id:'size',value:'1,2.3'}));equal(canonicalJSON(c.doc),before);equal(c.headRevision,head);
 },
 async staleCancelFailurePreservesModel(){
  const {controller:c,controls}=await fixture();ok(await c.importFile(svg()));ok(await c.dispatch({type:'geometry.build'}));const leaseId=c.visible.lease.leaseId;
  controls.fail=true;bad(await c.dispatch({type:'geometry.build'}),'TEST_BUILD_FAILURE');equal(c.visible.lease.leaseId,leaseId);controls.fail=false;
  const gate=deferred();controls.delay=gate;const pending=c.dispatch({type:'geometry.build'});await Promise.resolve();const ticket=c.job.id;
  ok(await c.dispatch({type:'parameter.set',id:'size',value:'52'}));gate.resolve();bad(await pending,'STALE_JOB');equal(c.visible.lease.leaseId,leaseId);assert(controls.releases.includes(ticket),'TEST_LATE_RELEASE');
  controls.delay=deferred();const cancelled=c.dispatch({type:'geometry.build'});await Promise.resolve();ok(await c.dispatch({type:'job.cancel',id:c.job.id}));controls.delay.resolve();bad(await cancelled,'STALE_JOB');equal(c.visible.lease.leaseId,leaseId);
  controls.delay=null;ok(await c.previewBuild());equal(c.visible.lease.leaseId,leaseId);ok(await c.commitBuild(c.getSnapshot().controller.previewTicket));assert(controls.releases.includes(leaseId),'TEST_OLD_RELEASE');
 },
 async realStorageFaultAtomic(){
  const {controller:c,arm}=await fixture();const before=canonicalJSON(c.doc),head=c.headRevision;
  arm('manifest.staged',()=>{throw Object.assign(new Error('TEST quota checkpoint'),{name:'QuotaExceededError',code:'TEST_QUOTA'});});
  bad(await c.dispatch({type:'parameter.set',id:'size',value:'54'}));equal(canonicalJSON(c.doc),before);equal((await c.store.load(c.projectId)).headRevision,head);
 },
 async afterCommitAckRecovery(){
  const {controller:c,arm}=await fixture();arm('head.committed',()=>{throw Object.assign(new Error('TEST ack fault'),{code:'TEST_ACK_LOST'});});
  ok(await c.dispatch({type:'parameter.set',id:'size',value:'55'}));equal(effectiveValues(c.doc.state).size,55);assert(c.getSnapshot().diagnostics.some(d=>d.code==='COMMIT_ACK_RECOVERED'),'TEST_ACK_RECOVERY');
 },
 async settingsAndProductRoundtrip(){
  const {controller:c}=await fixture();ok(await c.dispatch({type:'settings.update',values:{language:'vi'}}));assert(c.getSnapshot().settings.some(x=>x.key==='language'&&x.value==='vi'),'TEST_SETTING');
  ok(await c.dispatch({type:'parameter.set',id:'size',value:'61'}));const needs=bad(await c.dispatch({type:'project.product',product:'clicky'}),'PRODUCT_CONFIRMATION_REQUIRED');assert(needs.confirmation.changes.length>0,'TEST_DIFF');
  ok(await c.dispatch(needs.confirmation.retry));ok(await c.dispatch({type:'parameter.set',id:'clr',value:'0,05'}));ok(await c.dispatch({type:'project.product',product:'keychain',confirmed:true}));equal(effectiveValues(c.doc.state).size,61);
  ok(await c.dispatch({type:'project.product',product:'clicky',confirmed:true}));equal(effectiveValues(c.doc.state).clr,0.05);
  ok(await c.dispatch({type:'preset.save',name:'Checked test preset'}));assert((await c.queryPresets('clicky')).length>0,'TEST_PRESET');
 },
 async sourceEditActualWorker(){
  const {controller:c,adapters}=await fixture();const image={width:8,height:8,data:new Uint8ClampedArray(256)};image.data.fill(255);
  const preview=await testPNG(image),originalIngest=adapters.source.ingest;
  adapters.source.ingest=async input=>({...await originalIngest(input),raster:{...image,pixelSizeMm:0.1,preview,previewMediaType:'image/png'}});
  let workerCount=0,terminated=0;adapters.editing=createRasterEditingAdapter({encodePNG:testPNG,workerFactory:url=>{workerCount++;const worker=new Worker(url,{type:'module'}),terminate=worker.terminate.bind(worker);worker.terminate=()=>{terminated++;terminate();};return worker;}});ok(await c.importFile(new File([preview],'test.png',{type:'image/png'})));ok(await c.dispatch({type:'editor.settings',values:{colorMaterialId:'red'}}));
  const before=c.doc.state.content.app.source.raster.rgba,source=c.doc.state.content.app.source;
  ok(await c.editSource({id:uuid(),projectRevision:c.doc.state.revision,sourceRevision:source.revision,tool:'line',points:[{x:1,y:1},{x:6,y:6}],snap:'none'}));
  assert(c.doc.state.content.app.source.raster.rgba!==before,'TEST_EDITED');assert(c.getSnapshot().project.sourceCanvas.currentUrl!==c.getSnapshot().project.sourceCanvas.originalUrl,'TEST_IMMUTABLE_URL');
  bad(await c.editSource({id:uuid(),projectRevision:c.doc.state.revision,sourceRevision:source.revision,tool:'line',points:[],snap:'none'}),'SOURCE_REVISION_CONFLICT');
  ok(await c.dispatch({type:'history.undo'}));equal(c.doc.state.content.app.source.raster.rgba,before);ok(await c.dispatch({type:'history.redo'}));equal(workerCount,1);equal(terminated,1);
  const current=c.doc.state.content.app.source,head=c.headRevision;
  const editing=c.editSource({id:uuid(),projectRevision:c.doc.state.revision,sourceRevision:current.revision,tool:'line',points:[{x:0,y:1},{x:7,y:1}],snap:'none'});
  ok(await c.dispatch({type:'job.cancel',id:c.job.id}));bad(await editing);equal(c.headRevision,head);equal(terminated,workerCount);return {transport:'actual src/editing/worker.mjs',workerCount,terminated,encoder:'test-only DOM canvas PNG'};
 },
 async historyBudgetConfirmation(){
  const {controller:c}=await fixture();for(let i=0;i<20;i++)ok(await c.dispatch({type:'parameter.set',id:'size',value:String(51+i)}));
  const head=c.headRevision;bad(await c.dispatch({type:'parameter.set',id:'size',value:'98'}),'HISTORY_PRUNING_REQUIRED');equal(c.headRevision,head);
  const p=c.getSnapshot().controller.pendingChange;assert(/^[a-f0-9]{64}$/.test(p.outputHash),'TEST_HISTORY_PROPOSAL_HASH');ok(await c.dispatch({type:'proposal.accept',id:p.id,confirmed:true}));equal(effectiveValues(c.doc.state).size,98);equal(c.doc.history.transactions.length,20);
  bad(await c.dispatch({type:'proposal.accept',id:p.id,confirmed:true}),'STALE_CONFIRMATION');
 },
 async mirrorActivationAndDelete(){
  const {controller:c,adapters}=await fixture();let called=false;
  adapters.mirror={version:'arch-app-adapters/1',capabilities:[{id:'storage.mirror',available:true}],pickDirectory(){called=true;return Promise.reject(Object.assign(new Error('cancel'),{code:'CANCELLED'}));}};
  const p=c.pickMirrorDirectory();assert(called,'TEST_ACTIVATION');bad(await p,'CANCELLED');assert(!c.mirror,'TEST_NO_MIRROR_MUTATION');
  const id=c.projectId;bad(await c.dispatch({type:'project.delete',id,confirmed:false}),'CONFIRMATION_REQUIRED');ok(await c.dispatch({type:'project.delete',id,confirmed:true}));assert(!c.getSnapshot().library.some(e=>e.id===id),'TEST_DELETE');
  equal((await c.store.load(id)).manifest.document.state.content.app.deleted,true);
 },
 async realSourceLossAndHashRecovery(){
  for(const action of ['remove','corrupt']){
   const {controller:c}=await fixture();ok(await c.importFile(svg()));const original=c.doc.state.content.app.source.raw.hash;
   const bytes=await svg().text();ok(await c.importFile(new File([bytes+'<!-- second source -->'],'second.svg',{type:'image/svg+xml'})));
   const current=c.doc.state.content.app.source.raw.hash,object=await readRecord(c.store.db,'objects',current);assert(object,'TEST_ASSET');
   // Controlled damage ONLY to this test profile, to exercise actual byte-store recovery.
   if(action==='remove')await c.store.bytes.remove(object);
   else if(object.backend==='opfs'){
    const root=await navigator.storage.getDirectory(),directory=await(await root.getDirectoryHandle('web-3d-arch')).getDirectoryHandle(c.store.namespace),file=await directory.getFileHandle(object.locator),writer=await file.createWritable();
    await writer.write(new Uint8Array(object.byteLength).fill(0x78));await writer.close();
   }else await atomic(c.store.db,['blobs'],'readwrite',t=>t.store('blobs').put({locator:object.locator,blob:new Blob([new Uint8Array(object.byteLength).fill(0x78)])}));
   ok(await c.dispatch({type:'project.open',id:c.projectId}));equal(c.doc.state.content.app.source.raw.hash,original);
   assert(c.getSnapshot().diagnostics.some(d=>d.code==='RECOVERED_PREVIOUS'),'TEST_RECOVERY');await c.store.cleanup();await c.store.cleanup();
   equal((await c.store.load(c.projectId)).recoveredPrevious,true);
  }
 },
 async unknownVersionRawRescue(){
  const {controller:c,controls}=await fixture(),before=canonicalJSON(c.doc),id=c.projectId,d=structuredClone(c.doc);d.version=99;
  await c.store.commit({projectId:id,expectedRevision:c.headRevision,engine:{id:'test',version:'1'},domainSchemaVersion:1,document:d,assets:[...c.assets.values()].map(a=>({kind:a.kind,bytes:a.bytes}))});
  bad(await c.dispatch({type:'project.open',id}),'APP_DOCUMENT_VERSION');equal(canonicalJSON(c.doc),before);ok(await c.exportFile('raw-project'));assert(controls.downloads.at(-1).bytes.length>0,'TEST_RAW_RESCUE');
 },
 async separateVectorPreviewAndRemount(){
  const {controller:c,adapters,controls}=await fixture(),rgba=new Uint8ClampedArray(64).fill(255),png=await testPNG({width:4,height:4,data:rgba}),ingest=adapters.source.ingest;
  adapters.source.ingest=async input=>({...await ingest(input),preview:{width:4,height:4,pixelSizeMm:0.25,png,mediaType:'image/png'}});
  adapters.editing=createRasterEditingAdapter({encodePNG:testPNG});ok(await c.importFile(svg()));
  equal(c.doc.state.sourceKind,'svg');assert(!c.doc.state.content.app.source.raster,'TEST_NO_IMPLICIT_CONVERSION');const canvas=c.getSnapshot().project.sourceCanvas;
  equal(canvas.editable,false);assert(/chuyển nguồn này sang raster/i.test(canvas.reason),'TEST_CONVERSION_REASON');equal(canvas.pixelSizeMm,0.25);assert(canvas.currentUrl.startsWith('blob:'),'TEST_TRUSTED_PNG_URL');
  const previewHash=c.doc.state.content.app.source.preview.png;assert(c.doc.state.content.app.source.assetHashes.includes(previewHash),'TEST_PREVIEW_RETAINED');
  assert(c.doc.history.current.assetHashes.includes(previewHash),'TEST_PREVIEW_HISTORY');ok(await c.dispatch({type:'source.remove'}));equal(c.getSnapshot().project.sourceCanvas,null);ok(await c.dispatch({type:'history.undo'}));equal(c.doc.state.content.app.source.preview.png,previewHash);
  ok(await c.dispatch({type:'project.save'}));ok(await c.dispatch({type:'project.open',id:c.projectId}));equal(c.doc.state.content.app.source.preview.png,previewHash);equal(c.getSnapshot().project.sourceCanvas.editable,false);
  bad(await c.editSource({id:uuid(),projectRevision:c.doc.state.revision,sourceRevision:0,tool:'line',points:[],snap:'none'}),'SOURCE_REVISION_CONFLICT');
  let viewport;class CapturedThree extends ThreeViewport{constructor(...args){super(...args);viewport=this;}}
  adapters.viewport=createThreeViewportAdapter({ThreeViewport:CapturedThree});ok(await c.dispatch({type:'geometry.build'}));const leaseId=c.visible.lease.leaseId,host=document.createElement('div');host.style.cssText='width:320px;height:240px';document.body.append(host);
  let detach;
  try{detach=c.attachViewport(host);assert(viewport.model,'TEST_ATTACH_REPLAY');ok(await c.dispatch({type:'selection.set',blockId:c.visible.lease.blocks[0].id}));const oldDetach=detach;detach();assert(!controls.releases.includes(leaseId),'TEST_DETACH_BORROW');
   detach=c.attachViewport(host);oldDetach();assert(viewport.model&&!viewport.disposed,'TEST_REMOUNT_REPLAY');equal(viewport.revision,c.doc.state.revision);equal(viewport.selection,c.selection);
  }finally{detach?.();host.remove();}
  const before=canonicalJSON(c.doc),head=c.headRevision;adapters.source.ingest=async input=>({...await ingest(input),preview:{width:9,height:4,pixelSizeMm:0.25,png,mediaType:'image/png'}});
  bad(await c.importFile(svg()),'PNG_DIMENSIONS');equal(canonicalJSON(c.doc),before);equal(c.headRevision,head);
  adapters.source.ingest=ingest;ok(await c.importFile(svg()));equal(c.getSnapshot().project.sourceCanvas,null);
  const verifiedHead=c.headRevision;adapters.source.ingest=async input=>({...await ingest(input),ticket:{...input.ticket,revision:input.ticket.revision+1}});bad(await c.importFile(svg()),'ADAPTER_TICKET');equal(c.headRevision,verifiedHead);
 },
 async sourceProposalAndStaleAccept(){
  const {controller:c,adapters}=await fixture();ok(await c.importFile(svg()));const sourceHash=c.doc.state.content.app.source.raw.hash;
  const image={width:4,height:4,data:new Uint8ClampedArray(64)};image.data.fill(255);const preview=await testPNG(image);
  // A conversion keeps the source's kind and identity and attaches the raster (SOURCE_CONVERSION_IDENTITY in sources.mjs).
  adapters.source.convert=async({ticket})=>({version:'arch-app-adapters/1',ticket,kind:'svg',metadata:{testDouble:true,conversion:'explicit'},raster:{...image,pixelSizeMm:0.1,preview,previewMediaType:'image/png'}});
  let proposed=bad(await c.dispatch({type:'source.convert',target:'raster'}),'PROPOSAL_REQUIRED'),head=c.headRevision;
  assert(proposed.confirmation.retry.type==='proposal.accept','TEST_PROPOSAL_ROUTE');equal(c.headRevision,head);equal(c.doc.state.sourceKind,'svg');
  ok(await c.dispatch({type:'parameter.set',id:'size',value:'52'}));bad(await c.dispatch(proposed.confirmation.retry),'STALE_CONFIRMATION');
  proposed=bad(await c.dispatch({type:'source.convert',target:'raster'}),'PROPOSAL_REQUIRED');ok(await c.dispatch(proposed.confirmation.retry));equal(c.doc.state.sourceKind,'svg');assert(c.doc.state.content.app.source.raster,'TEST_RASTER_ATTACHED');equal(c.doc.state.content.app.source.raw.hash,sourceHash);
  bad(await c.dispatch(proposed.confirmation.retry),'STALE_CONFIRMATION');
 },
 async modelAndExportProposal(){
  const {controller:c,adapters,controls}=await fixture();ok(await c.importFile(svg()));const build=adapters.engine.build;
  adapters.engine.build=async input=>({status:'proposal',model:await build(input),changes:['TEST tessellation approval']});
  const proposed=bad(await c.dispatch({type:'geometry.build'}),'PROPOSAL_REQUIRED');assert(!c.visible,'TEST_NO_EARLY_MODEL');
  bad(await c.commitBuild(c.getSnapshot().controller.previewTicket),'PROPOSAL_REQUIRED');assert(!c.visible,'TEST_NO_BYPASS');
  ok(await c.dispatch(proposed.confirmation.retry));assert(c.visible,'TEST_MODEL_COMMITTED');
  const cancelled=bad(await c.dispatch({type:'geometry.build'}),'PROPOSAL_REQUIRED'),ticket=c.job.id;ok(await c.dispatch({type:'job.cancel',id:ticket}));assert(controls.releases.includes(ticket),'TEST_PROPOSAL_CANCEL_RELEASE');bad(await c.dispatch(cancelled.confirmation.retry),'STALE_CONFIRMATION');
  const exporter=adapters.exporter.export;adapters.exporter.export=async input=>({status:'proposal',artifact:await exporter(input),changes:['TEST export approximation']});
  const exported=bad(await c.exportFile('stl'),'PROPOSAL_REQUIRED');equal(controls.downloads.length,0);ok(await c.dispatch(exported.confirmation.retry));equal(controls.downloads.length,1);
 },
 async actualThreeBinding(){
  const {controller:c,adapters}=await fixture();let viewport;
  class CapturedThree extends ThreeViewport {constructor(...args){super(...args);viewport=this;}}
  adapters.viewport=createThreeViewportAdapter({ThreeViewport:CapturedThree,onSelection:id=>c.dispatch({type:'selection.set',blockId:id})});
  const host=document.createElement('div');host.style.cssText='width:320px;height:240px';document.body.append(host);let detach;
  try{detach=c.attachViewport(host);ok(await c.importFile(svg()));ok(await c.dispatch({type:'geometry.build'}));equal(viewport.revision,c.doc.state.revision);
   const before=viewport.model;ok(await c.dispatch({type:'selection.set',blockId:'part-0'}));equal(viewport.selection,'part-0');
   ok(await c.dispatch({type:'viewport.action',action:'top'}));const original=adapters.engine.build;
   adapters.engine.build=async input=>{const m=await original(input);return {...m,generation:m.generation+1};};
   bad(await c.dispatch({type:'geometry.build'}),'SNAPSHOT_GENERATION');assert(viewport.model===before,'TEST_PRESERVE_GPU');equal(c.visible.lease.generation,c.generation-1);
  }finally{detach?.();host.remove();}
 },
 async privateResetOnUserChange(){
  const {controller:c,controls}=await fixture();ok(await c.importFile(svg()));ok(await c.dispatch({type:'geometry.build'}));
  const old=c.visible.lease.leaseId;c.invalidate('expired');assert(controls.resetCount>0,'TEST_PRIVATE_RESET');assert(controls.releases.includes(old),'TEST_USER_LEASE_RELEASE');equal(c.getSnapshot().project.source,null);equal(c.getSnapshot().session.user,null);
 },
 async expiryRescueAndWrongUser(){
  const {controller:c,controls}=await fixture();ok(await c.importFile(svg()));c.offset+=86400001;c.emit();bad(await c.dispatch({type:'parameter.set',id:'size',value:'51'}),'PROJECT_LOCKED');
  ok(await c.exportFile('project'));assert(controls.downloads.length>0,'TEST_EXPIRED_RESCUE');
  const other=await openProjectStore({userId:'test-other-'+uuid(),deviceId:c.deviceId,now:()=>Date.now(),policy:{backend:'idb'}});
  try{await other.unlock({userId:c.session.user.id,deviceId:c.deviceId,authVersion:1,verifiedAt:Date.now(),expiresAt:Date.now()+10000,verified:true});throw Error('wrong identity accepted');}catch(e){equal(e.code,'USER_MISMATCH');}finally{other.close();}
 }
};
globalThis.testAPI={ready:true,caseNames:Object.keys(cases),async run(name){try{return {name,status:'pass',evidence:await cases[name]()??{}};}catch(e){return {name,status:'fail',error:{code:e.code??null,message:e.message,details:e.details,stack:e.stack}};}finally{const cleanups=new Map();for(const c of instances.splice(0))await c.dispose();for(const store of fixtureStores.splice(0)){cleanups.set(store.databaseName,store.namespace);store.close();}
 for(const [name,namespace]of cleanups){await new Promise((resolve,reject)=>{const req=indexedDB.deleteDatabase(name);req.onsuccess=resolve;req.onerror=()=>reject(req.error);req.onblocked=()=>reject(Error('TEST_DB_CLEANUP_BLOCKED'));});try{const root=await navigator.storage.getDirectory(),parent=await root.getDirectoryHandle('web-3d-arch');await parent.removeEntry(namespace,{recursive:true});}catch(e){if(!['NotFoundError','NotSupportedError'].includes(e.name))throw e;}}
 }},fixture,ok,bad};
