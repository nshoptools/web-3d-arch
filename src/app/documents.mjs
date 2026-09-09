import * as domain from '../domain/index.mjs';
import {snapshotReference,createHistory,planHistoryAppend,acceptHistoryAppend,planHistoryMove,restoreDomainSnapshot,acceptHistoryMove,historyCost,domainStateFingerprint} from '../storage/index.mjs';
import {assert,data,canonicalJSON,sha256,utf8,decode,parseJSON,uuid,freeze,keys} from './common.mjs';
import {validateExportConfiguration} from './export-configuration.mjs';
import {validateProductMaterialExtension} from '../contracts/product-material.mjs';
export const DEFAULT_TEXT=freeze({text:'',fontId:'',sizeMm:'10',heightLayers:'5',baseWidthMm:'0',baseThicknessLayers:'5',baseRadiusMm:'0',bend:'0',letterSpacing:'0',lineSpacing:'1',baseEnabled:false,bevelEnabled:false,asSource:false,xMm:'0',yMm:'0',placement:'on-model',sizeUnit:'mm',sizeDisplay:'10'});
export const DEFAULT_EDITOR=freeze({tool:'paint',colorMaterialId:null,cutMode:'merge',strokeWidthPx:'3',healAuto:true,healAllGaps:false,healThresholdMm:'0.2'});
export const APP_KIND='web-3d-arch.app-document';
export function appContent(name='Untitled'){return {version:1,name,step:1,source:null,mesh:null,text:data(DEFAULT_TEXT),materials:[],materialDefaults:[],editor:data(DEFAULT_EDITOR),printerId:null,deleted:false};}
export function validateState(s){
 s=domain.validateProject(s);const a=s.content.app;
 assert(a?.version===1,'APP_CONTENT_VERSION');keys(a,['version','name','step','source','mesh','text','materials','materialDefaults','editor','printerId','deleted','fontAssets','exportOptions'],['version','name','step','source','mesh','text','materials','materialDefaults','editor','printerId','deleted']);assert(typeof a.name==='string'&&a.name.length>0&&a.name.length<=200,'PROJECT_NAME');assert([1,2].includes(a.step),'PROJECT_STEP');
 if(a.exportOptions!==undefined)validateExportConfiguration(a.exportOptions);
 assert(Array.isArray(a.materials)&&a.materials.length<=256,'MATERIAL_SCHEMA');
 assert(Array.isArray(a.materialDefaults)&&a.materialDefaults.length<=256,'MATERIAL_SCHEMA');
 for(const m of [...a.materials,...a.materialDefaults])if(m.product!==undefined)validateProductMaterialExtension(m.product);
 validateText(a.text);validateEditor(a.editor);
 assert(new Set(a.materials.map(m=>m.id)).size===a.materials.length,'MATERIAL_IDS');
 for(const m of a.materials){assert(typeof m.excluded==='boolean'&&typeof m.overridden==='boolean'&&['region','body','text','textBase','stem','tray','other'].includes(m.role),'MATERIAL_SCHEMA');assert(typeof m.id==='string'&&/^#[0-9a-f]{6}$/i.test(m.color),'MATERIAL_SCHEMA');assert(m.slot===null||Number.isInteger(m.slot)&&m.slot>=1&&m.slot<=64,'MATERIAL_SLOT');if(m.heightLayers!==undefined)assert(Number.isSafeInteger(m.heightLayers)&&m.heightLayers>0&&m.heightLayers<=1000000,'MATERIAL_HEIGHT');}
 for(const desc of [a.source,a.mesh].filter(Boolean)){
  assert(typeof desc.id==='string'&&typeof desc.name==='string'&&Array.isArray(desc.assetHashes)&&desc.assetHashes.every(h=>/^[a-f0-9]{64}$/.test(h)),'SOURCE_SCHEMA');
  assert(desc.raw&&/^[a-f0-9]{64}$/.test(desc.raw.hash)&&Number.isSafeInteger(desc.raw.byteLength),'SOURCE_SCHEMA');
  assert(Number.isSafeInteger(desc.revision)&&desc.revision>=0&&desc.assetHashes.includes(desc.raw.hash),'SOURCE_REVISION');
  if(desc.preview){const p=desc.preview;assert(Number.isInteger(p.width)&&Number.isInteger(p.height)&&p.width>0&&p.height>0&&p.width*p.height<=16777216&&Number.isFinite(p.pixelSizeMm)&&p.pixelSizeMm>0&&p.mediaType==='image/png'&&/^[a-f0-9]{64}$/.test(p.png)&&desc.assetHashes.includes(p.png),'SOURCE_PREVIEW');}
  if(desc.raster)assert(['rgba','preview','originalPreview'].every(k=>/^[a-f0-9]{64}$/.test(desc.raster[k])&&desc.assetHashes.includes(desc.raster[k])),'RASTER_REFERENCES');
  if(desc.raster){const r=desc.raster;assert(Number.isInteger(r.width)&&Number.isInteger(r.height)&&r.width>0&&r.height>0&&r.width*r.height<=16777216&&r.pixelSizeMm>0&&Number.isFinite(r.pixelSizeMm),'RASTER_SCHEMA');}
 }
 return s;
}
export function validateText(t){
 assert(t&&Object.keys(DEFAULT_TEXT).every(k=>Object.hasOwn(t,k))&&Object.keys(t).every(k=>Object.hasOwn(DEFAULT_TEXT,k)),'TEXT_SCHEMA');
 assert(typeof t.text==='string'&&t.text.length<=16000&&typeof t.fontId==='string'&&t.fontId.length<=200,'TEXT_SCHEMA');
 for(const k of ['baseEnabled','bevelEnabled','asSource'])assert(typeof t[k]==='boolean','TEXT_SCHEMA');
 assert(['on-model','beside'].includes(t.placement)&&['mm','pt'].includes(t.sizeUnit),'TEXT_SCHEMA');
 for(const k of ['sizeMm','heightLayers','baseWidthMm','baseThicknessLayers','baseRadiusMm','bend','letterSpacing','lineSpacing','xMm','yMm','sizeDisplay']){
  const n=domain.parseDecimal(t[k]).value;assert(Math.abs(n)<=10000,'TEXT_RANGE');if(['sizeMm','sizeDisplay','lineSpacing'].includes(k))assert(n>0,'TEXT_RANGE');if(['baseWidthMm','baseRadiusMm'].includes(k))assert(n>=0,'TEXT_RANGE');if(['heightLayers','baseThicknessLayers'].includes(k))assert(Number.isInteger(n)&&n>=0,'TEXT_LAYERS');
 }
}
export function validateEditor(e){
 assert(e&&Object.keys(DEFAULT_EDITOR).every(k=>Object.hasOwn(e,k))&&Object.keys(e).every(k=>Object.hasOwn(DEFAULT_EDITOR,k)),'EDITOR_SCHEMA');
 assert(['paint','line','curve','erase','cut','crop','heal'].includes(e.tool)&&['merge','hole'].includes(e.cutMode),'EDITOR_SCHEMA');
 assert(e.colorMaterialId===null||typeof e.colorMaterialId==='string','EDITOR_SCHEMA');
 for(const k of ['healAuto','healAllGaps'])assert(typeof e[k]==='boolean','EDITOR_SCHEMA');
 const w=domain.parseDecimal(e.strokeWidthPx).value,g=domain.parseDecimal(e.healThresholdMm).value;
 assert(w>0&&w<=4096&&g>0&&g<=100,'EDITOR_RANGE');
}
export function contentEdit(state,change){const next=data(state);change(next.content.app,next);next.revision++;return validateState(next);}
export function domainCommand(state,command){const p=domain.previewCommand(state,command);if(!p.ok)throw Object.assign(new Error(p.issues[0].code),p.issues[0]);const r=domain.commitPreview(state,p);assert(r.ok,'DOMAIN_PREVIEW');return {state:validateState(r.state),diff:p.diff};}
export function usedAssets(state){const a=state.content.app;return [...new Set([...(a.fontAssets??[]),...[a.source,a.mesh].filter(Boolean).flatMap(s=>s.assetHashes)])];}
async function addSnapshot(state,assets,snapshots){
 const stateHash=await domainStateFingerprint(state);let hash=snapshots[stateHash];
 if(!hash){const bytes=utf8.encode(canonicalJSON(state));hash=await sha256(bytes);assets.set(hash,{hash,bytes,byteLength:bytes.length,kind:'history'});snapshots[stateHash]=hash;}
 return snapshotReference(state,{assetHashes:[hash,...usedAssets(state)]});
}
export async function newDocument(product,assets=new Map(),name){
 const state=validateState(domain.createProject({product,content:{app:appContent(name)}})),snapshots={};
 const current=await addSnapshot(state,assets,snapshots);
 return {document:{kind:APP_KIND,version:1,state,history:createHistory(current,{assets:[...assets.values()].map(({hash,byteLength})=>({hash,byteLength}))}),snapshots,savedRevision:null},assets};
}
export function validateDocument(input){
 const d=data(input);assert(d.kind===APP_KIND&&d.version===1,'APP_DOCUMENT_VERSION');keys(d,['kind','version','state','history','snapshots','savedRevision','title','controllerVersion','updatedAt','retainedAssets'],['kind','version','state','history','snapshots','savedRevision']);
 if(d.retainedAssets)assert(Array.isArray(d.retainedAssets)&&d.retainedAssets.length<=10000&&d.retainedAssets.every(h=>/^[a-f0-9]{64}$/.test(h)),'RETAINED_ASSETS');d.state=validateState(d.state);historyCost(d.history);
 assert(d.history.current.projectRevision===d.state.revision,'HISTORY_STATE_REVISION');
 assert(d.snapshots&&Object.entries(d.snapshots).every(([k,v])=>/^[a-f0-9]{64}$/.test(k)&&/^[a-f0-9]{64}$/.test(v)),'SNAPSHOT_SCHEMA');
 assert(d.savedRevision===null||Number.isSafeInteger(d.savedRevision)&&d.savedRevision<=d.state.revision,'SAVED_REVISION');
 return d;
}
export async function verifyDocument(input,assets){
 const d=validateDocument(input);assert(await domainStateFingerprint(d.state)===d.history.current.stateHash,'HISTORY_STATE_HASH');
 for(const h of d.retainedAssets??[])assert(assets.has(h),'RETAINED_ASSET_MISSING');
 const refs=[d.history.current,...d.history.transactions.flatMap(t=>[t.before,t.after])];
 for(const r of refs){
  const b=assets.get(d.snapshots[r.stateHash]);assert(b&&await sha256(b.bytes)===b.hash,'SNAPSHOT_MISSING');
  const state=validateState(parseJSON(decode(b.bytes)));assert(await domainStateFingerprint(state)===r.stateHash,'SNAPSHOT_HASH');
  assert(r.assetHashes.includes(b.hash)&&usedAssets(state).every(h=>r.assetHashes.includes(h)),'SNAPSHOT_REFERENCES');
  for(const h of r.assetHashes)assert(assets.get(h)?.byteLength===d.history.assets[h],'HISTORY_ASSET_MISSING');
 }
 return d;
}
export async function appendDocument(doc,state,assets,command,{acceptPruning=false}={}){
 const next=data(doc),map=new Map(assets);next.state=validateState(state);
 const after=await addSnapshot(state,map,next.snapshots),plan=await planHistoryAppend(doc.history,{id:uuid(),after,command,assets:[...map.values()].map(({hash,byteLength})=>({hash,byteLength}))});
 next.history=await acceptHistoryAppend(doc.history,plan,{acceptPruning});
 trimSnapshots(next);return {document:next,assets:map,pruned:plan.evicted};
}
export async function moveDocument(doc,assets,direction,{acceptPruning=false}={}){
 const plan=await planHistoryMove(doc.history,direction),bytes=assets.get(doc.snapshots[plan.target.stateHash])?.bytes;assert(bytes,'HISTORY_SNAPSHOT_MISSING');
 const restored=await restoreDomainSnapshot(doc.state,parseJSON(decode(bytes)),plan,{validateDomain:validateState});
 const next={...data(doc),state:restored.candidate,history:await acceptHistoryMove(doc.history,plan,restored.appliedReference,{acceptPruning})};
 trimSnapshots(next);return {document:next,assets:new Map(assets)};
}
function trimSnapshots(d){const keep=new Set([d.history.current,...d.history.transactions.flatMap(t=>[t.before,t.after])].map(r=>r.stateHash));d.snapshots=Object.fromEntries(Object.entries(d.snapshots).filter(([h])=>keep.has(h)));}
export function commitInventory(doc,assets){
 return [...new Set([...Object.keys(doc.history.assets),...(doc.retainedAssets??[])])].map(hash=>{const a=assets.get(hash);assert(a,'ASSET_MISSING');return {kind:a.kind,bytes:a.bytes};});
}
export function parameterViews(state,canEdit){
 const values=domain.effectiveValues(state),entries=domain.effectiveEntries(state);
 return domain.FIELD_SCHEMA.filter(f=>f.lifecycle==='active'&&f.ui.visibleRow!==false&&f.applicability.products.includes(state.product)).map(f=>{
 const value=values[f.id],availability=domain.fieldAvailability(f.id,{product:state.product,sourceKind:state.sourceKind,values});
 const enabled=canEdit&&availability.applicable&&f.type!=='tolerance';
 const numeric=f.type==='decimal'||f.type==='height',auto=f.type==='height'&&value?.heightMode==='auto',layer=f.type==='height'&&value?.heightMode==='layers';
 return {id:f.id,label:f.ui.label,group:f.group,kind:f.type==='boolean'?'boolean':f.type==='enum'||auto?'select':'number',
 value:typeof value==='boolean'?value:auto?'auto:'+value.mode:layer?String(value.layers):f.type==='height'?String(value.mm):f.type==='tolerance'?'':String(value),
 unit:layer?'layers':f.unit??null,...(f.domain.kind==='range'?{min:String(f.domain.min),max:String(f.domain.max)}:{}),
 ...(numeric?{step:String(f.ui.increment??0.000001)}:{}),...(f.type==='enum'?{options:f.domain.values.map(value=>({value,label:value}))}:auto?{options:[{value:'auto:'+value.mode,label:value.mode}]}:{}),
 advanced:f.ui.advanced,visible:true,enabled,...(!enabled?{reason:!canEdit?'Hãy đăng nhập và mở khóa dự án này trước khi đổi tham số.':!availability.applicable?'Tham số được giữ lại nhưng đang không có hiệu lực.':'Dung sai được chọn theo phiên bản qua chức năng của nhân, không sửa trực tiếp.'}:{}),
 overridden:entries[f.id]?.origin==='user',derivedLabel:f.type==='height'?String(domain.resolveFieldMm(state,f.id))+' mm; chưa xác minh hình học/độ khớp':f.verification.geometry};
 });
}
export function setParameter(state,id,value){
 const f=domain.getField(id);
 if(id==='layerH')return domainCommand(state,{id:'schedule.set',args:{layerHeight:value}}).state;
 if(f.type==='height'){
 const old=domain.effectiveValues(state)[id];
 value=typeof value==='string'&&value.startsWith('auto:')?{heightMode:'auto',mode:value.slice(5)}:old.heightMode==='layers'?{...old,layers:domain.parseDecimal(value).value}:{heightMode:'mm',mm:value};
 }
 return domainCommand(state,{id:'parameters.set',args:{changes:[{id,value}]}}).state;
}
