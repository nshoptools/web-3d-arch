import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {readFileSync,writeFileSync,existsSync,copyFileSync} from 'node:fs';
import {id,sha,canonical} from '../../src/server/core.mjs';
import {Store} from '../../src/server/database.mjs';
import {DatabaseSync} from 'node:sqlite';
import {AI} from '../../src/server/ai.mjs';
import {backupDatabase,restoreDatabase} from '../../src/server/operations.mjs';
import {createRecoveryPlan,checkRecoveryPlan,applyRecoveryPlan,recoveryLedger,recoveryUsage,recoveryStatus,recoveryCosts} from '../../src/server/recovery.mjs';
import {fixture,identity,insertJob,bundle,NOW} from './recovery-helpers.mjs';
const plan=(f,b)=>{const p=createRecoveryPlan(f.s,b,{now:f.now});checkRecoveryPlan(f.s,p.planHash,b,{now:f.now});return p;};
const apply=(f,b,p)=>applyRecoveryPlan(f.s,p.planHash,b,{approveHash:p.planHash,now:f.now});
function hold(f){const restoreId=id();f.s.tx(()=>{f.s.run('INSERT INTO recovery_restores VALUES(?,?,?,?,?,NULL,?)',restoreId,sha('synthetic-backup'),id(),f.now-10000,f.now,f.now-10000);f.s.run("INSERT INTO operational_state VALUES('recovery-restore-id',?)",restoreId);f.s.run("INSERT INTO operational_state VALUES('restore-ai-hold','reconciliation-required')");});return restoreId;}

test('B-05: two users/currencies/original UTC periods; actual above quote is retained with discrepancy',t=>{
 const f=fixture(t);
 const old=insertJob(f,identity(f,{at:Date.UTC(2026,7,31,23,59),cap:60}));
 const estimated=insertJob(f,identity(f,{currency:'EUR'}),{state:'succeeded'});
 insertJob(f,identity(f,{user:1}),{actual:25,state:'succeeded'});
 const b=bundle(f,{changes:[{jobId:old.jobId,decision:{kind:'actual',micros:95,state:'succeeded'}},{jobId:estimated.jobId,decision:{kind:'actual',micros:0,state:'succeeded'}}]});
 const p=plan(f,b),r=apply(f,b,p);assert.equal(r.receipt.discrepancies,1);
 const j=f.s.get('SELECT * FROM jobs WHERE id=?',old.jobId);
 assert.equal(j.actual,95);assert.equal(j.cap,60);assert.equal(j.day,'2026-08-31');assert.equal(j.month,'2026-08');
 assert.equal(f.s.get('SELECT actual FROM jobs WHERE id=?',estimated.jobId).actual,0);
 assert.equal(f.s.get("SELECT actual FROM jobs WHERE user_id=? AND currency='USD'",f.users[1]).actual,25);
 assert.equal(f.s.get('SELECT count(*) n FROM recovery_changes').n,3);
});

test('B-05: conservative bounds retain pending unknown despite closed label; terminal actual is required to reduce',t=>{
 const f=fixture(t),r=insertJob(f,identity(f),{closedReason:'User closed label only'});
 const b=bundle(f,{changes:[{jobId:r.jobId,decision:{kind:'bounded',micros:90,state:'unknown'}}]});apply(f,b,plan(f,b));
 assert.deepEqual({...f.s.get('SELECT actual,recovery_bound,accounting,closed_reason FROM jobs WHERE id=?',r.jobId)},{actual:null,recovery_bound:90,accounting:'pending',closed_reason:'User closed label only'});
 const lower=bundle(f,{changes:[{jobId:r.jobId,decision:{kind:'bounded',micros:89,state:'unknown'}}]});assert.throws(()=>plan(f,lower),/RECOVERY_BOUND_REDUCTION_REQUIRES_ACTUAL/);
 const actual=bundle(f,{changes:[{jobId:r.jobId,decision:{kind:'actual',micros:22,state:'failed'}}]});apply(f,actual,plan(f,actual));
 assert.equal(f.s.get('SELECT actual FROM jobs WHERE id=?',r.jobId).actual,22);
 const rewrite=bundle(f,{changes:[{jobId:r.jobId,decision:{kind:'actual',micros:1,state:'failed'}}]});assert.throws(()=>plan(f,rewrite),/RECOVERY_ACTUAL_FINAL/);
});

