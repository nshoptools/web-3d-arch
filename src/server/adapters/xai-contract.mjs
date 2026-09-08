export const PROVIDER_ID='xai-imagine';
export const MODEL_ID='grok-imagine-image-2.0';
// The provider does not promise this identifier is an immutable weights snapshot.
export const MODEL_VERSION='alias:grok-imagine-image-2.0';
export const ADAPTER_VERSION='xai-images-rest-v1-20260908.2';
export const ORIGIN='https://api.x.ai';
export const GENERATE_PATH='/v1/images/generations';
export const EDIT_PATH='/v1/images/edits';
export const REFERENCE_RETRIEVED_AT=Date.parse('2026-09-08T03:07:12.431Z');
export const REFERENCE_PRICE_MICROS=10_000;
export const REFERENCE_REQUEST_BYTES=10_750_000;
export const CHECK_PATH='/v1/api-key';
export const MODEL_PATH='/v1/image-generation-models/'+MODEL_ID;
export const PRICE_DATE='2026-09-08';
export const PRICE_RETRIEVED_AT=Date.parse('2026-09-07T20:19:06.135Z');
export const PRICE_VERSION='xai-image2-usd-20260908';
export const PRICE_EXPIRES=Date.parse('2026-10-08T00:00:00Z');
export const MAX_IMAGE_BYTES=12_000_000;
export const MAX_JSON_BYTES=16_100_000;
export const MAX_PROMPT_BYTES=16_000;
export const TIERS=Object.freeze({
  '1k:low':40_000,'2k:low':60_000,'1k:medium':60_000,'2k:medium':80_000
});
export const SOURCES=Object.freeze([
  'https://docs.x.ai/developers/models/grok-imagine-image-2.0',
  'https://docs.x.ai/developers/model-capabilities/images/generation',
  'https://docs.x.ai/developers/model-capabilities/images/editing',
  'https://docs.x.ai/developers/cost-tracking',
  'https://api.x.ai/api-docs/openapi.json'
]);
export function freeze(value) {
  for(const child of Object.values(value))if(child&&typeof child==='object')freeze(child);
  return Object.freeze(value);
}
export function registryMetadata() {
  return freeze({
    id:PROVIDER_ID,version:ADAPTER_VERSION,endpointId:'xai-api-https-v1',endpointUrl:ORIGIN+GENERATE_PATH,
    referenceEndpointUrl:ORIGIN+EDIT_PATH,displayName:'xAI Imagine',production:true,apiVersion:'v1',byokOnly:true,
    keyCheckCostMicros:0,keyCheck:{method:'GET',path:CHECK_PATH,generatesImages:false,
      proves:'Authentication and key/team enabled flags only; not balance or model access.'},
    models:[{id:MODEL_ID,version:MODEL_VERSION,aliasMutable:true,immutableSnapshot:false,referenceImages:true,
      referenceOptions:[{quality:'medium',size:'1k'},{quality:'medium',size:'2k'}],referenceLimits:{images:1,bytes:8_000_000,width:4096,height:4096,pixels:4_194_304,mimeTypes:['image/png','image/jpeg']},
      input:['text','image'],output:['image'],imageCount:{min:1,max:1},qualities:['low','medium'],sizes:['1k','2k'],
      aspectRatios:['1:1'],defaults:null,requiresExplicitOptions:true,
      inputLimits:{utf8Bytes:MAX_PROMPT_BYTES,graphemes:4000,requestBytes:65_536},
      outputLimits:{bytes:MAX_IMAGE_BYTES,width:2048,height:2048,pixels:4_194_304,mimeTypes:['image/png','image/jpeg']}}],
    prices:{version:PRICE_VERSION,date:PRICE_DATE,retrievedAt:PRICE_RETRIEVED_AT,dateTimezone:'Asia/Ho_Chi_Minh',validUntil:PRICE_EXPIRES,currency:'USD',unit:'micro',costUnit:'generated-image',referenceInputMicros:REFERENCE_PRICE_MICROS,referenceRetrievedAt:REFERENCE_RETRIEVED_AT,
      tiers:Object.entries(TIERS).map(([key,micros])=>{const [size,quality]=key.split(':');return {size,quality,images:1,maxCostMicros:micros};}),
      sourceUrls:SOURCES,livePreflight:true,providerHardSpendCap:false},
    capabilities:{textToImage:true,imageEditing:true,imageUpload:true,video:false,batch:false,
      providerIdempotency:false,providerStatusLookup:false,automaticBillableRetries:0,downloadedImageUrls:false,
      actualUsage:'cost_in_usd_ticks when present; exact ticks retained, micros rounded up'},
    limitations:['Mutable provider alias; no weights snapshot guarantee.','Bounded static PNG8 and baseline JPEG subset; color profiles, EXIF, progressive JPEG, animation and WebP rejected.','Reference editing medium only, documented default; input price from dated publication, not live metadata.',
      'Metadata GET is non-generating; model access/credit can still fail on submission.',
      'App caps apply to API inference USD, excluding tax, FX, hosting and use of the key elsewhere.',
      'No live credential, image generation or invoice verification in the adapter test suite.']
  });
}
