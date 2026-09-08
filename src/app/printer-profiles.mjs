import {validateProfile} from '../printing/src/profiles.mjs';
import {parseJson,canonical,sha256} from '../printing/src/contracts.mjs';
import {assert,error,data,freeze,fileName,uuid} from './common.mjs';
import {PROFILE_MESSAGES} from './profile-messages.mjs';
const MAX_FILE=1024*1024,MAX_TOTAL=2*1024*1024,HASH=/^[a-f0-9]{64}$/;
const utf8=new TextEncoder(),decode=b=>new TextDecoder('utf-8',{fatal:true}).decode(b);
const clean=(v,fallback='')=>typeof v==='string'&&v.isWellFormed()?v.replace(/[\x00-\x1f\x7f]/g,' ').slice(0,240):fallback;
const reasonText=(e,fallback)=>Object.hasOwn(PROFILE_MESSAGES,e?.code)?PROFILE_MESSAGES[e.code]:PROFILE_MESSAGES[fallback];
const array=(v,test)=>Array.isArray(v)&&v.length<=64&&v.every(test)?[...v]:[];
const identity=(a,b)=>!!a&&!!b&&a.userId===b.userId&&a.epoch===b.epoch&&a.lifecycle===b.lifecycle;
const same=(a,b)=>identity(a,b)&&a.settings===b.settings&&a.revision===b.revision&&a.etag===b.etag;
const base64=bytes=>{let text='';for(let i=0;i<bytes.length;i+=16384)text+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(text);};
const profileName=name=>{fileName(name);assert(name.isWellFormed()&&!/\x7f/.test(name),'FILE_NAME');return name;};
const unbase=record=>{
 assert(record&&Object.keys(record).sort().join(',')==='byteLength,data,encoding,filename,profileHash,sha256','PROFILE_ORIGINAL_INVALID');
 assert(record?.encoding==='base64'&&Number.isSafeInteger(record.byteLength)&&record.byteLength>0&&record.byteLength<=MAX_FILE&&typeof record.data==='string'&&record.data.length===4*Math.ceil(record.byteLength/3)&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(record.data),'PROFILE_ORIGINAL_INVALID');
 const bytes=Uint8Array.from(atob(record.data),c=>c.charCodeAt(0));assert(bytes.length===record.byteLength&&base64(bytes)===record.data,'PROFILE_ORIGINAL_INVALID');profileName(record.filename);return bytes;
};
function rows(c){const list=c.settings.values?.printerProfiles??[];assert(Array.isArray(list)&&list.length<=50,'PROFILE_LIBRARY_LIMIT');return list;}
function sources(c){const list=c.settings.values?.printerProfileSources??[];assert(Array.isArray(list)&&list.length<=50,'PROFILE_LIBRARY_LIMIT');return list;}
async function checked(record){
 assert(record&&typeof record==='object'&&!Array.isArray(record)&&Object.keys(record).sort().join(',')==='payload,sha256','PROFILE_RECORD_SCHEMA');
 assert(HASH.test(record.sha256)&&typeof record.payload?.id==='string'&&record.payload.id.length>0&&record.payload.id.length<=240&&record.payload.id.isWellFormed()&&!/[\x00-\x1f\x7f]/.test(record.payload.id),'PROFILE_RECORD_SCHEMA');
 assert(utf8.encode(canonical(record)).length<=MAX_FILE,'PROFILE_FILE_LIMIT');
 return validateProfile(record,record.payload.adapterId);
}
// Byte identity is separate from the payload seal and from the declared vendor source.
async function originalBytes(original,record){
 const bytes=unbase(original);
 assert(original.profileHash===record?.sha256&&HASH.test(original.sha256)&&await sha256(bytes)===original.sha256,'PROFILE_ORIGINAL_INVALID');
 const parsed=parseJson(decode(bytes),MAX_FILE);
 assert(parsed&&Object.keys(parsed).sort().join(',')==='payload,sha256'&&parsed.payload&&typeof parsed.payload==='object'&&!Array.isArray(parsed.payload),'PROFILE_ORIGINAL_INVALID');
 assert(parsed.sha256===original.profileHash&&await sha256(utf8.encode(canonical(parsed.payload)))===parsed.sha256&&canonical(parsed)===canonical(record),'PROFILE_ORIGINAL_INVALID');
 return bytes;
}
function confirmation(title,changes,retry){throw Object.assign(error('PROFILE_CONFIRMATION_REQUIRED'),{confirmation:{title,changes,retry}});}

