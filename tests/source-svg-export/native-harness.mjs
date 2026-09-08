import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createServer} from 'node:http';
import {createRasterOperations,createRasterDispatcher} from '../../src/core/raster-operations.mjs';
import {createEngineTextService} from '../../src/core/engine-text-service.mjs';
import {createApplicationSources} from '../../src/integration/source-compositor.mjs';
import {previewPlanarSnapshot} from '../../src/core/source-preview.mjs';
const run=process.env.PROJECT_REVIEW_RUN,fixture=JSON.parse(fs.readFileSync(path.join(run,'inputs/source-fixture.json')));
const pins=JSON.parse(fs.readFileSync(path.join(run,'inputs/runtime-api-production.json'))).module;
const {createHash}=await import('node:crypto');const digest=b=>createHash('sha256').update(b).digest('hex');
for(const [i,x]of ['mjs','wasm'].entries()){const b=fs.readFileSync(path.join(run,'work/module/arch-kernel.'+x));if(digest(b)!==pins[i].sha256)throw Error('PIN');}
const factory=(await import(pathToFileURL(path.join(run,'work/module/arch-kernel.mjs')))).default;
export const M=await factory({print:()=>{},printErr:()=>{}});
let live,generation=0;export const driver={get:()=>live,set:v=>{live=v;}},roots=new Set(),log=[];
const dispatcher=createRasterDispatcher(createRasterOperations(M));
const server=createServer((req,res)=>{const h=req.url.slice('/library/'.length);if(!/^[a-f0-9]{64}$/.test(h)||!fixture.actualAssets.some(r=>r.sha256===h)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type','application/octet-stream');res.end(fs.readFileSync(path.join(run,'inputs/library',h)));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,assetURLs=fixture.assetRecords.map(r=>({...r,url:origin+'/library/'+r.sha256}));
const service=createEngineTextService(M,{catalog:fixture.catalog,assetURLs,origin,runtime:{engine:'node',version:process.versions.node}},{origin});
const err=()=>new TextDecoder().decode(M.HEAPU8.slice(M._arch_error_ptr(),M._arch_error_ptr()+M._arch_error_len()));
const reset=(g,method)=>{if(M._arch_control_reset(g)!==1)throw Error('RESET');log.push({method,generation:g});};
export const client={epoch:1,disposed:false,worker:{testOnly:true},memory:M.HEAPU8.buffer,serviceCapabilities:{raster:true,geometryVersions:{mechanicsAbi:2,mechanicsSemantics:3,sourceAbi:1,sourceSemantics:2,datumExtension:1}},onRetirement:()=>()=>{},
 async build(r,{generation:g}){if(r.kind!=='svg')throw Error('NO_PRODUCT_OR_MODEL');reset(g,'svg');const b=new TextEncoder().encode(r.source),h=M._arch_input_create(b.length);M.HEAPU8.set(b,M._arch_input_ptr(h));const id=M._arch_build_svg(h,r.thicknessMm??.2,r.longEdgeMm??0,r.toleranceMm??.001,g);if(!id)throw Object.assign(Error(err()),{code:err()});let ended=false;const metadata=JSON.parse(new TextDecoder().decode(M.HEAPU8.slice(M._arch_metadata_ptr(id),M._arch_metadata_ptr(id)+M._arch_metadata_len(id))));const l={id,metadata,epoch:client.epoch,generation:g,bytes(){if(ended)throw Error('RELEASED');return M.HEAPU8.subarray(M._arch_snapshot_ptr(id),M._arch_snapshot_ptr(id)+M._arch_snapshot_len(id));},release(){if(!ended){ended=true;roots.delete(l);if(M._arch_snapshot_release(id)!==1)throw Error('RELEASE');}}};roots.add(l);return l;},
 async textOperation(r,{generation:g}){reset(g,'text.'+r.op);return service.run(r,{generation:g,signal:new AbortController().signal,onProgress:()=>{},isCurrent:t=>t.projectId===live.projectId&&t.revision===live.state.revision});},
 async rasterOperation(method,r,{generation:g}){reset(g,'raster.'+method);return dispatcher.dispatch(method,r,{generation:g});},
 async rasterRegistry(method,r){return dispatcher.dispatch(method,r);}
};
export const kernel={kernelLeases:new WeakMap(),ensureRuntime:async()=>client,operation:async(c,fn)=>{if(c.signal.aborted)throw Error('CANCELLED');return fn(client,++generation);},
 async svgPreview(c,file,{resolution=64,includeRGBA=false,longEdgeMm=0}={}){const l=await kernel.operation(c,(client,generation)=>client.build({kind:'svg',source:new TextDecoder().decode(file.bytes),longEdgeMm,toleranceMm:.004},{generation}));try{const p=await previewPlanarSnapshot(l.bytes(),{resolution,includeRGBA});return {version:'arch-app-adapters/1',ticket:structuredClone(c.ticket),kind:'svg',metadata:{...l.metadata,previewDerivation:p.derivation,frame:p.frame},materials:p.colors.map((color,i)=>({id:'source-'+i,label:'Color '+i,color,slot:null,role:'region',overridden:false,backgroundEligible:true,excluded:false})),preview:{width:p.width,height:p.height,pixelSizeMm:p.pixelSizeMm,png:p.png,mediaType:'image/png'},...(includeRGBA?{raster:{width:p.width,height:p.height,data:p.rgba,pixelSizeMm:p.pixelSizeMm,preview:p.png,previewMediaType:'image/png'}}:{})};}finally{l.release();}}
};
export const sources=createApplicationSources({kernel,catalog:fixture.catalog,assetURLs,origin,context:driver.get});
export async function close(){await sources.reset();service.dispose();server.closeAllConnections();await new Promise(r=>server.close(r));if(roots.size)throw Error('LEAK');}
