import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {source,products,artModes,makeRequest,regions,materials} from './fixtures.mjs';
import {createProductOperations,readProductSemantics,readProductHead,packProductRequest} from '../../src/core/product-operations.mjs';
import {productExportDescriptor} from '../../src/core/product-export-descriptor.mjs';
import {readSnapshot,inspectMesh} from '../oracles/mesh-oracle.mjs';
import {run,modulePath} from './environment.mjs';
const output=path.join(run,'evidence/node-wasm-product');fs.mkdirSync(output,{recursive:true});
const factory=(await import(pathToFileURL(modulePath))).default;
const M=await factory({print:()=>{},printErr:()=>{}}),ops=createProductOperations(M);
const sha=b=>createHash('sha256').update(b).digest('hex'),sourceHash=sha(source);
let generation=0;const reset=()=>{const g=++generation;assert.equal(M._arch_control_reset(g),1);return g;};
const err=()=>new TextDecoder().decode(new Uint8Array(M.HEAPU8.subarray(M._arch_error_ptr(),M._arch_error_ptr()+M._arch_error_len())));
const input=b=>{const id=M._arch_input_create(b.length);assert.ok(id);M.HEAPU8.set(b,M._arch_input_ptr(id));return id;};
const snapshot=id=>new Uint8Array(M.HEAPU8.subarray(M._arch_snapshot_ptr(id),M._arch_snapshot_ptr(id)+M._arch_snapshot_len(id)));
const recipe=(product='keychain',art='noi',options={})=>({kind:'product',source:{kind:'svg',source},packed:makeRequest(product,art,{sourceHash,headHash:sha(product+'-'+art),...options}).packed});
const build=r=>{const g=reset(),req=ops.prepare(r,g);return ops.buildRequest(req,g);};
function failure(r,expected){let found;try{const id=build(r);M._arch_snapshot_release(id);assert.fail('published invalid request');}catch(e){found=e;if(e.proposal)ops.releaseProposal(e.proposal.id);}
 assert.match(found.code,new RegExp(expected));return found;}
