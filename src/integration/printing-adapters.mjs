import {ADAPTERS,validateProfile,validateSchedule,validateMaterials} from '../printing/src/profiles.mjs';
import {canonical,sealed} from '../printing/src/contracts.mjs';
import {validateSchedule as validateDomainSchedule} from '../domain/layers.mjs';
import {sha256 as hashText} from '../domain/hash.mjs';
import {deepFreeze} from '../domain/safe.mjs';

export const PRINTING_APP_VERSION='arch-app-adapters/1';
export const PRINTING_LIMITS=Object.freeze({profiles:50,jsonBytes:2*1024*1024,nodes:100000,depth:24,parts:128,materials:64});
const HASH=/^[a-f0-9]{64}$/,unsafe=new Set(['__proto__','prototype','constructor']),utf8=new TextEncoder();
const isText=(x,max=512)=>typeof x==='string'&&x.length>0&&x.length<=max&&x.isWellFormed()&&!/[\x00-\x1f\x7f]/.test(x)&&!unsafe.has(x);
const uint=x=>Number.isInteger(x)&&x>=0&&x<=0xffffffff;
const REASONS=Object.freeze({
 PRINTING_SIGNED_OUT:'Hãy đăng nhập lại trước khi đọc hồ sơ máy in riêng.',
 PRINTING_SETTINGS_REQUIRED:'Hãy tải cài đặt tài khoản hiện tại trước khi chọn máy in.',
 PRINTING_SETTINGS_SCHEMA:'Hãy nhập tài liệu cài đặt schemaVersion 1 có mảng printerProfiles trong giới hạn.',
 PRINTING_PROFILE_REQUIRED:'Hãy chọn một hồ sơ máy in đã nhập, hợp lệ và đã niêm phong.',
 PRINTING_PROFILE_DUPLICATE:'Hai bản ghi đã nhập dùng cùng ID hồ sơ. Hãy xóa hoặc đổi tên rõ ràng và niêm phong lại bản cần dùng trước khi chọn.',
 PRINTING_PROFILE_INVALID:'Hồ sơ đã chọn không qua kiểm tra. Hãy sửa hoặc thay bản ghi niêm phong đã nhập.',
 PRINTING_REFRESH_REQUIRED:'Chưa có hoặc đã đổi phần chuẩn bị máy in. Hãy làm mới phần in sau khi cài đặt, mô hình và bằng chứng kiểm tra hiện tại sẵn sàng.',
 PRINTING_CONTEXT_STALE:'Tài khoản, cài đặt, dự án hoặc bằng chứng đã đổi trong lúc chuẩn bị. Hãy chuẩn bị lại lựa chọn hiện tại.',
 PRINTING_REFRESH_SUPERSEDED:'Một lần chuẩn bị in mới hơn đã thay thế lần này.',
 PRINTING_MODEL_REQUIRED:'Hãy dựng và áp dụng mô hình cho dự án hiện tại trước khi chuẩn bị xuất cho máy in.',
 PRINTING_FINAL_EVIDENCE_REQUIRED:'Hãy chờ bằng chứng cảnh cuối của mô hình hiện tại và ánh xạ vật liệu rõ ràng.',
 PRINTING_RUNTIME_UNVERIFIED:'Hãy cung cấp ABI in đã kiểm và bằng chứng chính xác về module/dịch vụ cho đúng runtime đang chạy.',
 PRINTING_PROJECT_SCHEDULE_MISMATCH:'Hãy dựng lại bằng lịch lớp đã lưu; phần in không thay đổi giá trị hay gốc của lớp.',
 PRINTING_PROJECT_PROFILE_MISMATCH:'Dự án dùng chiều cao từ một hồ sơ khác. Hãy áp dụng rõ ràng hồ sơ cần dùng rồi dựng lại.',
 PRINTING_MATERIAL_UNMAPPED:'Hãy gắn mỗi ID vật liệu của cảnh cuối với vật liệu dự án hiện tại và khe hồ sơ rõ ràng.',
 PRINTING_MATERIAL_CONFLICT:'ID vật liệu, khe, màu hoặc ánh xạ đầu đùn vật lý bị xung đột. Hãy lưu một ánh xạ nhất quán trước khi xuất.',
 PRINTING_NATIVE_ID_COLLISION:'ID vật liệu đầy đủ cần các giá trị uint32 riêng biệt và rõ ràng; ID bị thu hẹp hoặc dùng lại không đạt.',
 PRINTING_ADAPTER_MISMATCH:'Hãy chọn hồ sơ đúng slicer và đúng phiên bản được hỗ trợ.',
 PRINTING_DATA_LIMIT:'Metadata máy in vượt giới hạn byte JSON, số nút, độ sâu hoặc số mục đã công bố.',
 PRINTING_DATA_ONLY:'Hãy cung cấp JSON thuần với số hữu hạn, không có accessor, vòng tham chiếu, mảng thưa hoặc khóa prototype.',
 PRINTING_DISPOSED:'Liên kết in này đã bị hủy. Hãy dùng liên kết hiện tại của ứng dụng.',
 CANCELLED:'Đã hủy chuẩn bị in; chưa công bố lần chuẩn bị mới nào.',
});
export class PrintingAdapterError extends Error{
 constructor(code){super(REASONS[code]??('Kiểm tra in thất bại ('+code+'). Hãy sửa hồ sơ đã nhập hoặc ánh xạ của dự án hiện tại.'));this.name='PrintingAdapterError';this.code=code;}
}
const need=(v,c)=>{if(!v)throw new PrintingAdapterError(c);};
const codeOf=e=>typeof e?.code==='string'&&/^[a-zA-Z][a-zA-Z0-9_-]{1,95}$/.test(e.code)?e.code:'PRINTING_VALIDATION_FAILED';
function unavailable(error){const code=typeof error==='string'?error:codeOf(error);return deepFreeze({status:'unverified',reasonCode:code,reason:new PrintingAdapterError(code).message,verdict:'unverified'});}
function exact(x,keys,required=keys){need(x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).every(k=>keys.includes(k))&&required.every(k=>Object.hasOwn(x,k)),'PRINTING_DATA_ONLY');}
/** Copy before any await; bound nodes/text before allocating canonical JSON. */
function owned(value){
 const active=new Set(),budget={nodes:0,text:0};
 function copy(x,depth){
  need(depth<=PRINTING_LIMITS.depth&&++budget.nodes<=PRINTING_LIMITS.nodes,'PRINTING_DATA_LIMIT');
  if(typeof x==='string'){need(x.isWellFormed(),'PRINTING_DATA_ONLY');budget.text+=x.length;need(budget.text<=PRINTING_LIMITS.jsonBytes,'PRINTING_DATA_LIMIT');return x;}
  if(x===null||typeof x==='boolean')return x;
  if(typeof x==='number'){need(Number.isFinite(x),'PRINTING_DATA_ONLY');return x===0?0:x;}
  need(x&&typeof x==='object'&&!active.has(x),'PRINTING_DATA_ONLY');
  const array=Array.isArray(x);need(array||[Object.prototype,null].includes(Object.getPrototypeOf(x)),'PRINTING_DATA_ONLY');
  const keys=Reflect.ownKeys(x);need(keys.length<=PRINTING_LIMITS.nodes,'PRINTING_DATA_LIMIT');
  if(array)need(keys.length===x.length+1,'PRINTING_DATA_ONLY');
  active.add(x);const out=array?[]:{};
  for(const k of keys){
   if(array&&k==='length')continue;
   need(typeof k==='string'&&!unsafe.has(k),'PRINTING_DATA_ONLY');
   if(array)need(/^(0|[1-9]\d*)$/.test(k)&&Number(k)<x.length,'PRINTING_DATA_ONLY');
   const d=Object.getOwnPropertyDescriptor(x,k);need(d&&d.enumerable&&'value'in d,'PRINTING_DATA_ONLY');
   budget.text+=k.length;need(budget.text<=PRINTING_LIMITS.jsonBytes,'PRINTING_DATA_LIMIT');
   out[k]=copy(d.value,depth+1);
  }
  active.delete(x);return out;
 }
 const data=copy(value,0);need(utf8.encode(canonical(data)).length<=PRINTING_LIMITS.jsonBytes,'PRINTING_DATA_LIMIT');return data;
}
function profileShape(p){
 exact(p,['payload','sha256']);need(HASH.test(p.sha256),'SNAPSHOT_HASH');
 need(p.payload?.schemaVersion===1&&isText(p.payload.id,200),'PROFILE_VERSION');
 need(isText(p.payload.source?.id)&&HASH.test(p.payload.source?.sha256),'PROFILE_PROVENANCE');
}
function runtimeView(raw,record){
 if(raw?.status!=='ready')throw new PrintingAdapterError(raw?.reasonCode??'PRINTING_RUNTIME_UNVERIFIED');
 need(raw.version==='arch-printing-runtime/1'&&isText(raw.key)&&raw.client===record.client&&raw.epoch===record.root.epoch&&raw.epoch===record.client.epoch&&!record.client.disposed,'PRINTING_RUNTIME_UNVERIFIED');
 need(raw.runtimeABI===2&&raw.printingABI===1&&raw.kernelPrintingABI===2&&HASH.test(raw.moduleSha256)&&HASH.test(raw.wasmSha256)&&isText(raw.evidenceId),'PRINTING_RUNTIME_UNVERIFIED');
 need(typeof record.client.export3MF==='function','PRINTING_RUNTIME_UNVERIFIED');
 return {version:raw.version,key:raw.key,epoch:raw.epoch,runtimeABI:2,printingABI:1,kernelPrintingABI:2,moduleSha256:raw.moduleSha256,wasmSha256:raw.wasmSha256,evidenceId:raw.evidenceId};
}
function materialsFor(scene,state,profile){
 const input=state.content?.app?.materials;
 need(Array.isArray(input)&&input.length<=4096,'PRINTING_MATERIAL_UNMAPPED');
 const byId=new Map();for(const m of input){need(m&&isText(m.id)&&!byId.has(m.id),'PRINTING_MATERIAL_CONFLICT');byId.set(m.id,m);}
 need(Array.isArray(scene.parts)&&scene.parts.length>0&&scene.parts.length<=PRINTING_LIMITS.parts,'PRINTING_MATERIAL_UNMAPPED');
 const materials=new Map(),native=new Map(),parts=new Set(),semantics=new Set();
 for(const p of scene.parts){
  need(Number.isInteger(p.partIndex)&&p.partIndex>=0&&p.partIndex<scene.parts.length&&!parts.has(p.partIndex)&&uint(p.sourceIndex),'PRINTING_MATERIAL_UNMAPPED');parts.add(p.partIndex);
  need(isText(p.semanticId)&&!semantics.has(p.semanticId)&&isText(p.materialId)&&uint(p.materialSourceId),'PRINTING_MATERIAL_UNMAPPED');semantics.add(p.semanticId);
  need(Array.isArray(p.sourceSemanticIds)&&p.sourceSemanticIds.length>0&&p.sourceSemanticIds.length<=128&&p.sourceSemanticIds.every(x=>isText(x)),'PRINTING_MATERIAL_UNMAPPED');
  need(!native.has(p.materialSourceId)||native.get(p.materialSourceId)===p.materialId,'PRINTING_NATIVE_ID_COLLISION');native.set(p.materialSourceId,p.materialId);
  const m=byId.get(p.materialId),slot=p.slot;
  need(m&&m.excluded===false&&isText(m.label,4096),'PRINTING_MATERIAL_UNMAPPED');
  need(Number.isInteger(slot)&&slot>=1&&slot<=profile.printer.slotExtruders.length&&m.slot===slot&&uint(p.rgba)&&(p.rgba&255)===255,'PRINTING_MATERIAL_CONFLICT');
  need(typeof m.color==='string'&&/^#[a-fA-F0-9]{6}(?:[fF]{2})?$/.test(m.color)&&Number.parseInt(m.color.slice(1,7)+'ff',16)===p.rgba,'PRINTING_MATERIAL_CONFLICT');
  const color=m.color.slice(0,7).toUpperCase(),type=profile.settings.filament_type[slot-1],extruder=profile.printer.slotExtruders[slot-1];
  const material={id:m.id,name:m.label,type,color,slot,extruder},prior=materials.get(m.id);
  need(!prior||prior.materialSourceId===p.materialSourceId&&canonical(prior.material)===canonical(material),'PRINTING_MATERIAL_CONFLICT');
  materials.set(m.id,{material,materialSourceId:p.materialSourceId});
 }
 need(materials.size>0&&materials.size<=PRINTING_LIMITS.materials,'MATERIAL_COUNT');
 const table={schemaVersion:1,materials:[...materials.values()].map(x=>x.material)};
 validateMaterials(table,profile);
 return table;
}
/** Metadata only. Ohm calls the existing same-Module printing service via operation. */
export function createPrintingAdapters({settings,context,kernelLeases,finalScene,runtime}={}){
 need(typeof settings==='function'&&typeof context==='function'&&kernelLeases instanceof WeakMap,'PRINTING_BINDINGS');
 need(finalScene===undefined||typeof finalScene==='function','PRINTING_BINDINGS');
 need(runtime===undefined||typeof runtime==='function','PRINTING_BINDINGS');
 let serial=0,epoch={},disposed=false,cache=null,accessSequence=0,lastAccess=null;
 function captureSettings(){
  const authority=settings();if(authority===null){if(lastAccess){++accessSequence;lastAccess=null;}return null;}
  need(authority&&isText(authority.userId)&&authority.sessionKey!==undefined&&authority.sessionKey!==null,'PRINTING_SIGNED_OUT');
  if(!lastAccess||lastAccess.userId!==authority.userId||lastAccess.sessionKey!==authority.sessionKey){++accessSequence;lastAccess={userId:authority.userId,sessionKey:authority.sessionKey};}
  need(authority.settings,'PRINTING_SETTINGS_REQUIRED');const doc=owned(authority.settings);
  need(doc.schemaVersion===1&&Number.isSafeInteger(doc.revision)&&doc.revision>=0&&doc.values&&typeof doc.values==='object'&&!Array.isArray(doc.values),'PRINTING_SETTINGS_SCHEMA');
  const profiles=doc.values.printerProfiles??[];need(Array.isArray(profiles)&&profiles.length<=PRINTING_LIMITS.profiles,'PRINTING_SETTINGS_SCHEMA');
  const stamp=canonical({revision:doc.revision,profiles});
  return {userId:authority.userId,sessionKey:authority.sessionKey,revision:doc.revision,profiles,stamp,accessSequence};
 }
 function sameSettings(s){
  const n=captureSettings();need(n&&n.userId===s.userId&&n.sessionKey===s.sessionKey&&n.stamp===s.stamp&&n.accessSequence===s.accessSequence,'PRINTING_CONTEXT_STALE');return n;
 }
 function captureScene(s,given){
  const c=context();need(c&&c.state&&isText(c.projectId)&&HASH.test(c.headHash)&&c.userId===s.userId&&c.sessionKey===s.sessionKey,'PRINTING_CONTEXT_STALE');
  const state=owned(c.state);need(Number.isSafeInteger(state.revision)&&state.revision>=0,'PRINTING_CONTEXT_STALE');
  if(given)need(given.userId===c.userId&&given.projectId===c.projectId&&given.sessionKey===c.sessionKey&&given.headHash===c.headHash&&given.model===c.model&&canonical(owned(given.state))===canonical(state),'PRINTING_CONTEXT_STALE');
  const model=c.model,record=model&&kernelLeases.get(model);need(record?.root&&record.client&&!record.client.disposed,'PRINTING_MODEL_REQUIRED');
  need(model.ticket?.userId===s.userId&&model.ticket.projectId===c.projectId&&model.ticket.revision===state.revision&&model.generation===record.root.generation,'PRINTING_CONTEXT_STALE');
  record.root.bytes(); // Lifetime check only; finalScene/Ohm own actual mesh/hash checks.
  need(typeof finalScene==='function','PRINTING_FINAL_EVIDENCE_REQUIRED');
  const raw=finalScene(record,c);if(raw?.status!=='ready')throw new PrintingAdapterError(raw?.reasonCode??'PRINTING_FINAL_EVIDENCE_REQUIRED');
  const scene=owned(raw);need(isText(scene.key)&&scene.projectId===c.projectId&&scene.revision===state.revision&&scene.headHash===c.headHash&&scene.snapshotId===record.root.id&&scene.snapshotGeneration===record.root.generation&&scene.epoch===record.root.epoch&&HASH.test(scene.snapshotSha256),'PRINTING_FINAL_EVIDENCE_REQUIRED');
  for(const [key,code]of [['invalidInput','INVALID_INPUT'],['kernelFailure','KERNEL_FAILURE'],['assemblyView','ASSEMBLY_VIEW'],['unappliedMeshEdit','UNAPPLIED_MESH_EDIT']]){
   need(typeof scene.gates?.[key]==='boolean','PRINTING_FINAL_EVIDENCE_REQUIRED');need(!scene.gates[key],code);
  }
  need(['pass','fail','unverified'].includes(scene.meshVerdict),'PRINTING_FINAL_EVIDENCE_REQUIRED');
  need(typeof runtime==='function','PRINTING_RUNTIME_UNVERIFIED');
  const service=runtimeView(runtime(record,c),record);
  return {c,state,model,record,scene,service,stamp:canonical({state,projectId:c.projectId,headHash:c.headHash,scene,service})};
 }
 function sameScene(s,p,given){
  const n=captureScene(s,given);need(n.model===p.model&&n.record===p.record&&n.stamp===p.stamp,'PRINTING_CONTEXT_STALE');return n;
 }
 function guard(s,token,signal){
  need(!disposed,'PRINTING_DISPOSED');need(!signal?.aborted,'CANCELLED');need(token.epoch===epoch&&token.serial===serial,'PRINTING_REFRESH_SUPERSEDED');sameSettings(s);
 }
 async function refresh({signal}={}){
  need(!disposed,'PRINTING_DISPOSED');need(signal===undefined||typeof signal.addEventListener==='function','PRINTING_DATA_ONLY');
  need(!signal?.aborted,'CANCELLED');const token={epoch,serial:++serial};cache=null;
  const s=captureSettings();
  if(!s)return deepFreeze({version:'arch-printing-app/1',printers:[],diagnostics:[],selection:unavailable('PRINTING_SIGNED_OUT')});
  const diagnostics=[],profiles=new Map(),printers=[],counts=new Map();
  for(const p of s.profiles){const id=p?.payload?.id;if(isText(id,200))counts.set(id,(counts.get(id)??0)+1);}
  for(let index=0;index<s.profiles.length;index++){
   const p=s.profiles[index],id=isText(p?.payload?.id,200)?p.payload.id:null;
   try{
    profileShape(p);need(counts.get(id)===1,'PRINTING_PROFILE_DUPLICATE');
    const validated=await validateProfile(p,p.payload.adapterId);guard(s,token,signal);
    const sealedProfile=deepFreeze(p);profiles.set(id,{sealed:sealedProfile,profile:validated.profile});
    printers.push({id,label:p.payload.printer.model+' · '+p.payload.id,filamentSlots:p.payload.printer.slotExtruders.length,qualified:false});
   }catch(e){
    guard(s,token,signal);diagnostics.push({index,id,reasonCode:codeOf(e),reason:unavailable(e).reason});
   }
  }
  guard(s,token,signal);
  let selected=null,selection;
  try{
   const captured=captureScene(s),id=captured.state.content?.app?.printerId;
   need(isText(id,200),'PRINTING_PROFILE_REQUIRED');
   need(counts.get(id)!==undefined,'PRINTING_PROFILE_REQUIRED');need(counts.get(id)===1,'PRINTING_PROFILE_DUPLICATE');
   const current=profiles.get(id);need(current,'PRINTING_PROFILE_INVALID');
   const project=validateDomainSchedule(captured.state.schedule);
   need(captured.scene.projectScheduleHash===project.hash,'PRINTING_PROJECT_SCHEDULE_MISMATCH');
   if(Object.values(project.sources).includes('profile'))need(project.profileId===id,'PRINTING_PROJECT_PROFILE_MISMATCH');
   const schedule=await sealed({schemaVersion:1,kind:'constant-first-regular',profileId:id,profileHash:current.sealed.sha256,
    firstLayerHeight:project.firstLayerHeight,layerHeight:project.layerHeight,origin:{...project.sources}});
   guard(s,token,signal);sameScene(s,captured);
   await validateSchedule(schedule,current.sealed);guard(s,token,signal);sameScene(s,captured);
   const materialTable=materialsFor(captured.scene,captured.state,current.profile);
   const provenance={version:'arch-printing-app/1',scope:'inspection-only',settingsRevision:s.revision,projectId:captured.c.projectId,projectRevision:captured.state.revision,headHash:captured.c.headHash,
    projectScheduleHash:project.hash,finalSceneKey:captured.scene.key,snapshotSha256:captured.scene.snapshotSha256,profileSource:current.profile.source,profileRights:current.profile.rights,
    materialBinding:'explicit-final-scene-material-id/slot; project-label/color; selected-profile-polymer/extruder',runtime:captured.service,
    qualification:{profileSchema:'validated',mesh:captured.scene.meshVerdict,slicer:'unverified',bedPlacement:'unverified',calibration:'unverified',physicalFit:'unqualified'},profileSourceBytesVerified:false};
   selection=deepFreeze({status:'ready',key:'printing:'+hashText(canonical({userId:s.userId,accessSequence:s.accessSequence,settings:s.stamp,scene:captured.stamp,profile:current.sealed.sha256,schedule,materialTable})),
    runtimeAvailable:true,printerProfile:current.sealed,schedule,materialTable,provenance});
   owned(selection);selected={captured,adapterId:current.profile.adapterId,descriptor:selection};
  }catch(e){guard(s,token,signal);selection=unavailable(e);}
  guard(s,token,signal);if(selected)sameScene(s,selected.captured);
  const report=deepFreeze({version:'arch-printing-app/1',printers,diagnostics,selection});
  cache={s,token,selected,report};return report;
 }
 function describe(adapterId,given){
  try{
   need(!disposed,'PRINTING_DISPOSED');need(Object.hasOwn(ADAPTERS,adapterId),'UNSUPPORTED_EXPORTER');
   const s=captureSettings();need(s,'PRINTING_SIGNED_OUT');need(cache&&cache.token.epoch===epoch,'PRINTING_REFRESH_REQUIRED');
   need(cache.s.userId===s.userId&&cache.s.sessionKey===s.sessionKey&&cache.s.stamp===s.stamp&&cache.s.accessSequence===s.accessSequence,'PRINTING_REFRESH_REQUIRED');
   if(!cache.selected)return cache.report.selection;
   const selected=cache.selected;sameScene(s,selected.captured,given);
   need(adapterId===selected.adapterId,'PRINTING_ADAPTER_MISMATCH');return selected.descriptor;
  }catch(e){return unavailable(e);}
 }
 return Object.freeze({version:PRINTING_APP_VERSION,
  capabilities:Object.freeze([{id:'printer.list',available:true},{id:'printing.profile-validation',available:true},{id:'printing.target-qualified',available:false,reason:'Hồ sơ đã nhập và xuất để kiểm tra không thay cho việc kiểm định bằng slicer hay in thực tế.'}].map(Object.freeze)),
  list:async options=>(await refresh(options)).printers,refresh,describe,
  reset(){++serial;++accessSequence;lastAccess=null;epoch={};cache=null;},
  dispose(){++serial;epoch={};cache=null;disposed=true;}
 });
}
