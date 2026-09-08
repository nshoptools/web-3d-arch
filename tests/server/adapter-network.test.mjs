import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer,request as httpRequest } from 'node:http';
import { boundedRequest,createBoundedTransport,publicIPv4 } from '../../src/server/network.mjs';
import { XaiImageAdapter } from '../../src/server/adapters/xai-image.mjs';
import { context,response,generated,modelInfo,hash,deferred } from './adapter-helpers.mjs';
import { MODEL_PATH,GENERATE_PATH } from '../../src/server/adapters/xai-contract.mjs';
async function local(t,handler) {
  const sockets=new Set(),server=createServer(handler);
  server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{for(const s of sockets)s.destroy();await new Promise(resolve=>server.close(resolve));});
  return {server,url:'http://127.0.0.1:'+server.address().port};
}
test('AI-02 network: actual HTTP non-2xx captured boundedly; old callers reject; redirects never followed',async t=>{
  let redirected=0;
  const f=await local(t,(req,res)=>{
    if(req.url==='/redirect'){res.writeHead(307,{location:f.url+'/target'});res.end();return;}
    if(req.url==='/target')redirected++;
    res.writeHead(429,{'content-type':'application/json','x-request-id':'network-request-1'});res.end('{"error":{"code":"quota_exceeded"}}');
  });
  const r=await boundedRequest(f.url+'/error',{testOnly:true,captureStatus:true,maxBytes:64});
  assert.equal(r.statusCode,429);assert.equal(JSON.parse(r.bytes).error.code,'quota_exceeded');
  assert.equal(r.headers['x-request-id'],'network-request-1');
  await assert.rejects(boundedRequest(f.url+'/error',{testOnly:true}),/UPSTREAM_REJECTED/);
  await assert.rejects(boundedRequest(f.url+'/redirect',{testOnly:true,captureStatus:true}),/UPSTREAM_REJECTED/);
  assert.equal(redirected,0);
});

test('AI-02 network: body/declared/chunked response limits, gzip rejection and end-to-end timeout',async t=>{
  let calls=0;
  const f=await local(t,(req,res)=>{
    calls++;
    if(req.url==='/declared'){res.writeHead(200,{'content-length':'500000'});res.end('x');}
    else if(req.url==='/chunked'){res.writeHead(200);res.write('x'.repeat(80));res.end('x'.repeat(80));}
    else if(req.url==='/gzip'){res.writeHead(200,{'content-encoding':'gzip'});res.end('compressed');}
    else if(req.url==='/partial'){res.writeHead(200,{'content-type':'application/json','content-length':'40'});res.write('x');res.socket.destroy();}
    else {res.writeHead(200);res.write('one byte');}
  });
  await assert.rejects(boundedRequest(f.url+'/request',{testOnly:true,method:'POST',body:'abcde',maxRequestBytes:4}),/UPSTREAM_REQUEST_TOO_LARGE/);
  assert.equal(calls,0);
  for(const [path,code]of [['declared','UPSTREAM_TOO_LARGE'],['chunked','UPSTREAM_TOO_LARGE'],['gzip','UPSTREAM_ENCODING_REJECTED'],['partial','UPSTREAM_UNAVAILABLE']])
    await assert.rejects(boundedRequest(f.url+'/'+path,{testOnly:true,maxBytes:100}),new RegExp(code));
  await assert.rejects(boundedRequest(f.url+'/hang',{testOnly:true,timeoutMs:30}),/UPSTREAM_TIMEOUT/);
});

