import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { XaiImageAdapter } from '../../src/server/adapters/xai-image.mjs';
import { productionAdapters } from '../../src/server/adapters/registry.mjs';
import { decodeImage } from '../../src/server/adapters/images.mjs';
import { MODEL_ID,MODEL_VERSION,ORIGIN,CHECK_PATH,MODEL_PATH,GENERATE_PATH,PRICE_EXPIRES } from '../../src/server/adapters/xai-contract.mjs';
import { ControlledTransport,context,input,response,generated,modelInfo,png,jpg,chunk,hash } from './adapter-helpers.mjs';
const clock=()=>Date.UTC(2026,8,8);
const make=()=>{const wire=new ControlledTransport();return {wire,adapter:new XaiImageAdapter({transport:wire.request,clock})};};
const limits={maxBytes:12_000_000,maxWidth:2048,maxHeight:2048,maxPixels:4_194_304};

test('AI-01: production registry is explicit BYOK, frozen metadata and honest mutable alias',()=>{
  assert.deepEqual(productionAdapters(),[]);
  assert.throws(()=>productionAdapters('other-endpoint'),/AI_ADAPTER_SELECTION_INVALID/);
  const [a]=productionAdapters('xai-imagine');
  assert.equal(a.metadata.production,true);assert.equal(a.metadata.testOnly,undefined);assert.equal(a.metadata.byokOnly,true);
  assert.equal(a.metadata.models[0].id,MODEL_ID);assert.equal(a.metadata.models[0].version,MODEL_VERSION);
  assert.equal(a.metadata.models[0].aliasMutable,true);assert.equal(a.metadata.capabilities.providerIdempotency,false);
  assert.equal(a.metadata.capabilities.automaticBillableRetries,0);assert.throws(()=>{a.metadata.prices.tiers[0].maxCostMicros=1;});
});

test('AI-03: independently specified four price tiers, required options, bounded prompt and stale price gate',()=>{
  const {adapter}=make();
  for(const [size,quality,cap] of [['1k','low',40000],['1k','medium',60000],['2k','low',60000],['2k','medium',80000]]) {
    const q=adapter.quote(input({options:{size,quality}}));
    assert.equal(q.currency,'USD');assert.equal(q.maxCostMicros,cap);assert.equal(q.outputLimit.images,1);
    assert.equal(q.priceDate,'2026-09-08');assert.equal(q.maxOutputBytes,12_000_000);
  }
  for(const bad of [{options:{}},{options:{size:'1k',quality:'auto'}},{options:{size:'4k',quality:'low'}},
    {options:{size:'1k',quality:'low',n:10}},{modelId:'grok-imagine-image'},{modelVersion:'snapshot-fiction'},
    {prompt:'x'.repeat(4001)},{prompt:'a'+'\u0301'.repeat(9000)},{prompt:'bad\u0000text'},{prompt:'\ud800'}])
    assert.throws(()=>adapter.quote(input(bad)));
  assert.throws(()=>new XaiImageAdapter({clock:()=>PRICE_EXPIRES}).quote(input()),/PROVIDER_PRICE_CHANGED/);
});

test('AI-02/04: zero-inference GET key check, enabled flags only, safe authentication failures',async()=>{
  const {wire,adapter}=make(),ctx=context(adapter);
  assert.deepEqual(await adapter.checkKey(ctx),{valid:true});
  assert.equal(wire.calls[0].url,ORIGIN+CHECK_PATH);assert.equal(wire.calls[0].method,'GET');assert.equal(wire.calls[0].body,null);
  assert.equal(wire.calls[0].keyHash,hash(ctx.secret));assert.equal(wire.posts.length,0);
  for(const flag of ['team_blocked','api_key_blocked','api_key_disabled']){
    wire.key={team_blocked:false,api_key_blocked:false,api_key_disabled:false,[flag]:true};
    assert.deepEqual(await adapter.checkKey(ctx),{valid:false});
  }
  wire.key={};await assert.rejects(adapter.checkKey(ctx),/PROVIDER_RESPONSE_INVALID/);
  const bad=new XaiImageAdapter({clock,transport:async()=>response({error:ctx.secret.toString()},401)});
  assert.deepEqual(await bad.checkKey(ctx),{valid:false});
});

