import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {readFileSync} from 'node:fs';
import {setup,uid,hash,png,money} from './helpers.mjs';
import {decodePixels,encodePNG} from '../../src/server/image-codec.mjs';
import {backupDatabase,restoreDatabase} from '../../src/server/operations.mjs';
import {Store} from '../../src/server/database.mjs';
import {recoveryRecord} from '../../src/server/recovery.mjs';
export const uploadBody=(patch={})=>({uploadId:uid(),projectId:uid(),projectRevision:'r1',mediaType:'image/png',byteLength:png.length,sha256:hash(png),base64:png.toString('base64'),...patch});
export const stage=async(c,b=uploadBody())=>(await c.ok('POST','/api/v1/ai/references',b,{},201)).reference;
test('B03 HTTP: two members and owner; staged upload, idempotent exact hash, private original and genuine thumbnail',async t=>{
 const f=await setup(t),body=uploadBody(),r=await stage(f.a,body);
 assert.equal(r.sha256,hash(png));assert.equal(r.width,1);assert.equal(f.provider.calls.length,0);
 assert.equal((await f.a.ok('POST','/api/v1/ai/references',body)).reused,true);
 const raw=await f.a.request('GET','/api/v1/ai/references/'+r.id+'/download');assert.ok(raw.raw.equals(png));assert.match(raw.headers.get('cache-control'),/no-store/);
 const thumb=await f.a.request('GET','/api/v1/ai/references/'+r.id+'/thumbnail');assert.equal(thumb.status,200);assert.deepEqual([...decodePixels(thumb.raw,'image/png').data],[255,255,255,255]);
 for(const c of [f.b,f.owner])for(const suffix of ['','/download','/thumbnail'])assert.equal((await c.request('GET','/api/v1/ai/references/'+r.id+suffix)).status,404);
 assert.equal((await f.b.request('POST','/api/v1/ai/references',body)).status,409);
 assert.equal((await f.a.request('POST','/api/v1/ai/references',{...body,projectRevision:'r2'})).status,409);
 assert.equal((await f.a.request('POST','/api/v1/ai/references',{...body,ownerId:f.b.user.id})).status,400);
 const rb=await stage(f.b);assert.notEqual(rb.id,r.id);
});
test('B03 HTTP: malformed/hash/byte/resource uploads fail without stored source or provider send; separate quota',async t=>{
 const f=await setup(t),b=uploadBody();
 for(const patch of [{sha256:'0'.repeat(64)},{byteLength:b.byteLength+1},{base64:b.base64+'\n'},{byteLength:8_000_001},{mediaType:'image/webp'},{url:'https://arbitrary.invalid/a'}]){
  const r=await f.a.request('POST','/api/v1/ai/references',{...b,...patch});assert.ok(r.status>=400);
 }
 const bytes=Buffer.from(png);bytes[40]^=1;assert.equal((await f.a.request('POST','/api/v1/ai/references',{...b,sha256:hash(bytes),base64:bytes.toString('base64')})).status,422);
 assert.equal(f.app.store.get('SELECT count(*) n FROM image_references').n,0);
 f.app.store.run("INSERT OR REPLACE INTO counters VALUES(?,'image-upload-count','2026-09-08',40)",f.a.user.id);
 const denied=await f.a.request('POST','/api/v1/ai/references',b);assert.equal(denied.status,429);assert.equal(denied.json.error.details.dimension,'image-upload-count');await stage(f.b);
 assert.equal(f.provider.calls.length,0);
});
test('B03 HTTP: stored reference capacity includes thumbnail and original; eight records bounded per user',async t=>{
 const f=await setup(t);for(let n=0;n<8;n++)await stage(f.a);
 const before=f.app.policy.usage(f.a.user.id),ninth=await f.a.request('POST','/api/v1/ai/references',uploadBody());assert.equal(ninth.json.error.code,'REFERENCE_STORAGE_LIMIT');
 assert.ok(before.bytes>=8*png.length);assert.ok(before.objects>=8);
 await stage(f.b);
});
test('B03 HTTP: descriptor project/hash replacement rejected; expiry and deletion block approval without a send',async t=>{
 const f=await setup(t),c=await f.a.connect();await f.a.budget();f.provider.metadata.models[0].referenceImages=true;
 const r=await stage(f.a),base={reference:r,projectId:r.projectId,projectRevision:r.projectRevision};
 for(const patch of [{reference:{...r,sha256:'0'.repeat(64)}},{projectRevision:'r2'},{reference:{...r,id:uid()}}]){
  const input=f.a.input(c,{...base,...patch});const denied=await f.a.request('POST','/api/v1/ai/jobs',input,{'idempotency-key':uid()});assert.ok(denied.status>=400);
 }
 const p=await f.a.prepare(c,base);assert.deepEqual(p.job.quote.reference,r);assert.ok(p.job.quote.dataToSend.every(v=>typeof v==='string'));assert.ok(p.job.quote.dataToSend.join().includes(r.sha256));
 await f.a.ok('DELETE','/api/v1/ai/references/'+r.id,{revision:1,confirm:'delete:'+r.id});
 assert.equal((await f.a.request('POST','/api/v1/ai/jobs/'+p.job.id+'/submit',{consent:true,quoteHash:p.job.quoteHash})).json.error.code,'REFERENCE_DELETED');
 const r2=await stage(f.a),q=await f.a.prepare(c,{reference:r2,projectId:r2.projectId,projectRevision:r2.projectRevision});
 f.advance(11*60000);assert.equal((await f.a.request('POST','/api/v1/ai/jobs/'+q.job.id+'/submit',{consent:true,quoteHash:q.job.quoteHash})).json.error.code,'QUOTE_EXPIRED');
 assert.equal(f.provider.calls.length,0);
});
test('B03 HTTP: reference wire bytes count in admission; payload replay exact; delete leaves original-period charge',async t=>{
 const f=await setup(t),c=await f.a.connect();await f.a.budget();f.provider.metadata.models[0].referenceImages=true;
 const r=await stage(f.a),p=await f.a.prepare(c,{reference:r,projectId:r.projectId,projectRevision:r.projectRevision}),row=f.app.store.get('SELECT * FROM jobs WHERE id=?',p.job.id);
 assert.ok(row.byte_cap>=4096+Buffer.byteLength(row.payload)+4*Math.ceil(r.byteLength/3));
 const policy=f.app.policy.read();delete policy.version;policy.ai.bytesPerDay=row.byte_cap-1;f.app.policy.replace(policy,1,f.owner.user.id);
 const denied=await f.a.request('POST','/api/v1/ai/jobs/'+p.job.id+'/submit',{quoteHash:p.job.quoteHash,consent:true});assert.equal(denied.json.error.details.dimension,'ai-bytes');assert.equal(f.provider.calls.length,0);
 policy.ai.bytesPerDay=20_000_000;f.app.policy.replace(policy,2,f.owner.user.id);
 await f.a.submit(p.job);await f.a.submit(p.job);assert.equal(f.provider.calls.length,1);
 await f.a.ok('DELETE','/api/v1/ai/references/'+r.id,{revision:1,confirm:'delete:'+r.id});
 f.provider.complete(p.job.id,f.provider.result({actual:95}));const done=await f.a.poll(p.job,'succeeded');
 assert.equal(done.accounting.actualMicros,95);assert.equal(done.accounting.quoteDiscrepancyMicros,35);
 const aid=done.artifacts[0].id,meta=await f.a.ok('GET','/api/v1/ai/artifacts/'+aid),thumb=await f.a.request('GET','/api/v1/ai/artifacts/'+aid+'/thumbnail');assert.equal(meta.width,1);assert.equal(hash(thumb.raw),meta.thumbnail.sha256);
 await f.a.ok('DELETE','/api/v1/ai/artifacts/'+aid,{confirm:'delete:'+aid});
 assert.equal((await f.a.request('GET','/api/v1/ai/artifacts/'+aid+'/download')).status,404);
 const ledger=f.app.store.get('SELECT * FROM jobs WHERE id=?',p.job.id);assert.equal(ledger.actual,95);assert.equal(ledger.byte_cap,row.byte_cap);assert.equal(ledger.day,'2026-09-08');assert.equal(ledger.payload_hash,row.payload_hash);
 assert.equal((await f.a.ok('POST','/api/v1/ai/jobs',p.input,{'idempotency-key':p.idem})).job.id,p.job.id);
});
test('B03 HTTP: invalid provider image still records actual above cap with no image; no guessed zero',async t=>{
 const f=await setup(t),c=await f.a.connect();await f.a.budget();const p=await f.a.prepare(c);await f.a.submit(p.job);
 const bad=Buffer.from(png);bad[40]^=1;f.provider.complete(p.job.id,{...f.provider.result({actual:95}),artifact:{mediaType:'image/png',bytes:bad}});
 const j=await f.a.poll(p.job,'failed');assert.equal(j.accounting.actualMicros,95);assert.equal(j.artifacts.length,0);assert.equal(j.errorCode,'PROVIDER_RESPONSE_INVALID');
});
test('B03 HTTP: corrupt persisted original/thumb cannot be downloaded as a checked artifact',async t=>{
 const f=await setup(t),c=await f.a.connect();await f.a.budget();f.provider.mode='success';const p=await f.a.prepare(c);await f.a.submit(p.job);const j=await f.a.poll(p.job,'succeeded'),id=j.artifacts[0].id;
 f.app.store.run('UPDATE artifact_images SET thumbnail=? WHERE id=?',Buffer.from([1]),id);
 assert.equal((await f.a.request('GET','/api/v1/ai/artifacts/'+id+'/thumbnail')).json.error.code,'IMAGE_HASH_MISMATCH');
 f.app.store.run('UPDATE artifacts SET bytes=? WHERE id=?',Buffer.from([1]),id);
 assert.equal((await f.a.request('GET','/api/v1/ai/artifacts/'+id+'/download')).json.error.code,'IMAGE_HASH_MISMATCH');
});
test('B03 restore: reference originals backed up, send eligibility revoked, accounting identity/bytes retained',async t=>{
 const f=await setup(t),c=await f.a.connect();await f.a.budget();f.provider.metadata.models[0].referenceImages=true;const r=await stage(f.a),p=await f.a.prepare(c,{reference:r,projectId:r.projectId,projectRevision:r.projectRevision});await f.a.submit(p.job);
 const record=recoveryRecord(f.app.store,f.app.store.get('SELECT * FROM jobs WHERE id=?',p.job.id));
 const backup=join(f.root,'image-backup.sqlite'),target=join(f.root,'image-restored.sqlite');
 const sealed=await backupDatabase(f.config.databasePath,backup,f.clock());const before=hash(readFileSync(backup));
 const receipt=restoreDatabase(backup,target,f.clock());assert.equal(sealed.schemaVersion,5);assert.equal(receipt.schemaVersion,5);assert.equal(hash(readFileSync(backup)),before);
 const s=new Store(target);try{const ref=s.get('SELECT * FROM image_references WHERE id=?',r.id);assert.equal(ref.expires,0);assert.equal(hash(ref.bytes),r.sha256);assert.equal(s.get('SELECT count(*) n FROM sessions').n,0);const j=s.get('SELECT * FROM jobs WHERE id=?',p.job.id);assert.equal(j.state,'unknown');assert.equal(j.byte_cap,record.byteCap);assert.equal(j.payload_hash,record.payloadHash);assert.ok(s.get("SELECT key FROM operational_state WHERE key='restore-ai-hold'"));}finally{s.close();}
});
