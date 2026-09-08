import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {performance} from 'node:perf_hooks';
import {Store} from '../../src/server/database.mjs';
import {id,sha,canonical,DAY} from '../../src/server/core.mjs';
import {backupDatabase,restoreDatabase} from '../../src/server/operations.mjs';
import {maintenanceBatch,newMaintenancePass,readMaintenance,runMaintenance} from '../../src/server/maintenance.mjs';
import {RuntimeOperations} from '../../src/server/runtime-operations.mjs';
import {validateRuntime} from '../../src/server/runtime-config.mjs';
import {fixture,identity,insertJob,bundle} from './recovery-helpers.mjs';
import {createRecoveryPlan,checkRecoveryPlan,applyRecoveryPlan} from '../../src/server/recovery.mjs';
import {png,deferred} from './helpers.mjs';

function reference(f,{at=f.now-1,bytes=png,user=0}={}){
 const rid=id();
 f.s.run('INSERT INTO image_references VALUES(?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?,?,?,NULL)',
  rid,f.users[user],id(),id(),'original-local-r1','image/png',sha(bytes),bytes.length,1,1,f.now-1000,at,at,bytes,png,sha(png),'arch-image-codec/1');
 return rid;
}
const rowsHash=(s,table)=>sha(canonical(s.all('SELECT * FROM '+table+' ORDER BY rowid').map(x=>({...x}))));
const generation=s=>s.get('SELECT generation FROM recovery_clock').generation;
const fullRuntime={maintenance:{enabled:true,maxBatchesPerTurn:16,batchRows:2}};
async function finish(ops){for(let i=0;i<200;i++){const x=await ops.runOnce();if(x.code||!x.pass)return x;}assert.fail('bounded pass did not finish');}

test('B11 config is strict, finite and bounded; no secrets or arbitrary scheduler actions',()=>{
 const c=validateRuntime();assert.equal(c.maintenance.enabled,true);assert.equal(c.maintenance.batchRows,100);
 for(const x of [{version:2},{cron:'*'}, {maintenance:{retryAI:true}},{maintenance:{batchRows:0}},
  {maintenance:{batchRows:501}},{maintenance:{batchBytes:1}},{maintenance:{enabled:1}},
  {maintenance:{intervalMs:Infinity}},{maintenance:{intervalMs:86400001}},{shutdownGraceMs:99},
  {maintenance:{intervalMs:10000,maxLagMs:1000}}])assert.throws(()=>validateRuntime(x));
});

test('B11 bounded retention preserves original image hashes and tombstones whole terminal jobs',async t=>{
 const f=fixture(t),old=identity(f,{at:f.now-91*DAY}),recent=identity(f,{at:f.now-DAY});
 insertJob(f,old,{state:'succeeded',actual:125});insertJob(f,recent,{state:'succeeded',actual:20});
 const artifact=id();f.s.run('INSERT INTO artifacts VALUES(?,?,?,?,?,?,?)',artifact,old.userId,old.jobId,'image/png',png,sha(png),old.submittedAt);
 f.s.run('INSERT INTO artifact_images VALUES(?,?,?,?,?,?)',artifact,1,1,png,sha(png),'arch-image-codec/1');
 for(let n=3;n<22;n++)f.s.run('INSERT INTO job_events VALUES(?,?,?,?)',old.jobId,n,'succeeded',old.submittedAt);
 const expired=reference(f),retained=reference(f,{at:f.now+89*DAY,user:1}),before=f.s.get('SELECT * FROM image_references WHERE id=?',retained);
 const keepHash=sha(Buffer.from(before.bytes)),states=[];
 const result=await runMaintenance(f.s,{clock:()=>f.now,rows:2,onBatch:x=>states.push(x)});
 assert.equal(result.status,'complete');assert.ok(states.length>10);assert.ok(states.every(x=>x.scanned<=2&&x.blobBytes<=32*1024*1024));
 assert.equal(f.s.get('SELECT id FROM jobs WHERE id=?',old.jobId),undefined);
 assert.equal(f.s.get('SELECT payload_hash FROM tombstones WHERE job_id=?',old.jobId).payload_hash,old.payloadHash);
 assert.ok(f.s.get('SELECT id FROM jobs WHERE id=?',recent.jobId));
 assert.equal(f.s.get('SELECT id FROM artifact_images WHERE id=?',artifact),undefined);
 const removed=f.s.get('SELECT * FROM image_references WHERE id=?',expired);
 assert.equal(removed.bytes,null);assert.equal(removed.thumbnail,null);assert.equal(removed.revision,2);assert.equal(removed.hash,sha(png));
 assert.deepEqual(f.s.get('SELECT * FROM image_references WHERE id=?',retained),before);
 assert.equal(sha(Buffer.from(before.bytes)),keepHash);assert.equal(result.counts.jobsPurged,1);
 const tomb=rowsHash(f.s,'tombstones');await runMaintenance(f.s,{clock:()=>f.now,rows:1});assert.equal(rowsHash(f.s,'tombstones'),tomb);
});

