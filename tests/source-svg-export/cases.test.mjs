import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {kernel,sources,driver,client,close,roots} from './native-harness.mjs';
import {scenario,SVG,text,UTF,clone} from './scenario.mjs';
import {sha256,canonicalJSON} from '../../src/storage/common.mjs';
test.after(close);
async function withSVG(fn){const e=await scenario({kernel,sources,driver});try{await e.ingest('svg');await e.refresh();await fn(e);}finally{await e.close();}}
const save=(name,out)=>{const a=out.artifact??out,dir=path.join(process.env.PROJECT_REVIEW_RUN,'evidence/source-cases-'+(process.env.SOURCE_SVG_LABEL??'attempt'));fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,name+'.svg'),a.bytes);fs.writeFileSync(path.join(dir,name+'.json'),JSON.stringify({metadata:a.metadata,changes:out.changes??[],status:out.status??'artifact'},null,2));};
test('recolor and exclude current regions produce real hash-bound proposal; no old original',async()=>withSVG(async e=>{
 const ids=e.state.content.app.source.metadata.productBindings.regions.map(r=>r.materialId);
 await e.update(s=>{const a=s.content.app.materials.find(m=>m.id===ids[0]);a.color='#00FF00';a.overridden=true;s.content.app.materials.find(m=>m.id===ids[1]).excluded=true;});
 assert.notEqual(e.provider.describe(e.live).status,'ready');await e.refresh();const out=await e.export();
 assert.equal(out.status,'proposal');assert.ok(out.changes.some(s=>s.includes('straight SVG segments')));assert.match(text(out.artifact.bytes),/fill="#00FF00"/);assert.doesNotMatch(text(out.artifact.bytes),/fill="#3388ee"/);assert.notEqual(text(out.artifact.bytes),SVG);
 assert.equal(out.artifact.metadata.sha256,await sha256(out.artifact.bytes));assert.equal(out.artifact.metadata.service.serialization.outputSha256,out.artifact.metadata.sha256);save('recolored-excluded',out);
}));
test('all excluded still serializes intentional empty current SVG',async()=>withSVG(async e=>{
 const ids=new Set(e.state.content.app.source.metadata.productBindings.regions.map(r=>r.materialId));await e.update(s=>s.content.app.materials.forEach(m=>{if(ids.has(m.id))m.excluded=true;}));
 await e.refresh();const out=await e.export();assert.equal(out.status,'proposal');assert.doesNotMatch(text(out.artifact.bytes),/<path/);save('all-excluded',out);
}));
test('real variable multiline bend layout preserves curves; NFD is checked separately',async()=>{
 const e=await scenario({kernel,sources,driver});try{
  await e.update(s=>{Object.assign(s.content.app.text,{sizeMm:'12',letterSpacing:'0.35',lineSpacing:'1.4',bend:'12'});s.provenance.textSourceOptions={variationsByFont:{inter:{wght:620}}};});
  await e.ingest('text',{value:'O\nO'});const r=await e.refresh(),t=r.descriptor.provenance.text[0],out=await e.export();
  assert.equal(t.text.originalText,'O\nO');assert.equal(t.text.text,'O\nO');assert.equal(t.layout.variations.wght,620);assert.equal(t.lines.length,2);assert.ok(t.glyphs.every(g=>g.cluster.original.end>g.cluster.original.start));assert.equal(t.layout.bendDegrees,12);assert.match(text(out.bytes),/[CQ]/);assert.equal(out.status,undefined);save('variable-latin-multiline-bend',out);
 }finally{await e.close();}
});
test('restore/reopen revalidates numeric source and never adopts rehashed forged curves',async()=>{
 const e=await scenario({kernel,sources,driver});try{await e.ingest('text');await e.refresh();e.provider.reset();assert.notEqual(e.provider.describe(e.live).status,'ready');await e.refresh();
  const s=clone(e.state),src=s.content.app.source,f=src.metadata.productArtifacts.art;
  const replace=h=>text(e.records.get(h).bytes).replaceAll('rgb(0,0,0)','rgb(255,0,0)');
  const a=UTF.encode(replace(f.originalNumericSvgHash)),b=UTF.encode(replace(src.metadata.numericSvgHash));assert.notEqual(await sha256(a),f.originalNumericSvgHash);
  const ah=await sha256(a),bh=await sha256(b);e.records.set(ah,{bytes:a});e.records.set(bh,{bytes:b});
  f.originalNumericSvgHash=ah;f.sha256=bh;const {sha256:_,derivationHash:__,...payload}=f;f.derivationHash=await sha256(canonicalJSON(payload));
  src.metadata.numericSvgHash=bh;src.assetHashes.push(ah,bh);src.metadata.productBindings.contexts[0].sha256=bh;src.metadata.productBindings.contexts[0].derivationHash=f.derivationHash;
  e.state=s;await e.sync();await assert.rejects(e.refresh(),{code:'SOURCE_SVG_DERIVED_CHANGED'});assert.notEqual(e.provider.describe(e.live).status,'ready');
 }finally{await e.close();}
});
test('uploaded originalText/font provenance labels cannot override fresh source proof',async()=>{
 for(const change of [s=>s.metadata.originalText='forged',s=>s.metadata.sourceRecords[0].source={...s.metadata.sourceRecords[0].source,claim:'forged'}]){
  const e=await scenario({kernel,sources,driver});try{await e.ingest('text');await e.update(s=>change(s.content.app.source));await assert.rejects(e.refresh(),{code:'SOURCE_SVG_DERIVED_CHANGED'});}finally{await e.close();}
 }
});
test('region geometry/context forgery and full identity hash collision labels are rejected',async()=>{
 for(const change of [
  b=>b.regions[0].geometryHash='a'.repeat(64),
  b=>b.contexts[0].sha256='b'.repeat(64),
  b=>b.regions[1].sourceKey=b.regions[0].sourceKey,
  b=>b.identityLedger.records[1].id=b.identityLedger.records[0].id,
  b=>b.identityLedger.records[0].sha256=b.identityLedger.records[0].sha256.slice(0,16)+'0'.repeat(48)
 ])await withSVG(async e=>{await e.update(s=>change(s.content.app.source.metadata.productBindings));await assert.rejects(e.refresh(),err=>['SOURCE_SVG_REGION_CHANGED','SOURCE_SVG_IDENTITY'].includes(err.code));});
});
test('duplicate full material ID and unmapped selection never choose by color/order',async()=>{
 for(const change of [s=>s.content.app.materials.push(clone(s.content.app.materials[0])),s=>s.content.app.source.metadata.productBindings.regions[0].materialId='missing-material']){
  await withSVG(async e=>{await e.update(change);await assert.rejects(e.refresh(),err=>['SOURCE_SVG_IDENTITY','SOURCE_SVG_MATERIAL'].includes(err.code));});
 }
});
test('dependencies copied before hash; in-place and same-key replacement fail without publication',async()=>withSVG(async e=>{
 const h=e.state.content.app.source.raw.hash,original=e.live.assetsMap.get(h).slice();let pending=e.refresh();e.live.assetsMap.get(h)[original.length-8]^=1;
 await assert.rejects(pending,{code:'SOURCE_SVG_ASSET_HASH'});assert.notEqual(e.provider.describe(e.live).status,'ready');
 e.live.assetsMap.set(h,original.slice());await e.refresh();e.live.assetsMap.set(h,new Uint8Array(original.length));assert.equal(e.provider.describe(e.live).reasonCode,'SOURCE_SVG_ASSET_HASH');
}));
test('source replacement/logout/A-B-A reset and native retirement invalidate cached source',async()=>withSVG(async e=>{
 const first=e.provider.describe(e.live);e.provider.reset();e.sessionKey='2:1';e.userId='source-user-b';await e.sync();assert.notEqual(e.provider.describe(e.live).status,'ready');
 e.userId='source-user-a';e.sessionKey='3:1';await e.sync();await e.refresh();assert.notEqual(e.provider.describe(e.live).key,first.key);
 const epoch=client.epoch;client.epoch++;assert.equal(e.provider.describe(e.live).reasonCode,'SOURCE_SVG_RUNTIME');client.epoch=epoch;
 driver.set(null);assert.notEqual(e.provider.describe(e.live).status,'ready');
}));
test('cancel, superseded refresh, reset while hashing publish no stale descriptor',async()=>withSVG(async e=>{
 const ac=new AbortController(),c={...e.control(),signal:ac.signal};let p=e.provider.refresh({control:c});ac.abort();await assert.rejects(p,{code:'SOURCE_SVG_CANCELLED'});assert.notEqual(e.provider.describe(e.live).status,'ready');
 p=e.refresh();const next=e.refresh();await assert.rejects(p,{code:'SOURCE_SVG_STALE'});await next;
 p=e.refresh();e.provider.reset();await assert.rejects(p,{code:'SOURCE_SVG_RESET'});assert.notEqual(e.provider.describe(e.live).status,'ready');assert.equal(roots.size,0);
}));
test('acquire requires exact descriptor/context/assets; owned output and release/reset semantics',async()=>withSVG(async e=>{
 const d=e.provider.describe(e.live),c=e.control(),input={...c,context:{...e.live,revision:e.state.revision},assets:e.assets()};
 await assert.rejects(e.provider.acquire({...d,rawHash:'0'.repeat(64)},input),{code:'SOURCE_SVG_STALE'});
 const l=await e.provider.acquire(d,input),opts=e.live.exportOptions['svg-color'];const a=await l.serializeSVG(opts,c);a.bytes.fill(0);const b=await l.serializeSVG(opts,c);assert.equal(text(b.bytes),SVG);
 await assert.rejects(l.serializeSVG({...opts,units:'mm'},c),{code:'SOURCE_SVG_OPTIONS'});l.release();await assert.rejects(l.serializeSVG(opts,c),{code:'SOURCE_SVG_RESET'});
 const other=await e.provider.acquire(d,input);e.provider.reset();await assert.rejects(other.serializeSVG(opts,c),{code:'SOURCE_SVG_RESET'});other.release();
}));
test('finite plain JSON, accessors, prototype/cycle and dependency/resource limits reject early',async()=>withSVG(async e=>{
 const original=e.state;let called=0;const state=clone(original);Object.defineProperty(state.content,'bad',{enumerable:true,get(){called++;return 1;}});
 driver.set({...e.live,state});await assert.rejects(e.refresh(),{code:'SOURCE_SVG_DATA'});assert.equal(called,0);
 for(const mutate of [s=>s.loop=s,s=>s.extra=NaN,s=>{s.content.app.source.assetHashes=Array.from({length:257},(_,i)=>i.toString(16).padStart(64,'0'));}]){
  const state=clone(original);mutate(state);driver.set({...e.live,state});await assert.rejects(e.refresh(),err=>['SOURCE_SVG_DATA','SOURCE_SVG_LIMIT'].includes(err.code));
 }
 driver.set(e.live);
}));
// Codex R3B-C02: text beside the artwork at negative millimetres was refused outright, because the
// re-verification here kept its own copy of the framing arithmetic and knew only the untranslated
// form the producer writes. It now calls the producer, and the document spans the union of artwork
// and overlay instead of a viewport pinned at zero, which would cut the text off on the left.
test('text beside the artwork at negative millimetres exports, and the document reaches it',async()=>{
 const e=await scenario({kernel,sources,driver});
 try{
  e.state=clone(e.state);Object.assign(e.state.content.app.text,{text:'F',xMm:'-30',yMm:'-15',placement:'beside',baseEnabled:false});
  e.state.revision++;await e.sync();
  await e.ingest('svg');
  await e.refresh();
  const out=await e.export(),svg=text(out.bytes);
  const box=/viewBox="([^"]+)"/.exec(svg)[1].split(' ').map(Number);
  assert.equal(box.length,4);
  assert.ok(box[0]<0,'the viewport reaches left of the artwork for text at a negative x: '+box.join(' '));
  assert.ok(box[0]+box[2]>=40&&box[1]+box[3]>=30,'it still covers the whole artwork: '+box.join(' '));
  assert.match(svg,/id="red"/);assert.match(svg,/translate\(0 /);
  save('svg-text-overlay-negative',out);
 }finally{await e.close();}
});

