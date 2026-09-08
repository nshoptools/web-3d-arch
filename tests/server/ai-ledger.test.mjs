import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { credentialContext } from '../../src/server/vault.mjs';
import { setup,Client,uid,hash,defaultPolicy,money,deferred,png } from './helpers.mjs';
test('AI-02: vault AAD, key IDOR, rotation cancellation and no key in GET/log/SQLite',async t=>{
  const f=await setup(t),a=await f.a.connect(),b=await f.b.connect();await f.a.budget();await f.b.budget();
  assert.equal((await f.owner.request('POST','/api/v1/ai/credentials/'+a.id+'/check',{version:a.version})).status,404);
  assert.equal((await f.b.request('PUT','/api/v1/ai/credentials/'+a.id,{key:b.secret,label:'attempt',version:a.version})).status,404);
  assert.equal((await f.a.request('POST','/api/v1/ai/jobs',f.a.input(b),{'Idempotency-Key':uid()})).status,404);
  assert.equal((await f.a.request('POST','/api/v1/ai/jobs',f.a.input(a,{ownerId:f.b.user.id}),{'Idempotency-Key':uid()})).status,400);
  const row=f.app.credentials.owned(f.a.user.id,a.id),vault=f.app.credentials.vault;
  assert.throws(()=>vault.open({...credentialContext(row),userId:f.b.user.id},row.key_version,row.sealed),/VAULT_UNAVAILABLE/);
  const prepared=await f.a.prepare(a),newSecret=randomBytes(32).toString('base64url');f.secrets.push(newSecret);
  const replaced=await f.a.ok('PUT','/api/v1/ai/credentials/'+a.id,{key:newSecret,label:'Replacement',version:a.version});
  assert.equal(replaced.version,a.version+1);assert.equal((await f.a.ok('GET','/api/v1/ai/jobs/'+prepared.job.id)).job.state,'cancelled');
  await f.a.submit(prepared.job);assert.equal(f.provider.calls.length,0);
  await f.a.ok('GET','/api/v1/settings/export');await f.owner.ok('GET','/api/v1/owner/audit');await f.owner.ok('GET','/api/v1/owner/infrastructure');
  const text=JSON.stringify(f.responses.map(x=>x.json))+JSON.stringify(f.logs);
  for(const secret of f.secrets)assert.ok(!text.includes(secret),'no plaintext key in responses/logs');
  f.app.store.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');const bytes=readFileSync(f.config.databasePath);
  for(const secret of f.secrets)assert.ok(!bytes.includes(Buffer.from(secret)),'no plaintext key in SQLite');
});
test('AI-03: missing budget and consent fail closed; twelve concurrent double-clicks send once',async t=>{
  const f=await setup(t),c=await f.a.connect(),input=f.a.input(c),idem=uid();
  const prepared=await Promise.all(Array.from({length:12},()=>f.a.request('POST','/api/v1/ai/jobs',input,{'Idempotency-Key':idem})));
  assert.equal(new Set(prepared.map(r=>r.json.job.id)).size,1);assert.equal(prepared.filter(r=>r.status===201).length,1);
  const job=prepared[0].json.job;
  assert.equal((await f.a.request('POST','/api/v1/ai/jobs/'+job.id+'/submit',{quoteHash:job.quoteHash,consent:true})).json.error.code,'AI_BUDGET_REQUIRED');assert.equal(f.provider.calls.length,0);
  await f.a.budget();
  assert.equal((await f.a.request('POST','/api/v1/ai/jobs/'+job.id+'/submit',{quoteHash:job.quoteHash,consent:false})).status,400);
  await Promise.all(Array.from({length:12},()=>f.a.submit(job)));assert.equal(f.provider.calls.length,1);assert.ok(f.provider.calls[0].secretHash===hash(c.secret));
  assert.equal((await f.a.request('POST','/api/v1/ai/jobs',{...input,prompt:'changed'},{'Idempotency-Key':idem})).status,409);
  assert.equal((await f.a.request('POST','/api/v1/ai/jobs',input,{'Idempotency-Key':uid()})).status,409);
  const result=f.provider.complete(job.id),done=await f.a.poll(job,'succeeded');
  assert.equal(done.accounting.actualMicros,40);assert.equal(done.accounting.reservedMicros,0);assert.equal(done.artifacts[0].sha256,hash(png));assert.equal(done.projectRevision,'local-r1');assert.equal(done.resultDisposition,'tray');
  assert.equal((await f.app.ai.settle('test-provider',job.id,result)).state,'succeeded');
  const events=(await f.a.ok('GET','/api/v1/ai/jobs/'+job.id+'/events')).events;
  assert.deepEqual(events.map(x=>x.state),['prepared','reserved','submitted','running','succeeded']);
});
test('AI-03: distinct concurrent jobs cannot overspend daily money; currencies stay separate',async t=>{
  const p=defaultPolicy();p.ai.concurrency=5;
  const f=await setup(t,{policy:p}),c=await f.a.connect();await f.a.budget([money(100)]);
  const one=await f.a.prepare(c),two=await f.a.prepare(c);
  const rs=await Promise.all([one,two].map(x=>f.a.request('POST','/api/v1/ai/jobs/'+x.job.id+'/submit',{quoteHash:x.job.quoteHash,consent:true})));
  assert.equal(rs.filter(r=>r.status===202).length,1);const denied=rs.find(r=>r.status===429);
  assert.equal(denied.json.error.details.dimension,'money-day');assert.equal(denied.json.error.details.unit,'micro');assert.equal(f.provider.calls.length,1);
  f.provider.currency='EUR';const euro=await f.a.prepare(c);
  assert.equal((await f.a.request('POST','/api/v1/ai/jobs/'+euro.job.id+'/submit',{quoteHash:euro.job.quoteHash,consent:true})).json.error.code,'AI_BUDGET_REQUIRED');
  await f.a.budget([money(100),money(100,'EUR')]);await f.a.submit(euro.job);assert.equal(f.provider.calls.length,2);
});
test('AI-03: default one active job, request and byte dimensions return precise quota errors',async t=>{
  const f=await setup(t),c=await f.a.connect();await f.a.budget();
  const first=await f.a.prepare(c);await f.a.submit(first.job);const second=await f.a.prepare(c);
  const send=extra=>f.a.request('POST','/api/v1/ai/jobs/'+second.job.id+'/submit',{quoteHash:second.job.quoteHash,consent:true,...extra});
  assert.equal((await send()).json.error.details.dimension,'ai-concurrency');
  await f.a.ok('POST','/api/v1/ai/jobs/'+first.job.id+'/cancel',{});
  const p=defaultPolicy();p.ai.requestsPerDay=1;await f.owner.ok('PUT','/api/v1/owner/policy',p,{'If-Match':'"r1"'});
  assert.equal((await send({acknowledgeAdditionalCharge:true})).json.error.details.dimension,'ai-requests');
  p.ai.requestsPerDay=100;p.ai.bytesPerDay=1;await f.owner.ok('PUT','/api/v1/owner/policy',p,{'If-Match':'"r2"'});
  assert.equal((await send({acknowledgeAdditionalCharge:true})).json.error.details.dimension,'ai-bytes');
});
test('AI-03: unknown holds original UTC obligation, no retry, close does not release, late settlement',async t=>{
  const f=await setup(t),c=await f.a.connect();await f.a.budget([money(100)]);
  f.setTime(Date.UTC(2026,8,30,23,59,0));await f.a.login('member-a');
  f.provider.mode='throw';const first=await f.a.prepare(c);await f.a.submit(first.job);const unknown=await f.a.poll(first.job,'unknown');
  assert.equal(unknown.accounting.actualMicros,null);assert.equal(unknown.accounting.reservedMicros,60);
  await f.a.submit(first.job);assert.equal(f.provider.calls.length,1);
  await f.a.ok('POST','/api/v1/ai/jobs/'+first.job.id+'/close-unknown',{reason:'Await provider invoice'});
  const second=await f.a.prepare(c),send=extra=>f.a.request('POST','/api/v1/ai/jobs/'+second.job.id+'/submit',{quoteHash:second.job.quoteHash,consent:true,...extra});
  assert.equal((await send()).json.error.code,'UNRESOLVED_CHARGE_ACK_REQUIRED');
  assert.equal((await send({acknowledgeAdditionalCharge:true})).json.error.details.dimension,'money-day');
  f.advance(120000);f.provider.mode='pending';const third=await f.a.prepare(c);await f.a.submit(third.job,{acknowledgeAdditionalCharge:true});
  const costs=await f.a.ok('GET','/api/v1/ai/costs');assert.equal(costs.unresolved[0].day,'2026-09-30');assert.equal(costs.unresolved[0].month,'2026-09');
  await f.app.ai.settle('test-provider',first.job.id,f.provider.result({actual:55}));
  const settled=(await f.a.ok('GET','/api/v1/ai/jobs/'+first.job.id)).job;
  assert.equal(settled.accounting.month,'2026-09');assert.equal(settled.accounting.actualMicros,55);assert.equal((await f.a.ok('GET','/api/v1/ai/jobs/'+third.job.id)).job.accounting.month,'2026-10');
});
test('ACC-02/AI-04: owner/member cannot poll/cancel/input/download private job or its signed URL',async t=>{
  const f=await setup(t),c=await f.a.connect();await f.a.budget();f.provider.mode='success';
  const prepared=await f.a.prepare(c);await f.a.submit(prepared.job);const done=await f.a.poll(prepared.job,'succeeded'),art=done.artifacts[0];
  const ticket=await f.a.ok('POST','/api/v1/ai/artifacts/'+art.id+'/download-ticket',{});assert.equal(ticket.expiresAt-f.clock(),300000);
  for(const other of [f.b,f.owner]){
    for(const path of ['/api/v1/ai/jobs/'+done.id,'/api/v1/ai/jobs/'+done.id+'/input','/api/v1/ai/artifacts/'+art.id+'/download','/api/v1/ai/artifacts/'+art.id+'/thumbnail',ticket.url])
      assert.equal((await other.request('GET',path)).status,404);
    assert.equal((await other.request('POST','/api/v1/ai/jobs/'+done.id+'/cancel',{})).status,404);
    assert.equal((await other.ok('GET','/api/v1/ai/jobs')).jobs.length,0);
  }
  const download=await f.a.request('GET',ticket.url);assert.equal(download.status,200);assert.ok(download.raw.equals(png));
  f.advance(300001);assert.equal((await f.a.request('GET',ticket.url)).status,403);
  const admin=JSON.stringify(await f.owner.ok('GET','/api/v1/owner/infrastructure'))+JSON.stringify(await f.owner.ok('GET','/api/v1/owner/audit'));
  for(const v of [prepared.input.prompt,c.secret,'actualMicros','quote'])assert.ok(!admin.includes(v));
});
test('ACC-04/AI-03: logout cancels in-flight OIDC callback; late AI stays in original user/session tray',async t=>{
  const f=await setup(t),c=await f.a.connect();await f.a.budget();
  const p=await f.a.prepare(c);await f.a.submit(p.job);
  const start=await f.a.ok('POST','/api/v1/auth/start',{deviceId:f.a.deviceId,reauth:true}),callback=f.idp.issue('member-a',start.authorizationUrl),gate=deferred();f.idp.setBlock(gate);
  const pending=f.a.request('GET',callback);await new Promise(r=>setTimeout(r,20));
  const old=f.a.sessionId;await f.a.ok('POST','/api/v1/logout',{});gate.resolve();
  assert.notEqual((await pending).status,303);f.idp.setBlock(null);assert.equal((await f.a.request('GET','/api/v1/me')).status,401);
  f.provider.complete(p.job.id);for(let n=0;n<500&&f.app.store.get('SELECT actual FROM jobs WHERE id=?',p.job.id).actual===null;n++)await new Promise(r=>setTimeout(r,5));
  assert.equal((await f.b.request('GET','/api/v1/ai/jobs/'+p.job.id)).status,404);
  await f.a.login('member-a');const done=await f.a.poll(p.job,'succeeded');assert.equal(done.originSessionId,old);assert.notEqual(done.originSessionId,f.a.sessionId);
});
test('ACC-04: delete removes active secret/cloud, late result keeps only accounting, explicit purge task',async t=>{
  const f=await setup(t),c=await f.a.connect();await f.a.budget();
  await f.a.ok('PUT','/api/v1/settings',{schemaVersion:1,values:{savedPrompts:['private text']}},{'If-Match':'"r0"'});
  const p=await f.a.prepare(c);await f.a.submit(p.job);
  assert.equal((await f.owner.ok('GET','/api/v1/owner/users/'+f.a.user.id+'/deletion-impact')).credentials,1);
  await f.owner.ok('POST','/api/v1/owner/users/'+f.a.user.id,{action:'delete',confirm:'delete:'+f.a.user.id});assert.equal((await f.a.request('GET','/api/v1/me')).status,401);
  f.provider.complete(p.job.id);for(let n=0;n<500&&f.app.store.get('SELECT actual FROM jobs WHERE id=?',p.job.id).actual===null;n++)await new Promise(r=>setTimeout(r,5));
  const s=f.app.store,cred=s.get('SELECT sealed,status FROM credentials WHERE id=?',c.id);assert.equal(cred.sealed,null);assert.equal(cred.status,'revoked');
  assert.equal(s.get('SELECT count(*) n FROM artifacts WHERE user_id=?',f.a.user.id).n,0);assert.equal(s.get('SELECT count(*) n FROM settings WHERE user_id=?',f.a.user.id).n,0);
  const job=s.get('SELECT payload,actual FROM jobs WHERE id=?',p.job.id);assert.equal(job.payload,null);assert.equal(job.actual,40);
  const tasks=await f.owner.ok('GET','/api/v1/owner/deletion-tasks');assert.equal(tasks.tasks[0].backup_purge_deadline-tasks.tasks[0].requested,30*86400000);
  assert.ok((await f.owner.ok('GET','/api/v1/owner/audit')).events.some(e=>e.action==='user.delete'));
});
test('AI-03: restart never resends; terminal retention and tombstones block replay beyond 90 days',async t=>{
  const f=await setup(t),c=await f.a.connect();await f.a.budget();
  const p=await f.a.prepare(c);await f.a.submit(p.job);await f.restart();
  assert.equal((await f.a.ok('GET','/api/v1/ai/jobs/'+p.job.id)).job.state,'unknown');assert.equal(f.provider.calls.length,1);
  await f.app.ai.settle('test-provider',p.job.id,f.provider.result({actual:10}));
  f.advance(89*86400000);await f.app.ai.prune();assert.ok(f.app.store.get('SELECT id FROM jobs WHERE id=?',p.job.id));
  f.advance(2*86400000);await f.app.ai.prune();assert.equal(f.app.store.get('SELECT id FROM jobs WHERE id=?',p.job.id),undefined);
  await f.a.login('member-a');assert.equal((await f.a.request('POST','/api/v1/ai/jobs',p.input,{'Idempotency-Key':p.idem})).json.error.code,'OPERATION_RETIRED');
});

