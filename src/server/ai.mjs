import {setImmediate as yieldTurn} from 'node:timers/promises';
import {ImageAssets} from './image-assets.mjs';
import {runMaintenance} from './maintenance.mjs';
import { DAY,id,sha,fail,exact,str,integer,uuid,canonical,period,Fault } from './core.mjs';
import { moneyLimits } from './policy.mjs';
import {recoveryUsage} from './recovery.mjs';
import { credentialContext } from './vault.mjs';
const activeStates=['reserved','submitted','running'];
const providerErrors=new Set(['PROVIDER_AUTH','PROVIDER_CREDIT','PROVIDER_QUOTA','PROVIDER_RATE_LIMIT','PROVIDER_MODEL_UNAVAILABLE','PROVIDER_REJECTED','PROVIDER_PERMISSION','PROVIDER_INVALID_REQUEST','PROVIDER_CONTENT_REFUSAL','PROVIDER_SERVER_ERROR','PROVIDER_TIMEOUT_UNKNOWN','PROVIDER_DELIVERY_UNKNOWN','PROVIDER_RESPONSE_INVALID','PROVIDER_OUTPUT_URL_UNSUPPORTED','PROVIDER_IMAGE_FORMAT_UNSUPPORTED','PROVIDER_PRICE_CHANGED','PROVIDER_CAPABILITY_BLOCKED','PROVIDER_COST_EXCEEDED','PROVIDER_CANCELLED','PROVIDER_AUTH_OR_REQUEST','PROVIDER_SEND_BLOCKED']);
const graphemes=new Intl.Segmenter('und',{granularity:'grapheme'});
const sum=(s,sql,...args)=>s.get(sql,...args)?.n??0;
export class AI {
  constructor(s,credentials,providers,policy,accounts,clock,{deliveryTimeoutMs=120_000,images}={}) {
    Object.assign(this,{s,credentials,providers,policy,accounts,clock,deliveryTimeoutMs,images});
    this.images??=new ImageAssets(s,policy,accounts,clock);
    this.inflight=new Map();this.closed=false;this.stopping=false;this.settling=new Set();this.settlingJobs=new Map();this.accountingFailure=false;
  }
  owned(user,jobId){const j=this.s.get('SELECT * FROM jobs WHERE id=? AND user_id=?',jobId,user);fail(j,404,'NOT_FOUND');return j;}
  view(j) {
    return {id:j.id,operationId:j.operation_id,ownerId:j.user_id,credentialId:j.credential_id,credentialVersion:j.credential_version,
      providerId:j.provider_id,endpointId:j.endpoint_id,adapterVersion:j.adapter_version,modelId:j.model_id,modelVersion:j.model_version,
      projectId:j.project_id,projectRevision:j.project_revision,originSessionId:j.session_id,payloadHash:j.payload_hash,quote:JSON.parse(j.quote),quoteHash:j.quote_hash,
      state:j.state,sequence:j.seq,createdAt:j.created,updatedAt:j.updated,submittedAt:j.submitted,
      accounting:{currency:j.currency,unit:'micro',day:j.day,month:j.month,estimatedMicros:j.cap,actualMicros:j.actual,boundMicros:j.recovery_bound,quoteDiscrepancyMicros:j.actual!==null?Math.max(0,j.actual-j.cap):0,basis:j.accounting,reservedMicros:j.accounting==='pending'?(j.recovery_bound??j.cap):0,unresolved:j.accounting==='pending'&&j.state==='unknown',closedReason:j.closed_reason},
      cancelRequested:!!j.cancel_requested,requestId:j.request_id,errorCode:j.error_code,providerUsage:j.provider_usage?JSON.parse(j.provider_usage):null,resultDisposition:'tray',
      artifacts:this.s.all('SELECT id,media_type,hash,length(bytes) byte_length FROM artifacts WHERE job_id=? AND user_id=?',j.id,j.user_id).map(a=>({id:a.id,mediaType:a.media_type,sha256:a.hash,byteLength:a.byte_length,formatVersion:1,jobId:j.id,projectId:j.project_id,projectRevision:j.project_revision,sourceHash:j.payload_hash,validation:'unverified',warnings:['Image bytes are not a 3D mesh.']}))};
  }
  event(jobId,state) {
    this.s.run('UPDATE jobs SET state=?,seq=seq+1,updated=? WHERE id=?',state,this.clock(),jobId);
    const j=this.s.get('SELECT seq FROM jobs WHERE id=?',jobId);
    this.s.run('INSERT INTO job_events VALUES(?,?,?,?)',jobId,j.seq,state,this.clock());
  }
  budget(user) {const row=this.s.get('SELECT * FROM budgets WHERE user_id=?',user);return {revision:row?.revision??0,money:row?JSON.parse(row.json):[]};}
  setBudget(user,body,revision) {
    exact(body,['money']);moneyLimits(body.money);
    return this.s.tx(()=>{
      const old=this.budget(user);fail(old.revision===revision,409,'REVISION_CONFLICT',{revision:old.revision});
      const json=canonical(body.money),previous=this.s.get('SELECT json FROM budgets WHERE user_id=?',user);
      this.policy.storage(user,Buffer.byteLength(json)-(previous?Buffer.byteLength(previous.json):0),previous?0:1);this.policy.sync(user,Buffer.byteLength(json));
      this.s.run('INSERT INTO budgets VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET revision=excluded.revision,json=excluded.json',user,revision+1,canonical(body.money));return this.budget(user);
    });
  }
  create(a,body,idem) {
    fail(!this.stopping&&!this.closed,503,'SERVER_STOPPING');
    fail(!this.accountingFailure,503,'AI_ACCOUNTING_WRITE_FAILED');
    fail(!this.s.get("SELECT key FROM operational_state WHERE key='restore-ai-hold'"),503,'RESTORE_RECONCILIATION_REQUIRED');
    exact(body,['operationId','credentialId','modelId','modelVersion','projectId','projectRevision','prompt','options','reference'],['operationId','credentialId','modelId','modelVersion','projectId','projectRevision','prompt']);
    uuid(body.operationId);uuid(body.credentialId);uuid(body.projectId);str(body.projectRevision,128);str(body.modelId,100);str(body.modelVersion,100);uuid(idem);
    str(body.prompt,32_000);fail([...graphemes.segment(body.prompt)].length<=4000,413,'PROMPT_TOO_LONG');
    exact(body.options??{},['quality','size'],[]);for(const v of Object.values(body.options??{}))str(v,100);
    const payload=canonical(body),hash=sha(payload);
    return this.s.tx(()=>{
      const matches=this.s.all('SELECT * FROM jobs WHERE user_id=? AND (operation_id=? OR idem=?)',a.user.id,body.operationId,idem);
      if(matches.length) {
        const j=matches[0];fail(matches.length===1&&j.operation_id===body.operationId&&j.idem===idem&&j.payload_hash===hash,409,'IDEMPOTENCY_CONFLICT');
        return {job:this.view(j),reused:true};
      }
      const tomb=this.s.get('SELECT * FROM tombstones WHERE user_id=? AND (operation_id=? OR idem=?)',a.user.id,body.operationId,idem);
      fail(!tomb,410,'OPERATION_RETIRED');
      const c=this.credentials.owned(a.user.id,body.credentialId);const provider=this.credentials.permitted(c);
      fail(c.status==='active'&&c.sealed,422,'CONNECT_YOUR_AI');
      const model=provider.metadata.models.find(m=>m.id===body.modelId&&m.version===body.modelVersion);
      fail(model,422,'MODEL_UNSUPPORTED');
      if(body.reference){fail(model.referenceImages===true,422,'REFERENCE_IMAGE_UNSUPPORTED');this.images.resolve(a,body.reference,body.projectId,body.projectRevision);}
      const quote=provider.quote(structuredClone(body));
      exact(quote,['currency','maxCostMicros','maxOutputBytes','priceVersion','priceDate','inputLimit','outputLimit','unknowns']);
      fail(/^[A-Z]{3}$/.test(quote.currency),422,'ESTIMATE_UNBOUNDED');integer(quote.maxCostMicros);integer(quote.maxOutputBytes,32_000_000,1);
      str(quote.priceVersion,100);fail(/^\d{4}-\d{2}-\d{2}$/.test(quote.priceDate),422,'ESTIMATE_UNBOUNDED');
      fail(Array.isArray(quote.unknowns),422,'ESTIMATE_UNBOUNDED');canonical(quote);
      const quoteJson=canonical({...quote,adapterVersion:provider.metadata.version,modelId:model.id,modelVersion:model.version,expiresAt:Math.min(this.clock()+10*60_000,body.reference?.expiresAt??Infinity),reference:body.reference??null,dataToSend:body.reference?['prompt','options','reference '+body.reference.id+' sha256='+body.reference.sha256+' bytes='+body.reference.byteLength]:['prompt','options'],recipient:body.reference?provider.metadata.referenceEndpointUrl??provider.metadata.endpointUrl:provider.metadata.endpointUrl});
      const now=this.clock(),jobId=id();
      this.policy.storage(a.user.id,Buffer.byteLength(payload),1);this.policy.sync(a.user.id,Buffer.byteLength(payload));
      this.s.run(String.raw`INSERT INTO jobs(id,user_id,operation_id,idem,payload_hash,payload,credential_id,credential_version,provider_id,endpoint_id,adapter_version,model_id,model_version,project_id,project_revision,session_id,auth_version,quote,quote_hash,created,updated,state,currency,cap,byte_cap)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'prepared',?,?,?)`,
        jobId,a.user.id,body.operationId,idem,hash,payload,c.id,c.version,c.provider_id,c.endpoint_id,provider.metadata.version,body.modelId,body.modelVersion,body.projectId,body.projectRevision,a.session.public_id,a.user.auth_version,quoteJson,sha(quoteJson),now,now,quote.currency,quote.maxCostMicros,quote.maxOutputBytes+Buffer.byteLength(payload)+(body.reference?4*Math.ceil(body.reference.byteLength/3)+1024:0));
      this.event(jobId,'prepared');return {job:this.view(this.owned(a.user.id,jobId)),reused:false};
    });
  }
  checkReservation(j,{held=false}={}) {
    const p=this.policy.read(),u=this.budget(j.user_id).money.find(x=>x.currency===j.currency),sys=p.ai.money.find(x=>x.currency===j.currency);
    fail(u&&u.perOperationMicros>0&&u.perDayMicros>0&&u.perMonthMicros>0,422,'AI_BUDGET_REQUIRED',{currency:j.currency,unit:'micro'});
    const periods=held?{day:j.day,month:j.month}:period(this.clock());
    const low=k=>sys?Math.min(u[k],sys[k]):u[k];
    const recovered=recoveryUsage(this.s,j.user_id,j.currency,periods.day,periods.month);
    const dimensions=[
      ['money-operation',0,j.cap,low('perOperationMicros'),'operation'],
      ['money-day',sum(this.s,"SELECT COALESCE(SUM(COALESCE(actual,recovery_bound,cap)),0) n FROM jobs WHERE user_id=? AND currency=? AND day=? AND accounting!='none'",j.user_id,j.currency,periods.day)+recovered.moneyDay,j.cap,low('perDayMicros'),periods.day],
      ['money-month',sum(this.s,"SELECT COALESCE(SUM(COALESCE(actual,recovery_bound,cap)),0) n FROM jobs WHERE user_id=? AND currency=? AND month=? AND accounting!='none'",j.user_id,j.currency,periods.month)+recovered.moneyMonth,j.cap,low('perMonthMicros'),periods.month],
      ['ai-requests',sum(this.s,"SELECT count(*) n FROM jobs WHERE user_id=? AND day=? AND (submitted IS NOT NULL OR state='reserved')",j.user_id,periods.day)+recovered.requests,1,p.ai.requestsPerDay,periods.day],
      ['ai-bytes',sum(this.s,"SELECT COALESCE(SUM(byte_cap),0) n FROM jobs WHERE user_id=? AND day=? AND (submitted IS NOT NULL OR state='reserved')",j.user_id,periods.day)+recovered.bytes,j.byte_cap,p.ai.bytesPerDay,periods.day],
      ['ai-concurrency',sum(this.s,"SELECT count(*) n FROM jobs WHERE user_id=? AND state IN ('reserved','submitted','running')",j.user_id),1,p.ai.concurrency,'active']
    ];
    for(const [dimension,used,amount,limit,per]of dimensions){const requested=held&&dimension!=='money-operation'?0:amount;fail(used+requested<=limit,429,'QUOTA_EXCEEDED',{dimension,used,requested,limit,period:per,...(dimension.startsWith('money')?{currency:j.currency,unit:'micro'}:{})});}
    this.policy.storage(j.user_id,held?0:j.byte_cap,held?0:1);
    return periods;
  }
  submit(a,jobId,body) {
    fail(!this.stopping&&!this.closed,503,'SERVER_STOPPING');
    fail(!this.accountingFailure,503,'AI_ACCOUNTING_WRITE_FAILED');
    fail(!this.s.get("SELECT key FROM operational_state WHERE key='restore-ai-hold'"),503,'RESTORE_RECONCILIATION_REQUIRED');
    exact(body,['quoteHash','consent','acknowledgeAdditionalCharge'],['quoteHash','consent']);
    const prepared=this.s.tx(()=>{
      const j=this.owned(a.user.id,jobId);
      fail(body.consent===true&&body.quoteHash===j.quote_hash,400,'CONSENT_REQUIRED');
      if(j.state!=='prepared')return false;
      fail(j.auth_version===a.user.auth_version,409,'AUTH_VERSION_CHANGED');
      const quote=JSON.parse(j.quote);fail(quote.expiresAt>this.clock(),409,'QUOTE_EXPIRED');
      const input=JSON.parse(j.payload);if(input.reference)this.images.resolve(a,input.reference,j.project_id,j.project_revision);
      const c=this.credentials.owned(a.user.id,j.credential_id),provider=this.credentials.permitted(c);
      fail(c.version===j.credential_version&&c.status==='active'&&c.sealed,409,'CREDENTIAL_VERSION_CHANGED');
      fail(provider.metadata.version===j.adapter_version&&provider.metadata.models.some(m=>m.id===j.model_id&&m.version===j.model_version),409,'PROVIDER_VERSION_CHANGED');
      const unresolved=sum(this.s,"SELECT count(*) n FROM jobs WHERE user_id=? AND state='unknown' AND accounting='pending'",a.user.id)+recoveryUsage(this.s,a.user.id,j.currency,period(this.clock()).day,period(this.clock()).month).unresolved;
      fail(!unresolved||body.acknowledgeAdditionalCharge===true,409,'UNRESOLVED_CHARGE_ACK_REQUIRED',{count:unresolved});
      const periods=this.checkReservation(j);
      this.s.run("UPDATE jobs SET day=?,month=?,accounting='pending',session_id=? WHERE id=?",periods.day,periods.month,a.session.public_id,j.id);
      this.event(j.id,'reserved');return true;
    });
    if(prepared)this.dispatch(jobId,a.raw);
    return this.view(this.owned(a.user.id,jobId));
  }
  dispatch(jobId,raw) {
    if(this.closed||this.stopping)return;
    let secret,provider,j;
    try {
      j=this.s.tx(()=>{
        const j=this.s.get('SELECT * FROM jobs WHERE id=?',jobId);if(j.state!=='reserved')return null;
        const auth=this.accounts.authenticate(raw,false);fail(auth.user.id===j.user_id&&auth.user.auth_version===j.auth_version,401,'SESSION_INVALID');
        const c=this.credentials.owned(j.user_id,j.credential_id);provider=this.credentials.permitted(c);
        fail(c.version===j.credential_version&&c.status==='active',409,'CREDENTIAL_VERSION_CHANGED');
        const input=JSON.parse(j.payload);if(input.reference)this.images.resolve(auth,input.reference,j.project_id,j.project_revision);
        this.images.retain(input.reference);
        secret=this.credentials.vault.open(credentialContext(c),c.key_version,c.sealed);
        // Durable write BEFORE invoking submit: a crash here is conservatively unknown.
        this.s.run('UPDATE jobs SET submitted=? WHERE id=?',this.clock(),jobId);this.event(jobId,'submitted');return this.s.get('SELECT * FROM jobs WHERE id=?',jobId);
      });
      if(!j)return;
    } catch {
      secret?.fill(0);
      this.s.tx(()=>{this.s.run("UPDATE jobs SET accounting='none',error_code='PRE_SUBMISSION_REJECTED' WHERE id=? AND submitted IS NULL",jobId);this.event(jobId,'failed');});return;
    }
    const controller=new AbortController();
    const entry={controller,secret,timer:null};this.inflight.set(jobId,entry);
    entry.timer=setTimeout(()=>{this.unknownSafely(jobId,'PROVIDER_TIMEOUT_UNKNOWN');controller.abort();secret.fill(0);},this.deliveryTimeoutMs);entry.timer.unref();
    let response;
    try {
      response=provider.submit({jobId:j.id,operationId:j.operation_id,idempotencyKey:j.idem,credentialVersion:j.credential_version,secret,
        referenceBytes:JSON.parse(j.payload).reference?this.images.resolve(this.accounts.authenticate(raw,false),JSON.parse(j.payload).reference,j.project_id,j.project_revision):null,
        input:JSON.parse(j.payload),quote:JSON.parse(j.quote),signal:controller.signal,
        authorizeSend:()=>this.s.tx(()=>{
          fail(!controller.signal.aborted&&!this.accountingFailure,409,'PRE_SUBMISSION_REJECTED');
          const current=this.s.get('SELECT * FROM jobs WHERE id=?',jobId);
          fail(current&&['submitted','running'].includes(current.state),409,'PRE_SUBMISSION_REJECTED');
          const auth=this.accounts.authenticate(raw,false);
          fail(auth.user.id===current.user_id&&auth.user.auth_version===current.auth_version,401,'SESSION_INVALID');
          const credential=this.credentials.owned(current.user_id,current.credential_id);
          this.credentials.permitted(credential);
          fail(credential.status==='active'&&credential.version===current.credential_version,409,'CREDENTIAL_VERSION_CHANGED');
          fail(JSON.parse(current.quote).expiresAt>this.clock(),409,'QUOTE_EXPIRED');
          const input=JSON.parse(current.payload);if(input.reference)this.images.resolve(auth,input.reference,current.project_id,current.project_revision);
          this.checkReservation(current,{held:true});
        }),
        running:()=>{if(!this.closed&&!this.stopping)this.s.tx(()=>{const r=this.s.get('SELECT state FROM jobs WHERE id=?',jobId);if(r?.state==='submitted')this.event(jobId,'running');});}});
    } catch {response=Promise.reject(new Error('provider-submit'));}
    Promise.resolve(response).then(result=>{
      if(this.closed||this.stopping)return;
      clearTimeout(entry.timer);
      // A provider cannot smuggle the key into a public request identifier or image.
      const secretText=secret.toString('utf8');
      if(result?.requestId?.includes(secretText)||result?.artifact?.bytes?.includes(secret))throw new Error('secret-in-result');
      return this.settle(provider.metadata.id,j.id,result);
    }).catch(()=>{if(!this.closed&&!this.stopping)this.unknownSafely(jobId);}).finally(()=>{clearTimeout(entry.timer);secret.fill(0);this.inflight.delete(jobId);});
  }
  unknownSafely(jobId,code=null){
    try{this.markUnknown(jobId,code);}catch{this.accountingFailure=true;}
  }
  markUnknown(jobId,code=null) {
    this.s.tx(()=>{const j=this.s.get('SELECT * FROM jobs WHERE id=?',jobId);
      if(j&&activeStates.includes(j.state)){
        if(providerErrors.has(code))this.s.run('UPDATE jobs SET error_code=? WHERE id=?',code,jobId);
        this.event(jobId,'unknown');
      }
    });
  }
  cancel(user,jobId) {
    const j=this.owned(user,jobId);
    this.s.tx(()=>{
      this.s.run('UPDATE jobs SET cancel_requested=1 WHERE id=?',jobId);
      if(j.state==='prepared'||j.state==='reserved'){this.s.run("UPDATE jobs SET accounting='none' WHERE id=?",jobId);this.event(jobId,'cancelled');}
      else if(j.state==='submitted'||j.state==='running')this.event(jobId,'unknown');
    });
    const delivery=this.inflight.get(jobId);delivery?.controller.abort();delivery?.secret.fill(0);
    return this.view(this.owned(user,jobId));
  }
  revoke(user,sessionId=null,credentialId=null) {
    const jobs=this.s.all("SELECT * FROM jobs WHERE user_id=? AND state IN ('prepared','reserved','submitted','running')",user);
    for(const j of jobs)if((!sessionId||j.session_id===sessionId)&&(!credentialId||j.credential_id===credentialId))this.cancel(user,j.id);
  }
  settle(providerId,jobId,result) {
    if(this.closed||this.stopping)return Promise.reject(new Fault(503,'SERVER_STOPPING'));
    const promise=this.finishSettlement(providerId,jobId,result);
    this.settling.add(promise);this.settlingJobs.set(jobId,(this.settlingJobs.get(jobId)??0)+1);
    const done=()=>{this.settling.delete(promise);const n=this.settlingJobs.get(jobId)-1;if(n)this.settlingJobs.set(jobId,n);else this.settlingJobs.delete(jobId);};
    void promise.then(done,done);
    return promise;
  }
  async finishSettlement(providerId,jobId,result) {
    // Trusted adapter boundary only. There is no unauthenticated generic callback route.
    exact(result,['eventId','state','actualMicros','currency','requestId','errorCode','artifact','usage'],['eventId','state','actualMicros','currency']);
    str(result.eventId,128);fail(['succeeded','failed','cancelled','unknown'].includes(result.state),502,'PROVIDER_RESULT_INVALID');
    fail(result.state!=='unknown'||result.actualMicros===null&&!result.artifact&&!result.usage,502,'PROVIDER_RESULT_INVALID');
    if(result.usage!==undefined){
      exact(result.usage,['currency','unit','costInUsdTicks','microsRounding','source']);
      fail(result.usage.currency==='USD'&&result.currency==='USD'&&result.usage.unit==='usd_tick'&&result.usage.source==='provider-response'&&result.usage.microsRounding==='ceil',502,'PROVIDER_RESULT_INVALID');
      fail(typeof result.usage.costInUsdTicks==='string'&&/^(0|[1-9][0-9]{0,15})$/.test(result.usage.costInUsdTicks),502,'PROVIDER_RESULT_INVALID');
      const ticks=BigInt(result.usage.costInUsdTicks);
      fail(ticks<=BigInt(Number.MAX_SAFE_INTEGER)&&result.actualMicros===Number((ticks+9999n)/10000n),502,'PROVIDER_RESULT_INVALID');
    }
    if(result.actualMicros!==null)integer(result.actualMicros);
    if(result.requestId!==undefined)fail(typeof result.requestId==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(result.requestId),502,'PROVIDER_RESULT_INVALID');
    let artifact=null,decoded=null;
    if(result.artifact) {
      exact(result.artifact,['mediaType','bytes']);
      const {mediaType,bytes}=result.artifact;
      try{
        const job=this.s.get('SELECT quote FROM jobs WHERE id=? AND provider_id=?',jobId,providerId);fail(job,404,'NOT_FOUND');
        fail(result.state==='succeeded'&&Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=JSON.parse(job.quote).maxOutputBytes&&['image/png','image/jpeg'].includes(mediaType),502,'PROVIDER_RESULT_INVALID');
        artifact={mediaType,bytes:Buffer.from(bytes),hash:sha(bytes)};decoded=await this.images.checkArtifact(artifact);
      }catch{
        // Invalid image never erases a provider-reported monetary fact.
        result={...result,state:result.actualMicros===null?'unknown':'failed',errorCode:'PROVIDER_RESPONSE_INVALID'};
        delete result.artifact;artifact=null;
      }
      if(this.closed)return;
    }
    const eventHash=sha(canonical({...result,artifact:artifact?{mediaType:artifact.mediaType,hash:artifact.hash}:null}));
    return this.s.tx(()=>{
      const j=this.s.get('SELECT * FROM jobs WHERE id=? AND provider_id=?',jobId,providerId);fail(j&&j.submitted!==null,404,'NOT_FOUND');
      fail(result.currency===j.currency,502,'SETTLEMENT_CURRENCY_MISMATCH');
      const existing=this.s.get('SELECT * FROM settlements WHERE job_id=? AND event_id=?',jobId,result.eventId);
      if(existing){fail(existing.event_hash===eventHash,409,'SETTLEMENT_CONFLICT');return this.view(j);}
      const reconciliation=['succeeded','failed','cancelled'].includes(j.state) && j.accounting==='estimated' && result.actualMicros!==null && result.state===j.state;
      fail(['submitted','running','unknown'].includes(j.state)||reconciliation,409,'SETTLEMENT_ALREADY_FINAL');
      fail(!reconciliation||!artifact,409,'RECONCILIATION_ARTIFACT_FORBIDDEN');
      if(artifact)fail(artifact.bytes.length<=JSON.parse(j.quote).maxOutputBytes,502,'PROVIDER_OUTPUT_LIMIT');
      this.s.run('INSERT INTO settlements VALUES(?,?,?)',jobId,result.eventId,eventHash);
      this.s.run('UPDATE jobs SET actual=?,accounting=?,request_id=COALESCE(?,request_id),error_code=?,provider_usage=COALESCE(?,provider_usage) WHERE id=?',result.actualMicros,result.state==='unknown'?'pending':result.actualMicros===null?'estimated':'actual',result.requestId??null,providerErrors.has(result.errorCode)?result.errorCode:null,result.usage?canonical(result.usage):null,jobId);
      this.event(jobId,result.state);
      const user=this.s.get('SELECT status FROM users WHERE id=?',j.user_id);
      if(artifact&&user.status!=='deleted') {
        try {this.policy.storage(j.user_id,artifact.bytes.length+decoded.thumbnail.bytes.length,1);
          const artifactId=id();this.s.run('INSERT INTO artifacts VALUES(?,?,?,?,?,?,?)',artifactId,j.user_id,jobId,artifact.mediaType,artifact.bytes,artifact.hash,this.clock());
          this.images.storeArtifact(artifactId,decoded);
        } catch(e){if(e.code!=='QUOTA_EXCEEDED')throw e;this.s.run("UPDATE jobs SET error_code='RESULT_STORAGE_QUOTA' WHERE id=?",jobId);}
      }
      return this.view(this.s.get('SELECT * FROM jobs WHERE id=?',jobId));
    });
  }
  closeUnknown(user,jobId,body) {
    exact(body,['reason']);str(body.reason,1000);
    const j=this.owned(user,jobId);fail(j.state==='unknown',409,'NOT_UNKNOWN');
    this.s.run('UPDATE jobs SET closed_reason=? WHERE id=? AND user_id=?',body.reason,jobId,user);
    return this.view(this.owned(user,jobId));
  }
  recover(options={}) {return runMaintenance(this.s,{clock:this.clock,...options,recoverOnly:true,isLive:j=>this.inflight.has(j)});}
  prune(options={}) {return runMaintenance(this.s,{clock:this.clock,...options,isLive:j=>this.inflight.has(j)});}
  stop() {
    // Captured results keep their own bounded codec deadline and original context.
    this.stopping=true;this.stoppedJobs=[...new Set([...this.inflight.keys(),...this.settlingJobs.keys()])];
    for(const e of this.inflight.values()){clearTimeout(e.timer);e.controller.abort();e.secret.fill(0);}
  }
  async drain(){
    const r=await Promise.allSettled([...this.settling]);
    const jobs=this.stoppedJobs??[];
    for(let start=0;start<jobs.length;start+=32){
      const timeout=this.s.get('PRAGMA busy_timeout').timeout;this.s.db.exec('PRAGMA busy_timeout=0;');
      try{
        // markUnknown only changes active rows: a completed captured settlement wins.
        for(const jobId of jobs.slice(start,start+32))this.unknownSafely(jobId);
      }finally{this.s.db.exec('PRAGMA busy_timeout='+timeout);}
      if(start+32<jobs.length)await yieldTurn();
    }
    fail(!this.accountingFailure&&r.every(x=>x.status==='fulfilled'),503,'SHUTDOWN_SETTLEMENT_FAILED');
  }
  finishStop(){this.closed=true;}
}
