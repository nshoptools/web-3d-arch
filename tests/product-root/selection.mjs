export const FAMILIES=Object.freeze(['svg','raster','text','emoji']);
export const PRODUCTS=Object.freeze(['keychain','clicky','strap','lego','charm']);
export const STYLES=Object.freeze(['noi','chim','phang','phang2']);
export const GROUPS=Object.freeze(['matrix','overlay','raster-edit','nfd','negative-nfd','lifecycle','text-source','color']);
export const LIMITS=Object.freeze({caseMs:120000,groupMs:240000});
function list(value,allowed,label,defaults){
 const a=value===undefined?[...defaults]:typeof value==='string'?value.split(','):value;
 if(!Array.isArray(a)||!a.length||a.length>allowed.length||new Set(a).size!==a.length||a.some(x=>!allowed.includes(x)))throw Error('INVALID_'+label+'_SELECTOR');return [...a];
}
export function selection(input={}){
 const families=list(input.families,FAMILIES,'FAMILY',FAMILIES),products=list(input.products,PRODUCTS,'PRODUCT',PRODUCTS),styles=list(input.styles,STYLES,'STYLE',STYLES),groups=list(input.groups,GROUPS,'GROUP',['matrix']);
 const out=[];for(const group of groups){
  if(group==='matrix')for(const family of families)for(const product of products)out.push({id:group+'-'+family+'-'+product,group,families:[family],products:[product],styles,expectedIds:styles.map(style=>family+'-'+product+'-'+style)});
  else if(group==='text-source')for(const product of products)out.push({id:group+'-'+product,group,families:[],products:[product],styles,expectedIds:styles.map(style=>'text-source-'+product+'-'+style)});
  else if(group==='overlay')for(const product of products)for(const family of families.filter(x=>x==='svg'||x==='raster'))out.push({id:group+'-'+family+'-'+product,group,families:[family],products:[product],styles:['noi'],expectedIds:[family+'-'+product+'-new-negative-overlay',family+'-'+product+'-recaptured-overlay']});
  else out.push({id:group,group,families:[],products:['keychain'],styles:['noi'],expectedIds:group==='raster-edit'?['raster-erase-reconvert']:group==='nfd'?['nfd-original-source']:group==='color'?['color-emoji-converted']:[]});
 }return out;
}
export function envSelection(env){return selection({families:env.ARCH_ROOT_FAMILIES,products:env.ARCH_ROOT_PRODUCTS,styles:env.ARCH_ROOT_STYLES,groups:env.ARCH_ROOT_GROUPS});}