test('B-05: missing credential versions are inert accounting, real charge and tombstone; no owner/key substitution',t=>{
 const f=fixture(t),r=identity(f,{credentialId:id(),credentialVersion:7,cap:60,requestId:'lost-provider-request'});
 hold(f);const b=bundle(f,{missing:[{record:r,decision:{kind:'actual',micros:110,state:'succeeded'}}]});
 const before=f.s.all('SELECT * FROM credentials'),p=plan(f,b),res=apply(f,b,p);
 assert.equal(res.receipt.holdReleased,true);assert.equal(res.receipt.discrepancies,1);
 assert.deepEqual(f.s.all('SELECT * FROM credentials'),before);assert.equal(f.s.get('SELECT id FROM jobs WHERE id=?',r.jobId),undefined);
 assert.equal(f.s.get('SELECT job_id FROM tombstones WHERE user_id=? AND operation_id=?',r.userId,r.operationId).job_id,r.jobId);
 assert.equal(recoveryUsage(f.s,r.userId,'USD',r.day,r.month).moneyDay,110);
 assert.equal(recoveryUsage(f.s,f.owner,'USD',r.day,r.month).moneyDay,0);
 assert.equal(recoveryCosts(f.s,r.userId).obligations[0].quoteDiscrepancyMicros,50);
 assert.equal(recoveryCosts(f.s,f.users[1]).obligations.length,0);
});

test('B-05: exact canonical action/plan replay is stable; changed package and stored plan reject',t=>{
 const f=fixture(t),b=bundle(f,{missing:[{record:identity(f)}]}),p=plan(f,b);
 const before=f.s.get('SELECT json FROM recovery_plans WHERE hash=?',p.planHash).json;
 const actionHash=sha(canonical(JSON.parse(before).actions));assert.equal(actionHash,JSON.parse(before).actionHash);
 assert.equal(createRecoveryPlan(f.s,b,{now:f.now+1}).planHash,p.planHash);
 const r=apply(f,b,p),ledger=recoveryLedger(f.s),twice=apply(f,b,p);
 assert.equal(twice.replayed,true);assert.deepEqual(twice.receipt,r.receipt);assert.equal(recoveryLedger(f.s).hash,ledger.hash);
 assert.equal(f.s.get('SELECT json FROM recovery_plans WHERE hash=?',p.planHash).json,before);
 assert.equal(f.s.get('SELECT count(*) n FROM recovery_obligations').n,1);
 const changed={bundle:structuredClone(b.bundle),evidence:new Map(b.evidence)};changed.bundle.bundleId=id();assert.throws(()=>apply(f,changed,p),/RECOVERY_EVIDENCE_FACT|RECOVERY_BUNDLE_CHANGED/);
 f.s.run('UPDATE recovery_plans SET json=? WHERE hash=?',before+' ',p.planHash);assert.throws(()=>apply(f,b,p),/RECOVERY_PLAN_CHANGED/);
});

test('B-05: partial evidence scope applies obligations but keeps hold; subsequent complete package does not double count',t=>{
 const f=fixture(t);hold(f);const missing=identity(f),partial=bundle(f,{missing:[{record:missing}],omit:[f.users[1]]});
 const p=plan(f,partial);assert.ok(p.issues>0);const receipt=apply(f,partial,p);assert.equal(receipt.receipt.holdRemaining,true);
 const complete=bundle(f),next=plan(f,complete);assert.equal(next.issues,0);apply(f,complete,next);
 assert.equal(recoveryLedger(f.s).held,false);assert.equal(f.s.get('SELECT count(*) n FROM recovery_obligations').n,1);
});

test('B-05: same UTC scope must match operation set and total; unresolved retain cannot prove a bound',t=>{
 const f=fixture(t);hold(f);const r=insertJob(f);
 const wrong=bundle(f,{coverageEdit:cs=>cs.find(c=>c.days.length).days[0].totalMicros++});
 const p=plan(f,wrong);assert.ok(p.issues>0);apply(f,wrong,p);assert.equal(recoveryLedger(f.s).held,true);
 const retained=bundle(f,{changes:[{jobId:r.jobId,decision:{kind:'retain'}}]});
 assert.ok(checkRecoveryPlan(f.s,plan(f,retained).planHash,retained,{now:f.now}).issues.some(i=>i.code==='RECOVERY_UNCERTAINTY_UNBOUNDED'));
});

