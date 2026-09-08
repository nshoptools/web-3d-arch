import { Fault,fail,exact,canonical,sha } from '../core.mjs';
import { boundedRequest } from '../network.mjs';
import { decodeImageAsync } from './images.mjs';
import { MODEL_ID,MODEL_VERSION,ORIGIN,GENERATE_PATH,EDIT_PATH,REFERENCE_RETRIEVED_AT,REFERENCE_PRICE_MICROS,REFERENCE_REQUEST_BYTES,CHECK_PATH,MODEL_PATH,
  PRICE_DATE,PRICE_VERSION,PRICE_EXPIRES,PRICE_RETRIEVED_AT,MAX_IMAGE_BYTES,MAX_JSON_BYTES,MAX_PROMPT_BYTES,TIERS,registryMetadata } from './xai-contract.mjs';
const graphemes=new Intl.Segmenter('und',{granularity:'grapheme'});
const safeCodes=new Set(['PROVIDER_AUTH','PROVIDER_PERMISSION','PROVIDER_QUOTA','PROVIDER_CREDIT','PROVIDER_RATE_LIMIT',
  'PROVIDER_MODEL_UNAVAILABLE','PROVIDER_INVALID_REQUEST','PROVIDER_CONTENT_REFUSAL','PROVIDER_SERVER_ERROR',
  'PROVIDER_TIMEOUT_UNKNOWN','PROVIDER_DELIVERY_UNKNOWN','PROVIDER_RESPONSE_INVALID','PROVIDER_OUTPUT_URL_UNSUPPORTED','PROVIDER_IMAGE_FORMAT_UNSUPPORTED','PROVIDER_PRICE_CHANGED',
  'PROVIDER_CAPABILITY_BLOCKED','PROVIDER_COST_EXCEEDED','PROVIDER_CANCELLED','PROVIDER_AUTH_OR_REQUEST','PROVIDER_SEND_BLOCKED']);
const valid=(value,code='PROVIDER_RESPONSE_INVALID')=>fail(value,502,code);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const identifier=value=>typeof value==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(value);
function keyString(secret) {
  valid(Buffer.isBuffer(secret)&&secret.length>=8&&secret.length<=8192,'PROVIDER_AUTH');
  const value=secret.toString('utf8');
  valid(/^[\x21-\x7e]+$/.test(value)&&!/\s/.test(value),'PROVIDER_AUTH');
  return value;
}
function containsSecret(value,key) {
  return typeof value==='string'&&[key,Buffer.from(key).toString('base64'),Buffer.from(key).toString('hex')].some(s=>value.includes(s));
}
function decodeJson(response,limit) {
  valid(Number.isInteger(response?.statusCode)&&Buffer.isBuffer(response.bytes)&&response.bytes.length<=limit);
  valid(typeof response.headers?.['content-type']==='string'&&/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(response.headers['content-type']));
  valid(!response.headers['content-encoding']||response.headers['content-encoding']==='identity');
  let result;
  try {
    const text=new TextDecoder('utf-8',{fatal:true}).decode(response.bytes);
    result=JSON.parse(text, (name,value)=>{
      if(['__proto__','prototype','constructor'].includes(name))throw new Error('json');
      return value;
    });
  } catch {throw new Fault(502,'PROVIDER_RESPONSE_INVALID');}
  valid(object(result));return result;
}
function errorCode(status,json) {
  // Never return or log the message, details, URLs, model strings or unknown codes.
  const e=object(json?.error)?json.error:json;
  const code=typeof e?.code==='string'?e.code.toLowerCase():'';
  if(status===401||['invalid_api_key','unauthenticated'].includes(code))return 'PROVIDER_AUTH';
  if(status===403)return 'PROVIDER_PERMISSION';
  if(status===402)return 'PROVIDER_CREDIT';
  if(['insufficient_quota','quota_exceeded','resource_exhausted'].includes(code))return 'PROVIDER_QUOTA';
  if(status===429)return 'PROVIDER_RATE_LIMIT';
  if(['content_policy_violation','content_filtered','moderation_blocked'].includes(code))return 'PROVIDER_CONTENT_REFUSAL';
  if(status===404)return 'PROVIDER_MODEL_UNAVAILABLE';
  if(status===408||status===504)return 'PROVIDER_TIMEOUT_UNKNOWN';
  if(status>=500)return 'PROVIDER_SERVER_ERROR';
  if(status===400&&!['invalid_argument','invalid_request'].includes(code))return 'PROVIDER_AUTH_OR_REQUEST';
  if([400,405,415,422].includes(status))return 'PROVIDER_INVALID_REQUEST';
  return 'PROVIDER_DELIVERY_UNKNOWN';
}
function transportCode(error,signal) {
  if(error?.code==='UPSTREAM_TIMEOUT')return 'PROVIDER_TIMEOUT_UNKNOWN';
  if(signal?.aborted)return 'PROVIDER_CANCELLED';
  return 'PROVIDER_DELIVERY_UNKNOWN';
}
function readUsage(json) {
  if(json.usage===undefined||json.usage===null)return null;
  const u=json.usage;valid(object(u));
  // Reject a currency override or token billing for this fixed per-image capability.
  valid(u.currency===undefined||u.currency==='USD');
  valid(!['input_tokens','output_tokens','total_tokens','input_tokens_details','output_tokens_details'].some(k=>u[k]!=null));
  const ticks=u.cost_in_usd_ticks;
  // JS safe integers deliberately bound int64; reject rounded/unrepresentable JSON numbers.
  valid(Number.isSafeInteger(ticks)&&ticks>=0);
  return {currency:'USD',unit:'usd_tick',costInUsdTicks:String(ticks),microsRounding:'ceil',source:'provider-response'};
}
function micros(usage){return usage?Number((BigInt(usage.costInUsdTicks)+9999n)/10000n):null;}

