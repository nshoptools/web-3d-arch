import test from 'node:test';
import assert from 'node:assert/strict';
import {profile,source,asFile,confirmation,rig,deferred,bytes} from './printer-fixtures.mjs';
import {sealed} from '../../src/printing/src/contracts.mjs';
import {PROFILE_MESSAGES} from '../../src/app/profile-messages.mjs';
const action=(r,extra={})=>({key:r.lib.snapshot().items[0].key,settingsRevision:r.live.settings.revision,...extra});

test('import -> explicit accept -> replace -> original export -> delete, one CAS each',async()=>{
 const p=await profile(),r=rig({language:'vi'}),raw=bytes('\uFEFF'+JSON.stringify(p,null,4)+'\r\n');
 const c=await confirmation(r.lib.prepare(asFile(p,'profile-in.json',raw)));
 assert.equal(r.writes.length,0);await assert.rejects(r.lib.accept(c.id,false));await r.lib.accept(c.id,true);
 await assert.rejects(r.lib.accept(c.id,true));assert.equal(r.writes.length,1);
 const item=r.lib.snapshot().items[0];assert.equal(item.valid,true);assert.equal(item.qualified,false);assert.equal(item.importedFileAvailable,true);
 assert.equal(item.sourceHash,p.payload.source.sha256);assert.notEqual(item.sourceHash,r.live.settings.values.printerProfileSources[0].sha256);
 await r.lib.exportFile(action(r,{original:true}));
 assert.deepEqual(r.downloads[0].bytes,raw);assert.equal(r.downloads[0].filename,'profile-in.json');
 await r.lib.exportFile(action(r,{original:false}));
 const normalized=JSON.parse(new TextDecoder().decode(r.downloads[1].bytes));assert.deepEqual(normalized,p);
 const replacement=await profile(p.payload.id,{label:'Replacement'}),d=await confirmation(r.lib.prepare(asFile(replacement)));
 assert.equal(r.live.settings.values.printerProfiles[0].sha256,p.sha256);await r.lib.accept(d.id,true);
 assert.equal(r.live.settings.values.printerProfileSources.length,1);assert.equal(r.live.settings.values.printerProfileSources[0].profileHash,replacement.sha256);
 const del=await confirmation(r.lib.remove(action(r,{confirmed:false})));assert.equal(r.writes.length,2);await r.lib.remove(del);
 await assert.rejects(r.lib.remove(del));assert.equal(r.writes.length,3);
 assert.deepEqual(r.live.settings.values,{language:'vi',printerProfiles:[],printerProfileSources:[]});
});

test('delete requires the private prepared retry; normalized export never auto-deletes',async()=>{
 const r=rig({printerProfiles:[await profile()]});await r.lib.refresh();
 await assert.rejects(r.lib.remove(action(r,{confirmed:true})),{code:'PROFILE_PROPOSAL_EXPIRED'});
 assert.equal(r.writes.length,0);await r.lib.exportFile(action(r,{original:false}));assert.equal(r.writes.length,0);
});

test('replacement retains other profiles, original bytes and unrelated settings',async()=>{
 const p=await profile('one'),q=await profile('two'),original=await source(q);
 const r=rig({printerProfiles:[p,q],printerProfileSources:[await source(p),original],fontSize:18,savedPrompts:['private']});
 await r.add(await profile('one',{label:'New one'}));
 assert.equal(r.live.settings.values.printerProfiles.length,2);
 assert.deepEqual(r.live.settings.values.printerProfileSources.find(s=>s.profileHash===q.sha256),original);
 assert.equal(r.live.settings.values.fontSize,18);assert.deepEqual(r.live.settings.values.savedPrompts,['private']);
});

test('exact settings object, ETag, revision and account ABA expire prepared imports',async()=>{
 for(const change of [
  r=>r.sameValuesNext(),r=>{r.live.etag='"r99"';},
  r=>{r.live.settings.revision++;r.live.etag='"r1"';},
  r=>{r.change({userId:'B',epoch:2});r.change({userId:'account-A',epoch:3});},
  r=>r.lib.reset()
 ]){
  const r=rig(),c=await confirmation(r.lib.prepare(asFile(await profile())));
  change(r);await assert.rejects(r.lib.accept(c.id,true));assert.equal(r.writes.length,0);
 }
});

