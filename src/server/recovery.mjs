import {canonical,fail,id,integer,parse,period,sha,uuid} from './core.mjs';
export const RECOVERY_LIMITS=Object.freeze({bundleBytes:2_000_000,evidenceFiles:512,fileBytes:8_000_000,evidenceBytes:32_000_000,storedEvidenceBytes:128_000_000,entries:5000,scopes:2000,ledgerRows:20000,plans:256,planBytes:8_000_000,storedPlanBytes:64_000_000});
const h=v=>{fail(typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),400,'RECOVERY_HASH');return v;};
const fields=(v,keys)=>{fail(v&&Object.getPrototypeOf(v)!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k)),400,'RECOVERY_FIELDS');};
const label=v=>fail(typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(v),400,'RECOVERY_IDENTITY');
const time=v=>integer(v,8_640_000_000_000_000);
const unique=(values,code='RECOVERY_DUPLICATE')=>fail(new Set(values).size===values.length,400,code);
const add=(a,b)=>{const n=a+b;fail(Number.isSafeInteger(n),413,'RECOVERY_TOTAL_LIMIT');return n;};
const amount=r=>r.actual??r.bound??r.record.capMicros;
const terminal=['succeeded','failed','cancelled'];
const scopeFields=['userId','providerId','endpointId','credentialId','credentialVersion','currency'];
export const recoveryScope=r=>Object.fromEntries(scopeFields.map(k=>[k,r[k]]));
const scopeKey=r=>canonical(recoveryScope(r));
const digest=v=>sha(canonical(v));
export function recoveryLedger(s) {
 const c=s.get('SELECT * FROM recovery_clock WHERE id=1'),key=s.get("SELECT value FROM operational_state WHERE key='recovery-restore-id'");
 const restore=key?s.get('SELECT * FROM recovery_restores WHERE id=?',key.value):null;
 const held=!!s.get("SELECT key FROM operational_state WHERE key='restore-ai-hold'");
 fail(!held||restore,409,'RECOVERY_RESTORE_IDENTITY_MISSING');
 const state={databaseId:c.database_id,generation:c.generation,schemaVersion:s.get('PRAGMA schema_version').schema_version,restore:restore??null,held};
 return {...state,hash:digest(state)};
}
export function recoveryRecord(s,j) {
 const at=j.recovery_period_at??s.get("SELECT at FROM job_events WHERE job_id=? AND state='reserved' ORDER BY seq LIMIT 1",j.id)?.at??j.submitted;
 fail(at!==null&&period(at).day===j.day&&period(at).month===j.month,409,'RECOVERY_ORIGIN_PERIOD_UNKNOWN');
 return {version:'arch-ai-accounting-identity/1',jobId:j.id,userId:j.user_id,operationId:j.operation_id,idempotencyKey:j.idem,payloadHash:j.payload_hash,
  providerId:j.provider_id,endpointId:j.endpoint_id,credentialId:j.credential_id,credentialVersion:j.credential_version,
  adapterVersion:j.adapter_version,modelId:j.model_id,modelVersion:j.model_version,projectId:j.project_id,projectRevision:j.project_revision,
  requestId:j.request_id,submittedAt:j.submitted,periodAt:at,day:j.day,month:j.month,currency:j.currency,capMicros:j.cap,byteCap:j.byte_cap};
}
function ledgerRows(s) {
 const count=s.get("SELECT (SELECT count(*) FROM jobs WHERE accounting!='none')+(SELECT count(*) FROM recovery_obligations) n").n;
 fail(count<=RECOVERY_LIMITS.ledgerRows,413,'RECOVERY_LEDGER_LIMIT');
 const jobs=s.all("SELECT * FROM jobs WHERE accounting!='none' ORDER BY id").map(j=>{
  fail(j.submitted!==null&&!['reserved','submitted','running'].includes(j.state),409,'RECOVERY_ACTIVE_JOBS');
  return {target:'job',record:recoveryRecord(s,j),state:j.state,accounting:j.accounting,actual:j.actual,bound:j.recovery_bound};
 });
 const extra=s.all('SELECT * FROM recovery_obligations ORDER BY id').map(j=>({target:'obligation',record:{...parse(j.record),requestId:j.request_id},state:j.state,accounting:j.accounting,actual:j.actual,bound:j.recovery_bound}));
 return [...jobs,...extra];
}
function knownScopes(s,rows) {
 const list=new Map(rows.map(r=>[scopeKey(r.record),recoveryScope(r.record)]));
 for(const c of s.all('SELECT id,user_id,provider_id,endpoint_id,version FROM credentials ORDER BY id')) {
  const currencies=parse(s.get('SELECT json FROM budgets WHERE user_id=?',c.user_id)?.json??'[]').map(x=>x.currency);
  for(const currency of currencies){const scope={userId:c.user_id,providerId:c.provider_id,endpointId:c.endpoint_id,credentialId:c.id,credentialVersion:c.version,currency};list.set(scopeKey(scope),scope);}
 }
 return list;
}
export function recoveryStatus(s,{details=false}={}) {
 const ledger=recoveryLedger(s),counts={
  pending:s.get("SELECT count(*) n FROM jobs WHERE accounting='pending'").n,
  estimated:s.get("SELECT count(*) n FROM jobs WHERE accounting='estimated'").n,
  obligations:s.get('SELECT count(*) n FROM recovery_obligations').n,
  plans:s.get('SELECT count(*) n FROM recovery_plans').n};
 const result={version:'arch-ai-recovery-status/1',held:ledger.held,ledgerHash:ledger.hash,restoreId:ledger.restore?.id??null,counts};
 if(details){
  const rows=ledgerRows(s),unsubmitted=s.all(`SELECT id jobId,user_id userId,operation_id operationId,idem idempotencyKey,payload_hash payloadHash,
   provider_id providerId,endpoint_id endpointId,credential_id credentialId,credential_version credentialVersion,
   adapter_version adapterVersion,model_id modelId,model_version modelVersion,project_id projectId,project_revision projectRevision,
   created createdAt,request_id requestId,currency,cap capMicros,byte_cap byteCap,state
   FROM jobs WHERE accounting='none' AND submitted IS NULL AND state IN ('prepared','failed','cancelled') ORDER BY id LIMIT ?`,RECOVERY_LIMITS.ledgerRows+1);
  fail(rows.length+unsubmitted.length<=RECOVERY_LIMITS.ledgerRows,413,'RECOVERY_LEDGER_LIMIT');
  result.private={ledger,scopes:[...knownScopes(s,rows).values()],records:rows,unsubmitted};
 }
 return result;
}
function checkScope(s,v) {
 fields(v,scopeFields);uuid(v.userId);uuid(v.credentialId);integer(v.credentialVersion,1_000_000,1);
 label(v.providerId);label(v.endpointId);fail(/^[A-Z]{3}$/.test(v.currency),400,'RECOVERY_CURRENCY');
 fail(s.get('SELECT id FROM users WHERE id=?',v.userId),409,'RECOVERY_USER_MISSING');
 const c=s.get('SELECT user_id,provider_id,endpoint_id FROM credentials WHERE id=?',v.credentialId);
 fail(!c||c.user_id===v.userId&&c.provider_id===v.providerId&&c.endpoint_id===v.endpointId,409,'RECOVERY_CREDENTIAL_IDENTITY');
 // A lost version/credential is accounting metadata only. Never create a usable credential.
}
function checkRecord(s,r) {
 fields(r,['version','jobId','userId','operationId','idempotencyKey','payloadHash','providerId','endpointId','credentialId','credentialVersion','adapterVersion','modelId','modelVersion','projectId','projectRevision','requestId','submittedAt','periodAt','day','month','currency','capMicros','byteCap']);
 fail(r.version==='arch-ai-accounting-identity/1',400,'RECOVERY_VERSION');
 for(const k of ['jobId','operationId','idempotencyKey','projectId'])uuid(r[k]);
 for(const k of ['adapterVersion','modelId','modelVersion'])label(r[k]);
 fail(typeof r.projectRevision==='string'&&r.projectRevision.length>0&&r.projectRevision.length<=128,400,'RECOVERY_IDENTITY');
 h(r.payloadHash);checkScope(s,recoveryScope(r));if(r.requestId!==null)label(r.requestId);
 time(r.submittedAt);time(r.periodAt);fail(r.periodAt<=r.submittedAt&&period(r.periodAt).day===r.day&&period(r.periodAt).month===r.month,400,'RECOVERY_PERIOD');
 integer(r.capMicros);integer(r.byteCap,64_000_000);
}
function loadedBundle(input) {
 const b=input.bundle;fail(Buffer.byteLength(canonical(b))<=RECOVERY_LIMITS.bundleBytes,413,'RECOVERY_BUNDLE_LIMIT');
 fields(b,['version','bundleId','restoreId','operator','inventory','inventoryEvidenceHash','entries','coverage','evidence']);
 fail(b.version==='arch-ai-recovery-bundle/1',400,'RECOVERY_VERSION');uuid(b.bundleId);if(b.restoreId!==null)uuid(b.restoreId);
 fields(b.operator,['id','verifiedAt','assertion']);label(b.operator.id);time(b.operator.verifiedAt);
 fail(b.operator.assertion==='provider-records-app-correlation-cutover',400,'RECOVERY_OPERATOR_ATTESTATION');
 fields(b.inventory,['from','through','scopes']);time(b.inventory.from);time(b.inventory.through);
 fail(b.inventory.from<=b.inventory.through&&b.operator.verifiedAt>=b.inventory.through,400,'RECOVERY_INTERVAL');
 for(const [v,n]of [[b.entries,RECOVERY_LIMITS.entries],[b.inventory.scopes,RECOVERY_LIMITS.scopes],[b.coverage,RECOVERY_LIMITS.scopes],[b.evidence,RECOVERY_LIMITS.evidenceFiles]])
  fail(Array.isArray(v)&&v.length<=n,413,'RECOVERY_RESOURCE_LIMIT');
 fail(input.evidence instanceof Map&&input.evidence.size===b.evidence.length,400,'RECOVERY_EVIDENCE_MISSING');
 const evidence=new Map(),used=new Set();let bytes=0;
 for(const e of b.evidence){
  fields(e,['sha256','byteLength','mediaType']);h(e.sha256);integer(e.byteLength,RECOVERY_LIMITS.fileBytes,1);
  fail(['application/json','application/pdf','text/plain'].includes(e.mediaType),400,'RECOVERY_EVIDENCE_TYPE');
  const raw=input.evidence.get(e.sha256);
  fail(Buffer.isBuffer(raw)&&raw.length===e.byteLength&&sha(raw)===e.sha256,400,'RECOVERY_EVIDENCE_HASH');
  fail(!evidence.has(e.sha256),400,'RECOVERY_DUPLICATE');bytes+=raw.length;fail(bytes<=RECOVERY_LIMITS.evidenceBytes,413,'RECOVERY_EVIDENCE_LIMIT');
  evidence.set(e.sha256,{...e,bytes:Buffer.from(raw)});
 }
 function proof(hash,kind,fact){
  h(hash);const e=evidence.get(hash);fail(e?.mediaType==='application/json',400,'RECOVERY_EVIDENCE_MISSING');
  fail(e.byteLength<=RECOVERY_LIMITS.bundleBytes,413,'RECOVERY_STATEMENT_LIMIT');
  const doc=parse(e.bytes.toString('utf8'));fields(doc,['version','kind','factHash','operatorId','verifiedAt','attachments']);
  fail(doc.version==='arch-ai-recovery-evidence/1'&&doc.kind===kind&&doc.factHash===digest(fact)&&doc.operatorId===b.operator.id&&doc.verifiedAt===b.operator.verifiedAt,400,'RECOVERY_EVIDENCE_FACT');
  fail(Array.isArray(doc.attachments)&&doc.attachments.length>0&&doc.attachments.length<=16,400,'RECOVERY_ATTACHMENTS_REQUIRED');
  unique(doc.attachments);used.add(hash);
  for(const ref of doc.attachments){h(ref);fail(ref!==hash&&evidence.has(ref),400,'RECOVERY_EVIDENCE_MISSING');used.add(ref);}
 }
 proof(b.inventoryEvidenceHash,'inventory',{inventory:b.inventory,operator:b.operator});
 for(const entry of b.entries){
  fields(entry,['entryId','target','record','decision','evidenceHash']);uuid(entry.entryId);
  fail(['job','missing','obligation'].includes(entry.target),400,'RECOVERY_TARGET');
  proof(entry.evidenceHash,'operation',{target:entry.target,record:entry.record,decision:entry.decision});
 }
 for(const c of b.coverage){fields(c,['scope','days','evidenceHash']);proof(c.evidenceHash,'coverage',{inventory:b.inventory,scope:c.scope,days:c.days});}
 fail(used.size===evidence.size,400,'RECOVERY_UNREFERENCED_EVIDENCE');
 return {bundle:structuredClone(b),evidence,bundleHash:digest(b)};
}
function analyze(s,loaded,now) {
 const b=loaded.bundle,ledger=recoveryLedger(s);time(now);fail(b.operator.verifiedAt<=now,400,'RECOVERY_FUTURE_EVIDENCE');
 fail(b.restoreId===(ledger.restore?.id??null),409,'RECOVERY_RESTORE_MISMATCH');
 const rows=ledgerRows(s),lookup=new Map(rows.map(r=>[r.record.jobId,r])),scopes=knownScopes(s,rows),issues=[],discrepancies=[];
 if(ledger.held){
  const start=ledger.restore.coverage_from;
  if(start===0&&s.get('SELECT count(*) n FROM tombstones t WHERE NOT EXISTS(SELECT 1 FROM recovery_obligations o WHERE o.id=t.job_id)').n>0)issues.push({code:'RECOVERY_RETIRED_LEDGER_UNAVAILABLE'});
  if(b.inventory.from>start)issues.push({code:'RECOVERY_INTERVAL_START',requiredFrom:start});
  if(b.inventory.through<ledger.restore.restored_at)issues.push({code:'RECOVERY_INTERVAL_END',requiredThrough:ledger.restore.restored_at});
 }
 for(const sc of b.inventory.scopes)checkScope(s,sc);unique(b.inventory.scopes.map(scopeKey));
 const inventory=new Map(b.inventory.scopes.map(sc=>[scopeKey(sc),sc]));
 for(const [key,sc]of scopes)if(!inventory.has(key))issues.push({code:'RECOVERY_SCOPE_MISSING',scope:sc});
 for(const c of s.all('SELECT id,version FROM credentials')){
  if(!b.inventory.scopes.some(sc=>sc.credentialId===c.id&&sc.credentialVersion===c.version))
   issues.push({code:'RECOVERY_CURRENCY_INVENTORY_MISSING',credentialId:c.id,credentialVersion:c.version});
 }
 const actions=[],entryJobs=new Set(),entryIds=new Set();
 for(const entry of b.entries){
  const r=entry.record,d=entry.decision;checkRecord(s,r);fail(r.submittedAt<=b.operator.verifiedAt,400,'RECOVERY_FUTURE_ENTRY');fail(d&&typeof d==='object'&&!Array.isArray(d),400,'RECOVERY_DECISION');
  fail(!entryJobs.has(r.jobId)&&!entryIds.has(entry.entryId),400,'RECOVERY_DUPLICATE');entryJobs.add(r.jobId);entryIds.add(entry.entryId);
  let old=lookup.get(r.jobId),originUnsubmitted=false,originSnapshot=null;
  if(!old&&entry.target==='job'){
   const j=s.get("SELECT * FROM jobs WHERE id=? AND submitted IS NULL AND accounting='none' AND state IN ('prepared','failed','cancelled')",r.jobId);
   if(j){
    const reserved=s.get("SELECT at FROM job_events WHERE job_id=? AND state='reserved' ORDER BY seq LIMIT 1",j.id);
    fail(r.periodAt>=j.created&&(!reserved||reserved.at===r.periodAt)&&(!j.day||j.day===r.day)&&(!j.month||j.month===r.month),409,'RECOVERY_ORIGIN_PERIOD_CHANGED');
    const journal=recoveryRecord(s,{...j,submitted:r.submittedAt,day:r.day,month:r.month,recovery_period_at:r.periodAt});
    old={target:'job',record:journal,state:j.state,accounting:j.accounting,actual:null,bound:null};originUnsubmitted=true;
    originSnapshot={state:j.state,accounting:j.accounting,submittedAt:j.submitted,day:j.day,month:j.month,periodAt:reserved?.at??null};
   }
  }
  if(entry.target==='missing'){
   fail(!old&&!s.get('SELECT id FROM jobs WHERE id=?',r.jobId)&&!s.get('SELECT job_id FROM tombstones WHERE job_id=?',r.jobId),409,'RECOVERY_IDENTITY_EXISTS');
   fail(!s.get('SELECT id FROM jobs WHERE user_id=? AND (operation_id=? OR idem=?)',r.userId,r.operationId,r.idempotencyKey)&&
    !s.get('SELECT job_id FROM tombstones WHERE user_id=? AND (operation_id=? OR idem=?)',r.userId,r.operationId,r.idempotencyKey),409,'RECOVERY_IDENTITY_EXISTS');
   fail(!rows.some(j=>j.record.userId===r.userId&&(j.record.operationId===r.operationId||j.record.idempotencyKey===r.idempotencyKey)),409,'RECOVERY_IDENTITY_EXISTS');
   old={target:'obligation',record:r,state:'unknown',accounting:'pending',actual:null,bound:null};
  }else {
   fail(old&&old.target===entry.target,409,'RECOVERY_TARGET_MISSING');
   const previous=old.record;
   fail(previous.requestId===null||previous.requestId===r.requestId,409,'RECOVERY_REQUEST_ID_CHANGED');
   fail(digest({...previous,requestId:r.requestId})===digest(r),409,'RECOVERY_IDENTITY_CHANGED');
  }
  if(r.requestId!==null){
   fail(!rows.some(j=>j.record.jobId!==r.jobId&&j.record.providerId===r.providerId&&j.record.requestId===r.requestId),409,'RECOVERY_REQUEST_DUPLICATE');
   fail(!s.get('SELECT id FROM jobs WHERE id!=? AND provider_id=? AND request_id=?',r.jobId,r.providerId,r.requestId),409,'RECOVERY_REQUEST_DUPLICATE');
  }
  let next={...old,record:r};
  if(d.kind==='retain'){fields(d,['kind']);fail(entry.target!=='missing'&&!originUnsubmitted,400,'RECOVERY_MISSING_AMOUNT');}
  else {
   fields(d,['kind','micros','state']);integer(d.micros);fail(['actual','bounded'].includes(d.kind),400,'RECOVERY_DECISION');
   if(d.kind==='actual'){
    fail(terminal.includes(d.state),400,'RECOVERY_TERMINAL_REQUIRED');
    fail(old.actual===null||old.actual===d.micros&&old.state===d.state,409,'RECOVERY_ACTUAL_FINAL');
    fail(originUnsubmitted||old.state==='unknown'||old.state===d.state,409,'RECOVERY_STATE_CHANGED');
    next={...next,actual:d.micros,accounting:'actual',state:d.state};
    if(d.micros>r.capMicros)discrepancies.push({code:'RECOVERY_ACTUAL_ABOVE_QUOTE',jobId:r.jobId,quotedMicros:r.capMicros,actualMicros:d.micros,currency:r.currency});
   }else {
    fail(old.actual===null&&d.micros>=amount(old),409,'RECOVERY_BOUND_REDUCTION_REQUIRES_ACTUAL');
    fail(d.state===old.state||(entry.target==='missing'||originUnsubmitted)&&['unknown',...terminal].includes(d.state),409,'RECOVERY_STATE_CHANGED');
    next={...next,state:d.state,bound:d.micros,accounting:d.state==='unknown'?'pending':'estimated'};
   }
  }
  const action={entryId:entry.entryId,target:entry.target,originUnsubmitted,originSnapshot,record:r,before:entry.target==='missing'?null:old,after:next,evidenceHash:entry.evidenceHash};
  actions.push(action);lookup.set(r.jobId,next);
  if(entry.target==='missing'||originUnsubmitted)rows.push(next);else rows[rows.findIndex(v=>v.record.jobId===r.jobId)]=next;
  if(!inventory.has(scopeKey(r)))issues.push({code:'RECOVERY_SCOPE_MISSING',scope:recoveryScope(r)});
 }
 unique(rows.map(r=>r.record.userId+':'+r.record.operationId));unique(rows.map(r=>r.record.userId+':'+r.record.idempotencyKey));
 const required=new Map();
 for(const row of rows){
  const r=row.record;
  if(r.periodAt<b.inventory.from||r.submittedAt>b.inventory.through)issues.push({code:'RECOVERY_RECORD_OUTSIDE_INTERVAL',jobId:r.jobId,day:r.day});
  const key=scopeKey(r),days=required.get(key)??new Map();required.set(key,days);
  const day=days.get(r.day)??{day:r.day,operationIds:[],totalMicros:0};
  day.operationIds.push(r.operationId);day.totalMicros=add(day.totalMicros,amount(row));days.set(r.day,day);
 }
 unique(b.coverage.map(c=>scopeKey(c.scope)));
 for(const c of b.coverage){
  checkScope(s,c.scope);const key=scopeKey(c.scope);
  fail(inventory.has(key),400,'RECOVERY_COVERAGE_SCOPE');
  fail(Array.isArray(c.days)&&c.days.length<=RECOVERY_LIMITS.entries,413,'RECOVERY_RESOURCE_LIMIT');
  unique(c.days.map(d=>d.day));
  const expected=required.get(key)??new Map();
  for(const day of c.days){
   fields(day,['day','operationIds','totalMicros']);
   fail(typeof day.day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day.day)&&Number.isFinite(Date.parse(day.day+'T00:00:00Z'))&&period(Date.parse(day.day+'T00:00:00Z')).day===day.day,400,'RECOVERY_PERIOD');
   integer(day.totalMicros,Number.MAX_SAFE_INTEGER);fail(Array.isArray(day.operationIds)&&day.operationIds.length<=RECOVERY_LIMITS.entries,413,'RECOVERY_RESOURCE_LIMIT');
   for(const op of day.operationIds)uuid(op);unique(day.operationIds);
   const wanted=expected.get(day.day)??{operationIds:[],totalMicros:0};
   if(digest([...wanted.operationIds].sort())!==digest([...day.operationIds].sort())||wanted.totalMicros!==day.totalMicros)
    issues.push({code:'RECOVERY_DAY_MISMATCH',scope:c.scope,day:day.day,expected:wanted});
  }
  for(const day of expected.keys())if(!c.days.some(d=>d.day===day))issues.push({code:'RECOVERY_DAY_MISSING',scope:c.scope,day});
 }
 for(const [key,sc]of inventory)if(!b.coverage.some(c=>scopeKey(c.scope)===key))issues.push({code:'RECOVERY_COVERAGE_MISSING',scope:sc});
 // An unresolved amount needs a specific operation-level proof of its bound, not merely a label or coverage total.
 for(const row of rows)if(row.actual===null&&!actions.some(a=>a.record.jobId===row.record.jobId&&a.after.bound!==null&&b.entries.find(e=>e.entryId===a.entryId).decision.kind==='bounded'))
  issues.push({code:'RECOVERY_UNCERTAINTY_UNBOUNDED',jobId:row.record.jobId});
 const totals=new Map();
 for(const row of rows)for(const p of [row.record.day,row.record.month]){const key=row.record.userId+':'+row.record.currency+':'+p;totals.set(key,add(totals.get(key)??0,amount(row)));}
 return {ledger,actions,actionHash:digest(actions),issues,discrepancies,releaseHold:ledger.held&&issues.length===0,uncertain:rows.filter(r=>r.actual===null).length};
}
function existingApplication(s,hash,bundleHash) {
 const row=s.get('SELECT * FROM recovery_applications WHERE plan_hash=?',hash);
 if(!row)return null;fail(row.bundle_hash===bundleHash,409,'RECOVERY_BUNDLE_CHANGED');return parse(row.receipt);
}
export function createRecoveryPlan(s,input,{now=Date.now()}={}) {
 const loaded=loadedBundle(input),b=loaded.bundle;
 return s.tx(()=>{
  fail(b.restoreId===(recoveryLedger(s).restore?.id??null),409,'RECOVERY_RESTORE_MISMATCH');
  const previous=s.get('SELECT * FROM recovery_plans WHERE bundle_id=?',b.bundleId);
  if(previous){fail(previous.bundle_hash===loaded.bundleHash,409,'RECOVERY_BUNDLE_CHANGED');const applied=existingApplication(s,previous.hash,loaded.bundleHash);if(applied)return {status:'applied',planHash:previous.hash,receipt:applied};fail(previous.ledger_hash===recoveryLedger(s).hash,409,'RECOVERY_PLAN_STALE');return {status:'planned',planHash:previous.hash};}
  fail(s.get('SELECT count(*) n FROM recovery_plans').n<RECOVERY_LIMITS.plans,413,'RECOVERY_PLAN_LIMIT');
  const check=analyze(s,loaded,now);
  const body={version:'arch-ai-recovery-plan/1',bundle:b,bundleHash:loaded.bundleHash,ledger:check.ledger,actions:check.actions,actionHash:check.actionHash,
   issues:check.issues,discrepancies:check.discrepancies,releaseHold:check.releaseHold,uncertain:check.uncertain,createdAt:now};
  const text=canonical(body),planHash=sha(text),bytes=Buffer.byteLength(text);
  fail(bytes<=RECOVERY_LIMITS.planBytes&&bytes+s.get('SELECT COALESCE(SUM(length(CAST(json AS BLOB))),0) n FROM recovery_plans').n<=RECOVERY_LIMITS.storedPlanBytes,413,'RECOVERY_PLAN_BYTES_LIMIT');
  s.run('INSERT INTO recovery_plans(hash,bundle_id,bundle_hash,ledger_hash,restore_id,created,json) VALUES(?,?,?,?,?,?,?)',planHash,b.bundleId,loaded.bundleHash,check.ledger.hash,b.restoreId,now,text);
  return {status:'planned',planHash,issues:check.issues.length,releaseHold:check.releaseHold,discrepancies:check.discrepancies.length};
 });
}
function validatePlan(s,planHash,loaded,now) {
 h(planHash);const row=s.get('SELECT * FROM recovery_plans WHERE hash=?',planHash);fail(row,404,'RECOVERY_PLAN_MISSING');
 fail(sha(row.json)===planHash,409,'RECOVERY_PLAN_CHANGED');const plan=parse(row.json);
 fail(plan.bundleHash===loaded.bundleHash&&digest(plan.bundle)===loaded.bundleHash&&plan.actionHash===digest(plan.actions),409,'RECOVERY_BUNDLE_CHANGED');
 fail(plan.ledger.databaseId===recoveryLedger(s).databaseId&&plan.bundle.restoreId===(recoveryLedger(s).restore?.id??null),409,'RECOVERY_RESTORE_MISMATCH');
 const applied=existingApplication(s,planHash,loaded.bundleHash);if(applied)return {applied,plan};
 fail(plan.ledger.hash===recoveryLedger(s).hash,409,'RECOVERY_PLAN_STALE');
 const check=analyze(s,loaded,now);
 fail(check.actionHash===plan.actionHash&&digest(check.issues)===digest(plan.issues)&&check.releaseHold===plan.releaseHold,409,'RECOVERY_PLAN_CHANGED');
 return {plan,check};
}
export function checkRecoveryPlan(s,planHash,input,{now=Date.now()}={}) {
 const loaded=loadedBundle(input);
 return s.tx(()=>{
  const v=validatePlan(s,planHash,loaded,now);
  if(v.applied)return {status:'applied',planHash,receipt:v.applied};
  const report={version:'arch-ai-recovery-check/1',planHash,actionHash:v.plan.actionHash,ledgerHash:v.check.ledger.hash,issues:v.check.issues,
   discrepancies:v.check.discrepancies,releaseHold:v.check.releaseHold,checkedAt:now,evidenceCheck:'hashes-and-correlated-facts',invoiceTruth:'operator-attested-not-machine-verified'};
  s.run('UPDATE recovery_plans SET checked=? WHERE hash=?',canonical(report),planHash);return report;
 });
}
export function applyRecoveryPlan(s,planHash,input,{approveHash,now=Date.now(),fault=()=>{}}={}) {
 fail(approveHash===planHash,400,'RECOVERY_APPROVAL_REQUIRED');const loaded=loadedBundle(input);
 return s.tx(()=>{
  const v=validatePlan(s,planHash,loaded,now);if(v.applied)return {status:'applied',replayed:true,receipt:v.applied};
  fail(s.get('SELECT checked FROM recovery_plans WHERE hash=?',planHash).checked,409,'RECOVERY_CHECK_REQUIRED');
  let stored=s.get('SELECT COALESCE(SUM(byte_length),0) n FROM recovery_evidence').n;
  for(const e of loaded.evidence.values()){
   const exists=s.get('SELECT byte_length,bytes FROM recovery_evidence WHERE hash=?',e.sha256);
   if(exists)fail(exists.byte_length===e.byteLength&&sha(exists.bytes)===e.sha256,409,'RECOVERY_STORED_EVIDENCE_CHANGED');
   else{stored+=e.byteLength;fail(stored<=RECOVERY_LIMITS.storedEvidenceBytes,413,'RECOVERY_STORED_EVIDENCE_LIMIT');s.run('INSERT INTO recovery_evidence VALUES(?,?,?,?)',e.sha256,e.mediaType,e.byteLength,e.bytes);}
  }
  fault('after-evidence');
  let index=0;
  for(const a of v.plan.actions){
   const r=a.record,n=a.after;
   if(a.target==='missing'){
    s.run(`INSERT INTO recovery_obligations VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
     r.jobId,r.userId,r.operationId,r.idempotencyKey,r.payloadHash,r.providerId,r.endpointId,r.credentialId,r.credentialVersion,r.requestId,r.submittedAt,r.day,r.month,r.currency,r.capMicros,r.byteCap,n.actual,n.bound,n.state,n.accounting,canonical(r),loaded.bundle.bundleId,now);
    s.run('INSERT INTO tombstones VALUES(?,?,?,?,?)',r.userId,r.operationId,r.idempotencyKey,r.payloadHash,r.jobId);
   }else if(digest(a.before)!==digest(n)){
    if(a.target==='job'){
     s.run('INSERT INTO settlements VALUES(?,?,?)',r.jobId,'recovery:'+a.entryId,digest(a));
     s.run('UPDATE jobs SET actual=?,recovery_bound=?,accounting=?,state=?,request_id=?,submitted=COALESCE(submitted,?),day=COALESCE(day,?),month=COALESCE(month,?),recovery_period_at=?,updated=?,seq=seq+1 WHERE id=?',n.actual,n.bound,n.accounting,n.state,r.requestId,r.submittedAt,r.day,r.month,r.periodAt,now,r.jobId);
     const seq=s.get('SELECT seq FROM jobs WHERE id=?',r.jobId).seq;s.run('INSERT INTO job_events VALUES(?,?,?,?)',r.jobId,seq,n.state,now);
    }else s.run('UPDATE recovery_obligations SET actual=?,recovery_bound=?,accounting=?,state=?,request_id=?,updated=? WHERE id=?',n.actual,n.bound,n.accounting,n.state,r.requestId,now,r.jobId);
   }
   s.run('INSERT INTO recovery_changes VALUES(?,?,?,?,?,?)',loaded.bundle.bundleId,a.entryId,r.jobId,a.evidenceHash,canonical(a.before),canonical(n));
   fault('after-entry:'+ ++index);
  }
  fault('before-hold');
  if(v.check.releaseHold){
   s.run("DELETE FROM operational_state WHERE key='restore-ai-hold'");
   s.run('UPDATE recovery_restores SET completed_plan=? WHERE id=?',planHash,loaded.bundle.restoreId);
  }
  fault('after-hold');
  const receipt={version:'arch-ai-recovery-receipt/1',bundleId:loaded.bundle.bundleId,planHash,bundleHash:loaded.bundleHash,actionHash:v.plan.actionHash,
   restoreId:loaded.bundle.restoreId,appliedAt:now,entries:v.plan.actions.length,holdReleased:v.check.releaseHold,holdRemaining:recoveryLedger(s).held,
   missingScopes:v.check.issues.length,uncertain:v.check.uncertain,discrepancies:v.check.discrepancies.length,evidenceCheck:'hashes-and-correlated-facts',invoiceTruth:'operator-attested-not-machine-verified'};
  s.run('INSERT INTO recovery_applications VALUES(?,?,?,?)',loaded.bundle.bundleId,planHash,loaded.bundleHash,canonical(receipt));
  s.audit(null,null,'recovery.accounting-applied',now);
  return {status:'applied',replayed:false,receipt};
 });
}
/** Recovery liabilities enter the same user/currency/original-period admission dimensions. */
export function recoveryUsage(s,user,currency,day,month) {
 const r=s.get(`SELECT
  COALESCE(SUM(CASE WHEN currency=? AND day=? THEN COALESCE(actual,recovery_bound,cap) ELSE 0 END),0) moneyDay,
  COALESCE(SUM(CASE WHEN currency=? AND month=? THEN COALESCE(actual,recovery_bound,cap) ELSE 0 END),0) moneyMonth,
  COALESCE(SUM(CASE WHEN day=? THEN 1 ELSE 0 END),0) requests,
  COALESCE(SUM(CASE WHEN day=? THEN byte_cap ELSE 0 END),0) bytes,
  COALESCE(SUM(CASE WHEN state='unknown' AND accounting='pending' THEN 1 ELSE 0 END),0) unresolved
 FROM recovery_obligations WHERE user_id=?`,currency,day,currency,month,day,day,user);
 for(const v of Object.values(r))fail(Number.isSafeInteger(v)&&v>=0,503,'RECOVERY_TOTAL_LIMIT');
 return r;
}

/** Separate, user-scoped accounting records; never fabricated jobs or executable credentials. */
export function recoveryCosts(s,user,{provider=null,from=null,until=null,cursor=null,limit=50}={}) {
 integer(limit,100,1);const clauses=['user_id=?'],args=[user];
 if(provider){clauses.push('provider_id=?');args.push(provider);}
 if(from!==null){clauses.push('submitted>=?');args.push(from);}if(until!==null){clauses.push('submitted<?');args.push(until);}
 if(cursor){uuid(cursor);const head=s.get('SELECT submitted,id FROM recovery_obligations WHERE id=? AND user_id=?',cursor,user);fail(head,400,'CURSOR_INVALID');clauses.push('(submitted<? OR (submitted=? AND id<?))');args.push(head.submitted,head.submitted,head.id);}
 const rows=s.all('SELECT * FROM recovery_obligations WHERE '+clauses.join(' AND ')+' ORDER BY submitted DESC,id DESC LIMIT ?',...args,limit+1),more=rows.length>limit;if(more)rows.pop();
 return {obligations:rows.map(j=>({id:j.id,kind:'recovered-accounting-obligation',operationId:j.operation_id,credentialId:j.credential_id,credentialVersion:j.credential_version,
  providerId:j.provider_id,endpointId:j.endpoint_id,requestId:j.request_id,submittedAt:j.submitted,currency:j.currency,unit:'micro',day:j.day,month:j.month,quotedMicros:j.cap,
  actualMicros:j.actual,boundMicros:j.recovery_bound,chargedOrHeldMicros:j.actual??j.recovery_bound??j.cap,accounting:j.accounting,state:j.state,unresolved:j.actual===null,
  quoteDiscrepancyMicros:j.actual!==null?Math.max(0,j.actual-j.cap):0,provenance:{bundleId:j.bundle_id,verification:'operator-attested-not-machine-verified'}})),
  nextCursor:more?rows.at(-1).id:null};
}
