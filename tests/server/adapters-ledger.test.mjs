import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync,readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../../src/server/database.mjs';
import { createBackend } from '../../src/server/app.mjs';
import { adapterSetup,response,generated,deferred,hash,png,uid } from './adapter-helpers.mjs';

test('AI-01..04 HTTP/SQLite: real adapter registry → key → budget → prepare/consent → image + private ledger',async t=>{
  const f=await adapterSetup(t),a=await f.connect(f.a),b=await f.connect(f.b);
  const registry=(await f.a.ok('GET','/api/v1/ai/providers')).providers;
  assert.equal(registry.length,1);assert.equal(registry[0].id,'xai-imagine');assert.equal(registry[0].production,true);assert.equal(registry[0].allowed,true);
  await f.budget(f.a);await f.budget(f.b);
  const p=await f.prepare(f.a,a);
  assert.equal(p.job.state,'prepared');assert.equal(p.job.quote.maxCostMicros,40000);assert.equal(f.wire.posts.length,0);
  const denied=await f.a.request('POST','/api/v1/ai/jobs/'+p.job.id+'/submit',{quoteHash:p.job.quoteHash,consent:false});
  assert.equal(denied.status,400);assert.equal(f.wire.posts.length,0);
  await f.a.submit(p.job);const j=await f.a.poll(p.job,'succeeded');
  assert.equal(j.accounting.actualMicros,40000);assert.equal(j.accounting.basis,'actual');assert.equal(j.accounting.reservedMicros,0);
  assert.equal(j.requestId,'provider-request-test-1');assert.equal(j.providerUsage.costInUsdTicks,'400000000');
  assert.equal(j.projectRevision,p.input.projectRevision);assert.equal(j.resultDisposition,'tray');
  assert.equal(j.artifacts[0].sha256,hash(png));assert.equal(f.wire.posts[0].keyHash,hash(a.secret));
  const download=await f.a.request('GET','/api/v1/ai/artifacts/'+j.artifacts[0].id+'/download');
  assert.equal(download.status,200);assert.ok(download.raw.equals(png));assert.match(download.headers.get('cache-control'),/no-store/);
  for(const other of [f.b,f.owner]){
    assert.equal((await other.request('GET','/api/v1/ai/jobs/'+j.id)).status,404);
    assert.equal((await other.request('GET','/api/v1/ai/artifacts/'+j.artifacts[0].id+'/download')).status,404);
    assert.equal((await other.request('POST','/api/v1/ai/credentials/'+a.id+'/check',{version:a.version})).status,404);
  }
  const q=await f.prepare(f.b,b);await f.b.submit(q.job);await f.b.poll(q.job,'succeeded');
  assert.equal(f.wire.posts[1].keyHash,hash(b.secret));assert.notEqual(f.wire.posts[0].keyHash,f.wire.posts[1].keyHash);
  await f.restart();
  const durable=(await f.a.ok('GET','/api/v1/ai/jobs/'+j.id)).job;
  assert.deepEqual(durable.providerUsage,j.providerUsage);assert.equal(durable.requestId,j.requestId);
  for(const secret of f.secrets){
    assert.equal(JSON.stringify(f.responses.map(r=>r.json)).includes(secret),false);
    assert.equal(JSON.stringify(f.logs).includes(secret),false);
    for(const name of readdirSync(f.root).filter(n=>n.includes('.sqlite')))
      assert.equal(readFileSync(join(f.root,name)).includes(Buffer.from(secret)),false,'SQLite and WAL contain no plaintext key');
  }
});

test('AI-03 HTTP: double-click and budget race permit one real adapter POST, reject changed payload',async t=>{
  const f=await adapterSetup(t),c=await f.connect(f.a);await f.budget(f.a,40000);
  const one=await f.prepare(f.a,c),two=await f.prepare(f.a,c),gate=deferred();f.wire.generate=()=>gate.promise;
  const submitted=await Promise.all([f.a.request('POST','/api/v1/ai/jobs/'+one.job.id+'/submit',{quoteHash:one.job.quoteHash,consent:true}),
    f.a.request('POST','/api/v1/ai/jobs/'+two.job.id+'/submit',{quoteHash:two.job.quoteHash,consent:true}),
    f.a.request('POST','/api/v1/ai/jobs/'+one.job.id+'/submit',{quoteHash:one.job.quoteHash,consent:true})]);
  assert.deepEqual(submitted.map(r=>r.status).sort(),[202,202,429]);assert.equal(f.wire.posts.length,1);
  const conflict=await f.a.request('POST','/api/v1/ai/jobs',{...one.input,prompt:'different'},{'Idempotency-Key':one.idem});
  assert.equal(conflict.status,409);
  gate.resolve(response(generated()));await f.a.poll(one.job,'succeeded');
  await f.a.submit(one.job);assert.equal(f.wire.posts.length,1);
  const record=(await f.a.ok('GET','/api/v1/ai/jobs/'+one.job.id)).job;assert.equal(record.accounting.actualMicros,40000);
});

