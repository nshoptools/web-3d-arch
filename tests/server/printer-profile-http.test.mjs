import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,defaultPolicy} from './helpers.mjs';
import {profile,source,asFile,confirmation,bytes} from '../app/printer-fixtures.mjs';
import {httpLibrary} from './printer-http-binding.mjs';
const put=(client,values,etag='"r0"')=>client.request('PUT','/api/v1/settings',{schemaVersion:1,values},{'If-Match':etag});
const cmd=(h,extra={})=>({key:h.lib.snapshot().items[0].key,settingsRevision:h.c.settings.revision,...extra});

test('HTTP rejects incoherent originals, malformed schemas and hash links without advancing revision',async t=>{
 const f=await setup(t),p=await profile(),q=await profile('different'),original=await source(p);
 const cases=[
  ['wrong raw SHA',[p],[{...original,sha256:'0'.repeat(64)}]],
  ['different sealed record',[p],[await source(p,bytes(JSON.stringify(q)))]],
  ['orphan reference',[],[original]],
  ['mismatched declared profile hash',[p],[{...original,profileHash:q.sha256}]],
  ['duplicate source reference',[p],[original,original]],
  ['extra field',[p],[{...original,unknown:1}]],
  ['bad byte count',[p],[{...original,byteLength:original.byteLength+1}]],
  ['noncanonical base64',[p],[{...original,data:original.data+'='}]],
  ['invalid utf8',[p],[await source(p,new Uint8Array([0xff,0xfe]))]],
  ['invalid JSON',[p],[await source(p,bytes('not JSON'))]],
  ['unsafe filename',[p],[{...original,filename:'../incoming.json'}]],
  ['DEL filename',[p],[{...original,filename:'bad\u007f.json'}]],
  ['zero byte',[p],[{...original,byteLength:0,data:''}]],
  ['over source count',[p],Array.from({length:51},()=>original)],
  ['payload seal mismatch',[{...p,payload:{...p.payload,label:'changed'}}],[await source({...p,payload:{...p.payload,label:'changed'}})]]
 ];
 for(const [label,profiles,originals] of cases){
  const r=await put(f.a,{printerProfiles:profiles,printerProfileSources:originals});
  assert.equal(r.status,400,label);const after=await f.a.ok('GET','/api/v1/settings');assert.equal(after.revision,0,label);assert.deepEqual(after.values,{},label);
 }
 const good=await put(f.a,{printerProfiles:[p],printerProfileSources:[original]});assert.equal(good.status,200);assert.equal(good.json.revision,1);
 assert.equal((await f.b.ok('GET','/api/v1/settings')).revision,0);assert.equal(f.provider.calls.length,0);
});

