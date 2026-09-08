import {createAppController,verifyOnlineLease,createEditingClient} from '../../src/app/index.mjs';
import {canonicalJSON,sha256} from '../../src/app/common.mjs';
import {ApiClient} from '../../src/app/http.mjs';
import {openProjectStore,exportRescuePackage,inspectRescuePackage} from '../../src/storage/index.mjs';
import {readRecord,readRecords} from '../../src/storage/idb.mjs';
import {namedTestAdapters,deferred,testPNG} from './test-doubles.mjs';
import {testPreparation,testFlatReceipt} from './source-approval.fixtures.mjs';
import {alignmentCases} from './source-alignment.browser.mjs';
const check=(v,message)=>{if(!v)throw Error(message);},ok=r=>{check(r.ok,r.diagnostic?.code);return r;},bad=(r,code)=>{check(!r.ok,'expected rejection');if(code)check(r.diagnostic.code===code,r.diagnostic.code+' expected '+code);return r;};
const svg=()=>new File(['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 5"><path d="M0 0H10V5H0Z"/></svg>'],'source.svg',{type:'image/svg+xml'});
function forceCrypto(mode){
 const subtle=crypto.subtle,importKey=subtle.importKey,verify=subtle.verify;
 if(mode==='unsupported')subtle.importKey=function(...args){if(args[2]?.name==='Ed25519')return Promise.reject(new DOMException('TEST forced unsupported','NotSupportedError'));return importKey.apply(this,args);};
 if(mode==='invalid'){
  subtle.importKey=async function(...args){if(args[2]?.name!=='Ed25519')return importKey.apply(this,args);try{return await importKey.apply(this,args);}catch(e){if(e.name==='NotSupportedError')return {explicitTestOnlyKey:true};throw e;}};
  subtle.verify=function(...args){return args[0]==='Ed25519'?Promise.resolve(false):verify.apply(this,args);};
 }
 return ()=>{subtle.importKey=importKey;subtle.verify=verify;};
}
export async function scoped(body,{mode='unsupported',policy='allow-authenticated-online'}={}){
 const restore=forceCrypto(mode),stores=[],instances=[];await globalThis.__testSessionIdentity('a');
 const me=await (await fetch('/api/v1/me')).json(),test=namedTestAdapters();
 const control={lost:false,reads:0,requests:0,checkpoint:null,resetGate:null,workers:[],terminated:0};
 const originalReset=test.adapters.reset;
 test.adapters.reset=async()=>{
  originalReset();for(const worker of control.workers.splice(0)){worker.terminate();control.terminated++;}
  if(control.resetGate)await control.resetGate.promise;
 };
 const fetchImpl=async(url,options)=>{
  control.requests++;if(new URL(url).pathname==='/api/v1/me')control.reads++;
  // The fetch itself is real. The named fault aborts the actual browser transport.
  return fetch(url,{...options,...(control.lost?{signal:AbortSignal.abort()}:{} )});
 };
 const c=createAppController({origin:location.origin,deviceId:me.deviceId,adapters:test.adapters,leasePolicy:policy,fetchImpl,
  storeFactory:async args=>{const s=await openProjectStore({...args,checkpoint:async name=>{await control.checkpoint?.(name);}});stores.push(s);return s;}});
 instances.push(c);
 try{return await body({c,control,me,stores,...test});}
 finally{
  control.resetGate?.resolve();for(const x of instances)await x.dispose();
  for(const s of stores)s.close();
  for(const [name,namespace]of new Map(stores.map(s=>[s.databaseName,s.namespace]))){
   await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(name);r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('ONLINE_TEST_DB_BLOCKED'));});
   try{const root=await navigator.storage.getDirectory(),parent=await root.getDirectoryHandle('web-3d-arch');await parent.removeEntry(namespace,{recursive:true});}catch(e){if(!['NotFoundError','NotSupportedError'].includes(e.name))throw e;}
  }
  await globalThis.__testSessionIdentity('a');restore();
 }
}
async function create(c){ok(await c.initialize());ok(await c.dispatch({type:'project.create',product:'keychain'}));}
export const onlinePolicyCases={
 ...alignmentCases,
 async online401RetainsRescue(){return scoped(async({c,controls})=>{
  await create(c);const id=c.projectId,head=await readRecord(c.store.db,'heads',id);
  await globalThis.__testSessionIdentity('none');bad(await c.dispatch({type:'parameter.set',id:'size',value:'61'}));
  check(c.store.status().canRescue&&!c.store.status().canEdit,'401 leaves only prior authorized rescue');
  check(JSON.stringify(await readRecord(c.store.db,'heads',id))===JSON.stringify(head),'401 cannot advance head');
  ok(await c.exportFile('project'));check(controls.downloads.at(-1).bytes.length>0,'401 rescue available');
  const old=c.store;ok(await c.initialize());check(c.session.status==='signed-out'&&!old.status().canRescue,'explicit new auth attempt closes previous rescue');
  return {realBackend401:true,headUnchanged:true,rescueOnly:true};
 });},
 async sourceApprovalBoundaries(){return scoped(async({c,control,adapters})=>{
  await create(c);let calls=0,mode='valid',frozenInput=false,entered=null,gate=null;const ingest=adapters.source.ingest;
  const confirmation={kind:'raster',version:'TEST-source-approval/1',approvalHash:'a'.repeat(64),proposalHash:'b'.repeat(64)};
  adapters.source.ingest=async input=>{
   frozenInput=Object.isFrozen(input.state)&&Object.isFrozen(input.state.parameters)&&Object.isFrozen(input.sourceContext);
   const result=await ingest(input),rgba=new Uint8ClampedArray([255,0,0,255]);
   result.raster={width:1,height:1,data:rgba,pixelSizeMm:1,preview:await testPNG({width:1,height:1,data:rgba}),previewMediaType:'image/png'};
   result.metadata.rasterPreparation=testPreparation(input,await sha256(input.file.bytes),await sha256(new Uint8Array(rgba.buffer)));
   return {status:'proposal',changes:['TEST explicit source acceptance'],confirmation,result};
  };
  adapters.source.acceptProposal=async input=>{
   calls++;entered?.resolve();if(gate)await gate.promise;
   if(mode==='reject')throw Object.assign(Error('TEST receipt rejected'),{code:'TEST_RECEIPT_REJECTED'});
   const result=testFlatReceipt(input);
   if(mode==='hash')result.receipt.proposalHash='c'.repeat(64);
   if(mode==='binding')result.receipt.sourceHash='d'.repeat(64);
   if(mode==='ticket')result.ticket.generation++;
   if(mode==='bytes')result.bytes=new Uint8Array([1]);
   if(mode==='loss')control.lost=true;
   // Mutating an isolated supplied view must not change approved source bytes.
   input.assets.get(input.source.raw.hash)[0]^=1;
   return result;
  };
  const propose=async()=>bad(await c.importFile(svg()),'PROPOSAL_REQUIRED');
  let p=await propose(),head=c.headRevision;check(calls===0&&frozenInput,'ingest uses frozen state, never early acceptance');
  bad(await c.dispatch({...p.confirmation.retry,confirmed:false}),'STALE_CONFIRMATION');check(c.headRevision===head&&calls===0,'explicit approval required');
  const winner=c.dispatch(p.confirmation.retry),duplicate=c.dispatch(p.confirmation.retry);
  bad(await duplicate,'APPROVAL_IN_PROGRESS');ok(await winner);
  check(c.headRevision===head+1&&calls===1,'concurrent approved operation makes exactly one commit');
  check(c.doc.state.content.app.source.metadata.confirmationReceipt.sourceHash===c.doc.state.content.app.source.raw.hash,'durable receipt binding');
  bad(await c.dispatch(p.confirmation.retry),'STALE_CONFIRMATION');check(calls===1,'approval cannot be replayed');
  for(const variant of ['reject','hash','binding','ticket','bytes']){
   mode=variant;p=await propose();head=c.headRevision;const before=JSON.stringify(c.doc);
   bad(await c.dispatch(p.confirmation.retry));check(c.headRevision===head&&JSON.stringify(c.doc)===before,'rejected/altered receipt is atomic: '+variant);
  }
  mode='valid';p=await propose();const beforeStale=calls;ok(await c.dispatch({type:'parameter.set',id:'size',value:'52'}));head=c.headRevision;
  bad(await c.dispatch(p.confirmation.retry),'STALE_CONFIRMATION');check(calls===beforeStale&&c.headRevision===head,'stale proposal does not invoke hook');
  p=await propose();entered=deferred();gate=deferred();const accepting=c.dispatch(p.confirmation.retry);await entered.promise;
  ok(await c.dispatch({type:'parameter.set',id:'size',value:'53'}));head=c.headRevision;gate.resolve();bad(await accepting);check(c.headRevision===head,'changed revision during hook cannot commit');entered=gate=null;
  mode='loss';p=await propose();head=c.headRevision;bad(await c.dispatch(p.confirmation.retry));check(c.headRevision===head&&!c.store.status().canEdit,'receipt cannot bypass online publication guard');
  return {ingestStateFrozen:true,oneCommit:true,rejectedVariants:5,staleBeforeAndDuring:true,isolatedInputBytes:true,onlineGate:true};
 });},
 async importedFontMetadataRoundtrip(){return scoped(async({c,adapters})=>{
  await create(c);const metadata={id:'TEST-font-metadata',label:'Explicit metadata propagation fixture',axes:[{tag:'wght',min:100,max:900,default:400}],testOnly:true};
  adapters.source.ingest=async input=>{check(input.purpose==='font'&&Object.isFrozen(input.state),'font ingest frozen state');return {version:input.version,ticket:input.ticket,kind:'text',metadata};};
  // This tests metadata retention, not native font validity. The parent font adapter validates real fonts.
  ok(await c.importFile(new File([new Uint8Array([84,69,83,84])],'TEST-font.otf',{type:'font/otf'}),'font'));
  const hash=c.doc.state.content.app.fontAssets[0],id=c.projectId;
  check(canonicalJSON(c.doc.state.provenance.inputFonts[hash])===canonicalJSON(metadata),'font metadata retained by original hash');
  ok(await c.dispatch({type:'project.open',id}));check(canonicalJSON(c.doc.state.provenance.inputFonts[hash])===canonicalJSON(metadata),'font metadata survives reopen');
  return {metadataRoundtrip:true,fontValidation:'parent adapter; explicit metadata fixture here'};
 });},

 async onlineGrantAndCachedRefusal(){return scoped(async({c,me,control})=>{
  await create(c);check(c.leaseCapability.trust==='authenticated-online','explicit online trust');
  const rows=await readRecords(c.store.db,'meta');check(rows.length>0,'watermark exists');
  check(rows.every(r=>Object.keys(r).every(k=>['key','lastSeen','authVersion'].includes(k))),'no persisted grant/lease/credentials');
  const head=c.headRevision,forged={userId:me.user.id,deviceId:me.deviceId,authVersion:me.user.authVersion,verifiedAt:c.now(),expiresAt:c.now()+10000,verified:true};
  bad(await c.resumeOffline({user:me.user,verifiedLease:forged}),'OFFLINE_PROOF_REQUIRED');check(c.headRevision===head,'rejected cached bool atomic');
  let rejected=false;try{await c.store.unlockOnline({...forged,kind:'authenticated-online'});}catch(e){rejected=e.code==='ONLINE_GRANT_REQUIRED';}check(rejected,'JSON grant refused');
  const api=new ApiClient({origin:location.origin});try{api.consumeOnlineExchange({value:me},{value:{}});throw Error('copied receipt accepted');}catch(e){check(e.code==='ONLINE_EXCHANGE_REQUIRED','fresh receipt required');}
  return {backend:c.store.capabilities.selectedBackend,preflights:control.reads,metadataKeys:Object.keys(rows[0]),cachedProofRejected:true};
 });},
 async onlineLossBeforeMutationAndRescue(){return scoped(async({c,control,controls})=>{
  await create(c);ok(await c.importFile(svg()));const id=c.projectId,head=await readRecord(c.store.db,'heads',id),raw=c.doc.state.content.app.source.raw.hash;
  control.lost=true;bad(await c.dispatch({type:'parameter.set',id:'size',value:'66'}));
  check(JSON.stringify(await readRecord(c.store.db,'heads',id))===JSON.stringify(head),'head unchanged before mutation');
  check(!c.store.status().canEdit&&c.store.status().canRescue,'rescue-only');
  check(c.doc===null&&c.assets.size===0&&c.visible===null,'private model/source cleared');
  c.offset+=86400001;ok(await c.exportFile('project'));const pkg=await inspectRescuePackage(controls.downloads.at(-1).bytes);check(pkg.files.has('assets/'+raw+'.bin'),'original bytes rescued after expiry');
  c.setOnline(true);bad(await c.dispatch({type:'parameter.set',id:'size',value:'67'}));check(c.headRevision===head.revision,'online hint did not authorize');
  return {retainedHead:head.revision,rescueAfterExpiry:true,networkFault:'aborted real fetch'};
 });},
 async onlineLossDuringBuild(){return scoped(async({c,control,controls,adapters})=>{
  await create(c);ok(await c.importFile(svg()));ok(await c.dispatch({type:'geometry.build'}));
  const previous=c.visible.lease.leaseId,head=c.headRevision,entered=deferred(),gate=deferred(),original=adapters.engine.build;
  adapters.engine.build=async input=>{entered.resolve();await gate.promise;return original(input);};
  let actualTerminated=0;
  const editing=createEditingClient({workerFactory:url=>{const worker=new Worker(url,{type:'module'}),terminate=worker.terminate.bind(worker);worker.terminate=()=>{actualTerminated++;terminate();};return worker;}});
  await editing.initialize({source:{id:'TEST-private-source',hash:'e'.repeat(64),adapterId:'app-rgba',adapterVersion:'1'},revision:0,image:{width:8,height:8,data:new Uint8Array(256).fill(255),colorSpace:'srgb',alphaMode:'straight'}});
  control.workers.push({terminate:()=>editing.dispose()});
  const pending=c.dispatch({type:'geometry.build'});await entered.promise;const ticket=c.job.id;
  c.setOnline(false);await c.resetBarrier;check(control.terminated===1&&actualTerminated===1,'actual initialized private Dedicated Worker terminated');
  try{await editing.prepare({});throw Error('closed client still accepts work');}catch(e){check(e.code==='EDIT_WORKER_CLOSED','private RPC closed');}gate.resolve();bad(await pending);
  check(c.headRevision===head,'build loss did not advance head');check(c.visible===null&&controls.releases.includes(previous)&&controls.releases.includes(ticket),'old and late leases released on session loss');
  return {actualWorkerTerminated:1,retainedHead:head,lateLeaseReleased:true};
 });},
 async onlineLossBeforePublish(){return scoped(async({c,control})=>{
  await create(c);ok(await c.importFile(svg()));const id=c.projectId,head=await readRecord(c.store.db,'heads',id);let reached=false;
  control.checkpoint=async name=>{if(name==='publish.before-transaction'){reached=true;control.lost=true;}};
  bad(await c.dispatch({type:'parameter.set',id:'size',value:'68'}));check(reached,'real storage publication checkpoint reached');
  check(JSON.stringify(await readRecord(c.store.db,'heads',id))===JSON.stringify(head),'head unchanged after staged bytes/manifest');
  const pkg=await exportRescuePackage(c.store,id);check(pkg.metadata.complete,'previous committed assets retained');
  return {checkpoint:'publish.before-transaction',backend:c.store.capabilities.selectedBackend,headUnchanged:true};
 });},
 async onlineIdentityReconnectBarrier(){return scoped(async({c,control,me,adapters,controls})=>{
  await create(c);const oldStore=c.store,oldId=c.projectId,entered=deferred(),gate=deferred(),original=adapters.engine.build;
  adapters.engine.build=async input=>{entered.resolve();await gate.promise;return original(input);};
  const building=c.dispatch({type:'geometry.build'});await entered.promise;const ticket=c.job.id;
  control.resetGate=deferred();await globalThis.__testSessionIdentity('b');gate.resolve();
  // A request observable barrier, no assumed timeout or navigator online grant.
  for(let i=0;i<500&&!oldStore.status().canRescue;i++)await new Promise(r=>setTimeout(r,1));
  const deadline=performance.now()+15000;while(c.epoch===1){check(performance.now()<deadline,'identity failure did not invalidate');await new Promise(r=>setTimeout(r,5));}
  const before=control.requests,reconnecting=c.initialize();await Promise.resolve();await Promise.resolve();
  check(control.requests===before,'new identity fetch waits for private reset');
  control.resetGate.resolve();bad(await building);ok(await reconnecting);
  check(c.session.user.id!==me.user.id&&c.projectId===''&&c.visible===null&&c.assets.size===0,'different identity has no old private state');
  check(!oldStore.status().canRescue&&controls.releases.includes(ticket),'old namespace closed and late lease dropped');
  const loaded=await c.store.load(oldId);check(loaded.status==='empty','per-user namespace separation');
  return {waitedResetBarrier:true,identityChanged:true,namespaceSeparated:true};
 });},
 async onlinePickerActivation(){return scoped(async({c,control,adapters})=>{
  await create(c);const chosen=deferred(),before=control.requests;let picked=false;
  adapters.mirror={version:'arch-app-adapters/1',capabilities:[{id:'storage.mirror',available:true}],pickDirectory(){picked=true;return chosen.promise;},reset(){}};
  const pending=c.pickMirrorDirectory();check(picked&&control.requests===before,'picker executes synchronously before fetch');
  control.lost=true;chosen.resolve({id:'TEST-picked-directory'});bad(await pending);
  check(c.mirror===null,'no handle commit on failed online guard');
  return {synchronousPicker:true,failedCommitGuard:true};
 });},
 async onlineInvalidSignatureNeverFallback(){return scoped(async({c,stores})=>{
  bad(await c.initialize(),'LEASE_SIGNATURE');check(stores.length===0,'false signature never unlocks storage');
  return {negativeSignatureBranch:'explicit WebCrypto verify=false test double',onlineFallback:false};
 },{mode:'invalid'});},
 async signedOfflineOrExplicitUnavailable(){return scoped(async({c,control,stores})=>{
  const initialized=await c.initialize();
  if(!initialized.ok){bad(initialized,'LEASE_SIGNATURE_UNSUPPORTED');check(stores.length===0,'unsupported default blocks');return {capability:{id:'lease.ed25519.default-offline',status:'unavailable',reason:'NotSupportedError'},defaultBlocked:true};}
  check(c.leaseCapability.trust==='webcrypto'&&c.onlineSession===null,'real verified default');
  ok(await c.dispatch({type:'project.create',product:'keychain'}));const before=control.requests;c.setOnline(false);control.lost=true;
  ok(await c.dispatch({type:'parameter.set',id:'size',value:'51'}));check(control.requests===before,'verified offline editing made no network request');
  c.offset+=86400001;bad(await c.dispatch({type:'parameter.set',id:'size',value:'52'}),'PROJECT_LOCKED');check(c.store.status().canRescue,'signed expiry rescue');
  return {capability:{id:'lease.ed25519.default-offline',status:'supported'},verifiedOffline:true};
 },{mode:'native',policy:'signed-offline'});}
};