test('AI-03 HTTP: transport timeout after POST holds original reservation through restart and no replay',async t=>{
  const f=await adapterSetup(t),c=await f.connect(f.a);await f.budget(f.a,40000);
  f.wire.generate=()=>{const e=new Error('not exported');e.code='UPSTREAM_TIMEOUT';throw e;};
  const p=await f.prepare(f.a,c);await f.a.submit(p.job);
  let j=await f.a.poll(p.job,'unknown');
  assert.equal(j.errorCode,'PROVIDER_TIMEOUT_UNKNOWN');assert.equal(j.accounting.actualMicros,null);assert.equal(j.accounting.reservedMicros,40000);
  assert.equal(j.accounting.day,'2026-09-08');assert.equal(j.accounting.basis,'pending');
  await f.a.submit(p.job);assert.equal(f.wire.posts.length,1);
  await f.restart();
  j=(await f.a.ok('GET','/api/v1/ai/jobs/'+p.job.id)).job;assert.equal(j.state,'unknown');assert.equal(j.accounting.reservedMicros,40000);
  await f.a.submit(p.job);assert.equal(f.wire.posts.length,1);
  const next=await f.prepare(f.a,c);
  assert.equal((await f.a.request('POST','/api/v1/ai/jobs/'+next.job.id+'/submit',{quoteHash:next.job.quoteHash,consent:true})).status,409);
  assert.equal((await f.a.request('POST','/api/v1/ai/jobs/'+next.job.id+'/submit',{quoteHash:next.job.quoteHash,consent:true,acknowledgeAdditionalCharge:true})).status,429);
  assert.equal(f.wire.posts.length,1);
});

test('AI-03/ACC-04 HTTP: deadline then late image belongs to original user after logout/switch, never re-sent',async t=>{
  const f=await adapterSetup(t,{deliveryTimeoutMs:100}),c=await f.connect(f.a);await f.budget(f.a);
  const gate=deferred();f.wire.generate=()=>gate.promise;
  const p=await f.prepare(f.a,c);await f.a.submit(p.job);await f.a.poll(p.job,'unknown');
  await f.a.ok('POST','/api/v1/logout',{});
  await f.a.login('member-b');
  gate.resolve(response(generated(),200,{'x-request-id':'late-real-header-test'}));
  // Reopen the original identity using the other authenticated client.
  await f.b.ok('POST','/api/v1/logout',{});await f.b.login('member-a');
  const j=await f.b.poll(p.job,'succeeded');
  assert.equal(j.ownerId,f.b.user.id);assert.equal(j.projectRevision,'local-r1');assert.equal(j.resultDisposition,'tray');
  assert.equal((await f.a.request('GET','/api/v1/ai/jobs/'+j.id)).status,404);
  assert.equal((await f.a.request('GET','/api/v1/ai/artifacts/'+j.artifacts[0].id+'/download')).status,404);
  assert.equal(f.wire.posts.length,1);assert.equal(j.accounting.actualMicros,40000);
});

test('AI-02 HTTP: key replacement or disable during metadata GET prevents sending the old key',async t=>{
  const f=await adapterSetup(t),c=await f.connect(f.a);await f.budget(f.a);
  const gate=deferred();f.wire.beforeMetadata=gate;
  const p=await f.prepare(f.a,c);await f.a.submit(p.job);
  const replacement='synthetic-replacement-'+uid();f.secrets.push(replacement);
  const updated=await f.a.ok('PUT','/api/v1/ai/credentials/'+c.id,{version:c.version,key:replacement,label:'replacement'});
  gate.resolve();const j=await f.a.poll(p.job,'failed');assert.equal(f.wire.posts.length,0);assert.equal(j.accounting.actualMicros,0);
  f.wire.beforeMetadata=null;await f.a.ok('POST','/api/v1/ai/credentials/'+c.id+'/check',{version:updated.version});
  const next=await f.prepare(f.a,updated),second=deferred();f.wire.beforeMetadata=second;
  await f.a.submit(next.job);
  await f.a.ok('POST','/api/v1/ai/credentials/'+c.id+'/disable',{version:updated.version,confirm:'disable:'+c.id});
  second.resolve();await f.a.poll(next.job,'failed');assert.equal(f.wire.posts.length,0);
});

