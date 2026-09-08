import {createKernelAdapters} from '../../src/integration/kernel-adapters.mjs';
import {createApplicationSources} from '../../src/integration/source-compositor.mjs';
import {createEngineTextRenderer} from '../../src/core/engine-text-renderer.mjs';
import {sha256,canonicalJSON} from '../../src/storage/common.mjs';
import {scenario,text,need} from './scenario.mjs';
export async function runSourceSVG({catalog,assetURLs,runtime}){
 globalThis.sourceSVGPhase='startup';
 let live;const driver={get:()=>live,set:v=>{live=v;}};
 const kernel=createKernelAdapters({moduleURL:'/module/arch-kernel.mjs',workerURL:'/engine.mjs',selectRecipe:()=>{throw Error('NO_PRODUCT_MODEL_ALLOWED');},textConfig:{catalog,assetURLs,origin:location.origin,runtime},createTextRenderer:createEngineTextRenderer({catalog})});
 const sources=createApplicationSources({kernel,catalog,assetURLs,origin:location.origin,context:driver.get}),files=[],rows=[];let startClient=null,initialEpoch=null;
 try{
  for(const kind of ['svg','text','emoji','raster','color']){
   const e=await scenario({kernel,sources,driver});try{
    globalThis.sourceSVGPhase=kind+':ingest';await e.ingest(kind);const client=await kernel.ensureRuntime(e.control());if(!startClient){startClient=client;initialEpoch=client.epoch;}
    need(client===startClient&&client.epoch===initialEpoch,'one runtime');
    if(kind==='color'){let failed=false;try{await e.refresh();}catch(err){failed=err.code==='SOURCE_SVG_REGIONS_REQUIRED';}need(failed,'color original requires source conversion');globalThis.sourceSVGPhase=kind+':render';await e.convert();globalThis.sourceSVGPhase=kind+':segment';await e.convert();}
    globalThis.sourceSVGPhase=kind+':refresh';const r=await e.refresh();globalThis.sourceSVGPhase=kind+':export';const out=await e.export(),artifact=out.artifact??out;need(r.descriptor.status==='ready'&&e.live.model===null&&text(artifact.bytes).startsWith('<svg'),'actual source artifact');
    if(kind==='text')need(r.descriptor.provenance.text[0].text.originalText==='E\u0302\u0301','NFD proof');
    if(kind==='color')need(artifact.metadata.service.serialization.route==='accepted-raster-indexed-regions','color accepted graph');
    files.push({name:kind+'.svg',bytes:[...artifact.bytes]});rows.push({kind,outputSha256:artifact.metadata.sha256,bytes:artifact.bytes.length,route:artifact.metadata.service.serialization.route,dependencies:r.descriptor.dependencies,regionCount:r.descriptor.provenance.materialMapping.length,model:null,changes:out.changes??[]});
    globalThis.sourceSVGPhase=kind+':reopen';e.provider.reset();await e.refresh();const reopened=await e.export();need((reopened.artifact??reopened).metadata.sha256===artifact.metadata.sha256,'reopen bytes stable');
    if(kind==='raster'){
     globalThis.sourceSVGPhase='raster:forged-dimensions';
     await e.update(s=>{const src=s.content.app.source;src.metadata.rasterPreparation.summary.widthMm*=2;src.metadata.rasterPreparation.summary.heightMm*=2;src.raster.pixelSizeMm*=2;});
     const src=e.state.content.app.source,p=src.metadata.rasterPreparation,{approvalHash,...payload}=p;p.approvalHash=await sha256(canonicalJSON(payload));src.metadata.confirmationReceipt.approvalHash=p.approvalHash;src.metadata.productBindings.contexts[0].derivationHash=p.approvalHash;await e.sync();
     let rejected=false;try{await e.refresh();}catch(error){rejected=error.code==='SOURCE_SVG_DERIVED_CHANGED';}need(rejected&&e.provider.describe(e.live).status!=='ready','native raster dimensions reject forged metadata');rows.at(-1).dimensionForgeryRejected=true;
    }
    if(kind==='svg'){const id=e.state.content.app.source.metadata.productBindings.regions[0].materialId;await e.update(s=>{const m=s.content.app.materials.find(x=>x.id===id);m.color='#00ff00';m.overridden=true;});need(e.provider.describe(e.live).status!=='ready','stale materials');await e.refresh();const colored=await e.export();need(colored.status==='proposal'&&text(colored.artifact.bytes).includes('fill="#00ff00"'),'real current candidate');files.push({name:'recolor.svg',bytes:[...colored.artifact.bytes]});}
   }finally{globalThis.sourceSVGPhase=kind+':close';await e.close();}
  }
  return {status:'passed',rows,files,actualParentRPC:true,rootRuntimeInitializations:1,epoch:initialEpoch,modelBuilds:0,crossOriginIsolated,upstreamSourceAdoption:'actual product-source-contexts',fit:'unqualified'};
 }finally{await sources.reset();await kernel.reset();}
}
globalThis.runSourceSVG=runSourceSVG;