test('B11 byte budget bounds deletion of large stored blobs without allocating originals to JS',async t=>{
 const f=fixture(t),bytes=Buffer.alloc(8_000_000,9);
 for(let n=0;n<4;n++)reference(f,{bytes});
 const batches=[];await runMaintenance(f.s,{clock:()=>f.now,rows:100,bytes:16*1024*1024,onBatch:x=>batches.push(x)});
 const purging=batches.filter(x=>x.blobBytes>0);assert.equal(purging.length,2);
 assert.ok(purging.every(x=>x.blobBytes<=16*1024*1024));assert.equal(f.s.get('SELECT count(*) n FROM image_references WHERE bytes IS NOT NULL').n,0);
});

test('B11 original-period unknowns, recovery evidence/bounds and deletion obligations never expire',async t=>{
 const f=fixture(t),r=identity(f,{at:f.now-100*DAY});insertJob(f,r);
 const bounded=identity(f,{at:f.now-100*DAY});insertJob(f,bounded,{state:'succeeded'});
 const b=bundle(f,{changes:[{jobId:bounded.jobId,decision:{kind:'bounded',micros:150,state:'succeeded'}}],missing:[{record:identity(f,{at:f.now-100*DAY})}]});
 const plan=createRecoveryPlan(f.s,b,{now:f.now});checkRecoveryPlan(f.s,plan.planHash,b,{now:f.now});applyRecoveryPlan(f.s,plan.planHash,b,{approveHash:plan.planHash,now:f.now});
 f.s.run('INSERT INTO deletion_tasks VALUES(?,?,?,?)',f.users[1],f.now-40*DAY,f.now-10*DAY,'backup-purge-required');
 const preserved=['jobs','recovery_obligations','recovery_evidence','recovery_applications','deletion_tasks','tombstones'];
 const before=preserved.map(x=>rowsHash(f.s,x));
 const result=await runMaintenance(f.s,{clock:()=>f.now,rows:1});
 assert.equal(result.status,'complete');assert.deepEqual(preserved.map(x=>rowsHash(f.s,x)),before);
 assert.equal(result.counts.unknownPending,1);assert.equal(result.counts.recoveryPending,1);assert.equal(result.counts.backupPurgeOverdue,1);
 assert.equal(f.s.get('SELECT actual FROM jobs WHERE id=?',bounded.jobId).actual,null);
});

test('B11 finite high-water passes yield while new jobs arrive after every batch',async t=>{
 const f=fixture(t);for(let i=0;i<5;i++)insertJob(f,identity(f,{at:f.now-91*DAY}),{state:'failed',actual:0});
 let batches=0,appended=0;
 const result=await runMaintenance(f.s,{clock:()=>f.now,rows:1,onBatch:()=>{batches++;insertJob(f,identity(f),{state:'prepared'});appended++;}});
 assert.equal(result.status,'complete');assert.ok(batches<60);
 assert.equal(f.s.get('SELECT count(*) n FROM tombstones').n,5);
 assert.equal(f.s.get('SELECT count(*) n FROM jobs').n,appended);
});

