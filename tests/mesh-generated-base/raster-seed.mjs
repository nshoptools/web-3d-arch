import {createApplicationSources} from '../../src/integration/source-compositor.mjs';
import {createProductSourceContexts} from '../../src/integration/product-source-contexts.mjs';
import {createProductAdapters} from '../../src/integration/product-adapters.mjs';
import {newDocument,validateState} from '../../src/app/documents.mjs';
import {sha256,canonicalJSON} from '../../src/storage/common.mjs';
import {domainStateFingerprint} from '../../src/storage/history.mjs';
import {encodeRasterPNG} from '../../src/core/png-encode.mjs';
import assert from 'node:assert/strict';
/** Prepare a saved, consented source fixture through REAL raster ingest/accept,
 * canonical adoption initializer and native product build. This is not a claim
 * that the current controller's missing accept consumer is integrated. */
export async function rasterSeed({kernel,catalog,assetURLs,origin,onContext,capture,beforeDispose}){
 const state=(await newDocument('keychain')).document.state,bytesMap=new Map();
 let live={state,userId:'TEST-product-root-user',projectId:'TEST-raster-base-project',sessionKey:'TEST-raster-base-1',headHash:await domainStateFingerprint(state),model:null,assetsMap:bytesMap};
 const context=()=>{onContext(live);return live;};
 const control={version:'arch-app-adapters/1',ticket:{id:'TEST-raster-seed',userId:live.userId,projectId:live.projectId,revision:state.revision,generation:1},signal:new AbortController().signal,onProgress:()=>{}};
 const sources=createApplicationSources({kernel,catalog,assetURLs,origin,context});
 const contexts=createProductSourceContexts({kernel,sources,context});
 const product=createProductAdapters({operation:kernel.operation,kernelLeases:kernel.kernelLeases,context,withPreparedSource:contexts.withPreparedSource});
 const sourceContext={version:'arch-source-context/1',operation:'import',id:'TEST-raster-original-source',revision:0,predecessor:null};
 const width=16,height=12,data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){if(x>=2&&x<=3&&y>=3&&y<=4)continue;data.set(x<8?[224,68,68,255]:[51,136,238,255],4*(y*width+x));}
 const png=await encodeRasterPNG({width,height,data}),rawHash=await sha256(png);bytesMap.set(rawHash,png);
 context();let model;
 try{
  const reply=await sources.raster.ingest({...control,state,purpose:'source',sourceContext,file:{name:'TEST-source.png',mediaType:'image/png',bytes:png}});
  assert.equal(reply.status,'proposal');const result=reply.result;
  for(const a of result.assets??[])bytesMap.set(await sha256(a.bytes),a.bytes.slice());
  const raster=result.raster;
  const rgba=new Uint8Array(raster.data),rgbaHash=await sha256(rgba),previewHash=await sha256(raster.preview);
  bytesMap.set(rgbaHash,rgba);bytesMap.set(previewHash,raster.preview.slice());
  const source={id:sourceContext.id,revision:0,kind:'raster',name:'TEST-source.png',mediaType:'image/png',raw:{hash:rawHash,byteLength:png.length},assetHashes:[...bytesMap.keys()],
   metadata:{...structuredClone(result.metadata),sourceContext},raster:{width,height,pixelSizeMm:raster.pixelSizeMm,rgba:rgbaHash,preview:previewHash,originalPreview:previewHash}};
  const acceptance=await sources.raster.acceptProposal({...control,state,source,sourceContext,assets:bytesMap,confirmation:reply.confirmation??result.confirmation,acceptedAtRevision:state.revision+1});
  source.metadata.confirmationReceipt=acceptance.receipt;
  const adoption=await contexts.prepareAdoption({...control,purpose:'source',state,source,sourceContext,assets:bytesMap,materials:result.materials,materialDefaults:result.materials,operation:'import'});
  const next=structuredClone(state);next.sourceKind='raster';next.revision++;next.content.app.source={...source,metadata:{...source.metadata,productBindings:adoption.productBindings}};
  next.content.app.materials=adoption.materials;next.content.app.materialDefaults=adoption.materialDefaults;
  live={...live,state:validateState(next),headHash:await domainStateFingerprint(next)};context();
  const c={...control,ticket:{...control.ticket,id:'TEST-raster-base-build',revision:next.revision,generation:2}};
  model=await product.engine.build({...c,state:next,assets:bytesMap});live={...live,model};context();
  await capture('raster',{bytes:new Uint8Array(model.bytes()),semantics:structuredClone(model.product.semantics),state:next,assets:new Map(bytesMap)});
  await beforeDispose(c);
 }finally{model?.release();await product.reset();await contexts.reset();await sources.reset();}
}
