import * as domain from '../domain/index.mjs';
import {verifyProductEditLineage} from './product-source-lineage.mjs';
import {createMechanicsDomainAdapter,DATUMS} from '../kernel/mechanics/src/domain-adapter.mjs';
import {canonicalJSON,cloneJSON,sha256,keys} from '../storage/common.mjs';
import {domainStateFingerprint} from '../storage/history.mjs';
import {packProductRequest,readProductHead,readProductSemantics} from '../core/product-operations.mjs';
import {productExportDescriptor} from '../core/product-export-descriptor.mjs';
import {FIELD_MAP} from '../kernel/mechanics/src/catalog-map.mjs';
import {readArchSnapshot} from '../viewport/arch-view.mjs';
import {PRODUCT_MATERIAL_ROLES,ProductMaterialError,validateProductMaterialExtension as validateMaterialContract} from '../contracts/product-material.mjs';

export const PRODUCT_APP_VERSION='arch-product-app/1';
export const PRODUCT_MECHANICS_SEMANTICS=3;
export const PRODUCT_SOURCE_SEMANTICS=2;
export const PRODUCT_ROLES=PRODUCT_MATERIAL_ROLES;
const VERSION='arch-app-adapters/1',BINDINGS='arch-product-bindings/1',CONTEXTS='arch-product-contexts/1';
const hashPattern=/^[a-f0-9]{64}$/,encode=new TextEncoder();
const encodeDomain=createMechanicsDomainAdapter(domain);
const ART_HEIGHT_FIELD=FIELD_MAP.find(f=>f.id==='artH').abiId;
export class ProductAppError extends Error {
 constructor(code,details={}){super(code);this.name='ProductAppError';this.code=code;this.details=details;}
}
const need=(value,code,details)=>{if(!value)throw new ProductAppError(code,details);};
const same=(a,b)=>canonicalJSON(a)===canonicalJSON(b);
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const json=value=>cloneJSON(value);
const boundedJSON=(value,max,code)=>{const copy=json(value);need(encode.encode(canonicalJSON(copy)).length<=max,code);return copy;};
const name=(s,code='PRODUCT_STABLE_KEY')=>{need(typeof s==='string'&&s.length>0&&encode.encode(s).length<=200&&!/[\u0000-\u001f\u007f]/.test(s)&&s.normalize('NFC')===s,code);return s;};
const hash=(s,code='PRODUCT_HASH')=>{need(typeof s==='string'&&hashPattern.test(s),code);return s;};
const int=(n,min,max,code)=>{need(Number.isSafeInteger(n)&&n>=min&&n<=max,code);return n;};
const finite=(v,min,max,code)=>{need(Number.isFinite(v)&&v>=min&&v<=max,code);return v;};
function control(c){
 need(c?.version===VERSION&&c.ticket&&c.signal&&typeof c.onProgress==='function','PRODUCT_CONTROL');
 need(!c.signal.aborted,'PRODUCT_CANCELLED');
 for(const k of ['id','userId','projectId'])name(c.ticket[k],'PRODUCT_TICKET');
 int(c.ticket.revision,0,Number.MAX_SAFE_INTEGER-1,'PRODUCT_TICKET');int(c.ticket.generation,1,Number.MAX_SAFE_INTEGER,'PRODUCT_TICKET');
}
async function asset(assets,source,h,length=null){
 hash(h);need(source.assetHashes.includes(h),'PRODUCT_UNREFERENCED_ASSET');
 const b=assets.get(h);need(b instanceof Uint8Array&&b.length>0&&b.length<=64*1024*1024,'PRODUCT_ASSET_MISSING');
 need(length===null||length===b.length,'PRODUCT_ASSET_LENGTH');need(await sha256(b)===h,'PRODUCT_ASSET_HASH');return b;
}
function height(value,provenanceId,expectedDatum=null,fieldId=0,probe=false){
 keys(value,['mode','origin','datum','referenceLayer','layerCount','value']);
 need(([1,2].includes(value.mode)||probe&&value.mode===5)&&[0,1,2].includes(value.origin),'PRODUCT_HEIGHT_RECORD');
 int(value.datum,0,134,'PRODUCT_DATUM');
 need(value.datum<=11||value.datum>=128,'PRODUCT_DATUM');
 if(expectedDatum!==null)need(value.datum===expectedDatum||value.datum===0&&value.referenceLayer===0,'PRODUCT_TEXT_DATUM');
 if(probe&&value.mode===5)need(value.referenceLayer===0xffffffff&&value.layerCount>0&&value.value===0,'PRODUCT_DATUM_PROBE_RECORD');else int(value.referenceLayer,0,1000000,'PRODUCT_REFERENCE_LAYER');
 int(value.layerCount,0,1000000,'PRODUCT_LAYER_COUNT');
 finite(value.value,0,10000,'PRODUCT_HEIGHT_VALUE');
 need(value.mode===1?value.layerCount===0:value.value===0,'PRODUCT_HEIGHT_MODE');
 // Do not translate or repair these references. Native actual-face checks decide.
 return {fieldId,...value,provenanceId};
}
/** Stable source identity is independent of current color, array order and bytes.
 * All full digests are retained. The high bit separates these IDs from the
 * domain adapter's small parameter provenance table; a 63-bit collision blocks.
 */