test('B-05: stale plan after any tracked DB change leaves ledger and hold untouched',t=>{
 const f=fixture(t);hold(f);const b=bundle(f,{missing:[{record:identity(f)}]}),p=plan(f,b);
 f.s.run('UPDATE users SET auth_version=auth_version+1 WHERE id=?',f.users[0]);const before=recoveryLedger(f.s);
 assert.throws(()=>apply(f,b,p),/RECOVERY_PLAN_STALE/);assert.deepEqual(recoveryLedger(f.s),before);
 assert.equal(f.s.get('SELECT count(*) n FROM recovery_obligations').n,0);
});

test('B-05: missing/wrong hash/fact evidence and altered identity fail without writes',t=>{
 const f=fixture(t),r=insertJob(f),b=bundle(f),before=recoveryLedger(f.s);
 const missing={bundle:b.bundle,evidence:new Map(b.evidence)};missing.evidence.delete(b.bundle.inventoryEvidenceHash);assert.throws(()=>plan(f,missing),/RECOVERY_EVIDENCE_MISSING/);
 const wrong={bundle:b.bundle,evidence:new Map(b.evidence)};wrong.evidence.set(b.bundle.inventoryEvidenceHash,Buffer.from('different'));assert.throws(()=>plan(f,wrong),/RECOVERY_EVIDENCE_HASH/);
 const identityChange=bundle(f,{changes:[{jobId:r.jobId,record:{userId:f.users[1]}}]});assert.throws(()=>plan(f,identityChange),/RECOVERY_CREDENTIAL_IDENTITY|RECOVERY_IDENTITY_CHANGED/);
 const changed=bundle(f);changed.bundle.entries[0].decision.micros=123;assert.throws(()=>plan(f,changed),/RECOVERY_EVIDENCE_FACT/);
 assert.equal(recoveryLedger(f.s).hash,before.hash);assert.equal(f.s.get('SELECT count(*) n FROM recovery_plans').n,0);
});

test('B-05: apply faults after evidence/entry/hold roll back all writes and preserve approved action hash',t=>{
 const f=fixture(t);hold(f);const b=bundle(f,{missing:[{record:identity(f)}]}),p=plan(f,b),before=recoveryLedger(f.s);
 for(const at of ['after-evidence','after-entry:1','before-hold','after-hold']){
  assert.throws(()=>applyRecoveryPlan(f.s,p.planHash,b,{approveHash:p.planHash,now:f.now,fault:step=>{if(step===at)throw Error('synthetic transaction interruption');}}),/synthetic transaction interruption/);
  assert.deepEqual(recoveryLedger(f.s),before);assert.equal(f.s.get('SELECT count(*) n FROM recovery_evidence').n,0);
  assert.equal(f.s.get('SELECT count(*) n FROM recovery_obligations').n,0);assert.equal(f.s.get('SELECT count(*) n FROM recovery_applications').n,0);
 }
 assert.equal(apply(f,b,p).receipt.holdReleased,true);
});

test('B-05: duplicate operation/request, missing user, invalid period/amount and absent check/approval are explicit failures',t=>{
 const f=fixture(t),r=identity(f),b=bundle(f,{missing:[{record:r}]});
 const p=createRecoveryPlan(f.s,b,{now:f.now});assert.throws(()=>apply(f,b,p),/RECOVERY_CHECK_REQUIRED/);
 assert.throws(()=>applyRecoveryPlan(f.s,p.planHash,b,{approveHash:'0'.repeat(64),now:f.now}),/RECOVERY_APPROVAL_REQUIRED/);
 for(const patch of [{periodAt:NOW+1},{capMicros:Infinity},{userId:id()}]){
  assert.throws(()=>plan(f,bundle(f,{missing:[{record:{...r,jobId:id(),...patch}}]})));
 }
 const duplicate=bundle(f,{missing:[{record:r},{record:{...r,jobId:id()}}]});assert.throws(()=>plan(f,duplicate),/RECOVERY_IDENTITY_EXISTS|RECOVERY_DUPLICATE/);
 const a=identity(f,{requestId:'one-provider-request'}),z=identity(f,{requestId:'one-provider-request'});
 assert.throws(()=>plan(f,bundle(f,{missing:[{record:a},{record:z}]})),/RECOVERY_REQUEST_DUPLICATE/);
});



