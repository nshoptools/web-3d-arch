import {cloneJSON,canonicalJSON,keys} from '../storage/common.mjs';
export const PRODUCT_MATERIAL_ROLES=Object.freeze(['body','artwork','rim','skirt','stem','tray','fastener','text','textBase']);
export class ProductMaterialError extends Error {constructor(code){super(code);this.name='ProductMaterialError';this.code=code;this.details={};}}
const need=(value,code)=>{if(!value)throw new ProductMaterialError(code);},encode=new TextEncoder();
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const name=(s,code='PRODUCT_STABLE_KEY')=>{need(typeof s==='string'&&s.length>0&&encode.encode(s).length<=200&&!/[\u0000-\u001f\u007f]/.test(s)&&s.normalize('NFC')===s,code);return s;};
/** Shared persisted contract. No integration adapter, native module or Worker dependency. */
export function validateProductMaterialExtension(value){
 const p=cloneJSON(value);need(encode.encode(canonicalJSON(p)).length<=4096,'PRODUCT_MATERIAL_EXTENSION_BUDGET');
 keys(p,['version','active','origin','sourceId','sourceKey','nativeRole','identityTuple'],['version','active','origin','identityTuple']);
 need(p.version==='arch-product-material/1'&&typeof p.active==='boolean'&&['auto','user','source'].includes(p.origin),'PRODUCT_MATERIAL_EXTENSION');
 need(Array.isArray(p.identityTuple)&&p.identityTuple.length===5&&p.identityTuple[0]==='arch-product-identity/1'&&p.identityTuple[3]==='material-key','PRODUCT_MATERIAL_IDENTITY');
 p.identityTuple.forEach(v=>name(v,'PRODUCT_MATERIAL_IDENTITY'));
 if(p.nativeRole!==undefined)need(PRODUCT_MATERIAL_ROLES.includes(p.nativeRole),'PRODUCT_MATERIAL_ROLE');
 if(p.active)need(p.nativeRole!==undefined,'PRODUCT_MATERIAL_ROLE');
 if(p.sourceId!==undefined)name(p.sourceId);
 if(p.sourceKey!==undefined){name(p.sourceKey);need(p.sourceId===p.identityTuple[2]&&p.identityTuple[4]==='region:'+p.sourceKey,'PRODUCT_MATERIAL_IDENTITY');}
 else if(p.active)need(p.identityTuple[4]==='role:'+p.nativeRole,'PRODUCT_MATERIAL_IDENTITY');
 return freeze(p);
}
