import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {inputFixture} from './helpers.mjs';
import {startArtifact} from './http-helpers.mjs';
import {hash} from '../../tools/release/core.mjs';
test('portable HTTPS/static/API/proxy: synthetic owner + two members, isolation, auth/logout and cache are real', {timeout:60000},async t=>{
 const x=inputFixture(),built=await x.build(),f=await startArtifact(t,built.directory);
 const manifest=JSON.parse(readFileSync(resolve(built.directory,'public-manifest.json'))),png=manifest.assets.find(a=>a.mime==='image/png'),bin=manifest.assets.find(a=>a.mime==='application/octet-stream');
 const root=await f.request('GET','/');
 assert.equal(root.status,200);assert.equal(root.headers['cross-origin-opener-policy'],'same-origin');
 assert.equal(root.headers['cross-origin-embedder-policy'],'require-corp');assert.match(root.headers['content-security-policy'],/object-src 'none'/);
 const p=await f.request('GET',png.url);assert.equal(hash(p.raw),png.sha256);assert.equal(p.headers['content-type'],'image/png');assert.match(p.headers['cache-control'],/immutable/);
 const original=await f.request('GET',bin.url);assert.equal(hash(original.raw),bin.sha256);assert.equal(original.headers['content-type'],'application/octet-stream');
 assert.equal((await f.request('GET',bin.url.replace('.bin','.svg'))).status,404);
 assert.equal((await f.request('GET','/src/server/cli.mjs')).status,404);
 assert.equal((await f.request('GET','/release-manifest.json')).status,404);
 assert.equal((await f.request('GET','/customeruser.keys')).status,404);
 const unchanged=await f.request('GET',png.url,undefined,{'if-none-match':p.headers.etag});assert.equal(unchanged.status,304);assert.equal(unchanged.raw.length,0);
 assert.equal((await f.request('GET',png.url,undefined,{range:'bytes=0-4'})).status,416);
 const health=await f.request('GET','/api/v1/health');assert.equal(health.status,200);assert.match(health.headers['cache-control'],/no-store/);
 assert.equal(health.headers['x-arch-public'],undefined);assert.deepEqual(Object.keys(health.json.operations).sort(),['reason','state']);
 const spoof=await f.request('GET','/api/v1/me',undefined,{'x-user':'owner','x-forwarded-host':'attacker.invalid'});assert.equal(spoof.status,401);
 const owner=f.client();await owner.login();const members=[];
 for(const subject of ['synthetic-a','synthetic-b']){
  const inv=await owner.request('POST','/api/v1/owner/invites',{issuer:f.identity.origin,subject,confirm:'invite'});assert.equal(inv.status,201);
  const c=f.client();await c.login(subject,inv.json.inviteToken);members.push(c);
 }
 const a=await members[0].request('PUT','/api/v1/settings',{schemaVersion:1,values:{language:'vi'}},{'If-Match':'"r0"'});assert.equal(a.status,200);
 const b=await members[1].request('GET','/api/v1/settings');assert.deepEqual(b.json.values,{});
 assert.equal((await members[0].request('GET','/api/v1/owner/invites')).status,403);
 assert.equal((await members[0].request('POST','/api/v1/logout',{}, {'x-csrf-token':'bad'})).status,403);
 assert.equal((await members[0].request('POST','/api/v1/logout',{})).status,200);
 assert.equal((await members[0].request('GET','/api/v1/me')).status,401);
 assert.equal((await members[1].request('GET','/api/v1/me')).status,200);
 assert.ok(f.logs.every(r=>Object.keys(r).sort().join(',')==='method,route,status'));
 // Running host serves verified bytes held in memory despite a disk replacement.
 writeFileSync(resolve(built.directory,'public'+png.url),'replaced');const retained=await f.request('GET',png.url);
 assert.equal(hash(retained.raw),png.sha256);
});