test('B-05: a job prepared before backup can acquire its evidenced lost submission without any send',t=>{
 const f=fixture(t),r=insertJob(f);
 f.s.run("UPDATE jobs SET state='prepared',accounting='none',submitted=NULL,day=NULL,month=NULL,seq=0 WHERE id=?",r.jobId);
 f.s.run('DELETE FROM job_events WHERE job_id=?',r.jobId);
 const input=bundle(f,{unsubmitted:[{record:r,decision:{kind:'actual',micros:105,state:'succeeded'}}]});
 const p=plan(f,input),receipt=apply(f,input,p);assert.equal(receipt.receipt.discrepancies,1);
 const j=f.s.get('SELECT * FROM jobs WHERE id=?',r.jobId);
 assert.equal(j.actual,105);assert.equal(j.submitted,r.submittedAt);assert.equal(j.day,r.day);
 assert.equal(f.s.get('SELECT count(*) n FROM recovery_obligations').n,0);
 assert.equal(f.s.get('SELECT count(*) n FROM artifacts').n,0);
 const again=bundle(f);assert.equal(plan(f,again).issues,0);
});

test('B-05: backing up a held restore retains the earlier coverage floor through another restore',async t=>{
 const f=fixture(t);hold(f);const floor=recoveryLedger(f.s).restore.coverage_from;
 const archive=join(f.root,'held-backup.sqlite');await backupDatabase(join(f.root,'backend.sqlite'),archive,f.now+1000);
 const destination=join(f.root,'held-restored-again.sqlite');restoreDatabase(archive,destination,f.now+2000);
 const s=new Store(destination);t.after(()=>s.close());
 const local={s,now:f.now+3000},state=recoveryLedger(s);
 assert.equal(state.restore.backup_at,f.now+1000);assert.equal(state.restore.coverage_from,floor);
 const incomplete=bundle(local,{from:f.now+1000}),p=plan(local,incomplete);assert.ok(p.issues>0);
 assert.equal(apply(local,incomplete,p).receipt.holdRemaining,true);
});

test('B-05: an unpriced legacy retirement prevents an empty full-history assertion from releasing the hold',t=>{
 const f=fixture(t);hold(f);
 f.s.run('UPDATE recovery_restores SET coverage_from=0');
 f.s.run('INSERT INTO tombstones VALUES(?,?,?,?,?)',f.users[0],id(),id(),sha('unpriced-legacy'),id());
 const b=bundle(f),p=plan(f,b),report=checkRecoveryPlan(f.s,p.planHash,b,{now:f.now});
 assert.ok(report.issues.some(i=>i.code==='RECOVERY_RETIRED_LEDGER_UNAVAILABLE'));
 assert.equal(apply(f,b,p).receipt.holdRemaining,true);
});

test('B-05: resource ceilings and key-material fields are refused before persistence',t=>{
 const f=fixture(t),b=bundle(f);
 const keys={bundle:{...b.bundle,credentials:[{key:'PRIVATE_KEY_MUST_NOT_BE_RESTORED'}]},evidence:b.evidence};
 assert.throws(()=>plan(f,keys),/RECOVERY_FIELDS/);
 const tooMany={bundle:{...b.bundle,evidence:Array.from({length:513},()=>b.bundle.evidence[0])},evidence:b.evidence};
 assert.throws(()=>plan(f,tooMany),/RECOVERY_RESOURCE_LIMIT/);
 const tooLong={bundle:{...b.bundle,operator:{...b.bundle.operator,id:'X'.repeat(2_000_001)}},evidence:b.evidence};
 assert.throws(()=>plan(f,tooLong),/RECOVERY_BUNDLE_LIMIT/);
 assert.equal(f.s.get('SELECT count(*) n FROM recovery_plans').n,0);
 assert.equal(f.s.get('SELECT count(*) n FROM recovery_evidence').n,0);
});

test('B-05: a real SQLite constraint failure after hold removal rolls the whole apply back',t=>{
 const f=fixture(t);hold(f);
 f.s.db.exec("CREATE TRIGGER recovery_fixture_failure BEFORE INSERT ON recovery_applications BEGIN SELECT RAISE(ABORT,'synthetic commit-stage constraint'); END");
 const b=bundle(f,{missing:[{record:identity(f)}]}),p=plan(f,b),before=recoveryLedger(f.s);
 assert.throws(()=>apply(f,b,p),/synthetic commit-stage constraint/);
 assert.deepEqual(recoveryLedger(f.s),before);assert.equal(f.s.get('SELECT count(*) n FROM recovery_obligations').n,0);assert.equal(f.s.get('SELECT count(*) n FROM recovery_evidence').n,0);
});

