import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {setImmediate as yieldTurn} from 'node:timers/promises';
import {setup,deferred,png,hash} from './helpers.mjs';
import {checkImage} from '../../src/server/image-workers.mjs';
import {OUTPUT_LIMITS} from '../../src/server/image-codec.mjs';

async function dispatched(f){
 const c=await f.a.connect();await f.a.budget();const prepared=await f.a.prepare(c);await f.a.submit(prepared.job);
 await f.a.poll(prepared.job,'running');return prepared;
}
function capture(f,timeoutMs){
 const entered=deferred(),release=deferred(),native=f.app.images.checkArtifact.bind(f.app.images);
 f.app.images.checkArtifact=async artifact=>{
  // Real codec starts immediately. Gate only its return to the settlement continuation.
  const decoding=timeoutMs?checkImage(artifact.bytes,artifact.mediaType,OUTPUT_LIMITS,{timeoutMs}):native(artifact);
  void decoding.catch(()=>{});entered.resolve();await release.promise;return decoding;
 };
 return {entered,release};
}
function disk(f,fn){const db=new DatabaseSync(f.config.databasePath,{readOnly:true});try{return fn(db);}finally{db.close();}}

test('B11 shutdown preserves already-received decoded settlement and original owner/session above quote',async t=>{
 const f=await setup(t,{runtime:{shutdownGraceMs:10000}}),p=await dispatched(f),gate=capture(f);
 const before=f.app.store.get('SELECT * FROM jobs WHERE id=?',p.job.id);
 f.provider.complete(p.job.id,f.provider.result({actual:125}));await gate.entered.promise;
 await f.a.ok('POST','/api/v1/logout',{});
 const close=f.app.close();assert.strictEqual(close,f.app.close());
 await yieldTurn();assert.equal(f.app.ai.settling.size,1);
 assert.equal(f.app.store.get('SELECT actual FROM jobs WHERE id=?',p.job.id).actual,null);
 gate.release.resolve();await close;
 disk(f,db=>{
  const j=db.prepare('SELECT * FROM jobs WHERE id=?').get(p.job.id);
  assert.equal(j.state,'succeeded');assert.equal(j.actual,125);assert.equal(j.accounting,'actual');assert.equal(j.cap,60);
  for(const field of ['user_id','session_id','project_id','project_revision','payload_hash','quote_hash','day','month','credential_id','credential_version'])
   assert.equal(j[field],before[field]);
  const a=db.prepare('SELECT * FROM artifacts WHERE job_id=?').get(j.id);
  assert.equal(a.user_id,before.user_id);assert.equal(a.hash,hash(png));assert.equal(hash(Buffer.from(a.bytes)),hash(png));
  assert.equal(db.prepare('SELECT state FROM job_events WHERE job_id=? ORDER BY seq DESC LIMIT 1').get(j.id).state,'succeeded');
 });
 assert.equal(f.provider.calls.length,1);assert.equal(f.app.ai.closed,true);
 assert.ok(!JSON.stringify(f.logs).includes(p.input.prompt));
});

test('B11 drain deadline reports failure, retains SQLite and liability until captured codec finishes',async t=>{
 const f=await setup(t,{runtime:{shutdownGraceMs:100}}),p=await dispatched(f),gate=capture(f);
 f.provider.complete(p.job.id);await gate.entered.promise;
 const close=f.app.close();await assert.rejects(close,{code:'SHUTDOWN_DRAIN_TIMEOUT'});
 const pending=f.app.store.get('SELECT accounting,actual,cap,submitted FROM jobs WHERE id=?',p.job.id);
 assert.equal(pending.accounting,'pending');assert.equal(pending.actual,null);assert.equal(pending.cap,60);assert.ok(pending.submitted!==null);
 assert.equal(f.app.ai.closed,false);assert.equal(f.provider.calls.length,1);
 gate.release.resolve();await f.app.whenClosed;
 disk(f,db=>assert.equal(db.prepare('SELECT actual FROM jobs WHERE id=?').get(p.job.id).actual,40));
 assert.ok(f.logs.some(x=>x.code==='SHUTDOWN_DRAIN_TIMEOUT'));
 // Helper cleanup must observe the original explicit deadline failure without hiding it.
 f.app.close=()=>f.app.whenClosed;
});

