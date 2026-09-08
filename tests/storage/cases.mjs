import {batchCases} from './batch-cases.mjs';
export const cases={...batchCases,
async saveOpenIdentity(h,b){
  const f=await h.fixture(b);const request=h.input('p',0,{text:'source unchanged',document:{title:'Nguyên bản',revision:0,settings:{size:51,clr:0.05,nominalMm:1.7},source:'🇻🇳'}});
  const saved=await f.store.commit(request),loaded=await f.store.load('p');
  h.equal(loaded.status,'editable');h.equal(loaded.manifest.document,request.document);h.equal(loaded.head.revision,1);
  h.equal((await h.storage.encodeManifest(loaded.manifest)).hash,saved.manifestHash);
  h.equal(await h.common.sha256(loaded.rawBytes),saved.manifestHash);
  h.equal(new TextDecoder().decode(loaded.assets[0].bytes),'source unchanged');
  h.equal((await f.store.listProjects())[0].manifestHash,saved.manifestHash);
  h.assert((await f.store.commit(request)).idempotent,'Retry must acknowledge exactly the same payload');
  await h.rejects(()=>f.store.commit({...request,document:{title:'changed'}}),['TRANSACTION_ID_REUSED']);
  const rebuilt=JSON.parse(h.common.canonicalJSON(loaded.manifest.document));
  h.equal(rebuilt,request.document);
  return {backend:f.store.capabilities.selectedBackend,manifestHash:saved.manifestHash,geometryVerified:false};
},
async previousRetentionAndCleanup(h,b){
  const f=await h.fixture(b);let last;const generations=[];
  for(let i=0;i<4;i++){last=await f.store.commit(h.input('p',i));generations.push(last.manifestHash);}
  const loaded=await f.store.load('p');h.equal(loaded.head.previousHash,generations[2]);
  const manifests=await h.rows(f,'manifests');h.equal(manifests.map(m=>m.hash).sort(),generations.slice(2).sort());
  h.equal((await h.rows(f,'objects')).length,2);
  const previous=await f.store.loadRetainedManifest('p',generations[2]);h.equal(previous.status,'editable');
  const before=await h.rows(f,'objects');await f.store.cleanup();await f.store.cleanup();
  h.equal(await h.rows(f,'objects'),before);
  return {generations:4,currentAndPreviousVerified:true};
},
async sourceLossAndHashCorruptionFallback(h,b){
  const outcomes=[];
  for(const action of ['remove','corrupt']){
    const f=await h.fixture(b);const first=await f.store.commit(h.input('p',0,{text:'previous immutable'}));
    await f.store.commit(h.input('p',1,{text:'current different!'}));
    const current=await f.store.load('p');await h.damageAsset(f,current.manifest.sources[0],action);
    const recovered=await f.store.load('p');h.equal(recovered.status,'editable');h.assert(recovered.recoveredPrevious);
    h.equal(recovered.manifestHash,first.manifestHash);h.equal(recovered.headRevision,2);
    h.equal(new TextDecoder().decode(recovered.assets[0].bytes),'previous immutable');
    const pack=await h.storage.exportRescuePackage(f.store,'p');h.assert(!pack.metadata.complete);
    const checked=await h.storage.inspectRescuePackage(pack.bytes);h.equal(checked.status,'importable');
    const recoveryCommit=await f.store.commit(h.input('p',2,{text:'repaired new bytes'}));
    h.equal(recoveryCommit.head.previousHash,first.manifestHash);
    h.equal((await f.store.loadRetainedManifest('p',first.manifestHash)).status,'editable');
    outcomes.push({action,issues:recovered.issues,rescueComplete:pack.metadata.complete});
  }
  return outcomes;
},
async manifestCorruptionFallbackAndConservativeGC(h,b){
  const f=await h.fixture(b);const first=await f.store.commit(h.input('p',0));
  const second=await f.store.commit(h.input('p',1)),bad=await h.row(f,'manifests',second.manifestHash);
  bad.bytes[0]^=1;await h.put(f,'manifests',bad);
  const loaded=await f.store.load('p');h.assert(loaded.recoveredPrevious);h.equal(loaded.manifestHash,first.manifestHash);
  const before=(await h.rows(f,'objects')).length;
  h.equal((await f.store.cleanup()).status,'retained-conservative');h.equal((await h.rows(f,'objects')).length,before);
  const rescue=await h.storage.exportRescuePackage(f.store,'p');
  h.assert(rescue.metadata.files.some(x=>x.type==='unverified-manifest'));
  return {rawCorruptManifestRetained:true,issues:rescue.metadata.issues};
},
async unknownVersionsPreserveRaw(h,b){
  const result=[];
  for(const version of [0,2]){
    const f=await h.fixture(b);await f.store.commit(h.input('p',0));
    const raw=await h.replaceManifest(f,'p',m=>{m.schemaVersion=version;m.future={literal:'001,700',large:'9007199254740993'};});
    const loaded=await f.store.load('p');h.equal(loaded.status,'read-only');
    h.assert(h.common.byteEqual(loaded.rawBytes,raw.bytes));
    await h.rejects(()=>f.store.commit(h.input('p',1)),['READ_ONLY_PROJECT']);
    const pack=await h.storage.exportRescuePackage(f.store,'p');
    const parsed=await h.storage.inspectRescuePackage(pack.bytes);h.equal(parsed.status,'read-only');
    h.assert(h.common.byteEqual(parsed.rawPackage,pack.bytes));
    h.equal((await h.storage.importRescueCopy(f.store,pack.bytes,{projectId:'copy'})).status,'read-only');
    h.equal((await f.store.load('copy')).status,'empty');
    h.equal((await f.store.cleanup()).status,'retained-conservative');
    result.push({version,reason:loaded.reason});
  }
  return result;
},
async quotaAbortAndLateSourceLoss(h,b){
  const result=[];
  for(const type of ['quota','abort','late-loss','lock']){
    let armed=false;const controller=new AbortController();
    const f=await h.fixture(b,{checkpoint:async(name,details)=>{
      if(!armed)return;
      if(type==='quota'&&name==='asset.written')throw new DOMException('Injected quota policy failure','QuotaExceededError');
      if(type==='abort'&&name==='manifest.staged')controller.abort();
      if(type==='lock'&&name==='manifest.staged')f.store.lock();
      if(type==='late-loss'&&name==='publish.before-transaction'){
        const journal=await h.row(f,'journals',details.transactionId);await h.damageAsset(f,journal.pins[0],'remove');
      }
    }});
    const first=await f.store.commit(h.input('p',0));armed=true;
    const error=await h.rejects(()=>f.store.commit(h.input('p',1),{signal:controller.signal}));
    armed=false;if(type==='lock')await f.store.unlock(f.lease);
    h.equal((await h.row(f,'heads','p')).currentHash,first.manifestHash);
    h.equal((await f.store.load('p')).manifestHash,first.manifestHash);
    if(type==='quota'){h.assert(f.store.status().writeBlocked);await h.rejects(()=>f.store.commit(h.input('p',1)),['WRITE_BLOCKED']);}
    result.push({type,code:error.code??error.name,physicalQuotaExhaustion:false});
  }
  return result;
},
async atomicTransactionAbort(h,b){
  const results=[];
  for(const point of ['publish.before-write','publish.after-write']){
    let armed=false;
    const f=await h.fixture(b,{syncCheckpoint:(name,{transaction})=>{if(armed&&name===point)transaction.abort();}});
    const before=await f.store.commit(h.input('p',0));armed=true;
    await h.rejects(()=>f.store.commit(h.input('p',1)));
    h.equal((await h.row(f,'heads','p')).currentHash,before.manifestHash);
    h.equal((await f.store.listProjects())[0].revision,1);
    h.equal((await h.rows(f,'journals')).filter(j=>j.status==='committed').length,1);
    results.push({point,realIDBTransactionAbort:true});
  }
  return results;
},
async faultMatrixTwenty(h,b){
  const points=['journal.started','asset.written','asset.closed','asset.verified','asset.pinned','manifest.before-put','manifest.staged','publish.before-transaction','head.committed','cleanup.after-mark'];
  const records=[];
  for(let n=0;n<20;n++){
    const point=points[n%points.length];let armed=false,hit=false;
    const f=await h.fixture(b,{checkpoint:async name=>{if(armed&&name===point){hit=true;throw h.crash(name);}}});
    const first=await f.store.commit(h.input('p',0,{text:'old-'+n}));armed=true;
    const request=h.input('p',1,{text:'new-'+n,transactionId:'fault-'+n});
    await h.rejects(()=>f.store.commit(request),['FAULT_CHECKPOINT']);h.assert(hit,'Checkpoint must be exercised');
    f.store.close();
    const reopened=await h.fixture(b,{userId:f.userId});
    const loaded=await reopened.store.load('p'),committed=['head.committed','cleanup.after-mark'].includes(point);
    h.equal(loaded.status,'editable');h.equal(loaded.head.revision,committed?2:1);
    if(!committed)h.equal(loaded.manifestHash,first.manifestHash);
    const resumed=await reopened.store.commit(request);
    h.equal(resumed.idempotent,committed);h.equal((await reopened.store.load('p')).head.revision,2);
    await reopened.store.cleanup();await reopened.store.cleanup();
    records.push({point,committedAtFault:committed,resumed:true});
  }
  return {iterations:records.length,records,physicalCrashProof:false};
},
async cleanupInterruptedIsIdempotent(h,b){
  let armed=false;
  const f=await h.fixture(b,{checkpoint:async name=>{if(armed&&name==='cleanup.asset-removed')throw h.crash(name);}});
  await f.store.commit(h.input('p',0));await f.store.commit(h.input('p',1));armed=true;
  await h.rejects(()=>f.store.commit(h.input('p',2)),['FAULT_CHECKPOINT']);armed=false;
  h.equal((await f.store.load('p')).head.revision,3);
  await f.store.cleanup();await f.store.cleanup();
  h.equal((await h.rows(f,'objects')).length,2);
  return {publishedGeneration:3,cleanupResumed:true};
},
async leaseNamespacesAndLogout(h,b){
  const a=await h.fixture(b),other=await h.fixture(b);
  const first=await a.store.commit(h.input('p',0));
  h.equal((await other.store.load('p')).status,'empty');h.assert(a.store.namespace!==other.store.namespace);
  await h.rejects(()=>a.store.unlock(other.lease),['USER_MISMATCH']);
  await h.rejects(()=>a.store.unlock({...a.lease,deviceId:'wrong-device'}),['USER_MISMATCH']);
  await h.rejects(()=>a.store.unlock({...a.lease,verified:false}),['LEASE_UNVERIFIED']);
  a.store.lock();await h.rejects(()=>a.store.load('p'),['LOCKED']);
  await h.rejects(()=>h.storage.exportRescuePackage(a.store,'p'),['LOCKED']);
  await a.store.unlock(a.lease);h.equal((await a.store.load('p')).manifestHash,first.manifestHash);
  a.time.value=a.lease.expiresAt;h.equal(a.store.status().mode,'rescue');
  await h.rejects(()=>a.store.load('p'),['LEASE_EXPIRED_OR_CLOCK']);
  await h.rejects(()=>a.store.commit(h.input('p',1)),['LEASE_EXPIRED_OR_CLOCK']);
  const pack=await h.storage.exportRescuePackage(a.store,'p');h.assert(pack.metadata.complete);
  const meta=await h.rows(a,'meta');h.assert(!JSON.stringify(meta).includes('expiresAt'));
  return {namespaceSeparation:true,expiredRescue:true,logoutDeletesBytes:false};
},
async rollbackAndAuthVersionFences(h,b){
  const f=await h.fixture(b);await f.store.commit(h.input('p',0));
  f.time.value+=600000;await f.store.commit(h.input('p',1));
  f.time.value-=300001;h.equal(f.store.status().mode,'rescue');
  await h.rejects(()=>f.store.load('p'),['CLOCK_ROLLBACK']);
  h.assert((await h.storage.exportRescuePackage(f.store,'p')).metadata.complete);
  const reopened=await h.fixture(b,{userId:f.userId});h.equal(reopened.store.status().mode,'rescue');
  const newer=await h.fixture(b);await newer.store.unlock({...newer.lease,authVersion:2});
  await h.rejects(()=>newer.store.unlock({...newer.lease,authVersion:1}),['AUTH_VERSION']);
  return {persistedMaxClock:true,rollbackMs:300001,downgradeRejected:true};
},
async importCopyAndValidation(h,b){
  const source=await h.fixture(b);await source.store.commit(h.input('source',0));const raw=await h.storage.exportRescuePackage(source.store,'source');
  const dest=await h.fixture(b);const copied=await h.storage.importRescueCopy(dest.store,raw.bytes,{projectId:'copy'});
  h.equal(copied.status,'imported-copy');const loaded=await dest.store.load('copy');
  h.equal(loaded.manifest.document,(await source.store.load('source')).manifest.document);
  h.assert(loaded.manifest.dependencies.includes(raw.sha256),'Original ZIP bytes must be retained as COW backup');
  h.equal(loaded.manifest.provenance.importedFrom.namespace,source.store.namespace);
  await h.rejects(()=>h.storage.importRescueCopy(dest.store,raw.bytes,{projectId:'copy'}),['IMPORT_TARGET_EXISTS']);
  const files=h.zip.readStoredZip(raw.bytes),entries=()=>[...files].map(([name,bytes])=>({name,bytes}));
  const assetName=[...files.keys()].find(k=>k.startsWith('assets/'));files.set(assetName,new Uint8Array(files.get(assetName).length).fill(120));
  const wrongHash=h.zip.writeStoredZip(entries());
  await h.rejects(()=>h.storage.importRescueCopy(dest.store,wrongHash,{projectId:'invalid'}),['PACKAGE_HASH']);
  h.equal((await dest.store.load('invalid')).status,'empty');
  const metadata=JSON.parse(new TextDecoder().decode(files.get('package.json')));metadata.schemaVersion=99;metadata.future='opaque';
  files.set('package.json',h.common.encoder.encode(JSON.stringify(metadata)));const future=h.zip.writeStoredZip(entries());
  const unknown=await h.storage.importRescueCopy(dest.store,future,{projectId:'future'});
  h.equal(unknown.status,'read-only');h.assert(h.common.byteEqual(unknown.rawPackage,future));
  globalThis.lastRescue={bytes:Array.from(raw.bytes),metadata:raw.metadata,sha256:raw.sha256};
  return {originalBackupHash:copied.originalPackageHash,crossUserExplicitImport:true,noPartialImport:true};
},
async rawJSONAndSecretGuards(h,b){
  const f=await h.fixture(b);
  for(const raw of ['{"x":1,"x":2}','{"__proto__":{"polluted":true}}','{"n":9007199254740993}','{"n":1e400}'])
    await h.rejects(()=>h.common.parseJSON(raw));
  h.equal(h.common.parseJSON('{"n":0.05,"x":1.7,"raw":"1,7"}'),{n:0.05,x:1.7,raw:'1,7'});
  let deep='0';for(let i=0;i<66;i++)deep='['+deep+']';await h.rejects(()=>h.common.parseJSON(deep),['JSON_BUDGET']);
  for(const key of ['accessToken','providerCredentials','sessionCookie','api_key']){
    const request=h.input('secret',0);request.document[key]='never persisted';
    await h.rejects(()=>f.store.commit(request),['SECRET_FIELD']);
  }
  h.equal((await h.rows(f,'heads')).length,0);h.equal((await h.rows(f,'journals')).length,0);
  const cyclic={};cyclic.self=cyclic;await h.rejects(()=>h.common.cloneJSON(cyclic),['JSON_CYCLE']);
  await h.rejects(()=>h.common.cloneJSON({get x(){throw new Error('getter executed');}}),['JSON_ACCESSOR']);
  return {exactNumbers:true,opaqueDecimalStrings:true,noCredentialFieldsWritten:true};
},
async ackAndReplicaContract(h,b){
  const good={transactionId:'t',generation:2,stepId:'head.committed',hash:'a'.repeat(64),status:'ok'};
  h.assert(h.storage.validateAck(good,good));
  for(const changed of [{transactionId:'other'},{generation:1},{stepId:'asset.closed'},{hash:'b'.repeat(64)}])
    await h.rejects(()=>h.storage.validateAck(good,{...good,...changed}),['STALE_ACK']);
  const local={manifestHash:'a'.repeat(64),revision:3},remote={manifestHash:'b'.repeat(64),revision:2,etag:'e2'};
  const result=h.storage.planReplicaPublication({local,remote,expectedETag:'e1'});
  h.equal(result.status,'conflict');h.equal(result.localCopy,local);h.equal(result.remoteCopy,remote);
  return {cloudCapability:h.storage.CLOUD_REPLICA_CAPABILITY};
}
};