test('B-05: terminal estimated recovery bound is not pruned before verified actual settlement',async t=>{
 const f=fixture(t),r=insertJob(f,identity(f),{state:'succeeded'});
 const b=bundle(f,{changes:[{jobId:r.jobId,decision:{kind:'bounded',micros:75,state:'succeeded'}}]});apply(f,b,plan(f,b));
 const ai=new AI(f.s,null,null,{cleanup(){}},null,()=>f.now+91*86400000);
 await ai.prune();assert.equal(f.s.get('SELECT recovery_bound FROM jobs WHERE id=?',r.jobId).recovery_bound,75);
});

test('B-05: restore upgrades actual schema1/2/3 snapshots and keeps source bytes unchanged',t=>{
 const f=fixture(t),sql=readFileSync(new URL('./fixtures/recovery-schema3.sql',import.meta.url),'utf8'),base=sql.slice(0,sql.lastIndexOf('CREATE TABLE operational_state'));
 for(const version of [1,2,3]){
  const source=join(f.root,'version-'+version+'.sqlite'),db=new DatabaseSync(source);
  db.exec(base+(version>=2?'CREATE TABLE operational_state(key TEXT PRIMARY KEY,value TEXT NOT NULL);':'')+(version>=3?'ALTER TABLE jobs ADD COLUMN provider_usage TEXT;':'')+'PRAGMA user_version='+version+';');db.close();
  const before=readFileSync(source),destination=join(f.root,'upgraded-'+version+'.sqlite'),r=restoreDatabase(source,destination,NOW),s=new Store(destination);
  try{assert.equal(r.sourceSchemaVersion,version);assert.equal(s.get('PRAGMA user_version').user_version,5);assert.equal(recoveryLedger(s).held,true);assert.equal(recoveryLedger(s).restore.coverage_from,0);}finally{s.close();}
  assert.ok(before.equals(readFileSync(source)));
 }
});

test('B-05: schema3 migration retains legacy restore hold and requires full-history coverage; future schemas are refused',t=>{
 const f=fixture(t),path=join(f.root,'legacy-v3.sqlite'),old=new DatabaseSync(path);
 old.exec(readFileSync(new URL('./fixtures/recovery-schema3.sql',import.meta.url),'utf8'));
 old.exec("INSERT INTO operational_state VALUES('restore-ai-hold','reconciliation-required')");old.close();
 const s=new Store(path);t.after(()=>s.close());assert.equal(s.get('PRAGMA user_version').user_version,5);
 const state=recoveryLedger(s);assert.equal(state.held,true);assert.equal(state.restore.backup_at,null);assert.equal(state.restore.source_hash,null);
 const legacy={s,now:NOW},incomplete=bundle(legacy,{from:NOW-1000}),p=plan(legacy,incomplete);
 assert.ok(checkRecoveryPlan(s,p.planHash,incomplete,{now:NOW}).issues.some(i=>i.code==='RECOVERY_INTERVAL_START'));
 assert.equal(apply(legacy,incomplete,p).receipt.holdRemaining,true);
 const full=bundle(legacy,{from:0});assert.equal(apply(legacy,full,plan(legacy,full)).receipt.holdReleased,true);
 const futurePath=join(f.root,'future.sqlite'),future=new DatabaseSync(futurePath);future.exec('PRAGMA user_version=6');future.close();
 assert.throws(()=>new Store(futurePath),/DATABASE_VERSION_UNSUPPORTED/);
});

test('B-05: schema4 backup/restore has source hash and new identity; previous plan cannot authorize a later restore',async t=>{
 const f=fixture(t),r=insertJob(f),b=bundle(f),p=plan(f,b);
 const backup=join(f.root,'sealed.sqlite'),meta=await backupDatabase(join(f.root,'backend.sqlite'),backup,f.now);
 assert.equal(meta.schemaVersion,5);assert.equal(meta.sha256,sha(readFileSync(backup)));
 const destination=join(f.root,'restored.sqlite'),restored=restoreDatabase(backup,destination,f.now+1),s=new Store(destination);t.after(()=>s.close());
 assert.equal(recoveryLedger(s).restore.source_hash,meta.sha256);assert.equal(recoveryLedger(s).restore.backup_at,f.now);
 assert.notEqual(restored.restoreId,b.bundle.restoreId);assert.equal(recoveryLedger(s).held,true);
 assert.throws(()=>applyRecoveryPlan(s,p.planHash,b,{approveHash:p.planHash,now:f.now+1}),/RECOVERY_RESTORE_MISMATCH/);
 assert.equal(s.get('SELECT day FROM jobs WHERE id=?',r.jobId).day,r.day);
});
