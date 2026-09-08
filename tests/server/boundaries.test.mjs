import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { defaultPolicy,setup,money,deferred,uid } from './helpers.mjs';
import { Providers } from '../../src/server/providers.mjs';
import { credentialContext } from '../../src/server/vault.mjs';
import { endpoint,publicIPv4 } from '../../src/server/network.mjs';
import { resolveSettings } from '../../src/server/settings.mjs';
test('AI-02: tampered GCM ciphertext fails closed; disable preserves valid vault AAD and blocks key use',async t=>{
  const f=await setup(t),c=await f.a.connect();await f.a.budget();
  const row=f.app.credentials.owned(f.a.user.id,c.id),v=JSON.parse(row.sealed);
  v.tag=(v.tag[0]==='A'?'B':'A')+v.tag.slice(1);
  f.app.store.run('UPDATE credentials SET sealed=? WHERE id=?',JSON.stringify(v),c.id);
  assert.equal((await f.a.request('POST','/api/v1/ai/credentials/'+c.id+'/check',{version:c.version})).json.error.code,'VAULT_UNAVAILABLE');
  f.app.store.run('UPDATE credentials SET sealed=? WHERE id=?',row.sealed,c.id);
  const pending=await f.a.prepare(c);await f.a.submit(pending.job);
  const disabled=await f.a.ok('POST','/api/v1/ai/credentials/'+c.id+'/disable',{version:c.version,confirm:'disable:'+c.id});
  assert.equal(disabled.status,'disabled');assert.equal((await f.a.ok('GET','/api/v1/ai/jobs/'+pending.job.id)).job.state,'unknown');
  const d=f.app.credentials.owned(f.a.user.id,c.id),plain=f.app.credentials.vault.open(credentialContext(d),d.key_version,d.sealed);
  assert.ok(plain.toString()===c.secret);plain.fill(0);
  const prepare=await f.a.request('POST','/api/v1/ai/jobs',f.a.input(c),{'Idempotency-Key':uid()});assert.equal(prepare.json.error.code,'CONNECT_YOUR_AI');assert.equal(f.provider.calls.length,1);
  await f.a.ok('DELETE','/api/v1/ai/credentials/'+c.id,{version:disabled.version,confirm:'revoke:'+c.id});
  assert.equal(f.app.store.get('SELECT sealed FROM credentials WHERE id=?',c.id).sealed,null);
});
test('AI-02/ACC-01: delayed credential verification cannot reactivate replaced or suspended key',async t=>{
  const f=await setup(t),c=await f.a.connect(),gate=deferred();f.provider.checkGate=gate;
  const pending=f.a.request('POST','/api/v1/ai/credentials/'+c.id+'/check',{version:c.version});
  while(f.provider.checks<2)await new Promise(r=>setTimeout(r,5));
  const secret=randomBytes(32).toString('base64url');
  const changed=await f.a.ok('PUT','/api/v1/ai/credentials/'+c.id,{key:secret,label:'Changed while checking',version:c.version});
  gate.resolve();assert.equal((await pending).json.error.code,'CREDENTIAL_VERSION_CHANGED');
  assert.equal((await f.a.ok('GET','/api/v1/ai/credentials')).credentials[0].status,'unchecked');
  const next=deferred();f.provider.checkGate=next;
  const check=f.a.request('POST','/api/v1/ai/credentials/'+c.id+'/check',{version:changed.version});
  while(f.provider.checks<3)await new Promise(r=>setTimeout(r,5));
  await f.owner.ok('POST','/api/v1/owner/users/'+f.a.user.id,{action:'suspend',confirm:'suspend:'+f.a.user.id});
  next.resolve();assert.equal((await check).status,401);assert.equal(f.app.store.get('SELECT status FROM credentials WHERE id=?',c.id).status,'unchecked');
});
test('ACC-03: non-AI HTTP concurrency/rate admission applies independently per user',async t=>{
  const f=await setup(t),c=await f.a.connect(),p=defaultPolicy();
  p.quotas.protectedConcurrency=1;p.quotas.protectedRequestsPerMinute=3;
  await f.owner.ok('PUT','/api/v1/owner/policy',p,{'If-Match':'"r1"'});f.advance(60000);
  const gate=deferred();f.provider.checkGate=gate;
  const pending=f.a.request('POST','/api/v1/ai/credentials/'+c.id+'/check',{version:c.version});
  while(f.provider.checks<2)await new Promise(r=>setTimeout(r,5));
  const denied=await f.a.request('GET','/api/v1/settings');assert.equal(denied.status,429);assert.equal(denied.json.error.details.dimension,'http-concurrency');
  assert.equal((await f.b.request('GET','/api/v1/settings')).status,200);
  gate.resolve();assert.equal((await pending).status,200);
  await f.a.ok('GET','/api/v1/settings');await f.a.ok('GET','/api/v1/settings');
  const rate=await f.a.request('GET','/api/v1/settings');assert.equal(rate.status,429);assert.equal(rate.json.error.details.dimension,'http-requests');
});
test('ACC-03: byte sync and conflict storage quotas rollback without corrupting settings',async t=>{
  const f=await setup(t),p=defaultPolicy();p.quotas.syncBytesPerDay=40;
  await f.owner.ok('PUT','/api/v1/owner/policy',p,{'If-Match':'"r1"'});
  await f.a.ok('PUT','/api/v1/settings',{schemaVersion:1,values:{language:'vi'}},{'If-Match':'"r0"'});
  await f.a.ok('PUT','/api/v1/settings',{schemaVersion:1,values:{language:'en'}},{'If-Match':'"r1"'});
  const denied=await f.a.request('PUT','/api/v1/settings',{schemaVersion:1,values:{language:'fr'}},{'If-Match':'"r2"'});
  assert.equal(denied.json.error.details.dimension,'sync-bytes');assert.equal((await f.a.ok('GET','/api/v1/settings')).values.language,'en');
  p.quotas.syncBytesPerDay=10000;p.quotas.storageBytes=20;
  await f.owner.ok('PUT','/api/v1/owner/policy',p,{'If-Match':'"r2"'});
  const conflict=await f.a.request('PUT','/api/v1/settings',{schemaVersion:1,values:{language:'vi'}},{'If-Match':'"r0"'});
  assert.equal(conflict.json.error.details.dimension,'storage-bytes');assert.equal((await f.a.ok('GET','/api/v1/settings/conflicts')).conflicts.length,0);
  assert.equal((await f.a.ok('GET','/api/v1/settings')).revision,2);
});
test('AI-03: system monetary cap, integer units, bounded quotes, and quote expiry are enforced',async t=>{
  const p=defaultPolicy();p.ai.money=[{...money(500),perOperationMicros:50}];
  const f=await setup(t,{policy:p}),c=await f.a.connect();await f.a.budget();
  const prepared=await f.a.prepare(c);
  assert.equal((await f.a.request('POST','/api/v1/ai/jobs/'+prepared.job.id+'/submit',{quoteHash:prepared.job.quoteHash,consent:true})).json.error.details.dimension,'money-operation');
  assert.equal((await f.a.request('PUT','/api/v1/ai/budget',{money:[{...money(),perDayMicros:1.5}]},{'If-Match':'"r1"'})).status,400);
  f.advance(600000);
  assert.equal((await f.a.request('POST','/api/v1/ai/jobs/'+prepared.job.id+'/submit',{quoteHash:prepared.job.quoteHash,consent:true})).json.error.code,'QUOTE_EXPIRED');
  assert.equal(f.provider.calls.length,0);
  f.provider.cap=NaN;assert.equal((await f.a.request('POST','/api/v1/ai/jobs',f.a.input(c),{'Idempotency-Key':uid()})).status,400);
  assert.equal(f.app.store.get('SELECT count(*) n FROM jobs WHERE user_id=?',f.a.user.id).n,1);
});
test('AI-03: delivery timeout keeps reservation; accounting with unknown actual never silently becomes zero',async t=>{
  const f=await setup(t,{deliveryTimeoutMs:60}),c=await f.a.connect();await f.a.budget();
  const p=await f.a.prepare(c);await f.a.submit(p.job);await f.a.poll(p.job,'unknown');
  const estimate=f.provider.result({actual:null});f.provider.complete(p.job.id,estimate);
  const done=await f.a.poll(p.job,'succeeded');assert.equal(done.accounting.actualMicros,null);assert.equal(done.accounting.basis,'estimated');
  const actual=f.provider.result({actual:45,artifact:false});
  const reconciled=await f.app.ai.settle('test-provider',p.job.id,actual);assert.equal(reconciled.accounting.actualMicros,45);
  await assert.rejects(()=>f.app.ai.settle('test-provider',p.job.id,{...actual,actualMicros:0}),/SETTLEMENT_CONFLICT/);
});
test('SEC-01/AI-02: test adapter cannot register for production; endpoints reject SSRF, credentials and redirects',async t=>{
  const f=await setup(t);
  assert.throws(()=>new Providers([f.provider]),/PROVIDER_REGISTRATION_INVALID/);
  for(const url of ['http://example.com/x','https://127.0.0.1/x','https://[::1]/x','https://example.com:444/x','https://user:secret@example.com/x','https://example.com/x?key=x'])assert.throws(()=>endpoint(url));
  for(const ip of ['127.0.0.1','10.1.1.1','192.168.1.9','169.254.169.254','172.16.0.1','100.64.0.1','198.18.1.1','203.0.113.1','0.0.0.0','255.255.255.255','::1'])assert.equal(publicIPv4(ip),false);
  assert.equal(publicIPv4('8.8.8.8'),true);
  assert.equal((await f.a.request('POST','/api/v1/ai/callback',{})).status,404);
});
test('ACC-03: resolution preserves project snapshot and user colors when preset omits them',()=>{
  const policy={version:1,allowedProviders:['allowed']},user={color:'red',slot:3,height:2},preset={height:4};
  const current=resolveSettings({product:{color:'blue'},user,preset,policy});
  assert.equal(current.values.color.value,'red');assert.equal(current.values.slot.value,3);assert.equal(current.values.height.value,4);
  const snapshot={height:7,color:'yellow'};const saved=resolveSettings({user,preset,project:snapshot,policy});
  assert.equal(saved.values.height.value,7);assert.equal(saved.values.height.source,'project-snapshot');assert.deepEqual(snapshot,{height:7,color:'yellow'});
});