/** Personal settings service, independent of any project or native geometry.
 * Capture exact settings object/ETag and access epoch before asynchronous work.
 * Display caches and prepared imports never grant qualification or overwrite a
 * later settings revision. Original imported bytes are retained separately from
 * the semantic profile hash and the source hash declared inside the profile. */
export function createPrinterProfileLibrary({context,write,download,preflight=async()=>{},onChange=()=>{}}){
 assert(typeof context==='function'&&typeof write==='function'&&typeof download==='function'&&typeof preflight==='function','PROFILE_SERVICE_REQUIRED');
 let cached=null,observed=null,inflight=null,serial=0,lifecycle=0,pending=null,pendingDelete=null,closed=false,downloads=new Set();
 function capture(){
  const c=context(),revision=c?.settings?.revision;
  if(closed||!c||typeof c.userId!=='string'||!c.userId||!Number.isSafeInteger(c.epoch)||c.epoch<0||c.settings?.schemaVersion!==1||!Number.isSafeInteger(revision)||revision<0||c.etag!=='"r'+revision+'"')return null;
  // The settings object is immutable by composition contract. Capture scalar
  // fields separately so mutating a reused context object cannot move a guard.
  return Object.freeze({userId:c.userId,epoch:c.epoch,settings:c.settings,revision,etag:c.etag,lifecycle});
 }
 function guard(c){assert(same(c,capture()),'PROFILE_SETTINGS_CHANGED');}
 function guardIdentity(c){assert(identity(c,capture()),'PROFILE_SETTINGS_CHANGED');}
 async function authorize(c,signal){guard(c);await preflight(c,signal);assert(!signal?.aborted,'CANCELLED');guard(c);}
 async function publish(values,c){await authorize(c);guard(c);await write(values,c);guardIdentity(c);await refresh();guardIdentity(c);}
 function unavailable(){const c=capture();return {settingsRevision:c?.settings.revision??0,enabled:!!c,reason:c?'Đang kiểm tra hồ sơ máy in cá nhân.':'Đăng nhập và tải cài đặt cá nhân để quản lý hồ sơ máy in.',items:[]};}
 function snapshot(){const c=capture();return same(c,cached?.capture)?cached.view:freeze(unavailable());}
 async function refresh(){
  const c=capture();if(!c){if(observed||cached){observed=null;cached=null;pending=null;pendingDelete=null;serial++;}return snapshot();}
  if(same(c,observed))return inflight??snapshot();
  observed=c;cached=null;pending=null;pendingDelete=null;const turn=++serial,keyScope=uuid();
  inflight=(async()=>{
   const items=[],records=new Map();
   try{
    const list=rows(c),originals=sources(c),ids=new Map();
    for(const record of list){const id=record?.payload?.id;if(typeof id==='string')ids.set(id,(ids.get(id)??0)+1);}
    for(let index=0;index<list.length;index++){
     const record=data(list[index]),key=keyScope+':'+index,p=record?.payload;
     guard(c);if(turn!==serial)return snapshot();
     let valid=true,reason,importedFileAvailable=false;
     try{await checked(record);assert(ids.get(p.id)===1,'PROFILE_DUPLICATE_ID');}catch(e){valid=false;reason=reasonText(e,'PROFILE_RECORD_INVALID');}
     const matching=originals.filter(o=>o?.profileHash===record?.sha256);
     if(matching.length===1){try{await originalBytes(matching[0],record);importedFileAvailable=true;}catch{}}
     const view={key,id:typeof p?.id==='string'?clean(p.id):null,label:clean(p?.label,clean(p?.id,'Hồ sơ '+(index+1))),machine:clean(p?.printer?.model),slicer:clean(p?.slicer?.id),slicerVersion:clean(p?.slicer?.version),
      nozzleDiametersMm:array(p?.printer?.nozzleDiametersMm,n=>Number.isFinite(n)&&n>0&&n<100),slotExtruders:array(p?.printer?.slotExtruders,n=>Number.isInteger(n)&&n>0&&n<=64),filamentTypes:array(p?.settings?.filament_type,n=>typeof n==='string').map(v=>clean(v)),filamentColors:array(p?.settings?.filament_colour,n=>typeof n==='string'&&/^#[0-9a-fA-F]{6}(FF)?$/.test(n)),
      profileHash:HASH.test(record?.sha256)?record.sha256:null,sourceHash:HASH.test(p?.source?.sha256)?p.source.sha256:null,valid,...(reason?{reason}:{}),importedFileAvailable,qualified:false};
     items.push(view);records.set(key,{index,record,original:importedFileAvailable?data(matching[0]):null,view});
    }
    guard(c);if(turn!==serial)return snapshot();cached={capture:c,records,view:freeze({settingsRevision:c.settings.revision,enabled:true,items})};
   }catch(e){if(!same(c,capture())||turn!==serial)return snapshot();cached={capture:c,records:new Map(),view:freeze({settingsRevision:c.settings.revision,enabled:false,reason:reasonText(e,'PROFILE_LIBRARY_INVALID'),items:[]})};}
   onChange();return snapshot();
  })();try{return await inflight;}finally{if(same(c,observed))inflight=null;}
 }
 async function prepare(file){
  const c=capture();assert(c,'PROFILE_SIGN_IN_REQUIRED');await refresh();guard(c);
  assert(file&&Number.isSafeInteger(file.size)&&file.size>0&&file.size<=MAX_FILE&&typeof file.arrayBuffer==='function','PROFILE_FILE_LIMIT');
  const name=profileName(file.name),size=file.size,read=file.arrayBuffer.bind(file);
  pending=null;pendingDelete=null;const turn=++serial;await authorize(c);
  assert(turn===serial,'PROFILE_IMPORT_SUPERSEDED');let buffer;
  try{buffer=await read();}catch(e){guard(c);if(e.name==='AbortError')throw e;throw error('PROFILE_FILE_READ');}
  const bytes=new Uint8Array(buffer);guard(c);assert(turn===serial,'PROFILE_IMPORT_SUPERSEDED');assert(bytes.length===size&&bytes.length<=MAX_FILE,'FILE_SIZE');
  let text;try{text=decode(bytes);}catch{throw error('PROFILE_FILE_ENCODING');}
  const record=parseJson(text,MAX_FILE);await checked(record);guard(c);assert(turn===serial,'PROFILE_IMPORT_SUPERSEDED');
  const list=rows(c),matches=list.filter(v=>v?.payload?.id===record.payload.id);assert(matches.length<=1,'PROFILE_DUPLICATE_ID');assert(matches.length===1||list.length<50,'PROFILE_LIBRARY_LIMIT');
  const original={profileHash:record.sha256,sha256:await sha256(bytes),filename:name,byteLength:bytes.length,encoding:'base64',data:base64(bytes)};
  guard(c);assert(turn===serial,'PROFILE_IMPORT_SUPERSEDED');
  const id=uuid();pending={id,capture:c,record:data(record),original,oldHash:matches[0]?.sha256??null};
  const p=record.payload;confirmation(matches.length?'Thay hồ sơ máy in cá nhân':'Thêm hồ sơ máy in cá nhân',[
   `${clean(p.id)} · ${clean(p.printer.model)} · ${clean(p.slicer.id)} ${clean(p.slicer.version)}`,
   matches.length?'Thay đúng bản ghi cùng ID trong cài đặt cá nhân.':'Thêm một bản ghi vào cài đặt cá nhân.',
   'Giữ nguyên tệp hồ sơ đã nhập. Hồ sơ chưa được kiểm bằng slicer hoặc bản in.',
   'Không tự thay chiều cao lớp hay khe vật liệu của dự án; thay đổi này nằm ngoài undo dự án.'
  ],{type:'printer.profile-accept',id,confirmed:true});
 }
 async function accept(id,confirmed){
  assert(confirmed===true&&pending?.id===id,'PROFILE_PROPOSAL_EXPIRED');const p=pending;guard(p.capture);pending=null;
  const list=rows(p.capture).map(data),index=list.findIndex(v=>v?.payload?.id===p.record.payload.id);
  assert((index>=0?list[index].sha256:null)===p.oldHash,'PROFILE_SETTINGS_CHANGED');if(index<0)list.push(p.record);else list[index]=p.record;
  const retained=new Set(list.map(v=>v?.sha256));const originals=sources(p.capture).filter(o=>retained.has(o.profileHash)&&o.profileHash!==p.record.sha256).map(data);originals.push(p.original);
  assert(originals.length<=50&&originals.reduce((n,o)=>n+(Number.isSafeInteger(o.byteLength)?o.byteLength:MAX_TOTAL+1),0)<=MAX_TOTAL,'PROFILE_ORIGINAL_BUDGET');
  await publish({printerProfiles:list,printerProfileSources:originals},p.capture);
 }
 async function row(key,settingsRevision){
  const c=capture();assert(c&&c.settings.revision===settingsRevision,'PROFILE_SETTINGS_CHANGED');await refresh();guard(c);const item=cached?.records.get(key);assert(item,'PROFILE_RECORD_CHANGED');return{c,item};
 }
 async function remove(command){
  const {c,item}=await row(command.key,command.settingsRevision);
  if(command.confirmed!==true){
   await authorize(c);pending=null;pendingDelete={key:command.key,capture:c};
   confirmation('Xóa hồ sơ máy in cá nhân',[`Xóa ${item.view.label} khỏi cài đặt cá nhân.`, 'Dự án đã chọn hồ sơ này sẽ cần chọn lại hồ sơ hợp lệ để xuất theo máy.', 'Xóa tệp nhập được lưu cùng bản ghi nếu không còn hồ sơ nào dùng nó; không thuộc undo dự án.'],{...command,confirmed:true});
  }
  assert(pendingDelete?.key===command.key&&same(c,pendingDelete.capture),'PROFILE_PROPOSAL_EXPIRED');pendingDelete=null;
  const list=rows(c).filter((_,i)=>i!==item.index),retained=new Set(list.map(v=>v?.sha256));await publish({printerProfiles:data(list),printerProfileSources:sources(c).filter(o=>retained.has(o.profileHash)).map(data)},c);
 }
 async function exportFile(command){
  assert(typeof command.original==='boolean','PROFILE_EXPORT_MODE');const {c,item}=await row(command.key,command.settingsRevision);
  const abort=new AbortController();downloads.add(abort);
  try{
   let bytes,filename;
   if(command.original){assert(item.original,'PROFILE_ORIGINAL_UNAVAILABLE');bytes=await originalBytes(item.original,item.record);filename=item.original.filename;}
   else{bytes=utf8.encode(JSON.stringify(item.record,null,2)+'\n');filename='printer-profile-'+(typeof item.record?.sha256==='string'&&HASH.test(item.record.sha256)?item.record.sha256.slice(0,16):'invalid')+'.json';}
   await authorize(c,abort.signal);await download({bytes,filename,mimeType:'application/json',signal:abort.signal});assert(!abort.signal.aborted,'CANCELLED');guard(c);
  }finally{downloads.delete(abort);}
 }
 function reset(){serial++;lifecycle++;pending=null;pendingDelete=null;cached=null;observed=null;inflight=null;for(const abort of downloads)abort.abort();downloads.clear();}
 return Object.freeze({snapshot,refresh,prepare,accept,remove,exportFile,reset,dispose(){reset();closed=true;}});
}
