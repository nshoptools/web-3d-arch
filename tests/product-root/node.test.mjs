import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createServer} from 'node:http';
import {M,client,operation,dispatcher,setLive,noOwned,transportLog,recordFramedNativeSource,forgetNativeSource} from '../product-app/harness.mjs';
import {createEngineTextService} from '../../src/core/engine-text-service.mjs';
import {previewPlanarSnapshot} from '../../src/core/source-preview.mjs';
import {sourceGeometry} from '../../src/integration/product-source-contexts.mjs';
import {applySourceFrame} from '../../src/core/source-frame.mjs';
import {createEditor} from '../../src/editing/index.mjs';
import {inspectCapturedProduct} from '../product-source/capture-oracle.mjs';
import {envSelection,LIMITS} from './selection.mjs';
import {runControllerCases} from './controller-cases.mjs';
const run=process.env.PROJECT_REVIEW_RUN,fixture=JSON.parse(fs.readFileSync(path.join(run,'inputs/source-fixture-v2.json'))),baseOut=path.join(run,'evidence/controller-node-'+(process.env.ARCH_ROOT_TAG??'exploratory'));let out=baseOut;fs.mkdirSync(out,{recursive:true});const groups=envSelection(process.env);
const server=createServer((req,res)=>{const h=req.url.slice(1);if(!fixture.actualAssets.some(r=>r.sha256===h)){res.writeHead(404);res.end();return;}res.end(fs.readFileSync(path.join(run,'inputs/library',h)));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,assetURLs=fixture.assetRecords.map(r=>({...r,url:origin+'/'+r.sha256}));
const versions={mechanicsAbi:M._arch_mech_abi_version(),mechanicsSemantics:M._arch_mech_semantics_version(),sourceAbi:M._arch_source_abi_version(),sourceSemantics:M._arch_source_semantics_version(),datumExtension:M._arch_mech_source_datum_extension_version()};
assert.equal(M._arch_product_datum_probe_version(),1);assert.equal(M._arch_source_frame_version(),1);
let live;const service=createEngineTextService(M,{catalog:fixture.catalog,assetURLs,origin,runtime:{engine:'node',version:process.versions.node}},{origin});
Object.assign(client,{worker:{testTransport:true},memory:M.HEAPU8.buffer,onRetirement:()=>()=>{},serviceCapabilities:{raster:true,sourceFrameVersion:M._arch_source_frame_version(),geometryVersions:versions},
 async rasterOperation(method,request,{generation}){assert.equal(M._arch_control_reset(generation),1);transportLog.push({method:'raster.'+method,generation});return dispatcher.dispatch(method,request,{generation});},
 async rasterRegistry(method,request){transportLog.push({registry:method});return dispatcher.dispatch(method,request);},
 async textOperation(request,{generation}){assert.equal(M._arch_control_reset(generation),1);transportLog.push({method:'text.'+request.op,generation});return service.run(request,{generation,signal:new AbortController().signal,onProgress:()=>{},isCurrent:t=>!!live&&t.projectId===live.projectId&&t.revision===live.state.revision});},
 async sourceFrame(original,request,{generation}){
  assert.ok(client.roots.has(original));assert.equal(M._arch_control_reset(generation),1);transportLog.push({method:'sourceFrame',generation});
  const id=applySourceFrame(M,original.id,original.generation,request,generation);let released=false;
  const metadata=JSON.parse(new TextDecoder().decode(M.HEAPU8.slice(M._arch_metadata_ptr(id),M._arch_metadata_ptr(id)+M._arch_metadata_len(id))));
  const lease={id,generation,epoch:client.epoch,metadata,bytes(){assert.ok(!released);return new Uint8Array(M.HEAPU8.buffer,M._arch_snapshot_ptr(id),M._arch_snapshot_len(id));},release(){if(!released){released=true;client.roots.delete(lease);forgetNativeSource(id);assert.equal(M._arch_snapshot_release(id),1);}}};client.roots.add(lease);recordFramedNativeSource(original,lease,request);
  const geometry=await sourceGeometry({bytes:new Uint8Array(lease.bytes()),metadata,key:'diagnostic',sourceHash:request.sourceHash,includeRings:true});
  const tiny=[];for(const region of geometry.regions)for(const ring of region.ringsNm)for(let i=0;i<ring.length;i++){
   const p=ring[i].map(BigInt),q=ring[(i+1)%ring.length].map(BigInt),prev=ring[(i+ring.length-1)%ring.length].map(BigInt),next=ring[(i+2)%ring.length].map(BigInt),dx=q[0]-p[0],dy=q[1]-p[1];
   if(dx>-2n&&dx<2n&&dy>-2n&&dy<2n)tiny.push({nativeKey:region.nativeKey,index:i,points:[prev,p,q,next].map(a=>a.map(String)),crossBefore:String((p[0]-prev[0])*dy-(p[1]-prev[1])*dx),crossAfter:String(dx*(next[1]-q[1])-dy*(next[0]-q[0]))});
  }
  if(tiny.length){fs.writeFileSync(path.join(out,'tiny-edge-'+generation+'.json'),JSON.stringify({request,tiny,geometry},null,2));fs.writeFileSync(path.join(out,'tiny-edge-'+generation+'.arch'),lease.bytes());}
  return lease;
 }
});
const kernel={operation,ensureRuntime:async()=>client,kernelLeases:new WeakMap(),async svgPreview(input,file,{resolution=64,includeRGBA=false,longEdgeMm=0}={}){
 const lease=await operation(input,(a,g)=>a.build({kind:'svg',source:new TextDecoder().decode(file.bytes),thicknessMm:.2,toleranceMm:.004,longEdgeMm},{generation:g}));
 try{const p=await previewPlanarSnapshot(lease.bytes(),{resolution,includeRGBA});return {version:'arch-app-adapters/1',ticket:structuredClone(input.ticket),kind:'svg',metadata:{...lease.metadata,previewDerivation:p.derivation,frame:p.frame},
  materials:p.colors.map((color,i)=>({id:'source-'+color.slice(1),label:'Color '+i,color,slot:null,role:'region',overridden:false,backgroundEligible:true,excluded:false})),preview:{width:p.width,height:p.height,pixelSizeMm:p.pixelSizeMm,png:p.png,mediaType:'image/png'},
  ...(includeRGBA?{raster:{width:p.width,height:p.height,data:p.rgba,pixelSizeMm:p.pixelSizeMm,preview:p.png,previewMediaType:'image/png'}}:{})};}finally{lease.release();}
}};
function createEditingClient(){let editor;return {async initialize(input){editor=await createEditor(input);return editor.token();},prepare:(c,control)=>editor.prepare(c,control),commit:(id,token)=>editor.commit(id,token),dispose(){editor=null;}};}
test.after(async()=>{service.dispose();noOwned();await new Promise(r=>{server.closeAllConnections();server.close(r);});});
for(const group of groups)test('fresh controller/probe/ASFR '+group.id,{timeout:LIMITS.groupMs},async t=>{
 out=path.join(baseOut,group.id);fs.mkdirSync(out,{recursive:true});
 const result=await runControllerCases({kernel,catalog:fixture.catalog,assetURLs,origin,createEditingClient,onContext:v=>{live=v;if(v)setLive(v);},
  ...group,signal:t.signal,recordCase:async row=>{fs.appendFileSync(path.join(out,'case-times.jsonl'),JSON.stringify(row)+'\n');console.log(JSON.stringify({group:group.id,...row}));},
  capture:async(id,r)=>{fs.writeFileSync(path.join(out,id+'.arch'),r.bytes);const oracle=inspectCapturedProduct(r.bytes,r.semantics,id);fs.writeFileSync(path.join(out,id+'.json'),JSON.stringify({...r,bytes:undefined,assets:undefined,assetHashes:[...r.assets.keys()],oracle},null,2));const dir=path.join(out,'assets');fs.mkdirSync(dir,{recursive:true});for(const[h,b]of r.assets)if(!fs.existsSync(path.join(dir,h)))fs.writeFileSync(path.join(dir,h),b);}
 });
 assert.equal(result.status,'pass');assert.deepEqual(result.rows.map(r=>r.id).sort(),[...group.expectedIds].sort(),'whole group required');noOwned();fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({...result,versions,trace:transportLog},null,2));
});
