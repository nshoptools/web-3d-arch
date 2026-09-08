import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {M,client,ops,noOwned} from '../product-app/harness.mjs';
import {readProductSemantics} from '../../src/core/product-operations.mjs';
import {inspectCapturedProduct} from './capture-oracle.mjs';
const run=process.env.PROJECT_REVIEW_RUN;
test('frozen real source requests: native and root WASM datum/lineage parity and independent captured mesh oracle',{timeout:240000},async()=>{
 let generation=0;const rows=[];
 const cases=path.join(run,'evidence/native-cases'),results=path.join(run,'evidence/native-results');
 for(const file of fs.readdirSync(cases).filter(x=>x.endsWith('.json')).sort()){
  const name=file.slice(0,-5),input=JSON.parse(fs.readFileSync(path.join(cases,file))),leases=[];
  let result=0,proposal=null;
  try{
   for(const c of input.contexts)leases.push(await client.build({kind:'svg',source:c.svg,thicknessMm:c.thicknessMm,longEdgeMm:c.longEdgeMm,toleranceMm:c.toleranceMm},{generation:++generation}));
   assert.equal(M._arch_control_reset(++generation),1);
   const wire=Uint8Array.from(input.wire),request=ops.prepare({kind:'product',packed:wire,source:{kind:'contexts',contexts:leases.map((l,i)=>({id:l.id,generation:l.generation,sourceHash:input.contexts[i].sourceHash,translationNm:input.contexts[i].translationNm}))}},generation);
   const probing=new DataView(wire.buffer).getUint32(60,true)===1;
   if(probing)proposal=ops.probeRequest(request,generation);else result=ops.buildRequest(request,generation);
   const sem=readProductSemantics(probing?proposal.semanticBytes:ops.metadata(result).semanticBytes);
   const native=readProductSemantics(new Uint8Array(fs.readFileSync(path.join(results,name+'.apms'))));
   for(const field of ['mechanicsSemantics','sourceSemantics','datumProbeVersion','sourceVerdict','mechanicsVerdict','exportBlocked','sourceIntervals','inputTexts','inputRegions','parameters','sourceTransform','provenance'])assert.deepEqual(sem[field],native[field],name+':'+field);
   let nativeOracle=null,wasmOracle=null;
   if(!probing){
    const arch=new Uint8Array(M.HEAPU8.subarray(M._arch_snapshot_ptr(result),M._arch_snapshot_ptr(result)+M._arch_snapshot_len(result)));
    nativeOracle=inspectCapturedProduct(new Uint8Array(fs.readFileSync(path.join(results,name+'.arch'))),native,'native-'+name);
    wasmOracle=inspectCapturedProduct(arch,sem,'wasm-'+name);
    assert.equal(sem.parts.length,native.parts.length);
   }
   rows.push({case:name,probe:probing,nativeOracle,wasmOracle,faceParity:true});
  }finally{if(result)M._arch_snapshot_release(result);if(proposal)ops.releaseProposal(proposal.id);for(const l of leases)l.release();}
  noOwned();
 }
 assert.ok(rows.length>=40);fs.writeFileSync(path.join(run,'evidence/native-wasm-parity.json'),JSON.stringify(rows));console.log(JSON.stringify({cases:rows.length,models:rows.filter(r=>!r.probe).length}));
});
