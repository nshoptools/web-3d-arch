import {VERSION,assert,data,freeze} from './common.mjs';
const REQUIREMENTS=new Set(['committed-source','renderer','matching-model']);
const RESERVED=new Set(['project','rescue-project','raw-project','settings']);
const text=(value,max=2000)=>typeof value==='string'&&value.trim().length>0&&value.length<=max?value.trim():null;
const blocked=(option,code,reason)=>({...option,enabled:false,reasonCode:code,reason});
export function exportContext(state,model,rendererAvailable){
 return {state:state?freeze(data(state)):null,model:model??null,renderer:Object.freeze({available:rendererAvailable===true})};
}
export function declaredFormats(adapter,context){
 assert(adapter?.version===VERSION&&typeof adapter.formats==='function','UNSUPPORTED_EXPORTER');
 const formats=adapter.formats(context),ids=new Set();
 assert(Array.isArray(formats)&&formats.length<=64,'EXPORT_REGISTRY_INVALID');
 return formats.map(f=>{
  assert(f&&typeof f.id==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(f.id)&&!RESERVED.has(f.id)&&!ids.has(f.id),'EXPORT_REGISTRY_INVALID');ids.add(f.id);
  assert(text(f.label,200)&&typeof f.extension==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(f.extension)&&typeof f.enabled==='boolean'&&['pass','fail','unverified','unsupported'].includes(f.verdict),'EXPORT_REGISTRY_INVALID');
  return {id:f.id,label:f.label,extension:f.extension,enabled:f.enabled,verdict:f.verdict,prerequisite:f.prerequisite??'matching-model',
   ...(!f.enabled?{reason:text(f.reason)??'Bộ xuất này chưa ghi được định dạng đã chọn.',reasonCode:text(f.reasonCode,80)??'UNSUPPORTED_EXPORTER'}:{})};
 });
}
function hasCommittedSource(source,assets){
 if(!source?.raw?.hash||!assets?.has(source.raw.hash))return false;
 if(source.raster&&!['rgba','preview'].every(k=>typeof source.raster[k]==='string'&&assets.has(source.raster[k])))return false;
 return true;
}
/** Pure gate selection shared by the public snapshot and the actual export command.
 * Adapter enabled is serialization readiness, not proof of geometry/fit qualification. */
export function gateExport(option,{state,model,renderer,projectId,canEdit,assets}){
 if(!REQUIREMENTS.has(option.prerequisite)){const {prerequisite,...unknown}=option;return blocked(unknown,'UNSUPPORTED_EXPORTER','Bộ xuất chưa khai báo điều kiện dữ liệu được hỗ trợ.');}
 if(!state||!projectId)return blocked(option,'PROJECT_REQUIRED','Hãy mở một dự án đã lưu trước khi xuất.');
 if(!canEdit)return blocked(option,'PROJECT_LOCKED','Hãy đăng nhập và mở khóa dự án này trước khi xuất.');
 if(!option.enabled)return option;
 if(option.prerequisite==='committed-source'&&!hasCommittedSource(state.content.app.source,assets))
  return blocked(option,'NO_SNAPSHOT','Hãy lưu một nguồn 2D hợp lệ cùng byte gốc trước khi xuất.');
 if(option.prerequisite==='renderer'&&!renderer?.available)
  return blocked(option,'NO_SNAPSHOT','Hãy gắn khung 3D đang hoạt động trước khi xuất ảnh của nó.');
 if(option.prerequisite==='matching-model'){
  if(!model)return blocked(option,'NO_SNAPSHOT','Hãy dựng và áp dụng mô hình hoàn chỉnh trước khi xuất định dạng này.');
  if(model.ticket.projectId!==projectId||model.ticket.revision!==state.revision)
   return blocked(option,'STALE_REVISION','Hãy dựng và áp dụng bản sửa hiện tại của dự án trước khi xuất định dạng này.');
  if(state.content.app.mesh&&!state.content.app.mesh.applied)
   return blocked(option,'UNAPPLIED_MESH_EDIT','Hãy áp dụng các thay đổi của khối nhập trước khi xuất định dạng lưới này.');
 }
 const {reason,reasonCode,...enabled}=option;return {...enabled,enabled:true};
}
export function rescueOption({projectId,canRescue}){
 const option={id:'project',label:'Gói cứu hộ dự án',extension:'arch-project.zip',prerequisite:'project-bytes',enabled:true,verdict:'unverified'};
 if(!projectId)return blocked(option,'PROJECT_REQUIRED','Hãy mở một dự án đã lưu trên máy trước khi xuất gói cứu hộ.');
 if(!canRescue)return blocked(option,'PROJECT_LOCKED','Cứu hộ cần dữ liệu trên máy thuộc quyền của người dùng hiện tại.');
 return option;
}
export function settingsOption({authenticated,online,canDownload}){
 const option={id:'settings',label:'Cài đặt cá nhân (JSON)',extension:'json',prerequisite:'account-settings',enabled:true,verdict:'unverified'};
 if(!authenticated||!online)return blocked(option,'AUTH_REQUIRED','Kết nối mạng và đăng nhập để xuất cài đặt cá nhân.');
 if(!canDownload)return blocked(option,'DOWNLOAD_ADAPTER_REQUIRED','Chức năng tải tệp chưa sẵn sàng.');
 return option;
}
