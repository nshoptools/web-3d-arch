import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,defaultPolicy} from './helpers.mjs';
import {profile,asFile,confirmation,bytes} from '../app/printer-fixtures.mjs';
import {httpLibrary} from './printer-http-binding.mjs';
test('HTTP exact 1 MiB imported bytes remain available and roundtrip within explicit settings quota',async t=>{
 const policy=defaultPolicy();policy.quotas.settingsBytes=2_000_000;
 const f=await setup(t,{policy}),h=await httpLibrary(f.a),p=await profile();
 const json=JSON.stringify(p),raw=bytes(json+' '.repeat(1024*1024-bytes(json).length));
 assert.equal(raw.length,1024*1024);
 const retry=await confirmation(h.lib.prepare(asFile(p,'exact-boundary.json',raw)));await h.lib.accept(retry.id,true);
 const view=h.lib.snapshot();assert.equal(view.items[0].importedFileAvailable,true);assert.equal(view.items[0].valid,true);
 await h.lib.exportFile({key:view.items[0].key,settingsRevision:view.settingsRevision,original:true});
 assert.deepEqual(h.downloads[0].bytes,raw);
 assert.equal((await f.a.ok('GET','/api/v1/settings')).revision,1);
 assert.equal((await f.b.ok('GET','/api/v1/settings')).revision,0);
});
