import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {Store} from '../../src/server/database.mjs';
import {createBackend} from '../../src/server/app.mjs';
import {backupDatabase,restoreDatabase} from '../../src/server/operations.mjs';
import {recoveryStatus,recoveryRecord,createRecoveryPlan,checkRecoveryPlan,applyRecoveryPlan} from '../../src/server/recovery.mjs';
import {setup,money,defaultPolicy,hash} from './helpers.mjs';
import {bundle} from './recovery-helpers.mjs';

for(const preparedSurvives of [false,true])test('B-05 HTTP: lost '+(preparedSurvives?'submission on retained prepared job':'complete operation')+' blocks new money/request/byte admission',async t=>{
 const f=await setup(t),a=await f.a.connect(),b=await f.b.connect();await f.a.budget([money(100)]);await f.b.budget([money(100)]);
 const backup=join(f.root,'before-lost-request.sqlite');let lost=preparedSurvives?await f.a.prepare(a):null;
 await backupDatabase(f.config.databasePath,backup,f.clock());lost??=await f.a.prepare(a);await f.a.submit(lost.job);f.provider.complete(lost.job.id,f.provider.result({actual:95}));
 await f.a.poll(lost.job,'succeeded');const record=recoveryRecord(f.app.store,f.app.store.get('SELECT * FROM jobs WHERE id=?',lost.job.id));
 assert.equal(f.provider.calls.length,1);
 const restored=join(f.root,'restored-accounting.sqlite');await f.app.close();restoreDatabase(backup,restored,f.clock());
 f.config.databasePath=restored;f.app=createBackend(f.config);await f.app.listen(0);await f.a.login('member-a');
 const held=await f.a.request('POST','/api/v1/ai/jobs',f.a.input(a),{'Idempotency-Key':crypto.randomUUID()});assert.equal(held.json.error.code,'RESTORE_RECONCILIATION_REQUIRED');
 assert.equal(f.provider.calls.length,1);await f.app.close();
 const s=new Store(restored);
 try {
  if(preparedSurvives)assert.equal(recoveryStatus(s,{details:true}).private.unsubmitted[0].jobId,record.jobId);
  const input=bundle({s,now:f.clock()},{[preparedSurvives?'unsubmitted':'missing']:[{record,decision:{kind:'actual',micros:95,state:'succeeded'}}]});
  const p=createRecoveryPlan(s,input,{now:f.clock()});checkRecoveryPlan(s,p.planHash,input,{now:f.clock()});
  const result=applyRecoveryPlan(s,p.planHash,input,{approveHash:p.planHash,now:f.clock()});assert.equal(result.receipt.holdReleased,true);
 }finally{s.close();}
 f.app=createBackend(f.config);await f.app.listen(0);
 await f.a.login('member-a');await f.b.login('member-b');await f.owner.login('owner-subject');
 const costs=await f.a.ok('GET','/api/v1/ai/recovery-costs');assert.equal(costs.obligations.length,preparedSurvives?0:1);
 const charge=preparedSurvives?(await f.a.ok('GET','/api/v1/ai/jobs/'+record.jobId)).job.accounting:costs.obligations[0];
 assert.equal(charge.actualMicros,95);assert.equal(charge.quoteDiscrepancyMicros,35);assert.equal(charge.day,record.day);
 assert.equal((await f.a.ok('GET','/api/v1/ai/costs')).recovery.count,preparedSurvives?0:1);
 for(const other of [f.b,f.owner]){
  assert.equal((await other.ok('GET','/api/v1/ai/recovery-costs')).obligations.length,0);
  assert.equal((await other.request('GET','/api/v1/ai/recovery-costs?after='+record.jobId)).status,400);
  assert.equal((await other.request('GET','/api/v1/ai/jobs/'+record.jobId)).status,404);
 }
 const retired=await f.a.request('POST','/api/v1/ai/jobs',lost.input,{'Idempotency-Key':lost.idem});if(preparedSurvives){assert.equal(retired.status,200);assert.equal(retired.json.reused,true);await f.a.submit(retired.json.job);}else assert.equal(retired.json.error.code,'OPERATION_RETIRED');
 const next=await f.a.prepare(a),send=()=>f.a.request('POST','/api/v1/ai/jobs/'+next.job.id+'/submit',{quoteHash:next.job.quoteHash,consent:true});
 const denied=await send();assert.equal(denied.status,429);assert.equal(denied.json.error.details.dimension,'money-day');assert.equal(denied.json.error.details.used,95);
 await f.a.budget([money(1000)]);const policy=defaultPolicy();policy.ai.requestsPerDay=1;
 await f.owner.ok('PUT','/api/v1/owner/policy',policy,{'If-Match':'"r1"'});assert.equal((await send()).json.error.details.dimension,'ai-requests');
 policy.ai.requestsPerDay=100;policy.ai.bytesPerDay=record.byteCap;
 await f.owner.ok('PUT','/api/v1/owner/policy',policy,{'If-Match':'"r2"'});assert.equal((await send()).json.error.details.dimension,'ai-bytes');
 assert.equal(f.provider.calls.length,1,'restoration, checks and denied submissions never retry the provider');
 await f.owner.ok('PUT','/api/v1/owner/policy',defaultPolicy(),{'If-Match':'"r3"'});
 const memberB=await f.b.prepare(b);await f.b.submit(memberB.job);assert.equal(f.provider.calls.length,2);assert.equal(f.provider.calls[1].secretHash,hash(b.secret));
 const ownerCosts=JSON.stringify(await f.owner.ok('GET','/api/v1/owner/infrastructure'));assert.ok(!ownerCosts.includes('actualMicros'));
});
