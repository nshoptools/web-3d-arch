import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,createPublicKey,verify } from 'node:crypto';
import { SID } from '../../src/server/app.mjs';
import { setup,Client,uid,defaultPolicy,deferred } from './helpers.mjs';
test('ACC-01/SEC-01: loopback OIDC, secure cookies, tamper, member rights and CSRF',async t=>{
  const f=await setup(t);
  assert.equal(f.owner.user.role,'owner');assert.equal(f.a.user.role,'member');assert.notEqual(f.a.user.id,f.b.user.id);
  const response=f.responses.find(r=>r.headers.getSetCookie().some(x=>x.startsWith(SID+'=')&&!x.startsWith(SID+'=;')));
  const c=response.headers.getSetCookie().find(x=>x.startsWith(SID+'='));
  for(const flag of ['Secure','HttpOnly','SameSite=Lax','Path=/','Max-Age=43200'])assert.ok(c.includes(flag));
  const attacker=new Client(f);attacker.cookies.set(SID,randomBytes(32).toString('base64url'));
  assert.equal((await attacker.request('GET','/api/v1/me')).status,401);
  attacker.cookies.set(SID,f.a.cookies.get(SID).slice(0,-1)+'!');
  assert.equal((await attacker.request('GET','/api/v1/me')).status,401);
  assert.equal((await f.a.request('GET','/api/v1/owner/users')).status,403);
  assert.equal((await f.a.request('PUT','/api/v1/settings',{schemaVersion:1,values:{}},{'If-Match':'"r0"','x-csrf-token':'forged'})).status,403);
  assert.equal((await f.a.request('POST','/api/v1/logout',{}, {Origin:'https://attacker.example'})).status,403);
  const read=await f.a.request('GET','/api/v1/settings');
  assert.match(read.headers.get('cache-control'),/no-store/);assert.equal(read.headers.get('cross-origin-opener-policy'),'same-origin');assert.equal(read.headers.get('cross-origin-embedder-policy'),'require-corp');
});
test('ACC-01: matching invite identity, seven-day expiry, single use, revoke and resend',async t=>{
  const f=await setup(t),guest=new Client(f);
  const invite=await f.owner.ok('POST','/api/v1/owner/invites',{issuer:f.idp.origin,subject:'new-user',confirm:'invite'},{},201);
  assert.equal(invite.expiresAt-f.clock(),7*86400000);
  const start=await guest.ok('POST','/api/v1/auth/start',{deviceId:guest.deviceId,inviteToken:invite.inviteToken});
  assert.equal((await guest.request('GET',f.idp.issue('other-identity',start.authorizationUrl))).status,403);
  assert.equal((await guest.request('GET','/api/v1/me')).status,401);
  await f.owner.ok('POST','/api/v1/owner/invites/'+invite.inviteId+'/revoke',{confirm:'revoke:'+invite.inviteId});
  const deniedStart=await guest.ok('POST','/api/v1/auth/start',{deviceId:guest.deviceId,inviteToken:invite.inviteToken});
  assert.equal((await guest.request('GET',f.idp.issue('new-user',deniedStart.authorizationUrl))).status,403);
  const fresh=await f.owner.ok('POST','/api/v1/owner/invites/'+invite.inviteId+'/resend',{confirm:'resend:'+invite.inviteId});
  await guest.login('new-user',fresh.inviteToken);assert.equal(guest.user.id,invite.userId);
  const replay=new Client(f),rs=await replay.ok('POST','/api/v1/auth/start',{deviceId:replay.deviceId,inviteToken:fresh.inviteToken});
  assert.equal((await replay.request('GET',f.idp.issue('new-user',rs.authorizationUrl))).status,403);
  const exp=await f.owner.ok('POST','/api/v1/owner/invites',{issuer:f.idp.origin,subject:'late-user',confirm:'invite'},{},201);
  f.advance(7*86400000);
  const late=new Client(f),ls=await late.ok('POST','/api/v1/auth/start',{deviceId:late.deviceId,inviteToken:exp.inviteToken});
  assert.equal((await late.request('GET',f.idp.issue('late-user',ls.authorizationUrl))).status,403);
});
test('ACC-01: reject issuer/audience/nonce/signature tamper, state replay and browser mismatch',async t=>{
  const f=await setup(t);
  for(const [overrides,bad]of [[{iss:'https://wrong.example'},false],[{aud:'wrong-client'},false],[{nonce:'wrong'},false],[{},true],[{exp:1},false],[{aud:['test-client','another']},false]]) {
    const c=new Client(f),s=await c.ok('POST','/api/v1/auth/start',{deviceId:c.deviceId});
    assert.equal((await c.request('GET',f.idp.issue('member-a',s.authorizationUrl,overrides,bad))).status,401);
  }
  const c=new Client(f),s=await c.ok('POST','/api/v1/auth/start',{deviceId:c.deviceId}),callback=f.idp.issue('member-a',s.authorizationUrl);
  assert.equal((await new Client(f).request('GET',callback)).status,400);
  assert.equal((await c.request('GET',callback)).status,303);assert.equal((await c.request('GET',callback)).status,400);
});
test('ACC-01: idle and absolute expiry, expired-cookie login recovery and authVersion revoke',async t=>{
  const f=await setup(t);
  f.advance(3600000);assert.equal((await f.a.request('GET','/api/v1/me')).status,401);await f.a.login('member-a');
  const start=f.clock();
  for(let n=1;n<=24;n++){f.setTime(start+n*30*60000);assert.equal((await f.a.request('GET','/api/v1/me')).status,n===24?401:200);}
  await f.owner.login('owner-subject');await f.a.login('member-a');
  await f.owner.ok('POST','/api/v1/owner/users/'+f.a.user.id,{action:'revoke-sessions',confirm:'revoke-sessions:'+f.a.user.id});
  assert.equal((await f.a.request('GET','/api/v1/me')).status,401);
  await f.a.login('member-a');assert.equal(f.a.user.authVersion,3);
});
test('ACC-01: last active owner, explicit confirmation, recent OIDC reauth and suspended identity',async t=>{
  const f=await setup(t),oid=f.owner.user.id,aid=f.a.user.id,bid=f.b.user.id;
  for(const action of ['suspend','delete'])assert.equal((await f.owner.request('POST','/api/v1/owner/users/'+oid,{action,confirm:action+':'+oid})).json.error.code,'LAST_OWNER');
  assert.equal((await f.owner.request('POST','/api/v1/owner/users/'+aid,{action:'role',role:'owner',confirm:'role:'+aid})).json.error.code,'REAUTH_REQUIRED');
  await f.owner.login('owner-subject',null,true);
  assert.equal((await f.owner.request('POST','/api/v1/owner/users/'+oid,{action:'role',role:'member',confirm:'role:'+oid})).json.error.code,'LAST_OWNER');
  await f.owner.ok('POST','/api/v1/owner/users/'+aid,{action:'role',role:'owner',confirm:'role:'+aid});
  assert.ok((await f.owner.ok('GET','/api/v1/owner/audit')).events.some(e=>e.action==='user.role.member-to-owner'&&e.target_id===aid&&e.actor_id===oid));
  assert.equal((await f.a.request('GET','/api/v1/me')).status,401);await f.a.login('member-a');assert.equal(f.a.user.role,'owner');
  await f.owner.ok('POST','/api/v1/owner/users/'+bid,{action:'suspend',confirm:'suspend:'+bid});
  assert.equal((await f.b.request('GET','/api/v1/me')).status,401);
  const c=new Client(f),s=await c.ok('POST','/api/v1/auth/start',{deviceId:c.deviceId});
  assert.equal((await c.request('GET',f.idp.issue('member-b',s.authorizationUrl))).status,403);
  await f.owner.ok('POST','/api/v1/owner/users/'+bid,{action:'restore',confirm:'restore:'+bid});await f.b.login('member-b');
});
test('ACC-03/DAT-03: scoped settings and ETag conflicts retain both; import/reset retain keys',async t=>{
  const f=await setup(t),key=await f.a.connect();
  const doc={schemaVersion:1,values:{units:'mm',language:'vi',savedPrompts:['private prompt']}};
  await f.a.ok('PUT','/api/v1/settings',doc,{'If-Match':'"r0"'});
  const incoming={schemaVersion:1,values:{units:'in'}},conflict=await f.a.request('PUT','/api/v1/settings',incoming,{'If-Match':'"r0"'});
  assert.equal(conflict.status,409);assert.deepEqual(conflict.json.error.details.current,doc.values);assert.deepEqual(conflict.json.error.details.incoming,incoming.values);
  assert.equal((await f.a.ok('GET','/api/v1/settings')).values.units,'mm');
  assert.equal((await f.b.ok('GET','/api/v1/settings/conflicts')).conflicts.length,0);
  const cid=conflict.json.error.details.id;
  assert.equal((await f.b.request('DELETE','/api/v1/settings/conflicts/'+cid,{confirm:'discard:'+cid})).status,404);
  await f.a.ok('PUT','/api/v1/settings',{schemaVersion:1,values:{units:'in',language:'vi'},resolveConflictId:cid},{'If-Match':'"r1"'});
  assert.equal((await f.a.ok('GET','/api/v1/settings/conflicts')).conflicts.length,0);
  for(const values of [{ownerId:f.b.user.id},{apiKey:'forbidden'},{mirrorPath:'x'},{designDefaults:{sessionId:'x'}},{drawerState:true}])
    assert.equal((await f.a.request('PUT','/api/v1/settings',{schemaVersion:1,values},{'If-Match':'"r2"'})).status,400);
  await f.a.ok('POST','/api/v1/settings/import',{mode:'merge',confirm:'import:merge',document:{schemaVersion:1,values:{fontSize:18}}},{'If-Match':'"r2"'});
  await f.a.ok('POST','/api/v1/settings/reset',{confirm:'reset-settings'},{'If-Match':'"r3"'});
  const credentials=(await f.a.ok('GET','/api/v1/ai/credentials')).credentials;assert.equal(credentials[0].version,key.version);assert.equal(credentials[0].status,'active');
  assert.deepEqual((await f.a.ok('GET','/api/v1/settings/export')).values,{});
});
test('ACC-03: provider policy blocks/restores without rewriting saved settings',async t=>{
  const f=await setup(t),values={aiSelection:{providerId:'test-provider',modelId:'test-image',modelVersion:'test-model-v1'}};
  await f.a.ok('PUT','/api/v1/settings',{schemaVersion:1,values},{'If-Match':'"r0"'});
  const p=defaultPolicy();p.allowedProviders=[];
  await f.owner.ok('PUT','/api/v1/owner/policy',p,{'If-Match':'"r1"'});
  const v=await f.a.ok('GET','/api/v1/settings');assert.equal(v.blocked[0].code,'policy-blocked');assert.deepEqual(v.values,values);
  await f.owner.ok('PUT','/api/v1/owner/policy',defaultPolicy(),{'If-Match':'"r2"'});
  assert.deepEqual((await f.a.ok('GET','/api/v1/settings')).blocked,[]);
});
test('ACC-04: signed offline lease binds user/device/authVersion and cannot authenticate API',async t=>{
  const f=await setup(t),r=await f.a.ok('POST','/api/v1/offline/lease',{deviceId:f.a.deviceId});
  const p=JSON.parse(Buffer.from(r.lease.payload,'base64url').toString());assert.equal(p.userId,f.a.user.id);assert.equal(p.authVersion,f.a.user.authVersion);assert.equal(p.deviceId,f.a.deviceId);assert.equal(p.expiresAt-p.issuedAt,86400000);
  const key=createPublicKey({key:r.publicKey,format:'jwk'});
  assert.ok(verify(null,Buffer.from(r.lease.payload),key,Buffer.from(r.lease.signature,'base64url')));
  assert.ok(!verify(null,Buffer.from(r.lease.payload+'a'),key,Buffer.from(r.lease.signature,'base64url')));
  assert.equal((await f.a.request('POST','/api/v1/offline/lease',{deviceId:uid()})).status,403);
  const guest=new Client(f);guest.cookies.set(SID,r.lease.payload+'.'+r.lease.signature);assert.equal((await guest.request('GET','/api/v1/me')).status,401);
});
test('ACC-03/SEC-01: size/schema/ETag gates are atomic, no arbitrary endpoint or cloud fake success',async t=>{
  const f=await setup(t);
  assert.equal((await f.a.request('PUT','/api/v1/settings',{schemaVersion:1,values:{language:'vi'}})).status,428);
  assert.equal((await f.a.request('PUT','/api/v1/settings','{"schemaVersion":1,"values":{"__proto__":{"role":"owner"}}}',{'If-Match':'"r0"'})).status,400);
  assert.equal((await f.a.request('PUT','/api/v1/settings','{}',{'content-type':'text/plain','If-Match':'"r0"'})).status,415);
  const p=defaultPolicy();p.quotas.settingsBytes=80;p.quotas.syncBytesPerDay=100;p.quotas.storageBytes=100;
  await f.owner.ok('PUT','/api/v1/owner/policy',p,{'If-Match':'"r1"'});
  const big=await f.a.request('PUT','/api/v1/settings',{schemaVersion:1,values:{savedPrompts:['x'.repeat(100)]}},{'If-Match':'"r0"'});
  assert.equal(big.status,413);assert.equal(big.json.error.details.dimension,'settings-bytes');
  await f.a.ok('PUT','/api/v1/settings',{schemaVersion:1,values:{language:'vi'}},{'If-Match':'"r0"'});
  assert.equal((await f.a.ok('GET','/api/v1/settings')).revision,1);
  assert.equal((await f.a.request('GET','/api/v1/cloud/projects')).json.error.code,'CLOUD_PROJECTS_DISABLED');
  assert.equal((await f.a.request('POST','/api/v1/ai/credentials',{key:'synthetic-key-value',label:'X',providerId:'test-provider',endpointId:'test-endpoint',url:'http://169.254.169.254'})).status,400);
});
