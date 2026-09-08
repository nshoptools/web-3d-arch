import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {adapters,svgState,rasterState,adoptState,ownTestState,change,client,operation,live,setLive,controlFor,products,styles,transportLog,noOwned,evidence,svgPreparation,rasterPreparation,svg,txtSVG,M} from './harness.mjs';
import {deriveProductIdentities,PRODUCT_ROLES} from '../../src/integration/product-adapters.mjs';
import {canonicalJSON,sha256} from '../../src/storage/common.mjs';
import {domainStateFingerprint} from '../../src/storage/history.mjs';
import {readSnapshot,inspectMesh} from '../oracles/mesh-oracle.mjs';
import {inside,intersections,partMesh} from '../../src/kernel/source-assembly/tests/oracles/spatial-oracle.mjs';
import {readProductSemantics} from '../../src/core/product-operations.mjs';
const counts={models:0,parts:0,seamSamples:0,holeParts:0,matrix:[]};
function oracle(model,a,kind,inputWidth=40){
 const snapshot=readSnapshot(model.bytes()),root=a.kernelLeases.get(model).root,sem=readProductSemantics(root.metadata.semanticBytes);
 const meshes=snapshot.parts.map(p=>partMesh(snapshot,p));meshes.forEach(inspectMesh);
 const key=model.product.semantics.provenance.regionSources.find(r=>r.sourceKey===(kind==='svg'?'left':'raster-region:0')).stableSourceKey;
 const identity=model.product.semantics.provenance.identities.find(r=>r.kind==='region'&&r.key===key).id;
 const lineage=sem.lineage.filter(l=>l.sourceId===identity),leftIds=new Set(lineage.map(l=>l.slabId)),scale=sem.sourceTransform[0];
 const left=sem.parts.filter(p=>p.role===1&&leftIds.has(p.sourceId));
 assert.ok(left.length>0);
 for(const p of left){
  const mesh=meshes[p.meshPart],zs=mesh.vertices.map(v=>v[2]),z=(Math.min(...zs)+Math.max(...zs))/2;
  const x=(kind==='svg'?7:6.25*inputWidth/40)*scale+sem.sourceTransform[4],y=(kind==='svg'?8:7.5*inputWidth/40)*scale+sem.sourceTransform[5];
  assert.equal(inside(mesh,[x,y,z]),false,'authored source hole survives');counts.holeParts++;
 }
 const table=sem.tables.get(25),d=new DataView(sem.bytes.buffer,sem.bytes.byteOffset,sem.bytes.byteLength),seam=(kind==='svg'?20:inputWidth/2)*scale+sem.sourceTransform[4];
 const xs=Array.from({length:table.count},(_,i)=>Number(d.getBigInt64(table.offset+16*i,true))/1e6);
 const canonical=xs.reduce((a,b)=>Math.abs(a-seam)<=Math.abs(b-seam)?a:b),art=sem.parts.filter(p=>p.role===1);
 let samples=0;
 for(let i=0;i<art.length;i++)for(let j=i+1;j<art.length;j++){
  const a=meshes[art[i].meshPart],b=meshes[art[j].meshPart],az=a.vertices.map(v=>v[2]),bz=b.vertices.map(v=>v[2]);
  const z0=Math.max(Math.min(...az),Math.min(...bz)),z1=Math.min(Math.max(...az),Math.max(...bz));
  if(z1<=z0+1e-6)continue;
  for(const fraction of [.127,.381,.733,.917]){
   const ay=intersections(a,0,(kind==='svg'?14.123:14.123*inputWidth/40)*scale+sem.sourceTransform[5],z0+fraction*(z1-z0));
   const by=intersections(b,0,14.123*scale+sem.sourceTransform[5],z0+fraction*(z1-z0));
   if(ay.some(x=>Math.abs(x-canonical)<2e-8)&&by.some(x=>Math.abs(x-canonical)<2e-8)){
    assert.ok(ay.some(x=>by.some(y=>Math.abs(x-y)<=1e-12&&Math.abs(x-canonical)<2e-8)));samples++;
   }
  }
 }
 assert.ok(samples>0,'shared material seam coincides');counts.seamSamples+=samples;counts.parts+=meshes.length;
 assert.equal(sem.totalErrorBoundMm,null);assert.equal(model.stats.verdict,'unverified');
 assert.equal(/"token":/.test(JSON.stringify(model.product)),false,'runtime tokens never enter stored semantic metadata');
 assert.deepEqual(model.blocks.map(b=>b.id),sem.parts.map(p=>p.id));
 for(const block of model.blocks){
  assert.ok(!block.id.startsWith('part-'));assert.ok(block.materialId);
  assert.equal(model.product.exportDescriptor.parts[block.partIndex].materialId,block.materialId);
 }
 assert.equal(model.stats.materialCount,new Set(model.blocks.map(b=>b.materialId)).size);
 assert.equal(model.product.head.headHash,model.product.semantics.provenance.headHash??model.product.head.headHash);
 return {parts:meshes.length,triangles:snapshot.faces.length,seamSamples:samples,holeParts:left.length};
}
test('actual App domain -> all five products/four styles -> same frozen root; SVG and approved PNG raster',async()=>{
 for(const kind of ['svg','raster'])for(const product of products)for(const style of styles){
  const f=await adoptState(await (kind==='svg'?svgState:rasterState)(product,style)),a=adapters(),input=ownTestState(f);
  const model=await a.engine.build(input);
  assert.equal(model.product.head.headHash,await domainStateFingerprint(f.state));
  assert.equal(model.product.head.revision,String(f.state.revision));
  assert.notEqual(model.ticket,input.ticket);assert.deepEqual(model.ticket,input.ticket);
  const check=oracle(model,a,kind,kind==='svg'?40:f.state.content.app.source.metadata.rasterPreparation.options.longEdgeMm);
  const name=kind+'-'+product+'-'+style;
  fs.writeFileSync(path.join(evidence,name+'.arch'),model.bytes());
  fs.writeFileSync(path.join(evidence,name+'.apms'),a.kernelLeases.get(model).root.metadata.semanticBytes);
  counts.models++;counts.matrix.push({kind,product,style,...check});
  assert.equal(client.roots.size,1,'source borrow released, only independent model remains');
  model.release();assert.equal(a.kernelLeases.has(model),false);assert.throws(()=>model.bytes());await a.reset();noOwned();
 }
 const generations=transportLog.filter(r=>r.generation).map(r=>r.generation);
 assert.equal(new Set(generations).size,generations.length,'every mutation uses fresh common generation');
 fs.writeFileSync(path.join(evidence,'matrix.json'),JSON.stringify(counts,null,2)+'\n');
});
test('persistent identities survive reordering/color edits; digest tuple and collisions checked',async()=>{
 const f=await svgState('clicky'),a=adapters(),m1=await a.engine.build(ownTestState(f));
 const before=m1.product.semantics.provenance.identities;
 const edited=change(f,s=>{s.content.app.materials.reverse();s.content.app.materials.forEach(m=>m.overridden=true);s.content.app.materials.find(m=>m.id==='paint-west').color='#3388ee';s.content.app.source.metadata.productBindings.regions.reverse();s.revision++;});
 const m2=await a.engine.build(ownTestState(edited));
 assert.deepEqual(new Map(before.map(x=>[x.kind+':'+x.key,x.id])),new Map(m2.product.semantics.provenance.identities.map(x=>[x.kind+':'+x.key,x.id])));
 const roles=m2.product.exportDescriptor.parts.filter(p=>p.color==='#30353B');
 assert.ok(new Set(roles.map(p=>p.role)).size>=3);
 assert.ok(new Set(roles.map(p=>p.materialId)).size>=3,'same RGBA/slot does not collapse distinct roles');
 assert.ok(m2.stats.materialCount>new Set(m2.product.exportDescriptor.parts.map(p=>p.rgba)).size);
 for(const entry of before){
  assert.equal(entry.sha256,await sha256(canonicalJSON(entry.tuple)));
  assert.equal(entry.id,(BigInt('0x'+entry.sha256.slice(0,16))|0x8000000000000000n).toString());
 }
 await assert.rejects(deriveProductIdentities({projectId:'p',sourceId:'s',keys:[{kind:'region',key:'x'},{kind:'region',key:'x'}]}),{code:'PRODUCT_IDENTITY_DUPLICATE'});
 // Controlled WebCrypto injection forces a truncated/full digest collision.
 const original=crypto.subtle.digest.bind(crypto.subtle);
 Object.defineProperty(crypto.subtle,'digest',{configurable:true,value:async()=>new Uint8Array(32).buffer});
 try{await assert.rejects(deriveProductIdentities({projectId:'p',sourceId:'s',keys:[{kind:'region',key:'x'},{kind:'region',key:'y'}]}),{code:'PRODUCT_IDENTITY_COLLISION'});}
 finally{Object.defineProperty(crypto.subtle,'digest',{configurable:true,value:original});}
 m2.release();m1.release();await a.reset();noOwned();
});
test('explicit invalid/unsupported domain bindings reject before product dispatch',async()=>{
 const f=await svgState(),cases=[
 ['PRODUCT_BINDINGS_REQUIRED',s=>delete s.content.app.source.metadata.productBindings],
 ['PRODUCT_BINDINGS_STALE',s=>s.content.app.source.metadata.productBindings.rawHash='0'.repeat(64)],
 ['PRODUCT_REGION_DUPLICATE',s=>s.content.app.source.metadata.productBindings.regions[1].sourceKey='authored-west'],
 ['PRODUCT_MATERIAL_SLOT',s=>s.content.app.materials[0].slot=null],
 ['PRODUCT_REGION_DATUM_REQUIRED',s=>s.content.app.materials.find(m=>m.id==='paint-west').heightLayers=4],
 ['PRODUCT_MATERIAL_UNAVAILABLE',s=>s.content.app.materials.find(m=>m.id==='paint-west').excluded=true],
 ['IMPORT_CSG_UNAVAILABLE',s=>s.parameters.common.impOn.value=true],
 ['PRODUCT_TEXT_CONTEXT_REQUIRED',s=>s.content.app.text.text='actual requested overlay'],
 ['PRODUCT_SOURCE_CONTEXT',s=>s.content.app.source.metadata.sourceContext.revision++]
 ];
 for(const [code,fn]of cases){
  const bad=change(f,fn),a=adapters(),before=transportLog.filter(r=>r.method==='product').length;
  await assert.rejects(a.engine.build(ownTestState(bad)),e=>e.code===code,'expected '+code);
  assert.equal(transportLog.filter(r=>r.method==='product').length,before);await a.reset();noOwned();
 }
 const a=adapters(),wrong={...f,assets:new Map(f.assets)};
 wrong.assets.set(f.state.content.app.source.raw.hash,new Uint8Array(f.assets.values().next().value));
 wrong.assets.values().next().value[30]^=1;
 await assert.rejects(a.engine.build(ownTestState(wrong)),{code:'PRODUCT_ASSET_HASH'});await a.reset();noOwned();
});
test('exact coverage and native source-key check reject arbitrary canonical context mismatch',async()=>{
 const f=await svgState();
 for(const [code,mutate]of [
  ['PRODUCT_REGION_COVERAGE',p=>p.contexts[0].regions.pop()],
  ['PRODUCT_SOURCE_INDEX_DUPLICATE',p=>p.contexts[0].regions[1].sourceIndex=0],
  ['PRODUCT_CONTEXT_HASH',p=>p.contexts[0].sourceHash='1'.repeat(64)],
  ['PRODUCT_CONTEXT_OWNER',p=>p.owner={}],
  ['PRODUCT_CONTEXT_EPOCH',p=>p.source.epoch++]
 ]){
  const a=adapters({withPreparedSource:(args,consume)=>svgPreparation(args,p=>{mutate(p);return consume(p);})});
  await assert.rejects(a.engine.build(ownTestState(f)),e=>e.code===code,'expected '+code);await a.reset();noOwned();
 }
 const a=adapters({withPreparedSource:(args,consume)=>svgPreparation(args,p=>{
  // Independent native registration catches a routing lie even when JS keys
  // still cover the declared set exactly.
  p.contexts[0].regions.reverse();p.contexts[0].regions.forEach((r,i)=>r.sourceIndex=i);return consume(p);
 })});
 await assert.rejects(a.engine.build(ownTestState(f)),{code:'PRODUCT_SOURCE_KEY_MISMATCH'});await a.reset();noOwned();
});
test('borrow lifetime, retained head, async cancellation/auth/reset and prepared mutation',async()=>{
 const f=await svgState(),a=adapters(),first=await a.engine.build(ownTestState(f)),bytes=first.bytes().slice();
 let captured;
 const c=controlFor(f.state);
 await a.prepareRecipe({...c,...f},async job=>{
  captured=job;job.recipe.packed[200]^=1;await assert.rejects(job.assertCurrent(),{code:'PRODUCT_PREPARED_MUTATED'});
 });
 await assert.rejects(captured.assertCurrent(),{code:'PRODUCT_PREPARED_RELEASED'});
 assert.deepEqual(first.bytes(),bytes);
 for(const action of ['abort','auth','head','reset']){
  let x;const input=ownTestState(f);
  x=adapters({withPreparedSource:(args,consume)=>svgPreparation(args,async p=>{
   if(action==='abort')input.abort.abort();
   if(action==='auth')setLive({...live,userId:'user-b'});
   if(action==='head')setLive({...live,state:change(f,s=>s.content.app.name='edited same revision').state});
   if(action==='reset')await x.reset();
   return consume(p);
  })});
  await assert.rejects(x.engine.build(input));setLive({userId:'user-a',projectId:'project-persistent',state:f.state});await x.reset();
  assert.deepEqual(first.bytes(),bytes,'retained old head survives failed build');
 }
 first.release();await a.reset();noOwned();
});
test('persisted source receipt is mandatory, tampering/settings changes never invoke consumer/build',async()=>{
 const f=await rasterState(),cases=[
 ['PRODUCT_SOURCE_CONSENT_REQUIRED',s=>delete s.content.app.source.metadata.confirmationReceipt],
 ['PRODUCT_SOURCE_RECEIPT_STALE',s=>s.content.app.source.metadata.confirmationReceipt.sourceHash='0'.repeat(64)],
 ['PRODUCT_SOURCE_PREPARATION_HASH',s=>s.content.app.source.metadata.rasterPreparation.options.smooth=0]
 ];
 for(const [code,fn]of cases){
  const a=adapters(),bad=change(f,fn);await assert.rejects(a.engine.build(ownTestState(bad)),{code});await a.reset();noOwned();
 }
 const a=adapters(),changed=change(f,s=>{s.parameters.common.smooth.value=0;s.revision++;});
 await assert.rejects(a.engine.build(ownTestState(changed)),{code:'RASTER_SOURCE_CONVERSION_REQUIRED'});await a.reset();noOwned();
});
test('opaque accepted token releases after awaited product, wrong token/epoch and replay rejected',async()=>{
 const f=await rasterState();let token,saved;const a=adapters({withPreparedSource:(args,consume)=>rasterPreparation(args,async p=>{
  token=p.source;const out=await consume(p);saved=p;assert.ok(out.bytes().length>128);return out;
 })});
 const m=await a.engine.build(ownTestState(f));
 assert.ok(token.token&&!('acceptedHandle'in token)&&!('id'in token));
 const bad=adapters({withPreparedSource:async(_,consume)=>consume(saved)});
 await assert.rejects(bad.engine.build(ownTestState(f)),e=>['RASTER_LEASE_RETIRED','PRODUCT_CONTEXT_OWNER'].includes(e.code));
 m.release();await bad.reset();await a.reset();noOwned();
 for(const mutate of [p=>p.source.token='other-token',p=>p.source.epoch++]){
  const b=adapters({withPreparedSource:(args,consume)=>rasterPreparation(args,p=>{mutate(p);return consume(p);})});
  await assert.rejects(b.engine.build(ownTestState(f)));await b.reset();noOwned();
 }
});
test('late delivery head/ticket changes and source-proposal branch do not publish models',async()=>{
 const f=await svgState();
 for(const kind of ['head','ticket']){
  const input=ownTestState(f),a=adapters({withPreparedSource:(args,consume)=>svgPreparation(args,async source=>{
   const model=await consume(source);
   if(kind==='head')setLive({...live,state:change(f,s=>s.content.app.name='late edit').state});
   else input.ticket.id='changed-ticket';
   return model;
  })});
  await assert.rejects(a.engine.build(input),e=>['PRODUCT_HEAD_CHANGED','PRODUCT_TICKET_CHANGED'].includes(e.code));
  setLive({userId:'user-a',projectId:'project-persistent',state:f.state});await a.reset();noOwned();
 }
 const sourceProposal={status:'proposal',sourceProposal:{status:'proposal',changes:['Processing settings changed.']}};
 let received;
 const a=adapters({withPreparedSource:async()=>sourceProposal,onSourceProposal:p=>{received=p;return true;}});
 await assert.rejects(a.engine.build(ownTestState(f)),{code:'PRODUCT_SOURCE_PROPOSAL_REQUIRED'});
 assert.equal(received,sourceProposal);await a.reset();noOwned();
 const b=adapters({withPreparedSource:async()=>sourceProposal});
 await assert.rejects(b.engine.build(ownTestState(f)),{code:'PRODUCT_SOURCE_PROPOSAL_UNHANDLED'});await b.reset();noOwned();
});
test('pinned metadata reader rejects old or unknown component semantics',async()=>{
 const f=await svgState(),a=adapters(),model=await a.engine.build(ownTestState(f));
 try{
  const bytes=a.kernelLeases.get(model).root.metadata.semanticBytes.slice();
  for(const [offset,value,code]of[[148,2,'PRODUCT_MECHANICS_SEMANTICS'],[148,4,'PRODUCT_MECHANICS_SEMANTICS'],[152,1,'PRODUCT_SOURCE_SEMANTICS'],[152,3,'PRODUCT_SOURCE_SEMANTICS']]){
   const bad=bytes.slice();new DataView(bad.buffer).setUint32(offset,value,true);assert.throws(()=>readProductSemantics(bad),{code});
  }
 }finally{model.release();await a.reset();noOwned();}
});
test.after(()=>{
 fs.writeFileSync(path.join(evidence,'transport.json'),JSON.stringify(transportLog,null,2)+'\n');
 noOwned();
});
