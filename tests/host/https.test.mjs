import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, symlinkSync, linkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { connect } from 'node:tls';
import { createHost } from '../../src/host/server.mjs';
import { loadManifest } from '../../src/host/manifest.mjs';
import { digest } from '../../src/host/core.mjs';
import { start, fixture, ca, SecureClient } from './helpers.mjs';

function privateResponse(r) {
  assert.match(r.headers['cache-control'],/no-store/);
  assert.equal(r.headers['x-arch-public'],undefined);assert.equal(r.headers['x-arch-build'],undefined);
  assert.equal(r.headers['cross-origin-opener-policy'],'same-origin');
  assert.equal(r.headers['cross-origin-embedder-policy'],'require-corp');
  assert.equal(r.headers['cross-origin-resource-policy'],'same-origin');
}
test('WEB-01 HTTPS navigation, module/worker/WASM/font MIME and isolation headers; public cache policies',async t=>{
  const f=await start(t);
  for(const a of f.manifest.assets) {
    const r=await f.request('GET',a.url);
    assert.equal(r.status,200);assert.equal(r.headers['content-type'],a.mime);
    assert.equal(digest(r.raw),a.sha256);
    assert.equal(r.headers['cross-origin-opener-policy'],'same-origin');
    assert.equal(r.headers['cross-origin-embedder-policy'],'require-corp');
    assert.equal(r.headers['cross-origin-resource-policy'],'same-origin');
    assert.equal(r.headers['x-content-type-options'],'nosniff');
    assert.match(r.headers['content-security-policy'],/wasm-unsafe-eval/);
    assert.ok(!r.headers['content-security-policy'].includes("'unsafe-eval'"));
    assert.ok(!r.headers['content-security-policy'].includes("'unsafe-inline'"));
  }
  const a=await f.request('GET',f.wasmAsset.url);
  assert.match(a.headers['cache-control'],/public, max-age=31536000, immutable/);
  const navigation=await f.request('GET','/');
  assert.equal(navigation.status,200);assert.match(navigation.headers['cache-control'],/max-age=0, must-revalidate/);
  const conditional=await f.request('GET',f.wasmAsset.url,undefined,{'if-none-match':a.headers.etag});
  assert.equal(conditional.status,304);assert.equal(conditional.raw.length,0);
  assert.equal(conditional.headers['cross-origin-embedder-policy'],'require-corp');
  const head=await f.request('HEAD',f.wasmAsset.url);
  assert.equal(head.status,200);assert.equal(head.raw.length,0);assert.equal(Number(head.headers['content-length']),f.wasmAsset.bytes);
  const params=await f.request('GET','/?invite=synthetic-sensitive-query');assert.equal(params.status,200);privateResponse(params);
  assert.ok(!JSON.stringify(f.records).includes('synthetic-sensitive-query'));
});
test('SEC-01 raw traversal, encoded paths, dotfiles, repo rooms, unknown MIME/SVG/maps and roots never disclose',async t=>{
  const f=await start(t);
  writeFileSync(join(f.webroot,'unlisted.json'),'SYNTHETIC_SECRET_NOT_PUBLIC');
  for(const path of ['/../AGENTS.md','/%2e%2e/AGENTS.md','/%252e%252e/AGENTS.md','/a/../index.html','/a/%2e%2e/index.html',
    '/%69ndex.html','//index.html','/index.html/','/index.html.','/index.html::$DATA','/C:/Windows/win.ini',
    '/.env','/.git/config','/.toolchain/','/tmp/reviews/codex/runs/','/credentials/key.json','/AGENTS.md','/docs/',
    '/unlisted.json','/app.mjs.map','/x.svg','/x.exe','/a%5cb','/a\\b','/api%2fv1/me','/api/v1/%2e%2e','/CON','/index.html%00']) {
    const r=await f.request('GET',path);assert.ok([400,404].includes(r.status),'denied '+path);
    privateResponse(r);assert.ok(!r.raw.includes(Buffer.from('SYNTHETIC_SECRET_NOT_PUBLIC')));
    assert.ok(!r.raw.toString().includes(f.webroot));
  }
  assert.equal((await f.request('GET','/unknown-route')).status,404);
  assert.equal((await f.request('GET','/settings')).status,200);
});
test('SEC-01 Host/Origin/Fetch Metadata, range, methods, SW registration boundaries',async t=>{
  const f=await start(t);
  assert.equal((await f.request('GET','/',undefined,{host:'evil.invalid'})).status,403);
  assert.equal((await f.request('GET','/app.mjs',undefined,{origin:'https://evil.invalid'})).status,403);
  assert.equal((await f.request('GET','/app.mjs',undefined,{'sec-fetch-site':'cross-site'})).status,403);
  assert.equal((await f.request('GET','/',undefined,{'sec-fetch-site':'cross-site','sec-fetch-mode':'navigate'})).status,200);
  assert.equal((await f.request('POST','/',{})).status,405);
  assert.equal((await f.request('GET','/app.mjs',undefined,{range:'bytes=0-8'})).status,416);
  assert.equal((await f.request('GET','/app.mjs',undefined,{'service-worker':'script'})).status,403);
  const sw=await f.request('GET','/host-sw.js',undefined,{'service-worker':'script'});
  assert.equal(sw.status,200);privateResponse(sw);assert.equal(sw.headers['service-worker-allowed'],'/');
  assert.equal((await f.request('GET','/api/v1/health',undefined,{'service-worker':'script'})).status,403);
});
test('SEC-01 manifest rejects escape/MIME/hash/source maps/reserved paths and noncanonical URLs',()=>{
  const mutate=[
    f=>{f.manifest.assets[0].file='../outside.wasm';},
    f=>{f.manifest.assets[0].sha256='0'.repeat(64);},
    f=>{f.manifest.assets[0].mime='text/html';},
    f=>{f.manifest.assets[0].url='/tmp/private.wasm';},
    f=>{f.manifest.assets[0].url='/api/v1/health';},
    f=>{f.manifest.assets[0].url='/%77.wasm';},
    f=>{f.manifest.assets.push({...f.manifest.assets[0]});},
    f=>{f.manifest.assets[0].url='/bad.wasm';}, // immutable URL lacks SHA
    f=>{f.add('active.svg','<svg onload="alert(1)"/>');},
    f=>{f.add('debug.js','//# sourceMappingURL=data:secret');},
    f=>{f.manifest.navigations['/api/v1/health']='/index.html';},
    f=>{f.manifest.navigations['/']='/app.mjs';}
  ];
  for(const change of mutate){const f=fixture('bad-manifest');change(f);f.save();assert.throws(()=>createHost(f.config));}
});
test('SEC-01 symlink file, junction root, hardlink and out-of-root TLS file rejected',()=>{
  const f=fixture('link-manifest');
  const outside=join(f.root,'outside.json');writeFileSync(outside,'{"private":true}');
  symlinkSync(f.root,join(f.webroot,'escape'),'junction');
  f.manifest.assets.push({url:'/leak.json',file:'escape/outside.json',bytes:16,sha256:digest(readFileSync(outside)),mime:'application/json; charset=utf-8',cache:'revalidate'});
  f.save();assert.throws(()=>createHost(f.config));
  const hard=fixture('hardlink-manifest');linkSync(outside,join(hard.webroot,'hard.json'));
  hard.manifest.assets.push({url:'/hard.json',file:'hard.json',bytes:16,sha256:digest(readFileSync(outside)),mime:'application/json; charset=utf-8',cache:'revalidate'});
  hard.save();assert.throws(()=>createHost(hard.config));
  const alias=join(f.root,'public-alias');symlinkSync(hard.webroot,alias,'junction');
  assert.throws(()=>createHost({...hard.config,webroot:alias}));
  assert.throws(()=>createHost({...hard.config,tlsKeyPath:join(hard.webroot,'app.mjs')}));
});
test('SEC-01 verified public bytes stay frozen despite later file changes',async t=>{
  const f=await start(t);
  writeFileSync(join(f.webroot,'public.json'),'{"secret":"mutated-after-start"}');
  const r=await f.request('GET','/public.json');assert.equal(r.json.publicFixture,true);assert.equal(r.json.secret,undefined);
});
test('SEC-01 explicit static memory and request/response size bounds',async t=>{
  const fixtureCase=fixture('limits');
  assert.throws(()=>createHost({...fixtureCase.config,maxAssetBytes:16}));
  assert.throws(()=>createHost({...fixtureCase.config,maxPublicBytes:16}));
  let count=0;
  const f=await start(t,{config:{maxRequestBytes:16,maxResponseBytes:32},handler:(req,res)=>{count++;req.resume();res.end('x'.repeat(64));}});
  const tooBig=await f.request('POST','/api/v1/settings','x'.repeat(17));
  assert.equal(tooBig.status,413);assert.equal(count,0);privateResponse(tooBig);
  const response=await f.request('GET','/api/v1/me');assert.equal(response.status,502);assert.equal(count,1);privateResponse(response);
});
test('SEC-01 exact API method/path/body and session security headers preserved; no forwarded identity trust',async t=>{
  let received;
  const f=await start(t,{handler:async(req,res)=>{
    const chunks=[];for await(const c of req)chunks.push(c);
    received={headers:req.headers,method:req.method,url:req.url,body:Buffer.concat(chunks).toString()};
    res.setHeader('set-cookie',['__Host-arch_sid=synthetic; Secure; HttpOnly; SameSite=Lax; Path=/','__Host-arch_oidc=; Secure; HttpOnly; Path=/; Max-Age=0']);
    res.setHeader('cache-control','public, max-age=99999');
    res.setHeader('x-arch-build','malicious-upstream');
    res.setHeader('content-type','application/json');
    res.end('{"ok":true}');
  }});
  const r=await f.request('PUT','/api/v1/settings?scope=user',{a:1},{origin:f.origin,cookie:'__Host-arch_sid=synthetic',
    'x-csrf-token':'synthetic-csrf','if-match':'"r1"','idempotency-key':'synthetic-idempotency','forwarded':'proto=http;host=evil.invalid',
    'x-forwarded-host':'evil.invalid','x-forwarded-proto':'http','x-forwarded-for':'1.2.3.4','x-user-id':'attacker','x-auth-user':'owner'});
  assert.equal(r.status,200);privateResponse(r);
  assert.equal(received.headers.host,new URL(f.origin).host);assert.equal(received.headers.origin,f.origin);
  assert.equal(received.headers.cookie,'__Host-arch_sid=synthetic');assert.equal(received.headers['x-csrf-token'],'synthetic-csrf');
  assert.equal(received.headers['if-match'],'"r1"');assert.equal(received.headers['idempotency-key'],'synthetic-idempotency');
  assert.equal(received.method,'PUT');assert.equal(received.url,'/api/v1/settings?scope=user');assert.equal(received.body,'{"a":1}');
  for(const k of ['forwarded','x-forwarded-host','x-forwarded-for','x-forwarded-proto','x-user-id','x-auth-user'])assert.equal(received.headers[k],undefined);
  assert.equal(r.headers['set-cookie'].length,2);
  assert.ok(!JSON.stringify(f.records).includes('synthetic-csrf'));
});
test('SEC-01 upstream timeout/disconnect on write is unknown, no replay; concurrency is bounded',async t=>{
  let calls=0;
  const f=await start(t,{config:{upstreamDeadlineMs:120,maxConcurrent:1},handler:req=>{calls++;req.resume();}});
  const first=f.request('POST','/api/v1/settings',{private:'never-log'});
  while(calls===0)await new Promise(r=>setTimeout(r,2));
  const second=await f.request('GET','/api/v1/me');assert.equal(second.status,503);
  const result=await first;assert.equal(result.status,504);assert.equal(result.json.error.code,'API_DELIVERY_UNKNOWN');
  await new Promise(r=>setTimeout(r,180));assert.equal(calls,1);
  assert.ok(!JSON.stringify(f.records).includes('never-log'));
});
test('SEC-01 redirect pass-through is private and same-origin only',async t=>{
  const f=await start(t,{handler:(req,res)=>{req.resume();res.statusCode=303;res.setHeader('location',req.url.includes('evil')?'https://evil.invalid/':'/');res.end();}});
  const good=await f.request('GET','/api/v1/auth/callback?state=synthetic');
  assert.equal(good.status,303);assert.equal(good.headers.location,'/');privateResponse(good);
  const bad=await f.request('GET','/api/v1/auth/evil');
  assert.equal(bad.status,502);privateResponse(bad);assert.equal(bad.headers.location,undefined);
});
test('ACC-01 actual frozen backend OIDC/PKCE cookie flow through HTTPS; CSRF, tamper, logout and auth headers',async t=>{
  const f=await start(t,{backend:true}),client=new SecureClient(f);
  const login=await client.login();
  privateResponse(login.start);privateResponse(login.callback);privateResponse(login.me);
  assert.equal(login.callback.headers.location,'/');
  for(const c of login.callback.headers['set-cookie'])assert.match(c,/HttpOnly; Secure; SameSite=Lax/);
  assert.equal(login.me.json.user.role,'owner');
  const bad=await client.request('POST','/api/v1/logout',{}, {'x-csrf-token':'bad'});assert.equal(bad.status,403);
  const crossed=await client.request('GET','/api/v1/me',undefined,{origin:'https://evil.invalid'});assert.equal(crossed.status,403);
  const forged=await f.request('GET','/api/v1/me',undefined,{'x-user-id':login.me.json.user.id,'x-forwarded-user':'owner'});
  assert.equal(forged.status,401);
  const tamper=await client.request('GET','/api/v1/me',undefined,{cookie:'__Host-arch_sid=tampered'});
  assert.equal(tamper.status,401);
  const out=await client.request('POST','/api/v1/logout',{});assert.equal(out.status,200);
  assert.equal((await client.request('GET','/api/v1/me')).status,401);
});
test('SEC-01 malformed duplicate Host rejected by actual TLS HTTP parser without disclosure',async t=>{
  const f=await start(t);
  const response=await new Promise((resolve,reject)=>{
    const s=connect({host:'127.0.0.1',port:new URL(f.origin).port,servername:'localhost',ca},()=>s.end('GET / HTTP/1.1\r\nHost: '+new URL(f.origin).host+'\r\nHost: evil.invalid\r\nConnection: close\r\n\r\n'));
    let data='';s.on('data',b=>data+=b);s.on('end',()=>resolve(data));s.on('error',reject);
  });
  assert.match(response,/HTTP\/1.1 400/);assert.ok(!response.includes('<html'));
});

