import test from 'node:test';import assert from 'node:assert/strict';
import {planMaterialSourceIds,resolveMaterialSourceIds,materialSourceIdsFromState} from '../../src/integration/material-source-ledger.mjs';
import {createHash} from 'node:crypto';
import {canonicalJSON} from '../../src/storage/common.mjs';
const plan=ids=>planMaterialSourceIds({projectId:'p',materialIds:ids});
test('full ID ordinal allocation is deterministic independent of input order and repeated part IDs',()=>{
 const a=plan(['z','18446744073709551615','a','z']),b=plan(['a','z','18446744073709551615']);
 assert.deepEqual(a,b);assert.deepEqual(a.bindings.map(r=>r.materialId),['18446744073709551615','a','z']);
 assert.ok(a.requiresPersistence);assert.ok(Object.isFrozen(a.ledger.entries));
 const {digest,...body}=a.ledger;assert.equal(digest,createHash('sha256').update(canonicalJSON(body)).digest('hex'));
});
test('adding earlier-sorting IDs preserves old assignments and retired IDs through roundtrip',()=>{
 const first=plan(['m','z']),saved=JSON.parse(JSON.stringify(first.ledger));
 const next=planMaterialSourceIds({projectId:'p',materialIds:['a','m'],ledger:saved});
 assert.deepEqual(next.bindings,[{materialId:'a',materialSourceId:3},{materialId:'m',materialSourceId:1}]);
 assert.equal(next.ledger.entries.find(r=>r.materialId==='z').materialSourceId,2);
 const back=resolveMaterialSourceIds({projectId:'p',materialIds:['z'],ledger:next.ledger});assert.equal(back[0].materialSourceId,2);
 assert.deepEqual(saved,first.ledger);assert.equal(planMaterialSourceIds({projectId:'p',materialIds:['m'],ledger:saved}).requiresPersistence,false);
});
test('lookup refuses missing or uncommitted material allocations',()=>{
 assert.throws(()=>resolveMaterialSourceIds({projectId:'p',materialIds:['a']}),{code:'MATERIAL_SOURCE_LEDGER_MISSING'});
 assert.throws(()=>resolveMaterialSourceIds({projectId:'p',materialIds:['b'],ledger:plan(['a']).ledger}),{code:'MATERIAL_SOURCE_ALLOCATION_NOT_COMMITTED'});
});
test('duplicate/native collisions, wrong project/version/provenance, unknown keys reject without modifying source',()=>{
 for(const change of [l=>l.entries.push({...l.entries[0]}),l=>l.entries[1].materialSourceId=1,l=>l.projectId='other',l=>l.version='future/99',l=>l.provenance.identity='color',l=>l.extra=true,l=>l.nextId=99,l=>l.digest='a'.repeat(64),l=>l.entries[0].materialId='altered-full-id']){
  const ledger=structuredClone(plan(['a','b']).ledger);change(ledger);const before=structuredClone(ledger);
  assert.throws(()=>resolveMaterialSourceIds({projectId:'p',materialIds:['a'],ledger}));assert.deepEqual(ledger,before);
 }
});
test('bounded ledger does not prune/recycle identity to fit an oversized plan',()=>{
 const ids=Array.from({length:128},(_,i)=>'x'.repeat(199-String(i).length)+i);
 const first=plan(ids),saved=structuredClone(first.ledger);
 assert.throws(()=>planMaterialSourceIds({projectId:'p',materialIds:ids.map(s=>'y'+s.slice(1)),ledger:first.ledger}),{code:'MATERIAL_SOURCE_LEDGER_BUDGET'});assert.deepEqual(first.ledger,saved);
 assert.throws(()=>plan(['bad\u0000id']),{code:'MATERIAL_SOURCE_ID'});
 assert.throws(()=>plan(['e\u0301']),{code:'MATERIAL_SOURCE_ID'});
});
test('state resolver joins exact inspected source and full material IDs, never equal colors/order',()=>{
 const ledger=plan(['body','art']).ledger,h='a'.repeat(64),source={id:'s',revision:3,raw:{hash:h},metadata:{productBindings:{version:'arch-product-bindings/1',projectId:'p',sourceId:'s',sourceRevision:3,rawHash:h,adoptionProvenance:{materialSourceLedger:ledger}}}};
 const c={projectId:'p',headHash:h,state:{revision:6,content:{app:{source,materials:[{id:'body',color:'#ff0000',excluded:false},{id:'art',color:'#ff0000',excluded:false}]}}}};
 const i={head:{headHash:h,revision:'6'},source:{id:'s',revision:3,rawHash:h},exportDescriptor:{parts:[{materialId:'body'},{materialId:'art'}]}};
 assert.deepEqual(materialSourceIdsFromState(c,i).map(r=>r.materialSourceId),[1,2]);
 i.source.revision=2;assert.throws(()=>materialSourceIdsFromState(c,i),{code:'MATERIAL_SOURCE_BINDING'});
 i.source.revision=3;c.state.content.app.materials[1].id='renamed';assert.throws(()=>materialSourceIdsFromState(c,i),{code:'MATERIAL_SOURCE_BINDING'});
});
