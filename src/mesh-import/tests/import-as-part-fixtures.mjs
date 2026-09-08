import {makeRequest,materials} from '../../../tests/product-runtime/fixtures.mjs';
/** Authored five-product requests, with one explicitly chosen RGBA per slot.
 * The generic product test materials give several colors slot1; those cannot
 * be used as an unambiguous scene export mapping. No production values change. */
export function apartProduct(product,{sourceHash,headHash}){
 const mm=mm=>({heightMode:'mm',mm});
 const changes=['keychain','strap'].includes(product)?[
  {id:'size',value:40},{id:'offset',value:0},{id:'weld',value:0},{id:'cornerR',value:0},
  {id:'fillHoles',value:false},{id:'baseH',value:mm(6)},{id:'artH',value:mm(1)},
  ...(product==='keychain'?[{id:'ringOn',value:false}]:[{id:'strapCham',value:0},{id:'strapD',value:4},{id:'strapZ',value:3}])]:[];
 const byColor=new Map([[0x30353bff,1],[0xe04444ff,2],[0xffffffff,4],[0x548687ff,5]]);
 return makeRequest(product,'noi',{sourceHash,headHash,changes,materials:materials.map(m=>({...m,slot:byColor.get(m.rgba)}))});
}
