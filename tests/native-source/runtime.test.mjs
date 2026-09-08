import test from'node:test';import assert from'node:assert/strict';import{readFile,writeFile,mkdir}from'node:fs/promises';import path from'node:path';import{pathToFileURL,fileURLToPath}from'node:url';import{createHash}from'node:crypto';
import{extrusionOracle,frameOracle,geometryBytes,readSnapshot}from'./oracles.mjs';
import{encodeSourceFrame,applySourceFrame as nativeFrame}from'../../src/core/source-frame.mjs';
import{createProductSourceOperations}from'../../src/core/product-source-operations.mjs';
import{createProductOperations}from'../../src/core/product-operations.mjs';
import{rasterFixture,makeRasterRequest}from'../product-runtime/fixtures.mjs';
import{encodeOptions}from'../../src/core/raster-schema.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),run=process.env.PROJECT_REVIEW_RUN;
if(!run||!process.env.ARCH_KERNEL_MODULE)throw Error('Own PROJECT_REVIEW_RUN and ARCH_KERNEL_MODULE required');
const fixtures=path.join(root,'tests/native-source/fixtures'),out=path.join(run,'evidence/node-source');await mkdir(out,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex'),golden=JSON.parse(await readFile(path.join(fixtures,'clipper-viewport.json'),'utf8'));
const M=await(await import(pathToFileURL(process.env.ARCH_KERNEL_MODULE))).default({print:()=>{},printErr:()=>{}});let g=0;
const ownedSnapshots=new Set();
function buildSVG(...a){const id=M._arch_build_svg(...a);if(id)ownedSnapshots.add(id);return id;}
function applySourceFrame(...a){const id=nativeFrame(...a);ownedSnapshots.add(id);return id;}
test.afterEach(()=>{for(const id of ownedSnapshots)M._arch_snapshot_release(id);ownedSnapshots.clear();});

const reset=()=>{assert.equal(M._arch_control_reset(++g),1);return g;};
const input=b=>{const h=M._arch_input_create(b.length);assert.ok(h);M.HEAPU8.set(b,M._arch_input_ptr(h));return h;};
const err=()=>new TextDecoder().decode(new Uint8Array(M.HEAPU8.subarray(M._arch_error_ptr(),M._arch_error_ptr()+M._arch_error_len())));
const bytes=id=>Buffer.from(M.HEAPU8.subarray(M._arch_snapshot_ptr(id),M._arch_snapshot_ptr(id)+M._arch_snapshot_len(id)));
const metadata=id=>JSON.parse(new TextDecoder().decode(new Uint8Array(M.HEAPU8.subarray(M._arch_metadata_ptr(id),M._arch_metadata_ptr(id)+M._arch_metadata_len(id)))));
const matrices=[[1,0,0,-1,-15,-6.25],[-1,0,0,1,-2,-3],[0,1,1,0,0,0],[0,-1,1,0,0,0],[1,0,0,1,1/128,-3/128],[-1,0,0,-1,0,0],[0,1,-1,0,0,0],[0,-1,-1,0,0,0]];
const req=(sourceHash,matrix)=>({version:'arch-source-frame/1',sourceHash,matrix});
test('exact native + WASM curved boundaries, T-junction, hole, accent and all eight frame isometries',async()=>{
 assert.equal(M._arch_abi_version(),2);assert.equal(M._arch_source_frame_version(),1);assert.equal(M._arch3mf_kernel_abi_version(),2);
 const records=[];extrusionOracle(await readFile(path.join(run,'evidence/native-source/analytic-integer-grid.arch')),{analyticArea:185});
 for(const name of ['combined-vietnamese-original','combined-vietnamese-adopted','shared-hole-accent','oo-multiline','nfd-accent','nfd-regular-multiline']){
  const svg=await readFile(path.join(fixtures,name+'.svg'));const id=buildSVG(input(svg),.2,0,.001,reset());assert.ok(id,err());
  const sg=g,before=bytes(id),sourceMeta=metadata(id);
  const expected=name.startsWith('combined')?{canonicalContours:golden.cases[name].contours}:name==='shared-hole-accent'?{svgAffineArea:185}:{};
  const native=await readFile(path.join(run,'evidence/native-source',name+'.arch'));
  assert.deepEqual(geometryBytes(before),geometryBytes(native),'native/WASM all geometry bytes (generation excluded)');
  const metrics=extrusionOracle(before,expected);extrusionOracle(native,expected);
  if(name.startsWith('combined')){assert.equal(metrics.holes,2);assert.equal(metrics.components,5);assert.equal(metrics.boundaryCount,904);}
  else if(name==='shared-hole-accent'){assert.equal(metrics.holes,1);assert.equal(metrics.components,4);}
  const frames=[];
  for(let i=0;i<matrices.length;i++){
   const h=applySourceFrame(M,id,sg,req(hash(svg),matrices[i]),reset()),b=bytes(h),m=metadata(h);
   assert.equal(m.sourceFrame.sourceSnapshotSha256,hash(before));assert.equal(m.sourceFrame.geometrySha256,hash(b));
   frames.push(frameOracle(before,b,m));const nb=await readFile(path.join(run,'evidence/native-source',name+'-frame-'+i+'.arch'));
   assert.deepEqual(geometryBytes(b),geometryBytes(nb),'native/WASM frame integer arrays exact');
   if(i===4)assert.deepEqual(m.sourceFrame.translationGrid,[7812,-23438]);
   M._arch_snapshot_release(h);
  }
  assert.deepEqual(bytes(id),before);assert.deepEqual(metadata(id),sourceMeta);M._arch_snapshot_release(id);assert.equal(M._arch_raster_owned_bytes(),0);
  records.push({name,metrics,frames,geometrySha256:hash(geometryBytes(before))});
 }
 await writeFile(path.join(out,'geometry-parity.json'),JSON.stringify({status:'pass',records},null,2));
});
test('ASFR rejects forged/retired/changed/unsafe input, memory growth and bounded leases',async()=>{
 const svg=await readFile(path.join(fixtures,'shared-hole-accent.svg'));const src=buildSVG(input(svg),.2,0,.001,reset());assert.ok(src,err());const sg=g,before=bytes(src),o=req(hash(svg),matrices[0]),w=encodeSourceFrame(src,sg,o);const initial=M._arch_raster_owned_bytes();
 const rejected=[];
 for(const [label,change]of [['magic',b=>b[0]^=1],['version',b=>b[4]=2],['flags',b=>b[12]=1],['snapshot',b=>b[16]^=0x80],['generation',b=>b[20]^=1],['hash',b=>b[24]^=1],['reserved',b=>b[104]=1],
  ['NaN',b=>new DataView(b.buffer).setFloat64(88,NaN,true)],['shear',b=>new DataView(b.buffer).setFloat64(72,.5,true)],['range',b=>new DataView(b.buffer).setFloat64(88,10001,true)]]){
  const b=w.slice();change(b);const i=input(b);assert.equal(M._arch_source_frame(i,reset()),0,label);assert.equal(M._arch_input_release(i),0);assert.equal(M._arch_raster_owned_bytes(),initial);rejected.push([label,err()]);
 }
 assert.equal(M._arch_source_frame(M._arch_snapshot_ptr(src),reset()),0,'offset cannot impersonate registered input');assert.equal(err(),'INPUT_HANDLE_INVALID');
 const cancel=reset();Atomics.store(new Int32Array(M.HEAPU8.buffer,M._arch_control_ptr(),4),3,cancel);assert.equal(M._arch_source_frame(input(w),cancel),0);assert.equal(err(),'CANCELLED');
 const held=[];for(let i=0;i<7;i++)held.push(applySourceFrame(M,src,sg,o,reset()));assert.throws(()=>applySourceFrame(M,src,sg,o,reset()),e=>e.code==='SOURCE_FRAME_MEMORY_LIMIT');
 held.forEach(id=>M._arch_snapshot_release(id));assert.equal(M._arch_raster_owned_bytes(),initial);
 const oldMemory=M.HEAPU8.buffer,allocation=M._malloc(oldMemory.byteLength);assert.ok(allocation);try{assert.ok(M.HEAPU8.buffer.byteLength>oldMemory.byteLength,'actual same-allocator memory growth');}finally{M._free(allocation);}
 const fresh=applySourceFrame(M,src,sg,o,reset());frameOracle(before,bytes(fresh),metadata(fresh));M._arch_snapshot_release(fresh);
 assert.deepEqual(bytes(src),before);M._arch_snapshot_release(src);
 assert.throws(()=>applySourceFrame(M,src,sg,o,reset()),e=>e.code==='SOURCE_FRAME_HANDLE');assert.equal(M._arch_raster_owned_bytes(),0);
 for(const matrix of [[1,0,0,1,0,NaN],[2,0,0,1,0,0],[1,0,1,1,0,0]])assert.throws(()=>encodeSourceFrame(1,1,req(hash(svg),matrix)));
 await writeFile(path.join(out,'negative-wire.json'),JSON.stringify({status:'pass',rejected},null,2));
});
test('sealed complete raster dimensions, explicit confirmation, unchanged original plus product metadata',async()=>{
 const source=createProductSourceOperations(M),product=createProductOperations(M);
 const data=new Uint8Array(12*8*4);for(let y=2;y<6;y++)for(let x=3;x<9;x++)data.set([224,68,68,255],4*(y*12+x));
 const p=source.prepare({kind:'rgba',bytes:data,width:12,height:8,options:encodeOptions({longEdgeMm:24})},reset());
 const view=new DataView(p.summary.buffer,p.summary.byteOffset,p.summary.byteLength);
 const sourceHash=hash(data);assert.equal(M._arch_build_raster(p.id,.2,reset()),0,'unapproved stays unapproved');
 const a=source.confirm(p.id,p.summary.slice(128,160),reset()),s=M._arch_build_raster(a.id,.2,reset());assert.ok(s,err());
 const meta=metadata(s),r=meta.rasterFrame;
 assert.equal(meta.sourceHash,sourceHash);assert.equal(meta.originalRgbaHash,sourceHash);assert.equal(meta.widthMm,24);assert.equal(meta.heightMm,16);
 assert.equal(r.widthMm,view.getFloat64(80,true));assert.equal(r.heightMm,view.getFloat64(88,true));assert.equal(r.mmPerPixelX,view.getFloat64(96,true));assert.equal(r.mmPerPixelY,view.getFloat64(104,true));
 assert.deepEqual([r.widthPx,r.heightPx,r.processedWidthPx,r.processedHeightPx],[12,8,12,8]);assert.equal(r.axis,'x-right-y-down');
 const s0=bytes(s),mesh=readSnapshot(s0);assert.ok(Math.max(...mesh.points.map(p=>Number(p[0])/1e6))<24,'ink bbox not full image rectangle');
 const f=applySourceFrame(M,s,g,req(sourceHash,[1,0,0,-1,-2,-3]),reset());frameOracle(s0,bytes(f),metadata(f));M._arch_snapshot_release(f);M._arch_snapshot_release(s);source.release(a.id);source.release(p.id);
 const rf=rasterFixture(),rp=source.prepare(rf,reset()),ra=source.confirm(rp.id,rp.summary.slice(128,160),reset()),request=makeRasterRequest('keychain','noi',{sourceHash:hash(rf.bytes),headHash:hash('frame-metadata')});
 let h=0,root=0;
 try{h=product.prepare({kind:'product',source:{kind:'raster',acceptedHandle:ra.id},packed:request.packed},reset());root=product.buildRequest(h,g);h=0;
  const context=product.metadata(root).sourceMetadata;assert.equal(context.widthMm,40);assert.equal(context.heightMm,30);assert.equal(context.rasterFrame.widthPx,64);assert.equal(context.rasterFrame.heightPx,48);
  await writeFile(path.join(out,'raster-metadata.json'),JSON.stringify({status:'pass',publicContext:meta,productContext:context},null,2));
 }finally{if(h)product.releaseRequest(h);if(root)M._arch_snapshot_release(root);source.release(ra.id);source.release(rp.id);}
 assert.equal(M._arch_raster_owned_bytes(),0);
});

