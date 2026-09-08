import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { setup,defaultPolicy,hash,uid,deferred } from './helpers.mjs';
import { XaiImageAdapter } from '../../src/server/adapters/xai-image.mjs';
import { MODEL_ID,MODEL_VERSION,ORIGIN,CHECK_PATH,MODEL_PATH,GENERATE_PATH } from '../../src/server/adapters/xai-contract.mjs';
export { deferred,hash,uid };
export const png=readFileSync(new URL('./fixtures/square-1024.png',import.meta.url));
export const jpg=readFileSync(new URL('./fixtures/square-1024.jpg',import.meta.url));
export const modelInfo=()=>({id:MODEL_ID,version:'provider-version-test-only',fingerprint:'fp_test_only',
  max_prompt_length:16_000,input_modalities:['text'],output_modalities:['image'],image_price:6,aliases:[],
  pricing:[
    {quality:'low',resolution:'1k',price_per_image:400_000_000},
    {quality:'low',resolution:'2k',price_per_image:600_000_000},
    {quality:'medium',resolution:'1k',price_per_image:600_000_000},
    {quality:'medium',resolution:'2k',price_per_image:800_000_000}
  ]});
export const goodKey=()=>({team_blocked:false,api_key_blocked:false,api_key_disabled:false});
export function response(json,statusCode=200,headers={}) {
  return {statusCode,headers:{'content-type':'application/json',...headers},bytes:Buffer.isBuffer(json)?json:Buffer.from(JSON.stringify(json))};
}
export const generated=(patch={})=>({data:[{b64_json:png.toString('base64'),mime_type:'image/png'}],
  usage:{cost_in_usd_ticks:400_000_000},...patch});
export const input=(patch={})=>({operationId:uid(),credentialId:uid(),modelId:MODEL_ID,modelVersion:MODEL_VERSION,
  projectId:uid(),projectRevision:'local-r1',prompt:'A blue architectural pavilion.',options:{quality:'low',size:'1k'},...patch});
export class ControlledTransport {
  constructor() {this.calls=[];this.model=modelInfo();this.key=goodKey();this.generate=()=>response(generated(),200,{'x-request-id':'provider-request-test-1'});this.beforeMetadata=null;}
  request=async(url,options)=>{
    assert.ok(url.startsWith(ORIGIN+'/v1/'),'fixed provider origin');
    assert.deepEqual(options.allowedOrigins,[ORIGIN]);assert.equal(options.captureStatus,true);
    assert.equal(options.maxRequestBytes,65_536);
    const key=options.headers.authorization?.slice(7);
    assert.ok(typeof key==='string'&&key.length>=8,'per-request key required');
    options.beforeRequest?.();
    this.calls.push({url,method:options.method,headers:{...options.headers,authorization:'Bearer [redacted]'},
      keyHash:hash(key),body:options.body?JSON.parse(options.body):null,maxBytes:options.maxBytes,timeoutMs:options.timeoutMs});
    if(url===ORIGIN+CHECK_PATH)return response(this.key);
    if(url===ORIGIN+MODEL_PATH){if(this.beforeMetadata)await this.beforeMetadata.promise;return response(this.model);}
    assert.equal(url,ORIGIN+GENERATE_PATH);assert.equal(options.method,'POST');
    const r=await this.generate({key,options});
    options.onHeaders?.(r.statusCode,r.headers);return r;
  };
  get posts(){return this.calls.filter(c=>c.method==='POST');}
}
export function context(adapter,patch={}) {
  const body=input(),secret=Buffer.from(randomBytes(32).toString('base64url'));
  return {jobId:uid(),operationId:body.operationId,idempotencyKey:uid(),secret,input:body,quote:adapter.quote(body),
    signal:new AbortController().signal,running:()=>{},...patch};
}
export async function adapterSetup(t,{deliveryTimeoutMs=60_000}={}) {
  const policy=defaultPolicy();policy.allowedProviders=['xai-imagine'];policy.quotas.storageBytes=500_000_000;policy.ai.bytesPerDay=500_000_000;
  const f=await setup(t,{policy,deliveryTimeoutMs});
  f.wire=new ControlledTransport();f.adapter=new XaiImageAdapter({transport:f.wire.request,clock:f.clock});
  f.config.providers=[f.adapter];await f.restart();
  f.connect=async(client)=>{
    const key=randomBytes(32).toString('base64url');f.secrets.push(key);
    const c=await client.ok('POST','/api/v1/ai/credentials',{key,label:'My xAI key',providerId:'xai-imagine',endpointId:'xai-api-https-v1'},{},201);
    const checked=await client.ok('POST','/api/v1/ai/credentials/'+c.id+'/check',{version:c.version});
    return {...checked,secret:key};
  };
  f.prepare=async(client,c,patch={})=>client.prepare(c,{modelId:MODEL_ID,modelVersion:MODEL_VERSION,options:{quality:'low',size:'1k'},...patch});
  f.budget=async(client,cap=200_000)=>client.budget([{currency:'USD',perOperationMicros:cap,perDayMicros:cap,perMonthMicros:cap}]);
  return f;
}
// Independent, slow bitwise CRC oracle used only to construct corrupt dimension/deflate fixtures.
export function chunk(type,bytes) {
  const value=Buffer.concat([Buffer.from(type),bytes]);let c=0xffffffff;
  for(const b of value){c^=b;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;}
  const result=Buffer.alloc(bytes.length+12);result.writeUInt32BE(bytes.length);value.copy(result,4);result.writeUInt32BE((c^0xffffffff)>>>0,result.length-4);return result;
}