Object.assign(cases,{
async historyThreeStepUndoRedo(h,b){
  const f=await h.fixture(b),snapshots=new Map();let state={revision:0,product:'keychain',size:50,manual:{clr:0.05,raw:'1,7'}};
  const remember=async s=>{const ref=await h.storage.snapshotReference(s);snapshots.set(ref.stateHash,structuredClone(s));return ref;};
  let history=h.storage.createHistory(await remember(state));let storedRevision=0;
  const save=async()=>{await f.store.commit(h.input('p',storedRevision,{text:'shared-original',document:{state,history}}));storedRevision++;};
  await save();
  for(let i=1;i<=3;i++){
    const next={...state,revision:i,size:50+i},after=await remember(next);
    history=await h.storage.acceptHistoryAppend(history,await h.storage.planHistoryAppend(history,{id:'tx'+i,after,command:{type:'size',value:50+i}}));
    state=next;await save();
  }
  const revisions=[state.revision],sizes=[state.size];
  const validateDomain=candidate=>{
    h.assert(candidate.product==='keychain'&&Number.isSafeInteger(candidate.revision)&&candidate.size>=1&&candidate.size<=200);
    h.equal(candidate.manual,{clr:0.05,raw:'1,7'});return candidate;
  };
  for(const direction of ['undo','undo','undo','redo','redo','redo']){
    const plan=await h.storage.planHistoryMove(history,direction);
    const applied=await h.storage.restoreDomainSnapshot(state,snapshots.get(plan.target.stateHash),plan,{validateDomain});
    const proposedHistory=await h.storage.acceptHistoryMove(history,plan,applied.appliedReference);
    state=applied.candidate;history=proposedHistory;await save();
    const reopened=await f.store.load('p');h.equal(reopened.manifest.document,{state,history});
    revisions.push(state.revision);sizes.push(state.size);
  }
  h.equal(revisions,[3,4,5,6,7,8,9]);h.equal(sizes,[53,52,51,50,51,52,53]);
  const stale=await h.storage.planHistoryMove(history,'undo');
  await h.rejects(()=>h.storage.restoreDomainSnapshot({...state,size:88},snapshots.get(stale.target.stateHash),stale,{validateDomain}),['STALE_HISTORY_BRANCH']);
  await h.rejects(()=>h.storage.restoreDomainSnapshot({...state,revision:8},snapshots.get(stale.target.stateHash),stale,{validateDomain}),['STALE_HISTORY_BRANCH']);
  const restored=await h.storage.restoreDomainSnapshot(state,snapshots.get(stale.target.stateHash),stale,{validateDomain});
  history=await h.storage.acceptHistoryMove(history,stale,restored.appliedReference);state=restored.candidate;await save();
  const redo=await h.storage.planHistoryMove(history,'redo');
  const branch={...state,revision:state.revision+1,size:60};
  const append=await h.storage.planHistoryAppend(history,{id:'new-branch',after:await remember(branch),command:{type:'size',value:60}});
  h.equal(append.discardedRedo,['tx3']);
  history=await h.storage.acceptHistoryAppend(history,append);state=branch;await save();
  await h.rejects(()=>h.storage.acceptHistoryMove(history,redo,restored.appliedReference),['STALE_HISTORY_BRANCH']);
  await h.rejects(()=>h.storage.planHistoryMove(history,'redo'),['HISTORY_EMPTY']);
  return {revisions,sizes,staleBranchRejected:true,domainValidator:'fixture injected; parent real adapter tested separately',atomicDocumentCommit:true};
},
async historyBudgetAndPruning(h,b){
  const shared='a'.repeat(64),older='b'.repeat(64);
  let state={revision:0,size:50},current=await h.storage.snapshotReference(state,{assetHashes:[shared]});
  let history=h.storage.createHistory(current,{assets:[{hash:shared,byteLength:32*1024*1024}]});
  for(let i=1;i<=21;i++){
    state={revision:i,size:50+i};const after=await h.storage.snapshotReference(state,{assetHashes:[shared]});
    const plan=await h.storage.planHistoryAppend(history,{id:'budget-'+i,after,command:{type:'size',value:state.size}});
    if(i===21){h.assert(plan.requiresPruningAcceptance);await h.rejects(()=>h.storage.acceptHistoryAppend(history,plan),['HISTORY_PRUNING_REQUIRED']);h.equal(plan.evicted,['budget-1']);}
    history=await h.storage.acceptHistoryAppend(history,plan,{acceptPruning:true});
  }
  const cost=h.storage.historyCost(history);h.equal(cost.transactions,20);h.equal(cost.assetBytes,0);h.equal(history.current.projectRevision,21);
  const stalePlan=await h.storage.planHistoryAppend(history,{id:'tamper',after:await h.storage.snapshotReference({revision:22,size:72},{assetHashes:[shared]}),command:{type:'size'}});
  stalePlan.next.current.projectRevision=99;await h.rejects(()=>h.storage.acceptHistoryAppend(history,stalePlan,{acceptPruning:true}),['HISTORY_PLAN_CHANGED']);
  const initial=await h.storage.snapshotReference({revision:0,size:1},{assetHashes:[older]});
  let large=h.storage.createHistory(initial,{assets:[{hash:older,byteLength:25*1024*1024},{hash:shared,byteLength:80*1024*1024}]});
  const next=await h.storage.snapshotReference({revision:1,size:2},{assetHashes:[shared]});
  const plan=await h.storage.planHistoryAppend(large,{id:'over24',after:next,command:{type:'replace-source'}});
  h.equal(plan.evicted,['over24']);await h.rejects(()=>h.storage.acceptHistoryAppend(large,plan),['HISTORY_PRUNING_REQUIRED']);
  large=await h.storage.acceptHistoryAppend(large,plan,{acceptPruning:true});h.equal(large.current,next);h.equal(large.transactions.length,0);
  return {transactionLimit:20,byteLimit:24*1024*1024,retainedCurrentBytes:80*1024*1024,dedupCost:cost,physicalByteAllocation:false};
},
async historyAssetsRetainedByManifest(h,b){
  const f=await h.fixture(b);const first=await f.store.commit(h.input('p',0));
  await f.store.commit(h.input('p',1,{retainManifests:[first.manifestHash]}));
  await f.store.commit(h.input('p',2,{retainManifests:[first.manifestHash]}));
  const old=await f.store.loadRetainedManifest('p',first.manifestHash);h.equal(old.status,'editable');
  h.equal((await h.rows(f,'objects')).length,3);
  await f.store.commit(h.input('p',3));h.equal((await f.store.loadRetainedManifest('p',first.manifestHash)).status,'editable');
  await f.store.commit(h.input('p',4));await h.rejects(()=>f.store.loadRetainedManifest('p',first.manifestHash),['HISTORY_REFERENCE']);
  h.equal((await h.rows(f,'objects')).length,2);
  return {historyAndPreviousHistoryProtected:true,removedOnlyAfterBothRelease:true};
},
async zipBoundaryValidation(h,b){
  const valid=h.zip.writeStoredZip([{name:'assets/a.bin',bytes:new Uint8Array([1,2,3])}]);
  h.equal([...h.zip.readStoredZip(valid).keys()],['assets/a.bin']);
  const crc=valid.slice();crc[30+'assets/a.bin'.length]^=1;await h.rejects(()=>h.zip.readStoredZip(crc),['ZIP_CRC']);
  for(const name of ['../outside','/absolute','a/../../x','a//x','a\\\\x','a/./x'])
    await h.rejects(()=>h.zip.writeStoredZip([{name,bytes:new Uint8Array([1])}]),['ZIP_PATH']);
  await h.rejects(()=>h.zip.writeStoredZip([{name:'a',bytes:new Uint8Array()},{name:'a',bytes:new Uint8Array()}]),['ZIP_DUPLICATE']);
  const traversal=valid.slice();const from='assets/a.bin',to='../bad/a.bin';
  for(let i=0;i<=traversal.length-from.length;i++){
    if(new TextDecoder().decode(traversal.subarray(i,i+from.length))===from)traversal.set(h.common.encoder.encode(to),i);
  }
  await h.rejects(()=>h.zip.readStoredZip(traversal),['ZIP_PATH']);
  const central=new DataView(valid.buffer).getUint32(valid.length-6,true);
  const huge=valid.slice(),view=new DataView(huge.buffer);view.setUint32(central+20,129*1024*1024,true);view.setUint32(central+24,129*1024*1024,true);
  await h.rejects(()=>h.zip.readStoredZip(huge),['ZIP_BUDGET']);
  const compressed=valid.slice();new DataView(compressed.buffer).setUint16(central+10,8,true);
  await h.rejects(()=>h.zip.readStoredZip(compressed),['ZIP_COMPRESSION_UNSUPPORTED']);
  const encrypted=valid.slice();new DataView(encrypted.buffer).setUint16(central+8,1,true);
  await h.rejects(()=>h.zip.readStoredZip(encrypted),['ZIP_FLAGS']);
  return {crc:true,traversal:true,budgetBeforeAllocation:true,deflate:'explicitly unsupported'};
}
});

