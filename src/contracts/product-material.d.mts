export const PRODUCT_MATERIAL_ROLES:readonly ['body','artwork','rim','skirt','stem','tray','fastener','text','textBase'];
export interface ProductMaterialExtension {
 version:'arch-product-material/1';active:boolean;origin:'auto'|'user'|'source';
 sourceId?:string;sourceKey?:string;nativeRole?:typeof PRODUCT_MATERIAL_ROLES[number];
 identityTuple:readonly ['arch-product-identity/1',string,string,'material-key',string];
}
export class ProductMaterialError extends Error {readonly code:string;readonly details:Record<string,never>;constructor(code:string)}
export function validateProductMaterialExtension(value:unknown):Readonly<ProductMaterialExtension>;