export async function deriveProductIdentities({projectId,sourceId,keys:entries}){
 name(projectId);name(sourceId);
 need(Array.isArray(entries)&&entries.length<=1024,'PRODUCT_IDENTITY_BUDGET');
 const ids=new Map(),tuples=new Set(),result=[];
 for(const entry of entries){
  keys(entry,['kind','key']);name(entry.kind);name(entry.key);
  const tuple=['arch-product-identity/1',projectId,sourceId,entry.kind,entry.key],serialized=canonicalJSON(tuple);
  need(!tuples.has(serialized),'PRODUCT_IDENTITY_DUPLICATE');tuples.add(serialized);
  const digest=await sha256(serialized),id=(BigInt('0x'+digest.slice(0,16))|0x8000000000000000n).toString();
  need(!ids.has(id),'PRODUCT_IDENTITY_COLLISION',{id});ids.set(id,digest);
  result.push({kind:entry.kind,key:entry.key,id,sha256:digest,tuple});
 }
 return freeze(result);
}
function bindingRecord(state,ticket,probe=false){
 const src=state.content?.app?.source;
 need(src&&['svg','raster','text','emoji'].includes(src.kind)&&state.sourceKind===src.kind,'PRODUCT_SOURCE_REQUIRED');
 name(src.id);int(src.revision,0,Number.MAX_SAFE_INTEGER-1,'PRODUCT_SOURCE_REVISION');hash(src.raw?.hash);
 need(Array.isArray(src.assetHashes)&&src.assetHashes.length<=10000,'PRODUCT_SOURCE_ASSETS');
 const context=src.metadata?.sourceContext;
 need(context?.version==='arch-source-context/1'&&context.id===src.id&&context.revision===src.revision,'PRODUCT_SOURCE_CONTEXT');
 need(src.metadata?.productBindings,'PRODUCT_BINDINGS_REQUIRED');
 if(src.metadata.productBindings.version==='arch-product-bindings-pending/1'){
  const p=src.metadata.productBindings;
  need(p.projectId===ticket.projectId&&p.sourceId===src.id&&p.sourceRevision===src.revision&&p.rawHash===src.raw.hash,'PRODUCT_BINDINGS_STALE');
  throw new ProductAppError('PRODUCT_SOURCE_CONVERSION_REQUIRED',{reason:p.reason,requiredAction:p.requiredAction,sourceId:src.id,sourceRevision:src.revision});
 }
 const b=boundedJSON(src.metadata?.productBindings,60000,'PRODUCT_BINDING_BUDGET');
 need(encode.encode(canonicalJSON(src.metadata)).length<=65536,'PRODUCT_SOURCE_METADATA_BUDGET');
 keys(b,['version','projectId','sourceId','sourceRevision','rawHash','contexts','regions','roles','texts','eyeletTextKey','sourceToleranceMm','textStateHash','nextRegionSerial','retiredRegions','adoptionProvenance','identityLedger','heightBindingEvidence'],['version','projectId','sourceId','sourceRevision','rawHash','contexts','regions','roles','texts','eyeletTextKey','sourceToleranceMm','textStateHash']);
 need(b.version===BINDINGS&&b.projectId===ticket.projectId&&b.sourceId===src.id&&b.sourceRevision===src.revision&&b.rawHash===src.raw.hash,'PRODUCT_BINDINGS_STALE');
 finite(b.sourceToleranceMm,.000001,.004,'PRODUCT_SOURCE_TOLERANCE');
 need(Array.isArray(b.contexts)&&b.contexts.length>=1&&b.contexts.length<=33,'PRODUCT_CONTEXT_LIMIT');
 const ctx=new Set();
 for(const x of b.contexts){
  keys(x,['key','sha256','derivationHash']);name(x.key);hash(x.sha256);
  need(x.derivationHash===null||hashPattern.test(x.derivationHash),'PRODUCT_DERIVATION_HASH');
  need(!ctx.has(x.key),'PRODUCT_CONTEXT_DUPLICATE');ctx.add(x.key);
 }
 need(Array.isArray(b.regions)&&b.regions.length>=1&&b.regions.length<=256,'PRODUCT_REGION_LIMIT');
 const regionKeys=new Set(),selectors=new Set();
 for(const r of b.regions){
  keys(r,['sourceKey','contextKey','nativeKey','materialId','textKey','height','geometryHash','authoredKey'],['sourceKey','contextKey','nativeKey','materialId','textKey','height']);
  name(r.sourceKey);name(r.nativeKey);name(r.materialId);
  need(ctx.has(r.contextKey),'PRODUCT_CONTEXT_MISSING');
  const selector=canonicalJSON([r.contextKey,r.nativeKey]);
  need(!regionKeys.has(r.sourceKey)&&!selectors.has(selector),'PRODUCT_REGION_DUPLICATE');
  regionKeys.add(r.sourceKey);selectors.add(selector);
  need(r.textKey===null||typeof r.textKey==='string','PRODUCT_TEXT_KEY');
  if(r.height!==null)height(r.height,'1',null,0,probe);
 }
 keys(b.roles,PRODUCT_ROLES);
 for(const role of PRODUCT_ROLES)name(b.roles[role]);
 need(Array.isArray(b.texts)&&b.texts.length<=32,'PRODUCT_TEXT_LIMIT');
 const textKeys=new Set();
 for(const t of b.texts){
  keys(t,['sourceKey','placement','baseOn','basePad','baseRound','height','baseHeight']);
  name(t.sourceKey);need(!textKeys.has(t.sourceKey),'PRODUCT_TEXT_DUPLICATE');textKeys.add(t.sourceKey);
  int(t.placement,0,1,'PRODUCT_TEXT_PLACEMENT');need(typeof t.baseOn==='boolean','PRODUCT_TEXT_BASE');
  finite(t.basePad,0,100,'PRODUCT_TEXT_BASE');finite(t.baseRound,0,100,'PRODUCT_TEXT_BASE');
  height(t.height,'1',133,0,probe);height(t.baseHeight,'1',134,0,probe);
  need(b.regions.some(r=>r.textKey===t.sourceKey),'PRODUCT_TEXT_REGION_REQUIRED');
 }
 for(const r of b.regions)need(r.textKey===null||textKeys.has(r.textKey),'PRODUCT_ORPHAN_TEXT_REGION');
 need(b.eyeletTextKey===null||textKeys.has(b.eyeletTextKey),'PRODUCT_EYELET_TEXT');
 need(b.textStateHash===null||hashPattern.test(b.textStateHash),'PRODUCT_TEXT_STATE_HASH');
 return {source:src,bindings:b};
}
async function authorizeSource(source,state,ticket,assets){
 if(!source.raster){need(source.kind==='svg'||source.metadata?.numericSvgHash,'PRODUCT_TEXT_OUTLINES_UNAVAILABLE');return null;}
 const r=source.metadata?.confirmationReceipt,p=source.metadata?.rasterPreparation??source.metadata?.sourceConversion;
 need(r?.version==='arch-source-confirmation-receipt/1'&&p,'PRODUCT_SOURCE_CONSENT_REQUIRED');
 for(const k of ['approvalHash','proposalHash','sourceHash','rgbaHash','settingsHash'])hash(r[k],'PRODUCT_SOURCE_RECEIPT');
 need(['raster','text','emoji'].includes(r.kind)&&r.projectId===ticket.projectId&&r.sourceRevision===source.revision&&r.sourceHash===source.raw.hash&&r.rgbaHash===source.raster.rgba&&r.acceptedAtRevision<=state.revision,'PRODUCT_SOURCE_RECEIPT_STALE');
 int(r.acceptedAtRevision,1,Number.MAX_SAFE_INTEGER-1,'PRODUCT_SOURCE_RECEIPT_STALE');
 need(r.approvalHash===p.approvalHash&&r.proposalHash===(p.proposalHash??p.receipt?.proposalHash)&&r.settingsHash===p.settingsHash,'PRODUCT_SOURCE_RECEIPT_STALE');
 if(source.metadata.rasterPreparation){
  const {approvalHash,...payload}=p;
  need(await sha256(canonicalJSON(payload))===approvalHash,'PRODUCT_SOURCE_PREPARATION_HASH');
  need(p.context?.projectId===ticket.projectId&&p.context.sourceRevision===source.revision&&same(p.context.sourceContext,source.metadata.sourceContext)&&r.acceptedAtRevision===p.context.baseRevision+1&&p.input?.originalHash===r.sourceHash&&p.input.rgbaHash===r.rgbaHash,'PRODUCT_SOURCE_PREPARATION_CONTEXT');
 }
 await asset(assets,source,r.rgbaHash,source.raster.width*source.raster.height*4);
 return freeze(json(r));
}
function materialTable(state,b,probe=false){
 const values=state.content.app.materials;
 need(Array.isArray(values)&&values.length<=256,'PRODUCT_MATERIAL_LIMIT');
 const map=new Map();
 for(const m of values){name(m.id);need(!map.has(m.id),'PRODUCT_MATERIAL_DUPLICATE');map.set(m.id,m);}
 const used=new Set([...Object.values(b.roles),...b.regions.map(r=>r.materialId)]);
 for(const id of used){
  const m=map.get(id);
  need(m&&!m.excluded,'PRODUCT_MATERIAL_UNAVAILABLE',{materialId:id});
  need(/^#[a-f0-9]{6}$/i.test(m.color)&&typeof m.overridden==='boolean','PRODUCT_MATERIAL_COLOR');
  int(m.slot,1,16,'PRODUCT_MATERIAL_SLOT');
  if(m.heightLayers!==undefined){
   int(m.heightLayers,1,1000000,'PRODUCT_REGION_HEIGHT');
   const selected=b.regions.filter(r=>r.materialId===id);
   need(selected.length>0&&selected.every(r=>(r.height?.mode===2||probe&&r.height?.mode===5)&&r.height.layerCount===m.heightLayers),'PRODUCT_REGION_DATUM_REQUIRED',{materialId:id});
  }
 }
 for(const m of values)need(m.excluded||m.product?.active===false||used.has(m.id),'PRODUCT_UNMAPPED_MATERIAL',{materialId:m.id});
 const slots=new Map();for(const id of used){const m=map.get(id),color=m.color.toLowerCase();if(slots.has(m.slot))need(slots.get(m.slot)===color,'PRODUCT_SLOT_CONFLICT',{slot:m.slot,materialId:id});else slots.set(m.slot,color);}
 return {map,used};
}
function checkFeatures(state,b,probe=false){
 const values=domain.effectiveValues(state);
 need(!values.impOn,'IMPORT_CSG_UNAVAILABLE',{field:'impOn',requires:'parent actual import CSG executor'});
 need(!b.regions.some(r=>state.content.app.materials.find(m=>m.id===r.materialId)?.excluded),'PRODUCT_REGION_EXCLUSION_UNAVAILABLE');
 const t=state.content.app.text;
 if(t?.text){
  if(t.asSource){
   need(state.content.app.source.kind==='text'&&state.content.app.source.metadata.originalText===t.text&&b.texts.length===0,'PRODUCT_TEXT_SOURCE_IDENTITY');
   need(b.regions.every(r=>r.textKey===null),'PRODUCT_TEXT_SOURCE_ROLE');
  }
  need(b.texts.length>0||t.asSource&&['text','emoji'].includes(state.content.app.source.kind),'PRODUCT_TEXT_CONTEXT_REQUIRED');
  need(!t.bevelEnabled,'PRODUCT_TEXT_BEVEL_UNAVAILABLE',{field:'app.text.bevelEnabled'});
  if(!t.asSource){
   need(b.texts.length===1,'PRODUCT_APP_TEXT_CARDINALITY');
   const spec=b.texts[0];
   need((spec.height.mode===2||probe&&spec.height.mode===5)&&spec.height.layerCount===Number(t.heightLayers)&&spec.placement===(t.placement==='on-model'?0:1)&&spec.baseOn===t.baseEnabled,'PRODUCT_TEXT_RECORD_MISMATCH');
   if(t.baseEnabled){
    need(Number(t.baseWidthMm)===0,'PRODUCT_TEXT_ABSOLUTE_BASE_WIDTH_UNAVAILABLE');
    need((spec.baseHeight.mode===2||probe&&spec.baseHeight.mode===5)&&spec.baseHeight.layerCount===Number(t.baseThicknessLayers)&&spec.baseRound===Number(t.baseRadiusMm),'PRODUCT_TEXT_RECORD_MISMATCH');
   }
  }
 }
 return values;
}
function nativeSource(p,b){
 need(p?.version===CONTEXTS&&typeof p.assertOwned==='function','PRODUCT_PREPARED_SOURCE');
 need(Array.isArray(p.contexts)&&p.contexts.length===b.contexts.length,'PRODUCT_CONTEXT_COVERAGE');
 const contextRows=[],selectors=new Map();let count=0;
 p.contexts.forEach((c,slot)=>{
  const declared=b.contexts[slot];
  need(c.key===declared.key&&c.sourceHash===declared.sha256&&c.derivationHash===declared.derivationHash,'PRODUCT_CONTEXT_HASH');
  need(Array.isArray(c.regions)&&c.regions.length>0,'PRODUCT_CANONICAL_REGIONS');
  const seen=new Set();
  for(const r of c.regions){
   keys(r,['nativeKey','sourceIndex']);name(r.nativeKey);int(r.sourceIndex,0,255,'PRODUCT_SOURCE_INDEX');
   need(!seen.has(r.sourceIndex),'PRODUCT_SOURCE_INDEX_DUPLICATE');seen.add(r.sourceIndex);
   const key=canonicalJSON([c.key,r.nativeKey]);need(!selectors.has(key),'PRODUCT_NATIVE_KEY_AMBIGUOUS');
   selectors.set(key,{contextSlot:slot,sourceIndex:r.sourceIndex});count++;
  }
  // Sparse original source indices are legal after native paint occlusion;
  // uniqueness plus exact region coverage checks every surviving native part.
  contextRows.push(json(c));
 });
 need(count===b.regions.length&&count<=256&&b.regions.every(r=>selectors.has(canonicalJSON([r.contextKey,r.nativeKey]))),'PRODUCT_REGION_COVERAGE');
 const s=cloneJSON(p.source,{denySecrets:false}); // Opaque runtime token, never project metadata.
 need(['svg','contexts','snapshot','raster-token'].includes(s.kind),'PRODUCT_SOURCE_KIND');
 need(Array.isArray(p.references)&&p.references.length<=33,'PRODUCT_CONTEXT_OWNERSHIP');
 if(s.kind==='svg'){
  need(b.contexts.length===1&&typeof s.source==='string'&&encode.encode(s.source).length<=1048576,'PRODUCT_SVG_LIMIT');
  need((s.toleranceMm??.001)===b.sourceToleranceMm,'PRODUCT_SOURCE_TOLERANCE_MISMATCH');
 }else{
  const refs=s.kind==='contexts'?s.contexts:[s];
  need(Array.isArray(refs)&&refs.length===b.contexts.length&&p.references.length===refs.length,'PRODUCT_CONTEXT_OWNERSHIP');
  refs.forEach((r,i)=>{
   need(typeof p.references[i]==='function','PRODUCT_CONTEXT_OWNERSHIP');
   const actual=p.references[i]();need(same(r.translationNm??null,actual.translationNm??null),'PRODUCT_CONTEXT_TRANSLATION_OWNERSHIP');need(r.epoch===p.epoch&&actual.epoch===p.epoch,'PRODUCT_CONTEXT_EPOCH');
   if(r.token!==undefined){
    name(r.token,'PRODUCT_SOURCE_TOKEN');
    need(actual.kind==='raster-token'&&r.token===actual.token&&r.id===undefined&&r.generation===undefined&&r.acceptedHandle===undefined,'PRODUCT_CONTEXT_OWNERSHIP');
   }else{
    need(actual.kind==='snapshot'&&r.id===actual.id&&r.generation===actual.generation,'PRODUCT_CONTEXT_OWNERSHIP');
    int(r.id,1,0xffffffff,'PRODUCT_CONTEXT_OWNERSHIP');int(r.generation,1,0xfffffffe,'PRODUCT_CONTEXT_GENERATION');
   }
   if(s.kind==='contexts')need(r.sourceHash===b.contexts[i].sha256,'PRODUCT_CONTEXT_HASH');
  });
 }
 return {source:s,selectors,contextRows};
}
/** App-facing product engine using the parent's scheduler and immutable leases.
 * withPreparedSource is a trusted parent source-service boundary. It must
 * independently replay/check derivations; source receipts are not authentication.
 */
export function createProductAdapters({operation,kernelLeases,context,withPreparedSource,withPreparedDatumSource=null,probeNative=null,onGeometryProposal=null,onSourceProposal=null,generatedBaseAuthority=null}={}){
 need(typeof operation==='function'&&kernelLeases instanceof WeakMap&&typeof context==='function'&&typeof withPreparedSource==='function','PRODUCT_ADAPTER_BINDING');
 need((onGeometryProposal===null||typeof onGeometryProposal==='function')&&(onSourceProposal===null||typeof onSourceProposal==='function'),'PRODUCT_PROPOSAL_CALLBACK');
 let epoch=1;const preparedJobs=new WeakMap(),modelRecords=new WeakMap(),models=new Set(),proposals=new Set(),preparations=new Set();
 async function authority(c,state,headHash,e){
  e.generatedBase?.assertCurrent();
  control(c);need(epoch===e.epoch,'PRODUCT_PRIVATE_RESET');
  const live=context();
  need(live&&live.sessionKey===e.sessionKey&&live.userId===c.ticket.userId&&live.projectId===c.ticket.projectId&&live.state?.revision===c.ticket.revision,'PRODUCT_AUTHORITY_CHANGED');
  const captured=json(live.state);
  need(await domainStateFingerprint(captured)===(e.baseHash??headHash),'PRODUCT_HEAD_CHANGED');
  const after=context();need(after?.sessionKey===e.sessionKey&&after?.userId===c.ticket.userId&&after.projectId===c.ticket.projectId&&same(after.state,captured),'PRODUCT_AUTHORITY_CHANGED');
  control(c);need(epoch===e.epoch,'PRODUCT_PRIVATE_RESET');
 }
 async function prepareRecipe(input,consume,probe=false){
  need(typeof consume==='function','PRODUCT_RECIPE_CONSUMER_REQUIRED');
  control(input);const e={epoch,sessionKey:name(context()?.sessionKey,'PRODUCT_SESSION_CONTEXT')},c={...input,ticket:freeze(json(input.ticket))},state=domain.validateProject(probe?input.prospectiveState:input.state);
  const delegated=input.generatedBase===undefined?null:(need(!probe&&typeof generatedBaseAuthority==='function','PRODUCT_GENERATED_BASE_AUTHORITY'),generatedBaseAuthority(input.generatedBase));
  if(delegated){delegated.assertCurrent();need(same(state,delegated.state),'PRODUCT_GENERATED_BASE_STATE');e.generatedBase=delegated;}
  need(state.revision===c.ticket.revision+(probe?1:0),'PRODUCT_REVISION');
  if(probe){need(typeof withPreparedDatumSource==='function'&&typeof probeNative==='function','PRODUCT_DATUM_PROBE_BINDINGS');
   const base=domain.validateProject(input.state);need(base.revision===c.ticket.revision,'PRODUCT_REVISION');e.baseHash=await domainStateFingerprint(base);
  }
  const {source,bindings:b}=bindingRecord(state,c.ticket,probe),materials=materialTable(state,b,probe);
  checkFeatures(state,b,probe);
  // Capture bytes synchronously before the first yield. No mutable request shares
  // source buffers with UI, caller or the module.
  need(input.assets instanceof Map&&input.assets.size<=10000,'PRODUCT_ASSETS');
  const assets=new Map();let total=0;
  for(const h of source.assetHashes){
   const a=input.assets.get(h);need(a instanceof Uint8Array,'PRODUCT_ASSET_MISSING');
   total+=a.length;need(total<=128*1024*1024,'PRODUCT_ASSET_BUDGET');assets.set(h,a.slice());
  }
  const headHash=delegated?hash(delegated.headHash):await domainStateFingerprint(state);
  await authority(c,state,headHash,e);
  await asset(assets,source,source.raw.hash,source.raw.byteLength);
  const receipt=await authorizeSource(source,state,c.ticket,assets);
  if(state.content.app.text?.text){
   need(b.textStateHash===await sha256(canonicalJSON(state.content.app.text)),'PRODUCT_TEXT_STATE_STALE');
  }else need(b.texts.length===0&&b.textStateHash===null,'PRODUCT_TEXT_STATE_STALE');
  for(const ctx of b.contexts)await asset(assets,source,ctx.sha256);
  if(!source.raster&&source.kind==='svg')need(b.contexts[0].sha256===source.raw.hash&&b.contexts[0].derivationHash===null,'PRODUCT_SVG_CONTEXT_HASH');
  if(!source.raster&&['text','emoji'].includes(source.kind)){
   need(b.contexts[0].sha256===source.metadata.numericSvgHash&&b.contexts[0].derivationHash!==null,'PRODUCT_TEXT_DERIVATION_REQUIRED');
  }
  const record=encodeDomain(state);
  need(record.mechanicsSemanticsVersion===PRODUCT_MECHANICS_SEMANTICS&&record.sourceHeightSemanticsVersion===PRODUCT_SOURCE_SEMANTICS,'PRODUCT_DOMAIN_SEMANTICS');
  const entries=[{kind:'source',key:'root'},{kind:'provenance',key:'root'},
   ...b.regions.flatMap(r=>[{kind:'region',key:r.sourceKey},{kind:'region-provenance',key:r.sourceKey}]),
   ...b.texts.flatMap(t=>[{kind:'text',key:t.sourceKey},{kind:'text-provenance',key:t.sourceKey},{kind:'text-height',key:t.sourceKey},{kind:'text-base-height',key:t.sourceKey}]),
   ...[...materials.used].sort().map(id=>({kind:'material',key:id}))];
  const identities=await deriveProductIdentities({projectId:c.ticket.projectId,sourceId:source.id,keys:entries});
  if(b.identityLedger){
   const ledger=b.identityLedger;
   need(ledger.version==='arch-product-identities/1'&&same(ledger.records,identities),'PRODUCT_IDENTITY_LEDGER_CHANGED');
  }
  const id=(kind,key)=>identities.find(r=>r.kind===kind&&r.key===key).id;
  let owner=null,nativeEpoch=null,closed=false,busy=false,calls=0,consumed,callbackOpen=true;
  async function run(invoke){
   need(!closed&&!busy,'PRODUCT_PREPARATION_CLOSED_OR_CONCURRENT');busy=true;
   try{
    await authority(c,state,headHash,e);
    return await operation(c,async(client,generation)=>{
     if(owner)need(owner===client&&nativeEpoch===client.epoch,'PRODUCT_CONTEXT_RETIRED');
     const output=await invoke(client,generation);
     // Caller owns any returned lease even if cancellation occurs after dispatch;
     // do not throw here before the trusted preparation can release it.
     owner=client;nativeEpoch=client.epoch;return output;
    });
   }finally{busy=false;}
  }
  try{
   const delivered=await (probe?withPreparedDatumSource:withPreparedSource)({control:c,state,assets,source,bindings:freeze(b),domainRecord:record,receipt,run,...(delegated?{generatedBase:input.generatedBase}:{}),...(probe?{baseState:input.state,sourceAuthority:input.sourceAuthority}:{})},async prepared=>{
   need(callbackOpen&&calls++===0,'PRODUCT_SOURCE_CONSUMER_PROTOCOL');
   closed=true;
   need(!busy,'PRODUCT_PREPARATION_PENDING');
   await authority(c,state,headHash,e);
   if(!owner){owner=prepared?.owner;nativeEpoch=prepared?.epoch;}
   need(prepared?.owner===owner&&owner&&prepared.epoch===nativeEpoch&&nativeEpoch===owner.epoch,'PRODUCT_CONTEXT_OWNER');
   prepared.assertOwned();
   const native=nativeSource(prepared,b);
   if(native.source.kind==='svg')need(await sha256(native.source.source)===b.contexts[0].sha256,'PRODUCT_CONTEXT_HASH');
   if(source.raster)need(same(prepared.authorization,receipt),'PRODUCT_PREPARATION_AUTHORIZATION');
   else need(prepared.authorization===null,'PRODUCT_PREPARATION_AUTHORIZATION');
   if(state.content.app.text?.text)need(prepared.textStateHash===b.textStateHash,'PRODUCT_TEXT_PARAMETERS_UNAPPLIED');
   const upstream=record.records.filter(r=>r.fieldId>=1&&r.fieldId<=7).sort((a,b)=>a.fieldId-b.fieldId);
   if(source.raster){
    need(Array.isArray(prepared.upstreamBindings)&&prepared.upstreamBindings.length===7,'PRODUCT_UPSTREAM_BINDINGS_REQUIRED');
    const plain=r=>({fieldId:r.fieldId,mode:r.mode,value:r.value});
    need(same(upstream.map(plain),prepared.upstreamBindings.map(plain)),'PRODUCT_UPSTREAM_BINDINGS_STALE');
   }
   const palette=PRODUCT_ROLES.map((role,number)=>mat(b.roles[role],number));
   function mat(materialId,role){
    const m=materials.map.get(materialId);
    return {role,rgba:parseInt(m.color.slice(1)+'ff',16),slot:m.slot,origin:m.overridden?1:0,provenanceId:id('material',materialId)};
   }
   const regions=b.regions.map(r=>({...native.selectors.get(canonicalJSON([r.contextKey,r.nativeKey])),
    semanticId:id('region',r.sourceKey),provenanceId:id('region-provenance',r.sourceKey),
    textGroup:r.textKey===null?'0':id('text',r.textKey),material:mat(r.materialId,r.textKey===null?1:7),
    overrideHeight:r.height!==null,...(r.height!==null?{height:height(r.height,id('region-provenance',r.sourceKey),null,ART_HEIGHT_FIELD,probe)}:{})}));
   const texts=b.texts.map(t=>({semanticId:id('text',t.sourceKey),provenanceId:id('text-provenance',t.sourceKey),
    placement:t.placement,baseOn:t.baseOn,basePad:t.basePad,baseRound:t.baseRound,
    height:height(t.height,id('text-height',t.sourceKey),133,0,probe),baseHeight:height(t.baseHeight,id('text-base-height',t.sourceKey),134,0,probe)}));
   const contextHash=await sha256(canonicalJSON({contexts:native.contextRows,rawHash:source.raw.hash,sourceRevision:source.revision,receipt,bindings:b}));
   const provenance={...(delegated?{generatedBase:json(delegated.provenance)}:{}),kind:PRODUCT_APP_VERSION,projectId:c.ticket.projectId,sourceId:source.id,sourceRevision:source.revision,rawHash:source.raw.hash,
    bindingsHash:await sha256(canonicalJSON(b)),contextHash,contexts:native.contextRows,sourceReceipt:receipt,identities,
    regionSources:b.regions.map((r,i)=>({...native.selectors.get(canonicalJSON([r.contextKey,r.nativeKey])),sourceKey:r.nativeKey,stableSourceKey:r.sourceKey,semanticId:regions[i].semanticId})),
    materials:[...materials.used].sort().map(materialId=>({id:materialId,...mat(materialId,0)})),
    roleBindings:json(b.roles),textStateHash:b.textStateHash,
    sourceArtifacts:source.metadata.productArtifacts?boundedJSON(source.metadata.productArtifacts,32768,'PRODUCT_SOURCE_ARTIFACT_BUDGET'):null,
    sourceGeometry:b.regions.map(r=>({sourceKey:r.sourceKey,contextKey:r.contextKey,geometryHash:r.geometryHash??null,authoredKey:r.authoredKey??null}))};
   const packed=packProductRequest({domainRecord:record,headHash,sourceHash:b.contexts[0].sha256,
    sourceId:id('source','root'),provenanceId:id('provenance','root'),regions,texts,materials:palette,upstreamBindings:upstream,provenance,
    eyeletTextId:b.eyeletTextKey===null?'0':id('text',b.eyeletTextKey),sourceToleranceMm:b.sourceToleranceMm,datumProbe:probe});
   await authority(c,state,headHash,e);
   const wireHash=await sha256(packed),recipeSource=freeze(cloneJSON(native.source,{denySecrets:false}));
   const value={recipe:Object.freeze({kind:'product',packed,source:recipeSource}),headHash,revision:state.revision,contextHash,
    async assertCurrent(){need(preparedJobs.has(value),'PRODUCT_PREPARED_RELEASED');prepared.assertOwned();need(owner.epoch===nativeEpoch,'PRODUCT_CONTEXT_RETIRED');await authority(c,state,headHash,e);need(await sha256(packed)===wireHash,'PRODUCT_PREPARED_MUTATED');},
    };
   preparedJobs.set(value,{c,state,headHash,sourceHash:b.contexts[0].sha256,contextHash,owner,nativeEpoch,e,provenance,wire:packed.slice()});
   preparations.add(value);
   try{consumed=await consume(Object.freeze(value));return consumed;}
   finally{preparedJobs.delete(value);preparations.delete(value);}
   });
   if(calls===0&&delivered?.status==='proposal'){
    need(onSourceProposal?.(delivered)===true,'PRODUCT_SOURCE_PROPOSAL_UNHANDLED',{sourceId:source.id,sourceRevision:source.revision});
    throw new ProductAppError('PRODUCT_SOURCE_PROPOSAL_REQUIRED',{sourceId:source.id,sourceRevision:source.revision});
   }
   need(calls===1&&delivered===consumed,'PRODUCT_SOURCE_CONSUMER_PROTOCOL');
   return consumed;
  }finally{closed=true;callbackOpen=false;}
 }
 async function mapModelLease({prepared,root,client,generation}){
  const r=preparedJobs.get(prepared);need(r,'PRODUCT_PREPARED_RELEASED');
  await prepared.assertCurrent();
  need(client===r.owner&&client.epoch===r.nativeEpoch&&root.epoch===r.nativeEpoch&&root.generation===generation,'PRODUCT_MODEL_OWNER');
  const snapshot=readArchSnapshot(root.bytes()),sem=readProductSemantics(root.metadata?.semanticBytes),head=readProductHead(root.metadata.descriptor);
  need(sem.mechanicsSemantics===PRODUCT_MECHANICS_SEMANTICS,'PRODUCT_MECHANICS_SEMANTICS_UNQUALIFIED');
  need(sem.sourceSemantics===PRODUCT_SOURCE_SEMANTICS,'PRODUCT_SOURCE_SEMANTICS_UNQUALIFIED');
  const prefix=encode.encode('arch-product-request-v1\0'),requestInput=new Uint8Array(prefix.length+32+r.wire.length);
  requestInput.set(prefix);requestInput.set(Uint8Array.from(hash(head.canonicalSourceHash).match(/../g),x=>parseInt(x,16)),prefix.length);requestInput.set(r.wire,prefix.length+32);
  need(await sha256(requestInput)===head.requestHash,'PRODUCT_MODEL_REQUEST_HASH');
  await authority(r.c,r.state,r.headHash,r.e);
  need(snapshot.generation===generation&&snapshot.bounds&&head.headHash===r.headHash&&head.revision===String(r.state.revision)&&head.sourceHash===r.sourceHash,'PRODUCT_MODEL_HEAD');
  need(sem.product===domain.PRODUCT_IDS.indexOf(r.state.product)&&sem.revision===head.revision&&sem.sourceId===r.provenance.identities.find(x=>x.kind==='source').id,'PRODUCT_MODEL_SEMANTICS');
  need(sem.provenance.contextHash===r.contextHash&&same(sem.provenance.identities,r.provenance.identities),'PRODUCT_MODEL_CONTEXT');
  const descriptor=productExportDescriptor(root,{headHash:r.headHash,revision:r.state.revision});
  const arch=readArchSnapshot(root.bytes());
  descriptor.parts=descriptor.parts.map(p=>({...p,sourceIndex:arch.parts[p.partIndex].sourceIndex}));
  const {tables:discardTables,bytes:discardBytes,...semanticData}=sem;
  const semanticHash=await sha256(root.metadata.semanticBytes),descriptorHash=await sha256(root.metadata.descriptor);
  const product=freeze(boundedJSON({version:PRODUCT_APP_VERSION,head,contextHash:r.contextHash,semantics:semanticData,exportDescriptor:descriptor},16*1024*1024,'PRODUCT_MODEL_METADATA_BUDGET'));
  const blocks=freeze(descriptor.parts.map(p=>({id:p.id,label:p.name,kind:p.role===0?'body':p.role===7||p.role===8?'text':p.role===1?'region':'other',
   materialId:p.materialId,role:PRODUCT_ROLES[p.role],sourceSemanticIds:p.sourceSemanticIds,partIndex:p.partIndex,featureIndex:p.featureIndex})));
  let released=false;
  const [widthMm,depthMm,heightMm]=snapshot.bounds.size;
  const model=Object.freeze({version:VERSION,ticket:freeze(json(r.c.ticket)),generation,leaseId:root.epoch+':'+root.id,product,blocks,
   stats:freeze({widthMm,depthMm,heightMm,triangles:snapshot.triangles.length/3,materialCount:new Set(blocks.map(b=>b.materialId)).size,verdict:'unverified'}),
   bytes(){need(!released&&epoch===r.e.epoch,'PRODUCT_LEASE_RELEASED');const live=context();need(live?.sessionKey===r.e.sessionKey&&live?.userId===r.c.ticket.userId&&live.projectId===r.c.ticket.projectId,'PRODUCT_AUTHORITY_CHANGED');return root.bytes();},
   release(){if(!released){released=true;kernelLeases.delete(model);modelRecords.delete(model);models.delete(model);root.release();}}});
  kernelLeases.set(model,{root,client});modelRecords.set(model,{r,root,client,semanticHash,descriptorHash});models.add(model);return model;
 }
 /** Current native build information, not final-export or physical-fit proof. */
 async function inspectModel({model,control:c}){
  control(c);const incoming=c;c={...c,ticket:freeze(json(c.ticket))};const record=modelRecords.get(model);need(record&&models.has(model),'PRODUCT_MODEL_UNREGISTERED');
  const {r,root,client}=record;
  const check=()=>{
   control(c);need(same(incoming.ticket,c.ticket),'PRODUCT_TICKET_CHANGED');const entry=kernelLeases.get(model);
   need(modelRecords.get(model)===record&&entry?.root===root&&entry.client===client,'PRODUCT_MODEL_UNREGISTERED');
   need(c.ticket.userId===r.c.ticket.userId&&c.ticket.projectId===r.c.ticket.projectId&&c.ticket.revision===r.state.revision,'PRODUCT_MODEL_HEAD');
   need(client.epoch===r.nativeEpoch&&root.epoch===r.nativeEpoch&&root.generation===model.generation,'PRODUCT_MODEL_RETIRED');
   model.bytes();
  };
  check();await authority(c,r.state,r.headHash,r.e);
  const semanticBytes=root.metadata.semanticBytes.slice(),descriptorBytes=root.metadata.descriptor.slice();
  need(await sha256(semanticBytes)===record.semanticHash&&await sha256(descriptorBytes)===record.descriptorHash,'PRODUCT_MODEL_METADATA_CHANGED');
  const sem=readProductSemantics(semanticBytes),head=readProductHead(descriptorBytes);
  need(same(head,model.product.head)&&sem.provenance.contextHash===r.contextHash,'PRODUCT_MODEL_CONTEXT');
  const descriptor=productExportDescriptor(root,{headHash:r.headHash,revision:r.state.revision});
  const arch=readArchSnapshot(root.bytes());
  descriptor.parts=descriptor.parts.map(p=>({...p,sourceIndex:arch.parts[p.partIndex].sourceIndex}));
  check();await authority(c,r.state,r.headHash,r.e);check();
  need(root.metadata.semanticBytes.length===semanticBytes.length&&semanticBytes.every((b,i)=>root.metadata.semanticBytes[i]===b)&&root.metadata.descriptor.length===descriptorBytes.length&&descriptorBytes.every((b,i)=>root.metadata.descriptor[i]===b),'PRODUCT_MODEL_METADATA_CHANGED');
  const {tables,bytes,...metadata}=sem;
  return freeze(boundedJSON({
   version:'arch-product-model-state/1',modelLeaseId:model.leaseId,head,contextHash:r.contextHash,
   snapshot:{id:root.id,generation:root.generation,epoch:root.epoch},
   source:{id:r.state.content.app.source.id,revision:r.state.content.app.source.revision,rawHash:r.state.content.app.source.raw.hash},
   semantics:metadata,exportDescriptor:descriptor,
   gates:{matchingHead:true,nativeBuildAccepted:sem.sourceVerdict===0&&sem.mechanicsVerdict===0&&!sem.exportBlocked,
    sourceVerdict:sem.sourceVerdict,mechanicsVerdict:sem.mechanicsVerdict,exportBlocked:sem.exportBlocked,
    independentMeshVerdict:0,requiresParentGateState:true,finalSceneValidation:'unverified',totalErrorBoundMm:sem.totalErrorBoundMm,fitQualification:sem.fitQualification,printerQualification:'unverified'}
  },16*1024*1024,'PRODUCT_MODEL_METADATA_BUDGET'));
 }
 /** Explicit edit proposal from current manufacturing faces. Native rebuild
  * remains the authority on changed geometry; no provisional model is built. */
 async function prepareHeightBindings({model,control:c,changes}){
  need(Array.isArray(changes)&&changes.length>0&&changes.length<=64,'PRODUCT_HEIGHT_CHANGE_LIMIT');
  changes=boundedJSON(changes,32768,'PRODUCT_HEIGHT_CHANGE_BUDGET');
  const current=await inspectModel({model,control:c}),record=modelRecords.get(model),state=record.r.state;
  const b=json(state.content.app.source.metadata.productBindings),materials=json(state.content.app.materials),text=json(state.content.app.text);
  const effective=domain.effectiveValues(state),sem=current.semantics,diagnostics=[],updates=[],parameters=[],seen=new Set();
  const id=(kind,key)=>sem.provenance.identities.find(x=>x.kind===kind&&x.key===key)?.id;
  const unit=z=>{
   need(Number.isFinite(z)&&z>=0&&z<=10000,'PRODUCT_FACE_COORDINATE');
   const n=Math.round(z*1e6);need(Number.isSafeInteger(n)&&Math.abs(z*1e6-n)<1e-5,'PRODUCT_FACE_COORDINATE');
   return BigInt(n); // Native f64 representation allowance only; no geometry move.
  };
  const diagnostic=(code,target,details={})=>{diagnostics.push({code,target,...details});};
  for(const change of changes){
   keys(change,['target','mode','layers','mm','binding'],['target','mode']);
   const target=change.target;need(target&&['parameter','region','text'].includes(target.kind),'PRODUCT_HEIGHT_TARGET');
   keys(target,target.kind==='parameter'?['kind','field']:target.kind==='region'?['kind','sourceKey']:['kind','sourceKey','field']);
   const signature=canonicalJSON(target);need(!seen.has(signature),'PRODUCT_HEIGHT_TARGET_DUPLICATE');seen.add(signature);
   need(['mm','layers'].includes(change.mode),'PRODUCT_HEIGHT_MODE');
   const unspecified=change.binding==='unspecified-mm';
   need(change.binding===undefined||change.binding==='actual-face'||unspecified,'PRODUCT_HEIGHT_BINDING_MODE');
   need(!unspecified||change.mode==='mm','PRODUCT_HEIGHT_BINDING_MODE');
   if(change.mode==='layers'){int(change.layers,1,1000000,'PRODUCT_LAYER_COUNT');need(change.mm===undefined,'PRODUCT_HEIGHT_MODE');}
   else{finite(change.mm,0,10000,'PRODUCT_HEIGHT_VALUE');domain.parseDecimal(change.mm);need(change.layers===undefined,'PRODUCT_HEIGHT_MODE');}
   let intervals,before,field,region,textRow;
   if(target.kind==='parameter'){
    name(target.field);need(domain.getField(target.field).type==='height','PRODUCT_HEIGHT_PARAMETER');
    field=sem.parameters.find(p=>p.field===target.field);need(field,'PRODUCT_HEIGHT_PARAMETER');
    intervals=sem.sourceIntervals.filter(i=>i.fieldId===field.fieldId);
    if(!intervals.length)intervals=sem.intervals.filter(i=>i.fieldId===field.fieldId);
    before=effective[target.field];
   }else if(target.kind==='region'){
    name(target.sourceKey);region=b.regions.find(r=>r.sourceKey===target.sourceKey);
    need(region&&region.textKey===null,'PRODUCT_HEIGHT_REGION');
    if(effective.artMode!=='noi'||!effective.splitObj){diagnostic('PRODUCT_REGION_HEIGHT_INACTIVE',target);continue;}
    const semanticId=id('region',target.sourceKey),art=sem.parameters.find(p=>p.field==='artH');
    intervals=sem.sourceIntervals.filter(i=>i.semanticId===semanticId&&i.fieldId===art?.fieldId&&i.datum===128);
    before=region.height;
    if(b.regions.filter(r=>r.materialId===region.materialId).length!==1){
     diagnostic('PRODUCT_SHARED_MATERIAL_HEIGHT_REQUIRES_GROUP_DECISION',target,{materialId:region.materialId});continue;
    }
   }else{
    name(target.sourceKey);need(['height','baseHeight'].includes(target.field),'PRODUCT_HEIGHT_TEXT_FIELD');
    textRow=b.texts.find(t=>t.sourceKey===target.sourceKey);need(textRow,'PRODUCT_HEIGHT_TEXT');
    if(change.mode==='mm'){diagnostic('PRODUCT_TEXT_MM_CONTROL_UNAVAILABLE',target);continue;}
    if(target.field==='baseHeight'&&!textRow.baseOn){diagnostic('PRODUCT_TEXT_BASE_INACTIVE',target);continue;}
    const semanticId=id('text',target.sourceKey),datum=target.field==='height'?133:134;
    intervals=sem.sourceIntervals.filter(i=>i.semanticId===semanticId&&i.fieldId===0&&i.datum===datum);
    before=textRow[target.field];
   }
   if(!intervals.length){diagnostic('PRODUCT_HEIGHT_FACE_UNAVAILABLE',target);continue;}
   const faces=intervals.map(i=>{
    const down=i.datum===131||i.datum===132;
    return {datum:i.datum,referenceLayer:i.referenceLayer,conversionAvailable:i.conversionAvailable,
     faceZMm:down?i.z1:i.z0,direction:down?'down':'up',coordinateFrame:'manufacturing-z'};
   });
   let face=faces[0];
   if(!unspecified&&faces.some(f=>!same(f,face))){
    diagnostic('PRODUCT_HEIGHT_FACE_AMBIGUOUS',target,{faces});continue;
   }
   if(!unspecified&&!face.conversionAvailable){
    diagnostic('PRODUCT_HEIGHT_CONVERSION_UNAVAILABLE',target,{face,referenceLayer:null});continue;
   }
   if(!unspecified){
    int(face.referenceLayer,0,1000000,'PRODUCT_REFERENCE_LAYER');
    need(unit(face.faceZMm)===domain.decimalUnits(domain.layerBoundary(face.referenceLayer,state.schedule)),'PRODUCT_FACE_SCHEDULE_MISMATCH');
    if(change.mode==='layers'&&(face.direction==='down'?change.layers>face.referenceLayer:change.layers>1000000-face.referenceLayer)){
     diagnostic('PRODUCT_HEIGHT_LAYER_RANGE',target,{face});continue;
    }
   }
   const after={mode:change.mode==='mm'?1:2,origin:1,datum:unspecified?0:face.datum,referenceLayer:unspecified?0:face.referenceLayer,
    layerCount:change.mode==='layers'?change.layers:0,value:change.mode==='mm'?change.mm:0};
   const bindingName=Object.entries(DATUMS).find(([,tag])=>tag===after.datum)?.[0];
   if(!unspecified)need(after.datum===0||bindingName,'PRODUCT_HEIGHT_DATUM');
   if(target.kind==='parameter'){
    const binding=unspecified?{}:{datum:after.datum===0?{kind:'bed'}:{kind:'feature',featureId:bindingName},referenceLayer:after.referenceLayer};
    const value=change.mode==='mm'?{heightMode:'mm',mm:change.mm,...binding}:{heightMode:'layers',layers:change.layers,...binding};
    parameters.push({id:target.field,value});
   }else if(region){
    region.height=after;const m=materials.find(m=>m.id===region.materialId);m.overridden=true;
    if(change.mode==='layers')m.heightLayers=change.layers;else delete m.heightLayers;
   }else{
    textRow[target.field]=after;
    text[target.field==='height'?'heightLayers':'baseThicknessLayers']=String(change.layers);
   }
   updates.push({target,before,after,binding:unspecified?'unspecified-mm':'actual-face',faces});
  }
  const expected={projectId:record.r.c.ticket.projectId,userId:record.r.c.ticket.userId,revision:state.revision,
   headHash:current.head.headHash,requestHash:current.head.requestHash,contextHash:current.contextHash,source:current.source,
   mechanicsSemantics:PRODUCT_MECHANICS_SEMANTICS,sourceSemantics:PRODUCT_SOURCE_SEMANTICS};
  let command=null;
  if(!diagnostics.length&&parameters.length){
   command={id:'parameters.set',args:{changes:parameters}};
   const p=domain.previewCommand(state,command);
   if(!p.ok){diagnostics.push({code:'PRODUCT_HEIGHT_DOMAIN_REJECTED',detail:json(p)});command=null;}
  }
  if(!diagnostics.length){
   if(text?.text)b.textStateHash=await sha256(canonicalJSON(text));
   b.heightBindingEvidence={version:'arch-product-height-bindings/1',basis:expected,changes:updates,geometryVerified:false};
   need(encode.encode(canonicalJSON(b)).length<=60000,'PRODUCT_BINDING_BUDGET');
   need(encode.encode(canonicalJSON({...state.content.app.source.metadata,productBindings:b})).length<=65536,'PRODUCT_SOURCE_METADATA_BUDGET');
  }
  await inspectModel({model,control:c});
  const result={version:'arch-product-height-proposal/1',status:diagnostics.length?'blocked':'proposal',expected,
   updates,diagnostics,productBindings:diagnostics.length?null:b,materials:diagnostics.length?null:materials,
   text:diagnostics.length?null:text,parameterCommand:diagnostics.length?null:command,
   requiresExplicitConsent:true,requiresAtomicCommit:true,requiresNativeRebuild:true,geometryVerified:false,fitQualification:'unqualified'};
  need(encode.encode(canonicalJSON(result)).length<=1024*1024,'PRODUCT_HEIGHT_PROPOSAL_BUDGET');
  const proposalHash=await sha256(canonicalJSON(result));await inspectModel({model,control:c});
  return freeze({...result,proposalHash});
 }

 async function probeDatums(input){
  return prepareRecipe(input,async prepared=>{
   await prepared.assertCurrent();const r=preparedJobs.get(prepared);
   let native=await operation(r.c,(client,generation)=>{
    need(client===r.owner&&client.epoch===r.nativeEpoch,'PRODUCT_CONTEXT_RETIRED');
    return probeNative(client,prepared.recipe,{generation});
   });
   need(native?.id&&native.epoch===r.nativeEpoch,'PRODUCT_DATUM_PROBE_REPLY');
   let released=false,used=false,proposal;
   const release=()=>{if(!released){released=true;proposals.delete(proposal);r.owner.releaseProductProposal(native);}};
   try{
    const semantics=readProductSemantics(native.semanticBytes),head=readProductHead(native.descriptor);
    need(semantics.datumProbeVersion===1&&semantics.parts.length===0&&semantics.exportBlocked,'PRODUCT_DATUM_PROBE_REPLY');
    need(head.headHash===prepared.headHash&&head.revision===String(prepared.revision)&&semantics.provenance.contextHash===r.contextHash,'PRODUCT_DATUM_PROBE_HEAD');
    await authority(r.c,r.state,r.headHash,r.e);
    const descriptorHash=await sha256(native.descriptor),semanticHash=await sha256(native.semanticBytes);
    const {tables,bytes,...metadata}=semantics;
    proposal=Object.freeze({version:'arch-product-datum-probe/1',status:semantics.sourceVerdict===0?'proposal':'blocked',
     head:freeze(json(head)),metadata:freeze(json(metadata)),baseHeadHash:r.e.baseHash,contextHash:r.contextHash,
     requiresExplicitConsent:true,geometryVerified:false,
     async confirm(c){
      control(c);need(!released&&!used,'PRODUCT_PROPOSAL_CONSUMED');used=true;
      try{
       need(c.ticket.userId===r.c.ticket.userId&&c.ticket.projectId===r.c.ticket.projectId&&c.ticket.revision===r.c.ticket.revision,'PRODUCT_PROPOSAL_HEAD');
       await authority(c,r.state,r.headHash,r.e);
       need(semantics.sourceVerdict===0,'PRODUCT_DATUM_PROBE_BLOCKED');
       need(await sha256(native.descriptor)===descriptorHash&&await sha256(native.semanticBytes)===semanticHash,'PRODUCT_PROPOSAL_MUTATED');
       const receipt=await operation(c,(client,generation)=>{
        need(client===r.owner&&client.epoch===r.nativeEpoch,'PRODUCT_CONTEXT_RETIRED');
        return client.confirmProduct(native,{headHash:head.headHash,revision:head.revision},{generation});
       });
       await authority(c,r.state,r.headHash,r.e);return new Uint8Array(receipt);
      }finally{release();}
     },release
    });
    proposals.add(proposal);return proposal;
   }catch(error){release();throw error;}
  },true);
 }
 async function deliverProposal(error,r){
  const p=error.proposal;if(!p)return;
  let released=false,used=false;
  const release=()=>{if(!released){released=true;proposals.delete(proposal);r.owner.releaseProductProposal(p);}};
  const proposal={version:'arch-product-geometry-proposal/1',ticket:freeze(json(r.c.ticket)),code:error.code,
   metadata:null,head:null,
   async confirm(c){
    control(c);need(!released&&!used,'PRODUCT_PROPOSAL_CONSUMED');used=true;
    try{
     need(c.ticket.userId===r.c.ticket.userId&&c.ticket.projectId===r.c.ticket.projectId&&c.ticket.revision===r.state.revision,'PRODUCT_PROPOSAL_HEAD');
     await authority(c,r.state,r.headHash,r.e);
     return await operation(c,async(client,generation)=>{
      need(client===r.owner&&client.epoch===p.epoch,'PRODUCT_PROPOSAL_RETIRED');
      const receipt=await client.confirmProduct(p,{headHash:r.headHash,revision:r.state.revision},{generation});
      await authority(c,r.state,r.headHash,r.e);const h=readProductHead(receipt);
      need(same(h,proposal.head),'PRODUCT_PROPOSAL_RECEIPT');return receipt;
     });
    }finally{release();}
   },release};
  try{
   need(p.epoch===r.nativeEpoch,'PRODUCT_PROPOSAL_RETIRED');
   const h=readProductHead(p.descriptor);
   need(h.headHash===r.headHash&&h.revision===String(r.state.revision)&&h.sourceHash===r.sourceHash,'PRODUCT_PROPOSAL_HEAD');
   const {tables,bytes,...m}=readProductSemantics(p.semanticBytes);
   need(m.mechanicsSemantics===PRODUCT_MECHANICS_SEMANTICS,'PRODUCT_MECHANICS_SEMANTICS_UNQUALIFIED');
   need(m.sourceSemantics===PRODUCT_SOURCE_SEMANTICS,'PRODUCT_SOURCE_SEMANTICS_UNQUALIFIED');
   need(m.provenance.contextHash===r.contextHash,'PRODUCT_PROPOSAL_CONTEXT');
   need(m.sourceVerdict===3||m.mechanicsVerdict===3,'PRODUCT_NATIVE_BLOCKED',{nativeCode:error.code,diagnostics:m.diagnostics,sourceDiagnostics:m.sourceDiagnostics,sourceVerdict:m.sourceVerdict,mechanicsVerdict:m.mechanicsVerdict});
   proposal.head=freeze(json(h));proposal.metadata=freeze(boundedJSON(m,16*1024*1024,'PRODUCT_PROPOSAL_BUDGET'));
   Object.freeze(proposal);proposals.add(proposal);
   await authority(r.c,r.state,r.headHash,r.e);
   need(onGeometryProposal?.(proposal)===true,'PRODUCT_GEOMETRY_PROPOSAL_UNHANDLED',{code:error.code,head:h,diagnostics:m.diagnostics,sourceDiagnostics:m.sourceDiagnostics});
  }catch(e){release();throw e;}
  throw new ProductAppError('PRODUCT_GEOMETRY_PROPOSAL',{code:error.code,head:proposal.head});
 }
 const engine={version:VERSION,identity:freeze({id:'arch-product-app',version:'1'}),capabilities:[
  {id:'geometry.build',available:true},{id:'geometry.import-csg',available:false,reason:'Chức năng nhập CSG của nhân chưa được gắn.'}],
  async build(input){
   let root,model,requestRecord,success=false;
   try{
    const result=await prepareRecipe(input,async prepared=>{
     const r=preparedJobs.get(prepared);requestRecord=r;await prepared.assertCurrent();
     try{
      model=await operation(r.c,async(client,generation)=>{
       need(client===r.owner&&client.epoch===r.nativeEpoch,'PRODUCT_CONTEXT_RETIRED');
       root=await client.build(prepared.recipe,{generation});
       return mapModelLease({prepared,root,client,generation});
      });
      return model;
     }catch(error){if(error.proposal)await deliverProposal(error,r);throw error;}
    });
    // The borrowed source has now been released. The root model is independent.
    need(same(input.ticket,requestRecord.c.ticket),'PRODUCT_TICKET_CHANGED');
    await authority(requestRecord.c,requestRecord.state,requestRecord.headHash,requestRecord.e);success=true;return result;
   }finally{if(!success){if(model)model.release();else root?.release();}}
  }};
 async function reset(){epoch++;for(const p of [...proposals])p.release();for(const m of [...models])m.release();}
 return Object.freeze({version:PRODUCT_APP_VERSION,engine:Object.freeze(engine),prepareRecipe,mapModelLease,inspectModel,prepareHeightBindings,probeDatums,reset});
}

/** Proposed visual/material defaults, versioned separately from geometry catalog.
 * All products use the same neutral body and light text/rim defaults. These are
 * logical material slots, not a printer/extruder plan or a fit qualification.
 */
export const PRODUCT_MATERIAL_DEFAULTS=freeze({
 version:'arch-product-material-defaults/1',
 provenance:{kind:'implementation-policy',requirement:'MOD-02',source:'docs/specs/01-chuc-nang.md',policy:'neutral-body-light-text-v1'},
 products:Object.fromEntries(domain.PRODUCT_IDS.map(product=>[product,Object.fromEntries(PRODUCT_ROLES.map(role=>[role,
  {color:['text','rim'].includes(role)?'#ffffff':'#30353b'}]))]))
});

/** Controller-visible product extension. Exact, bounded JSON; no handles or
 * arbitrary metadata. Native-role identity is independent of display color. */
export function validateProductMaterialExtension(value){
 try{return validateMaterialContract(value);}catch(e){if(e instanceof ProductMaterialError)throw new ProductAppError(e.code,e.details);throw e;}
}

function roleView(role){return ['body','text','textBase','stem','tray'].includes(role)?role:'other';}
function identityEntries(b,materialIds){
 return [{kind:'source',key:'root'},{kind:'provenance',key:'root'},
  ...b.regions.flatMap(r=>[{kind:'region',key:r.sourceKey},{kind:'region-provenance',key:r.sourceKey}]),
  ...b.texts.flatMap(t=>[{kind:'text',key:t.sourceKey},{kind:'text-provenance',key:t.sourceKey},{kind:'text-height',key:t.sourceKey},{kind:'text-base-height',key:t.sourceKey}]),
  ...[...materialIds].sort().map(id=>({kind:'material',key:id}))];
}
/** Pure adoption/rebind proposal. The caller commits source + materials +
 * defaults atomically. Never mutates input, writes storage,
 * approves geometry, assigns a printer, or calls the native module.
 *
 * canonicalContexts MUST come from the checked parent source parser/31-buffer
 * packet; authoredKey is only supplied for a unique durable authored element.
 * geometryHash hashes canonical contour/XY bytes, never a color or paint index.
 */
export async function prepareBindings({projectId,state,source,canonicalContexts,sourceMaterials=[],sourceMaterialDefaults=null,
 defaults=PRODUCT_MATERIAL_DEFAULTS,textBindings=null,sourceToleranceMm=.001,forDatumProbe=false}){
 name(projectId);state=domain.validateProject(state);source=json(source);
 need(source?.id&&source.raw&&source.metadata?.sourceContext,'PRODUCT_ADOPTION_SOURCE');
 name(source.id);hash(source.raw.hash);int(source.revision,0,Number.MAX_SAFE_INTEGER-1,'PRODUCT_SOURCE_REVISION');
 const sc=source.metadata.sourceContext;
 need(sc.id===source.id&&sc.revision===source.revision&&sc.version==='arch-source-context/1','PRODUCT_SOURCE_CONTEXT');
 need(Array.isArray(canonicalContexts)&&canonicalContexts.length>=1&&canonicalContexts.length<=33,'PRODUCT_CONTEXT_LIMIT');
 canonicalContexts=boundedJSON(canonicalContexts,256*1024,'PRODUCT_ADOPTION_CONTEXT_BUDGET');
 defaults=boundedJSON(defaults,16384,'PRODUCT_DEFAULTS_BUDGET');
 need(defaults.version==='arch-product-material-defaults/1'&&defaults.provenance,'PRODUCT_DEFAULTS_VERSION');
 keys(defaults.products,domain.PRODUCT_IDS);
 for(const product of domain.PRODUCT_IDS){keys(defaults.products[product],PRODUCT_ROLES);for(const role of PRODUCT_ROLES){
  keys(defaults.products[product][role],['color']);need(/^#[a-f0-9]{6}$/i.test(defaults.products[product][role].color),'PRODUCT_DEFAULT_COLOR');
 }}
 const oldSource=state.content?.app?.source,old=oldSource?.id===source.id&&oldSource.metadata?.productBindings?.version===BINDINGS?oldSource.metadata.productBindings:null;
 if(old){
  need(old.projectId===projectId&&old.sourceId===source.id&&old.rawHash===oldSource.raw.hash,'PRODUCT_PRIOR_BINDINGS_STALE');
  if(old.sourceRevision!==oldSource.revision)await verifyProductEditLineage(oldSource,old);
 }
 const previousRoles=oldSource?.metadata?.productBindings?.roles??{};
 const changes=[],diagnostics=[],proposals=[],usedKeys=new Set(),nativeKeys=new Set(),regions=[];
 const previousMaterials=json(state.content?.app?.materials??[]),previousDefaults=json(state.content?.app?.materialDefaults??[]);
 need(previousMaterials.length+sourceMaterials.length<=512,'PRODUCT_MATERIAL_LIMIT');
 // Palette labels belong to one parser result. They are routes, never durable
 // material identities: inserting transparent pixels can renumber every label.
 const unique=(rows,label)=>{
  need(Array.isArray(rows)&&rows.length<=256,'PRODUCT_MATERIAL_LIMIT');
  const map=new Map();for(const m of rows){name(m.id);need(!map.has(m.id),'PRODUCT_MATERIAL_ID_CONFLICT',{id:m.id,list:label,reason:'duplicate-id'});map.set(m.id,m);}return map;
 };
 const table=unique(previousMaterials,'previous'),defaultTable=unique(previousDefaults,'previous-defaults');
 const incoming=unique(json(sourceMaterials),'incoming'),incomingDefaults=unique(json(sourceMaterialDefaults??sourceMaterials),'incoming-defaults');
 const paletteRows=[],paletteRouting=new Map(),materialKeys=['id','label','color','slot','role','overridden','backgroundEligible','excluded','areaPercent','heightLayers','excludedReason','excludedCause','product'];
 const comparable=m=>{const {id,product,areaPercent,...rest}=m;return rest;};
 const tupleFor=async id=>(await deriveProductIdentities({projectId,sourceId:source.id,keys:[{kind:'material-key',key:id}]}))[0];
 const lineage=oldSource?.id===source.id&&oldSource.raw?.hash===source.raw.hash&&(
  source.revision===oldSource.revision&&same(sc,oldSource.metadata?.sourceContext)||
  source.revision===oldSource.revision+1&&sc.operation==='convert'&&same(sc.predecessor,{id:oldSource.id,revision:oldSource.revision,rawHash:oldSource.raw.hash}));
 const oldPalette=old?.adoptionProvenance?.sourcePalette??[];
 need(Array.isArray(oldPalette)&&oldPalette.length<=256&&new Set(oldPalette.map(p=>p.parserId)).size===oldPalette.length,'PRODUCT_PALETTE_LEDGER');
 let paletteSerial=old?.adoptionProvenance?.nextPaletteSerial??1;int(paletteSerial,1,1000000000,'PRODUCT_PALETTE_LEDGER');
 const parserRow=m=>{
  keys(m,materialKeys,['id','label','color','slot','role','overridden','excluded']);
  if(m.areaPercent!==undefined)need(Number.isFinite(m.areaPercent)&&m.areaPercent>=0&&m.areaPercent<=100,'PRODUCT_PALETTE_AREA');
  return m.product===undefined&&m.role==='region'&&m.overridden===false&&m.slot===null&&m.heightLayers===undefined;
 };
 for(const [parserId,m]of incoming){
  const previous=table.get(parserId),d=incomingDefaults.get(parserId);
  if(!parserRow(m)){
   need(!oldPalette.some(p=>p.parserId===parserId),'PRODUCT_MATERIAL_ID_CONFLICT',{id:parserId,reason:'parser-route-is-not-material-identity'});
   need(!previous||same(previous,m),'PRODUCT_MATERIAL_ID_CONFLICT',{id:parserId,reason:'full-material-identity-or-settings'});
   if(!previous)table.set(parserId,m);if(!defaultTable.has(parserId))defaultTable.set(parserId,d??m);continue;
  }
  need(d&&same(d,m),'PRODUCT_MATERIAL_DEFAULT_COVERAGE');
  const parserDefaultsHash=await sha256(canonicalJSON(comparable(m)));
  let prior=oldPalette.find(p=>p.parserId===parserId),oldMaterial,baseline;
  if(prior){
   need(lineage&&typeof prior.materialId==='string','PRODUCT_MATERIAL_ID_CONFLICT',{id:parserId,reason:'palette-source-lineage'});
   oldMaterial=table.get(prior.materialId);baseline=defaultTable.get(prior.materialId);
   need(oldMaterial&&baseline,'PRODUCT_PALETTE_LEDGER');
   const expected=await tupleFor(prior.identityTuple?.[4]);
   need(same(prior.identityTuple,expected.tuple)&&oldMaterial.product&&baseline.product&&
    same(oldMaterial.product.identityTuple,expected.tuple)&&same(baseline.product.identityTuple,expected.tuple)&&
    oldMaterial.product.active===false&&oldMaterial.product.nativeRole===undefined&&oldMaterial.product.sourceKey===undefined,
    'PRODUCT_MATERIAL_ID_CONFLICT',{id:prior.materialId,reason:'palette-full-identity'});
  }else if(previous){
   // Migration of the previously delivered inactive palette rows. All parts of
   // the old identity tuple are checked; active roles/regions cannot enter here.
   const expected=await tupleFor(parserId);oldMaterial=previous;baseline=defaultTable.get(parserId);
   need(lineage&&baseline&&previous.product&&baseline.product&&
    previous.product.active===false&&previous.product.nativeRole===undefined&&previous.product.sourceKey===undefined&&
    same(previous.product.identityTuple,expected.tuple)&&same(baseline.product.identityTuple,expected.tuple),
    'PRODUCT_MATERIAL_ID_CONFLICT',{id:parserId,reason:'unproven-legacy-palette'});
   prior={parserId,materialId:parserId,identityTuple:expected.tuple,parserDefaultsHash:await sha256(canonicalJSON(comparable(baseline)))};
  }
  if(oldMaterial){
   validateProductMaterialExtension(oldMaterial.product);validateProductMaterialExtension(baseline.product);
   need(oldMaterial.overridden===true||same(comparable(oldMaterial),comparable(baseline)),
    'PRODUCT_MATERIAL_ID_CONFLICT',{id:prior.materialId,reason:'unrecorded-palette-setting'});
  }
  const reusable=prior&&prior.parserDefaultsHash===parserDefaultsHash&&same(comparable(baseline),comparable(m));
  let materialId,identityTuple,value,defaultsRow;
  if(reusable){
   materialId=prior.materialId;identityTuple=prior.identityTuple;value={...oldMaterial};defaultsRow={...baseline};
   delete value.areaPercent;delete defaultsRow.areaPercent;
   if(m.areaPercent!==undefined){value.areaPercent=m.areaPercent;defaultsRow.areaPercent=m.areaPercent;}
   changes.push({kind:'refresh-source-palette',parserId,materialId,identityTuple,fromSourceRevision:oldSource.revision,toSourceRevision:source.revision,preservedUserSettings:true});
  }else{
   let allocated;do{allocated=await tupleFor('palette:'+paletteSerial++);materialId='product-palette-'+allocated.id;}while(table.has(materialId));
   identityTuple=allocated.tuple;
   const product={version:'arch-product-material/1',active:false,origin:'source',identityTuple};
   value={...m,id:materialId,product};defaultsRow={...value,product:{...product,origin:'auto'}};
   changes.push({kind:'initialize-source-palette',parserId,materialId,identityTuple,origin:'source',previousMaterialId:prior?.materialId??null,reason:prior?'parser-label-reassigned':'new-parser-route'});
   if(oldMaterial?.overridden)proposals.push({kind:'source-palette-rebind',parserId,previousMaterialId:prior.materialId,materialId,preservedPreviousUserSettings:true,requiresExplicitDecision:true});
  }
  table.set(materialId,value);defaultTable.set(materialId,defaultsRow);paletteRouting.set(parserId,materialId);
  paletteRows.push({parserId,materialId,identityTuple,parserDefaultsHash,measurementHash:await sha256(canonicalJSON({areaPercent:m.areaPercent??null}))});
 }
 // Rebuild callers may pass current materials instead of parser observations.
 // Retain their checked source-scoped route ledger; no new allocation occurs.
 if(!paletteRows.length&&lineage)paletteRows.push(...oldPalette);
 const oldRegions=old?.regions??[],oldByKey=new Map(oldRegions.map(r=>[r.sourceKey,r]));
 let serial=old?.nextRegionSerial??1;int(serial,1,1000000000,'PRODUCT_REGION_SERIAL');
 const allIncoming=canonicalContexts.flatMap(c=>c.regions??[]);
 need(allIncoming.length>=1&&allIncoming.length<=256,'PRODUCT_REGION_LIMIT');
 const oldGeometryCount=new Map(),newGeometryCount=new Map();
 for(const r of oldRegions)if(r.geometryHash)oldGeometryCount.set(r.geometryHash,(oldGeometryCount.get(r.geometryHash)??0)+1);
 for(const r of allIncoming){hash(r.geometryHash,'PRODUCT_REGION_GEOMETRY_HASH');newGeometryCount.set(r.geometryHash,(newGeometryCount.get(r.geometryHash)??0)+1);}
 const matchRows=[];
 for(const ctx of canonicalContexts){
  keys(ctx,['key','sourceHash','derivationHash','regions']);name(ctx.key);hash(ctx.sourceHash);
  need(ctx.derivationHash===null||hashPattern.test(ctx.derivationHash),'PRODUCT_DERIVATION_HASH');
  for(const r of ctx.regions){
   keys(r,['nativeKey','sourceIndex','geometryHash','authoredKey','rgba','materialId'],['nativeKey','sourceIndex','geometryHash','authoredKey','rgba']);
   name(r.nativeKey);int(r.sourceIndex,0,255,'PRODUCT_SOURCE_INDEX');int(r.rgba,0,0xffffffff,'PRODUCT_REGION_COLOR');
   need((r.rgba&255)===255,'PRODUCT_REGION_OPAQUE_MATERIAL_REQUIRED');
   need(r.authoredKey===null||typeof r.authoredKey==='string','PRODUCT_AUTHORED_KEY');
   if(r.authoredKey!==null)name(r.authoredKey);
   const selector=canonicalJSON([ctx.key,r.nativeKey]);need(!nativeKeys.has(selector),'PRODUCT_NATIVE_KEY_AMBIGUOUS');nativeKeys.add(selector);
   let matches=[],proof=null;
   if(old){
    // Authored IDs are explicit source identity. Anonymous regions only reuse an
    // ID on a unique exact canonical geometry match, or an unchanged selector.
    if(r.authoredKey!==null){matches=oldRegions.filter(p=>p.contextKey===ctx.key&&p.authoredKey===r.authoredKey);proof='authored-key';}
    if(matches.length===0&&oldGeometryCount.get(r.geometryHash)===1&&newGeometryCount.get(r.geometryHash)===1){
     matches=oldRegions.filter(p=>p.contextKey===ctx.key&&p.geometryHash===r.geometryHash);proof='unique-canonical-geometry';
    }
    if(matches.length===0&&old.sourceRevision===source.revision&&old.rawHash===source.raw.hash){
     matches=oldRegions.filter(p=>p.contextKey===ctx.key&&p.nativeKey===r.nativeKey&&p.geometryHash===r.geometryHash);proof='unchanged-context';
    }
   }
   need(matches.length<=1,'PRODUCT_IDENTITY_REBIND_AMBIGUOUS');
   const previous=matches[0];let sourceKey;
   if(previous){sourceKey=previous.sourceKey;need(!usedKeys.has(sourceKey),'PRODUCT_IDENTITY_REBIND_AMBIGUOUS');}
   else if(r.authoredKey!==null){
    sourceKey='authored:'+ctx.key+':'+r.authoredKey;name(sourceKey);
    if(oldByKey.has(sourceKey))need(false,'PRODUCT_AUTHORED_KEY_CONFLICT');
   }else{
    do{sourceKey='adopted:'+serial++;}while(oldByKey.has(sourceKey)||usedKeys.has(sourceKey));
    proof='new-durable-allocation';
   }
   need(!usedKeys.has(sourceKey),'PRODUCT_AUTHORED_KEY_AMBIGUOUS');usedKeys.add(sourceKey);
   const materialKey=(await deriveProductIdentities({projectId,sourceId:source.id,keys:[{kind:'material-key',key:'region:'+sourceKey}]}))[0];
   const materialId=previous?.materialId??paletteRouting.get(r.materialId)??r.materialId??'product-material-'+materialKey.id;
   let m=table.get(materialId),color='#'+(r.rgba>>>8).toString(16).padStart(6,'0');
   if(!m)m={id:materialId,label:r.authoredKey??sourceKey,color,slot:null,role:'region',overridden:false,backgroundEligible:true,excluded:false};
   else {
    if(m.product)need(same(m.product.identityTuple,materialKey.tuple),'PRODUCT_MATERIAL_ID_CONFLICT',{id:materialId,reason:'region-identity-tuple'});
    if(!m.overridden)m={...m,color};
   }
   m={...m,backgroundEligible:m.backgroundEligible??true,product:{version:'arch-product-material/1',active:true,origin:m.overridden?'user':'source',sourceId:source.id,sourceKey,nativeRole:'artwork',identityTuple:materialKey.tuple}};
   table.set(materialId,m);
   if(!defaultTable.has(materialId))defaultTable.set(materialId,{...m,color,slot:null,overridden:false});
   const heightRecord=previous?.height??null;
   if(m.heightLayers!==undefined&&(!heightRecord||!(heightRecord.mode===2||forDatumProbe&&heightRecord.mode===5)||heightRecord.layerCount!==m.heightLayers)){
    diagnostics.push({code:'PRODUCT_REGION_DATUM_REQUIRED',sourceKey,materialId});
    proposals.push({kind:'resolve-region-height-datum',sourceKey,materialId,layers:m.heightLayers,requiredFace:'source:art.bottom',referenceLayer:null,requiresActualFaceResolution:true});
   }
   regions.push({sourceKey,contextKey:ctx.key,nativeKey:r.nativeKey,materialId,textKey:previous?.textKey??null,height:heightRecord,
    geometryHash:r.geometryHash,authoredKey:r.authoredKey});
   matchRows.push({sourceKey,nativeKey:r.nativeKey,contextKey:ctx.key,proof:previous?proof:'new-durable-allocation',previousSourceKey:previous?.sourceKey??null,geometryHash:r.geometryHash});
  }
 }
 const roles={};
 for(const role of PRODUCT_ROLES){
  const key=(await deriveProductIdentities({projectId,sourceId:source.id,keys:[{kind:'material-key',key:'role:'+role}]}))[0];
  const candidates=previousMaterials.filter(m=>m.product?.nativeRole===role||(['body','text','textBase','stem','tray'].includes(role)&&m.role===role));
  if(!previousRoles[role]&&candidates.length>1){
   diagnostics.push({code:'PRODUCT_ROLE_OVERRIDE_AMBIGUOUS',role,materialIds:candidates.map(m=>m.id)});
   proposals.push({kind:'bind-native-role',role,candidates:candidates.map(m=>m.id),requiresExplicitDecision:true});
  }
  const id=previousRoles[role]??(candidates.length===1?candidates[0].id:null)??'product-role-'+key.id;
  let m=table.get(id);
  if(!m){
   m={id,label:role,color:defaults.products[state.product][role].color.toLowerCase(),slot:null,role:roleView(role),overridden:false,backgroundEligible:false,excluded:false};
   changes.push({kind:'initialize-role',role,materialId:id,color:m.color,origin:'auto'});
  }
  // Rebuild and product switch preserve common valid values. New defaults only
  // fill missing roles; explicit reset-to-default is a separate domain action.
  m={...m,backgroundEligible:m.backgroundEligible??false,product:{version:'arch-product-material/1',active:true,origin:m.overridden?'user':'auto',nativeRole:role,identityTuple:m.product?.identityTuple??key.tuple}};
  table.set(id,m);roles[role]=id;if(!defaultTable.has(id))defaultTable.set(id,{...m,color:defaults.products[state.product][role].color.toLowerCase(),slot:null,overridden:false});
 }
 const used=new Set([...Object.values(roles),...regions.map(r=>r.materialId)]);
 const slotColors=new Map();
 for(const id of used){
  const m=table.get(id);need(/^#[a-f0-9]{6}$/i.test(m.color)&&typeof m.overridden==='boolean','PRODUCT_MATERIAL_SCHEMA');
  if(m.slot===null){if(m.overridden)diagnostics.push({code:'PRODUCT_USER_SLOT_UNRESOLVED',materialId:id});continue;}
  int(m.slot,1,16,'PRODUCT_MATERIAL_SLOT');
  if(!slotColors.has(m.slot))slotColors.set(m.slot,new Map());
  const colors=slotColors.get(m.slot),color=m.color.toLowerCase();
  if(!colors.has(color))colors.set(color,[]);colors.get(color).push(id);
 }
 for(const [slot,colors]of slotColors)if(colors.size>1){
  const items=[...colors].map(([color,materialIds])=>({color,materialIds}));
  diagnostics.push({code:'PRODUCT_SLOT_CONFLICT',slot,materials:items});
  proposals.push({kind:'material-slot-remap',slot,materials:items,availableSlots:Array.from({length:16},(_,i)=>i+1).filter(n=>!slotColors.has(n)),requiresExplicitDecision:true});
 }
 for(const id of [...used].sort()){
  const m=table.get(id);if(m.slot!==null||m.overridden)continue;
  const color=m.color.toLowerCase();
  const compatible=[...slotColors].find(([,colors])=>colors.size===1&&colors.has(color));
  const slot=compatible?.[0]??Array.from({length:16},(_,i)=>i+1).find(n=>!slotColors.has(n));
  if(slot===undefined){diagnostics.push({code:'PRODUCT_MATERIAL_SLOT_CAPACITY',materialId:id,logicalLimit:16,printerQualified:false});continue;}
  m.slot=slot;if(!slotColors.has(slot))slotColors.set(slot,new Map([[color,[]]]));slotColors.get(slot).get(color).push(id);
  const d=defaultTable.get(id);if(d&&!d.overridden&&d.slot===null)defaultTable.set(id,{...d,slot});
  changes.push({kind:'initialize-slot',materialId:id,slot,origin:'auto',qualification:'logical-material-slot-only'});
 }
 for(const [id,m]of table)if(!used.has(id)){
  // Retain user data and defaults even when a source edit removes its region.
  const key=(await deriveProductIdentities({projectId,sourceId:source.id,keys:[{kind:'material-key',key:id}]}))[0];
  table.set(id,{...m,backgroundEligible:m.backgroundEligible??false,product:{...(m.product??{identityTuple:key.tuple}),version:'arch-product-material/1',origin:m.overridden?'user':m.product?.origin??'auto',active:false}});
 }
 const retired=oldRegions.filter(r=>!usedKeys.has(r.sourceKey));
 if(old&&(retired.length||matchRows.some(r=>r.previousSourceKey===null))){
  proposals.push({kind:'source-identity-rebind',fromRevision:old.sourceRevision,toRevision:source.revision,
   retained:matchRows.filter(r=>r.previousSourceKey!==null),allocated:matchRows.filter(r=>r.previousSourceKey===null),retired:retired.map(r=>({sourceKey:r.sourceKey,materialId:r.materialId,geometryHash:r.geometryHash??null})),
   requiresExplicitDecision:true});
 }
 need((old?.retiredRegions?.length??0)+retired.length<=256,'PRODUCT_RETIRED_REGION_LIMIT');
 const activeText=state.content.app.text?.text;
 const texts=textBindings?.texts??old?.texts??[];
 if(textBindings?.contextTextKeys){
  keys(textBindings.contextTextKeys,canonicalContexts.map(c=>c.key),[]);
  for(const r of regions)if(Object.hasOwn(textBindings.contextTextKeys,r.contextKey))r.textKey=textBindings.contextTextKeys[r.contextKey];
 }
 const b={version:BINDINGS,projectId,sourceId:source.id,sourceRevision:source.revision,rawHash:source.raw.hash,
  contexts:canonicalContexts.map(c=>({key:c.key,sha256:c.sourceHash,derivationHash:c.derivationHash})),
  regions,roles,texts:json(texts),eyeletTextKey:textBindings?.eyeletTextKey??old?.eyeletTextKey??null,
  ...(old?.heightBindingEvidence?{heightBindingEvidence:old.heightBindingEvidence}:{}),
  sourceToleranceMm,textStateHash:activeText?await sha256(canonicalJSON(state.content.app.text)):null,nextRegionSerial:serial,
  retiredRegions:[...(old?.retiredRegions??[]),...retired],
  adoptionProvenance:{version:'arch-product-adoption/1',defaultsHash:await sha256(canonicalJSON(defaults)),defaultsProvenance:defaults.provenance,
   identityAllocation:'source-scoped monotonic serial assigned once at adoption; no array-index identity',matches:matchRows,sourcePalette:paletteRows,nextPaletteSerial:paletteSerial,printerQualification:'unverified'}};
 if(activeText&&!state.content.app.text.asSource&&!texts.length){
  diagnostics.push({code:'PRODUCT_TEXT_DATUM_REQUIRED'});
  proposals.push({kind:'resolve-text-datums',heightLayers:state.content.app.text.heightLayers,baseThicknessLayers:state.content.app.text.baseThicknessLayers,
   heightFace:'source:text.bottom',baseFace:'source:text-base.bottom',referenceLayer:null,requiresActualFaceResolution:true});
 }
 const identities=await deriveProductIdentities({projectId,sourceId:source.id,keys:identityEntries(b,used)});
 b.identityLedger={version:'arch-product-identities/1',records:identities};
 need(encode.encode(canonicalJSON(b)).length<=60000,'PRODUCT_BINDING_BUDGET');
 const sourceMetadata={...source.metadata,productBindings:b};
 need(encode.encode(canonicalJSON(sourceMetadata)).length<=65536,'PRODUCT_SOURCE_METADATA_BUDGET');
 const materials=[...table.values()];
 const materialDefaults=materials.map(m=>{
  const d=defaultTable.get(m.id)??{...m,overridden:false};
  return {...d,backgroundEligible:d.backgroundEligible??m.backgroundEligible,product:{...m.product,origin:'auto'}};
 });
 for(const m of [...materials,...materialDefaults])validateProductMaterialExtension(m.product);
 need(materials.length<=256&&materialDefaults.length<=256,'PRODUCT_MATERIAL_LIMIT');
 const nextSource={...source,metadata:sourceMetadata};
 const result={version:'arch-product-adoption/1',status:diagnostics.length?'blocked':proposals.length?'proposal':'ready',
  expected:{projectId,revision:state.revision,headHash:await domainStateFingerprint(state),sourceId:source.id,sourceRevision:source.revision,rawHash:source.raw.hash},
  productBindings:b,source:nextSource,sourceMetadata,materials,materialDefaults,changes,diagnostics,proposals,requiresCommit:true,geometryChanged:false,
  identityLedgerHash:await sha256(canonicalJSON(b.identityLedger)),fitQualification:'unqualified',printerQualification:'unverified'};
 const adoptionHash=await sha256(canonicalJSON(result));
 return Object.freeze({...freeze(result),adoptionHash});
}
