// Application export composition. No geometry, transport or Module is created.
import {validateProfile,validateSchedule,validateMaterials} from '../printing/src/profiles.mjs';
import {sha256,hashData,canonical,dataOnly} from '../printing/src/contracts.mjs';
import {parseXml,inspect3MF,readZip,LIMITS as ZIP_LIMITS} from '../printing/src/zip-inspect.mjs';
import {readArchSnapshot} from '../viewport/arch-view.mjs';
import {validateSchedule as validateDomainSchedule} from '../domain/layers.mjs';

export const EXPORT_APP_VERSION='arch-app-adapters/1';
export const EXPORT_FORMATS=Object.freeze([
 {id:'svg-color',label:'SVG nguồn màu',extension:'svg',prerequisite:'committed-source'},
 {id:'svg-section',label:'SVG mặt cắt scene cuối',extension:'svg',prerequisite:'matching-model',nativeFormat:3},
 {id:'3mf-bambu-project',label:'3MF dự án Bambu',extension:'3mf',prerequisite:'matching-model',adapterId:'export.3mf.bambu-project'},
 {id:'3mf-snapmaker-project',label:'3MF dự án Snapmaker',extension:'3mf',prerequisite:'matching-model',adapterId:'export.3mf.snapmaker-project'},
 {id:'stl-material-zip',label:'ZIP STL theo khe và màu (mm)',extension:'zip',prerequisite:'matching-model',nativeFormat:2},
 {id:'stl-union',label:'STL union scene cuối (mm)',extension:'stl',prerequisite:'matching-model',nativeFormat:1},
 {id:'png-viewport',label:'PNG khung xem',extension:'png',prerequisite:'renderer'},
].map(Object.freeze));
const REASONS=Object.freeze({
 NO_SNAPSHOT:'Hãy dựng và áp dụng mô hình hoàn chỉnh cho dự án hiện tại trước khi xuất định dạng này.',
 INVALID_INPUT:'Mô hình cuối có nguồn hoặc tham số không hợp lệ. Hãy sửa rồi dựng lại.',
 KERNEL_FAILURE:'Lượt dựng mô hình hiện tại đã thất bại. Hãy dựng thành công trước khi xuất.',
 ASSEMBLY_VIEW:'Hãy chuyển từ xem lắp ráp sang khung chế tạo trước khi xuất lưới.',
 UNAPPLIED_MESH_EDIT:'Hãy áp dụng thay đổi của khối nhập và dựng lại trước khi xuất định dạng lưới này.',
 STALE_REVISION:'Mô hình thuộc bản sửa khác của dự án. Hãy dựng và áp dụng bản sửa hiện tại.',
 MODEL_LEASE_RETIRED:'Mô hình này không còn hiện hành. Hãy dựng hoặc chọn mô hình hiện hành rồi xuất lại.',
 FINAL_SCENE_EVIDENCE_UNVERIFIED:'Mô hình cuối chưa có đủ bằng chứng kiểm tra. Hãy cung cấp nguồn và hồ sơ kiểm tra cảnh cuối của nó.',
 STL_FLOAT_COLLISION:'Các đỉnh khác nhau của mô hình cuối trùng về cùng một tọa độ float32 của STL. Không thể ghi STL này an toàn; hãy sửa hình học rồi dựng lại.',
 FLOAT_PROPOSAL_RETIRED:'Đề xuất xuất này đã hết hiệu lực. Hãy chuẩn bị lại đề xuất từ mô hình hiện tại.',
 FLOAT_PROPOSAL_CONSUMED:'Đề xuất này đã được xác nhận. Hãy chuẩn bị lượt xuất khác để tạo tệp khác.',
 FLOAT_CONFIRM_BUSY:'Đề xuất này đang được xác nhận.',
 FLOAT_CONFIRM_CONTROL:'Xác nhận phải dùng đúng phiếu xuất gốc và điều khiển còn hiệu lực.',
 FLOAT_PROPOSAL_METADATA:'Đề xuất của runtime không khớp yêu cầu xuất này. Chưa có tệp đã điều chỉnh nào được công bố.',
 SECTION_SUBGRID_RAW_EDGE:'Mặt cắt cuối chính xác này có cạnh nhỏ hơn mức tối thiểu hai đơn vị lưới. Hãy chọn mặt cắt được hỗ trợ hoặc sửa hình học.',
 FINAL_SCHEDULE_EVIDENCE_UNVERIFIED:'Mô hình không có hồ sơ khớp về lịch lớp đã dùng để dựng. Hãy dựng lại với lịch lớp đã lưu.',
 MESH_INSPECTION_REQUIRED:'Kiểm tra lưới cuối không đạt hoặc chưa kiểm. Hãy chọn xuất để kiểm tra nhằm giữ lại các cảnh báo đó.',
 PRINTING_INSPECTION_REQUIRED:'Đường xuất dự án slicer này chỉ dùng để kiểm tra. Chưa xác minh vòng slicer và in thực tế.',
 FINAL_EXPORT_UNAVAILABLE:'Runtime đang chạy chưa bật xuất cảnh cuối. Hãy tải runtime có dịch vụ xuất cuối.',
 PRINTING_UNAVAILABLE:'Runtime đang chạy chưa có dịch vụ in được xác minh. Hãy chọn runtime in đang khả dụng.',
 PRINTING_PROFILE_UNVERIFIED:'Hãy chọn rõ hồ sơ máy in, lịch lớp và ánh xạ vật liệu cho định dạng dự án này.',
 PRINTING_PROJECT_SCHEDULE_MISMATCH:'Lịch in khác với dự án đã lưu. Hãy lưu đúng lịch rồi dựng lại; xuất không thay đổi lịch.',
 MATERIAL_SLOT_MISMATCH:'Máy in đã chọn không biểu diễn được ánh xạ khe vật liệu. Hãy lưu ánh xạ được hỗ trợ trước khi xuất.',
 SOURCE_SVG_UNAVAILABLE:'Chưa có bộ ghi vector/màu đã lưu cho nguồn này. Hãy chọn nguồn đã lưu được hỗ trợ.',
 SOURCE_SVG_UNVERIFIED:'Nguồn này chưa được kiểm là dữ liệu vector/màu đã lưu. Hãy hoàn tất kiểm tra nguồn trước.',
 SOURCE_SNAPSHOT_STALE:'Dữ liệu vector/màu đã chuẩn bị không khớp nguồn đã lưu. Hãy chuẩn bị lại nguồn hiện tại.',
 VIEWPORT_PNG_UNAVAILABLE:'Chưa gắn bộ cung cấp PNG khung hình đầy đủ. Hãy mở khung 3D đang hoạt động trước khi chụp.',
 VIEWPORT_UNAVAILABLE:'Hãy gắn khung 3D đang hoạt động trước khi chụp ảnh của nó.',
 EXPORT_OPTIONS_REQUIRED:'Hãy chọn tên tệp và các tùy chọn rõ ràng cho định dạng xuất này.',
 EXPORT_OPTION_UNKNOWN:'Một tùy chọn không được định dạng này hỗ trợ. Hãy sửa tùy chọn xuất; giá trị không bao giờ bị bỏ qua âm thầm.',
 EXPORT_POSE_UNSUPPORTED:'Định dạng này không áp dụng được hướng xuất đã yêu cầu. Hãy dùng hướng chế tạo hoặc hướng xuất STL được hỗ trợ.',
 EXPORT_CONTEXT_STALE:'Dự án, phiên hoặc bản lưu đã đổi trong lúc xuất. Hãy xuất lại từ dự án hiện tại.',
 EXPORT_STATE_STALE:'Nội dung dự án đã đổi trong lúc xuất. Hãy xuất lại sau khi nội dung hiện tại được lưu.',
 EXPORT_PROVIDER_STALE:'Nguồn, hồ sơ đã chọn hoặc khung hình đã đổi trong lúc xuất. Hãy xuất lại lựa chọn hiện tại.',
 EXPORT_OPTIONS_STALE:'Tùy chọn xuất đã đổi trong lúc tạo tệp. Hãy xuất lại với tùy chọn hiện tại.',
 INVALID_SERIALIZATION:'Dịch vụ không trả về tệp hợp lệ hoàn chỉnh. Chưa có tệp nào được công bố; hãy sửa lỗi nguồn hoặc dịch vụ rồi thử lại.',
 CANCELLED:'Đã hủy xuất. Mô hình hiện tại được giữ nguyên.',
});
export class ExportAdapterError extends Error {
 constructor(code,message=REASONS[code]??code,details={}){super(message);this.name='ExportAdapterError';this.code=code;this.details=details;}
}
const fail=(code,message,details)=>{throw new ExportAdapterError(code,message,details);};
const need=(value,code,message)=>{if(!value)fail(code,message);};
const copy=v=>structuredClone(v);
const utf8=new TextEncoder();
const HASH=/^[a-f0-9]{64}$/;
const MB=1024*1024, MAX_BYTES=128*MB;
const text=(v,n=512)=>typeof v==='string'&&v.length>0&&v.length<=n&&v.isWellFormed()&&!/[\x00-\x1f\x7f]/.test(v);
const uint=v=>Number.isInteger(v)&&v>=0&&v<=0xffffffff;
function json(v){dataOnly(v);const s=canonical(v);need(utf8.encode(s).length<=2*MB,'EXPORT_METADATA_BUDGET');return s;}
function keys(v,allowed){need(v&&typeof v==='object'&&!Array.isArray(v),'EXPORT_OPTIONS_REQUIRED');need(Object.keys(v).every(k=>allowed.includes(k)),'EXPORT_OPTION_UNKNOWN');}
function filename(raw,extension){
 need(text(raw,240),'EXPORT_FILENAME');
 const name=raw.replace(/[<>:"/\\|?*]/g,'_').replace(/^[ .]+|[ .]+$/gu,'');
 need(name&&utf8.encode(name).length<=240&&!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name),'EXPORT_FILENAME');
 need(name.toLowerCase().endsWith('.'+extension),'EXPORT_FILENAME_EXTENSION');return name.slice(0,-extension.length)+extension;
}
function optionsFor(format,value){
 need(value&&typeof value==='object'&&!Array.isArray(value),'EXPORT_OPTIONS_REQUIRED');json(value);
 const common=['filename','inspection'],mesh=['pose'],native=['errorMm','limits'];
 keys(value,[...common,...(format.prerequisite==='matching-model'?mesh:[]),...(format.nativeFormat?native:[]),...(format.nativeFormat===3?['section']:[]),...(format.id==='svg-color'?['units','side','color']:[])]);
 need(typeof value.inspection==='boolean','EXPORT_INSPECTION_REQUIRED');
 const out=copy(value);out.filename=filename(out.filename,format.extension);
 if(format.prerequisite==='matching-model'){
  keys(out.pose,['kind','restOnBed','matrix']);need(typeof out.pose.restOnBed==='boolean','EXPORT_POSE_REQUIRED');
  need(['manufacturing','pattern-down-x','isometry'].includes(out.pose.kind),'EXPORT_POSE_REQUIRED');
  if(out.pose.kind==='isometry'){
   const m=out.pose.matrix;need(Array.isArray(m)&&m.length===12&&m.every(n=>Number.isFinite(n)&&Math.abs(n)<=10000),'EXPORT_ISOMETRY');
   for(let i=0;i<3;i++)for(let j=0;j<3;j++)need(Math.abs(m[i*4]*m[j*4]+m[i*4+1]*m[j*4+1]+m[i*4+2]*m[j*4+2]-(i===j?1:0))<=1e-10,'EXPORT_ISOMETRY');
  }else need(out.pose.matrix===undefined,'EXPORT_INACTIVE_OPTION');
  if(out.pose.kind==='pattern-down-x')need(out.pose.restOnBed,'EXPORT_PATTERN_DOWN_REST');
  if(format.adapterId||format.nativeFormat===3)need(out.pose.kind==='manufacturing'&&!out.pose.restOnBed,'EXPORT_POSE_UNSUPPORTED');
 }
 if(format.nativeFormat){
  need(utf8.encode(out.filename).length<=160,'EXPORT_FILENAME_NATIVE_BUDGET');
  need(Number.isFinite(out.errorMm)&&out.errorMm>=1e-9&&out.errorMm<=.004,'EXPORT_ERROR_BUDGET');
  if(out.limits!==undefined){const l=out.limits;need(Array.isArray(l)&&l.length===8&&l.every(uint)&&l[7]===0&&l.slice(0,7).every(n=>n>0)&&l[0]<=2000000&&l[1]<=4000000&&l[2]<=256&&l[3]<=256&&l[4]<=2000000&&l[5]>=84&&l[5]<=MAX_BYTES&&l[6]>=1024&&l[6]<=320*MB,'EXPORT_RESOURCE_BUDGET');}
 }
 if(format.nativeFormat===3){
  const s=out.section;keys(s,['mode','zMm','startMm','endMm','stepMm','units','side','color']);
  need(['mm','in'].includes(s.units)&&['front','back'].includes(s.side)&&['black','material'].includes(s.color),'EXPORT_SECTION_POLICY');
  if(s.mode==='single')need(Number.isFinite(s.zMm)&&Math.abs(s.zMm)<=10000&&Math.abs(s.zMm*1e6-Math.round(s.zMm*1e6))<=1e-6&&['startMm','endMm','stepMm'].every(k=>s[k]===undefined),'EXPORT_SECTION_RANGE');
  else {need(s.mode==='sequence'&&s.zMm===undefined&&[s.startMm,s.endMm,s.stepMm].every(n=>Number.isFinite(n)&&Math.abs(n)<=10000)&&s.endMm>s.startMm&&s.stepMm>=.000001,'EXPORT_SECTION_RANGE');
   need([s.startMm,s.endMm,s.stepMm].every(n=>Math.abs(n*1e6-Math.round(n*1e6))<=1e-5)&&Math.floor((s.endMm-s.startMm)/s.stepMm+1e-9)+1<=256,'EXPORT_SECTION_BUDGET');}
 }
 if(format.id==='svg-color')need(out.units==='source'&&out.side==='source'&&out.color==='source','EXPORT_SOURCE_POLICY');
 return out;
}
function ready(d,code){
 if(d?.status!=='ready')fail(d?.reasonCode??code,d?.reason??code,{verdict:['fail','unsupported','unverified'].includes(d?.verdict)?d.verdict:'unverified'});
 need(text(d.key),'EXPORT_PROVIDER_KEY');json(d);return d;
}
function sources(v){
 need(Array.isArray(v)&&v.length>0&&v.length<=4096,'EXPORT_SOURCE_PROVENANCE');const ids=new Set();
 for(const h of v){need(text(h.id)&&HASH.test(h.sha256)&&!ids.has(h.id),'EXPORT_SOURCE_PROVENANCE');ids.add(h.id);}
}
function authority(c){
 need(c?.state&&text(c.userId)&&text(c.projectId)&&c.sessionKey!==undefined&&c.sessionKey!==null&&HASH.test(c.headHash),'EXPORT_CONTEXT_UNVERIFIED');
 need(Number.isSafeInteger(c.state.revision)&&c.state.revision>=0,'EXPORT_REVISION');
 return {userId:c.userId,projectId:c.projectId,sessionKey:c.sessionKey,headHash:c.headHash,revision:c.state.revision};
}
function sceneEvidence(record,c,getter){
 need(record?.root&&record.client&&!record.client.disposed,'MODEL_LEASE_RETIRED');
 const root=record.root;need(typeof getter==='function','FINAL_SCENE_EVIDENCE_UNVERIFIED');
 const e=ready(getter(record,c),'FINAL_SCENE_EVIDENCE_UNVERIFIED');
 need(e.projectId===c.projectId&&e.revision===c.state.revision&&e.headHash===c.headHash,'STALE_REVISION');
 need(e.snapshotId===root.id&&e.snapshotGeneration===root.generation&&e.epoch===root.epoch&&HASH.test(e.snapshotSha256),'FINAL_SCENE_IDENTITY');
 need(['pass','fail','unverified'].includes(e.meshVerdict),'FINAL_SCENE_EVIDENCE_UNVERIFIED');
 for(const [key,code] of [['invalidInput','INVALID_INPUT'],['kernelFailure','KERNEL_FAILURE'],['assemblyView','ASSEMBLY_VIEW'],['unappliedMeshEdit','UNAPPLIED_MESH_EDIT']]){
  need(typeof e.gates?.[key]==='boolean','FINAL_SCENE_EVIDENCE_UNVERIFIED');need(!e.gates[key],code);
 }
 need(!c.state.content?.app?.mesh||c.state.content.app.mesh.applied===true,'UNAPPLIED_MESH_EDIT');
 sources(e.sourceHashes);
 const view=readArchSnapshot(root.bytes());need(view.generation===root.generation,'SNAPSHOT_GENERATION');
 need(Array.isArray(e.parts)&&e.parts.length===view.parts.length&&e.parts.length>0&&e.parts.length<=4096,'FINAL_MATERIAL_MAPPING');
 const indexes=new Set(),semantics=new Set(),materials=new Map(),nativeIds=new Map();
 for(const p of e.parts){
  const part=view.parts[p.partIndex];
  need(part&&!indexes.has(p.partIndex)&&p.sourceIndex===part.sourceIndex&&p.rgba===part.color,'FINAL_MATERIAL_MAPPING');indexes.add(p.partIndex);
  need(Number.isInteger(p.slot)&&p.slot>=1&&p.slot<=65535&&uint(p.rgba)&&(p.rgba&255)===255&&uint(p.materialSourceId),'FINAL_MATERIAL_MAPPING');
  need(text(p.semanticId)&&!semantics.has(p.semanticId)&&text(p.materialId)&&Array.isArray(p.sourceSemanticIds)&&p.sourceSemanticIds.length>0&&p.sourceSemanticIds.every(id=>text(id)),'FINAL_SEMANTIC_IDS');semantics.add(p.semanticId);
  if(p.materialProvenanceId!==undefined)need(text(p.materialProvenanceId),'FINAL_SEMANTIC_IDS');
  const binding=canonical([p.materialSourceId,p.slot,p.rgba,p.materialProvenanceId??null]);
  need(!materials.has(p.materialId)||materials.get(p.materialId)===binding,'FINAL_MATERIAL_ID_CONFLICT');materials.set(p.materialId,binding);
  need(!nativeIds.has(p.materialSourceId)||nativeIds.get(p.materialSourceId)===p.materialId,'FINAL_NATIVE_ID_COLLISION');nativeIds.set(p.materialSourceId,p.materialId);
 }
 return e;
}
function sourceDescriptor(c,provider){
 need(typeof provider?.describe==='function'&&typeof provider?.acquire==='function','SOURCE_SVG_UNAVAILABLE');
 const d=ready(provider.describe(c),'SOURCE_SVG_UNVERIFIED'),s=c.state.content?.app?.source;
 need(s&&d.sourceId===s.id&&d.sourceRevision===s.revision&&d.rawHash===s.raw?.hash&&HASH.test(d.rawHash),'SOURCE_SNAPSHOT_STALE');
 need(d.representation==='validated-vector-paint'&&d.validation==='pass'&&text(d.serializer),'SOURCE_SVG_UNVERIFIED');
 need(Array.isArray(d.dependencies)&&d.dependencies.length>0&&d.dependencies.length<=256,'SOURCE_DEPENDENCIES');
 const hashes=new Set();let total=0;
 for(const h of d.dependencies){need(HASH.test(h.sha256)&&Number.isInteger(h.bytes)&&h.bytes>0&&!hashes.has(h.sha256),'SOURCE_DEPENDENCIES');hashes.add(h.sha256);total+=h.bytes;}
 need(hashes.has(d.rawHash)&&total<=64*MB,'SOURCE_DEPENDENCIES');return d;
}
function frameDescriptor(c,provider){
 need(typeof provider?.describe==='function'&&typeof provider?.capture==='function','VIEWPORT_PNG_UNAVAILABLE');
 const d=ready(provider.describe(c),'VIEWPORT_PNG_UNVERIFIED');
 need(text(d.frameKey)&&Number.isInteger(d.width)&&Number.isInteger(d.height)&&d.width>0&&d.height>0&&d.width<=16384&&d.height<=16384&&d.width*d.height<=16777216,'VIEWPORT_FRAME');
 need(['model','source','assembly'].includes(d.view)&&Number.isSafeInteger(d.displayedRevision)&&d.displayedRevision>=0&&(d.displayedLeaseId===null||text(d.displayedLeaseId)),'VIEWPORT_FRAME');return d;
}
function ownedBytes(value,max=MAX_BYTES){need(value instanceof Uint8Array&&value.byteLength>0&&value.byteLength<=max,'INVALID_SERIALIZATION');return new Uint8Array(value);}
function stlStructure(bytes){
 need(bytes.length>=134,'INVALID_SERIALIZATION');const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),n=v.getUint32(80,true);
 need(n>0&&84+50*n===bytes.length,'INVALID_SERIALIZATION');
 for(let t=0;t<n;t++)for(let j=0;j<12;j++)need(Number.isFinite(v.getFloat32(84+50*t+4*j,true)),'INVALID_SERIALIZATION');
}
function svgDocument(bytes){
 const doc=parseXml(bytes),root=doc.documentElement;need(root.localName==='svg'&&root.namespaceURI==='http://www.w3.org/2000/svg','INVALID_SERIALIZATION');
 // Safety/readback only. The injected, validated source serializer owns paint,
 // shaping and geometry; this adapter does not rebuild SVG geometry.
 const stack=[root];while(stack.length){const n=stack.pop();
  need(!['script','foreignObject','animate','animateMotion','animateTransform','set'].includes(n.localName),'SVG_ACTIVE_CONTENT');
  for(const a of Array.from(n.attributes??[])){
   if(a.namespaceURI==='http://www.w3.org/2000/xmlns/')continue;
   need(!/^on/i.test(a.name),'SVG_ACTIVE_CONTENT');
   if(a.localName==='href')need(a.value.startsWith('#'),'SVG_EXTERNAL_RESOURCE');
   need(!/@import|(?:javascript|https?|file):/i.test(a.value),'SVG_EXTERNAL_RESOURCE');
   for(const m of a.value.matchAll(/url\s*\(\s*['"]?([^)'"\s]+)/gi))need(m[1].startsWith('#'),'SVG_EXTERNAL_RESOURCE');
  }
  if(n.localName==='style'){
   need(!/@import|(?:javascript|https?|file):/i.test(n.textContent),'SVG_EXTERNAL_RESOURCE');
   for(const m of n.textContent.matchAll(/url\s*\(\s*['"]?([^)'"\s]+)/gi))need(m[1].startsWith('#'),'SVG_EXTERNAL_RESOURCE');
  }
  for(let child=n.firstChild;child;child=child.nextSibling)if(child.nodeType===1)stack.push(child);
 }return doc;
}
function pngHeader(bytes,d){
 need(bytes.length>=57&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v),'INVALID_SERIALIZATION');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),name=at=>String.fromCharCode(...bytes.subarray(at,at+4));
 need(v.getUint32(8)===13&&name(12)==='IHDR'&&v.getUint32(16)===d.width&&v.getUint32(20)===d.height,'PNG_FRAME_DIMENSIONS');
 let at=8,idat=false,end=false;while(at<bytes.length){need(at+12<=bytes.length,'INVALID_SERIALIZATION');const n=v.getUint32(at),tag=name(at+4);need(n<=bytes.length-at-12,'INVALID_SERIALIZATION');
  let crc=0xffffffff;for(let i=at+4;i<at+8+n;i++)crc=PNG_CRC[(crc^bytes[i])&255]^(crc>>>8);
  need(((crc^0xffffffff)>>>0)===v.getUint32(at+8+n),'PNG_CRC');
  need(tag!=='IHDR'||at===8,'INVALID_SERIALIZATION');
  if(tag==='IDAT')idat=true;if(tag==='IEND'){need(n===0&&at+12===bytes.length,'INVALID_SERIALIZATION');end=true;}at+=n+12;}
 need(idat&&end,'INVALID_SERIALIZATION');
}
const PNG_CRC=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function nativeOptions(f,o,e){
 const s=o.section,pose=o.pose;
 return {format:f.nativeFormat,gates:0,verdict:{unverified:0,pass:1,fail:2}[e.meshVerdict],inspection:Number(o.inspection),revision:String(e.revision),expectedRevision:String(e.revision),filename:o.filename,
  mapping:e.parts.map(p=>({part:p.partIndex,slot:p.slot,rgba:p.rgba,source:p.sourceIndex,materialSource:p.materialSourceId})),
  orientation:{manufacturing:0,'pattern-down-x':1,isometry:2}[pose.kind],rest:Number(pose.restOnBed),error:o.errorMm,
  ...(pose.matrix?{matrix:copy(pose.matrix)}:{}),...(o.limits?{limits:copy(o.limits)}:{}),
  ...(s?{sectionMode:s.mode==='single'?0:1,z0:s.mode==='single'?s.zMm:s.startMm,z1:s.mode==='single'?s.zMm:s.endMm,step:s.mode==='single'?0:s.stepMm,side:s.side==='front'?0:1,color:s.color==='black'?0:1,units:s.units==='mm'?0:1}:{})};
}

const FLOAT_POLICY_VERSION='arch-app-float-proposal-policy/1';
function floatAvailable(client){return client?.serviceCapabilities?.finalFloat===true&&
 ['prepareFinalFloat','confirmFinalFloat','releaseFinalFloat'].every(k=>typeof client[k]==='function');}
function floatEligible(s,f){return f.nativeFormat===1&&!s.options.inspection&&s.evidence.meshVerdict==='pass'&&floatAvailable(s.record.client);}
function floatDescriptor(opaque,s,command,policy){
 need(opaque?.version==='arch-final-float-proposal/1'&&typeof opaque.release==='function'&&typeof opaque.view==='function','FLOAT_PROPOSAL_METADATA');
 const metadata=copy(opaque.metadata),confirmation=copy(opaque.confirmation);json(metadata);json(confirmation);
 need(utf8.encode(json(metadata)).length<=65536,'FLOAT_PROPOSAL_METADATA');
 const fields=['version','proposalHash','sourceHash','sourceGeneration','sourceRevision','optionsHash'];
 need(Object.keys(confirmation).length===fields.length&&fields.every(k=>Object.hasOwn(confirmation,k))&&
  confirmation.version==='arch-final-float-confirmation/1'&&HASH.test(confirmation.proposalHash)&&HASH.test(confirmation.optionsHash)&&
  confirmation.sourceHash===s.evidence.snapshotSha256&&confirmation.sourceGeneration===s.record.root.generation&&confirmation.sourceRevision===String(s.a.revision),'FLOAT_PROPOSAL_METADATA');
 need(metadata.version===opaque.version&&json(metadata.confirmation)===json(confirmation)&&json(metadata.materialMapping)===json(command.mapping),'FLOAT_PROPOSAL_METADATA');
 const c=metadata.conditioning;
 need(c?.version==='arch-final-float-conditioning/1'&&c.requiresConfirmation===true&&c.confirmed===false&&c.proposalHash===confirmation.proposalHash&&HASH.test(c.geometryHash)&&HASH.test(c.contextHash),'FLOAT_PROPOSAL_METADATA');
 need([c.maximumDisplacementMm,c.hausdorffUpperBoundMm,c.requestedLimitMm].every(n=>Number.isFinite(n)&&n>0)&&c.maximumDisplacementMm<=c.hausdorffUpperBoundMm&&c.hausdorffUpperBoundMm<=policy.maximumDisplacementMm&&c.requestedLimitMm===policy.maximumDisplacementMm,'FLOAT_PROPOSAL_METADATA');
 need([c.sourceVertices,c.sourceTriangles,c.candidateVertices,c.candidateTriangles,c.collapsedEdges,c.removedDegenerateFaceImages,c.workUnits,c.workLimit].every(n=>Number.isSafeInteger(n)&&n>0)&&
  c.sourceVertices<=65536&&c.sourceTriangles<=131072&&c.candidateVertices+c.collapsedEdges===c.sourceVertices&&c.candidateTriangles+c.removedDegenerateFaceImages===c.sourceTriangles&&c.workLimit===policy.workLimit&&c.workUnits<=c.workLimit,'FLOAT_PROPOSAL_METADATA');
 need(c.qualification?.wholePipelineErrorBoundMm===null&&c.qualification?.physicalFit==='unqualified'&&c.qualification?.ambientIsotopy==='unverified','FLOAT_PROPOSAL_METADATA');
 return {metadata,confirmation:Object.freeze(confirmation),changes:Object.freeze([
  `Điều chỉnh hình học chỉ cho tệp STL: tối đa ${c.maximumDisplacementMm} mm; cận Hausdorff ${c.hausdorffUpperBoundMm} mm so với lưới union gốc.`,
  `${c.collapsedEdges} cạnh được co; ${c.removedDegenerateFaceImages} ảnh mặt suy biến được loại. Tam giác: ${c.sourceTriangles} → ${c.candidateTriangles}.`,
  'Nguồn, mô hình và vật liệu dự án được giữ nguyên. Cận sai số toàn quy trình, ambient isotopy, slicer và độ lắp thực tế chưa được xác minh.',
 ])};
}
async function nativeReadback(result,s,f,command,hash,check){
 const bytes=ownedBytes(result?.bytes),metadata=copy(result.metadata);json(metadata);
 const expected={1:'stl-union',2:'stl-material-zip',3:'svg-final-section'}[f.nativeFormat];
 need(metadata.schema==='arch-final-export/1'&&metadata.format===expected&&metadata.sourceSnapshotGeneration===s.record.root.generation&&metadata.sourceSnapshotSha256===hash&&metadata.sourceProjectRevision===String(s.a.revision),'FINAL_OUTPUT_IDENTITY');
 const mapping=command.mapping.map(m=>({part:m.part,slot:m.slot,colorRGBA:m.rgba.toString(16).padStart(8,'0'),sourceIndex:m.source,materialSourceId:m.materialSource}));
 need(json(metadata.mapping)===json(mapping),'FINAL_OUTPUT_MAPPING');
 const mimeType={1:'model/stl',2:'application/zip',3:'image/svg+xml'}[f.nativeFormat];
 need(metadata.download?.filename===s.options.filename&&metadata.download.bytes===bytes.length&&metadata.download.mime===mimeType,'FINAL_OUTPUT_DESCRIPTOR');
 need(await sha256(bytes)===metadata.download.sha256,'FINAL_OUTPUT_HASH');check();
 if(f.nativeFormat===1)stlStructure(bytes);
 if(f.nativeFormat===2){
  const entries=readZip(bytes,{...ZIP_LIMITS,archive:MAX_BYTES,entry:MAX_BYTES,total:MAX_BYTES,entries:257}),embedded=entries.get('manifest.json');
  need(embedded&&embedded.length<=2*MB,'FINAL_ZIP_MANIFEST');const manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(embedded));
  const {download,...expectedManifest}=metadata;need(json(manifest)===json(expectedManifest),'FINAL_ZIP_MANIFEST');
  need(Array.isArray(metadata.files)&&entries.size===metadata.files.length+1,'FINAL_ZIP_FILES');
  for(const file of metadata.files){const b=entries.get(file.name);need(b&&b.length===file.bytes,'FINAL_ZIP_FILES');stlStructure(b);need(await sha256(b)===file.sha256,'FINAL_ZIP_HASH');check();}
 }
 if(f.nativeFormat===3)need(svgDocument(bytes).documentElement.getAttribute('data-scope')==='final-post-csg-section','FINAL_SECTION_SCOPE');
 return {bytes,metadata,mimeType};
}
async function applicationArtifact({bytes,mimeType,metadata,result,s,f,ticket,check,conditioning}){
 const digest=await sha256(bytes);check();
 const warnings=[...(s.options.filename!==JSON.parse(s.raw).filename?['Ký tự đường dẫn trong tên tệp đã được thay thế.']:[]),...(s.evidence&&s.evidence.meshVerdict!=='pass'?['Kết quả kiểm lưới: '+s.evidence.meshVerdict+'. Chỉ dùng để kiểm tra.']:[]),...(f.adapterId?['Chưa xác minh vòng slicer và in thực tế; gói này chỉ dùng để kiểm tra.']:[]),...(f.id==='png-viewport'&&s.provider.displayedRevision!==s.a.revision?['PNG thể hiện bản sửa đang hiển thị '+s.provider.displayedRevision+', không phải bản sửa hiện tại '+s.a.revision+'.']:[]),...(metadata.warnings??[]),...(result?.report?.warnings??[]),...(conditioning?['Điều chỉnh chỉ áp dụng cho bản dẫn xuất khi xuất. Sai số toàn chuỗi, đẳng cấu môi trường, slicer và độ khớp in thực tế vẫn chưa được xác minh.']:[])];
 const artifact={version:EXPORT_APP_VERSION,ticket,bytes,mimeType,filename:s.options.filename,metadata:{schema:'arch-app-export/1',formatId:f.id,projectId:s.a.projectId,revision:s.a.revision,headHash:s.a.headHash,options:copy(s.options),bytes:bytes.length,sha256:digest,warnings,
  qualification:{mesh:conditioning?'unverified':s.evidence?.meshVerdict??'not-applicable',...(conditioning?{sourceMesh:s.evidence.meshVerdict}:{}),slicer:'unverified',physical:'unverified',inspection:s.options.inspection},
  ...(s.evidence?{semanticParts:copy(s.evidence.parts),sourceHashes:copy(s.evidence.sourceHashes),sceneProvenance:copy(s.evidence.provenance??{}),...(s.evidence.projectScheduleHash?{projectScheduleHash:s.evidence.projectScheduleHash}:{}),...(s.record.client.serviceCapabilities?.geometryVersions?{geometryVersions:copy(s.record.client.serviceCapabilities.geometryVersions)}:{})}:{}),service:metadata,...(result?.report?{serviceReport:copy(result.report)}:{}),...(conditioning?{conditioning:copy(conditioning)}:{})}};
 json(artifact.metadata);check();return artifact;
}

/** Pure application composition over the parent's existing runtime and leases. */
export function createExportAdapters({operation,kernelLeases,context,finalScene,sourceSnapshot,viewport,printing,options=(id,c)=>c.exportOptions?.[id]}={}){
 need(typeof operation==='function'&&kernelLeases instanceof WeakMap&&typeof context==='function'&&typeof options==='function','EXPORT_BINDINGS');
 let epoch={},disposed=false,serializationFailures=new WeakMap();const jobs=new Set();
 const failureKey=s=>({sessionKey:s.a.sessionKey,headHash:s.a.headHash,userId:s.a.userId,projectId:s.a.projectId,revision:s.a.revision,state:s.stateStamp,options:json(s.options),evidence:json(s.evidence)});
 function recordedFailure(s,f){
  const prior=s.record&&serializationFailures.get(s.record)?.get(f.id);if(!prior)return;
  const now=failureKey(s);if(Object.keys(now).every(k=>now[k]===prior.identity[k])){
   if(prior.code==='STL_FLOAT_COLLISION'&&floatEligible(s,f))return;
   fail(prior.code,undefined,{gateId:'INVALID_SERIALIZATION',formatId:f.id,snapshotSha256:s.evidence.snapshotSha256});
  }
 }
 function capture(f,input){
  need(!disposed,'EXPORT_ADAPTER_DISPOSED');const c=context(),a=authority(c);
  need(input.state?.revision===a.revision,'STALE_REVISION');
  const raw=options(f.id,c),o=optionsFor(f,raw);let evidence=null,provider=null,record=null;
  if(f.prerequisite==='matching-model'){
   need(input.model&&input.model===c.model,'NO_SNAPSHOT');need(input.model.ticket.projectId===a.projectId&&input.model.ticket.revision===a.revision,'STALE_REVISION');
   record=kernelLeases.get(input.model);evidence=sceneEvidence(record,c,finalScene);
   need(input.model.generation===record.root.generation,'SNAPSHOT_GENERATION');
   need(evidence.meshVerdict==='pass'||o.inspection,'MESH_INSPECTION_REQUIRED');
   if(f.nativeFormat){need(a.revision>0,'FINAL_EXPORT_REVISION_REQUIRED','Commit the project before final-scene export; the native file command requires a positive revision.');need(record.client.serviceCapabilities?.finalExport===true&&typeof record.client.finalExport==='function','FINAL_EXPORT_UNAVAILABLE');}
   else {need(typeof record.client.export3MF==='function','PRINTING_UNAVAILABLE');
    need(o.inspection,'PRINTING_INSPECTION_REQUIRED');need(typeof printing?.describe==='function','PRINTING_PROFILE_UNVERIFIED');provider=ready(printing.describe(f.adapterId,c),'PRINTING_PROFILE_UNVERIFIED');
    need(provider.runtimeAvailable===true,'PRINTING_UNAVAILABLE');need(provider.printerProfile&&provider.schedule&&provider.materialTable,'PRINTING_PROFILE_UNVERIFIED');
    need(evidence.parts.length<=128&&evidence.sourceHashes.length<=128,'PRINTING_RESOURCE_BUDGET');
    const schedule=validateDomainSchedule(c.state.schedule),p=provider.schedule.payload;
    need(evidence.projectScheduleHash===schedule.hash,'FINAL_SCHEDULE_EVIDENCE_UNVERIFIED');
    need(p?.firstLayerHeight===schedule.firstLayerHeight&&p.layerHeight===schedule.layerHeight&&p.origin?.firstLayerHeight===schedule.sources.firstLayerHeight&&p.origin.layerHeight===schedule.sources.layerHeight,'PRINTING_PROJECT_SCHEDULE_MISMATCH');
    if(Object.values(schedule.sources).includes('profile'))need(schedule.profileId===provider.printerProfile.payload.id,'PRINTING_PROJECT_PROFILE_MISMATCH');}
  }else if(f.prerequisite==='committed-source')provider=sourceDescriptor(c,sourceSnapshot);
  else {need(input.renderer?.available===true,'VIEWPORT_UNAVAILABLE');provider=frameDescriptor(c,viewport);}
  const s={c,a,stateStamp:json(c.state),raw:json(raw),options:o,evidence:evidence?copy(evidence):null,provider:provider?copy(provider):null,record,model:input.model,epoch};
  recordedFailure(s,f);return s;
 }
 function guard(s,f,input,signal){
  need(!signal.aborted,'CANCELLED');need(s.epoch===epoch&&!disposed,'PRIVATE_RESET');
  const c=context(),a=authority(c);need(Object.keys(s.a).every(k=>s.a[k]===a[k]),'EXPORT_CONTEXT_STALE');
  need(json(c.state)===s.stateStamp,'EXPORT_STATE_STALE');
  need(json(options(f.id,c))===s.raw,'EXPORT_OPTIONS_STALE');
  if(s.record){need(c.model===s.model&&kernelLeases.get(s.model)===s.record,'MODEL_LEASE_RETIRED');
   need(s.model.generation===s.record.root.generation,'SNAPSHOT_GENERATION');
   const e=sceneEvidence(s.record,c,finalScene);need(json(e)===json(s.evidence),'FINAL_SCENE_EVIDENCE_STALE');
   if(f.nativeFormat)need(s.record.client.serviceCapabilities?.finalExport===true,'FINAL_EXPORT_UNAVAILABLE');
  }
  if(s.provider){const d=f.adapterId?ready(printing.describe(f.adapterId,c),'PRINTING_PROFILE_UNVERIFIED'):f.id==='svg-color'?sourceDescriptor(c,sourceSnapshot):frameDescriptor(c,viewport);
   need(json(d)===json(s.provider),'EXPORT_PROVIDER_STALE');}
 }
 const adapter={version:EXPORT_APP_VERSION,capabilities:EXPORT_FORMATS.map(f=>({id:'export.'+f.id,available:true})),
  formats(input){return EXPORT_FORMATS.map(f=>{const base={id:f.id,label:f.label,extension:f.extension,prerequisite:f.prerequisite};
   try{const s=capture(f,input);return {...base,enabled:true,verdict:f.adapterId?'unverified':s.evidence?.meshVerdict??'unverified'};}
   catch(e){return {...base,enabled:false,verdict:e.details?.verdict??'unverified',reasonCode:e.code??'EXPORT_BINDING_FAILED',reason:e.message||'Đường xuất chưa được gắn.'};}});},
  async export(input){
   const inputSignal=input?.signal;
   need(input?.version===EXPORT_APP_VERSION&&input.ticket&&typeof inputSignal?.addEventListener==='function'&&typeof inputSignal?.removeEventListener==='function'&&typeof input.onProgress==='function','ADAPTER_CONTROL');
   need(!inputSignal.aborted,'CANCELLED');const f=EXPORT_FORMATS.find(x=>x.id===input.formatId);need(f,'UNSUPPORTED_EXPORTER');need(input.prerequisite===f.prerequisite,'EXPORT_PREREQUISITE');
   need(jobs.size<1,'EXPORT_BUSY');const s=capture(f,input);
   need(input.ticket.userId===s.a.userId&&input.ticket.projectId===s.a.projectId&&input.ticket.revision===s.a.revision,'EXPORT_TICKET');
   const ticket=Object.freeze(copy(input.ticket)),abort=new AbortController();
   let opaque=null,transferred=false,retired=false,phase='preparing',cleaned=false,releaseOpaque=null;
   const cleanup=()=>{if(cleaned)return;cleaned=true;inputSignal.removeEventListener('abort',cancel);jobs.delete(job);};
   const retire=()=>{if(retired)return;retired=true;abort.abort();try{if(opaque)releaseOpaque(opaque);}finally{cleanup();}};
   const cancel=()=>{abort.abort();if(transferred)retire();},job={abort:cancel};
   jobs.add(job);inputSignal.addEventListener('abort',cancel,{once:true});
   const control={version:EXPORT_APP_VERSION,ticket,signal:abort.signal,onProgress:input.onProgress},check=()=>guard(s,f,input,abort.signal);
   const prepareProposal=async(command,hash)=>{
    need(floatEligible(s,f),'STL_FLOAT_COLLISION');
    const policy=Object.freeze({version:1,maximumDisplacementMm:Math.min(s.options.errorMm,.00001),workLimit:50_000_000});
    releaseOpaque=s.record.client.releaseFinalFloat.bind(s.record.client);
    opaque=await operation(control,(client,generation)=>{check();need(client===s.record.client,'MODEL_LEASE_RETIRED');return client.prepareFinalFloat(s.record.root,copy(command),policy,{generation});});
    check();need(floatEligible(s,f),'FINAL_FLOAT_UNAVAILABLE');const captured=floatDescriptor(opaque,s,command,policy);
    need(await sha256(s.record.root.bytes().slice())===hash,'FINAL_SCENE_HASH');check();
    phase='prepared';
    const proposal=Object.freeze({status:'prepared-proposal',version:EXPORT_APP_VERSION,ticket,proposalHash:captured.confirmation.proposalHash,changes:captured.changes,
     async confirm(nextControl){
      // Duplicate calls must not cancel a confirmation already in flight.
      need(!retired,'FLOAT_PROPOSAL_RETIRED');need(phase!=='confirming','FLOAT_CONFIRM_BUSY');need(phase==='prepared','FLOAT_PROPOSAL_CONSUMED');
      phase='confirming';let removeConfirmAbort=()=>{};
      try{
       const confirmSignal=nextControl?.signal;
       need(nextControl?.version===EXPORT_APP_VERSION&&nextControl.ticket&&json(nextControl.ticket)===json(ticket)&&typeof confirmSignal?.addEventListener==='function'&&typeof confirmSignal?.removeEventListener==='function'&&typeof nextControl.onProgress==='function','FLOAT_CONFIRM_CONTROL');
       need(!confirmSignal.aborted,'CANCELLED');confirmSignal.addEventListener('abort',cancel,{once:true});removeConfirmAbort=()=>confirmSignal.removeEventListener('abort',cancel);
       check();need(floatEligible(s,f),'FINAL_FLOAT_UNAVAILABLE');
       need(json(opaque.confirmation)===json(captured.confirmation)&&json(opaque.metadata)===json(captured.metadata),'FLOAT_PROPOSAL_METADATA');
       need(await sha256(s.record.root.bytes().slice())===hash,'FINAL_SCENE_HASH');check();
       const confirmControl={version:EXPORT_APP_VERSION,ticket,signal:abort.signal,onProgress:nextControl.onProgress};
       const result=await operation(confirmControl,(client,generation)=>{check();need(client===s.record.client,'MODEL_LEASE_RETIRED');return client.confirmFinalFloat(opaque,captured.confirmation,{generation});});check();
       const readback=await nativeReadback(result,s,f,command,hash,check);
       need(json(readback.metadata.floatConditioning)===json({...captured.metadata.conditioning,confirmed:true})&&readback.metadata.errorLedger?.floatConditioningHausdorffUpperBoundMm===captured.metadata.conditioning.hausdorffUpperBoundMm,'FLOAT_CONFIRM_OUTPUT');
       need(await sha256(s.record.root.bytes().slice())===hash,'FINAL_SCENE_HASH');check();
       const artifact=await applicationArtifact({...readback,result,s,f,ticket,check,conditioning:{status:'explicitly-confirmed',confirmation:captured.confirmation,policy:{version:FLOAT_POLICY_VERSION,conditioningVersion:policy.version,maximumDisplacementMm:policy.maximumDisplacementMm,workLimit:policy.workLimit},proposalMetadata:captured.metadata}});
       check();phase='consumed';return artifact;
      }catch(error){retire();if(typeof error?.code==='string')throw error;throw new ExportAdapterError('INVALID_SERIALIZATION');}
      finally{removeConfirmAbort();}
     },release:retire});
    check();transferred=true;return proposal;
   };
   let resource=null,receipt=null,published;
   try{
    check();input.onProgress({stage:'export-validate',progress:null});let result,bytes,mimeType,metadata,changes=[];
    if(s.record){
     const hash=await sha256(s.record.root.bytes().slice());check();need(hash===s.evidence.snapshotSha256,'FINAL_SCENE_HASH');
     if(f.nativeFormat){const command=nativeOptions(f,s.options,s.evidence);
      try{result=await operation(control,(client,generation)=>{check();need(client===s.record.client,'MODEL_LEASE_RETIRED');return client.finalExport(s.record.root,command,{generation});});}
      catch(error){
       // Only exact native geometry/serialization findings are sticky. A stale,
       // cancelled, resource-limited or malformed-service job cannot poison a route.
       const match=/^(?:INVALID_SERIALIZATION:)?(STL_FLOAT_COLLISION|SECTION_SUBGRID_RAW_EDGE)$/.exec(error?.message??'');
       if(match&&match[0]===error.message&&[match[1],'INVALID_SERIALIZATION'].includes(error?.code)&&((f.nativeFormat<3&&match[1]==='STL_FLOAT_COLLISION')||(f.nativeFormat===3&&match[1]==='SECTION_SUBGRID_RAW_EDGE'))){
        check();need(await sha256(s.record.root.bytes().slice())===hash,'FINAL_SCENE_HASH');check();
        let entries=serializationFailures.get(s.record);if(!entries){entries=new Map();serializationFailures.set(s.record,entries);}
        entries.set(f.id,{code:match[1],identity:failureKey(s)});
        if(match[1]==='STL_FLOAT_COLLISION'&&floatEligible(s,f))return await prepareProposal(command,hash);
        recordedFailure(s,f);
       }
       throw error;
      }check();
      ({bytes,metadata,mimeType}=await nativeReadback(result,s,f,command,hash,check));
     }else{
      const p=s.provider,{profile}=await validateProfile(p.printerProfile,f.adapterId);check();
      await validateSchedule(p.schedule,p.printerProfile);check();validateMaterials(p.materialTable,profile);
      for(const part of s.evidence.parts){const m=p.materialTable.materials.find(x=>x.id===part.materialId);
       need(m&&m.slot===part.slot&&Number.parseInt(m.color.slice(1,7)+'ff',16)===part.rgba,'MATERIAL_SLOT_MISMATCH');}
      const request={schemaVersion:1,purpose:'inspection',revision:String(s.a.revision),parts:s.evidence.parts.map(p=>({id:p.semanticId,name:p.semanticId,materialId:p.materialId,partIndex:p.partIndex})),materialTable:copy(p.materialTable),printerProfile:copy(p.printerProfile),schedule:copy(p.schedule),sourceHashes:copy(s.evidence.sourceHashes)};
      result=await operation(control,(client,generation)=>{check();need(client===s.record.client,'MODEL_LEASE_RETIRED');return client.export3MF(s.record.root,request,{generation,format:'project'});});check();
      bytes=ownedBytes(result?.bytes,64*MB);metadata=copy(result.metadata);json(metadata);
      need(metadata.manifest?.format===f.adapterId&&metadata.manifest.revision===request.revision&&metadata.manifest.profileHash===p.printerProfile.sha256&&metadata.manifest.scheduleHash===p.schedule.sha256,'PRINTING_OUTPUT_IDENTITY');
      const inspected=await inspect3MF(bytes,{adapterId:f.adapterId,expectedManifest:metadata.manifest});check();
      need(inspected.sha256===metadata.sha256&&metadata.byteLength===bytes.length&&metadata.mediaType==='model/3mf','PRINTING_OUTPUT_HASH');
      need(metadata.manifest.kernelSnapshot?.generation===s.record.root.generation&&metadata.manifest.kernelSnapshot.runtimeABI===2&&metadata.manifest.materialTableHash===await hashData(request.materialTable),'PRINTING_OUTPUT_IDENTITY');check();
      need(metadata.manifest.parts?.length===request.parts.length,'PRINTING_OUTPUT_PARTS');
      for(const part of s.evidence.parts){const entry=metadata.manifest.parts.find(p=>p.id===part.semanticId),materialIndex=metadata.manifest.materialAliases?.[part.materialId],material=metadata.manifest.materials?.[materialIndex];
       need(entry&&entry.materialIndex===materialIndex&&entry.slot===part.slot&&material&&Number.parseInt(material.color.slice(1,7)+'ff',16)===part.rgba,'PRINTING_OUTPUT_PARTS');}
      need(json(metadata.manifest.sourceHashes)===json(request.sourceHashes),'PRINTING_OUTPUT_PROVENANCE');mimeType='model/3mf';
     }
    }else if(f.id==='svg-color'){
     const assets=new Map();for(const h of s.provider.dependencies){const b=ownedBytes(input.assets?.get(h.sha256),64*MB);need(b.length===h.bytes,'SOURCE_ASSET_LENGTH');assets.set(h.sha256,b);}
     for(const [hash,b] of assets){need(await sha256(b)===hash,'SOURCE_ASSET_HASH');check();}
     resource=await sourceSnapshot.acquire(copy(s.provider),{...control,context:{...s.a,state:copy(s.c.state)},assets});check();need(typeof resource?.serializeSVG==='function'&&typeof resource?.release==='function','SOURCE_LEASE');
     result=await resource.serializeSVG(copy(s.options),control);check();bytes=ownedBytes(result?.bytes,16*MB);
     need(result.key===s.provider.key&&result.sourceId===s.provider.sourceId&&result.sourceRevision===s.provider.sourceRevision&&result.rawHash===s.provider.rawHash,'SOURCE_OUTPUT_IDENTITY');
     svgDocument(bytes);metadata={source:s.provider,serialization:copy(result.provenance??{})};mimeType='image/svg+xml';
     if(result.changes!==undefined){need(Array.isArray(result.changes)&&result.changes.length<=64&&result.changes.every(x=>text(x,2000)),'SOURCE_PROPOSAL');changes=copy(result.changes);}
    }else{
     receipt=await viewport.capture(copy(s.provider),{...control,context:{...s.a,state:copy(s.c.state)}});check();bytes=ownedBytes(receipt?.bytes,80*MB);
     need(receipt.key===s.provider.key&&receipt.frameKey===s.provider.frameKey,'PNG_FRAME_STALE');pngHeader(bytes,s.provider);mimeType='image/png';metadata={frame:s.provider};
    }
    const artifact=await applicationArtifact({bytes,mimeType,metadata,result,s,f,ticket,check});published=changes.length?{status:'proposal',artifact,changes}:artifact;
   }finally{
    // Never release ModelLease or its primary root lease. Providers alone own
    // these temporary receipts, including on abort or failed readback.
    if(transferred){try{check();}catch(error){retire();throw error;}}
    else {try{await receipt?.release?.();}finally{try{await resource?.release?.();}finally{if(opaque)retire();else cleanup();}}}
   }
   // Cleanup may be asynchronous and may itself retire the session/frame.
   check();return published;
  },
  reset(){epoch={};serializationFailures=new WeakMap();for(const job of jobs)job.abort();},
  dispose(){disposed=true;adapter.reset();},
 };
 const execute=adapter.export;
 adapter.export=async input=>{
  try{return await execute(input);}
  catch(error){if(typeof error?.code==='string')throw error;throw new ExportAdapterError('INVALID_SERIALIZATION',undefined,{causeName:typeof error?.name==='string'?error.name:'Error'});}
 };
 return adapter;
}
