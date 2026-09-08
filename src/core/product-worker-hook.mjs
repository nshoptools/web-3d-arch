import {createProductOperations} from './product-operations.mjs';
/** Called only inside the existing root Worker after control_reset. Parent
 * keeps its own running/failed/snapshot dispatch, lease transfer and watchdog. */
export function buildProductRecipe(Module,recipe,generation){
 const operations=createProductOperations(Module);let request=0;
 try{
  request=operations.prepare(recipe,generation);
  if(recipe.datumProbe===true){
   const proposal=operations.probeRequest(request,generation),error=new Error('PRODUCT_DATUM_PROBE');
   error.code='PRODUCT_DATUM_PROBE';error.proposal=proposal;throw error;
  }
  return operations.buildRequest(request,generation);
 }
 finally{if(request)operations.releaseRequest(request);}
}
export function productSnapshotMetadata(Module,id){return createProductOperations(Module).metadata(id);}
