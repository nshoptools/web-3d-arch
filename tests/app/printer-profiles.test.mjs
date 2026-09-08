import './printer-profile-cases.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {profile,source,asFile,confirmation,rig,deferred,bytes} from './printer-fixtures.mjs';

test('row keys cannot cross account or epoch with identical record/revision',async()=>{
 const p=await profile(),r=rig({printerProfiles:[p]});await r.lib.refresh();
 const old=r.lib.snapshot().items[0].key,revision=r.live.settings.revision;
 r.change({userId:'account-B',epoch:2});await r.lib.refresh();
 assert.notEqual(r.lib.snapshot().items[0].key,old);
 await assert.rejects(r.lib.remove({key:old,settingsRevision:revision,confirmed:true}));
 await assert.rejects(r.lib.exportFile({key:old,settingsRevision:revision,original:false}));
 r.change({userId:'account-A',epoch:3});await r.lib.refresh();
 await assert.rejects(r.lib.exportFile({key:old,settingsRevision:revision,original:false}));
 assert.equal(r.writes.length,0);assert.equal(r.downloads.length,0);
});
test('prepared import rejects a mutable context epoch change',async()=>{
 const r=rig(),p=await profile(),c=await confirmation(r.lib.prepare(asFile(p)));
 r.live.epoch++;
 await assert.rejects(r.lib.accept(c.id,true));assert.equal(r.writes.length,0);
});
test('original availability requires same sealed record, not only raw hash',async()=>{
 const p=await profile(),other=await profile('other'),original=await source(p,bytes(JSON.stringify(other)));
 const r=rig({printerProfiles:[p],printerProfileSources:[original]});await r.lib.refresh();
 assert.equal(r.lib.snapshot().items[0].importedFileAvailable,false);
 const item=r.lib.snapshot().items[0];
 await assert.rejects(r.lib.exportFile({key:item.key,settingsRevision:0,original:true}),{code:'PROFILE_ORIGINAL_UNAVAILABLE'});
 assert.equal(r.downloads.length,0);
});
test('reset cancels download even when injected transport ignores abort',async()=>{
 const gate=deferred(),entered=deferred(),r=rig({printerProfiles:[await profile()]},{download:async v=>{entered.resolve(v);await gate.promise;}});
 await r.lib.refresh();const command={key:r.lib.snapshot().items[0].key,settingsRevision:0,original:false};
 const task=r.lib.exportFile(command),v=await entered.promise;r.lib.reset();gate.resolve();
 await assert.rejects(task,{code:'CANCELLED'});assert.equal(v.signal.aborted,true);
});