test('B11 maintenance recovers only orphan deliveries, preserving UTC periods and live jobs',async t=>{
 const f=fixture(t),sent=identity(f),unsent=identity(f),live=identity(f);
 for(const r of [sent,unsent,live])insertJob(f,r,{state:'running',accounting:'pending'});
 f.s.run("UPDATE jobs SET submitted=NULL,state='reserved' WHERE id=?",unsent.jobId);
 const result=await runMaintenance(f.s,{clock:()=>f.now,isLive:x=>x===live.jobId,rows:1});
 assert.equal(result.counts.recoveredUnknown,1);assert.equal(result.counts.recoveredUnsent,1);
 assert.equal(f.s.get('SELECT state FROM jobs WHERE id=?',live.jobId).state,'running');
 const a=f.s.get('SELECT * FROM jobs WHERE id=?',sent.jobId);assert.equal(a.state,'unknown');assert.equal(a.actual,null);assert.equal(a.day,sent.day);assert.equal(a.cap,sent.capMicros);
 const b=f.s.get('SELECT * FROM jobs WHERE id=?',unsent.jobId);assert.equal(b.state,'failed');assert.equal(b.accounting,'none');assert.equal(b.submitted,null);
});

test('B11 runOnce coalesces and stop at a yield commits no later batch',async t=>{
 const f=fixture(t),entered=deferred(),resume=deferred();
 const ops=new RuntimeOperations(f.s,{runtime:fullRuntime,clock:()=>f.now,yieldFn:()=>{entered.resolve();return resume.promise;}});
 const a=ops.runOnce(),b=ops.runOnce();assert.strictEqual(a,b);await entered.promise;
 const before=generation(f.s),stop=ops.stop();assert.strictEqual(ops.runOnce(),a);
 resume.resolve();await stop;assert.equal(generation(f.s),before);assert.equal((await a).state,'stopped');
 await ops.runOnce();assert.equal(generation(f.s),before);
});

test('B11 restore hold is read-only; clock rollback waits and forward steps latch until restart',async t=>{
 const f=fixture(t);let now=f.now,mono=100;
 let ops=new RuntimeOperations(f.s,{runtime:fullRuntime,clock:()=>now,monotonic:()=>mono});
 assert.equal((await finish(ops)).code,null);
 const saved=readMaintenance(f.s),before=generation(f.s);
 now--;assert.equal((await ops.runOnce()).code,'CLOCK_BACKWARD');assert.equal(generation(f.s),before);
 now=f.now;mono+=10;assert.equal((await finish(ops)).code,null);
 now+=600001;mono+=1;const high=generation(f.s);
 assert.equal((await ops.runOnce()).code,'CLOCK_FORWARD');assert.equal(generation(f.s),high);
 mono+=600001;assert.equal((await ops.runOnce()).code,'CLOCK_FORWARD');
 await ops.stop();ops=new RuntimeOperations(f.s,{runtime:fullRuntime,clock:()=>now,monotonic:()=>mono});
 assert.equal((await finish(ops)).code,null);assert.ok(readMaintenance(f.s).lastWall>=saved.lastWall);
 f.s.run("INSERT INTO operational_state VALUES('restore-ai-hold','reconciliation-required')");
 const held=generation(f.s);assert.equal((await ops.runOnce()).code,'RESTORE_RECONCILIATION_REQUIRED');
 assert.equal(generation(f.s),held);await ops.stop();
});

test('B11 genuine SQLite writer contention does not wait or claim maintenance success',async t=>{
 const f=fixture(t),other=new DatabaseSync(join(f.root,'backend.sqlite'));t.after(()=>other.close());
 other.exec('BEGIN IMMEDIATE');
 const ops=new RuntimeOperations(f.s,{runtime:fullRuntime,clock:()=>f.now}),start=performance.now(),before=generation(f.s);
 const result=await ops.runOnce();
 assert.equal(result.code,'DATABASE_WRITER_BUSY');assert.ok(performance.now()-start<1000);
 assert.equal(generation(f.s),before);assert.equal(f.s.get('PRAGMA busy_timeout').timeout,5000);
 other.exec('ROLLBACK');assert.equal((await finish(ops)).code,null);await ops.stop();
});

