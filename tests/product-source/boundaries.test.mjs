import test from 'node:test';import assert from 'node:assert/strict';
import {M,client,operation,svgState,svg,setLive,controlFor,noOwned,transportLog} from '../product-app/harness.mjs';
import {createProductSourceContexts,sourceGeometry} from '../../src/integration/product-source-contexts.mjs';
import {createProductAdapters,validateProductMaterialExtension} from '../../src/integration/product-adapters.mjs';
import {canonicalJSON} from '../../src/storage/common.mjs';
import {validateState} from '../../src/app/documents.mjs';
client.serviceCapabilities={geometryVersions:{mechanicsAbi:M._arch_mech_abi_version(),mechanicsSemantics:M._arch_mech_semantics_version(),sourceAbi:M._arch_source_abi_version(),sourceSemantics:M._arch_source_semantics_version(),datumExtension:M._arch_mech_source_datum_extension_version()}};
async function fixture(content=svg){
 const f=await svgState('keychain','noi',content),state=structuredClone(f.state),source=structuredClone(state.content.app.source);
 delete source.metadata.productBindings;state.content.app.source=null;state.content.app.materials=[];state.content.app.materialDefaults=[];state.sourceKind='none';state.revision--;
 let live={sessionKey:'test-session-1',state,userId:'user-a',projectId:'project-persistent'};setLive(live);
 const kernel={operation,ensureRuntime:async()=>client,kernelLeases:new WeakMap()};
 const bridge=createProductSourceContexts({frameTransport:'product-context-bundle/2',kernel,sources:{source:{ingest(){throw Error('Unit fixture has no ingest');}},raster:{prepareRecipe(){throw Error('SVG fixture');}}},context:()=>live});
 const product=createProductAdapters({operation,kernelLeases:kernel.kernelLeases,context:()=>live,withPreparedSource:bridge.withPreparedSource});
 const input=()=>({...controlFor(live.state),state:live.state,source,assets:f.assets,sourceContext:source.metadata.sourceContext,purpose:'source',operation:'import',materials:[],materialDefaults:[]});
 async function adopt(){const r=await bridge.prepareAdoption(input()),next=structuredClone(state);next.revision++;next.sourceKind='svg';next.content.app.source={...source,metadata:{...source.metadata,productBindings:r.productBindings}};
  next.content.app.materials=structuredClone(r.materials);next.content.app.materialDefaults=structuredClone(r.materialDefaults);live={...live,state:validateState(next)};setLive(live);return r;}
 return {state,source,assets:f.assets,bridge,product,input,adopt,get live(){return live;},set(v){live={sessionKey:'test-session-1',...v};setLive(v);}};
}
test('material extension is exact, bounded, preserves distinct same-color roles and adoption defaults',async()=>{
 const f=await fixture(),r=await f.adopt();assert.equal(r.materials.length,r.materialDefaults.length);
 const roles=Object.values(r.productBindings.roles),m=roles.map(id=>r.materials.find(m=>m.id===id));assert.equal(new Set(roles).size,9);
 for(const x of m)assert.ok(x.product.identityTuple.at(-1).startsWith('role:'));
 const value=m[0].product;assert.deepEqual(validateProductMaterialExtension(value),value);
 for(const bad of [{...value,token:'foreign'},{...value,identityTuple:['arch-product-identity/1','p','s','material-key','wrong']},{...value,origin:'printer-verified'},{...value,nativeRole:'fake'},{...value,active:1}])assert.throws(()=>validateProductMaterialExtension(bad));
 assert.throws(()=>validateProductMaterialExtension({...value,identityTuple:['arch-product-identity/1','x'.repeat(5000),'s','material-key','role:body']}));
 noOwned();
});
test('canonical hash ignores color and paint ordering but detects geometry and ambiguous authored IDs',async()=>{
 async function describe(svgText){
  const f=await fixture(svgText),c=controlFor(f.state),root=await operation(c,(a,g)=>a.build({kind:'svg',source:svgText,thicknessMm:.2,toleranceMm:.001},{generation:g}));
  try{return await sourceGeometry({bytes:root.bytes(),metadata:root.metadata,sourceHash:root.metadata.sourceHash,control:c});}finally{root.release();}
 }
 const first=await describe(svg),recolored=await describe(svg.replace('#e04444','#123456').replace('#3388ee','#112244'));
 assert.deepEqual(first.regions.map(r=>r.geometryHash),recolored.regions.map(r=>r.geometryHash));
 const elements=svg.match(/<path[^>]+\/>/g),swapped=await describe(svg.replace(elements[0]+elements[1],elements[1]+elements[0]));
 const byKey=x=>Object.fromEntries(x.regions.map(r=>[r.nativeKey,r.geometryHash]).sort(([a],[b])=>a.localeCompare(b)));
 assert.deepEqual(byKey(first),byKey(swapped));
 await assert.rejects(describe(svg.replace('id="right"','id="left"')),/SVG_InvalidReference/);
 const f=await fixture(),c=controlFor(f.state),root=await operation(c,(a,g)=>a.build({kind:'svg',source:svg,thicknessMm:.2,toleranceMm:.001},{generation:g}));
 try{const metadata=structuredClone(root.metadata);metadata.paints[1].sourceId=metadata.paints[0].sourceId;
  await assert.rejects(sourceGeometry({bytes:root.bytes(),metadata,sourceHash:metadata.sourceHash,control:c}),/PRODUCT_SOURCE_AUTHORED_KEY_AMBIGUOUS/);
 }finally{root.release();}
 const changed=await describe(svg.replace('M5 6H9V10H5Z','M5 6H10V10H5Z'));assert.notEqual(first.regions[0].geometryHash,changed.regions[0].geometryHash);
 noOwned();
});
test('adoption rejects malformed current source context, raw byte hash and incoming ticket mutation',async()=>{
 const f=await fixture(),i=f.input(),bad=structuredClone(i.source);bad.metadata.sourceContext.id='another';
 await assert.rejects(f.bridge.prepareAdoption({...i,source:bad}),/PRODUCT_SOURCE_CONTEXT/);
 const bytes=f.assets.get(f.source.raw.hash),copy=bytes.slice();bytes[0]^=1;
 await assert.rejects(f.bridge.prepareAdoption(f.input()),/PRODUCT_SOURCE_ASSET_HASH/);bytes.set(copy);
 const changing=f.input(),pending=f.bridge.prepareAdoption(changing);
 changing.ticket.id='mutated-after-async-call';
 await assert.rejects(pending,/PRODUCT_SOURCE_TICKET_CHANGED/);
 const c=f.input();c.signal=AbortSignal.abort();await assert.rejects(f.bridge.prepareAdoption(c),/CANCELLED/);noOwned();
});
test('production borrow enforces geometry hash, current head, strict runtime getters and retirement',async()=>{
 const f=await fixture();await f.adopt();
 const good=structuredClone(f.live),bad=structuredClone(good);
 bad.state.content.app.source.metadata.productBindings.regions[0].geometryHash='0'.repeat(64);f.set(bad);
 await assert.rejects(f.product.engine.build({...controlFor(bad.state),state:bad.state,assets:f.assets}),/PRODUCT_SOURCE_GEOMETRY_REBIND_REQUIRED/);noOwned();
 f.set(good);const versions=client.serviceCapabilities.geometryVersions;
 for(const patch of [{mechanicsSemantics:2},{sourceSemantics:1},{datumExtension:0}]){
  client.serviceCapabilities.geometryVersions={...versions,...patch};
  await assert.rejects(f.product.engine.build({...controlFor(good.state),state:good.state,assets:f.assets}),/PRODUCT_SOURCE_RUNTIME_VERSIONS/);
 }client.serviceCapabilities.geometryVersions=versions;
 const model=await f.product.engine.build({...controlFor(good.state),state:good.state,assets:f.assets});
 const before=canonicalJSON(model.product),first=Array.from(model.bytes().slice(0,256));
 await f.bridge.reset();assert.deepEqual(Array.from(model.bytes().slice(0,256)),first);assert.equal(canonicalJSON(model.product),before);model.release();noOwned();
});

test('a cancelled consumer or changed current head releases borrowed canonical roots and any late model',async()=>{
 const f=await fixture();await f.adopt();const original=structuredClone(f.live),c=controlFor(original.state);
 let borrowed,lateReleased=0;
 const request={control:c,state:original.state,source:original.state.content.app.source,assets:f.assets,
  bindings:original.state.content.app.source.metadata.productBindings,domainRecord:{records:[]}};
 await assert.rejects(f.bridge.withPreparedSource(request,async prepared=>{
  borrowed=prepared;assert.ok(client.roots.size>0);prepared.assertOwned();
  c.abort.abort();return {release(){lateReleased++;}};
 }),/CANCELLED/);
 assert.equal(lateReleased,1);noOwned();assert.throws(()=>borrowed.assertOwned());
 const second=controlFor(original.state);await assert.rejects(f.bridge.withPreparedSource({...request,control:second},async prepared=>{
  const changed=structuredClone(original);changed.state.revision++;f.set(changed);return {release(){lateReleased++;}};
 }),/PRODUCT_SOURCE_HEAD_CHANGED/);
 assert.equal(lateReleased,2);noOwned();f.set(original);
});