test('SVG plus committed real text overlay preserves both curve sources before 3D',async()=>{
 const e=await scenario({kernel,sources,driver});try{await e.ingest('svg',{overlay:true});await e.refresh();const out=await e.export();assert.equal(out.status,undefined);assert.match(text(out.bytes),/id="red"/);assert.match(text(out.bytes),/translate\(0 /);assert.match(text(out.bytes),/[CQ]/);save('svg-text-overlay',out);}finally{await e.close();}
});

// Codex R3B-C03: after a real edit, the project is bound to the edited pixels, but this exporter
// identified the raster context by the file the picture came from, so it refused every edited
// raster. Both sides now ask the same question. Accepting the region decision is what the
// application does when the person confirms the proposal; the plan carries the bindings it commits.
test('a raster that was edited and separated again still exports its source SVG',async()=>{
 const {createEditor}=await import('../../src/editing/index.mjs');const {encodeRasterPNG}=await import('../../src/core/png-encode.mjs');
 const e=await scenario({kernel,sources,driver});
 try{
  await e.ingest('raster');await e.refresh();
  const src=e.state.content.app.source,r=src.raster,old=e.records.get(r.rgba).bytes;
  const editor=await createEditor({source:{id:src.id,hash:src.raw.hash,adapterId:'arch-source-svg-test',adapterVersion:'1'},image:{width:r.width,height:r.height,data:old,colorSpace:'srgb',alphaMode:'straight'}});
  const result=await editor.apply({version:'arch-raster-edit/1',id:'erase-for-export',expected:editor.token(),tool:'erase',points:[{x:10,y:8},{x:13,y:8}],width:3});
  assert.ok(result.changedPixels>0,'the edit changed pixels');
  const rgba=new Uint8Array(result.image.data),h=await sha256(rgba);
  const png=await encodeRasterPNG({width:r.width,height:r.height,data:new Uint8ClampedArray(rgba)}),p=await sha256(png);
  e.records.set(h,{hash:h,byteLength:rgba.length,bytes:rgba,kind:'derived'});e.records.set(p,{hash:p,byteLength:png.length,bytes:png,kind:'derived'});
  await e.update(s=>{s.content.app.source.raster.rgba=h;s.content.app.source.raster.preview=p;s.content.app.source.assetHashes.push(h,p);});
  // Separate the edited picture again, confirming the region decision the bridge asks for.
  await e.convert({acceptDecision:true});
  const bound=e.state.content.app.source;
  assert.notEqual(bound.metadata.productBindings.contexts[0].sha256,bound.raw.hash,
   'an edited raster is identified by its pixels, not by the file it came from');
  await e.refresh();
  const out=await e.export();assert.equal(out.status,undefined);
  assert.match(text(out.bytes),/data-scope="committed-source-regions"/);
  save('raster-edited-source-svg',out);
 }finally{await e.close();}
});

test('actual erase preserves original and reports default adoption blocker without material fallback',async()=>{
 const {createEditor}=await import('../../src/editing/index.mjs');const {encodeRasterPNG}=await import('../../src/core/png-encode.mjs');
 const e=await scenario({kernel,sources,driver});try{
  await e.ingest('raster');await e.refresh();const before=await e.export(),src=e.state.content.app.source,r=src.raster,old=e.records.get(r.rgba).bytes;
  const editor=await createEditor({source:{id:src.id,hash:src.raw.hash,adapterId:'arch-source-svg-test',adapterVersion:'1'},image:{width:r.width,height:r.height,data:old,colorSpace:'srgb',alphaMode:'straight'}});
  const result=await editor.apply({version:'arch-raster-edit/1',id:'erase-current',expected:editor.token(),tool:'erase',points:[{x:10,y:8},{x:13,y:8}],width:3});
  assert.ok(result.changedPixels>0);assert.deepEqual(editor.original().image.data,new Uint8Array(old));
  const rgba=new Uint8Array(result.image.data),h=await sha256(rgba),png=await encodeRasterPNG({width:r.width,height:r.height,data:new Uint8ClampedArray(rgba)}),p=await sha256(png);
  e.records.set(h,{hash:h,byteLength:rgba.length,bytes:rgba,kind:'derived'});e.records.set(p,{hash:p,byteLength:png.length,bytes:png,kind:'derived'});await e.update(s=>{s.content.app.source.raster.rgba=h;s.content.app.source.raster.preview=p;s.content.app.source.assetHashes.push(h,p);});
  await assert.rejects(e.refresh(),{code:'RASTER_SOURCE_CONVERSION_REQUIRED'});
  const dir=path.join(process.env.PROJECT_REVIEW_RUN,'evidence/source-cases-'+process.env.SOURCE_SVG_LABEL);fs.mkdirSync(dir,{recursive:true});
  // The erase retires a colour region, so adoption asks the person to decide what becomes of the
  // bindings that region held, and refuses to decide on its own. The blocker is checked by what it
  // carries rather than by one code string: the earlier expectation named a material-id conflict,
  // which is a different refusal and not the one this flow reaches (Hub, release round 3).
  let failure=null;try{await e.convert();}catch(error){
   assert.equal(error.code,'PRODUCT_ADOPTION_DECISION_REQUIRED');
   const plan=error.details?.plan;
   assert.equal(plan?.status,'proposal');
   assert.ok(plan.proposals.some(x=>x.kind==='source-identity-rebind'&&x.requiresExplicitDecision===true),
    'the refusal is the region decision, not a material fallback: '+JSON.stringify(plan.proposals.map(x=>x.kind)));
   assert.equal(plan.diagnostics.length,0,'nothing is blocked; a decision is pending');
   failure={code:error.code,proposals:plan.proposals.map(x=>x.kind)};
  }
  if(failure){assert.notEqual(e.provider.describe(e.live).status,'ready');assert.equal(e.state.content.app.source.raw.hash,src.raw.hash);assert.equal(e.state.content.app.source.revision,src.revision);
   fs.writeFileSync(path.join(dir,'edited-raster-result.json'),JSON.stringify({status:'blocked-upstream',code:failure.code,proposals:failure.proposals,originalHash:src.raw.hash,retainedOriginalHash:e.state.content.app.source.raw.hash,beforeRGBAHash:r.rgba,afterRGBAHash:h,changedPixels:result.changedPixels,noExportPublished:true,noMaterialFallback:true},null,2));return;}
  const refreshed=await e.refresh(),out=await e.export();
  assert.notEqual(out.metadata.sha256,before.metadata.sha256);assert.equal(e.state.content.app.source.raw.hash,src.raw.hash);assert.equal(e.state.content.app.source.revision,src.revision+1);assert.equal(refreshed.descriptor.provenance.originalBytesPreserved,true);save('edited-raster',out);
  fs.writeFileSync(path.join(dir,'edited-raster-result.json'),JSON.stringify({status:'exported',originalHash:src.raw.hash,retainedOriginalHash:e.state.content.app.source.raw.hash,noMaterialFallback:true},null,2));
 }finally{await e.close();}
});
test('forged accepted raster derived buffer is rejected by real native replay despite rehashed metadata',async()=>{
 const e=await scenario({kernel,sources,driver});try{await e.ingest('raster');const src=e.state.content.app.source;
  const rec=src.metadata.rasterPreparation.buffers.find(r=>r.kind===28),forged=new Uint8Array(e.records.get(rec.hash).bytes);forged[0]^=1;const fh=await sha256(forged);e.records.set(fh,{bytes:forged});await e.update(s=>{s.content.app.source.metadata.rasterPreparation.buffers.find(r=>r.kind===28).hash=fh;s.content.app.source.assetHashes.push(fh);});
  const s=e.state.content.app.source,p=s.metadata.rasterPreparation,{approvalHash,...payload}=p;
  p.approvalHash=await sha256(canonicalJSON(payload));s.metadata.confirmationReceipt.approvalHash=p.approvalHash;await e.sync();
  await assert.rejects(e.refresh(),{code:'RASTER_DERIVED_CHANGED'});
 }finally{await e.close();}
});

test('lease limit remains bounded under concurrent acquire; export ticket cannot be swapped',async()=>withSVG(async e=>{
 const d=e.provider.describe(e.live),c=e.control(),input={...c,context:{...e.live,revision:e.state.revision},assets:e.assets()};
 const result=await Promise.allSettled(Array.from({length:5},()=>e.provider.acquire(d,input))),ok=result.filter(r=>r.status==='fulfilled');
 assert.equal(ok.length,4);assert.equal(result.filter(r=>r.status==='rejected')[0].reason.code,'SOURCE_SVG_LIMIT');
 const l=ok[0].value;await assert.rejects(l.serializeSVG(e.live.exportOptions['svg-color'],{...c,ticket:{...c.ticket,id:'other-ticket'}}),{code:'SOURCE_SVG_STALE'});
 let called=0;const options={...e.live.exportOptions['svg-color']};Object.defineProperty(options,'filename',{enumerable:true,get(){called++;return 'bad.svg';}});
 await assert.rejects(l.serializeSVG(options,c),{code:'SOURCE_SVG_DATA'});assert.equal(called,0);ok.forEach(r=>r.value.release());
}));
test('matching head with stale ticket or forged raw hash and revised dependency bytes fails',async()=>withSVG(async e=>{
 const c=e.control();await assert.rejects(e.provider.refresh({control:{...c,ticket:{...c.ticket,revision:c.ticket.revision+1}}}),{code:'SOURCE_SVG_STALE'});
 const p=e.refresh();e.live.headHash='0'.repeat(64);await assert.rejects(p,{code:'SOURCE_SVG_STALE'});await e.sync();
 e.live.assetsMap.get(e.state.content.app.source.raw.hash).fill(32);await assert.rejects(e.refresh(),{code:'SOURCE_SVG_ASSET_HASH'});
}));
test('active external or embedded SVG cannot acquire proof from forged upload metadata',async()=>{
 for(const active of ['<script>alert(1)</script>','<image href="https://invalid.example/a.png"/>','<foreignObject><div/></foreignObject>']){
  await withSVG(async e=>{const b=UTF.encode(SVG.replace('</svg>',active+'</svg>')),h=await sha256(b);e.records.set(h,{bytes:b,hash:h,byteLength:b.length});await e.update(s=>{const src=s.content.app.source;src.raw={hash:h,byteLength:b.length};src.assetHashes.push(h);src.metadata.productBindings.rawHash=h;});await assert.rejects(e.refresh(),err=>['SOURCE_SVG_ACTIVE_CONTENT','XML_ACTIVE_CONTENT','XML_EXTERNAL_REFERENCE'].includes(err.code)||/XML|SVG/.test(err.code));});
 }
});
test('authored nonzero self crossing path and disconnected tiny accent retain original rules',async()=>{
 const e=await scenario({kernel,sources,driver});try{
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="20mm" viewBox="0 0 20 20"><path id="cross" fill="#112233" fill-rule="nonzero" d="M10 1L15 18L1 7L19 7L5 18Z"/><path id="accent" fill="#445566" d="M9 0H9.2V0.2H9Z"/></svg>';
  await e.ingest('svg',{svg});await e.refresh();const out=await e.export();assert.equal(text(out.bytes),svg);assert.equal(out.metadata.service.serialization.materialMapping.length,2);save('crossing-tiny-accent',out);
 }finally{await e.close();}
});
test('Vietnamese NFD multiline without bend revalidates original clusters and analytic spacing',async()=>{
 const e=await scenario({kernel,sources,driver});try{
  await e.update(s=>{Object.assign(s.content.app.text,{sizeMm:'12',sizeDisplay:'12',letterSpacing:'0.35',lineSpacing:'1.4',bend:'0'});});
  await e.ingest('text',{value:'E\u0302\u0301\nĐO'});const r=await e.refresh(),p=r.descriptor.provenance.text[0];assert.equal(p.text.originalText,'E\u0302\u0301\nĐO');assert.equal(p.lines.length,2);assert.ok(Math.abs(p.lines[1].baselineY-p.lines[0].baselineY+16.8)<1e-12);assert.equal(p.layout.letterSpacingMm,.35);save('vietnamese-nfd-lines',await e.export());
 }finally{await e.close();}
});
test('mm and pt display choices yield identical actual geometry in the shared mm source frame',async()=>{
 const hashes=[];for(const [sizeUnit,sizeDisplay]of [['mm','12.7'],['pt','36']]){
  const e=await scenario({kernel,sources,driver});try{await e.update(s=>Object.assign(s.content.app.text,{sizeMm:'12.7',sizeUnit,sizeDisplay}));await e.ingest('text',{value:'O'});await e.refresh();const out=await e.export();hashes.push(await sha256(out.bytes));}finally{await e.close();}
 }assert.equal(hashes[0],hashes[1]);
});

test('self-rehashed raster display dimensions cannot override actual native packet frame',async()=>{
 const e=await scenario({kernel,sources,driver});try{await e.ingest('raster');
  await e.update(s=>{const src=s.content.app.source;src.metadata.rasterPreparation.summary.widthMm*=2;src.metadata.rasterPreparation.summary.heightMm*=2;src.raster.pixelSizeMm*=2;});
  const s=e.state.content.app.source,p=s.metadata.rasterPreparation,{approvalHash,...payload}=p;p.approvalHash=await sha256(canonicalJSON(payload));s.metadata.confirmationReceipt.approvalHash=p.approvalHash;s.metadata.productBindings.contexts[0].derivationHash=p.approvalHash;await e.sync();
  await assert.rejects(e.refresh(),{code:'SOURCE_SVG_DERIVED_CHANGED'});assert.notEqual(e.provider.describe(e.live).status,'ready');
 }finally{await e.close();}
});