test('root unified module: 5 products × 4 artwork modes, typed metadata and native mesh parity',()=>{
 assert.ok(M.HEAPU8.buffer instanceof SharedArrayBuffer);assert.equal(M._arch_abi_version(),2);
 assert.equal(M._arch3mf_kernel_abi_version(),2);assert.equal(typeof M._hb_blob_create,'function');
 const records=[];
 for(const product of products)for(const art of artModes){
  const id=build(recipe(product,art)),bytes=snapshot(id),m=ops.metadata(id),s=readSnapshot(bytes),sem=readProductSemantics(m.semanticBytes);
  assert.equal(sem.sourceVerdict,0);assert.equal(sem.mechanicsVerdict,0);assert.equal(sem.fitQualification,'unqualified');
  assert.equal(s.parts.length,sem.parts.length);assert.equal(s.points.length,0);
  const checks=s.parts.map(p=>inspectMesh({vertices:s.vertices,faces:s.faces.slice(p.faceStart,p.faceStart+p.faceCount)}));
  const native=readSnapshot(fs.readFileSync(path.join(run,'evidence/native-product',product+'-'+art+'.arch')));
  assert.equal(s.parts.length,native.parts.length);
  checks.forEach((c,i)=>assert.ok(Math.abs(c.volume-native.parts[i].reportedVolume)<1e-6));
  assert.equal(readProductHead(m.descriptor).sourceHash,sourceHash);
  assert.equal(sem.totalErrorBoundMm,null);assert.ok(sem.lineage.some(l=>l.sourceId==='9007199254741101'));
  fs.writeFileSync(path.join(output,product+'-'+art+'.arch'),bytes);fs.writeFileSync(path.join(output,product+'-'+art+'.apms'),m.semanticBytes);
  records.push({product,art,parts:s.parts.length,triangles:s.faces.length,volumes:checks.map(c=>c.volume)});
  assert.equal(M._arch_snapshot_release(id),1);assert.equal(M._arch_product_buffer_len(id,1),0);assert.equal(M._arch_raster_owned_bytes(),0);
 }
 fs.writeFileSync(path.join(output,'matrix.json'),JSON.stringify(records,null,2)+'\n');
});
test('registered input/request ownership, generation/cancel, retained head and limits',()=>{
 const first=build(recipe()),old=snapshot(first),metadata=ops.metadata(first).semanticBytes;
 const badKind=M._arch_product_request_create(first,generation,input(recipe().packed));assert.equal(badKind,0);assert.equal(err(),'PRODUCT_SOURCE_GENERATION_OR_KIND');
 const holds=M._arch_raster_owned_bytes();
 let g=reset();Atomics.store(new Int32Array(M.HEAPU8.buffer,M._arch_control_ptr(),4),3,g);
 assert.throws(()=>ops.prepare(recipe(),g),e=>e.code==='CANCELLED');assert.equal(M._arch_raster_owned_bytes(),holds);
 g=reset();const prepared=ops.prepare(recipe(),g);
 const head=new Uint8Array(M.HEAPU8.subarray(M._arch_product_request_head_ptr(prepared),M._arch_product_request_head_ptr(prepared)+192));
 assert.equal(readProductHead(head).sourceHash,sourceHash);
 Atomics.store(new Int32Array(M.HEAPU8.buffer,M._arch_control_ptr(),4),3,g);
 assert.throws(()=>ops.buildRequest(prepared,g),e=>e.code==='CANCELLED');assert.equal(M._arch_product_request_release(prepared),0);
 assert.equal(M._arch_raster_owned_bytes(),holds);
 g=reset();const stale=ops.prepare(recipe(),g);reset();
 assert.throws(()=>ops.buildRequest(stale,g),e=>e.code==='STALE_GENERATION');
 assert.equal(M._arch_raster_owned_bytes(),holds);
 const handles=Array.from({length:4},()=>input(new Uint8Array(16)));
 assert.equal(M._arch_input_create(16),0);handles.forEach(h=>M._arch_input_release(h));
 assert.equal(M._arch_input_create(16*1024*1024+1),0);
 g=reset();const dup=input(new TextEncoder().encode(source));
 assert.equal(M._arch_product_prepare_svg(dup,dup,.2,0,.001,g),0);assert.equal(M._arch_raster_owned_bytes(),holds);
 const valid=input(recipe().packed);assert.equal(M._arch_product_prepare_svg(0,valid,.2,0,.001,reset()),0);assert.equal(M._arch_raster_owned_bytes(),holds);
 const requests=[];for(let i=0;i<4;i++){const g=reset();requests.push(ops.prepare(recipe(),g));}
 assert.throws(()=>ops.prepare(recipe(),reset()),e=>e.code==='PRODUCT_REQUEST_LIMIT');
 requests.forEach(id=>ops.releaseRequest(id));assert.equal(M._arch_raster_owned_bytes(),holds);
 assert.deepEqual(snapshot(first),old);assert.deepEqual(ops.metadata(first).semanticBytes,metadata);
 M._arch_snapshot_release(first);assert.equal(M._arch_raster_owned_bytes(),0);
});
test('malformed input / unsupported active feature blocks atomically, no bare extrusion fallback',()=>{
 const first=build(recipe()),old=snapshot(first),base=M._arch_raster_owned_bytes();
 const mutate=(fn)=>{const r=recipe();fn(new DataView(r.packed.buffer),r.packed);return r;};
 failure(mutate((d)=>d.setUint32(4,99,true)),'PRODUCT_REQUEST_VERSION');
 failure(mutate((d,b)=>b[96]^=1),'PRODUCT_SOURCE_HASH_MISMATCH');
 failure(mutate((d,b)=>b.fill(0,128,160)),'PRODUCT_HEAD_REQUIRED');
 failure(mutate((d)=>d.setUint32(60,1,true)),'PRODUCT_REQUEST_FLAGS');
 failure(mutate((d)=>d.setUint32(56,4096,true)),'PRODUCT_METADATA_LIMIT');
 failure(mutate((d)=>{const n=d.getUint32(16,true);for(let i=0;i<n;i++)if(d.getUint32(256+i*40,true)===117)d.setFloat64(256+i*40+24,1,true);}),
  'PRODUCT_BLOCKED');
 const changed=recipe();changed.source.source=source.replace('id="left"','id="renamed"');
 changed.packed.set(Uint8Array.from(sha(changed.source.source).match(/../g),x=>parseInt(x,16)),96);
 failure(changed,'PRODUCT_SOURCE_KEY_MISMATCH');
 assert.equal(M._arch_raster_owned_bytes(),base);assert.deepEqual(snapshot(first),old);M._arch_snapshot_release(first);assert.equal(M._arch_raster_owned_bytes(),0);
});
test('AM_NEEDS_ACCEPTANCE has native exact hash/head, explicit acknowledgement only, no height mutation',()=>{
 const before=build(recipe()),old=snapshot(before),r=recipe('lego','noi'),d=new DataView(r.packed.buffer);
 for(let i=0;i<d.getUint32(16,true);i++)if(d.getUint32(256+i*40,true)===23)d.setFloat64(256+i*40+24,1.2,true);
 let proposal;try{build(r);assert.fail('expected native proposal');}catch(e){assert.equal(e.code,'PRODUCT_NEEDS_ACCEPTANCE');proposal=e.proposal;}
 assert.ok(proposal);const m=readProductSemantics(proposal.semanticBytes),head=readProductHead(proposal.descriptor);
 assert.equal(m.mechanicsVerdict,3);assert.equal(m.parts.length,0);assert.ok(m.proposals.some(p=>p.fieldId===23&&p.before===1.2));
 const damaged=proposal.descriptor.slice();damaged[100]^=1;
 assert.throws(()=>ops.confirm(proposal.id,damaged,{headHash:head.headHash,revision:head.revision},reset()),e=>e.code==='PRODUCT_CONFIRMATION_HEAD_MISMATCH');
 assert.throws(()=>ops.confirm(proposal.id,proposal.descriptor,{headHash:head.headHash,revision:BigInt(head.revision)+1n},reset()),e=>e.code==='PRODUCT_CONFIRMATION_HEAD_MISMATCH');
 const receipt=ops.confirm(proposal.id,proposal.descriptor,{headHash:head.headHash,revision:head.revision},reset());
 assert.deepEqual(receipt,proposal.descriptor);
 assert.throws(()=>ops.confirm(proposal.id,proposal.descriptor,{headHash:head.headHash,revision:head.revision},reset()),e=>e.code==='PRODUCT_PROPOSAL_ALREADY_ACCEPTED');
 assert.deepEqual(snapshot(before),old);assert.equal(readProductSemantics(proposal.semanticBytes).parameters.find(p=>p.fieldId===23).value,1.2);
 fs.writeFileSync(path.join(output,'proposal.apms'),proposal.semanticBytes);fs.writeFileSync(path.join(output,'proposal-head.bin'),proposal.descriptor);
 ops.releaseProposal(proposal.id);M._arch_snapshot_release(before);assert.equal(M._arch_raster_owned_bytes(),0);
});