Object.assign(cases,{
async unknownDomainHeadAndDatabaseVersions(h,b){
  const outcomes=[];
  for(const type of ['domain','head','database']){
    const f=await h.fixture(b);await f.store.commit(h.input('p',0));let active=f;
    if(type==='domain')await h.replaceManifest(f,'p',m=>{m.domainSchemaVersion=2;});
    if(type==='head'){const head=await h.row(f,'heads','p');head.schemaVersion=2;head.future='001,700';await h.put(f,'heads',head);}
    if(type==='database'){
      const name=f.store.databaseName;f.store.close();
      await new Promise((resolve,reject)=>{const r=indexedDB.open(name,2);r.onerror=()=>reject(r.error);r.onsuccess=()=>{r.result.close();resolve();};});
      active=await h.fixture(b,{userId:f.userId});h.assert(active.store.capabilities.database.readOnly);
    }
    const loaded=await active.store.load('p');h.equal(loaded.status,'read-only');
    await h.rejects(()=>active.store.commit(h.input('p',1)),type==='database'?['READ_ONLY_DATABASE']:['READ_ONLY_PROJECT']);
    const pack=await h.storage.exportRescuePackage(active.store,'p');h.assert(pack.metadata.files.some(x=>x.type==='asset'));
    const inspected=await h.storage.inspectRescuePackage(pack.bytes);
    h.equal(inspected.status,type==='database'?'importable':'read-only');
    if(type==='database'){
      const db=active.store.db;h.equal(db.version,2);
      const receiver=await h.fixture(b);h.equal((await h.storage.importRescueCopy(receiver.store,pack.bytes,{projectId:'recovered'})).status,'imported-copy');
      h.equal(db.version,2);
    }
    outcomes.push({type,reason:loaded.reason,rawPackageBytes:pack.bytes.length,importStatus:inspected.status,sourceNeverMigrated:true});
  }
  return outcomes;
},
async explicitFallbackPolicy(h,b){
  const preferred=await h.fixture('prefer-opfs'),cap=preferred.store.capabilities;
  if(cap.selectedBackend===null){
    await h.rejects(()=>preferred.store.commit(h.input('p',0)),['BYTE_STORE_UNAVAILABLE']);
    h.equal((await preferred.store.load('p')).status,'empty');
    const approved=await h.fixture('prefer-opfs',{policy:{fallbackWhen:['unsupported','verification-failed']}});
    h.equal(approved.store.capabilities.selectedBackend,'idb');
    await approved.store.commit(h.input('p',0));h.equal((await approved.store.load('p')).status,'editable');
    return {defaultPolicy:'blocked',exactOPFSOutcome:cap.opfs,explicitFallback:'idb verified',fallbackNeverMidCommit:true};
  }
  await preferred.store.commit(h.input('p',0));h.equal((await preferred.store.load('p')).status,'editable');
  return {defaultPolicy:cap.selectedBackend,exactOPFSOutcome:cap.opfs,fallbackNeverMidCommit:true};
},
async observedReadClockPersists(h,b){
  const f=await h.fixture(b);await f.store.commit(h.input('p',0));f.time.value+=600000;
  await f.store.load('p');f.store.close();
  const reopened=await h.fixture(b,{userId:f.userId});h.equal(reopened.store.status().mode,'rescue');
  h.assert((await h.storage.exportRescuePackage(reopened.store,'p')).metadata.complete);
  return {readCheckpointPersistsClock:true,reopenRollbackRescue:true};
},
async forgedManifestSidecarCannotOmitRescueSource(h,b){
  const f=await h.fixture(b);const saved=await f.store.commit(h.input('p',0)),row=await h.row(f,'manifests',saved.manifestHash);
  row.assets=[];await h.put(f,'manifests',row);
  h.equal((await f.store.load('p')).status,'editable');
  const pack=await h.storage.exportRescuePackage(f.store,'p');h.assert(pack.metadata.files.some(x=>x.type==='asset'));
  h.equal((await h.storage.inspectRescuePackage(pack.bytes)).status,'importable');
  h.equal((await f.store.cleanup()).status,'retained-conservative');
  return {verifiedManifestTraversal:true,sidecarNotSoleAuthority:true};
}
});

