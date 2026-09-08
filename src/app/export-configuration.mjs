import {assert,data,freeze,keys,utf8} from './common.mjs';
import {parseDecimal,decimalUnits} from '../domain/decimal.mjs';

const FORMATS=freeze({
 'svg-color':{extension:'svg',source:true},'svg-section':{extension:'svg',native:true,section:true},
 'stl-union':{extension:'stl',native:true,pose:true},'stl-material-zip':{extension:'zip',native:true,pose:true},
 '3mf-bambu-project':{extension:'3mf',printing:true},'3mf-snapmaker-project':{extension:'3mf',printing:true},
 'png-viewport':{extension:'png'}
});
const choice=(value,label)=>({value,label});
const supported=id=>typeof id==='string'&&Object.hasOwn(FORMATS,id);
function schema(id,name){
 assert(supported(id),'EXPORT_CONFIGURATION_UNSUPPORTED');const f=FORMATS[id];
 const fields=[{id:'filename',label:'Tên tệp',kind:'text',value:name+'.'+f.extension},
  {id:'inspection',label:'Xuất để kiểm tra',kind:'boolean',value:false,hint:'Giữ nguyên cảnh báo; không xác nhận mô hình đã sẵn sàng in.'}];
 if(f.native||f.printing){
  fields.push({id:'pose',label:'Hướng xuất',kind:'select',value:'manufacturing',options:[choice('manufacturing','Hệ chế tạo'),...(f.pose?[choice('pattern-down-x','Lật hoa văn xuống và đặt đáy trên bàn')]:[])],locked:!f.pose});
  fields.push({id:'restOnBed',label:'Đặt đáy trên bàn',kind:'boolean',value:false,locked:!f.pose});
 }
 if(f.native)fields.push({id:'errorMm',label:'Giới hạn sai số bước xuất',kind:'number',value:'0.004',unit:'mm',min:'0.000001',max:'0.004',step:'0.000001',hint:'Giới hạn riêng bước xuất; không phải bằng chứng sai số toàn chuỗi hoặc độ lắp vừa.'});
 if(f.section)fields.push(
  {id:'sectionMode',label:'Mặt cắt',kind:'select',value:'single',options:[choice('single','Một cao độ'),choice('sequence','Dãy cao độ')]},
  {id:'zMm',label:'Cao độ Z',kind:'number',value:'0',unit:'mm',min:'-10000',max:'10000',step:'0.000001'},
  {id:'startMm',label:'Z bắt đầu',kind:'number',value:'0',unit:'mm',min:'-10000',max:'10000',step:'0.000001'},
  {id:'endMm',label:'Z kết thúc',kind:'number',value:'1',unit:'mm',min:'-10000',max:'10000',step:'0.000001'},
  {id:'stepMm',label:'Bước cao độ',kind:'number',value:'0.2',unit:'mm',min:'0.000001',max:'10000',step:'0.000001'},
  {id:'units',label:'Đơn vị SVG',kind:'select',value:'mm',options:[choice('mm','mm'),choice('in','inch')]},
  {id:'side',label:'Mặt nhìn',kind:'select',value:'front',options:[choice('front','Trước'),choice('back','Sau')]},
  {id:'color',label:'Màu mặt cắt',kind:'select',value:'material',options:[choice('black','Đen'),choice('material','Theo vật liệu')]});
 return fields;
}
function fieldValue(field,value,id){
 if(field.kind==='boolean'){assert(typeof value==='boolean','EXPORT_FIELD_BOOLEAN');return value;}
 assert(typeof value==='string','EXPORT_FIELD_TEXT');
 if(field.kind==='number'){
  const parsed=parseDecimal(value);assert(parsed.value>=Number(field.min)&&parsed.value<=Number(field.max),'EXPORT_FIELD_RANGE');return parsed.canonical;
 }
 if(field.kind==='select'){assert(field.options.some(o=>o.value===value),'EXPORT_FIELD_CHOICE');return value;}
 assert(value.length>0&&value.length<=240&&value.isWellFormed()&&!/[\x00-\x1f\x7f]/.test(value),'EXPORT_FILENAME');
 const name=value.replace(/[<>:"/\\|?*]/g,'_').replace(/^[ .]+|[ .]+$/gu,'');
 assert(name&&!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name),'EXPORT_FILENAME');
 assert(name.toLowerCase().endsWith('.'+FORMATS[id].extension),'EXPORT_FILENAME_EXTENSION');
 assert(utf8.encode(name).length<=(FORMATS[id].native?160:240),'EXPORT_FILENAME_BUDGET');
 // The exporter owns replacement and reports its actual filename. Preserve raw input.
 return value;
}
function validateFields(id,values){
 const fields=schema(id,'Mô hình');keys(values,fields.map(f=>f.id));
 assert(fields.every(f=>Object.hasOwn(values,f.id)),'EXPORT_FIELDS_REQUIRED');
 for(const field of fields){fieldValue(field,values[field.id],id);if(field.locked)assert(values[field.id]===field.value,'EXPORT_FIELD_LOCKED');}
 if(values.pose==='pattern-down-x')assert(values.restOnBed===true,'EXPORT_PATTERN_DOWN_REST');
 if(values.sectionMode==='sequence'){
  const a=decimalUnits(values.startMm),b=decimalUnits(values.endMm),step=decimalUnits(values.stepMm);
  assert(b>a,'EXPORT_SECTION_RANGE');assert((b-a)/step+1n<=256n,'EXPORT_SECTION_BUDGET');
 }
 return values;
}
function effective(id,state){
 const saved=state.content.app.exportOptions?.formats?.[id];if(saved)return data(validateFields(id,saved));
 // Stable safe initial name: the actual project title remains in export provenance.
 const proposed=state.content.app.name+'.'+FORMATS[id].extension,filename=schema(id,'Mô hình')[0];
 let base='Mô hình';try{fieldValue(filename,proposed,id);base=state.content.app.name;}catch{}
 return Object.fromEntries(schema(id,base).map(f=>[f.id,f.value]));
}
export function validateExportConfiguration(saved){
 keys(saved,['version','formats'],['version','formats']);assert(saved.version===1,'EXPORT_CONFIGURATION_VERSION');
 keys(saved.formats,Object.keys(FORMATS),[]);for(const [id,values]of Object.entries(saved.formats))validateFields(id,values);
 return saved;
}
export function exportConfigurationView(id,state,canEdit){
 if(!supported(id)||!state)return undefined;
 const values=effective(id,state);
 return {projectRevision:state.revision,fields:schema(id,'Mô hình').map(({locked,...field})=>{
  const inactive=id==='svg-section'&&(field.id==='zMm'?values.sectionMode!=='single':['startMm','endMm','stepMm'].includes(field.id)?values.sectionMode!=='sequence':false);
  const enabled=!!canEdit&&!locked&&!inactive;
  return {...field,value:values[field.id],enabled,...(!enabled?{reason:!canEdit?'Cần quyền sửa dự án.':locked?'Đường xuất này giữ hệ chế tạo gốc.':'Trường được giữ cho chế độ mặt cắt tương ứng.'}:{})};
 })};
}
export function configureExport(state,{id,projectRevision,field,value}){
 assert(projectRevision===state.revision,'STALE_REVISION');
 const view=exportConfigurationView(id,state,true);assert(view,'EXPORT_CONFIGURATION_UNSUPPORTED');
 const descriptor=view.fields.find(f=>f.id===field);assert(descriptor,'EXPORT_FIELD_UNKNOWN');assert(descriptor.enabled,'EXPORT_FIELD_LOCKED');
 const values=effective(id,state),next=fieldValue(descriptor,value,id);
 if(values[field]===next)return null;
 values[field]=next;
 // Choosing pattern-down is one explicit pose operation, including its bed translation.
 if(field==='pose'&&next==='pattern-down-x')values.restOnBed=true;
 validateFields(id,values);
 const saved=data(state.content.app.exportOptions??{version:1,formats:{}});saved.formats[id]=values;return validateExportConfiguration(saved);
}
export function exportOptionsFor(id,state){
 if(!supported(id)||!state)return undefined;
 const v=effective(id,state),f=FORMATS[id],out={filename:v.filename,inspection:v.inspection};
 if(f.native||f.printing)out.pose={kind:v.pose,restOnBed:v.restOnBed};
 if(f.native)out.errorMm=parseDecimal(v.errorMm).value;
 if(f.source)Object.assign(out,{units:'source',side:'source',color:'source'});
 if(f.section)out.section={mode:v.sectionMode,...(v.sectionMode==='single'?{zMm:parseDecimal(v.zMm).value}:{startMm:parseDecimal(v.startMm).value,endMm:parseDecimal(v.endMm).value,stepMm:parseDecimal(v.stepMm).value}),units:v.units,side:v.side,color:v.color};
 return out;
}
export const exportOptionsSnapshot=state=>Object.fromEntries(Object.keys(FORMATS).map(id=>[id,exportOptionsFor(id,state)]));