test('ACC-01 HTTPS owner and two members keep settings isolated; suspension revokes an existing cookie immediately',async t=>{
  const f=await start(t,{backend:true}),owner=new SecureClient(f);
  await owner.login();
  const clients=[];
  for(const subject of ['member-a','member-b']){
    const invite=await owner.request('POST','/api/v1/owner/invites',{issuer:f.idp.origin,subject,confirm:'invite'});
    assert.equal(invite.status,201);
    const c=new SecureClient(f);const login=await c.login(subject,invite.json.inviteToken);
    clients.push({c,user:login.me.json.user});
  }
  const [a,b]=clients;
  assert.equal((await a.c.request('PUT','/api/v1/settings',{schemaVersion:1,values:{language:'vi'}},{'if-match':'"r0"'})).status,200);
  assert.equal((await b.c.request('GET','/api/v1/settings')).json.values.language,undefined);
  const idor=await b.c.request('GET','/api/v1/settings?userId='+a.user.id);
  assert.equal(idor.json.values.language,undefined,'query must not select another owner');
  assert.equal((await b.c.request('GET','/api/v1/owner/users')).status,403);
  const suspended=await owner.request('POST','/api/v1/owner/users/'+a.user.id,{action:'suspend',confirm:'suspend:'+a.user.id});
  assert.equal(suspended.status,200);
  const revoked=await a.c.request('GET','/api/v1/me');assert.equal(revoked.status,401);privateResponse(revoked);
  assert.equal((await b.c.request('GET','/api/v1/me')).status,200);
});
test('SEC-01 explicit credential/config cache names and repository root rejected even if offered in a manifest',()=>{
  for(const file of ['credentials.json','api-token.json','vault.json','key.json','oidc.json','host-config.json','package.json']){
    const f=fixture('sensitive-name');f.add(file,'{"syntheticSecret":true}');f.save();
    assert.throws(()=>createHost(f.config));
  }
  const f=fixture('repository-root');
  assert.throws(()=>createHost({...f.config,webroot:process.env.PROJECT_ROOT}));
});
test('SEC-01 CL+TE smuggling and absolute-form targets rejected before upstream; slow body has a total deadline',async t=>{
  let requests=0;
  const f=await start(t,{config:{requestDeadlineMs:120},handler:(req,res)=>{requests++;req.resume();res.end('{}');}});
  async function raw(text){
    return new Promise((resolve,reject)=>{
      let data='';
      const socket=connect({host:'127.0.0.1',port:new URL(f.origin).port,servername:'localhost',ca},()=>socket.write(text));
      const timer=setTimeout(()=>{socket.destroy();reject(new Error('raw TLS test deadline'));},3000);
      socket.on('data',b=>{data+=b;if(data.includes('\r\n\r\n')){clearTimeout(timer);socket.destroy();resolve(data);}});
      socket.on('error',e=>{clearTimeout(timer);reject(e);});
    });
  }
  const host=new URL(f.origin).host;
  const smuggle=await raw('POST /api/v1/settings HTTP/1.1\r\nHost: '+host+'\r\nContent-Length: 2\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n');
  assert.match(smuggle,/HTTP\/1.1 400/);assert.equal(requests,0);
  const absolute=await raw('GET https://'+host+'/api/v1/health HTTP/1.1\r\nHost: '+host+'\r\n\r\n');
  assert.match(absolute,/HTTP\/1.1 400/);assert.equal(requests,0);
  const slow=await raw('POST /api/v1/settings HTTP/1.1\r\nHost: '+host+'\r\nContent-Length: 16\r\nContent-Type: application/json\r\n\r\n{');
  assert.match(slow,/HTTP\/1.1 408/);assert.equal(requests,0);
});