Object.assign(cases,{
async sameUserBackupRepairsCorruptDedupObject(h,b){
  const results=[];
  for(const action of ['corrupt','remove']){
    const f=await h.fixture(b);await f.store.commit(h.input('original',0,{text:'verified original bytes'}));
    const pack=await h.storage.exportRescuePackage(f.store,'original');
    const originalHead=await h.row(f,'heads','original'),old=await f.store.load('original'),hash=old.manifest.sources[0];
    const oldLocator=(await h.row(f,'objects',hash)).locator;await h.damageAsset(f,hash,action);
    h.equal((await f.store.load('original')).status,'unrecoverable');
    const copied=await h.storage.importRescueCopy(f.store,pack.bytes,{projectId:'copy'});
    h.equal(copied.status,'imported-copy');h.equal(await h.row(f,'heads','original'),originalHead);
    h.equal((await f.store.load('original')).status,'editable');h.equal((await f.store.load('copy')).status,'editable');
    const repaired=await h.row(f,'objects',hash);h.assert(repaired.locator!==oldLocator,'Repair must use a new closed verified location');
    await f.store.cleanup();await f.store.cleanup();h.equal(new TextDecoder().decode((await f.store.load('copy')).assets.find(a=>a.hash===hash).bytes),'verified original bytes');
    results.push({action,originalHeadUnchanged:true,newImmutableLocation:true});
  }
  return results;
},
async committedRetryAfterLaterCorruptionIsOriginalAck(h,b){
  const f=await h.fixture(b),request=h.input('p',0,{text:'retry bytes',transactionId:'same-operation'});
  const saved=await f.store.commit(request),opened=await f.store.load('p');
  await h.damageAsset(f,opened.manifest.sources[0],'remove');
  h.equal((await f.store.load('p')).status,'unrecoverable');
  const retried=await f.store.commit(request);
  h.assert(retried.idempotent);h.equal(retried.ack,saved.ack);
  h.assert(retried.currentReadRequired,'Historical commit ack must not claim current byte health');
  return {originalAck:true,readStillUnrecoverable:(await f.store.load('p')).status==='unrecoverable'};
}
});

