import {VERSION,assert,uuid,canonicalJSON} from '../../src/app/common.mjs';
import {createThreeViewportAdapter} from '../../src/app/parent-adapters.mjs';
import {ThreeViewport} from '../../src/viewport/three-viewport.mjs';
import {deferred,testPNG} from './test-doubles.mjs';
const check=(value,message)=>assert(value,'UI_CONTRACT_TEST',{message});
export function createUIContractCases({fixture,ok,bad,equal,svg}){
 return {
 async proposalDiscardResources(){
  const {controller:c,controls,adapters}=await fixture();ok(await c.importFile(svg()));ok(await c.dispatch({type:'geometry.build'}));
  const old=c.visible.lease.leaseId,head=c.headRevision,before=canonicalJSON(c.doc),build=adapters.engine.build;let signal;
  adapters.engine.build=async input=>{signal=input.signal;return {status:'proposal',model:await build(input),changes:['TEST-only geometry approximation']};};
  const p=bad(await c.dispatch({type:'geometry.build'}),'PROPOSAL_REQUIRED'),preview=c.preview.record.lease.leaseId;
  bad(await c.dispatch({type:'proposal.discard',id:'unrelated'}),'STALE_CONFIRMATION');equal(c.preview.record.lease.leaseId,preview);
  ok(await c.dispatch({type:'proposal.discard',id:p.confirmation.retry.id}));check(signal.aborted,'owned geometry job aborted');equal(c.preview,null);equal(c.job,null);
  equal(c.visible.lease.leaseId,old);equal(c.headRevision,head);equal(canonicalJSON(c.doc),before);equal(controls.releases.filter(id=>id===preview).length,1);
  bad(await c.dispatch(p.confirmation.retry),'STALE_CONFIRMATION');bad(await c.dispatch({type:'proposal.discard',id:p.confirmation.retry.id}),'STALE_CONFIRMATION');
  const next=bad(await c.dispatch({type:'geometry.build'}),'PROPOSAL_REQUIRED');
  bad(await c.dispatch({type:'proposal.discard',id:p.confirmation.retry.id}),'STALE_CONFIRMATION');equal(c.pendingOperation.id,next.confirmation.retry.id);
  ok(await c.dispatch({type:'proposal.discard',id:next.confirmation.retry.id}));
  const ingest=adapters.source.ingest;adapters.source.ingest=async input=>{signal=input.signal;return {status:'proposal',result:await ingest(input),changes:['TEST-only source proposal']};};
  const source=bad(await c.importFile(svg()),'PROPOSAL_REQUIRED');ok(await c.dispatch({type:'proposal.discard',id:source.confirmation.retry.id}));
  check(signal.aborted,'owned source job aborted');equal(c.headRevision,head);equal(canonicalJSON(c.doc),before);
  const image={width:2,height:2,data:new Uint8ClampedArray(16).fill(255)},png=await testPNG(image);
  adapters.source.convert=async input=>{signal=input.signal;return {version:VERSION,ticket:input.ticket,kind:'svg',metadata:{testOnly:true},raster:{...image,pixelSizeMm:1,preview:png,previewMediaType:'image/png'}};};
  const conversion=bad(await c.dispatch({type:'source.convert',target:'raster'}),'PROPOSAL_REQUIRED');
  ok(await c.dispatch({type:'proposal.discard',id:conversion.confirmation.retry.id}));check(signal.aborted,'conversion job aborted');equal(canonicalJSON(c.doc),before);
  const exporter=adapters.exporter.export;adapters.exporter.export=async input=>{signal=input.signal;return {status:'proposal',artifact:await exporter(input),changes:['TEST-only export approximation']};};
  const count=controls.downloads.length,out=bad(await c.exportFile('stl'),'PROPOSAL_REQUIRED');
  ok(await c.dispatch({type:'proposal.discard',id:out.confirmation.retry.id}));check(signal.aborted,'export proposal job aborted');equal(controls.downloads.length,count);
  equal((await c.store.load(c.projectId)).headRevision,head);equal(c.visible.lease.leaseId,old);
  return {discarded:['geometry','source','conversion','export'],committedHeadUnchanged:true,oldVisibleRetained:true,releases:controls.releases.length,storage:c.store.capabilities};
 },
 async proposalDiscardHistoryAndAcceptance(){
  const {controller:c,arm}=await fixture();
  let head=c.headRevision,before=canonicalJSON(c.doc);
  const p=bad(await c.dispatch({type:'project.product',product:'clicky'}),'PRODUCT_CONFIRMATION_REQUIRED');
  ok(await c.dispatch({type:'proposal.discard',id:p.confirmation.retry.id}));equal(c.headRevision,head);equal(canonicalJSON(c.doc),before);
  for(let i=0;i<20;i++)ok(await c.dispatch({type:'parameter.set',id:'size',value:String(51+i)}));
  head=c.headRevision;before=canonicalJSON(c.doc);
  const budget=bad(await c.dispatch({type:'parameter.set',id:'size',value:'98'}),'HISTORY_PRUNING_REQUIRED');
  ok(await c.dispatch({type:'proposal.discard',id:budget.confirmation.retry.id}));equal(c.headRevision,head);equal(canonicalJSON(c.doc),before);
  const retry=bad(await c.dispatch({type:'parameter.set',id:'size',value:'99'}),'HISTORY_PRUNING_REQUIRED');
  const gate=deferred(),entered=deferred();arm('manifest.staged',async()=>{entered.resolve();await gate.promise;});
  const accepting=c.dispatch(retry.confirmation.retry);
  try{await entered.promise;bad(await c.dispatch({type:'proposal.discard',id:retry.confirmation.retry.id}),'APPROVAL_IN_PROGRESS');equal(c.headRevision,head);}
  finally{gate.resolve();}
  ok(await accepting);equal(c.headRevision,head+1);equal((await c.store.load(c.projectId)).headRevision,head+1);
  equal(c.doc.history.transactions.length,20);equal(c.pendingChange,null);
  return {productAndHistoryDiscardAtomic:true,realManifestCheckpoint:true,acceptanceCommitsExactlyOnce:true};
 },
 async proposalAcceptDiscardRace(){
  const {controller:c,controls,adapters}=await fixture();ok(await c.importFile(svg()));ok(await c.dispatch({type:'geometry.build'}));
  const build=adapters.engine.build,old=c.visible.lease.leaseId,head=c.headRevision;
  adapters.engine.build=async input=>({status:'proposal',model:await build(input),changes:['TEST-only geometry approximation']});
  const p=bad(await c.dispatch({type:'geometry.build'}),'PROPOSAL_REQUIRED'),pending=c.pendingOperation,verify=pending.verify,gate=deferred(),entered=deferred();
  pending.verify=async()=>{entered.resolve();await gate.promise;return verify();};
  const accept=c.dispatch(p.confirmation.retry);await entered.promise;
  try{bad(await c.dispatch({type:'proposal.discard',id:p.confirmation.retry.id}),'APPROVAL_IN_PROGRESS');bad(await c.dispatch(p.confirmation.retry),'APPROVAL_IN_PROGRESS');equal(c.visible.lease.leaseId,old);}
  finally{gate.resolve();}
  ok(await accept);check(c.visible.lease.leaseId!==old,'only approved preview becomes visible');equal(controls.releases.filter(id=>id===old).length,1);equal(c.headRevision,head);
  const replacement=bad(await c.dispatch({type:'geometry.build'}),'PROPOSAL_REQUIRED'),stale=c.pendingOperation,wait=deferred(),ready=deferred(),originalVerify=stale.verify,preview=c.preview.record.lease.leaseId;
  stale.verify=async()=>{ready.resolve();await wait.promise;return originalVerify();};
  const staleAccept=c.dispatch(replacement.confirmation.retry);await ready.promise;ok(await c.dispatch({type:'parameter.set',id:'size',value:'63'}));wait.resolve();bad(await staleAccept);
  equal(controls.releases.filter(id=>id===preview).length,1);equal(c.pendingOperation,null);
  return {acceptedPromotionOnce:true,staleApprovalReleasedOnce:true};
 },
 async perFormatExportRequirements(){
  const {controller:c,controls,adapters}=await fixture();const calls=[];
  const nativeExport=adapters.exporter.export;
  let delayed=null;
  const formats=[
   {id:'source-svg',label:'TEST committed-source serializer',extension:'svg',prerequisite:'committed-source',enabled:true,reason:'',verdict:'unverified'},
   {id:'viewport-png',label:'TEST actual viewport PNG capture',extension:'png',prerequisite:'renderer',enabled:true,reason:'',verdict:'unverified'},
   {id:'stl',label:'TEST analytical STL',extension:'stl',enabled:true,verdict:'unverified'},
   {id:'unknown',label:'TEST unsupported prerequisite',extension:'bin',prerequisite:'invented',enabled:true,verdict:'unsupported'},
   {id:'unqualified',label:'TEST disabled exporter',extension:'bin',prerequisite:'committed-source',enabled:false,reason:'  ',verdict:'unsupported'},
  ];
  const host=document.createElement('div');host.style.cssText='width:320px;height:240px';document.body.append(host);
  let mounted;class CapturedThree extends ThreeViewport {constructor(...args){super(...args);mounted=this;}}
  adapters.viewport=createThreeViewportAdapter({ThreeViewport:CapturedThree});
  let detach;
  adapters.exporter={version:VERSION,capabilities:[],formats:()=>formats,
   async export(input){
    calls.push({id:input.formatId,revision:input.ticket.revision,visibleRevision:input.model?.ticket.revision??null,frozen:Object.isFrozen(input.state.content.app)});
    if(input.formatId==='stl')return nativeExport(input);
    let bytes,mimeType,filename;
    if(input.formatId==='source-svg'){
     check(input.model===null,'source export receives no 3D model');
     const copy=input.assets.get(input.state.content.app.source.raw.hash);bytes=new Uint8Array(copy);copy[0]^=1;mimeType='image/svg+xml';filename='TEST-committed-source.svg';
    }else{
     const canvas=host.querySelector('canvas');check(canvas,'real Three canvas exists');
     const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));check(blob,'actual browser PNG encoder available');
     bytes=new Uint8Array(await blob.arrayBuffer());mimeType='image/png';filename='TEST-displayed-viewport.png';
    }
    if(delayed){delayed.entered.resolve();await delayed.gate.promise;}
    return {version:VERSION,ticket:input.ticket,bytes,mimeType,filename};
   }};
  try{
   c.emit();const byId=id=>c.getSnapshot().exports.find(f=>f.id===id);
   equal(byId('source-svg').reasonCode,'NO_SNAPSHOT');equal(byId('viewport-png').reasonCode,'NO_SNAPSHOT');equal(byId('unknown').reasonCode,'UNSUPPORTED_EXPORTER');check(byId('unqualified').reason.trim(),'disabled adapter blank reason gets fallback');
   ok(await c.importFile(svg()));equal(c.visible,null);equal(byId('source-svg').enabled,true);check(!Object.hasOwn(byId('source-svg'),'reason'),'valid source export omits reason');
   const raw=c.doc.state.content.app.source.raw.hash,original=new Uint8Array(c.assets.get(raw).bytes);
   ok(await c.exportFile('source-svg'));equal([...controls.downloads.at(-1).bytes],[...original]);equal([...c.assets.get(raw).bytes],[...original]);
   bad(await c.exportFile('stl'),'NO_SNAPSHOT');equal(calls.length,1);
   detach=c.attachViewport(host);ok(await c.dispatch({type:'geometry.build'}));const built=c.doc.state.revision;
   ok(await c.dispatch({type:'parameter.set',id:'size',value:'64'}));
   equal(c.getSnapshot().project.visibleModelRevision,built);equal(c.getSnapshot().project.visibleModelStale,true);equal(byId('stl').reasonCode,'STALE_REVISION');
   bad(await c.exportFile('stl'),'STALE_REVISION');ok(await c.exportFile('source-svg'));ok(await c.exportFile('viewport-png'));
   const png=calls.at(-1);equal(png.visibleRevision,built);equal(png.revision,c.doc.state.revision);check(png.frozen,'frozen project input');
   equal([...controls.downloads.at(-1).bytes.slice(0,8)],[137,80,78,71,13,10,26,10]);
   const downloads=controls.downloads.length;delayed={gate:deferred(),entered:deferred()};const late=c.exportFile('source-svg');await delayed.entered.promise;
   ok(await c.dispatch({type:'parameter.set',id:'size',value:'65'}));delayed.gate.resolve();bad(await late,'STALE_JOB');equal(controls.downloads.length,downloads);
   delayed={gate:deferred(),entered:deferred()};const imageExport=c.exportFile('viewport-png');await delayed.entered.promise;
   const oldDetach=detach;detach();detach=null;delayed.gate.resolve();bad(await imageExport,'NO_SNAPSHOT');equal(controls.downloads.length,downloads);
   delayed=null;equal(byId('viewport-png').reasonCode,'NO_SNAPSHOT');bad(await c.exportFile('viewport-png'),'NO_SNAPSHOT');
   detach=c.attachViewport(host);equal(mounted.revision,c.visible.lease.ticket.revision);equal(byId('viewport-png').enabled,true);
   oldDetach();equal(byId('viewport-png').enabled,true);equal(c.getSnapshot().project.visibleModelRevision,built);
   return {realThreeRenderer:true,realBrowserPNGBytes:true,sourceWithoutMesh:true,staleMeshBlocked:true,lateSourceResultNotDelivered:true,serializers:'TEST-only source pass-through / analytical STL / DOM PNG capture'};
  }finally{delayed?.gate.resolve();detach?.();host.remove();}
 },
 async visibleModelRevisionLifecycle(){
  const {controller:c,controls}=await fixture();equal(c.getSnapshot().project.visibleModelRevision,null);equal(c.getSnapshot().project.visibleModelStale,false);
  ok(await c.importFile(svg()));const head=c.headRevision,revision=c.doc.state.revision;ok(await c.previewBuild());
  equal(c.getSnapshot().project.visibleModelRevision,null);ok(await c.commitBuild(c.getSnapshot().controller.previewTicket));equal(c.getSnapshot().project.visibleModelRevision,revision);equal(c.getSnapshot().project.visibleModelStale,false);equal(c.getSnapshot().project.step,2);
  for(const step of [1,2,1]){ok(await c.dispatch({type:'project.step',step}));equal(c.doc.state.revision,revision);equal(c.headRevision,head);equal(c.getSnapshot().project.visibleModelStale,false);}
  controls.fail=true;bad(await c.dispatch({type:'geometry.build'}),'TEST_BUILD_FAILURE');controls.fail=false;equal(c.getSnapshot().project.visibleModelRevision,revision);
  ok(await c.dispatch({type:'parameter.set',id:'size',value:'58'}));equal(c.getSnapshot().project.visibleModelStale,true);ok(await c.dispatch({type:'history.undo'}));equal(c.getSnapshot().project.visibleModelRevision,revision);equal(c.getSnapshot().project.visibleModelStale,true);
  ok(await c.dispatch({type:'project.save'}));ok(await c.dispatch({type:'project.open',id:c.projectId}));equal(c.getSnapshot().project.visibleModelRevision,null);equal(c.getSnapshot().project.visibleModelStale,false);equal(c.getSnapshot().project.step,1);
  ok(await c.dispatch({type:'geometry.build'}));equal(c.getSnapshot().project.visibleModelRevision,c.doc.state.revision);equal(c.getSnapshot().project.visibleModelStale,false);
  return {navigationPresentationOnly:true,previewFailurePreservesIdentity:true,undoDoesNotFabricateMatchingRevision:true,openRequiresRebuild:true};
 },
 async truthfulReasonsRescueAndGesture(){
  const {controller:c,adapters,controls}=await fixture();let edits=0;
  const image={width:4,height:4,data:new Uint8ClampedArray(64).fill(255)},png=await testPNG(image),ingest=adapters.source.ingest;
  adapters.source.ingest=async input=>({...await ingest(input),raster:{...image,pixelSizeMm:.2,preview:png,previewMediaType:'image/png'}});
  adapters.editing={version:VERSION,capabilities:[{id:'source.edit',available:true}],async edit(){edits++;throw Error('TEST unexpected editing call');}};
  ok(await c.importFile(new File([png],'test.png',{type:'image/png'})));
  equal(c.getSnapshot().project.sourceCanvas.editable,true);check(!Object.hasOwn(c.getSnapshot().project.sourceCanvas,'reason'),'editable source omits reason');
  const gesture={id:uuid(),projectRevision:c.doc.state.revision,sourceRevision:c.doc.state.content.app.source.revision,tool:'erase',points:[{x:0,y:0},{x:1,y:1}],snap:'none'};
  ok(await c.dispatch({type:'editor.settings',values:{strokeWidthPx:'3'}}));const afterSettings=c.headRevision;
  bad(await c.editSource(gesture),'SOURCE_REVISION_CONFLICT');equal(c.headRevision,afterSettings);equal(edits,0);
  const materialGesture={...gesture,id:uuid(),projectRevision:c.doc.state.revision};
  ok(await c.dispatch({type:'material.update',id:'red',color:'#00ff00'}));const afterMaterial=c.headRevision;
  bad(await c.editSource(materialGesture),'SOURCE_REVISION_CONFLICT');equal(c.headRevision,afterMaterial);equal(edits,0);
  for(const p of c.getSnapshot().project.parameters)if(p.enabled)check(!Object.hasOwn(p,'reason'),'enabled parameter omits reason');else check(p.reason.trim(),'disabled parameter explains why');
  c.offset+=86400001;c.emit();
  const snapshot=c.getSnapshot();equal(snapshot.project.sourceCanvas.editable,false);check(/đăng nhập|mở khóa/.test(snapshot.project.sourceCanvas.reason),'source lock reason reflects lease');
  const rescue=snapshot.exports.find(e=>e.id==='project');equal(rescue.enabled,true);check(!Object.hasOwn(rescue,'reason'),'expired authorized rescue remains available');
  for(const e of snapshot.exports)if(!e.enabled)check(e.reason.trim(),'disabled export explains why');
  const head=c.headRevision;ok(await c.exportFile('project'));check(controls.downloads.at(-1).bytes.length>0,'real rescue package bytes');equal(c.headRevision,head);
  await c.invalidate('signed-out');const blocked=c.getSnapshot().exports.find(e=>e.id==='project');equal(blocked.enabled,false);check(blocked.reason.trim(),'disabled rescue explains why');
  return {editorAndMaterialRevisionFencedBeforeWorker:true,expiredAuthorizedRescueBytes:true,reasonsNeverEmpty:true};
 }
 };
}