export class XaiImageAdapter {
  constructor({transport=boundedRequest,clock=Date.now}={}) {
    this.metadata=registryMetadata();this.transport=transport;this.clock=clock;this.blocked=false;
  }
  quote(input) {
    fail(!this.blocked,422,'PROVIDER_CAPABILITY_BLOCKED');
    fail(this.clock()>=PRICE_RETRIEVED_AT&&this.clock()<PRICE_EXPIRES,422,'PROVIDER_PRICE_CHANGED');
    fail(input.modelId===MODEL_ID&&input.modelVersion===MODEL_VERSION,422,'MODEL_UNSUPPORTED');
    exact(input.options??{},['quality','size']);
    const {quality,size}=input.options,outputCap=TIERS[size+':'+quality],cap=outputCap+(input.reference?REFERENCE_PRICE_MICROS:0);
    if(input.reference){fail(this.clock()>=REFERENCE_RETRIEVED_AT,422,'PROVIDER_PRICE_CHANGED');const r=input.reference;fail(quality==='medium'&&r.version==='arch-ai-reference/1'&&r.revision===1&&Number.isSafeInteger(r.byteLength)&&r.byteLength>0&&r.byteLength<=8_000_000&&['image/png','image/jpeg'].includes(r.mediaType),422,'REFERENCE_IMAGE_UNSUPPORTED');}
    fail(Number.isSafeInteger(cap),422,'PROVIDER_CAPABILITY_BLOCKED');
    fail(typeof input.prompt==='string'&&input.prompt.length>0&&input.prompt.isWellFormed()&&
      Buffer.byteLength(input.prompt)<=MAX_PROMPT_BYTES&&[...graphemes.segment(input.prompt)].length<=4000&&
      !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(input.prompt),413,'PROMPT_TOO_LONG');
    return {currency:'USD',maxCostMicros:cap,maxOutputBytes:MAX_IMAGE_BYTES,priceVersion:PRICE_VERSION,priceDate:PRICE_DATE,
      inputLimit:{utf8Bytes:MAX_PROMPT_BYTES,graphemes:4000,images:input.reference?1:0,requestBytes:input.reference?REFERENCE_REQUEST_BYTES:65_536},
      outputLimit:{images:1,size,quality,aspectRatio:input.reference?'input-auto':'1:1',bytes:MAX_IMAGE_BYTES,width:2048,height:2048,pixels:4_194_304},
      unknowns:['Published API inference cost only; tax/FX and outside-app usage excluded.',
        'Mutable alias and prices may change. Metadata GET checks output tier; reference input price is dated publication only, not a live metadata field or provider spend cap.',
        'Missing usage, safety refusal or ambiguous delivery never implies a zero charge.',
        'Provider ticks are retained exactly; each app micro amount rounds upward by less than one micro.']};
  }
  async request(path,{key,signal,method='GET',body=null,maxBytes=65_536,timeoutMs=10_000,onHeaders,beforeRequest}={}) {
    valid([CHECK_PATH,MODEL_PATH,GENERATE_PATH,EDIT_PATH].includes(path),'PROVIDER_CAPABILITY_BLOCKED');
    if(signal?.aborted)throw new Fault(502,'UPSTREAM_ABORTED');
    const headers={authorization:'Bearer '+key,accept:'application/json','accept-encoding':'identity',
      ...(body?{'content-type':'application/json'}:{})};
    try {
      return await this.transport(ORIGIN+path,{method,headers,body,signal,timeoutMs,maxBytes,maxRequestBytes:path===EDIT_PATH?REFERENCE_REQUEST_BYTES:65_536,
        captureStatus:true,allowedOrigins:[ORIGIN],onHeaders,beforeRequest});
    } finally {delete headers.authorization;}
  }
  async checkKey({secret,signal}) {
    let key;
    try {
      key=keyString(secret);
      const response=await this.request(CHECK_PATH,{key,signal});
      if([400,401,403].includes(response.statusCode))return {valid:false};
      const json=decodeJson(response,65_536);
      if(response.statusCode!==200)throw new Fault(502,errorCode(response.statusCode,json));
      valid(['team_blocked','api_key_blocked','api_key_disabled'].every(k=>typeof json[k]==='boolean'));
      return {valid:!json.team_blocked&&!json.api_key_blocked&&!json.api_key_disabled};
    } catch(e) {
      if(e?.code==='PROVIDER_AUTH')return {valid:false};
      throw new Fault(502,safeCodes.has(e?.code)?e.code:transportCode(e,signal));
    } finally {key=null;}
  }
  async preflight(input,quote,key,signal) {
    const fresh=this.quote(input);
    for(const field of ['currency','maxCostMicros','maxOutputBytes','priceVersion','priceDate'])
      valid(fresh[field]===quote[field],'PROVIDER_PRICE_CHANGED');
    valid(canonical(fresh.inputLimit)===canonical(quote.inputLimit)&&canonical(fresh.outputLimit)===canonical(quote.outputLimit),'PROVIDER_PRICE_CHANGED');
    const response=await this.request(MODEL_PATH,{key,signal});
    const model=decodeJson(response,65_536);
    if(response.statusCode!==200)throw new Fault(502,errorCode(response.statusCode,model));
    valid(model.id===MODEL_ID&&typeof model.version==='string'&&model.version.length>0,'PROVIDER_MODEL_UNAVAILABLE');
    valid(Number.isSafeInteger(model.max_prompt_length)&&model.max_prompt_length>=Buffer.byteLength(input.prompt),'PROVIDER_INVALID_REQUEST');
    valid(model.input_modalities?.includes('text')&&model.output_modalities?.includes('image')&&(!input.reference||model.input_modalities.includes('image')),'PROVIDER_CAPABILITY_BLOCKED');
    valid(model.currency===undefined||model.currency==='USD','PROVIDER_PRICE_CHANGED');
    // Metadata cents and pricing-tier ticks are different units; never use image_price as ticks.
    valid(Array.isArray(model.pricing)&&model.pricing.length<=32,'PROVIDER_CAPABILITY_BLOCKED');
    const matching=model.pricing.filter(t=>t.quality===input.options.quality&&t.resolution===input.options.size);
    valid(matching.length===1,'PROVIDER_CAPABILITY_BLOCKED');
    const price=matching[0].price_per_image;
    valid(Number.isSafeInteger(price)&&price>0&&BigInt(price)<=BigInt(quote.maxCostMicros-(input.reference?REFERENCE_PRICE_MICROS:0))*10000n,'PROVIDER_PRICE_CHANGED');
  }
  async submit({jobId,secret,input,quote,referenceBytes,signal,running=()=>{},authorizeSend=()=>{}}) {
    let key,started=false,requestId;
    const eventId='xai-response-'+jobId;
    const authorize=()=>{try{authorizeSend();}catch{throw new Fault(502,'PROVIDER_SEND_BLOCKED');}};
    const base=()=>({eventId,currency:'USD',...(requestId?{requestId}:{})});
    const header=(status,headers)=>{
      // Optional transport correlation header, not guaranteed by the image REST schema.
      const value=headers?.['x-request-id'];
      if(identifier(value)&&!containsSecret(value,key))requestId=value;
    };
    try {
      key=keyString(secret);
      await this.preflight(input,quote,key,signal);
      if(signal?.aborted)throw new Fault(502,'PROVIDER_CANCELLED');
      if(input.reference)valid(Buffer.isBuffer(referenceBytes)&&referenceBytes.length===input.reference.byteLength&&sha(referenceBytes)===input.reference.sha256,'PROVIDER_INVALID_REQUEST');
      const body=JSON.stringify({model:MODEL_ID,prompt:input.prompt,n:1,
        ...(input.reference?{image:{type:'image_url',url:'data:'+input.reference.mediaType+';base64,'+referenceBytes.toString('base64')}}:{aspect_ratio:'1:1',quality:input.options.quality}),
        resolution:input.options.size,response_format:'b64_json'});
      valid(Buffer.byteLength(body)<=(input.reference?REFERENCE_REQUEST_BYTES:65_536),'PROVIDER_INVALID_REQUEST');
      // No Idempotency-Key is sent: there is no verified image endpoint dedup contract.
      authorize();started=true;running();
      const response=await this.request(input.reference?EDIT_PATH:GENERATE_PATH,{key,signal,method:'POST',body,maxBytes:MAX_JSON_BYTES,timeoutMs:110_000,onHeaders:header,beforeRequest:authorize});
      header(response.statusCode,response.headers);
      const json=decodeJson(response,MAX_JSON_BYTES);
      if(response.statusCode!==200) {
        const error=errorCode(response.statusCode,json);
        const uncertain=response.statusCode>=500||[408,409].includes(response.statusCode)||response.statusCode<400;
        return {...base(),state:uncertain?'unknown':'failed',actualMicros:null,errorCode:error};
      }
      valid(json.currency===undefined||json.currency==='USD');
      const usage=readUsage(json),actualMicros=micros(usage);
      valid(!usage||!containsSecret(canonical(usage),key));
      const result={...base(),state:'succeeded',actualMicros,...(usage?{usage}:{})};
      if(actualMicros!==null&&actualMicros>quote.maxCostMicros) {
        // Keep the provider-reported liability, never clamp it to the local reservation.
        this.blocked=true;
        return {...result,state:'failed',errorCode:'PROVIDER_COST_EXCEEDED'};
      }
      try {
        valid(json.model===undefined||json.model===MODEL_ID,'PROVIDER_MODEL_UNAVAILABLE');
        valid(json.currency===undefined||json.currency==='USD');
        valid(Array.isArray(json.data)&&json.data.length===1);
        const item=json.data[0];valid(object(item));
        if(item.respect_moderation===false||json.respect_moderation===false)
          return {...result,state:'failed',errorCode:'PROVIDER_CONTENT_REFUSAL'};
        valid(item.url==null&&item.file_output==null,'PROVIDER_OUTPUT_URL_UNSUPPORTED');
        const image=await decodeImageAsync(item.b64_json,item.mime_type,{
          maxBytes:MAX_IMAGE_BYTES,maxWidth:2048,maxHeight:2048,maxPixels:4_194_304,square:!input.reference
        });
        valid(!image.bytes.includes(Buffer.from(key))&&!containsSecret(item.b64_json,key));
        return {...result,artifact:{bytes:image.bytes,mediaType:image.mediaType}};
      } catch(e) {
        return {...result,state:actualMicros===null?'unknown':'failed',
          errorCode:['PROVIDER_MODEL_UNAVAILABLE','PROVIDER_IMAGE_FORMAT_UNSUPPORTED','PROVIDER_OUTPUT_URL_UNSUPPORTED'].includes(e?.code)?e.code:'PROVIDER_RESPONSE_INVALID'};
      }
    } catch(e) {
      const code=safeCodes.has(e?.code)?e.code:transportCode(e,signal);
      // Before POST, only metadata was queried: no inference could be billed.
      return {...base(),state:started?'unknown':'failed',actualMicros:started?null:0,errorCode:code};
    } finally {key=null;}
  }
}