test('AI-01/02/03: exact production request, PNG and JPEG, per-user header, no private IDs or idempotency fiction',async()=>{
  for(const [bytes,mime]of [[png,'image/png'],[jpg,'image/jpeg']]){
    const {wire,adapter}=make(),ctx=context(adapter);
    wire.generate=()=>response(generated({data:[{b64_json:bytes.toString('base64'),mime_type:mime}]}),200,{'x-request-id':'actual-upstream-header-42'});
    const result=await adapter.submit(ctx);
    assert.equal(result.state,'succeeded');assert.equal(result.actualMicros,40000);assert.equal(result.requestId,'actual-upstream-header-42');
    assert.equal(result.usage.costInUsdTicks,'400000000');assert.equal(result.artifact.mediaType,mime);assert.ok(result.artifact.bytes.equals(bytes));
    assert.deepEqual(wire.calls.map(c=>[c.method,c.url]),[['GET',ORIGIN+MODEL_PATH],['POST',ORIGIN+GENERATE_PATH]]);
    const post=wire.posts[0];
    assert.equal(post.keyHash,hash(ctx.secret));assert.equal(post.headers['content-type'],'application/json');
    assert.equal(post.headers['accept-encoding'],'identity');assert.equal(post.headers['idempotency-key'],undefined);
    assert.deepEqual(post.body,{model:MODEL_ID,prompt:ctx.input.prompt,n:1,aspect_ratio:'1:1',resolution:'1k',quality:'low',response_format:'b64_json'});
    assert.equal(post.maxBytes,16_100_000);assert.equal(post.timeoutMs,110_000);
    assert.equal(JSON.stringify(post.body).includes(ctx.secret.toString()),false);
    assert.equal(JSON.stringify(post.body).includes(ctx.input.projectId),false);
    assert.deepEqual(decodeImage(bytes.toString('base64'),mime,limits).width,1024);
  }
});

test('AI-03: model/currency/missing tier/price increase blocked before POST; metadata units are ticks, not cents',async()=>{
  const variants=[
    m=>{m.id='different-model';},m=>{m.currency='EUR';},m=>{delete m.pricing;},m=>{m.pricing=[];},
    m=>{m.pricing[0].price_per_image=400_000_001;},m=>{m.pricing[0].price_per_image=-1;},
    m=>{m.pricing[0].price_per_image=Number.MAX_SAFE_INTEGER+1;},m=>{m.max_prompt_length=1;},
    m=>{m.output_modalities=['text'];},m=>{m.pricing.push({...m.pricing[0]});}
  ];
  for(const change of variants) {
    const {wire,adapter}=make();change(wire.model);
    const r=await adapter.submit(context(adapter));assert.equal(r.state,'failed');assert.equal(r.actualMicros,0);assert.equal(wire.posts.length,0);
  }
  for(const change of [q=>{q.currency='EUR';},q=>{q.maxCostMicros=1;},q=>{q.priceVersion='old-price';},q=>{q.outputLimit.images=2;}]){
    const {wire,adapter}=make(),c=context(adapter);change(c.quote);
    const r=await adapter.submit(c);assert.equal(r.actualMicros,0);assert.equal(wire.posts.length,0);
  }
});

