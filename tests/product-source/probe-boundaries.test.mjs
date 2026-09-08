import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {M,client,ops,noOwned} from '../product-app/harness.mjs';
import {readProductSemantics} from '../../src/core/product-operations.mjs';
import {manufacturingTextSVG} from '../../src/integration/product-source-contexts.mjs';
const run=process.env.PROJECT_REVIEW_RUN;let generation=0;
async function prepare(mode='probe'){
 const input=JSON.parse(fs.readFileSync(path.join(run,'evidence/native-cases/001.json'))),leases=[];
 try{
  for(const c of input.contexts)leases.push(await client.build({kind:'svg',source:c.svg,thicknessMm:c.thicknessMm,longEdgeMm:c.longEdgeMm,toleranceMm:c.toleranceMm},{generation:++generation}));
  const wire=Uint8Array.from(input.wire),d=new DataView(wire.buffer);
  if(mode==='nonzero'){
   const textAt=256+d.getUint32(16,true)*40+d.getUint32(20,true)*24+d.getUint32(24,true)*112;
   assert.equal(d.getUint32(textAt+44,true),5);d.setFloat64(textAt+64,1,true);
  }
  assert.equal(M._arch_control_reset(++generation),1);
  const request=ops.prepare({kind:'product',packed:wire,source:{kind:'contexts',contexts:leases.map((l,i)=>({id:l.id,generation:l.generation,sourceHash:input.contexts[i].sourceHash,translationNm:input.contexts[i].translationNm}))}},generation);
  return {request,release:()=>leases.forEach(l=>l.release())};
 }catch(e){for(const l of leases)l.release();throw e;}
}
test('query packets cannot ordinary-build; nonzero nominal query is rejected; cancel consumes request without a model',async()=>{
 for(const mode of ['normal','nonzero','cancel']){
  const r=await prepare(mode);let p;
  try{
   if(mode==='normal')assert.throws(()=>ops.buildRequest(r.request,generation),{code:'PRODUCT_REQUEST_FLAGS'});
   if(mode==='nonzero'){
    p=ops.probeRequest(r.request,generation);const s=readProductSemantics(p.semanticBytes);
    assert.equal(s.sourceVerdict,1);assert.ok(s.sourceDiagnostics.some(d=>d.message==='DATUM_PROBE_REQUIRES_ZERO_VALUE'));
    assert.equal(s.parts.length,0);assert.equal(s.exportBlocked,true);
   }
   if(mode==='cancel'){
    Atomics.store(M.HEAPU32,(M._arch_control_ptr()>>>2)+3,generation);
    assert.throws(()=>ops.probeRequest(r.request,generation),{code:'CANCELLED'});
   }
   assert.equal(ops.releaseRequest(r.request),0);
  }finally{if(p)ops.releaseProposal(p.id);r.release();}noOwned();
 }
});
test('negative frame rounds persisted decimal ties exactly and keeps original path bytes',async()=>{
 const pathBody='<path d="M0 0L1 0L1 1Z"/>';
 for(const [x,n]of [[-0.0000005,'0'],[-0.0000015,'-2'],[-0.0000025,'-2'],[-1.0000005,'-1000000']]){
  const svg=new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="1mm" height="1mm" viewBox="'+x+' -2 1 1">'+pathBody+'</svg>');
  const r=await manufacturingTextSVG(svg,{status:'ready',parserViewportToSourceMm:[1,0,0,-1,x,2]},{overlay:true});
  assert.equal(r.descriptor.translationNm[0],n);assert.equal(r.descriptor.canonicalTranslationErrorBoundMm,0);
  assert.ok(new TextDecoder().decode(r.bytes).includes(pathBody));
 }
});
