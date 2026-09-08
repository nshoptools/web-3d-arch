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
   ...(!f.enabled?{reason:text(f.reason)??'This exporter cannot serialize the selected format.',reasonCode:text(f.reasonCode,80)??'UNSUPPORTED_EXPORTER'}:{})};
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
 if(!REQUIREMENTS.has(option.prerequisite)){const {prerequisite,...unknown}=option;return blocked(unknown,'UNSUPPORTED_EXPORTER','The exporter has not declared a supported data prerequisite.');}
 if(!state||!projectId)return blocked(option,'PROJECT_REQUIRED','Open a committed project before exporting.');
 if(!canEdit)return blocked(option,'PROJECT_LOCKED','Authorize the current user and unlock this project before exporting.');
 if(!option.enabled)return option;
 if(option.prerequisite==='committed-source'&&!hasCommittedSource(state.content.app.source,assets))
  return blocked(option,'NO_SNAPSHOT','Commit a valid 2D source with its retained bytes before exporting.');
 if(option.prerequisite==='renderer'&&!renderer?.available)
  return blocked(option,'NO_SNAPSHOT','Attach an available viewport renderer before exporting its image.');
 if(option.prerequisite==='matching-model'){
  if(!model)return blocked(option,'NO_SNAPSHOT','Build and apply a complete model before exporting this format.');
  if(model.ticket.projectId!==projectId||model.ticket.revision!==state.revision)
   return blocked(option,'STALE_REVISION','Build and apply the current project revision before exporting this format.');
  if(state.content.app.mesh&&!state.content.app.mesh.applied)
   return blocked(option,'UNAPPLIED_MESH_EDIT','Apply imported mesh edits before exporting this mesh format.');
 }
 const {reason,reasonCode,...enabled}=option;return {...enabled,enabled:true};
}
export function rescueOption({projectId,canRescue}){
 const option={id:'project',label:'Rescue project package',extension:'arch-project.zip',prerequisite:'project-bytes',enabled:true,verdict:'unverified'};
 if(!projectId)return blocked(option,'PROJECT_REQUIRED','Open a locally committed project before exporting its rescue package.');
 if(!canRescue)return blocked(option,'PROJECT_LOCKED','Rescue requires local bytes authorized for the current user.');
 return option;
}
export function settingsOption({authenticated,online,canDownload}){
 const option={id:'settings',label:'Cài đặt cá nhân (JSON)',extension:'json',prerequisite:'account-settings',enabled:true,verdict:'unverified'};
 if(!authenticated||!online)return blocked(option,'AUTH_REQUIRED','Kết nối mạng và đăng nhập để xuất cài đặt cá nhân.');
 if(!canDownload)return blocked(option,'DOWNLOAD_ADAPTER_REQUIRED','Chức năng tải tệp chưa sẵn sàng.');
 return option;
}
