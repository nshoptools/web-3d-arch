import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request as httpRequest} from 'node:http';
import {XaiImageAdapter} from '../../src/server/adapters/xai-image.mjs';
import {boundedRequest} from '../../src/server/network.mjs';
import {MODEL_ID,MODEL_VERSION,ORIGIN,EDIT_PATH,GENERATE_PATH,MODEL_PATH,CHECK_PATH,REFERENCE_REQUEST_BYTES} from '../../src/server/adapters/xai-contract.mjs';
import {setup,defaultPolicy,uid,hash,png,deferred} from './helpers.mjs';
import {modelInfo,goodKey,input,context,response} from './adapter-helpers.mjs';
const clock=()=>Date.UTC(2026,8,8,4);
const descriptor=()=>({version:'arch-ai-reference/1',id:uid(),revision:1,sha256:hash(png),byteLength:png.length,mediaType:'image/png',width:1,height:1,projectId:uid(),projectRevision:'r1',expiresAt:clock()+1800000});
test('B03 xAI: official single reference default-medium price and fields, no low-quality guess',async()=>{
 let post;const m=modelInfo();m.input_modalities.push('image');
 const adapter=new XaiImageAdapter({clock,transport:async(url,o)=>{
  if(url===ORIGIN+MODEL_PATH)return response(m);
  assert.equal(url,ORIGIN+EDIT_PATH);o.beforeRequest();post=JSON.parse(o.body);assert.equal(o.maxRequestBytes,REFERENCE_REQUEST_BYTES);
  return response({data:[{b64_json:png.toString('base64'),mime_type:'image/png'}],usage:{cost_in_usd_ticks:700000000}});
 }});
 for(const [size,cap]of [['1k',70000],['2k',90000]]){const body=input({reference:descriptor(),options:{quality:'medium',size}});assert.equal(adapter.quote(body).maxCostMicros,cap);}
 assert.throws(()=>adapter.quote(input({reference:descriptor()})),/REFERENCE_IMAGE_UNSUPPORTED/);
 const body=input({reference:descriptor(),options:{quality:'medium',size:'1k'}}),result=await adapter.submit({jobId:uid(),secret:Buffer.from('synthetic-key-reference-123'),input:body,quote:adapter.quote(body),referenceBytes:png,authorizeSend:()=>{},signal:new AbortController().signal});
 assert.equal(result.state,'succeeded');assert.equal(result.actualMicros,70000);assert.deepEqual(post,{model:MODEL_ID,prompt:body.prompt,n:1,image:{type:'image_url',url:'data:image/png;base64,'+png.toString('base64')},resolution:'1k',response_format:'b64_json'});
 assert.equal(post.quality,undefined);assert.equal(post.aspect_ratio,undefined);
});
async function fixture(t){
 const policy=defaultPolicy();policy.allowedProviders=['xai-imagine'];policy.ai.bytesPerDay=500_000_000;policy.quotas.storageBytes=500_000_000;
 const f=await setup(t,{policy});f.setTime(clock());const posts=[],m=modelInfo();m.input_modalities.push('image');let gate=null,arrived=null;
 const server=createServer(async(req,res)=>{
  if(req.url===MODEL_PATH&&gate){arrived?.resolve();await gate.promise;}
  res.setHeader('content-type','application/json');
  if(req.url===CHECK_PATH)return res.end(JSON.stringify(goodKey()));
  if(req.url===MODEL_PATH)return res.end(JSON.stringify(m));
  const parts=[];for await(const b of req)parts.push(b);
  assert.equal(req.method,'POST');assert.equal(req.url,EDIT_PATH);posts.push({path:req.url,keyHash:hash(req.headers.authorization),body:JSON.parse(Buffer.concat(parts))});
  res.end(JSON.stringify({data:[{b64_json:png.toString('base64'),mime_type:'image/png'}],usage:{cost_in_usd_ticks:700000000}}));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{server.closeIdleConnections();await new Promise(r=>server.close(r));});
 const adapter=new XaiImageAdapter({clock:f.clock,transport:(url,o)=>{assert.equal(new URL(url).origin,ORIGIN);return boundedRequest(origin+new URL(url).pathname,{...o,testOnly:true,allowedOrigins:[origin]});}});
 f.config.providers=[adapter];await f.restart();await f.owner.login('owner-subject');await f.a.login('member-a');await f.b.login('member-b');
 async function connect(c){
  const secret='synthetic-only-'+uid(),v=await c.ok('POST','/api/v1/ai/credentials',{key:secret,label:'Reference test',providerId:'xai-imagine',endpointId:'xai-api-https-v1'},{},201);
  await c.ok('POST','/api/v1/ai/credentials/'+v.id+'/check',{version:1});await c.budget([{currency:'USD',perOperationMicros:100000,perDayMicros:200000,perMonthMicros:500000}]);return {...v,secret};
 }
 async function prepare(c,key){const projectId=uid(),reference=(await c.ok('POST','/api/v1/ai/references',{uploadId:uid(),projectId,projectRevision:'r1',sha256:hash(png),byteLength:png.length,mediaType:'image/png',base64:png.toString('base64')},{},201)).reference;
  return c.prepare(key,{reference,projectId,projectRevision:'r1',modelId:MODEL_ID,modelVersion:MODEL_VERSION,options:{quality:'medium',size:'1k'}});
 }
 return {...f,posts,connect,prepare,pause(){gate=deferred();arrived=deferred();return {entered:arrived.promise,release:()=>{gate.resolve();gate=null;}};}};
}
test('B03 controlled real HTTP: members own keys/reference bytes, cost reservation, private artifact/thumbnail/ticket, no duplicate sends',async t=>{
 const f=await fixture(t),a=await f.connect(f.a),b=await f.connect(f.b);
 for(const [c,key]of [[f.a,a],[f.b,b]]){
  const p=await f.prepare(c,key);assert.equal(p.job.quote.maxCostMicros,70000);assert.equal(p.job.quote.recipient,ORIGIN+EDIT_PATH);
  const q=p.job.quoteHash;await Promise.all([f.a===c?f.a.submit(p.job):f.b.submit(p.job),c.submit(p.job)]);
  const j=await c.poll(p.job,'succeeded');assert.equal(j.accounting.actualMicros,70000);assert.equal(j.quoteHash,q);
  const post=f.posts.at(-1);assert.equal(post.keyHash,hash('Bearer '+key.secret));assert.equal(post.body.image.url,'data:image/png;base64,'+png.toString('base64'));
  const id=j.artifacts[0].id,ticket=await c.ok('POST','/api/v1/ai/artifacts/'+id+'/download-ticket',{});
  for(const other of [c===f.a?f.b:f.a,f.owner])for(const path of ['/api/v1/ai/artifacts/'+id,'/api/v1/ai/artifacts/'+id+'/thumbnail',ticket.url])assert.equal((await other.request('GET',path)).status,404);
  assert.ok((await c.request('GET',ticket.url)).raw.equals(png));
 }
 assert.equal(f.posts.length,2);
});
test('B03 controlled real HTTP: expiry/revocation during metadata preflight cannot send a paid edit',async t=>{
 const f=await fixture(t),key=await f.connect(f.a),p=await f.prepare(f.a,key),pause=f.pause();
 await f.a.submit(p.job);await pause.entered;
 await f.a.ok('DELETE','/api/v1/ai/references/'+p.input.reference.id,{revision:1,confirm:'delete:'+p.input.reference.id});pause.release();
 const j=await f.a.poll(p.job,'failed');assert.equal(j.accounting.actualMicros,0);assert.equal(j.errorCode,'PROVIDER_SEND_BLOCKED');assert.equal(f.posts.length,0);
});
test('B03 real upload arrival: ingress slot bounded and logout rejects late upload without publishing a source',async t=>{
 const f=await fixture(t),body=JSON.stringify({uploadId:uid(),projectId:uid(),projectRevision:'r1',sha256:hash(png),byteLength:png.length,mediaType:'image/png',base64:png.toString('base64')});
 let request;const result=new Promise((resolve,reject)=>{
  request=httpRequest(f.app.origin+'/api/v1/ai/references',{method:'POST',headers:{origin:f.app.origin,'content-type':'application/json','content-length':Buffer.byteLength(body),'x-csrf-token':f.a.csrf,cookie:[...f.a.cookies].map(([k,v])=>k+'='+v).join('; ')}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});request.on('error',reject);request.write(body.slice(0,30));
 });
 for(let n=0;n<100&&!f.app.images.uploading;n++)await new Promise(r=>setTimeout(r,5));assert.equal(f.app.images.uploading,true);
 const second=await f.a.request('POST','/api/v1/ai/references',{});assert.equal(second.json.error.code,'IMAGE_UPLOAD_BUSY');
 await f.a.ok('POST','/api/v1/logout',{});request.end(body.slice(30));assert.equal(await result,401);
 assert.equal(f.app.store.get('SELECT count(*) n FROM image_references').n,0);assert.equal(f.posts.length,0);
});

test('B03 controlled real HTTP: quote expiring during metadata GET blocks edit even while reference remains valid',async t=>{
 const f=await fixture(t),key=await f.connect(f.a),p=await f.prepare(f.a,key);f.advance(599000);const pause=f.pause();
 await f.a.submit(p.job);await pause.entered;f.advance(2000);assert.ok(p.input.reference.expiresAt>f.clock());pause.release();
 const j=await f.a.poll(p.job,'failed');assert.equal(j.errorCode,'PROVIDER_SEND_BLOCKED');assert.equal(j.accounting.actualMicros,0);assert.equal(f.posts.length,0);
});

