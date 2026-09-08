import {validateHead} from './head.mjs';
import {StorageError,check,identity,integer,hashId,cloneJSON,canonicalJSON,copyBytes,sha256,jsonHash,encoder,byteEqual,errorInfo,abortCheck,LIMITS} from './common.mjs';
import {OfflineAccess} from './access.mjs';
import {openDatabase,atomic,readRecord,readRecords,readStores} from './idb.mjs';
import {createByteStore} from './bytes.mjs';
import {MANIFEST_KIND,encodeManifest,inspectManifest} from './manifest.mjs';
import {beginJournal,recordFile,pinObject,pinExistingObjects,repairObject,stageManifest,finishFailedJournal,publishHead} from './journal.mjs';
export async function openProjectStore({userId,deviceId,now,policy={},checkpoint=async()=>{},syncCheckpoint=()=>{}}){
  const access=new OfflineAccess({userId,deviceId,now});
  const namespace=await sha256('web-3d-arch/user/'+userId);
  // Database/lock names intentionally do not contain engine/domain schema versions.
  const databaseName='web-3d-arch.local.'+namespace;
  const connection=await openDatabase(databaseName);
  if(!connection.readable)connection.db.close();
  check(connection.readable,'UNSUPPORTED_DATABASE_LAYOUT','Existing database is retained; known project stores are unavailable for raw rescue.',{databaseName,version:connection.version});
  const bytes=await createByteStore(connection.db,namespace,{...policy,readOnly:!connection.supported});
  return new ProjectStore({access,namespace,databaseName,db:connection.db,bytes,policy,checkpoint,syncCheckpoint,databaseVersion:connection.version,databaseReadOnly:!connection.supported});
}
class ProjectStore {
  constructor({access,namespace,databaseName,db,bytes,policy,checkpoint,syncCheckpoint,databaseVersion,databaseReadOnly}){
    this.access=access;this.namespace=namespace;this.databaseName=databaseName;this.db=db;this.bytes=bytes;
    this.databaseVersion=databaseVersion;this.databaseReadOnly=databaseReadOnly;
    this.policy=policy;this.checkpoint=checkpoint;this.syncCheckpoint=syncCheckpoint;
    this.owner=crypto.randomUUID();this.closed=false;this.writeBlocked=null;this.operations=new Set();
    access.listeners.add(()=>{for(const controller of this.operations)controller.abort();});
  }
  get capabilities(){return {...this.bytes.capabilities,database:{version:this.databaseVersion,readOnly:this.databaseReadOnly},cloudReplica:{status:'unsupported'},physicalCrashDurability:{status:'unverified'}};}
  status(){return {...this.access.status(),writeBlocked:this.writeBlocked,capabilities:this.capabilities};}
  async unlock(lease){
    check(!this.closed,'STORE_CLOSED','Store is closed.');
    const key='clock:'+await sha256(this.access.deviceId);
    const watermark=await readRecord(this.db,'meta',key)??{lastSeen:0,authVersion:0};
    this.access.unlock(lease,watermark);this.clockKey=key;
    await this.#recordClock();return this.status();
  }
  async unlockOnline(grant){
    check(!this.closed,'STORE_CLOSED','Store is closed.');
    const key='clock:'+await sha256(this.access.deviceId);
    const watermark=await readRecord(this.db,'meta',key)??{lastSeen:0,authVersion:0};
    this.access.unlockOnline(grant,watermark);this.clockKey=key;
    // Only monotonic time/auth-version watermarks are persisted, never the online grant.
    await this.#recordClock();return this.status();
  }
  suspend(){this.access.suspend();}
  lock(){this.access.lock();}
  close(){if(!this.closed){this.lock();this.closed=true;this.db.close();}}
  async #recordClock(){
    if(this.databaseReadOnly)return;
    await atomic(this.db,['meta'],'readwrite',t=>t.request(t.store('meta').get(this.clockKey),old=>{
      check((old?.authVersion??0)<=this.access.authVersion,'AUTH_VERSION','A newer auth version is already in use.');
      t.store('meta').put({key:this.clockKey,lastSeen:Math.max(old?.lastSeen??0,this.access.lastSeen),authVersion:this.access.authVersion});
    }));
  }
  #context({signal,rescue=false,writing=false}={}){
    check(!this.closed,'STORE_CLOSED','Store is closed.');
    const epoch=this.access.epoch,controller=new AbortController();
    const stop=()=>controller.abort();signal?.addEventListener('abort',stop,{once:true});
    if(signal?.aborted)controller.abort();
    this.operations.add(controller);
    const guard=()=>{
      abortCheck(controller.signal);check(!this.closed,'STORE_CLOSED','Store is closed.');
      this.access.assert({epoch,rescue});
      if(writing)check(!this.databaseReadOnly,'READ_ONLY_DATABASE','Unknown database version is rescue/read-only.');
      if(writing)check(!this.writeBlocked,'WRITE_BLOCKED','Storage failure requires explicit retry/reopen before new writes.',this.writeBlocked??{});
    };
    try{guard();}catch(error){this.operations.delete(controller);signal?.removeEventListener('abort',stop);throw error;}
    return {epoch,controller,signal:controller.signal,guard,options:{signal:controller.signal,guard},
      finish:()=>{this.operations.delete(controller);signal?.removeEventListener('abort',stop);}};
  }
  async #point(name,job,ctx,extra={}){
    ctx.guard();await this.checkpoint(name,{transactionId:job?.id??null,generation:job?.expectedRevision!==undefined?job.expectedRevision+1:null,...extra});ctx.guard();
  }
  async #writer(projectId,ctx,operation){
    if(this.policy.coordination==='cas-only'||!navigator.locks?.request)return operation();
    return navigator.locks.request('web-3d-arch.writer.'+this.namespace+'.'+projectId,
      {mode:'exclusive',ifAvailable:true},async lock=>{
        check(lock,'WRITER_BUSY','Another tab owns the project writer lock.');ctx.guard();return operation();
      });
  }
  async withWriter(projectId,operation,{signal}={}){
    identity(projectId);check(typeof operation==='function','CALLBACK_REQUIRED','Writer operation callback required.');
    const ctx=this.#context({signal,writing:true});
    try{await this.access.preflight(ctx.signal);ctx.guard();return await this.#writer(projectId,ctx,()=>operation());}finally{ctx.finish();}
  }
  async listProjects({rescue=false}={}){
    const ctx=this.#context({rescue});
    try{await this.#recordClock();ctx.guard();const rows=await readRecords(this.db,'index',ctx.options);ctx.guard();return rows;}finally{ctx.finish();}
  }
  async #generation(hash,projectId,ctx){
    hashId(hash);ctx.guard();
    const record=await readRecord(this.db,'manifests',hash,ctx.options);
    check(record?.bytes,'MISSING_MANIFEST','Referenced manifest is missing.',{hash});
    const inspected=await inspectManifest(record.bytes,hash,{namespace:this.namespace,projectId});
    ctx.guard();if(inspected.status==='read-only')return inspected;
    const verifiedAssets=[];
    for(const asset of inspected.manifest.assets){
      const object=await readRecord(this.db,'objects',asset.hash,ctx.options);
      check(object&&object.state==='ready'&&object.byteLength===asset.byteLength,'MISSING_ASSET','Asset index is missing or incompatible.',{hash:asset.hash});
      const data=await this.bytes.read(object);ctx.guard();verifiedAssets.push({...asset,bytes:data});
    }
    return {...inspected,...(this.databaseReadOnly?{status:'read-only',reason:'UNSUPPORTED_DATABASE_VERSION'}:{}),assets:verifiedAssets,verification:{storage:'sha256-verified',domain:'validator-required',engine:'unverified',geometry:'unverified',fit:'unverified'}};
  }
  async #load(projectId,ctx,attempt=0){
    const head=await readRecord(this.db,'heads',projectId,ctx.options);ctx.guard();
    if(!head)return {status:'empty',projectId,revision:0,head:null};
    try{validateHead(head);}catch(error){return {status:'read-only',head,reason:head.schemaVersion!==1?'UNSUPPORTED_HEAD_VERSION':error.code,rawHead:canonicalJSON(head)};}
    const issues=[];
    for(const [index,hash]of [head.currentHash,head.previousHash].entries()){
      if(!hash)continue;
      try{
        const loaded=await this.#generation(hash,projectId,ctx);
        const after=await readRecord(this.db,'heads',projectId,ctx.options);
        if(canonicalJSON(after)!==canonicalJSON(head)){
          check(attempt<3,'READ_RETRY','Head changed repeatedly during verified read; retry the read.');
          return this.#load(projectId,ctx,attempt+1);
        }
        return {...loaded,head,headRevision:head.revision,recoveredPrevious:index===1,issues};
      }catch(error){
        ctx.guard();issues.push({manifestHash:hash,...errorInfo(error)});
      }
    }
    const after=await readRecord(this.db,'heads',projectId,ctx.options);
    if(canonicalJSON(after)!==canonicalJSON(head)){
      check(attempt<3,'READ_RETRY','Head changed repeatedly during recovery; retry the read.');
      return this.#load(projectId,ctx,attempt+1);
    }
    return {status:'unrecoverable',head,issues};
  }
  async load(projectId,{signal}={}){
    identity(projectId);const ctx=this.#context({signal});
    try{await this.#recordClock();ctx.guard();return await this.#load(projectId,ctx);}finally{ctx.finish();}
  }
  async loadRetainedManifest(projectId,manifestHash,{signal}={}){
    identity(projectId);hashId(manifestHash);const ctx=this.#context({signal});
    try{
      await this.#recordClock();ctx.guard();
      const head=await readRecord(this.db,'heads',projectId,ctx.options);
      if(head)validateHead(head);
      check(head&&[head.currentHash,head.previousHash,...(head.historyHashes??[]),...(head.previousHistoryHashes??[])].includes(manifestHash),
        'HISTORY_REFERENCE','Requested manifest is not retained by the current head.');
      return await this.#generation(manifestHash,projectId,ctx);
    }finally{ctx.finish();}
  }
  async commit(input,{signal}={}){
    // Snapshot all supplied byte views before any asynchronous boundary.
    const rawAssets=input?.assets;
    check(Array.isArray(rawAssets)&&rawAssets.length<=LIMITS.entries,'ASSET_BUDGET','Invalid asset input list.');
    // Refuse the aggregate request before eagerly copying any supplied buffers.
    // Import also has its own container/expanded/depth gates before this boundary.
    let requestedBytes=0;
    for(const asset of rawAssets){
      const data=asset?.bytes;
      if(data!==undefined)check(data instanceof ArrayBuffer||ArrayBuffer.isView(data),'BYTES_REQUIRED','Expected typed asset bytes.');
      const size=integer(data===undefined?asset?.byteLength:data.byteLength,0,LIMITS.asset);
      requestedBytes+=size;check(requestedBytes<=LIMITS.expanded,'ASSET_BUDGET','Aggregate asset byte budget exceeded before copying.');
    }
    const inputs=rawAssets.map(a=>({hash:a.hash,kind:a.kind??'dependency',byteLength:a.byteLength,
      data:a.bytes===undefined?null:copyBytes(a.bytes)}));
    const projectId=identity(input.projectId),transactionId=identity(input.transactionId??crypto.randomUUID(),'transaction ID');
    const expectedRevision=integer(input.expectedRevision,0,Number.MAX_SAFE_INTEGER-1);
    const document=cloneJSON(input.document),engine=cloneJSON(input.engine);
    const retainManifests=cloneJSON(input.retainManifests??[]);
    check(Array.isArray(retainManifests)&&retainManifests.length<=41&&new Set(retainManifests).size===retainManifests.length,'HISTORY_BUDGET','Invalid retained manifest inventory.');
    retainManifests.forEach(hashId);retainManifests.sort();
    const ctx=this.#context({signal,writing:true});let job=null,published=false;
    try{
      await this.access.preflight(ctx.signal);ctx.guard();
      await this.#recordClock();ctx.guard();
      const assets=[];
      for(const a of inputs){
        const hash=a.data?await sha256(a.data):hashId(a.hash);
        if(a.hash!==undefined)check(a.hash===hash,'ASSET_HASH','Provided asset hash differs from bytes.');
        const byteLength=a.data?a.data.byteLength:integer(a.byteLength,0,LIMITS.asset);
        if(a.byteLength!==undefined)check(a.byteLength===byteLength,'ASSET_SIZE','Provided byte length differs.');
        assets.push({hash,byteLength,kind:a.kind});
      }
      const encoded=await encodeManifest({kind:MANIFEST_KIND,schemaVersion:1,namespace:this.namespace,projectId,
        revision:expectedRevision+1,engine,domainSchemaVersion:input.domainSchemaVersion??1,assets,
        sources:input.sources??assets.filter(a=>a.kind==='source').map(a=>a.hash),
        dependencies:input.dependencies??assets.filter(a=>a.kind==='dependency').map(a=>a.hash),
        document,provenance:cloneJSON(input.provenance??{})});
      const fingerprint=await jsonHash({manifestHash:encoded.hash,expectedRevision,retainManifests});
      return await this.#writer(projectId,ctx,async()=>{
        const prior=await readRecord(this.db,'journals',transactionId,ctx.options);
        if(prior){
          check(prior.fingerprint===fingerprint&&prior.projectId===projectId,'TRANSACTION_ID_REUSED','Transaction ID was reused with another payload.');
          if(prior.status==='committed')return {ok:true,idempotent:true,ack:prior.ack,manifestHash:prior.manifestHash,currentReadRequired:true};
          if(prior.status==='conflict')throw new StorageError('CONFLICT','Transaction retains a conflict candidate.',prior.conflict);
        }
        const base=await this.#load(projectId,ctx);
        check(['editable','empty'].includes(base.status),'READ_ONLY_PROJECT','Current project is read-only/unrecoverable; rescue or import a new copy first.',{status:base.status});
        job=await beginJournal(this.db,{id:transactionId,owner:this.owner,projectId,expectedRevision,
          fingerprint,manifestHash:encoded.hash},ctx.options);
        if(job.status==='committed')return {ok:true,idempotent:true,ack:job.ack,manifestHash:job.manifestHash,currentReadRequired:true};
        if(job.status==='conflict')throw new StorageError('CONFLICT','Transaction retains a conflict candidate.',job.conflict);
        await this.#point('journal.started',job,ctx);
        const verifiedObjects=[];
        const existingObjects=await pinExistingObjects(this.db,job,encoded.manifest.assets,ctx.options);ctx.guard();
        for(const asset of encoded.manifest.assets){
          const provided=inputs.find(a=>a.hash===asset.hash||a.data&&assets[inputs.indexOf(a)]?.hash===asset.hash);
          let object=existingObjects.get(asset.hash)??null,corrupt=null;
          if(object){
            try{await this.bytes.read(object);ctx.guard();}
            catch(error){
              ctx.guard();
              if(!provided?.data||!['ASSET_HASH','ASSET_SIZE','MISSING_ASSET','NotFoundError'].includes(typeof error.code==='string'?error.code:error.name))throw error;
              corrupt=object;
            }
          }
          if(!object||corrupt){
            check(provided?.data,'MISSING_ASSET','New asset bytes were not supplied.',{hash:asset.hash});
            const location=this.bytes.newLocation(asset.hash,asset.byteLength);
            await recordFile(this.db,job,location,ctx.options);
            await this.bytes.write(location,provided.data,{signal:ctx.signal,checkpoint:name=>this.#point(name,job,ctx,{hash:asset.hash})});
            ctx.guard();object=corrupt?await repairObject(this.db,job,asset,location,corrupt,ctx.options):await pinObject(this.db,job,asset,location,ctx.options);
            // A racing writer may already have inserted an identical closed object.
            await this.bytes.read(object);ctx.guard();
          }
          verifiedObjects.push(object);
          await this.#point('asset.pinned',job,ctx,{hash:asset.hash});
        }
        await this.#point('manifest.before-put',job,ctx);
        await stageManifest(this.db,job,encoded,ctx.options);
        await this.#point('manifest.staged',job,ctx);
        const stored=await readRecord(this.db,'manifests',encoded.hash,ctx.options);
        await inspectManifest(stored.bytes,encoded.hash,{namespace:this.namespace,projectId});ctx.guard();
        await this.#point('publish.before-transaction',job,ctx);
        // Re-read after the last asynchronous fault checkpoint. Publication still relies on
        // cooperative immutable files, not an imaginary OPFS+IDB atomic transaction.
        for(const object of verifiedObjects){await this.bytes.read(object);ctx.guard();}
        // Online authorization is refreshed AFTER staging/read-back and BEFORE the IDB transaction.
        // Inside IDB only synchronous epoch/grant guards run; no network await holds it open.
        await this.access.preflight(ctx.signal);ctx.guard();
        const ack={transactionId:job.id,generation:expectedRevision+1,stepId:'head.committed',hash:encoded.hash,status:'ok'};
        const result=await publishHead(this.db,job,encoded,{verifiedObjects,baseHead:base.head,
          verifiedBaseHash:base.manifestHash??null,retainManifests,ack,
          syncCheckpoint:(name,detail)=>this.syncCheckpoint(name,{transactionId:job.id,...detail}),
          guard:ctx.guard,clockKey:this.clockKey,authVersion:this.access.authVersion,lastSeen:this.access.lastSeen},ctx.options);
        if(result.conflict)throw new StorageError('CONFLICT','Local CAS conflict; both committed and candidate copies are retained.',result);
        published=true;await this.#point('head.committed',job,ctx);
        let cleanup={status:'not-run'};
        try{cleanup=await this.#cleanup(ctx,job);}catch(error){cleanup={status:'pending',error:errorInfo(error)};if(error.crash===true)throw error;}
        ctx.guard();
        return {ok:true,idempotent:false,manifestHash:encoded.hash,head:result.head,ack,cleanup};
      });
    }catch(error){
      if(['QuotaExceededError','NotAllowedError','SecurityError'].includes(error.name))this.writeBlocked=errorInfo(error);
      if(job&&!published&&error.crash!==true)try{await finishFailedJournal(this.db,job,error);}catch{}
      if(error.details)error.details={...error.details,transactionId,committed:published};
      throw error;
    }finally{ctx.finish();}
  }
  async pendingTransactions({projectId,rescue=false}={}){
    const ctx=this.#context({rescue});
    try{
      await this.#recordClock();ctx.guard();
      const rows=await readRecords(this.db,'journals',ctx.options);ctx.guard();
      return rows.filter(r=>['preparing','staged','conflict'].includes(r.status)&&(!projectId||r.projectId===projectId));
    }finally{ctx.finish();}
  }
  async discardPending(transactionId,{signal}={}){
    identity(transactionId);const ctx=this.#context({signal,writing:true});
    try{
      await this.access.preflight(ctx.signal);ctx.guard();
      const old=await readRecord(this.db,'journals',transactionId,ctx.options);
      check(old,'TRANSACTION_NOT_FOUND','Transaction not found.');
      return await this.#writer(old.projectId,ctx,async()=>{
        await atomic(this.db,['journals','objects'],'readwrite',t=>t.request(t.store('journals').get(transactionId),row=>{
          check(row&&!['committed'].includes(row.status),'COMMITTED_TRANSACTION','Cannot discard a committed generation.');
          row.fence++;row.owner=this.owner;row.status='aborted';
          for(const hash of row.pins)t.request(t.store('objects').get(hash),object=>{
            if(object){object.pins=object.pins.filter(id=>id!==transactionId);t.store('objects').put(object);}
          });
          row.pins=[];t.store('journals').put(row);
        }),ctx.options);
        return this.#cleanup(ctx,null);
      });
    }finally{ctx.finish();}
  }
  async cleanup({signal}={}){
    const ctx=this.#context({signal,writing:true});
    try{await this.access.preflight(ctx.signal);ctx.guard();return await this.#cleanup(ctx,null);}finally{ctx.finish();}
  }
  async #cleanup(ctx,job){
    await this.#point('cleanup.before-mark',job,ctx);
    // Hash/schema preflight is outside IDB. The mark transaction compares these exact
    // immutable rows again; an unknown/corrupt/racing root makes GC conservative.
    const examined=new Map();
    for(const row of await readRecords(this.db,'manifests',ctx.options)){
      try{
        const value=await inspectManifest(row.bytes,row.hash,{namespace:this.namespace,projectId:row.projectId});
        if(value.status!=='editable'||canonicalJSON(value.manifest.assets.map(a=>a.hash))!==canonicalJSON(row.assets))
          return {status:'retained-conservative',reason:'unsupported-or-invalid-manifest',removedObjects:0,removedStagingFiles:0};
        examined.set(row.hash,row);
      }catch(error){
        return {status:'retained-conservative',reason:'manifest-verification-failed',error:errorInfo(error),removedObjects:0,removedStagingFiles:0};
      }
    }
    const marked=await readStores(this.db,['heads','manifests','objects','journals'],'readwrite',(t,rows)=>{
      const roots=new Set();
      for(const h of rows.heads){
        try{validateHead(h);}catch{t.result({status:'retained-conservative',reason:'unknown-or-invalid-head',garbage:[],files:[]});return;}
        for(const hash of [h.currentHash,h.previousHash,...(h.historyHashes??[]),...(h.previousHistoryHashes??[])])if(hash)roots.add(hash);
      }
      for(const h of roots)if(!rows.manifests.some(m=>m.hash===h)){
        t.result({status:'retained-conservative',reason:'missing-root-manifest',garbage:[],files:[]});return;
      }
      for(const j of rows.journals)if(['preparing','staged','conflict'].includes(j.status))roots.add(j.manifestHash);
      for(const hash of roots){
        const row=rows.manifests.find(m=>m.hash===hash),known=examined.get(hash);
        if(row&&(!known||!byteEqual(row.bytes,known.bytes)||canonicalJSON(row.assets)!==canonicalJSON(known.assets))){
          t.result({status:'retained-conservative',reason:'manifest-changed-during-gc',garbage:[],files:[]});return;
        }
      }
      const live=new Set(rows.manifests.filter(m=>roots.has(m.hash)).flatMap(m=>m.assets));
      for(const m of rows.manifests)if(!roots.has(m.hash))t.store('manifests').delete(m.hash);
      const garbage=[];
      for(const object of rows.objects){
        object.refs=object.refs.filter(h=>roots.has(h));
        if(!live.has(object.hash)&&object.pins.length===0){object.state='deleting';garbage.push(object);}
        t.store('objects').put(object);
      }
      const files=[];
      const indexedLocations=new Set(rows.objects.map(o=>o.locator));
      for(const j of rows.journals){
        if(!['committed','aborted'].includes(j.status))continue;
        for(const file of j.files??[])if(!indexedLocations.has(file.locator))files.push(file);
      }
      t.result({status:'marked',garbage,files});
    },ctx.options);
    await this.#point('cleanup.after-mark',job,ctx);
    for(const object of marked.garbage){
      ctx.guard();await this.bytes.remove(object);await this.#point('cleanup.asset-removed',job,ctx,{hash:object.hash});
      await atomic(this.db,['objects'],'readwrite',t=>t.request(t.store('objects').get(object.hash),current=>{
        if(current?.state==='deleting'&&current.locator===object.locator)t.store('objects').delete(object.hash);
      }),ctx.options);
    }
    for(const file of marked.files){ctx.guard();await this.bytes.remove(file);}
    await atomic(this.db,['journals'],'readwrite',t=>t.request(t.store('journals').getAll(),rows=>{
      for(const j of rows)if(j.status==='committed'){j.files=[];t.store('journals').put(j);}
    }),ctx.options);
    await this.#point('cleanup.finished',job,ctx);
    return {status:marked.status==='marked'?'complete':marked.status,reason:marked.reason??null,
      removedObjects:marked.garbage.length,removedStagingFiles:marked.files.length};
  }
  // Package module is separated from durable commit; it calls these scoped, verified operations.
  async rescueInventory(projectId,{transactionId,signal}={}){
    identity(projectId);const ctx=this.#context({signal,rescue:true});
    try{
      await this.#recordClock();ctx.guard();
      const head=await readRecord(this.db,'heads',projectId,ctx.options);
      const journal=transactionId?await readRecord(this.db,'journals',identity(transactionId),ctx.options):null;
      if(transactionId)check(journal,'TRANSACTION_NOT_FOUND','Selected rescue transaction does not exist.');
      if(journal)check(journal.projectId===projectId,'PROJECT_MISMATCH','Conflict transaction belongs to another project.');
      check(head||journal,'PROJECT_NOT_FOUND','No local project or pending transaction found.');
      const hashes=[...new Set([head?.currentHash,head?.previousHash,...(Array.isArray(head?.historyHashes)?head.historyHashes:[]),
        ...(Array.isArray(head?.previousHistoryHashes)?head.previousHistoryHashes:[]),journal?.manifestHash]
        .filter(hash=>typeof hash==='string'&&/^[a-f0-9]{64}$/.test(hash)))];
      const manifests=[],assets=new Map(),issues=[],inspections=new Map();
      if(head)try{validateHead(head);}catch(error){issues.push({code:'UNVERIFIED_REFERENCE_COVERAGE',reason:error.code});}
      for(const hash of hashes){
        const row=await readRecord(this.db,'manifests',hash,ctx.options);
        if(!row){issues.push({code:'MISSING_MANIFEST',hash});continue;}
        let rawBytes;
        try{rawBytes=copyBytes(row.bytes);}catch(error){issues.push({hash,code:'INVALID_MANIFEST_BYTES',reason:error.code});continue;}
        const actualHash=await sha256(rawBytes);ctx.guard();
        manifests.push({declaredHash:hash,actualHash,verified:actualHash===hash,bytes:rawBytes});
        if(actualHash!==hash)issues.push({code:'MANIFEST_HASH',hash,actualHash});
        let declared=[];
        if(actualHash===hash){
          try{
            const inspected=await inspectManifest(rawBytes,hash,{namespace:this.namespace,projectId});
            inspections.set(hash,inspected);
            if(inspected.status==='editable')declared=inspected.manifest.assets.map(a=>a.hash);
            else issues.push({code:'UNVERIFIED_REFERENCE_COVERAGE',hash,reason:inspected.reason});
          }catch(error){issues.push({code:'UNVERIFIED_REFERENCE_COVERAGE',hash,reason:error.code??error.name});}
        }
        if(!Array.isArray(row.assets))issues.push({code:'UNVERIFIED_REFERENCE_COVERAGE',hash,reason:'INVALID_SIDECAR'});
        for(const assetHash of new Set([...declared,...(Array.isArray(row.assets)?row.assets:[])])){
          if(assets.has(assetHash))continue;
          try{
            const object=await readRecord(this.db,'objects',assetHash,ctx.options);
            check(object?.state==='ready','MISSING_ASSET','Asset index missing.',{hash:assetHash});
            const data=await this.bytes.read(object);ctx.guard();
            assets.set(assetHash,{hash:assetHash,byteLength:data.length,bytes:data});
          }catch(error){ctx.guard();issues.push({hash:assetHash,...errorInfo(error)});}
        }
      }
      // Select only from the bytes captured above. A fresh #load can observe a
      // later committed head whose manifest was never included in this package.
      // The captured content-addressed generation remains valid even after GC.
      const candidates=journal?[journal.manifestHash]:[head?.currentHash,head?.previousHash];
      const selectedManifestHash=candidates.find(hash=>{
        const inspected=inspections.get(hash);if(!inspected)return false;
        return inspected.status==='read-only'||inspected.manifest.assets.every(a=>assets.get(a.hash)?.byteLength===a.byteLength);
      })??null;
      if(!selectedManifestHash)issues.push({code:'NO_VERIFIED_SELECTION'});
      ctx.guard();
      return {namespace:this.namespace,projectId,head:head??null,selectedManifestHash,
        manifests,assets:[...assets.values()],issues,complete:issues.length===0};
    }finally{ctx.finish();}
  }
}