Object.assign(cases,{
async repairFaultHasNoPartialCopyHead(h,b){
  const outcomes=[];
  for(const point of ['asset.closed','manifest.staged']){
    let armed=false;const f=await h.fixture(b,{checkpoint:async name=>{if(armed&&name===point)throw h.crash(name);}});
    await f.store.commit(h.input('original',0,{text:'backup before loss'}));
    const pack=await h.storage.exportRescuePackage(f.store,'original'),before=await h.row(f,'heads','original');
    const hash=(await f.store.load('original')).manifest.sources[0];await h.damageAsset(f,hash,'corrupt');armed=true;
    await h.rejects(()=>h.storage.importRescueCopy(f.store,pack.bytes,{projectId:'copy',transactionId:'repair-copy'}),['FAULT_CHECKPOINT']);
    h.equal(await h.row(f,'heads','original'),before);h.equal((await f.store.load('copy')).status,'empty');
    h.equal((await f.store.load('original')).status,point==='manifest.staged'?'editable':'unrecoverable');
    f.store.close();const resumed=await h.fixture(b,{userId:f.userId});
    h.equal((await h.storage.importRescueCopy(resumed.store,pack.bytes,{projectId:'copy',transactionId:'repair-copy'})).status,'imported-copy');
    h.equal((await resumed.store.load('copy')).status,'editable');h.equal(await h.row(resumed,'heads','original'),before);
    await resumed.store.cleanup();await resumed.store.cleanup();
    outcomes.push({point,copyHeadAbsentUntilPublish:true,originalHeadUnchanged:true,resumed:true});
  }
  return outcomes;
}
});