test('AI-02 network: allowlist before DNS, all addresses public, DNS pinned once, cancellation also during DNS',async t=>{
  await local(t,(_req,res)=>res.end());
  let lookups=0,connections=0;
  const never=deferred();
  const transport=createBoundedTransport({resolve4:async()=>{lookups++;return ['1.1.1.1','127.0.0.1'];},https:()=>{connections++;throw new Error('must not connect');}});
  await assert.rejects(transport('https://evil.example/v1',{allowedOrigins:['https://api.x.ai']}),/ENDPOINT_ORIGIN_BLOCKED/);
  assert.equal(lookups,0);
  await assert.rejects(transport('https://api.x.ai/v1',{allowedOrigins:['https://api.x.ai']}),/ENDPOINT_ADDRESS_BLOCKED/);
  assert.equal(connections,0);
  for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','172.16.1.1','192.168.1.1','0.0.0.0','100.64.0.1','198.18.0.1','::1','fc00::1','::ffff:127.0.0.1'])
    assert.equal(publicIPv4(ip),false);
  const slow=createBoundedTransport({resolve4:()=>never.promise,https:()=>{connections++;}});
  await assert.rejects(slow('https://api.x.ai/v1',{timeoutMs:30}),/UPSTREAM_TIMEOUT/);
  const control=new AbortController(),pending=slow('https://api.x.ai/v1',{signal:control.signal,timeoutMs:1000});
  control.abort();await assert.rejects(pending,/UPSTREAM_ABORTED/);assert.equal(connections,0);
});

test('AI-02/03 network: production adapter through injected native HTTP performs one pinned request per stage',async t=>{
  const seen=[],dns=[];
  const f=await local(t,async(req,res)=>{
    const chunks=[];for await(const b of req)chunks.push(b);
    seen.push({method:req.method,path:req.url,keyHash:hash(req.headers.authorization.slice(7)),contentLength:req.headers['content-length'],body:Buffer.concat(chunks).toString()});
    res.writeHead(200,{'content-type':'application/json','x-request-id':'loopback-header-27'});
    res.end(JSON.stringify(req.url===MODEL_PATH?modelInfo():generated()));
  });
  const pinned=createBoundedTransport({
    resolve4:async hostname=>{dns.push(hostname);return ['8.8.8.8','1.1.1.1'];},
    https:(url,options,callback)=>{
      assert.equal(url.protocol,'https:');assert.equal(url.hostname,'api.x.ai');assert.equal(url.port,'');
      assert.equal(options.agent,false);assert.notEqual(options.rejectUnauthorized,false);
      options.lookup('api.x.ai',{},(error,ip,family)=>{assert.equal(error,null);assert.equal(ip,'8.8.8.8');assert.equal(family,4);});
      options.lookup('api.x.ai',{all:true},(error,ips)=>{assert.equal(error,null);assert.deepEqual(ips,[{address:'8.8.8.8',family:4}]);});
      // Only the injected test socket maps to loopback; production always uses node:https.
      return httpRequest(f.url+url.pathname,{...options,lookup:undefined},callback);
    }
  });
  const adapter=new XaiImageAdapter({transport:pinned,clock:()=>Date.UTC(2026,8,8)}),ctx=context(adapter);
  const r=await adapter.submit(ctx);
  assert.equal(r.state,'succeeded');assert.equal(r.requestId,'loopback-header-27');assert.equal(r.actualMicros,40000);
  assert.deepEqual(dns,['api.x.ai','api.x.ai']);
  assert.deepEqual(seen.map(x=>[x.method,x.path]),[['GET',MODEL_PATH],['POST',GENERATE_PATH]]);
  assert.equal(seen[1].keyHash,hash(ctx.secret));assert.equal(Number(seen[1].contentLength),Buffer.byteLength(seen[1].body));
  assert.equal(JSON.parse(seen[1].body).n,1);
});

test('AI-02 network: final authorization is rechecked after asynchronous DNS before opening socket',async t=>{
  await local(t,(_req,res)=>res.end());
  let allowed=true,connections=0;const gate=deferred();
  const transport=createBoundedTransport({resolve4:()=>gate.promise,https:()=>{connections++;}});
  const p=transport('https://api.x.ai/v1',{beforeRequest:()=>{assert.ok(allowed,'synthetic send authorization revoked');}});
  allowed=false;gate.resolve(['8.8.8.8']);
  await assert.rejects(p,/synthetic send authorization revoked/);assert.equal(connections,0);
});

