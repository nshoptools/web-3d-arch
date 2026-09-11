import test from 'node:test';
import assert from 'node:assert/strict';
import * as domain from '../../src/domain/index.mjs';
import {appContent} from '../../src/app/documents.mjs';
import {prepareBindings} from '../../src/integration/product-adapters.mjs';

// Synthetic checked-parser records exercise adoption, without a kernel or
// font dependency. Geometry hashes here identify two distinct fixture regions.
function input(sourceId,projectId='source-bridge-project',mono=false,reverse=false){
 const rawHash='a'.repeat(64),state=domain.createProject({product:'keychain',content:{app:appContent('Material slot reproducibility')}});
 const source={id:sourceId,revision:0,kind:'svg',name:'slots.svg',mediaType:'image/svg+xml',raw:{hash:rawHash,byteLength:1},assetHashes:[rawHash],
  metadata:{sourceContext:{version:'arch-source-context/1',operation:'import',id:sourceId,revision:0,predecessor:null}}};
 const regions=mono?[{nativeKey:'mono',sourceIndex:0,authoredKey:'mono',geometryHash:'b'.repeat(64),rgba:0x000000ff}]:[
  {nativeKey:'west',sourceIndex:0,authoredKey:'west',geometryHash:'b'.repeat(64),rgba:0xe04444ff},
  {nativeKey:'east',sourceIndex:1,authoredKey:'east',geometryHash:'c'.repeat(64),rgba:0x3388eeff}];
 if(reverse)regions.reverse();
 return {projectId,state,source,canonicalContexts:[{key:'art',sourceHash:rawHash,derivationHash:null,regions}]};
}
function mapping(result){return Object.fromEntries(result.materials.filter(m=>m.product.active).map(m=>[m.product.sourceKey??m.product.nativeRole,{color:m.color,slot:m.slot}]).sort(([a],[b])=>a<b?-1:a>b?1:0));}
function committed(request,result){
 const state=structuredClone(request.state);state.revision++;
 state.content.app.source=structuredClone(result.source);state.sourceKind='svg';
 state.content.app.materials=structuredClone(result.materials);state.content.app.materialDefaults=structuredClone(result.materialDefaults);
 return {...request,state,source:state.content.app.source};
}

test('initial slots ignore project/source UUID and region order for mono and multicolor sources',async()=>{
 for(const mono of [false,true]){
  let expected;const identities=new Set();
  for(const projectId of ['source-bridge-project','another-project'])for(let n=1;n<=8;n++)for(const reverse of [false,true]){
   const request=input('00000000-0000-4000-8000-'+String(n).padStart(12,'0'),projectId,mono,reverse),before=JSON.stringify(request);
   const result=await prepareBindings(request);assert.equal(result.status,'ready');assert.equal(JSON.stringify(request),before);
   expected??=mapping(result);assert.deepEqual(mapping(result),expected,{projectId,n,mono,reverse});
   identities.add(result.productBindings.regions[0].materialId);
  }
  assert.ok(identities.size>=16,'stable slots must not collapse durable identities');
 }
});

test('default slot policy has a fixed ascending color order',async()=>{
 const result=await prepareBindings(input('00000000-0000-4000-8000-000000000001'));
 assert.deepEqual(Object.fromEntries(result.materials.map(m=>[m.color,m.slot])),{'#30353b':1,'#3388ee':2,'#e04444':3,'#ffffff':4});
 assert.equal(result.productBindings.adoptionProvenance.slotAllocation,'rgba-ascending-lowest-compatible-v1');
});

test('adoption preserves existing automatic slots and explicit user choices',async()=>{
 const request=input('preserved-source'),first=await prepareBindings(request),next=committed(request,first);
 for(const m of next.state.content.app.materials)m.slot+=4;
 const west=next.state.content.app.materials.find(m=>m.product.sourceKey==='authored:art:west');west.slot=15;west.overridden=true;
 const before=next.state.content.app.materials.map(m=>({id:m.id,slot:m.slot,overridden:m.overridden}));
 const result=await prepareBindings(next);assert.equal(result.status,'ready');
 assert.deepEqual(result.materials.map(m=>({id:m.id,slot:m.slot,overridden:m.overridden})),before);
 assert.equal(result.changes.some(c=>c.kind==='initialize-slot'),false);
});

test('a missing automatic slot uses the lowest existing compatible slot',async()=>{
 const request=input('compatible-slots'),first=await prepareBindings(request),next=committed(request,first);
 for(const m of next.state.content.app.materials)if(m.color==='#30353b')m.slot=5;
 const body=next.state.content.app.materials.find(m=>m.product.nativeRole==='body');body.slot=9;body.overridden=true;
 const stem=next.state.content.app.materials.find(m=>m.product.nativeRole==='stem');stem.slot=null;
 const result=await prepareBindings(next);assert.equal(result.status,'ready');
 assert.equal(result.materials.find(m=>m.id===stem.id).slot,5);
 assert.equal(result.materials.find(m=>m.id===body.id).slot,9);
});

// A colour edit marks `overridden` even though the person never named a slot number, so
// `overridden` cannot gate slot allocation. These lock the two halves apart, and lock the
// fallback that keeps a slot chosen before the flag existed.
const artwork=result=>result.materials.find(m=>m.product?.sourceKey==='authored:art:west');
const blocked=result=>result.diagnostics.some(d=>d.code==='PRODUCT_USER_SLOT_UNRESOLVED');

test('a colour edit leaves the slot allocatable; naming a slot claims it',async()=>{
 const request=input('slot-intent'),first=await prepareBindings(request),next=committed(request,first);
 const west=next.state.content.app.materials.find(m=>m.product.sourceKey==='authored:art:west');
 Object.assign(west,{overridden:true,slotOverridden:false,slot:null});
 const afterColour=await prepareBindings(next);
 assert.equal(afterColour.status,'ready');
 assert.equal(blocked(afterColour),false,'a colour edit must not look like a chosen slot');
 assert.notEqual(artwork(afterColour).slot,null,'the slot is allocated again');

 Object.assign(west,{overridden:true,slotOverridden:true,slot:null});
 const afterChoice=await prepareBindings(next);
 assert.ok(blocked(afterChoice),'a slot the person cleared themselves stays unresolved');
});

test('a document written before slot intent existed keeps the wider meaning',async()=>{
 const request=input('slot-intent-legacy'),first=await prepareBindings(request),next=committed(request,first);
 const west=next.state.content.app.materials.find(m=>m.product.sourceKey==='authored:art:west');
 Object.assign(west,{overridden:true,slot:null});delete west.slotOverridden;
 assert.ok(blocked(await prepareBindings(next)),'no flag on disk falls back to overridden');
});
