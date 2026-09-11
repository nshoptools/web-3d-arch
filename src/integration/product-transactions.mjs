import {contentEdit,domainCommand,setParameter,DEFAULT_TEXT,validateState,productLabel,slotForColour} from '../app/documents.mjs';
import {canonicalJSON,sha256,data,assert,freeze} from '../app/common.mjs';
import {parseDecimal,getField} from '../domain/index.mjs';
import {recordProductRasterEdit} from './product-source-lineage.mjs';
import {domainStateFingerprint} from '../storage/index.mjs';
export {slotForColour};
const VERSION='arch-app-adapters/1',PLAN='arch-product-transaction/1';
const COMMANDS=new Set(['text.update','text.remove','material.update','material.reset','parameter.set','parameter.reset','project.product']);
/** The same validated command preview used by the controller, before any journal
 * entry. Profile, settings, export and source editing commands remain separate. */
export function previewProductCommand(state,c){
 switch(c.type){
 case 'text.update':return contentEdit(state,a=>{a.text={...a.text,...data(c.values)};});
 case 'text.remove':return contentEdit(state,a=>{a.text=data(DEFAULT_TEXT);});
 case 'material.update':return contentEdit(state,a=>{const m=a.materials.find(m=>m.id===c.id);assert(m,'MATERIAL_NOT_FOUND');for(const k of ['color','slot','excluded','heightLayers'])if(Object.hasOwn(c,k))m[k]=k==='heightLayers'?parseDecimal(c[k]).value:c[k];m.overridden=true;
  // Only naming a slot claims one. A colour edit still moves the slot below, but that move is
  // the machine keeping one colour per slot, not the person choosing a tray number.
  m.slotOverridden=Object.hasOwn(c,'slot')?true:m.slotOverridden??false;
  if(Object.hasOwn(c,'color')&&!Object.hasOwn(c,'slot'))m.slot=slotForColour(a.materials,m,m.color);});
 case 'material.reset':return contentEdit(state,a=>{const i=a.materials.findIndex(m=>m.id===c.id),m=a.materialDefaults.find(m=>m.id===c.id);assert(i>=0&&m,'MATERIAL_NOT_FOUND');a.materials[i]=data(m);});
 case 'parameter.set':return setParameter(state,c.id,c.value);
 case 'parameter.reset':return c.id==='layerH'?domainCommand(state,{id:'schedule.set',args:{layerHeight:0.2}}).state:domainCommand(state,{id:'parameters.reset',args:{ids:[c.id]}}).state;
 case 'project.product':return domainCommand(state,{id:'product.switch',args:{product:c.product}}).state;
 default:assert(false,'PRODUCT_TRANSACTION_COMMAND');
 }
}
const ROLE_LABEL={body:'đế và thân',rim:'viền',artwork:'hình nguồn',skirt:'diềm',fastener:'chốt cài',text:'chữ',textBase:'đế chữ',stem:'trụ và gân',tray:'khay switch',region:'vùng nguồn'};
const roleLabel=role=>ROLE_LABEL[role]??String(role);
/** The consent dialog lists what will happen, in words. Records of the same kind are counted
 * together; identifiers, tuples and hashes stay in the native plan and the log, not on screen. */
/** The native roles that appear on each product's model. The plan initialises every role the
 * kernel knows; the consent names only the ones the chosen product actually prints. */
const PRODUCT_ROLES={keychain:['body','rim','artwork','text','textBase'],clicky:['body','stem','tray','artwork','text','textBase'],
 strap:['body','rim','artwork','text','textBase'],lego:['body','rim','artwork','text','textBase'],charm:['body','rim','skirt','fastener','artwork','text','textBase']};