test('ACC-04/AI-04: same browser switch to B cannot see late result from A; cost filters accept UTC milliseconds',async t=>{
  const f=await setup(t),c=await f.a.connect();await f.a.budget();
  const originalUser=f.a.user.id,p=await f.a.prepare(c);await f.a.submit(p.job);
  await f.a.login('member-b');assert.equal(f.a.user.id,f.b.user.id);assert.notEqual(f.a.user.id,originalUser);
  f.provider.complete(p.job.id);await new Promise(r=>setTimeout(r,20));
  assert.equal((await f.a.request('GET','/api/v1/ai/jobs/'+p.job.id)).status,404);
  await f.a.login('member-a');
  const from=f.clock()-1000,to=f.clock()+1000;
  const costs=await f.a.ok('GET','/api/v1/ai/costs?from='+from+'&to='+to+'&providerId=test-provider&jobId='+p.job.id);
  assert.equal(costs.jobs.length,1);assert.equal(costs.jobs[0].ownerId,originalUser);
});
test('ACC-01: invitation listings contain management metadata only and require owner',async t=>{
  const f=await setup(t),response=await f.owner.ok('GET','/api/v1/owner/invites');
  assert.ok(response.invites.length>=2);assert.ok(response.invites.every(x=>x.id&&x.user_id&&x.expires));
  assert.ok(!JSON.stringify(response).includes('token'));
  assert.equal((await f.a.request('GET','/api/v1/owner/invites')).status,403);
});

test('AI-02/SEC-01: a redirect never forwards credentials, even to another loopback path',async()=>{
  const { createServer }=await import('node:http');
  const { boundedRequest }=await import('../../src/server/network.mjs');
  let forwarded=0,received=0;
  const server=createServer((req,res)=>{
    if(req.url==='/sink')forwarded++;
    received++;
    res.statusCode=302;res.setHeader('Location','/sink');res.end();
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const url='http://127.0.0.1:'+server.address().port+'/redirect';
    await assert.rejects(()=>boundedRequest(url,{testOnly:true,headers:{authorization:'Bearer synthetic-test-only'}}),/UPSTREAM_REJECTED/);
    assert.equal(received,1);assert.equal(forwarded,0);
  } finally{server.closeIdleConnections();await new Promise(resolve=>server.close(resolve));}
});

