import {createProductSourceContexts,sourceGeometry,type SourceContextKernel,type SourceContextServices} from '../../src/integration/product-source-contexts.mjs';
import {createProductAdapters,validateProductMaterialExtension} from '../../src/integration/product-adapters.mjs';
import type {Control,DomainState,SourceAdoptionInput,ModelLease} from '../../src/app/adapters.mjs';
declare const kernel:SourceContextKernel;declare const sources:SourceContextServices;
declare const c:Control;declare const state:DomainState;declare const input:SourceAdoptionInput;
const context=()=>({state,userId:'u',projectId:'p',sessionKey:'1:1'});
const bridge=createProductSourceContexts({kernel,sources,context});
const products=createProductAdapters({operation:kernel.operation,kernelLeases:new WeakMap(),context,withPreparedSource:bridge.withPreparedSource});
const reply=await bridge.prepareAdoption(input);
reply.productBindings;reply.materials;reply.ticket;
const model:ModelLease=await products.engine.build({...c,state,assets:new Map()});
model.release();
const ext=validateProductMaterialExtension({version:'arch-product-material/1',active:false,origin:'auto',identityTuple:['arch-product-identity/1','p','s','material-key','palette-x']});
const active:boolean=ext.active;
void active;void sourceGeometry;

const checkedResult=await bridge.withValidatedRegions({control:c,state,assets:new Map(),includeOverlay:true,frame:'source'},async checked=>{
 const rings:readonly (readonly (readonly [string,string])[])[]=checked.contexts[0].regions[0].ringsNm;
 checked.assertCurrent();return rings;
});
const planned=await bridge.prepareUpdate({...c,state,assets:new Map(),text:{text:'O',placement:'on-model'}});
if(planned.status==='proposal'){const delta=await planned.confirm(c);delta.productBindings;delta.nativeReceipt;}else planned.release();
void checkedResult;