test('HTTP manager CAS conflict preserves current and incoming original copies, scoped to owner account',async t=>{
 const f=await setup(t),a=await httpLibrary(f.a),b=await httpLibrary(f.a),p=await profile('first'),q=await profile('second');
 const ca=await confirmation(a.lib.prepare(asFile(p))),cb=await confirmation(b.lib.prepare(asFile(q)));
 const results=await Promise.allSettled([a.lib.accept(ca.id,true),b.lib.accept(cb.id,true)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const fail=results.find(r=>r.status==='rejected').reason;assert.equal(fail.code,'SETTINGS_CONFLICT');
 const after=await f.a.ok('GET','/api/v1/settings');assert.equal(after.revision,1);assert.equal(after.values.printerProfiles.length,1);assert.equal(after.values.printerProfileSources.length,1);
 const conflicts=await f.a.ok('GET','/api/v1/settings/conflicts');assert.equal(conflicts.conflicts.length,1);
 const conflict=conflicts.conflicts[0];assert.notEqual(conflict.current.printerProfiles[0].sha256,conflict.incoming.printerProfiles[0].sha256);
 for(const values of [conflict.current,conflict.incoming]){
  assert.equal(values.printerProfileSources[0].profileHash,values.printerProfiles[0].sha256);
  assert.deepEqual(JSON.parse(Buffer.from(values.printerProfileSources[0].data,'base64').toString()),values.printerProfiles[0]);
 }
 assert.deepEqual((await f.b.ok('GET','/api/v1/settings')).values,{});
 assert.equal((await f.b.ok('GET','/api/v1/settings/conflicts')).conflicts.length,0);
 assert.equal((await f.b.request('DELETE','/api/v1/settings/conflicts/'+conflict.id,{confirm:'discard:'+conflict.id})).status,404);
 // No automatic LWW retry: retrying the consumed import cannot write another revision.
 await assert.rejects((results[0].status==='rejected'?a:b).lib.accept(results[0].status==='rejected'?ca.id:cb.id,true));
 assert.equal((await f.a.ok('GET','/api/v1/settings')).revision,1);
});

test('HTTP account ABA and stale settings confirmation cannot delete/export identical records in another session',async t=>{
 const f=await setup(t),p=await profile(),v={printerProfiles:[p],printerProfileSources:[await source(p)]};
 assert.equal((await put(f.a,v)).status,200);assert.equal((await put(f.b,v)).status,200);
 const h=await httpLibrary(f.a),old=cmd(h,{original:true});
 const del=await confirmation(h.lib.remove(cmd(h,{confirmed:false})));
 await h.read(f.b);await h.lib.refresh();await assert.rejects(h.lib.remove(del));await assert.rejects(h.lib.exportFile(old));
 await h.read(f.a);await h.lib.refresh();await assert.rejects(h.lib.exportFile(old));
 const c=await confirmation(h.lib.prepare(asFile(await profile('late'))));
 await f.a.ok('PUT','/api/v1/settings',{schemaVersion:1,values:{...v,language:'en'}},{'If-Match':'"r1"'});
 await h.read(f.a);await h.lib.refresh();await assert.rejects(h.lib.accept(c.id,true));
 assert.equal((await f.a.ok('GET','/api/v1/settings')).revision,2);assert.equal((await f.b.ok('GET','/api/v1/settings')).revision,1);
 assert.equal(h.downloads.length,0);
});

test('HTTP replacement/delete preserve other originals; settings import/export/restart retain bytes and legacy records',async t=>{
 const f=await setup(t),h=await httpLibrary(f.a),p=await profile('one'),q=await profile('two');
 for(const value of [p,q]){const c=await confirmation(h.lib.prepare(asFile(value)));await h.lib.accept(c.id,true);}
 const rawQ=h.c.settings.values.printerProfileSources.find(s=>s.profileHash===q.sha256);
 const next=await profile('one',{label:'Changed'}),c=await confirmation(h.lib.prepare(asFile(next)));await h.lib.accept(c.id,true);
 assert.equal(h.c.settings.revision,3);assert.equal(h.c.settings.values.printerProfileSources.length,2);
 assert.deepEqual(h.c.settings.values.printerProfileSources.find(s=>s.profileHash===q.sha256),rawQ);
 const del=await confirmation(h.lib.remove(cmd(h,{confirmed:false})));await h.lib.remove(del);assert.equal(h.c.settings.revision,4);
 assert.deepEqual(h.c.settings.values.printerProfileSources,[rawQ]);
 const exported=await f.a.ok('GET','/api/v1/settings/export');
 assert.deepEqual(exported.values.printerProfileSources,[rawQ]);
 await f.a.ok('POST','/api/v1/settings/reset',{confirm:'reset-settings'},{'If-Match':'"r4"'});
 await f.a.ok('POST','/api/v1/settings/import',{mode:'replace',confirm:'import:replace',document:exported},{'If-Match':'"r5"'});
 await f.restart();
 const persisted=await f.a.ok('GET','/api/v1/settings');assert.equal(persisted.revision,6);assert.deepEqual(persisted.values.printerProfileSources,[rawQ]);
 // Forward/legacy safe JSON is not declared printing-valid by the backend.
 const future={futureSchema:99,originalIntent:'keep this unknown data'};
 const updated=await put(f.a,{...persisted.values,printerProfiles:[...persisted.values.printerProfiles,future]},'"r6"');
 assert.equal(updated.status,200);assert.deepEqual(updated.json.values.printerProfiles[1],future);
 await h.read(f.a);await h.lib.refresh();assert.equal(h.lib.snapshot().items[1].valid,false);
 const removeUnknown=await confirmation(h.lib.remove({key:h.lib.snapshot().items[1].key,settingsRevision:7,confirmed:false}));await h.lib.remove(removeUnknown);
 assert.deepEqual((await f.a.ok('GET','/api/v1/settings')).values.printerProfileSources,[rawQ]);
});

test('HTTP size quota and revoked auth reject writes atomically; no automatic dropping of retained originals',async t=>{
 const policy=defaultPolicy();policy.quotas.settingsBytes=4096;
 const f=await setup(t,{policy}),h=await httpLibrary(f.a),p=await profile();
 let c=await confirmation(h.lib.prepare(asFile(p)));await h.lib.accept(c.id,true);
 const committed=structuredClone(h.c.settings),q=await profile('big',{opaqueNotes:'x'.repeat(10000)});
 c=await confirmation(h.lib.prepare(asFile(q)));await assert.rejects(h.lib.accept(c.id,true),{code:'QUOTA_EXCEEDED'});
 assert.deepEqual(await f.a.ok('GET','/api/v1/settings'),committed);
 c=await confirmation(h.lib.prepare(asFile(await profile('late'))));
 await f.owner.ok('POST','/api/v1/owner/users/'+f.a.user.id,{action:'revoke-sessions',confirm:'revoke-sessions:'+f.a.user.id});
 await assert.rejects(h.lib.accept(c.id,true),e=>e.status===401);
 await f.a.login('member-a');assert.deepEqual((await f.a.ok('GET','/api/v1/settings')).values,committed.values);
});
