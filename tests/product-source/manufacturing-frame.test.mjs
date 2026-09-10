import test from 'node:test';import assert from 'node:assert/strict';
import {M,client,operation,dispatcher,raster,svgState,rasterState,setLive,controlFor,noOwned,transportLog,manufacturingPreview} from '../product-app/harness.mjs';
import {createProductSourceContexts} from '../../src/integration/product-source-contexts.mjs';
import {createProductAdapters} from '../../src/integration/product-adapters.mjs';
import {readProductSemantics} from '../../src/core/product-operations.mjs';
import {previewPlanarSnapshot} from '../../src/core/source-preview.mjs';
import {manufacturingFrame,SourceFrameError} from '../../src/core/source-frame.mjs';
import {readSnapshot} from '../oracles/mesh-oracle.mjs';
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
// No text in these projects: the text service is a stub that must not be reached.
const bridge=createProductSourceContexts({kernel,sources:{source:{ingest(){throw new Error('TEXT_SERVICE_UNUSED');}},raster:raster.source},context:()=>live});
const product=createProductAdapters({operation,kernelLeases:kernel.kernelLeases,context:()=>live,withPreparedSource:bridge.withPreparedSource});
test.after(async()=>{await product.reset();bridge.reset();await raster.reset();noOwned();});
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
