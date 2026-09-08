import {sha256 as hashText} from '../domain/hash.mjs';
import {canonicalJSON} from '../storage/common.mjs';
export const MATERIAL_SOURCE_LEDGER_VERSION='arch-material-source-ledger/1';
export const MATERIAL_SOURCE_PLAN_VERSION='arch-material-source-plan/1';
const algorithm=Object.freeze({algorithm:'full-id-sorted-monotonic-u32/1',ordering:'ordinal-utf16-nfc',identity:'full-material-id',retiredEntries:'retained'});
const encoder=new TextEncoder(),MAX_BYTES=32768,MAX_ENTRIES=256;
export class MaterialSourceLedgerError extends Error {constructor(code){super(code);this.name='MaterialSourceLedgerError';this.code=code;}}
const need=(v,c)=>{if(!v)throw new MaterialSourceLedgerError(c);};
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
function exact(v,keys){
 need(v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v)),'MATERIAL_SOURCE_SCHEMA');
 need(Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k)),'MATERIAL_SOURCE_SCHEMA');
 for(const k of keys)need(Object.getOwnPropertyDescriptor(v,k)?.get===undefined,'MATERIAL_SOURCE_SCHEMA');
}
function id(v){need(typeof v==='string'&&v.length>0&&v.isWellFormed()&&v.normalize('NFC')===v&&!/[\u0000-\u001f\u007f]/u.test(v)&&encoder.encode(v).length<=200,'MATERIAL_SOURCE_ID');return v;}
const ordinal=(a,b)=>a<b?-1:a>b?1:0;
function active(ids){need(Array.isArray(ids)&&ids.length>0&&ids.length<=512,'MATERIAL_SOURCE_INPUT_LIMIT');const out=[...new Set(ids.map(id))].sort(ordinal);need(out.length<=128,'MATERIAL_SOURCE_ACTIVE_LIMIT');return out;}
function validate(ledger,projectId){
 exact(ledger,['version','projectId','allocationRevision','nextId','entries','provenance','digest']);
 need(ledger.version===MATERIAL_SOURCE_LEDGER_VERSION,'MATERIAL_SOURCE_VERSION');need(id(ledger.projectId)===projectId,'MATERIAL_SOURCE_PROJECT');
 exact(ledger.provenance,Object.keys(algorithm));need(Object.keys(algorithm).every(k=>ledger.provenance[k]===algorithm[k]),'MATERIAL_SOURCE_PROVENANCE');
 need(Array.isArray(ledger.entries)&&ledger.entries.length>0&&ledger.entries.length<=MAX_ENTRIES,'MATERIAL_SOURCE_LEDGER_LIMIT');
 const ids=new Set(),numbers=new Set(),entries=ledger.entries.map(row=>{
  exact(row,['materialId','materialSourceId']);const materialId=id(row.materialId),n=row.materialSourceId;
  need(Number.isSafeInteger(n)&&n>=1&&n<=0xffffffff&&!ids.has(materialId)&&!numbers.has(n),'MATERIAL_SOURCE_COLLISION');
  ids.add(materialId);numbers.add(n);return {materialId,materialSourceId:n};
 });
 need([...numbers].sort((a,b)=>a-b).every((n,i)=>n===i+1)&&ledger.nextId===entries.length+1,'MATERIAL_SOURCE_ALLOCATION_HISTORY');
 need(Number.isSafeInteger(ledger.allocationRevision)&&ledger.allocationRevision>=1&&ledger.allocationRevision<=entries.length,'MATERIAL_SOURCE_ALLOCATION_HISTORY');
 need(encoder.encode(JSON.stringify(ledger)).length<=MAX_BYTES,'MATERIAL_SOURCE_LEDGER_BUDGET');
 const body={version:MATERIAL_SOURCE_LEDGER_VERSION,projectId,allocationRevision:ledger.allocationRevision,nextId:ledger.nextId,entries:entries.sort((a,b)=>ordinal(a.materialId,b.materialId)),provenance:{...algorithm}};
 need(typeof ledger.digest==='string'&&/^[a-f0-9]{64}$/.test(ledger.digest)&&ledger.digest===hashText(canonicalJSON(body)),'MATERIAL_SOURCE_DIGEST');
 return {...body,digest:ledger.digest};
}
/** Pure plan only. Persist a changed ledger with source/material adoption before
 * building; no export call is allowed to allocate or silently rewrite IDs. */