test('late file read, overlapping imports and changed file attributes never substitute approval bytes',async()=>{
 const r=rig(),gate=deferred(),entered=deferred(),p=await profile('late'),q=await profile('new');
 const raw=bytes(JSON.stringify(p)),file={name:'original-name.json',size:raw.length,arrayBuffer:()=>{entered.resolve();return gate.promise;}};
 const late=r.lib.prepare(file),rejected=assert.rejects(late,{code:'PROFILE_IMPORT_SUPERSEDED'});await entered.promise;
 const accepted=await confirmation(r.lib.prepare(asFile(q)));gate.resolve(raw.buffer);await rejected;await r.lib.accept(accepted.id,true);
 assert.equal(r.live.settings.values.printerProfiles[0].payload.id,'new');assert.equal(r.writes.length,1);
 const gate2=deferred(),entered2=deferred(),r2=rig();
 const f={name:'captured.json',size:raw.length,arrayBuffer:()=>{entered2.resolve();return gate2.promise;}};
 const pending=confirmation(r2.lib.prepare(f));await entered2.promise;f.name='later.json';f.size=100;gate2.resolve(raw.buffer);
 const c=await pending;await r2.lib.accept(c.id,true);assert.equal(r2.live.settings.values.printerProfileSources[0].filename,'captured.json');
});

test('late read after account change or reset never creates an import proposal',async()=>{
 for(const change of [r=>r.change({userId:'B',epoch:2}),r=>r.lib.reset()]){
  const r=rig(),gate=deferred(),entered=deferred(),raw=bytes(JSON.stringify(await profile()));
  const f={name:'late.json',size:raw.length,arrayBuffer:()=>{entered.resolve();return gate.promise;}};
  const result=assert.rejects(r.lib.prepare(f));await entered.promise;change(r);gate.resolve(raw.buffer);await result;
  assert.equal(r.writes.length,0);
 }
});

test('post-write identity change cannot complete against the next account',async()=>{
 let r;r=rig({}, {afterWrite:()=>r.change({userId:'B',epoch:2,settings:{schemaVersion:1,revision:0,values:{}},etag:'"r0"'})});
 const c=await confirmation(r.lib.prepare(asFile(await profile())));
 await assert.rejects(r.lib.accept(c.id,true),{code:'PROFILE_SETTINGS_CHANGED'});
 assert.deepEqual(r.live.settings.values,{});assert.equal(r.writes.length,1); // A may already be committed; no rollback claim.
});

test('preflight is awaited before publication and download, without a project dependency',async()=>{
 let deny=false,checks=0;const r=rig({}, {preflight:async()=>{checks++;if(deny)throw Object.assign(new Error('test denial'),{code:'ONLINE_SESSION_REQUIRED'});}});
 const c=await confirmation(r.lib.prepare(asFile(await profile())));deny=true;
 await assert.rejects(r.lib.accept(c.id,true),{code:'ONLINE_SESSION_REQUIRED'});assert.equal(r.writes.length,0);
 deny=false;await r.add(await profile());assert.equal(r.writes.length,1);
 deny=true;await assert.rejects(r.lib.exportFile(action(r,{original:false})),{code:'ONLINE_SESSION_REQUIRED'});assert.equal(r.downloads.length,0);
 assert.ok(checks>=5);
});

test('state change while publication preflight waits blocks writes',async()=>{
 const gate=deferred(),entered=deferred();let wait=false;
 const r=rig({}, {preflight:async()=>{if(wait){entered.resolve();await gate.promise;}}});
 const c=await confirmation(r.lib.prepare(asFile(await profile())));wait=true;
 const task=assert.rejects(r.lib.accept(c.id,true));await entered.promise;r.sameValuesNext();gate.resolve();await task;assert.equal(r.writes.length,0);
});