test('source datum 132..134, separate prepared text context, source ownership and stable selectors',()=>{
 const txt='<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="10mm" viewBox="0 0 10 10"><path id="text-A" fill="#ffffff" fill-rule="evenodd" d="M2 2H6V6H2Z M3 3H5V5H3Z"/></svg>';
 const sourceHandle=(svg)=>{const gen=reset(),id=M._arch_build_svg(input(new TextEncoder().encode(svg)),.2,0,.001,gen);assert.ok(id,err());return {id,generation:gen,sourceHash:sha(svg)};};
 const main=sourceHandle(source),text=sourceHandle(txt);
 const request=makeRequest('keychain','noi',{sourceHash,headHash:sha('text-context'),changes:[
 {id:'bandCore',value:true},{id:'layerBand',value:true},
 // Unequal band tops have no single shared boundary. Nominal MM cap is explicit;
 // its derived intervals retain each actual top instead of inventing ref3.
 {id:'bandCap',value:{heightMode:'mm',mm:.4}}
 ]});
 const baseline=JSON.parse(new TextDecoder().decode(request.packed.slice(-new DataView(request.packed.buffer).getUint32(40,true))));
 const textRegion={contextSlot:1,sourceIndex:0,semanticId:9007199254741201n,provenanceId:5001n,textGroup:9007199254741501n,material:{role:7,rgba:0xffffffff,slot:4,origin:1,provenanceId:5002n}};
 const height={fieldId:0,mode:2,origin:1,datum:133,referenceLayer:22,layerCount:4,value:0,provenanceId:5101n};
 const baseHeight={...height,datum:134,referenceLayer:20,layerCount:2,provenanceId:5102n};
 const texts=[{semanticId:9007199254741501n,provenanceId:1501n,placement:0,baseOn:true,basePad:.5,baseRound:.3,height,baseHeight}];
 const provenance={...baseline,regionSources:[...baseline.regionSources,{contextSlot:1,sourceIndex:0,sourceKey:'text-A',semanticId:textRegion.semanticId.toString()}]};
 const packed=packProductRequest({domainRecord:request.record,headHash:sha('text-context'),sourceHash,sourceId:9007199254741099n,provenanceId:2000n,
  regions:[...regions,textRegion],texts,materials,provenance,upstreamBindings:request.record.records.filter(r=>r.fieldId<=7).sort((a,b)=>a.fieldId-b.fieldId)});
 // Preserve the old invalid declarations as negative root regressions. B(3)=.6
 // cannot name either band top3.2/4.0 or the model text base4.0/glyph4.4.
 const badCap=packed.slice(),capView=new DataView(badCap.buffer);
 for(let i=0;i<capView.getUint32(16,true);i++)if(capView.getUint32(256+i*40,true)===33){const at=256+i*40;capView.setUint32(at+4,2,true);capView.setUint32(at+12,132,true);capView.setUint32(at+16,3,true);capView.setUint32(at+20,2,true);capView.setFloat64(at+24,0,true);}
 failure({kind:'product',source:{kind:'contexts',contexts:[main,text]},packed:badCap},'PRODUCT_BLOCKED');
 const badText=packed.slice(),textView=new DataView(badText.buffer),textAt=256+textView.getUint32(16,true)*40+9*24+3*112;
 textView.setUint32(textAt+40+16,3,true);textView.setUint32(textAt+80+16,3,true);
 failure({kind:'product',source:{kind:'contexts',contexts:[main,text]},packed:badText},'PRODUCT_BLOCKED');
 const g=reset(),prepared=ops.prepare({kind:'product',source:{kind:'contexts',contexts:[main,text]},packed},g);
 // Prepared job owns a canonical copy; original two leases may be released.
 M._arch_snapshot_release(main.id);M._arch_snapshot_release(text.id);
 const id=ops.buildRequest(prepared,g),m=readProductSemantics(ops.metadata(id).semanticBytes),s=readSnapshot(snapshot(id));
 assert.equal(m.parts.filter(p=>p.role===7).length,1);assert.equal(m.parts.filter(p=>p.role===8).length,1);
 assert.ok(m.sourceIntervals.some(i=>i.datum===132));assert.ok(m.sourceIntervals.some(i=>i.datum===133));assert.ok(m.sourceIntervals.some(i=>i.datum===134));
 assert.equal(m.inputTexts[0].height.datum,133);assert.equal(m.inputTexts[0].baseHeight.datum,134);
 assert.equal(m.inputTexts[0].height.referenceLayer,22);assert.equal(m.inputTexts[0].baseHeight.referenceLayer,20);
 s.parts.forEach(p=>inspectMesh({vertices:s.vertices,faces:s.faces.slice(p.faceStart,p.faceStart+p.faceCount)}));
 fs.writeFileSync(path.join(output,'prepared-text.arch'),snapshot(id));fs.writeFileSync(path.join(output,'prepared-text.apms'),ops.metadata(id).semanticBytes);
 M._arch_snapshot_release(id);assert.equal(M._arch_raster_owned_bytes(),0);
});
test('actual accepted root raster context feeds all products/styles; stale preparation bindings reject',()=>{
 const rgba=new Uint8Array(64*48*4);
 for(let y=0;y<48;y++)for(let x=0;x<64;x++){const at=(y*64+x)*4;if(x>=8&&x<14&&y>=9&&y<16)continue;rgba.set(x<32?[224,68,68,255]:[51,136,238,255],at);}
 const options=new Uint8Array(200),d=new DataView(options.buffer);
 [2,200,2,2,360,0,0,0,0,0,0,0,0,0,0,0].forEach((v,i)=>d.setUint32(i*4,v,true));d.setFloat64(64,40,true);
 let g=reset();const candidate=M._arch_raster_prepare_rgba(input(rgba),64,48,input(options),0,0,g);assert.ok(candidate,err());
 const sp=M._arch_raster_buffer_ptr(candidate,1),proposalHash=new Uint8Array(M.HEAPU8.subarray(sp+128,sp+160));
 g=reset();const accepted=M._arch_raster_confirm(candidate,input(proposalHash),g);assert.ok(accepted,err());M._arch_raster_release(candidate);
 const rasterHash=sha(rgba),proofs=[];
 for(const product of products)for(const art of artModes){
  const r=makeRequest(product,art,{sourceHash:rasterHash,headHash:sha('raster-'+product+'-'+art),changes:[
   {id:'k',value:2},{id:'res',value:'360'},{id:'smooth',value:0},{id:'minA',value:0},{id:'denoise',value:0},{id:'eps',value:0},{id:'tension',value:0}
  ]});
  const n=new DataView(r.packed.buffer).getUint32(40,true),provenance=JSON.parse(new TextDecoder().decode(r.packed.slice(-n)));
  provenance.regionSources[0].sourceKey='raster-region:0';provenance.regionSources[1].sourceKey='raster-region:1';
  const packed=packProductRequest({domainRecord:r.record,headHash:sha('raster-'+product+'-'+art),sourceHash:rasterHash,sourceId:9007199254741099n,provenanceId:2000n,
    regions,materials,provenance,upstreamBindings:r.record.records.filter(r=>r.fieldId<=7).sort((a,b)=>a.fieldId-b.fieldId)});
  const rec={kind:'product',source:{kind:'raster',acceptedHandle:accepted},packed},id=build(rec),meta=ops.metadata(id),s=readSnapshot(snapshot(id)),sem=readProductSemantics(meta.semanticBytes);
  assert.equal(meta.sourceMetadata.sourceHash,rasterHash);assert.equal(meta.sourceMetadata.confirmation,'accepted-runtime-proposal');
  assert.equal(sem.inputRegions.length,2);assert.ok(meta.sourceMetadata.sourceLedgerTlvHex.length>0);
  s.parts.forEach(p=>inspectMesh({vertices:s.vertices,faces:s.faces.slice(p.faceStart,p.faceStart+p.faceCount)}));
  fs.writeFileSync(path.join(output,'raster-'+product+'-'+art+'.arch'),snapshot(id));fs.writeFileSync(path.join(output,'raster-'+product+'-'+art+'.apms'),meta.semanticBytes);
  proofs.push({product,art,parts:s.parts.length,triangles:s.faces.length,sourceHash:rasterHash});
  M._arch_snapshot_release(id);
  if(product==='keychain'&&art==='noi'){
   const invalid={...rec,packed:packed.slice()},v=new DataView(invalid.packed.buffer);
   for(let i=0;i<v.getUint32(16,true);i++)if(v.getUint32(256+i*40,true)===3)v.setFloat64(256+i*40+24,1,true);
   failure(invalid,'PRODUCT_UPSTREAM_SOURCE_MISMATCH');
  }
 }
 M._arch_raster_release(accepted);assert.equal(M._arch_raster_owned_bytes(),0);
 fs.writeFileSync(path.join(output,'raster-matrix.json'),JSON.stringify(proofs,null,2)+'\n');
});


