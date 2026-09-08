import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createServer} from 'node:http';
import {M,client,operation,dispatcher,setLive,noOwned,transportLog} from '../product-app/harness.mjs';
import {createApplicationSources} from '../../src/integration/source-compositor.mjs';
import {createEngineTextService} from '../../src/core/engine-text-service.mjs';
import {previewPlanarSnapshot} from '../../src/core/source-preview.mjs';
import {readSnapshot,inspectMesh} from '../oracles/mesh-oracle.mjs';
import {inspectCapturedProduct} from './capture-oracle.mjs';
import {runBridgeCases} from './bridge-cases.mjs';
const run=process.env.PROJECT_REVIEW_RUN,fixture=JSON.parse(fs.readFileSync(path.join(run,'inputs/source-fixture.json')));
const server=createServer((req,res)=>{const h=req.url.slice('/library/'.length);if(!/^[a-f0-9]{64}$/.test(h)||!fixture.actualAssets.some(r=>r.sha256===h)){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type','application/octet-stream');res.end(fs.readFileSync(path.join(run,'inputs/library',h)));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
test.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
const assetURLs=fixture.assetRecords.map(r=>({...r,url:origin+'/library/'+r.sha256})),versions={
 mechanicsAbi:M._arch_mech_abi_version(),mechanicsSemantics:M._arch_mech_semantics_version(),sourceAbi:M._arch_source_abi_version(),sourceSemantics:M._arch_source_semantics_version(),datumExtension:M._arch_mech_source_datum_extension_version()
};
assert.deepEqual(versions,{mechanicsAbi:2,mechanicsSemantics:3,sourceAbi:1,sourceSemantics:2,datumExtension:1});
let live;const driver={get:()=>live,set(v){live={sessionKey:'test-session-1',...v};setLive(v);}};
Object.assign(client,{worker:{testTransport:true},memory:M.HEAPU8.buffer,serviceCapabilities:{raster:true,geometryVersions:versions},onRetirement:()=>()=>{},
 async rasterOperation(method,request,{generation}){
  assert.equal(M._arch_control_reset(generation),1);transportLog.push({method:'raster.'+method,generation});
  return dispatcher.dispatch(method,request,{generation});
 },async rasterRegistry(method,request){transportLog.push({registry:method});return dispatcher.dispatch(method,request);}
});
const textService=createEngineTextService(M,{catalog:fixture.catalog,assetURLs,origin,runtime:{engine:'node',version:process.versions.node}},{origin});
client.textOperation=async(request,{generation})=>{
 assert.equal(M._arch_control_reset(generation),1);transportLog.push({method:'text.'+request.op,generation});
 return textService.run(request,{generation,signal:new AbortController().signal,onProgress:()=>{},isCurrent:t=>t.projectId===live.projectId&&t.revision===live.state.revision});
};
const kernel={operation,ensureRuntime:async()=>client,kernelLeases:new WeakMap(),
 async svgPreview(input,file,{resolution=64,includeRGBA=false,longEdgeMm=0}={}){
  const lease=await operation(input,(a,g)=>a.build({kind:'svg',source:new TextDecoder().decode(file.bytes),thicknessMm:.2,toleranceMm:.004,longEdgeMm},{generation:g}));
  try{const p=await previewPlanarSnapshot(lease.bytes(),{resolution,includeRGBA});
   return {version:'arch-app-adapters/1',ticket:structuredClone(input.ticket),kind:'svg',metadata:{...lease.metadata,previewDerivation:p.derivation,frame:p.frame},
    materials:p.colors.map((color,i)=>({id:'source-'+color.slice(1),label:'Color '+i,color,slot:null,role:'region',overridden:false,backgroundEligible:true,excluded:false})),
    preview:{width:p.width,height:p.height,pixelSizeMm:p.pixelSizeMm,png:p.png,mediaType:'image/png'},
    ...(includeRGBA?{raster:{width:p.width,height:p.height,data:p.rgba,pixelSizeMm:p.pixelSizeMm,preview:p.png,previewMediaType:'image/png'}}:{})};
  }finally{lease.release();}
 }
};
const sources=createApplicationSources({kernel,catalog:fixture.catalog,assetURLs,origin,context:driver.get});
test('Real source compositor and product bridge: root Node WASM SVG/raster/text/emoji and actual overlays',{timeout:600000},async()=>{
 const tag=process.env.ARCH_BRIDGE_TAG??'exploratory';assert.match(tag,/^[a-z0-9-]{1,40}$/);const out=path.join(run,'evidence/source-node-'+tag);fs.mkdirSync(out,{recursive:true});
 const result=await runBridgeCases({kernel,sources,driver,matrix:process.env.ARCH_BRIDGE_MATRIX==='1',discoverNativeBlocks:process.env.ARCH_BRIDGE_DISCOVER==='1',families:process.env.ARCH_BRIDGE_FAMILIES?.split(','),capture:async(id,{bytes,semantics,bindings,row,failure,state,assets})=>{
  const dir=path.join(out,'assets');fs.mkdirSync(dir,{recursive:true});
  for(const [h,b]of assets??[])if(!fs.existsSync(path.join(dir,h)))fs.writeFileSync(path.join(dir,h),b);
  if(failure){fs.writeFileSync(path.join(out,id+'-failure.json'),JSON.stringify({failure,state},null,2));const dir=path.join(out,id+'-assets');fs.mkdirSync(dir,{recursive:true});
   for(const [h,b]of assets)fs.writeFileSync(path.join(dir,h),b);return;}
  const oracles=inspectCapturedProduct(bytes,semantics,id);
  fs.writeFileSync(path.join(out,id+'.arch'),bytes);fs.writeFileSync(path.join(out,id+'.json'),JSON.stringify({row,semantics,bindings,oracles,state,assetHashes:[...(assets?.keys()??[])]},null,2));
 }});
 if(process.env.ARCH_BRIDGE_MATRIX==='1'&&!process.env.ARCH_BRIDGE_FAMILIES){
  const expected=JSON.parse(fs.readFileSync(path.join(import.meta.dirname,'native-refusals.json'))).cases;
  const observed=result.negatives.filter(r=>r.code==='PRODUCT_NATIVE_BLOCKED').map(r=>({id:r.id,code:r.code,diagnostics:r.details.diagnostics.filter(d=>d.code<100),sourceVerdict:r.details.sourceVerdict,mechanicsVerdict:r.details.mechanicsVerdict}));
  assert.deepEqual(observed,expected,'Native rejection changed: re-investigate; do not count as successful geometry');
  assert.equal(result.trace.length,60);assert.equal(result.qualification,'partial-native-blockers');
 }
 noOwned();const gens=transportLog.filter(x=>x.generation).map(x=>x.generation);assert.ok(gens.every((g,i)=>!i||g>gens[i-1]));
 fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({...result,versions,transportLog,node:process.versions.node,liveBilling:false,independentReview:false},null,2));
 await sources.reset();textService.dispose();console.log(JSON.stringify({models:result.trace.length,negatives:result.negatives.length,versions}));
});