export function planMaterialSourceIds({projectId,materialIds,ledger=null}={}){
 projectId=id(projectId);const selected=active(materialIds);
 const next=ledger===null?{version:MATERIAL_SOURCE_LEDGER_VERSION,projectId,allocationRevision:0,nextId:1,entries:[],provenance:{...algorithm}}:validate(ledger,projectId);
 const byId=new Map(next.entries.map(r=>[r.materialId,r.materialSourceId]));let changed=ledger===null;
 for(const materialId of selected)if(!byId.has(materialId)){
  need(next.nextId<=0xffffffff&&next.entries.length<MAX_ENTRIES,'MATERIAL_SOURCE_EXHAUSTED');
  const materialSourceId=next.nextId++;next.entries.push({materialId,materialSourceId});byId.set(materialId,materialSourceId);changed=true;
 }
 if(changed)next.allocationRevision++;
 next.entries.sort((a,b)=>ordinal(a.materialId,b.materialId));
 const {digest:previousDigest,...body}=next;next.digest=hashText(canonicalJSON(body));
 need(encoder.encode(JSON.stringify(next)).length<=MAX_BYTES,'MATERIAL_SOURCE_LEDGER_BUDGET');
 return freeze({version:MATERIAL_SOURCE_PLAN_VERSION,ledger:next,bindings:selected.map(materialId=>({materialId,materialSourceId:byId.get(materialId)})),requiresPersistence:changed});
}
export function resolveMaterialSourceIds({projectId,materialIds,ledger}={}){
 need(ledger!==null&&ledger!==undefined,'MATERIAL_SOURCE_LEDGER_MISSING');
 const plan=planMaterialSourceIds({projectId,materialIds,ledger});need(!plan.requiresPersistence,'MATERIAL_SOURCE_ALLOCATION_NOT_COMMITTED');return plan.bindings;
}
/** Concrete synchronous parent callback. The caller supplies the actual owned
 * product inspector result; imported public model metadata is not that result. */
export function materialSourceIdsFromState(context,inspection){
 const source=context?.state?.content?.app?.source,b=source?.metadata?.productBindings,observed=inspection?.source;
 need(source&&b&&observed&&Number.isSafeInteger(context?.state?.revision)&&context.state.revision>0&&String(context.state.revision)===inspection.head?.revision&&context.headHash===inspection.head?.headHash,'MATERIAL_SOURCE_BINDING');
 id(source.id);need(Number.isSafeInteger(source.revision)&&source.revision>=0&&typeof source.raw?.hash==='string'&&/^[a-f0-9]{64}$/.test(source.raw.hash),'MATERIAL_SOURCE_BINDING');
 need(b.version==='arch-product-bindings/1'&&b.projectId===context.projectId&&b.sourceId===source.id&&b.sourceRevision===source.revision&&b.rawHash===source.raw?.hash,'MATERIAL_SOURCE_BINDING');
 need(observed.id===source.id&&observed.revision===source.revision&&observed.rawHash===source.raw.hash,'MATERIAL_SOURCE_BINDING');
 const materials=context.state.content.app.materials,parts=inspection.exportDescriptor?.parts;
 need(Array.isArray(materials)&&materials.length<=256&&Array.isArray(parts)&&parts.length>0&&parts.length<=128,'MATERIAL_SOURCE_BINDING');
 const byId=new Map();for(const m of materials){const key=id(m.id);need(!byId.has(key),'MATERIAL_SOURCE_COLLISION');byId.set(key,m);}
 const ids=parts.map(p=>id(p.materialId));need(ids.every(key=>byId.has(key)&&byId.get(key).excluded===false),'MATERIAL_SOURCE_BINDING');
 return resolveMaterialSourceIds({projectId:context.projectId,materialIds:ids,ledger:b.adoptionProvenance?.materialSourceLedger});
}