test('semantics3: separate skirt datum, unavailable conversion, stable export mapping and exact head',()=>{
 const skirt=recipe('clicky','noi',{changes:[{id:'housing',value:false},
  {id:'skirtH',value:{heightMode:'layers',layers:40,datum:{kind:'feature',featureId:'mech:cap:skirt.bottom'},referenceLayer:0}}]});
 const id=build(skirt),metadata=ops.metadata(id),m=readProductSemantics(metadata.semanticBytes);
 assert.equal(m.mechanicsSemantics,3);
 const sk=m.intervals.find(i=>i.fieldId===81);assert.equal(sk.datum,11);assert.equal(sk.z0,0);assert.equal(sk.z1,8);
 const head=readProductHead(metadata.descriptor);
 let live=true;const lease={id,generation,metadata,bytes(){assert.ok(live,'RELEASED');return snapshot(id);}};
 const descriptor=productExportDescriptor(lease,{headHash:head.headHash,revision:head.revision});
 assert.equal(descriptor.parts.length,m.parts.length);assert.equal(new Set(descriptor.parts.map(p=>p.id)).size,m.parts.length);
 assert.ok(descriptor.parts.every(p=>p.materialId.startsWith('explicit-material-')));
 assert.ok(descriptor.parts.some(p=>p.sourceSemanticIds.includes('9007199254741101')));
 assert.ok(descriptor.parts.some(p=>p.sourceSemanticIds.includes('9007199254741102')));
 assert.throws(()=>productExportDescriptor(lease,{headHash:sha('other-head'),revision:head.revision}),e=>e.code==='PRODUCT_EXPORT_HEAD_MISMATCH');
 const bindings=structuredClone(m.provenance.materials);bindings.forEach(b=>b.rgba=0xffffffff);
 assert.throws(()=>productExportDescriptor(lease,{headHash:head.headHash,revision:head.revision,materialBindings:bindings}),e=>e.code==='PRODUCT_EXPORT_MATERIAL_MISMATCH');
 fs.writeFileSync(path.join(output,'semantics2-skirt.arch'),snapshot(id));fs.writeFileSync(path.join(output,'semantics2-skirt.apms'),metadata.semanticBytes);
 fs.writeFileSync(path.join(output,'export-descriptor.json'),JSON.stringify(descriptor,null,2)+'\n');
 M._arch_snapshot_release(id);live=false;
 assert.throws(()=>productExportDescriptor(lease,{headHash:head.headHash,revision:head.revision}),/RELEASED/);
 const old=structuredClone(skirt),d=new DataView(old.packed.buffer);
 for(let i=0;i<d.getUint32(16,true);i++)if(d.getUint32(256+i*40,true)===81)d.setUint32(256+i*40+12,1,true);
 failure(old,'PRODUCT_BLOCKED');
 const unaligned=build(recipe('clicky','noi',{changes:[{id:'housing',value:false},{id:'postH',value:{heightMode:'mm',mm:7.01}}]}));
 const meta=ops.metadata(unaligned),sem=readProductSemantics(meta.semanticBytes),plate=sem.intervals.find(i=>i.fieldId===sem.parameters.find(p=>p.field==='plateT').fieldId);
 assert.equal(plate.conversionAvailable,false);for(const key of ['referenceLayer','floorDelta','ceilDelta','nearestDelta'])assert.equal(plate[key],null,key);
 assert.ok(sem.diagnostics.some(d=>d.code===109));assert.ok(Math.abs(plate.z0-7.01)<1e-12);
 fs.writeFileSync(path.join(output,'semantics2-unaligned.apms'),meta.semanticBytes);
 const bad=meta.semanticBytes.slice();new DataView(bad.buffer).setUint32(148,1,true);
 assert.throws(()=>readProductSemantics(bad),e=>e.code==='PRODUCT_MECHANICS_SEMANTICS');
 M._arch_snapshot_release(unaligned);assert.equal(M._arch_raster_owned_bytes(),0);
});

test('root raster helper rejects JS numeric wrapping before allocating inputs',async()=>{
 const {createProductSourceOperations}=await import('../../src/core/product-source-operations.mjs');
 const {rasterFixture}=await import('./fixtures.mjs');const sourceOps=createProductSourceOperations(M),fixture=rasterFixture();
 for(const width of [0,64.5,2**32+64,Infinity,-1])assert.throws(()=>sourceOps.prepare({...fixture,width},1),e=>e.code==='RASTER_DIMENSIONS');
 for(const g of [0,.5,2**32+1,Infinity])assert.throws(()=>sourceOps.prepare(fixture,g),e=>e.code==='GENERATION_RANGE');
 const candidate=sourceOps.prepare(fixture,reset());assert.equal(candidate.summary.length,256);
 const accepted=sourceOps.confirm(candidate.id,candidate.summary.slice(128,160),reset());sourceOps.release(candidate.id);sourceOps.release(accepted.id);
 assert.equal(M._arch_raster_owned_bytes(),0);
});
