import {canonicalJSON,sha256} from '../storage/common.mjs';
const need=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});},same=(a,b)=>canonicalJSON(a)===canonicalJSON(b),hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
/** Journal-owned raster edits do not rewrite an old geometry binding's revision.
 * This bounded chain identifies that stale binding until fresh segmentation can
 * prove individual canonical matches. It never authorizes a model build. */
export async function verifyProductEditLineage(source,bindings){
 const p=source.metadata.productEditLineage;
 need(p?.version==='arch-product-raster-edits/1'&&p.sourceId===source.id&&p.rawHash===source.raw.hash&&p.bindingHash===await sha256(canonicalJSON(bindings))&&p.fromRevision===bindings.sourceRevision,'PRODUCT_PRIOR_BINDINGS_STALE');
 need(Array.isArray(p.edits)&&p.edits.length>0&&p.edits.length<=128,'PRODUCT_EDIT_LINEAGE_LIMIT');
 let revision=p.fromRevision,rgba=p.fromRGBA,preview=p.fromPreview;
 need(hash(rgba)&&hash(preview)&&source.assetHashes.includes(rgba)&&source.assetHashes.includes(preview),'PRODUCT_EDIT_LINEAGE_ASSETS');
 for(const e of p.edits){
  need(Object.keys(e).sort().join(',')==='fromPreview,fromRGBA,fromRevision,gestureHash,toPreview,toRGBA,toRevision'&&e.fromRevision===revision&&e.toRevision===revision+1&&e.fromRGBA===rgba&&e.fromPreview===preview&&hash(e.toRGBA)&&hash(e.toPreview)&&hash(e.gestureHash),'PRODUCT_EDIT_LINEAGE_CHAIN');
  need(source.assetHashes.includes(e.toRGBA)&&source.assetHashes.includes(e.toPreview),'PRODUCT_EDIT_LINEAGE_ASSETS');revision=e.toRevision;rgba=e.toRGBA;preview=e.toPreview;
 }
 need(revision===source.revision&&rgba===source.raster?.rgba&&preview===source.raster?.preview,'PRODUCT_EDIT_LINEAGE_CURRENT');
 return p;
}
export async function recordProductRasterEdit({source,nextSource,gesture,assets}){
 const bindings=source.metadata.productBindings;if(bindings?.version!=='arch-product-bindings/1')return null;
 need(nextSource.id===source.id&&same(nextSource.raw,source.raw)&&nextSource.revision===source.revision+1,'PRODUCT_EDIT_LINEAGE_SOURCE');
 const old=bindings.sourceRevision===source.revision?{version:'arch-product-raster-edits/1',sourceId:source.id,rawHash:source.raw.hash,bindingHash:await sha256(canonicalJSON(bindings)),fromRevision:source.revision,fromRGBA:source.raster.rgba,fromPreview:source.raster.preview,edits:[]}:structuredClone(await verifyProductEditLineage(source,bindings));
 need(old.edits.length<128,'PRODUCT_EDIT_LINEAGE_LIMIT');
 const e={fromRevision:source.revision,toRevision:nextSource.revision,fromRGBA:source.raster.rgba,toRGBA:nextSource.raster.rgba,fromPreview:source.raster.preview,toPreview:nextSource.raster.preview,gestureHash:await sha256(canonicalJSON(gesture))};
 for(const h of [e.fromRGBA,e.toRGBA,e.fromPreview,e.toPreview]){const b=assets.get(h);need(b instanceof Uint8Array&&await sha256(b)===h,'PRODUCT_EDIT_LINEAGE_ASSETS');}
 old.edits.push(e);return old;
}
