import {createMeshCandidateQualification} from '../src/candidate-qualification.mjs';
import * as domain from '../../domain/index.mjs';
import {appContent,appendDocument,newDocument,verifyDocument,commitInventory,moveDocument} from '../../app/documents.mjs';
import {domainStateFingerprint,openProjectStore,canonicalJSON,sha256} from '../../storage/index.mjs';
import {createMechanicsDomainAdapter} from '../../kernel/mechanics/src/domain-adapter.mjs';
import {packProductRequest,readProductSemantics} from '../../core/product-operations.mjs';
import {materials,regions} from '../../../tests/product-runtime/fixtures.mjs';
import {createRootMeshAdapter} from '../src/root-app-adapter.mjs';
import {createFinalSceneEvidence} from '../../integration/final-scene-evidence.mjs';
import {createMeshReplayRecord,meshParameterBindings,prepareMeshHostTransaction,replayMeshRequest,createMeshReplayPublication} from '../src/app-csg-transaction.mjs';
import {matrixBinary64LE} from '../src/root-runtime.mjs';
import {source,productFixture,inputFixture,affine,selectionFor,commandFor,bindingInventory} from './root-fixtures.mjs';
const assert=(v,s)=>{if(!v)throw Error(s);},clone=x=>structuredClone(x),encoder=new TextEncoder();
async function reject(f,code){try{await f();}catch(e){assert((e.code??e.message)===code,'expected '+code+' got '+(e.code??e.message));return;}throw Error('expected '+code);}
export async function durableHistoryProof({client,generation,pin,artifacts,failureMode='none'}){
 const userId='mesh-proof-'+crypto.randomUUID(),projectId='mesh-project',now=Date.now(),engine={id:'arch-root-mesh-proof',version:pin.wasm.sha256};
 const store=await openProjectStore({userId,deviceId:'local-owned-browser',now:()=>now,policy:{backend:'idb',coordination:'cas-only'}});
 await store.unlock({userId,deviceId:'local-owned-browser',authVersion:1,verifiedAt:now,expiresAt:now+3600000,verified:true});
 let adapter,prepared,proposal,host,transaction=null,replayPublication=null;const leases=new WeakMap(),releases=[];
 const post=client.worker.postMessage.bind(client.worker);
 client.worker.postMessage=(data,...args)=>{if(data.type==='release')releases.push(data.id);return post(data,...args);};
 let lastQualifiedModel,lastQualifiedId,loseSessionAfterAck=false;
 const storeCommit=store.commit.bind(store);
 store.commit=async(...args)=>{const ack=await storeCommit(...args);if(loseSessionAfterAck){loseSessionAfterAck=false;host.sessionKey='after-durable-session-change';}return ack;};

 const control=()=>({version:'arch-app-adapters/1',ticket:{id:crypto.randomUUID(),userId,projectId,revision:host.document.state.revision,generation:1},signal:new AbortController().signal,onProgress:()=>{}});
 const current=()=>host,context=()=>({userId,projectId,state:host.document.state,headHash:host.headHash,sessionKey:host.sessionKey,model:host.model});
 const operation=(c,f)=>{assert(!c.signal.aborted,'cancelled');return f(client,generation());};
 const generated=new Set();
 async function baseModel(baseState,liveState){
  const headHash=await domainStateFingerprint(liveState),s=clone(baseState);s.revision=liveState.revision;
  const record=createMechanicsDomainAdapter(domain)(s),packed=packProductRequest({domainRecord:record,headHash,sourceHash:await sha256(source),
   sourceId:9007199254741099n,provenanceId:2000n,regions,materials,upstreamBindings:record.records.filter(r=>r.fieldId<=7).sort((a,b)=>a.fieldId-b.fieldId),
   provenance:{kind:'authored-root-history-oracle/1',regionSources:regions.map(r=>({sourceIndex:r.sourceIndex,sourceKey:r.sourceIndex===0?'left':'right',semanticId:r.semanticId.toString()})),materials:[...materials,...regions.map(r=>r.material)].map(m=>({...m,id:'explicit-material-'+m.provenanceId}))}});
  const root=await client.build({kind:'product',source:{kind:'svg',source},packed},{generation:generation()});
  let released=false;const m={bytes:()=>root.bytes(),generation:root.generation,release(){if(!released){released=true;leases.delete(m);root.release();generated.delete(m);}}};
  generated.add(m);leases.set(m,{root,client});return m;
 }
 const qualification=args=>{lastQualifiedModel=args.model;lastQualifiedId=leases.get(args.model).root.id;return createMeshCandidateQualification({mesh:adapter,kernelLeases:leases,operation})(args);};
 try{
  const input=inputFixture('obj'),transform=affine(31,3,-2,1),sourceBytes=encoder.encode(source),sourceHash=await sha256(sourceBytes),rawHash=await sha256(input.bytes);
  const initial=await newDocument('keychain'),state=clone(productFixture({sourceHash,headHash:'a'.repeat(64)}).project);
  state.content={app:appContent('Immutable imported mesh history')};
  state.content.app.materials=[['body',1,'#30353b'],['left',2,'#e04444'],['right',3,'#3388ee'],['tool',8,'#30353b']].map(([id,slot,color])=>({id,label:id,role:'other',slot,color,excluded:false,overridden:true}));
  state.content.app.source={id:'generated-original',name:'analytic.svg',kind:'svg',revision:0,raw:{hash:sourceHash,byteLength:sourceBytes.length},assetHashes:[sourceHash],metadata:{}};
  state.content.app.mesh={id:'import-history-source',name:input.name,kind:'mesh',revision:0,raw:{hash:rawHash,byteLength:input.bytes.length},assetHashes:[rawHash],
   applied:false,metadata:{meshImport:{version:'arch-mesh-ingest/1',format:'obj',original:{sha256:rawHash,byteLength:input.bytes.length},unit:null}}};
  const assets=new Map(initial.assets);
  for(const [hash,bytes]of[[sourceHash,sourceBytes],[rawHash,input.bytes]])assets.set(hash,{hash,bytes,byteLength:bytes.length,kind:'source'});
  const before=await appendDocument(initial.document,state,assets,{type:'authored.fixture-import'});
  const first=await store.commit({projectId,expectedRevision:0,transactionId:crypto.randomUUID(),engine,document:before.document,assets:commitInventory(before.document,before.assets)});
  host={document:before.document,assets:before.assets,model:null,headRevision:first.head.revision,headHash:await domainStateFingerprint(state),sessionKey:'session-1',store,userId,projectId};
  host.model=await baseModel(state,state);const base=host.model,beforeBytes=base.bytes().slice(),beforeHash=await sha256(beforeBytes);
  adapter=createRootMeshAdapter({operation,kernelLeases:leases,context,commitCandidate:args=>transaction.commitCandidate(args),publishReplay:args=>replayPublication.publishReplay(args)});
  const inventory=bindingInventory(base.bytes(),readProductSemantics(leases.get(base).root.metadata.semanticBytes)),command=commandFor(inventory,transform,'difference');
  const selection=selectionFor(transform),parser={unit:input.unit,materials:input.materials,sourceMaterialAssignments:input.sourceMaterialAssignments,maxErrorMm:input.maxErrorMm};
  const preview=await adapter.prepareInput({control:control(),file:input,mesh:state.content.app.mesh,selection:{input:parser,approval:selection}});
  prepared=await adapter.approveInput(preview,{control:control(),proposalHash:preview.proposalHash});preview.release();
  const proposed=domain.previewCommand(state,{id:'parameters.set',args:{changes:[{id:'impOn',value:true},{id:'impOp',value:'tru'},
   {id:'impRZ',value:31},{id:'impX',value:3},{id:'impY',value:-2},{id:'impZ',value:1}]}});
  assert(proposed.ok,'explicit domain parameters '+JSON.stringify(proposed.issues));const nextState=clone(domain.commitPreview(state,proposed).state);
  const bits=matrixBinary64LE(transform),parameters=meshParameterBindings(nextState,{resolved:{queryToleranceCeilingMm:.002,unit:'millimeter',impZMm:1},transformConvention:'arch-test-approved-T-Rz-S/1',transformBinary64LE:bits});
  const materialNames={'800':'tool','901':'body','902':'left','903':'right'},sourceHashes=[{id:'generated-original',sha256:sourceHash},{id:state.content.app.mesh.id,sha256:rawHash}];
  const rr=await createMeshReplayRecord({original:state.content.app.mesh,baseState:state,assets:host.assets,engine,parser,
   approval:{version:'arch-mesh-input-selection/1',...selection,transformBinary64LE:bits},command,materialNames,sourceHashes,parameters});
  nextState.content.app.mesh={...clone(state.content.app.mesh),applied:true,assetHashes:rr.assetHashes,metadata:{...clone(state.content.app.mesh.metadata),meshCsg:rr.recipe}};
  let installs=0;
  transaction=await prepareMeshHostTransaction({current,nextState,assets:rr.assets,engine,preflight:async()=>{},qualifyCandidate:qualification,
   adopt({candidate,model,head}){if(failureMode==='adopt')throw Object.assign(Error('VIEWPORT_TEST_ADOPTION_EXCEPTION'),{code:'VIEWPORT_TEST_ADOPTION_EXCEPTION'});const old=host.model;host={...host,document:candidate.document,assets:candidate.assets,headRevision:head.revision,headHash:model.mesh.headHash,model};installs++;old.release();return true;}});
  assert(transaction.publication.headHash===await domainStateFingerprint(nextState),'domain head not asset hash');
  const args={model:base,command,publication:transaction.publication,materialNames,sourceHashes};
  proposal=await adapter.prepareApply(prepared,{control:control(),...args});
  // A real competing durable write: same domain content, higher storage CAS counter.
  await store.commit({projectId,expectedRevision:host.headRevision,transactionId:crypto.randomUUID(),engine,document:host.document,assets:commitInventory(host.document,host.assets),provenance:{}});
  await reject(()=>adapter.confirmApply(proposal,{control:control(),proposalHash:proposal.proposalHash}),'CONFLICT');proposal=null;
  assert(installs===0&&host.model===base&&await sha256(base.bytes().slice())===beforeHash,'real failed CAS no partial visible mutation');
  const competing=await store.load(projectId);host.headRevision=competing.headRevision;
  transaction=await prepareMeshHostTransaction({current,nextState,assets:rr.assets,engine,preflight:async()=>{},qualifyCandidate:qualification,
   adopt({candidate,model,head}){if(failureMode==='adopt')throw Object.assign(Error('VIEWPORT_TEST_ADOPTION_EXCEPTION'),{code:'VIEWPORT_TEST_ADOPTION_EXCEPTION'});const old=host.model;host={...host,document:candidate.document,assets:candidate.assets,headRevision:head.revision,headHash:model.mesh.headHash,model};installs++;old.release();return true;}});
  proposal=await adapter.prepareApply(prepared,{control:control(),...args,publication:transaction.publication});
  loseSessionAfterAck=failureMode==='session';
  const committed=await adapter.confirmApply(proposal,{control:control(),proposalHash:proposal.proposalHash});proposal=null;prepared.release();prepared=null;
  assert(committed.committed,'real durable commit');
  if(failureMode==='none')assert(committed.visible&&installs===1,'real history adopted once');
  else{
   assert(committed.visible===false&&committed.model===null&&committed.diagnostic.code==='COMMITTED_MODEL_UNAVAILABLE'&&installs===0&&host.model===base,'committed unavailable variant');
   assert(!leases.has(lastQualifiedModel)&&releases.filter(id=>id===lastQualifiedId).length===1,'unadopted primary released exactly once');
   await reject(async()=>lastQualifiedModel.bytes(),'MESH_MODEL_RETIRED');
  }
  const committedHash=committed.history.derivedSnapshotHash,saved=await store.load(projectId);
  const loadedAssets=new Map(saved.assets.map(a=>[a.hash,{...a,bytes:new Uint8Array(a.bytes)}]));
  const loadedDoc=await verifyDocument(saved.manifest.document,loadedAssets);
  assert(loadedDoc.history.transactions.at(-1).command.receipt.derivedSnapshotHash===committedHash,'actual history receipt');
  assert(await sha256(loadedAssets.get(rawHash).bytes)===rawHash,'immutable original bytes saved');
  const bad=clone(loadedDoc.state);bad.content.app.mesh.metadata.meshCsg.input.approval.unit='inch';
  await reject(()=>replayMeshRequest({state:bad,assets:loadedAssets,engine}),'MESH_REPLAY_UNIT');
  const changed=domain.previewCommand(loadedDoc.state,{id:'parameters.set',args:{changes:[{id:'impX',value:4}]}});
  await reject(()=>replayMeshRequest({state:domain.commitPreview(loadedDoc.state,changed).state,assets:loadedAssets,engine}),'MESH_REPLAY_PARAMETERS_CHANGED');
  const changedBody=domain.previewCommand(loadedDoc.state,{id:'parameters.set',args:{changes:[{id:'baseH',value:{heightMode:'mm',mm:8}}]}});
  await reject(()=>replayMeshRequest({state:domain.commitPreview(loadedDoc.state,changedBody).state,assets:loadedAssets,engine}),'MESH_REPLAY_GENERATED_PARAMETERS_CHANGED');
  host.model.release();host={...host,document:loadedDoc,assets:loadedAssets,model:null,headRevision:saved.headRevision,sessionKey:'reopened',headHash:await domainStateFingerprint(loadedDoc.state)};
  const publish=async()=>{
   replayPublication=await createMeshReplayPublication({current,engine,preflight:async()=>{},qualifyCandidate:qualification,
    adopt({model}){host={...host,model};return true;}});
   const r=replayPublication.replay,b=await baseModel(r.baseState,host.document.state);let pre,pr;
   try{
    const v=await adapter.prepareInput({control:control(),file:r.file,mesh:r.source,selection:r.selection});
    pre=await adapter.approveInput(v,{control:control(),proposalHash:v.proposalHash});v.release();
    pr=await adapter.prepareApply(pre,{control:control(),model:b,command:r.command,materialNames:r.materialNames,sourceHashes:r.sourceHashes,replayRecord:r.recipe});
    const out=await adapter.confirmApply(pr,{control:control(),proposalHash:pr.proposalHash});pr=null;
    assert(out.model===host.model,'replay actual model adoption');
   }finally{pr?.release();pre?.release();b.release();}
  };
  const count=host.document.history.transactions.length;await publish();assert(host.document.history.transactions.length===count,'rebuild appends no history');
  artifacts.push({name:'durable-'+failureMode+'-reopened.arch',bytes:Array.from(host.model.bytes())});
  const restoredRecipe=canonicalJSON(host.document.state.content.app.mesh.metadata.meshCsg);
  for(const direction of ['undo','redo']){
   host.model?.release();const moved=await moveDocument(host.document,host.assets,direction);
   const ack=await store.commit({projectId,expectedRevision:host.headRevision,transactionId:crypto.randomUUID(),engine,document:moved.document,assets:commitInventory(moved.document,moved.assets)});
   host={...host,document:moved.document,assets:moved.assets,headRevision:ack.head.revision,headHash:await domainStateFingerprint(moved.document.state),model:null};
   if(direction==='undo')assert(!host.document.state.content.app.mesh.applied,'undo restores unapplied original');
   else {assert(canonicalJSON(host.document.state.content.app.mesh.metadata.meshCsg)===restoredRecipe,'redo exact recipe');await publish();}
  }
  artifacts.push({name:'durable-'+failureMode+'-redone.arch',bytes:Array.from(host.model.bytes())});
  assert(await sha256(host.assets.get(rawHash).bytes)===rawHash,'undo redo original immutable');
  return {name:'durable-store-'+failureMode+'-CAS-history-reopen-undo-redo',state:'published',backend:store.capabilities.selectedBackend,
   domainRevision:host.document.state.revision,storeRevision:host.headRevision,installs,failureMode,unadoptedPrimaryReleasedOnce:failureMode!=='none',failedCasUnchanged:true,rawHash,committedHash,
   reopenedAndRedone:true,historyTransactions:host.document.history.transactions.length,replayHasFreshNativeGates:true};
 }finally{proposal?.release();prepared?.release();host?.model?.release();for(const m of generated)m.release();adapter?.dispose();transaction?.release();store.close();client.worker.postMessage=post;}
}