test('per-row invalid/unknown records remain visible and exportable; duplicate IDs cannot be imported over',async()=>{
 const p=await profile(),q=await profile(p.payload.id,{label:'Conflict'}),future=await sealed({...p.payload,id:'future',schemaVersion:99});
 const r=rig({printerProfiles:[p,q,future,null,{payload:{id:'malformed'},sha256:42}],printerProfileSources:[]});await r.lib.refresh();
 const items=r.lib.snapshot().items;assert.equal(items.length,5);assert.ok(items.every(i=>i.valid===false&&i.qualified===false));
 assert.equal(items[0].reason,PROFILE_MESSAGES.PROFILE_DUPLICATE_ID);
 await assert.rejects(r.lib.prepare(asFile(p)),{code:'PROFILE_DUPLICATE_ID'});
 await assert.rejects(r.lib.prepare(asFile(future)));
 await r.lib.exportFile({key:items[2].key,settingsRevision:0,original:false});assert.deepEqual(JSON.parse(new TextDecoder().decode(r.downloads[0].bytes)),future);
 await r.lib.exportFile({key:items[3].key,settingsRevision:0,original:false});assert.equal(new TextDecoder().decode(r.downloads[1].bytes),'null\n');
 const del=await confirmation(r.lib.remove({key:items[1].key,settingsRevision:0,confirmed:false}));await r.lib.remove(del);
 assert.equal(r.lib.snapshot().items[0].valid,true);
});

test('schema, signature, file boundaries and unsafe names block before any write',async()=>{
 const p=await profile(),r=rig();
 for(const f of [
  asFile({...p,sha256:'0'.repeat(64)}),asFile({...p,unknown:true}),
  asFile(p,'../bad.json'),asFile(p,'bad\u007f.json'),asFile(p,'\ud800.json'),
  {name:'zero.json',size:0,arrayBuffer:async()=>new ArrayBuffer(0)},
  {name:'large.json',size:1024*1024+1,arrayBuffer:async()=>assert.fail('must not read oversize')},
  {name:'false-size.json',size:1,arrayBuffer:async()=>new ArrayBuffer(2)},
  asFile(p,'utf8.json',new Uint8Array([0xff,0xfe])),
  asFile(p,'proto.json',bytes('{"__proto__":{"polluted":1}}'))
 ])await assert.rejects(r.lib.prepare(f));
 assert.equal(r.writes.length,0);assert.equal({}.polluted,undefined);
});

test('library row limits and original retained-byte budget preserve existing values',async()=>{
 const all=await Promise.all(Array.from({length:50},(_,i)=>profile('p'+i))),r=rig({printerProfiles:all});await r.lib.refresh();
 await assert.rejects(r.lib.prepare(asFile(await profile('extra'))),{code:'PROFILE_LIBRARY_LIMIT'});
 const c=await confirmation(r.lib.prepare(asFile(await profile('p0',{label:'Replacement'}))));await r.lib.accept(c.id,true);assert.equal(r.live.settings.values.printerProfiles.length,50);
 const large=await Promise.all([0,1,2].map(i=>profile('large'+i,{opaqueNotes:'x'.repeat(740000)}))),r2=rig();
 await r2.add(large[0]);await r2.add(large[1]);
 assert.ok(r2.lib.snapshot().items.every(i=>i.importedFileAvailable),'valid large originals must remain available');
 const third=await confirmation(r2.lib.prepare(asFile(large[2])));
 await assert.rejects(r2.lib.accept(third.id,true),{code:'PROFILE_ORIGINAL_BUDGET'});assert.equal(r2.writes.length,2);assert.equal(r2.live.settings.values.printerProfiles.length,2);
});

test('corrupt, orphan, duplicate and noncanonical originals do not advertise an available download',async()=>{
 const p=await profile(),original=await source(p);
 for(const originals of [
  [{...original,sha256:'0'.repeat(64)}],[{...original,profileHash:'0'.repeat(64)}],
  [original,original],[{...original,extra:1}],[{...original,data:original.data+'='}],
  [{...original,filename:'bad/filename'}],[await source(p,bytes('not JSON'))]
 ]){
  const r=rig({printerProfiles:[p],printerProfileSources:originals});await r.lib.refresh();
  assert.equal(r.lib.snapshot().items[0].importedFileAvailable,false);assert.equal(r.lib.snapshot().items[0].valid,true);
 }
});

test('download failure/reset/identity loss never writes or leaks into a later session',async()=>{
 const entered=deferred(),gate=deferred(),r=rig({printerProfiles:[await profile()]},{download:async()=>{entered.resolve();await gate.promise;}});
 await r.lib.refresh();const task=assert.rejects(r.lib.exportFile(action(r,{original:false})));
 await entered.promise;r.change({userId:'B',epoch:2});gate.reject(new DOMException('Cancelled','AbortError'));await task;
 assert.equal(r.writes.length,0);r.lib.dispose();assert.equal(r.lib.snapshot().enabled,false);assert.deepEqual(r.lib.snapshot().items,[]);
});
