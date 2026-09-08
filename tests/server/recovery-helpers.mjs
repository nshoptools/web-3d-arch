import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {Store} from '../../src/server/database.mjs';
import {bootstrap} from '../../src/server/accounts.mjs';
import {id,canonical,sha,period} from '../../src/server/core.mjs';
import {recoveryStatus,recoveryRecord,recoveryScope} from '../../src/server/recovery.mjs';
import {defaultPolicy,money} from './helpers.mjs';
export const NOW=Date.UTC(2026,8,8,0);
export function fixture(t) {
 const root=mkdtempSync(join(process.env.PROJECT_REVIEW_RUN,'work','recovery-private-')),s=new Store(join(root,'backend.sqlite'));
 const owner=bootstrap(s,{issuer:'https://synthetic.invalid',subject:'recovery-owner',policy:defaultPolicy(),now:NOW});
 const users=[id(),id()],credentials=[id(),id()];
 for(let i=0;i<2;i++){
  s.run("INSERT INTO users(id,issuer,subject,role,status,created) VALUES(?,?,?,'member','active',?)",users[i],'https://synthetic.invalid','recovery-member-'+i,NOW-86400000);
  s.run("INSERT INTO credentials VALUES(?,?,?,?,?,'revoked',1,'fixture',NULL,NULL)",credentials[i],users[i],'test-provider','test-endpoint','synthetic-label');
  s.run('INSERT INTO budgets VALUES(?,?,?)',users[i],1,canonical([money(100),money(100,'EUR')]));
 }
 t.after(()=>s.close());return {root,s,owner,users,credentials,now:NOW};
}
export function identity(f,{user=0,currency='USD',at=f.now-1000,cap=60,...patch}={}) {
 return {version:'arch-ai-accounting-identity/1',jobId:id(),userId:f.users[user],operationId:id(),idempotencyKey:id(),payloadHash:sha('synthetic-private-prompt-'+id()),
  providerId:'test-provider',endpointId:'test-endpoint',credentialId:f.credentials[user],credentialVersion:1,
  adapterVersion:'fixture-v1',modelId:'fixture-model',modelVersion:'fixture-model-v1',projectId:id(),projectRevision:'local-r1',
  requestId:null,submittedAt:at,periodAt:at,...period(at),currency,capMicros:cap,byteCap:200,...patch};
}
export function insertJob(f,record=identity(f),{state='unknown',actual=null,accounting=actual===null?(state==='unknown'?'pending':'estimated'):'actual',closedReason=null}={}) {
 const r=record,s=f.s;
 s.run(`INSERT INTO jobs(id,user_id,operation_id,idem,payload_hash,payload,credential_id,credential_version,provider_id,endpoint_id,adapter_version,model_id,model_version,project_id,project_revision,session_id,auth_version,quote,quote_hash,created,updated,state,seq,submitted,day,month,currency,cap,byte_cap,actual,accounting,request_id,closed_reason)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
 r.jobId,r.userId,r.operationId,r.idempotencyKey,r.payloadHash,'SYNTHETIC_PRIVATE_PROMPT_DO_NOT_PRINT',r.credentialId,r.credentialVersion,r.providerId,r.endpointId,r.adapterVersion,r.modelId,r.modelVersion,r.projectId,r.projectRevision,id(),1,canonical({maxOutputBytes:128,expiresAt:NOW+10000}),sha('fixture-quote'),r.periodAt,r.submittedAt,state,2,r.submittedAt,r.day,r.month,r.currency,r.capMicros,r.byteCap,actual,accounting,r.requestId,closedReason);
 s.run('INSERT INTO job_events VALUES(?,?,?,?)',r.jobId,1,'reserved',r.periodAt);
 s.run('INSERT INTO job_events VALUES(?,?,?,?)',r.jobId,2,state,r.submittedAt);return recoveryRecord(s,s.get('SELECT * FROM jobs WHERE id=?',r.jobId));
}
const amount=row=>row.actual??row.bound??row.record.capMicros;
export function bundle(f,{changes=[],missing=[],unsubmitted=[],omit=[],now=f.now,from=0,bundleId=id(),coverageEdit=null,inventoryEdit=null}={}) {
 const status=recoveryStatus(f.s,{details:true}),rows=status.private.records,entries=[];
 for(const row of rows){
  const change=changes.find(c=>c.jobId===row.record.jobId);
  const decision=change?.decision??(row.actual!==null?{kind:'retain'}:{kind:'bounded',micros:amount(row),state:row.state});
  entries.push({entryId:id(),target:row.target,record:{...row.record,...change?.record},decision});
 }
 for(const m of unsubmitted)entries.push({entryId:id(),target:'job',record:m.record,decision:m.decision});
 for(const m of missing)entries.push({entryId:id(),target:'missing',record:m.record,decision:m.decision??{kind:'bounded',micros:m.record.capMicros,state:'unknown'}});
 const map=new Map(status.private.scopes.map(sc=>[canonical(sc),sc]));
 for(const e of entries){const sc=recoveryScope(e.record);map.set(canonical(sc),sc);}
 const inventory={from,through:now,scopes:[...map.values()].filter(sc=>!omit.includes(sc.userId)).sort((a,b)=>canonical(a).localeCompare(canonical(b)))};
 inventoryEdit?.(inventory);
 const coverage=inventory.scopes.map(scope=>{
  const days=new Map();
  for(const e of entries.filter(e=>canonical(recoveryScope(e.record))===canonical(scope))){
   const day=days.get(e.record.day)??{day:e.record.day,operationIds:[],totalMicros:0};
   day.operationIds.push(e.record.operationId);
   day.totalMicros+=e.decision.kind==='retain'?amount(rows.find(r=>r.record.jobId===e.record.jobId)):e.decision.micros;
   days.set(day.day,day);
  }
  return {scope,days:[...days.values()]};
 });
 coverageEdit?.(coverage);
 const b={version:'arch-ai-recovery-bundle/1',bundleId,restoreId:status.restoreId,
  operator:{id:'synthetic-operator',verifiedAt:now,assertion:'provider-records-app-correlation-cutover'},inventory,inventoryEvidenceHash:null,entries,coverage,evidence:[]};
 const evidence=new Map();
 const attach=Buffer.from('SYNTHETIC_INVOICE_SECRET_NEVER_STDOUT '+b.bundleId),attachHash=sha(attach);
 evidence.set(attachHash,attach);b.evidence.push({sha256:attachHash,byteLength:attach.length,mediaType:'text/plain'});
 const prove=(kind,fact)=>{
  const raw=Buffer.from(canonical({version:'arch-ai-recovery-evidence/1',kind,factHash:sha(canonical(fact)),operatorId:b.operator.id,verifiedAt:now,attachments:[attachHash]})),hash=sha(raw);
  if(!evidence.has(hash)){evidence.set(hash,raw);b.evidence.push({sha256:hash,byteLength:raw.length,mediaType:'application/json'});}
  return hash;
 };
 b.inventoryEvidenceHash=prove('inventory',{inventory,operator:b.operator});
 for(const e of entries)e.evidenceHash=prove('operation',{target:e.target,record:e.record,decision:e.decision});
 for(const c of coverage)c.evidenceHash=prove('coverage',{inventory,scope:c.scope,days:c.days});
 return {bundle:b,evidence};
}
export function writeBundle(data,input,name='bundle.json') {
 const inbox=join(data,'recovery','inbox');mkdirSync(join(inbox,'evidence'),{recursive:true});
 for(const [hash,bytes]of input.evidence)writeFileSync(join(inbox,'evidence',hash),bytes,{mode:0o600});
 const path=join(inbox,name);writeFileSync(path,canonical(input.bundle),{mode:0o600});return path;
}