test('AI-03 HTTP: policy or budget lowered during metadata GET is enforced at actual send boundary',async t=>{
  const f=await adapterSetup(t),c=await f.connect(f.a);await f.budget(f.a);
  const gate=deferred();f.wire.beforeMetadata=gate;
  const p=await f.prepare(f.a,c);await f.a.submit(p.job);
  await f.budget(f.a,1);gate.resolve();const j=await f.a.poll(p.job,'failed');
  assert.equal(j.accounting.actualMicros,0);assert.equal(f.wire.posts.length,0);
  await f.budget(f.a);const second=deferred();f.wire.beforeMetadata=second;
  const q=await f.prepare(f.a,c);await f.a.submit(q.job);
  const {version,...policy}=await f.owner.ok('GET','/api/v1/policy');
  await f.owner.ok('PUT','/api/v1/owner/policy',{...policy,allowedProviders:[]},{'If-Match':'"r'+version+'"'});
  second.resolve();await f.a.poll(q.job,'failed');assert.equal(f.wire.posts.length,0);
});

test('AI-03 HTTP: content refusal with missing charge is estimated; server uncertainty holds reservation and request ID',async t=>{
  const f=await adapterSetup(t),c=await f.connect(f.a);await f.budget(f.a);
  f.wire.generate=()=>response({data:[{respect_moderation:false}]},200,{'x-request-id':'refusal-42'});
  const p=await f.prepare(f.a,c);await f.a.submit(p.job);
  const refused=await f.a.poll(p.job,'failed');assert.equal(refused.errorCode,'PROVIDER_CONTENT_REFUSAL');
  assert.equal(refused.accounting.actualMicros,null);assert.equal(refused.accounting.basis,'estimated');assert.equal(refused.accounting.estimatedMicros,40000);
  f.wire.generate=()=>response({error:{message:c.secret}},503,{'x-request-id':'uncertain-42'});
  const q=await f.prepare(f.a,c);await f.a.submit(q.job);
  const uncertain=await f.a.poll(q.job,'unknown');assert.equal(uncertain.accounting.reservedMicros,40000);assert.equal(uncertain.requestId,'uncertain-42');
  assert.equal(uncertain.errorCode,'PROVIDER_SERVER_ERROR');assert.equal(uncertain.accounting.actualMicros,null);
  await f.a.submit(q.job);assert.equal(f.wire.posts.length,2);assert.equal(JSON.stringify(f.logs).includes(c.secret),false);
});

test('EXT-03: schema 2 migration retains ledger and initializes optional usage; future schema rejected',async t=>{
  const f=await adapterSetup(t),c=await f.connect(f.a);await f.budget(f.a);
  const p=await f.prepare(f.a,c);await f.a.submit(p.job);const j=await f.a.poll(p.job,'succeeded');
  await f.app.close();
  const db=new DatabaseSync(f.config.databasePath);
  // Reconstruct an actual schema2 fixture, excluding the additive recovery schema.
  for(const trigger of db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'recovery_generation_%'").all())db.exec('DROP TRIGGER '+trigger.name);
  for(const table of ['recovery_changes','recovery_applications','recovery_plans','recovery_evidence','recovery_obligations','recovery_restores','recovery_clock'])db.exec('DROP TABLE '+table);
  db.exec('DROP TABLE artifact_images; DROP TABLE image_references; ALTER TABLE jobs DROP COLUMN recovery_bound; ALTER TABLE jobs DROP COLUMN recovery_period_at; ALTER TABLE jobs DROP COLUMN provider_usage; PRAGMA user_version=2;');db.close();
  const migrated=new Store(f.config.databasePath);
  assert.equal(migrated.get('PRAGMA user_version').user_version,5);
  assert.equal(migrated.get('SELECT state FROM jobs WHERE id=?',j.id).state,'succeeded');
  assert.equal(migrated.get('SELECT provider_usage FROM jobs WHERE id=?',j.id).provider_usage,null);migrated.close();
  f.app=createBackend(f.config);await f.app.listen(0);
  // Reopen for the shared helper cleanup; no provider calls on migration.
  const future=join(f.root,'future.sqlite'),next=new DatabaseSync(future);next.exec('PRAGMA user_version=99');next.close();
  assert.throws(()=>new Store(future),/DATABASE_VERSION_UNSUPPORTED/);
});