test('AI-03: usage ticks retain exact provider amount, ceil micros; missing usage remains estimated',async()=>{
  for(const [ticks,expected]of [[0,0],[1,1],[399999999,40000],[400000000,40000]]){
    const {wire,adapter}=make();wire.generate=()=>response(generated({usage:{cost_in_usd_ticks:ticks}}));
    const r=await adapter.submit(context(adapter));assert.equal(r.state,'succeeded');assert.equal(r.actualMicros,expected);assert.equal(r.usage.costInUsdTicks,String(ticks));
    assert.equal(r.requestId,undefined,'do not invent a provider request ID');
  }
  const {wire,adapter}=make();wire.generate=()=>response(generated({usage:null}));
  const r=await adapter.submit(context(adapter));assert.equal(r.state,'succeeded');assert.equal(r.actualMicros,null);assert.equal(r.usage,undefined);
  for(const usage of [{cost_in_usd_ticks:-1},{cost_in_usd_ticks:1.2},{cost_in_usd_ticks:'400000000'},
    {cost_in_usd_ticks:1e20},{cost_in_usd_ticks:400000000,currency:'EUR'},{cost_in_usd_ticks:1,input_tokens:1}]) {
    wire.generate=()=>response(generated({usage}));
    const bad=await adapter.submit(context(adapter));assert.equal(bad.state,'unknown');assert.equal(bad.actualMicros,null);assert.equal(bad.artifact,undefined);
  }
});

test('AI-02: malicious response fields, wrong MIME/model, URL downloads, invalid JSON/base64 are not artifacts',async()=>{
  const cases=[
    response(generated({data:[{mime_type:'text/html',b64_json:png.toString('base64')}]})),
    response(generated({data:[{mime_type:'image/jpeg',b64_json:png.toString('base64')}]})),
    response(generated({data:[{mime_type:'image/png',b64_json:'data:image/png;base64,'+png.toString('base64')}]})),
    response(generated({data:[{mime_type:'image/png',b64_json:png.toString('base64')+' \n'}]})),
    response(generated({data:[{mime_type:'image/png',b64_json:'@@@@'}]})),
    response(generated({data:[{mime_type:'image/png',b64_json:'Zh=='}]})),
    response(generated({data:[{url:'http://169.254.169.254/metadata',mime_type:'image/png'}]})),
    response(generated({data:[]})),response(generated({data:[{},{}]})),
    response(generated({model:'silent-fallback-model'})),
    response(generated({currency:'EUR'})),
    response(Buffer.from('{"__proto__":{"owner":true}}')),
    response(Buffer.from([0xff])),response(Buffer.from('{broken')),
    response(generated(),200,{'content-type':'text/html'}),
    response(generated(),200,{'content-encoding':'gzip'}),
    response(Buffer.alloc(16_100_001))
  ];
  for(const responseValue of cases){
    const {wire,adapter}=make();wire.generate=()=>responseValue;
    const r=await adapter.submit(context(adapter));
    assert.notEqual(r.state,'succeeded');assert.equal(r.artifact,undefined);assert.equal(wire.posts.length,1);
    assert.equal(wire.calls.length,2,'no URL fetching or hidden replay');
  }
});

test('AI-02: PNG CRC, decompressed-size, image dimension bombs and compressed metadata rejected',()=>{
  const hugeHeader=Buffer.from(png.subarray(16,29));hugeHeader.writeUInt32BE(65535,0);hugeHeader.writeUInt32BE(65535,4);
  const dimensionBomb=Buffer.concat([png.subarray(0,8),chunk('IHDR',hugeHeader),png.subarray(33)]);
  const smallHeader=Buffer.from(png.subarray(16,29));smallHeader.writeUInt32BE(1,0);smallHeader.writeUInt32BE(1,4);
  const inflateBomb=Buffer.concat([png.subarray(0,8),chunk('IHDR',smallHeader),chunk('IDAT',deflateSync(Buffer.alloc(1_000_000))),chunk('IEND',Buffer.alloc(0))]);
  const badCrc=Buffer.from(png);badCrc[40]^=1;
  const metadataBomb=Buffer.concat([png.subarray(0,33),chunk('iCCP',deflateSync(Buffer.alloc(1_000_000))),png.subarray(33)]);
  for(const bytes of [dimensionBomb,inflateBomb,badCrc,metadataBomb,Buffer.concat([png,Buffer.from('trailing')])])
    assert.throws(()=>decodeImage(bytes.toString('base64'),'image/png',limits),/PROVIDER_IMAGE_INVALID/);
  assert.throws(()=>decodeImage('A'.repeat(16_000_004),'image/png',limits),/PROVIDER_IMAGE_INVALID/);
});