test('B11 captured codec timeout remains explicit unknown/pending, never sends again',async t=>{
 const f=await setup(t),p=await dispatched(f),gate=capture(f,1);
 f.provider.complete(p.job.id,f.provider.result({actual:null}));await gate.entered.promise;
 const close=f.app.close();gate.release.resolve();await close;
 disk(f,db=>{
  const j=db.prepare('SELECT * FROM jobs WHERE id=?').get(p.job.id);
  assert.equal(j.state,'unknown');assert.equal(j.accounting,'pending');assert.equal(j.actual,null);assert.equal(j.cap,60);
  assert.equal(j.error_code,'PROVIDER_RESPONSE_INVALID');assert.equal(db.prepare('SELECT count(*) n FROM artifacts WHERE job_id=?').get(j.id).n,0);
 });
 assert.equal(f.provider.calls.length,1);
});

test('B11 close waits for runOnce yield and prohibits later maintenance writes',async t=>{
 const f=await setup(t,{runtime:{maintenance:{enabled:false,maxBatchesPerTurn:4,batchRows:1}}});
 const entered=deferred(),release=deferred();f.app.operations.yieldFn=()=>{entered.resolve();return release.promise;};
 const first=f.app.operations.runOnce();assert.strictEqual(f.app.operations.runOnce(),first);await entered.promise;
 const g=f.app.store.get('SELECT generation FROM recovery_clock').generation;
 const close=f.app.close();release.resolve();await close;await first;
 assert.equal((await f.app.operations.runOnce()).state,'stopped');
 disk(f,db=>assert.equal(db.prepare('SELECT generation FROM recovery_clock').get().generation,g));
});

test('B11 stopping delivery without captured result preserves unknown; late result cannot touch closed DB',async t=>{
 const f=await setup(t),p=await dispatched(f);
 await f.app.close();f.provider.complete(p.job.id);await yieldTurn();
 disk(f,db=>{
  const j=db.prepare('SELECT state,accounting,actual FROM jobs WHERE id=?').get(p.job.id);
  assert.equal(j.state,'unknown');assert.equal(j.accounting,'pending');assert.equal(j.actual,null);
 });
 assert.equal(f.provider.calls.length,1);
});

test('B11 public health exposes only coarse operations state, no operator counters or identities',async t=>{
 const f=await setup(t);f.app.operations.report('degraded','MAINTENANCE_FAILED');
 const r=await f.b.request('GET','/api/v1/health');
 assert.equal(r.status,503);assert.deepEqual(r.json.operations,{state:'degraded',reason:'MAINTENANCE_FAILED'});
 assert.deepEqual(Object.keys(r.json.operations).sort(),['reason','state']);
 const text=JSON.stringify(r.json);
 for(const privateValue of [f.a.user.id,f.b.user.id,f.owner.user.id,f.a.sessionId])assert.ok(!text.includes(privateValue));
 assert.ok(!text.includes('lastSummary'));assert.ok(!text.includes('unknownPending'));
 assert.equal((await f.a.request('GET','/api/v1/me')).status,200);
});

test('B11 failed captured settlement rolls back its monetary fact, reports shutdown failure and keeps unresolved bound',async t=>{
 const f=await setup(t),p=await dispatched(f),gate=capture(f);
 f.app.store.db.exec("CREATE TRIGGER synthetic_settlement_failure BEFORE UPDATE OF actual ON jobs BEGIN SELECT RAISE(ABORT,'PRIVATE_SQL_FAILURE'); END");
 f.provider.complete(p.job.id,f.provider.result({actual:125}));await gate.entered.promise;
 const close=f.app.close();gate.release.resolve();await assert.rejects(close,{code:'SHUTDOWN_SETTLEMENT_FAILED'});
 disk(f,db=>{
  const j=db.prepare('SELECT state,accounting,actual,cap FROM jobs WHERE id=?').get(p.job.id);
  assert.equal(j.state,'unknown');assert.equal(j.accounting,'pending');assert.equal(j.actual,null);assert.equal(j.cap,60);
  assert.equal(db.prepare('SELECT count(*) n FROM artifacts').get().n,0);
 });
 assert.equal(f.provider.calls.length,1);assert.ok(!JSON.stringify(f.logs).includes('PRIVATE_SQL_FAILURE'));
 f.app.close=async()=>{try{await f.app.whenClosed;}catch{}};
});
