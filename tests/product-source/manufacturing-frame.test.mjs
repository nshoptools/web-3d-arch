import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {createServer} from 'node:http';
import {M,client,operation,dispatcher,raster,svgState,rasterState,setLive,controlFor,noOwned,transportLog,manufacturingPreview} from '../product-app/harness.mjs';
import {createProductSourceContexts} from '../../src/integration/product-source-contexts.mjs';
import {createProductAdapters} from '../../src/integration/product-adapters.mjs';
import {createTextAdapters} from '../../src/integration/text-adapters.mjs';
import {createSourceCatalog} from '../../src/integration/source-catalog.mjs';
import {createEngineTextService} from '../../src/core/engine-text-service.mjs';
import {createSourceContext} from '../../src/app/source-approval.mjs';
import {readProductSemantics} from '../../src/core/product-operations.mjs';
import {previewPlanarSnapshot} from '../../src/core/source-preview.mjs';
import {encodeRasterPNG} from '../../src/core/png-encode.mjs';
import {manufacturingFrame,SourceFrameError} from '../../src/core/source-frame.mjs';
import {readSnapshot} from '../oracles/mesh-oracle.mjs';
import {sha256,canonicalJSON} from '../../src/storage/common.mjs';
import {validateState} from '../../src/app/documents.mjs';
import {partMesh,inside} from '../../src/kernel/source-assembly/tests/oracles/spatial-oracle.mjs';

// Codex release round 3, R3-C02: an SVG or raster artwork came out mirrored top
// to bottom in the model, the exports and the step-1 preview. The kernel parses
// an SVG (and builds a raster context) X right/Y down, the frame of the viewport
// and the pixel grid, while everything downstream — the text wrapper, the
// preview bounds, the assembly, the section export — is the manufacturing frame,
// X right/Y up. The product-context boundary now places such a context with the
// native source frame (one reflection, y' = height - y) before the assembly
// consumes it, and the SVG import preview samples the parsed viewport with its
// axis named. These cases read the actual assembled mesh and the actual preview
// pixels on this Module through the real bridge and adapters.
const versions={mechanicsAbi:M._arch_mech_abi_version(),mechanicsSemantics:M._arch_mech_semantics_version(),sourceAbi:M._arch_source_abi_version(),sourceSemantics:M._arch_source_semantics_version(),datumExtension:M._arch_mech_source_datum_extension_version()};
Object.assign(client,{worker:{testTransport:true},memory:M.HEAPU8.buffer,onRetirement:()=>()=>{},serviceCapabilities:{raster:true,sourceFrameVersion:M._arch_source_frame_version(),geometryVersions:versions},
 async rasterOperation(method,request,{generation}){assert.equal(M._arch_control_reset(generation),1);transportLog.push({method:'raster.'+method,generation});return dispatcher.dispatch(method,request,{generation});},
 async rasterRegistry(method,request){transportLog.push({registry:method});return dispatcher.dispatch(method,request);}});
