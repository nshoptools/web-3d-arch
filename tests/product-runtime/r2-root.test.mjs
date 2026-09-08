import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {source,makeRequest} from './fixtures.mjs';
import {createProductOperations,readProductSemantics} from '../../src/core/product-operations.mjs';
import {readSnapshot,inspectMesh,verticalIntersections} from '../oracles/mesh-oracle.mjs';
import {run,modulePath} from './environment.mjs';
const out=path.join(run,'evidence/r2-root');fs.mkdirSync(out,{recursive:true});
const M=await (await import(pathToFileURL(modulePath))).default({print:()=>{},printErr:()=>{}}),ops=createProductOperations(M);
const hash=b=>createHash('sha256').update(b).digest('hex'),sourceHash=hash(source);let generation=0;
const recipe=(product,{artMode='noi',...options}={})=>({kind:'product',source:{kind:'svg',source},packed:makeRequest(product,artMode,{sourceHash,headHash:hash(JSON.stringify({product,options,artMode})),...options}).packed});
const build=r=>{const g=++generation;assert.equal(M._arch_control_reset(g),1);return ops.buildRequest(ops.prepare(r,g),g);};
const snapshot=id=>new Uint8Array(M.HEAPU8.subarray(M._arch_snapshot_ptr(id),M._arch_snapshot_ptr(id)+M._arch_snapshot_len(id)));
const mm=mm=>({heightMode:'mm',mm}),layer=(layers,referenceLayer,featureId)=>({heightMode:'layers',layers,referenceLayer,datum:featureId?{kind:'feature',featureId}:{kind:'bed'}});
function rejected(r,diagnostic){
  const before=r.packed.slice();let error;
  try{const id=build(r);M._arch_snapshot_release(id);assert.fail('Invalid input published');}catch(e){error=e;}
  assert.equal(error.code,'PRODUCT_BLOCKED');assert.ok(error.proposal?.id,'Typed failure metadata owner');
  try{assert.equal(M._arch_snapshot_ptr(error.proposal.id),0);const sem=readProductSemantics(error.proposal.semanticBytes);
    const diagnostics=[...sem.diagnostics,...sem.sourceDiagnostics];
    assert.ok(diagnostics.some(d=>d.message.includes(diagnostic)),JSON.stringify(diagnostics));assert.deepEqual(r.packed,before);return sem;
  }finally{ops.releaseProposal(error.proposal.id);}
}
test('R2 root getters and strict metadata carry both geometry semantic versions',()=>{
  assert.equal(M._arch_abi_version(),2);assert.equal(M._arch_mech_abi_version(),2);assert.equal(M._arch_mech_semantics_version(),3);
  assert.equal(M._arch_source_abi_version(),1);assert.equal(M._arch_source_semantics_version(),2);assert.equal(M._arch_mech_source_datum_extension_version(),1);assert.equal(M._arch_final_export_version(),1);
  const id=build(recipe('keychain'));
  try{const b=ops.metadata(id).semanticBytes,m=readProductSemantics(b);assert.equal(m.mechanicsSemantics,3);assert.equal(m.sourceSemantics,2);
    const old=b.slice();new DataView(old.buffer).setUint32(152,1,true);assert.throws(()=>readProductSemantics(old),e=>e.code==='PRODUCT_SOURCE_SEMANTICS');
  }finally{M._arch_snapshot_release(id);}
});
test('CDX-MECH-R2-001 root product rejects missing final strap roof, retains old snapshot',()=>{
  const old=build(recipe('keychain')),before=hash(snapshot(old)),bytes=M._arch_raster_owned_bytes();const records=[];
  try{for(const strapCham of [0,.6]){
    // Flush artwork plus merged coplanar tops isolates the final roof guard:
    // separate raised/recessed rims can fail the bevel-width check earlier.
    const values={size:40,baseH:mm(6),strapZ:3,strapD:4,strapCham,topBevel:true,bevelGop:true,topBevelShape:'vat',topBevelR:2};
    const r=recipe('strap',{artMode:'phang',changes:Object.entries(values).map(([id,value])=>({id,value}))});
    const sem=rejected(r,'FINAL_STRAP_ROOF');assert.equal(hash(snapshot(old)),before);assert.equal(M._arch_raster_owned_bytes(),bytes);
    records.push({strapCham,diagnostics:sem.diagnostics,parts:sem.parts.length,exportBlocked:sem.exportBlocked});
  }
  const good=build(recipe('strap',{artMode:'phang',changes:Object.entries({size:40,baseH:mm(6),strapZ:3,strapD:4,strapCham:0,topBevel:true,bevelGop:true,topBevelShape:'vat',topBevelR:.6}).map(([id,value])=>({id,value}))}));
  try{const b=snapshot(good),s=readSnapshot(b);s.parts.forEach(p=>inspectMesh({vertices:s.vertices,faces:s.faces.slice(p.faceStart,p.faceStart+p.faceCount)}));fs.writeFileSync(path.join(out,'valid-strap.arch'),b);}finally{M._arch_snapshot_release(good);}
  fs.writeFileSync(path.join(out,'strap.json'),JSON.stringify(records,null,2));
  }finally{M._arch_snapshot_release(old);}
});
test('CDX-MECH-R2-002 root validates actual source face and first-layer schedule',()=>{
  const records=[];
  for(const firstLayerHeight of [.16,.25]){
    const base={schedule:{firstLayerHeight,layerHeight:.2},changes:[{id:'baseH',value:layer(12,0)},{id:'artH',value:layer(4,0,'source:art.bottom')}]};
    rejected(recipe('keychain',base),'SOURCE_REFERENCE_LAYER_DOES_NOT_MEET_FACE');
    const good=structuredClone(base);good.changes[1].value.referenceLayer=12;
    const id=build(recipe('keychain',good));
    try{const b=snapshot(id),s=readSnapshot(b),sem=readProductSemantics(ops.metadata(id).semanticBytes),lo=firstLayerHeight+11*.2,hi=lo+.8;
      const intervals=sem.sourceIntervals.filter(i=>i.fieldId===27);assert.ok(intervals.length);for(const i of intervals){assert.equal(i.referenceLayer,12);assert.equal(i.coordinateFrame,'manufacturing-z');assert.ok(Math.abs(i.z0-lo)<1e-12);assert.ok(Math.abs(i.z1-hi)<1e-12);}
      const art=sem.parts.filter(p=>p.role===1);assert.ok(art.length);
      for(const p of art){const part=s.parts[p.meshPart],mesh={vertices:s.vertices,faces:s.faces.slice(part.faceStart,part.faceStart+part.faceCount)};inspectMesh(mesh);
        const z=mesh.faces.flatMap(f=>f.map(i=>mesh.vertices[i][2]));assert.ok(Math.abs(Math.min(...z)-lo)<1e-12);assert.ok(Math.abs(Math.max(...z)-hi)<1e-12);}
      fs.writeFileSync(path.join(out,'source-h0-'+firstLayerHeight+'.arch'),b);records.push({firstLayerHeight,lo,hi,intervals});
    }finally{M._arch_snapshot_release(id);}
  }
  const legacy=build(recipe('keychain',{schedule:{firstLayerHeight:.16,layerHeight:.2},changes:[{id:'baseH',value:mm(2.4)},{id:'artH',value:mm(1.7)}]}));
  try{const m=readProductSemantics(ops.metadata(legacy).semanticBytes),a=m.sourceIntervals.filter(i=>i.fieldId===27);assert.ok(a.length);
    a.forEach(i=>{assert.equal(i.conversionAvailable,false);assert.equal(i.referenceLayer,null);assert.equal(i.z0,2.4);assert.ok(Math.abs(i.z1-4.1)<1e-12);});assert.equal(m.sourceProposals.length,0);assert.ok(m.sourceDiagnostics.some(d=>d.code===109));
    assert.ok(m.parameters.find(p=>p.field==='artH').mode===1);records.push({legacyUnspecifiedMM:true,intervals:a});
  }finally{M._arch_snapshot_release(legacy);}
  assert.equal(M._arch_raster_owned_bytes(),0);fs.writeFileSync(path.join(out,'source-faces.json'),JSON.stringify(records,null,2));
});