const joinRoles=roles=>roles.map(roleLabel).join(', ');
function describeChanges(records,product){
 const counts=new Map(),lines=[],roles=[],others=[];
 const add=(key,text)=>{const n=(counts.get(key)??0)+1;counts.set(key,n);if(n===1)lines.push({key,text});};
 const shown=PRODUCT_ROLES[product]??null;
 for(const c of records){
  if(typeof c==='string'){lines.push({key:null,text:c});continue;}
  switch(c.kind){
   case 'initialize-source-palette':add('palette-new','Nhận vùng màu từ nguồn làm vật liệu mới của sản phẩm.');break;
   case 'refresh-source-palette':add('palette-refresh','Cập nhật vùng màu theo nguồn mới; thiết lập bạn đã chỉnh được giữ.');break;
   case 'initialize-role':(shown&&!shown.includes(c.role)?others:roles).push(c.role);break;
   case 'initialize-slot':add('slot','Khe filament tạm gán theo thứ tự cho tới khi chọn máy in; đổi được ở khu Lớp màu.');break;
   default:lines.push({key:null,text:'Thay đổi khác do nhân đề xuất: '+canonicalJSON(c).slice(0,1900)});
  }
 }
 // One sentence for the parts of this model; the roles of the other product
 // types are kept ready but are not this model's, so they get a clause, not a
 // bullet of their own (Grok F-07).
 if(roles.length)lines.push({key:null,text:`Đặt màu mặc định cho ${roles.length} phần của mô hình (${joinRoles(roles)})${others.length?`, giữ sẵn ${others.length} phần chỉ dùng ở loại sản phẩm khác`:''}; đổi được ở khu Lớp màu.`});
 else if(others.length)lines.push({key:null,text:`Giữ sẵn màu mặc định cho ${others.length} phần chỉ dùng ở loại sản phẩm khác (${joinRoles(others)}); không xuất hiện trên mô hình này.`});
 return lines.map(l=>{const n=l.key?counts.get(l.key):1;return n>1?l.text.replace(/^(Nhận|Cập nhật|Gán khe filament logic cho) /,`$1 ${n} `):l.text;});
}
function describeProposal(c){
 switch(c.kind){
  case 'source-palette-rebind':return 'Cần bạn quyết định: một vùng màu của nguồn trước đây gắn với vật liệu bạn đã chỉnh tay; thiết lập cũ được giữ để bạn chọn lại.';
  case 'bind-native-role':return `Cần bạn chọn vật liệu cho vai ${roleLabel(c.role)} (có ${c.candidates?.length??0} lựa chọn).`;
  case 'material-slot-remap':return `Khe filament ${c.slot} đang có nhiều màu; cần bạn chọn lại khe cho các vật liệu này.`;
  case 'resolve-region-height-datum':return 'Cần xác định mặt đáy thật của vùng nguồn trước khi đặt chiều cao riêng cho vùng đó.';
  case 'resolve-text-datums':return 'Cần xác định các mặt chuẩn cho chữ (chiều cao và đế chữ) trên mô hình thật.';
  case 'source-identity-rebind':return 'Nguồn đã đổi bản sửa; các vật liệu gắn với nguồn cũ cần được gắn lại.';
  default:return 'Cần bạn quyết định: '+canonicalJSON(c).slice(0,1900);
 }
}
export function createProductTransactions({sourceContexts,context}){
 assert(typeof sourceContexts?.prepareUpdate==='function'&&typeof context==='function','PRODUCT_TRANSACTION_BINDINGS');
 let epoch=1;const plans=new Set();
 function wrap(native,product,lead=[]){
  const changes=[...lead,...describeChanges(native.bindingChanges,product),
   ...native.bindingProposals.map(describeProposal),
   ...(native.faces.length?native.faces.map(f=>`Gắn mặt chuẩn ${f.datum} của ${f.semanticId} vào mặt thật tại z = ${f.z0} mm (lớp tham chiếu ${f.referenceLayer}).`):[])];
  const preview=native.status==='proposal'?native.preview():null;
  if(preview?.state.content.app.text.asSource)changes.push('Dùng đường viền chữ đã kiểm làm hình nguồn. Kích thước sản phẩm, chế độ hình, chiều cao hình, thân và viền quyết định chế tạo; các điều khiển chiều cao, đế và vị trí của chữ được giữ nhưng không tác dụng trong vai này.');
  changes.push('Chốt byte nguồn, vật liệu, chữ và các tham chiếu lớp cùng nhau, rồi dựng mô hình mới từ bản này.');
  assert(changes.length<=200&&changes.every(s=>s.length<=2000),'PRODUCT_TRANSACTION_DESCRIPTION_LIMIT');
  let retired=false;const release=()=>{if(!retired){retired=true;plans.delete(release);native.release();}};plans.add(release);
  return Object.freeze({...native,version:PLAN,changes:freeze(changes),release,
   async replan(control,index){assert(!retired,'PRODUCT_PROPOSAL_CONSUMED');try{return wrap(await native.replan(control,index),product);}finally{release();}},
   preview(){assert(!retired,'PRODUCT_PROPOSAL_CONSUMED');return native.preview();},
   async confirm(control){assert(!retired,'PRODUCT_PROPOSAL_CONSUMED');try{return await native.confirm(control);}finally{release();}}
  });
 }
 async function deferred(input){
  const control=input.control,base=data(input.state),capturedEpoch=epoch,sessionKey=context()?.sessionKey,headHash=await domainStateFingerprint(base);
  const g=()=>{const current=context();assert(capturedEpoch===epoch&&!control.signal.aborted&&current.sessionKey===sessionKey&&current.userId===control.ticket.userId&&current.projectId===control.ticket.projectId&&canonicalJSON(current.state)===canonicalJSON(base),'PRODUCT_TRANSACTION_RETIRED');};g();
  const prepared=await sourceContexts.prepareAdoptionPlan({...control,purpose:'source',operation:input.operation,state:base,source:input.source,
   sourceContext:input.source.metadata.sourceContext,assets:input.assets,materials:input.materials,materialDefaults:input.materialDefaults});g();
  assert(prepared.status==='deferred','PRODUCT_TRANSACTION_DEFERRED');
  const state=contentEdit(base,(a,n)=>{a.source=data(input.source);a.source.metadata.productBindings=data(prepared.productBindings);a.materials=data(prepared.materials);a.materialDefaults=data(prepared.materialDefaults);n.sourceKind=a.source.kind;});
  const expected={userId:control.ticket.userId,projectId:control.ticket.projectId,revision:base.revision,headHash,sessionKey};
  const payload={version:PLAN,status:'proposal',expected,proposedStateHash:await domainStateFingerprint(state),nativeHead:null,modelAvailable:false,diagnostics:prepared.diagnostics};
  const proposalHash=await sha256(canonicalJSON(payload));g();let used=false,retired=false;
  const release=()=>{retired=true;plans.delete(release);};plans.add(release);
  return Object.freeze({...payload,proposalHash,changes:['Giữ ảnh gốc và bản dựng ảnh đã duyệt; chưa dựng mô hình từ ảnh này.','Tách vùng màu là bước riêng: sau khi áp dụng, bấm nút bước tiếp trên thanh trên (“Chuyển sang ảnh raster để sửa” hoặc “Tách vùng màu để dựng”) và xác nhận.'],
   preview(){g();assert(!used&&!retired,'PRODUCT_PROPOSAL_CONSUMED');return {state:data(state),assets:[]};},
   async confirm(c){assert(!used&&!retired,'PRODUCT_PROPOSAL_CONSUMED');used=true;try{g();assert(c.signal===control.signal&&canonicalJSON(c.ticket)===canonicalJSON(control.ticket),'PRODUCT_PROPOSAL_HEAD');return {version:'arch-product-source-update-commit/1',proposalHash,expected,state:data(state),assets:[],nativeReceipt:null,requiresAtomicCommit:true,requiresNativeRebuild:false};}finally{release();}},release});
 }
 return Object.freeze({version:VERSION,
  recordRasterEdit:recordProductRasterEdit,
  // Imported-mesh controls stage the next explicit Apply. They cannot request
  // a generated-source rebuild while the current mesh is still unapplied.
  handles:({state,command})=>!!state?.content?.app?.source&&COMMANDS.has(command?.type)&&
   !(['parameter.set','parameter.reset'].includes(command.type)&&getField(command.id).group==='imported_mesh'),
  async prepareCommand(input){
   const prospectiveState=previewProductCommand(input.state,input.command);
   // A product switch is the one command whose consent must first say what changes type.
   const lead=input.command.type==='project.product'?['Loại sản phẩm: '+productLabel(input.state.product)+' → '+productLabel(input.command.product)+'. Thông số riêng của loại mới được đặt lại; giá trị bạn đã chỉnh tay cho các thông số chung được giữ.']:[];
   return wrap(await sourceContexts.prepareUpdate({...input,prospectiveState}),prospectiveState.product,lead);},
  async prepareAdoption(input){
   const source=input.source;
   if(source.raster&&!source.metadata.rasterPreparation||source.kind!=='svg'&&!source.raster&&!source.metadata.numericSvgHash)return deferred(input);
   return wrap(await sourceContexts.prepareUpdate(input),input.state?.product);
  },
  reset(){epoch++;for(const release of [...plans])release();}
 });
}