test('B11 failed batch is atomic, safe diagnostic retries only local maintenance',async t=>{
 const f=fixture(t);for(let i=0;i<2;i++)f.s.audit(null,null,'synthetic-private',f.now-91*DAY);
 f.s.db.exec("CREATE TRIGGER synthetic_failure BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'PRIVATE_MESSAGE_MUST_NOT_ESCAPE'); END");
 const logs=[],ops=new RuntimeOperations(f.s,{runtime:fullRuntime,clock:()=>f.now,logger:x=>logs.push(x)});
 const before=rowsHash(f.s,'audit');const x=await finish(ops);
 assert.equal(x.code,'MAINTENANCE_FAILED');assert.equal(rowsHash(f.s,'audit'),before);
 assert.ok(!JSON.stringify(logs).includes('PRIVATE_MESSAGE'));
 f.s.db.exec('DROP TRIGGER synthetic_failure');
 assert.equal((await finish(ops)).code,null);assert.equal(f.s.get('SELECT count(*) n FROM audit WHERE at<?',f.now-90*DAY).n,0);await ops.stop();
});

test('B11 monotonic timers restart once, catch up in bounded turns and expose overdue status',async t=>{
 const f=fixture(t);let mono=0,wall=f.now,serial=0;const pending=new Map();
 const ops=new RuntimeOperations(f.s,{runtime:{maintenance:{enabled:true,maxBatchesPerTurn:1,intervalMs:1000,maxLagMs:2000}},clock:()=>wall,monotonic:()=>mono,
  setTimer:(cb,ms)=>{pending.set(++serial,{cb,ms});return serial;},clearTimer:n=>pending.delete(n)});
 assert.equal(pending.size,0);ops.start();ops.start();assert.equal(pending.size,1);
 for(let i=0;i<30;i++){
  const [key,entry]=pending.entries().next().value;pending.delete(key);entry.cb();await ops.running;
  assert.equal(pending.size,1);if(!ops.pass)break;
 }
 assert.equal(ops.status().state,'idle');mono=2001;wall+=2001;
 assert.equal(ops.status().code,'MAINTENANCE_OVERDUE');
 await ops.stop();assert.equal(pending.size,0);
});

test('B11 checkpoint corruption fails explicitly without replacing state',async t=>{
 const f=fixture(t);f.s.run("INSERT INTO operational_state VALUES('runtime-maintenance','secret-invalid-checkpoint')");
 const before=generation(f.s);
 assert.throws(()=>new RuntimeOperations(f.s),/MAINTENANCE_CHECKPOINT_INVALID/);
 assert.equal(generation(f.s),before);
});

test('B11 backup/restore hash invariants and restore hold survive scheduler restarts',async t=>{
 const f=fixture(t),ref=reference(f,{at:f.now+DAY});insertJob(f,identity(f));
 await runMaintenance(f.s,{clock:()=>f.now});
 const original=sha(Buffer.from(f.s.get('SELECT bytes FROM image_references WHERE id=?',ref).bytes));
 const backup=join(f.root,'ops-sealed.sqlite'),meta=await backupDatabase(join(f.root,'backend.sqlite'),backup,f.now);
 const bytes=readFileSync(backup),sourceHash=sha(bytes);assert.equal(meta.sha256,sourceHash);
 const restored=join(f.root,'ops-restored.sqlite');restoreDatabase(backup,restored,f.now+1000);
 assert.equal(sha(readFileSync(backup)),sourceHash);
 const s=new Store(restored);try{
  const before=generation(s),ops=new RuntimeOperations(s,{runtime:fullRuntime,clock:()=>f.now+1000});
  const x=await ops.runOnce();assert.equal(x.code,'RESTORE_RECONCILIATION_REQUIRED');assert.equal(generation(s),before);
  assert.equal(sha(Buffer.from(s.get('SELECT bytes FROM image_references WHERE id=?',ref).bytes)),original);
  assert.equal(s.get('SELECT expires FROM image_references WHERE id=?',ref).expires,0);
  assert.equal(s.get('SELECT count(*) n FROM sessions').n,0);await ops.stop();
 }finally{s.close();}
 assert.equal(sha(readFileSync(backup)),sourceHash);
});