test('AI-03: safe provider errors separate auth, permission, credit/quota/rate/refusal/server/timeout; never assume free failure',async()=>{
  for(const [status,code,expected,state] of [
    [401,'','PROVIDER_AUTH','failed'],[403,'','PROVIDER_PERMISSION','failed'],[402,'','PROVIDER_CREDIT','failed'],
    [429,'quota_exceeded','PROVIDER_QUOTA','failed'],[429,'','PROVIDER_RATE_LIMIT','failed'],
    [422,'','PROVIDER_INVALID_REQUEST','failed'],[400,'invalid_api_key','PROVIDER_AUTH','failed'],
    [400,'content_policy_violation','PROVIDER_CONTENT_REFUSAL','failed'],
    [404,'','PROVIDER_MODEL_UNAVAILABLE','failed'],[500,'','PROVIDER_SERVER_ERROR','unknown'],
    [504,'','PROVIDER_TIMEOUT_UNKNOWN','unknown']
  ]){
    const {wire,adapter}=make(),ctx=context(adapter);
    wire.generate=()=>response({error:{code,message:ctx.secret.toString()}},status);
    const r=await adapter.submit(ctx);assert.equal(r.state,state);assert.equal(r.errorCode,expected);assert.equal(r.actualMicros,null);
    assert.equal(JSON.stringify(r).includes(ctx.secret.toString()),false);assert.equal(wire.posts.length,1);
  }
});

test('AI-03: known content moderation outcome differs from unknown charge and confirmed zero usage',async()=>{
  for(const usage of [null,{cost_in_usd_ticks:0},{cost_in_usd_ticks:400000000}]){
    const {wire,adapter}=make();wire.generate=()=>response(generated({data:[{respect_moderation:false}],usage}));
    const r=await adapter.submit(context(adapter));assert.equal(r.state,'failed');assert.equal(r.errorCode,'PROVIDER_CONTENT_REFUSAL');
    assert.equal(r.actualMicros,usage?usage.cost_in_usd_ticks/10000:null);assert.equal(r.artifact,undefined);
  }
});

test('AI-02: secret-bearing error text, request ID, revised prompt and unused usage fields never leave adapter',async()=>{
  const {wire,adapter}=make(),ctx=context(adapter),key=ctx.secret.toString();
  wire.generate=()=>response(generated({revised_prompt:key,usage:{cost_in_usd_ticks:400000000,secret:key}}),200,{'x-request-id':key});
  const r=await adapter.submit(ctx);
  assert.equal(r.state,'succeeded');assert.equal(r.requestId,undefined);assert.equal(JSON.stringify({...r,artifact:null}).includes(key),false);
  wire.generate=()=>{throw new Error('transport with raw credential '+key);};
  const e=await adapter.submit(context(adapter,{secret:ctx.secret}));
  assert.equal(e.state,'unknown');assert.equal(e.errorCode,'PROVIDER_DELIVERY_UNKNOWN');assert.equal(JSON.stringify(e).includes(key),false);
});

test('AI-03: bill above quoted cap persists actual amount and blocks further quotes; no clamping or retry',async()=>{
  const {wire,adapter}=make();wire.generate=()=>response(generated({usage:{cost_in_usd_ticks:500000000}}));
  const r=await adapter.submit(context(adapter));
  assert.equal(r.state,'failed');assert.equal(r.errorCode,'PROVIDER_COST_EXCEEDED');assert.equal(r.actualMicros,50000);
  assert.equal(r.usage.costInUsdTicks,'500000000');assert.equal(wire.posts.length,1);
  assert.throws(()=>adapter.quote(input()),/PROVIDER_CAPABILITY_BLOCKED/);
});

