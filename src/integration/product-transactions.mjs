import {contentEdit,domainCommand,setParameter,DEFAULT_TEXT,validateState} from '../app/documents.mjs';
import {canonicalJSON,sha256,data,assert,freeze} from '../app/common.mjs';
import {parseDecimal,getField} from '../domain/index.mjs';
import {recordProductRasterEdit} from './product-source-lineage.mjs';
import {domainStateFingerprint} from '../storage/index.mjs';
const VERSION='arch-app-adapters/1',PLAN='arch-product-transaction/1';
const COMMANDS=new Set(['text.update','text.remove','material.update','material.reset','parameter.set','parameter.reset','project.product']);
/** The same validated command preview used by the controller, before any journal
 * entry. Profile, settings, export and source editing commands remain separate. */
export function previewProductCommand(state,c){
 switch(c.type){
 case 'text.update':return contentEdit(state,a=>{a.text={...a.text,...data(c.values)};});
 case 'text.remove':return contentEdit(state,a=>{a.text=data(DEFAULT_TEXT);});
 case 'material.update':return contentEdit(state,a=>{const m=a.materials.find(m=>m.id===c.id);assert(m,'MATERIAL_NOT_FOUND');for(const k of ['color','slot','excluded','heightLayers'])if(Object.hasOwn(c,k))m[k]=k==='heightLayers'?parseDecimal(c[k]).value:c[k];m.overridden=true;});
 case 'material.reset':return contentEdit(state,a=>{const i=a.materials.findIndex(m=>m.id===c.id),m=a.materialDefaults.find(m=>m.id===c.id);assert(i>=0&&m,'MATERIAL_NOT_FOUND');a.materials[i]=data(m);});
 case 'parameter.set':return setParameter(state,c.id,c.value);
 case 'parameter.reset':return c.id==='layerH'?domainCommand(state,{id:'schedule.set',args:{layerHeight:0.2}}).state:domainCommand(state,{id:'parameters.reset',args:{ids:[c.id]}}).state;
 case 'project.product':return domainCommand(state,{id:'product.switch',args:{product:c.product}}).state;
 default:assert(false,'PRODUCT_TRANSACTION_COMMAND');
 }
}
export function createProductTransactions({sourceContexts,context}){
 assert(typeof sourceContexts?.prepareUpdate==='function'&&typeof context==='function','PRODUCT_TRANSACTION_BINDINGS');
 let epoch=1;const plans=new Set();
 function wrap(native){
  const changes=[...native.bindingChanges.map(c=>typeof c==='string'?c:canonicalJSON(c)),
   ...native.bindingProposals.map(c=>'Resolve binding: '+canonicalJSON(c)),
   ...(native.faces.length?native.faces.map(f=>`Bind datum ${f.datum} of semantic ${f.semanticId} to actual face ${f.z0} mm, reference layer ${f.referenceLayer}`):[])];
  const preview=native.status==='proposal'?native.preview():null;
  if(preview?.state.content.app.text.asSource)changes.push('Use checked text outlines as artwork source. Product size, art mode, artwork height, body and rim parameters govern manufacturing; overlay height/base/placement controls are retained inactive in this role.');
  changes.push('Commit source bytes, material identities, text and layer references together; build a new model from this head');
  assert(changes.length<=200&&changes.every(s=>s.length<=2000),'PRODUCT_TRANSACTION_DESCRIPTION_LIMIT');
  let retired=false;const release=()=>{if(!retired){retired=true;plans.delete(release);native.release();}};plans.add(release);
  return Object.freeze({...native,version:PLAN,changes:freeze(changes),release,
   async replan(control,index){assert(!retired,'PRODUCT_PROPOSAL_CONSUMED');try{return wrap(await native.replan(control,index));}finally{release();}},
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
  return Object.freeze({...payload,proposalHash,changes:['Retain original artwork and approved render without a model','Raster segmentation needs a separate explicit conversion approval'],
   preview(){g();assert(!used&&!retired,'PRODUCT_PROPOSAL_CONSUMED');return {state:data(state),assets:[]};},
   async confirm(c){assert(!used&&!retired,'PRODUCT_PROPOSAL_CONSUMED');used=true;try{g();assert(c.signal===control.signal&&canonicalJSON(c.ticket)===canonicalJSON(control.ticket),'PRODUCT_PROPOSAL_HEAD');return {version:'arch-product-source-update-commit/1',proposalHash,expected,state:data(state),assets:[],nativeReceipt:null,requiresAtomicCommit:true,requiresNativeRebuild:false};}finally{release();}},release});
 }
 return Object.freeze({version:VERSION,
  recordRasterEdit:recordProductRasterEdit,
  // Imported-mesh controls stage the next explicit Apply. They cannot request
  // a generated-source rebuild while the current mesh is still unapplied.
  handles:({state,command})=>!!state?.content?.app?.source&&COMMANDS.has(command?.type)&&
   !(['parameter.set','parameter.reset'].includes(command.type)&&getField(command.id).group==='imported_mesh'),
  async prepareCommand(input){const prospectiveState=previewProductCommand(input.state,input.command);return wrap(await sourceContexts.prepareUpdate({...input,prospectiveState}));},
  async prepareAdoption(input){
   const source=input.source;
   if(source.raster&&!source.metadata.rasterPreparation||source.kind!=='svg'&&!source.raster&&!source.metadata.numericSvgHash)return deferred(input);
   return wrap(await sourceContexts.prepareUpdate(input));
  },
  reset(){epoch++;for(const release of [...plans])release();}
 });
}