Object.assign(cases,{
async malformedRawMetadataRescuesVerifiedPrevious(h,b){
  const f=await h.fixture(b);const first=await f.store.commit(h.input('p',0)),second=await f.store.commit(h.input('p',1));
  const oldRow=await h.row(f,'manifests',second.manifestHash),rawBytes=new Uint8Array([0xff,0xfe,0x80]),hash=await h.common.sha256(rawBytes);
  await h.put(f,'manifests',{...oldRow,hash,bytes:rawBytes});
  const head=await h.row(f,'heads','p');head.currentHash=hash;await h.put(f,'heads',head);
  const loaded=await f.store.load('p');h.equal(loaded.manifestHash,first.manifestHash);h.assert(loaded.recoveredPrevious);
  const pack=await h.storage.exportRescuePackage(f.store,'p');h.assert(!pack.metadata.complete);
  const parsed=await h.storage.inspectRescuePackage(pack.bytes);h.equal(parsed.status,'importable');
  h.assert(h.common.byteEqual(parsed.files.get('manifests/'+hash+'.json'),rawBytes),'Exact invalid UTF8 bytes retained');
  await h.rejects(()=>h.storage.exportRescuePackage(f.store,'p',{transactionId:'missing-transaction'}),['TRANSACTION_NOT_FOUND']);
  head.schemaVersion=7;head.historyHashes=123;await h.put(f,'heads',head);
  const rawHead=await h.storage.exportRescuePackage(f.store,'p');
  h.equal((await h.storage.inspectRescuePackage(rawHead.bytes)).status,'read-only');
  h.equal((await f.store.load('p')).status,'read-only');
  return {invalidUTF8Preserved:true,unknownHeadFieldsPreserved:true,previousVerified:true};
}
});
Object.assign(cases,{
async aggregateBudgetBeforeCopies(h,b){
  const f=await h.fixture(b),view=new Uint8Array(new ArrayBuffer(128*1024*1024));
  const request=h.input('oversize',0);request.assets=Array.from({length:5},()=>({kind:'source',bytes:view}));
  const originalSlice=Uint8Array.prototype.slice;let copies=0;
  try{
    Uint8Array.prototype.slice=function(){copies++;throw new Error('Asset copy attempted before aggregate budget refusal');};
    await h.rejects(()=>f.store.commit(request),['ASSET_BUDGET']);
  }finally{Uint8Array.prototype.slice=originalSlice;}
  h.equal(copies,0);h.equal((await f.store.load('oversize')).status,'empty');
  h.equal((await h.rows(f,'journals')).length,0);
  return {requestedBytes:5*128*1024*1024,oneInputAllocation:128*1024*1024,copiedAssets:0,noJournalOrHead:true};
}
});
Object.assign(cases,{
async rescueCapturesOneGenerationDuringConcurrentCommits(h,b){
  const results=[];
  for(const advancements of [1,3]){
    const f=await h.fixture(b),request=h.input('p',0,{text:'captured original source'});
    const first=await f.store.commit(request),read=f.store.bytes.read;let advanced=false;
    f.store.bytes.read=async function(object){
      const owned=await read.call(this,object);
      // Pause at a real asset read after rescue has captured its head/inventory.
      // Publish through the real store, including GC; do not forge IDB records.
      if(!advanced){advanced=true;for(let revision=1;revision<=advancements;revision++)
        await f.store.commit(h.input('p',revision,{text:'concurrent source '+revision}));}
      return owned;
    };
    let pack;try{pack=await h.storage.exportRescuePackage(f.store,'p');}finally{f.store.bytes.read=read;}
    h.assert(advanced,'Concurrent publication must actually occur during rescue');
    h.equal(pack.metadata.head.revision,1,'Rescue head stays at captured generation');
    h.equal(pack.metadata.selectedManifestHash,first.manifestHash,'Selected manifest belongs to captured generation');
    h.assert(pack.metadata.complete,'All captured manifest bytes and source bytes were retained');
    const parsed=await h.storage.inspectRescuePackage(pack.bytes);h.equal(parsed.status,'importable');
    h.equal(parsed.manifest.document,request.document);
    h.equal(new TextDecoder().decode(parsed.files.get('assets/'+parsed.manifest.sources[0]+'.bin')),'captured original source');
    const current=await f.store.load('p');h.equal(current.headRevision,advancements+1);h.assert(current.manifestHash!==first.manifestHash);
    results.push({capturedRevision:1,concurrentCommits:advancements,currentRevision:current.headRevision,complete:true,importable:true});
  }
  return results;
}
});