let live;const set=v=>{live={sessionKey:'manufacturing-frame:1',...v};setLive(live);};
const kernel={operation,ensureRuntime:async()=>client,kernelLeases:new WeakMap()};
// The real text producer on this Module, for the one case that puts text beside the artwork.
const run=process.env.PROJECT_REVIEW_RUN,fixture=JSON.parse(fs.readFileSync(path.join(run,'inputs/source-fixture.json')));
const server=createServer((req,res)=>{const h=req.url.slice(1);if(!fixture.actualAssets.some(r=>r.sha256===h)){res.writeHead(404);res.end();return;}res.end(fs.readFileSync(path.join(run,'inputs/library',h)));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port,assetURLs=fixture.assetRecords.map(r=>({...r,url:origin+'/'+r.sha256}));
const catalog=createSourceCatalog({catalog:fixture.catalog,assetURLs,origin});
const service=createEngineTextService(M,{catalog:fixture.catalog,assetURLs,origin,runtime:{engine:'node',version:process.versions.node}},{origin});
client.textOperation=(request,{generation})=>{assert.equal(M._arch_control_reset(generation),1);return service.run(request,{generation,signal:new AbortController().signal,onProgress:()=>{},isCurrent:t=>t.revision===live.state.revision});};
const text=createTextAdapters({catalog,context:()=>live,invoke:(request,c)=>operation(c,(_,generation)=>{assert.equal(M._arch_control_reset(generation),1);return service.run(request,{generation,signal:c.signal,onProgress:()=>{},isCurrent:t=>t.revision===live.state.revision});})});
const bridge=createProductSourceContexts({kernel,sources:{source:text,text,raster:raster.source},context:()=>live});
const product=createProductAdapters({operation,kernelLeases:kernel.kernelLeases,context:()=>live,withPreparedSource:bridge.withPreparedSource});
test.after(async()=>{await product.reset();bridge.reset();text.reset();service.dispose();await raster.reset();await new Promise(r=>{server.closeAllConnections();server.close(r);});noOwned();});
/** Adoption through the real bridge, so the bindings carry the bridge's own region identity. */
const adopt=({state,source,assets})=>{
 set({state,userId:'user-a',projectId:'project-persistent',assetsMap:assets});
 return bridge.prepareAdoption({...controlFor(state),state,source,assets,purpose:'source',operation:'import',sourceContext:source.metadata.sourceContext,materials:[],materialDefaults:[]});
};

// The harness artwork: 40×30 mm, the left (red) half carries a 4×4 hole whose
// centre is 8 mm below the top edge, i.e. in the upper half of the picture.
const HOLE={x:7,yFromTop:8};
function artworkMeshes(model,sourceKey){
 const snapshot=readSnapshot(model.bytes()),root=kernel.kernelLeases.get(model).root,sem=readProductSemantics(root.metadata.semanticBytes);
 const key=model.product.semantics.provenance.regionSources.find(r=>r.sourceKey===sourceKey).stableSourceKey;
 const identity=model.product.semantics.provenance.identities.find(r=>r.kind==='region'&&r.key===key).id;
 const slabs=new Set(sem.lineage.filter(l=>l.sourceId===identity).map(l=>l.slabId));
 const parts=sem.parts.filter(p=>p.role===1&&slabs.has(p.sourceId));assert.ok(parts.length>0,'artwork parts for '+sourceKey);
 const meshes=snapshot.parts.map(p=>partMesh(snapshot,p));
 return {meshes:parts.map(p=>meshes[p.meshPart]),transform:sem.sourceTransform};
}
/** The hole must be found where the picture shows it (upper half, Y up) and the
 * material must be present at the mirrored place (lower half). */
function assertUpright({meshes,transform:[scale,,,,tx,ty]},{widthMm,heightMm},hole){
 const x=hole.x*scale+tx,upper=(heightMm-hole.yFromTop)*scale+ty,lower=hole.yFromTop*scale+ty;
 assert.ok(upper>0&&lower<0,'the hole row is above the centre in the manufacturing frame, its mirror below: '+JSON.stringify({upper,lower,widthMm,heightMm}));
 for(const mesh of meshes){
  const zs=mesh.vertices.map(v=>v[2]),z=(Math.min(...zs)+Math.max(...zs))/2;
  assert.equal(inside(mesh,[x,upper,z]),false,'the hole is in the upper half, as drawn');
  assert.equal(inside(mesh,[x,lower,z]),true,'the mirrored place is solid');
 }
}

test('manufacturingFrame: one reflection, translation fixed in whole nanometres',()=>{
 const f=manufacturingFrame({sourceHash:'ab'.repeat(32),heightMm:10.0000004});
 assert.deepEqual([...f.linearMatrix],[1,0,0,-1]);assert.deepEqual([...f.translationNm],['0','10000000']);
 assert.deepEqual([...f.request.matrix],[1,0,0,-1,0,10]);assert.equal(f.request.version,'arch-source-frame/1');
 for(const heightMm of [0,-1,NaN,10001])assert.throws(()=>manufacturingFrame({sourceHash:'ab'.repeat(32),heightMm}),{code:'SOURCE_FRAME_DIMENSIONS'});
 assert.throws(()=>manufacturingFrame({sourceHash:'nope',heightMm:1}),SourceFrameError);
});

test('SVG import preview: the parsed SVG is Y down; named as such, the preview shows it as drawn',async()=>{
 const state=(await svgState()).state;set({state,userId:'user-a',projectId:'project-persistent'});
 // Blue mark in the top-right corner of the picture, orange in the bottom-left.
 const marks='<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="0 0 20 10"><path fill="#30353b" d="M0 0H20V10H0Z"/><path fill="#0099cc" d="M16 1H19V4H16Z"/><path fill="#ee7733" d="M1 6H6V9H1Z"/></svg>';
 const lease=await operation(controlFor(state),(a,g)=>a.build({kind:'svg',source:marks,thicknessMm:.2,toleranceMm:.004},{generation:g}));
 try{
  const rows=(p,[r,g,b])=>{const ys=[];for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++){const o=(y*p.width+x)*4;if(p.rgba[o]===r&&p.rgba[o+1]===g&&p.rgba[o+2]===b){ys.push(y);break;}}return [Math.min(...ys),Math.max(...ys)];};
  const raw=await previewPlanarSnapshot(lease.bytes(),{resolution:100,includeRGBA:true});
  assert.equal(raw.frame.sourceAxis,'x-right-y-up');
  assert.ok(rows(raw,[0,0x99,0xcc])[0]>raw.height/2,'read as Y up, the viewport draws the blue mark in the lower rows (mirrored)');
  const p=await manufacturingPreview(lease,{resolution:100,includeRGBA:true});
  const {topMm,...frame}=p.frame;assert.deepEqual(frame,{kind:'manufacturing-bounds',leftMm:raw.frame.leftMm,widthMm:raw.frame.widthMm,heightMm:raw.frame.heightMm,yDirection:'down',sourceAxis:'x-right-y-down'});
  assert.ok(Math.abs(topMm-10)<1e-6,'the top row sits at the viewport height above the manufacturing origin: '+topMm);
  const blue=rows(p,[0,0x99,0xcc]),orange=rows(p,[0xee,0x77,0x33]);
  assert.ok(blue[1]<p.height/2&&orange[0]>p.height/2,'blue top, orange bottom, as drawn: '+JSON.stringify({blue,orange,height:p.height}));
  assert.equal(p.width,raw.width);assert.equal(p.height,raw.height);
  // Same picture, row for row, as the Y-up sampling of the same contours turned upside down.
  for(let y=0;y<p.height;y++)assert.deepEqual([...p.rgba.subarray(y*p.width*4,(y+1)*p.width*4)],[...raw.rgba.subarray((p.height-1-y)*p.width*4,(p.height-y)*p.width*4)],'row '+y);
  await assert.rejects(previewPlanarSnapshot(lease.bytes(),{resolution:100,sourceAxis:'x-right-y-down'}),{code:'PREVIEW_SOURCE_HEIGHT'});
  await assert.rejects(previewPlanarSnapshot(lease.bytes(),{resolution:100,sourceAxis:'sideways'}),{code:'PREVIEW_SOURCE_AXIS'});
 }finally{lease.release();}
 noOwned();
});

test('SVG artwork is assembled upright: the hole drawn near the top is above the centre of the model',async()=>{
 const f=await svgState('keychain','noi',undefined,{adopt});set({state:f.state,userId:'user-a',projectId:'project-persistent',assetsMap:f.assets});
 const start=transportLog.length;
 const model=await product.engine.build({...controlFor(f.state),...f});
 try{
  assert.ok(transportLog.slice(start).some(e=>e.method==='sourceFrame'),'the art context went through the native source frame');
  assertUpright(artworkMeshes(model,'left'),{widthMm:40,heightMm:30},HOLE);
 }finally{model.release();}
 // Region identity is unchanged by the placement: the adopted bindings still match.
 await bridge.withValidatedRegions({control:controlFor(f.state),...f},r=>{
  const art=r.contexts.find(c=>c.key==='art');assert.equal(art.metadata.sourceFrame,undefined,'canonical regions stay in the source frame');
  for(const region of art.regions)assert.ok(f.state.content.app.source.metadata.productBindings.regions.some(b=>b.nativeKey===region.nativeKey&&b.geometryHash===region.geometryHash),region.nativeKey);
 });
 noOwned();
});

test('raster artwork is assembled upright: the pixel hole near the top row is above the centre of the model',async()=>{
 const f=await rasterState('keychain','noi',{adopt});set({state:f.state,userId:'user-a',projectId:'project-persistent',assetsMap:f.assets});
 const frame=await bridge.withValidatedRegions({control:controlFor(f.state),...f},r=>structuredClone(r.contexts[0].metadata.rasterFrame));
 assert.equal(frame.axis,'x-right-y-down');
 const start=transportLog.length;
 const model=await product.engine.build({...controlFor(f.state),...f});
 try{
  const log=transportLog.slice(start);
  assert.ok(log.some(e=>e.method==='raster.buildSourceContext')&&log.some(e=>e.method==='sourceFrame'),'the registered raster context went through the native source frame');
  // rasterState: 64×48 px, hole x 8..13, y 9..15 (pixel rows count down from the top).
  assertUpright(artworkMeshes(model,'raster-region:0'),frame,{x:11*frame.mmPerPixelX,yFromTop:12.5*frame.mmPerPixelY});
 }finally{model.release();}
 noOwned();
});

test('text beside the artwork keeps its own absolute place while the artwork is placed upright',async()=>{
 // The two frames meet here: the artwork context is reflected into the manufacturing frame,
 // the text wrapper is already Y up and is only translated. The text must not move with the
 // reflection, and the artwork must still be upright.
 const f=await svgState('keychain','noi',undefined,{adopt:async({state,source,assets})=>{
  Object.assign(state.content.app.text,{text:'I',placement:'beside',xMm:'-30',yMm:'-24',sizeMm:'4',sizeDisplay:'4',baseEnabled:true,baseRadiusMm:'0',baseThicknessLayers:'2',heightLayers:'3'});
  set({state,userId:'user-a',projectId:'project-persistent',assetsMap:assets});
  const c={...controlFor(state),sourceContext:source.metadata.sourceContext};
  const capture=await bridge.captureArtifacts(c);
  for(const a of capture.assets){const h=await sha256(a.bytes);assets.set(h,a.bytes);if(!source.assetHashes.includes(h))source.assetHashes.push(h);}
  source.metadata.productArtifacts={version:'arch-product-artifacts/1',overlay:capture.overlay,sourceTextStateHash:await sha256(canonicalJSON(state.content.app.text))};
  return bridge.prepareAdoption({...c,state,source,assets,purpose:'source',operation:'import',materials:[],materialDefaults:[]});
 }});
 set({state:f.state,userId:'user-a',projectId:'project-persistent',assetsMap:f.assets});
 const model=await product.engine.build({...controlFor(f.state),...f});
 try{
  assert.ok(model.blocks.some(b=>b.kind==='text'||b.role==='text'),'the text block is in the model: '+JSON.stringify(model.blocks.map(b=>b.kind??b.role)));
  assertUpright(artworkMeshes(model,'left'),{widthMm:40,heightMm:30},HOLE);
  // The text was asked for at x −30, y −24 mm and stays there: below and left of the artwork,
  // which the assembly centres on the origin.
  const snapshot=readSnapshot(model.bytes()),sem=readProductSemantics(kernel.kernelLeases.get(model).root.metadata.semanticBytes);
  // ArchMechRole: 0 body, 1 artwork, …, 7 text, 8 text base.
 const textParts=sem.parts.filter(p=>p.role===7||p.role===8);
  assert.ok(textParts.length>0,'text parts in the semantics table');
  const ys=textParts.flatMap(p=>partMesh(snapshot,p.meshPart).vertices.map(v=>v[1]));
  const xs=textParts.flatMap(p=>partMesh(snapshot,p.meshPart).vertices.map(v=>v[0]));
  assert.ok(Math.max(...ys)<0&&Math.max(...xs)<0,'beside text stays at its own negative coordinates: '+JSON.stringify({x:[Math.min(...xs),Math.max(...xs)],y:[Math.min(...ys),Math.max(...ys)]}));
 }finally{model.release();}
 noOwned();
});

// The one artwork that must NOT be placed: a raster this application rendered from an SVG before
// the frame was settled. That renderer sampled a Y-down viewport as if it were Y up, so its saved
// pixels are mirrored, and the build path did not reflect, which cancelled out. Reflecting them now
// would turn a correct saved project upside down (Codex R3B-C01).
test('a raster the old renderer derived from an SVG keeps the model it always built',async()=>{
 const marks='<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="0 0 20 10"><path fill="#30353b" d="M0 0H20V10H0Z"/><path fill="#0099cc" d="M16 1H19V4H16Z"/><path fill="#ee7733" d="M1 6H6V9H1Z"/></svg>';
 const lease=await operation(controlFor({revision:0,content:{app:{}}}),(a,g)=>a.build({kind:'svg',source:marks,thicknessMm:.2,toleranceMm:.004},{generation:g}));
 let legacy,legacyFrame;
 try{
  // Exactly what the old renderer produced: no source axis named, so Y-up sampling.
  const p=await previewPlanarSnapshot(lease.bytes(),{resolution:64,includeRGBA:true});
  legacy={data:p.rgba,width:p.width,height:p.height};
  const {sourceAxis,...withoutAxis}=p.frame;legacyFrame=withoutAxis;
  assert.equal(sourceAxis,'x-right-y-up');
 }finally{lease.release();}
 const blueTop=(meshes,transform)=>{
  const [scale,,,,,ty]=transform;
  // The drawing has blue at the top; the saved pixels have it at the bottom.
  const ys=meshes.map(m=>m.vertices.reduce((n,v)=>Math.max(n,v[1]),-Infinity));
  return {ys,scale,ty};
 };
 // The second arm feeds the same mirrored pixels with a frame that claims the new convention. It is
 // not an artefact the application can produce; it is here to show the decision is read from the
 // record rather than guessed from the pixels.
 for(const [name,frame,expectBlueAbove] of [['legacy render, frame without an axis',legacyFrame,true],
   ['a render that names its axis',{...legacyFrame,sourceAxis:'x-right-y-down'},false]]){
  const f=await rasterState('keychain','noi',{pixels:legacy,adopt:async({state,source,assets})=>{
   // The conversion records the preview frame on the source; that record is the only thing
   // that says which renderer made these pixels.
   source.metadata.preview={sha256:await sha256(new Uint8Array(legacy.data)),renderer:{id:'arch-engine-planar-preview',version:'scanline-2x2-v1'},frame};
   set({state,userId:'user-a',projectId:'project-persistent',assetsMap:assets});
   return bridge.prepareAdoption({...controlFor(state),state,source,assets,purpose:'source',operation:'import',sourceContext:source.metadata.sourceContext,materials:[],materialDefaults:[]});
  }});
  set({state:f.state,userId:'user-a',projectId:'project-persistent',assetsMap:f.assets});
  const model=await product.engine.build({...controlFor(f.state),...f});
  try{
   const snapshot=readSnapshot(model.bytes()),sem=readProductSemantics(kernel.kernelLeases.get(model).root.metadata.semanticBytes);
   const meshes=snapshot.parts.map(part=>partMesh(snapshot,part));
   const centre=index=>{const v=meshes[index].vertices;return v.reduce((n,p)=>n+p[1],0)/v.length;};
   const colour=index=>(snapshot.parts[index].color>>>8).toString(16).padStart(6,'0');
   const art=sem.parts.filter(p=>p.role===1).map(p=>({colour:colour(p.meshPart),y:centre(p.meshPart)}));
   const blue=art.find(a=>a.colour==='0099cc'),orange=art.find(a=>a.colour==='ee7733');
   assert.ok(blue&&orange,name+': both marks are in the model '+JSON.stringify(art));
   assert.equal(blue.y>orange.y,expectBlueAbove,name+': '+JSON.stringify({blue:blue.y,orange:orange.y}));
  }finally{model.release();}
  noOwned();
 }
});
