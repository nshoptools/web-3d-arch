import {loadExportModule} from './export-module.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {serviceTransport,setup} from './export-fixture.mjs';
import {productSetup} from './export-product-fixture.mjs';
import {installFloatRuntime,floatCorrespondenceOracle} from './export-float-runtime-fixture.mjs';
import {stlOracle,near} from './export-oracles.mjs';
import {sha256} from '../../src/printing/src/contracts.mjs';
const run=process.env.PROJECT_REVIEW_RUN,M=await loadExportModule(),T=serviceTransport(M);
const proof=({identity})=>({version:'arch-final-mesh-evidence/1',key:'explicit-test-routing-proof',identity,scope:'final-manufacturing-scene',verdict:'pass',oracle:{id:'test-routing-only',version:'1',reportSha256:'f'.repeat(64)},provenance:{testDouble:true,notProductionQualification:true}});
const out=path.join(run,'evidence/export-float-runtime');await fs.mkdir(out,{recursive:true});
const rejects=(fn,code)=>assert.rejects(fn,e=>{assert.equal(e.code,code,e.stack);return true;});
async function fixture(fn,options={}){
 const rt=installFloatRuntime(T),h=await productSetup(T,{product:'clicky',proof,...options});
 try{const e=await h.binding.prepare(h.model);assert.equal(e.status,'ready',JSON.stringify(e));h.exportOptions['stl-union'].inspection=false;await fn(h,rt);}
 finally{h.close();assert.ok(rt.retired());rt.restore();assert.deepEqual(T.stats(),{liveTestRoots:0,releasedPointersRetired:true});}
}
for(const pose of [{kind:'manufacturing',restOnBed:false},{kind:'pattern-down-x',restOnBed:true},{kind:'isometry',restOnBed:true,matrix:[-1,0,0,0,0,1,0,0,0,0,1,0]}])test(`FLOAT actual root helper: default clicky ${pose.kind} prepares without bytes, exact confirmation preserves source and validates serialized geometry`,()=>fixture(async(h,rt)=>{
 h.exportOptions['stl-union'].pose=pose;const input=h.input('stl-union'),before=await sha256(h.root.bytes().slice()),p=await h.exporter.export(input);
 assert.equal(p.status,'prepared-proposal');assert.equal(rt.calls.confirm,0);assert.equal('bytes'in p,false);
 const native=rt.leases.at(-1),oracle=floatCorrespondenceOracle(native);assert.ok(oracle.pairs>0);assert.ok(oracle.maximumDisplacementMm<=.00001);
 // Fresh views continue to work after shared memory growth; adapter stores none.
 if(pose.kind==='manufacturing'){const size=M.HEAPU8.length,allocation=M._malloc(size);assert.ok(allocation);try{assert.ok(M.HEAPU8.length>size);assert.deepEqual(floatCorrespondenceOracle(native),oracle);}finally{M._free(allocation);}}
 const a=await p.confirm(input),mesh=stlOracle(a.bytes);assert.deepEqual(mesh.bbox,oracle.bounds);assert.equal(mesh.triangles,oracle.candidateTriangles);
 near(mesh.volume,native.metadata.conditioning.candidateVolumeMm3,1e-7);if(pose.restOnBed)assert.equal(mesh.bbox[2],0);
 assert.equal(await sha256(h.root.bytes().slice()),before);assert.equal(a.metadata.qualification.mesh,'unverified');assert.equal(a.metadata.qualification.sourceMesh,'pass');
 assert.equal(a.metadata.conditioning.confirmation.proposalHash,p.proposalHash);p.release();assert.equal(rt.calls.release,1);
 await fs.writeFile(path.join(out,pose.kind+'.stl'),a.bytes);await fs.writeFile(path.join(out,pose.kind+'.json'),JSON.stringify({oracle,mesh,metadata:a.metadata},null,2)+'\n');
}));

test('FLOAT actual root helper: ordinary inspection remains fail-closed and never prepares',()=>fixture(async(h,rt)=>{
 h.exportOptions['stl-union'].inspection=true;const before=await sha256(h.root.bytes().slice());await rejects(()=>h.exporter.export(h.input('stl-union')),'STL_FLOAT_COLLISION');assert.equal(rt.calls.prepare,0);assert.equal(await sha256(h.root.bytes().slice()),before);
}));

test('FLOAT actual root helper: a smaller user error budget preserves the earlier STL_FLOAT_ERROR rejection without preparing',()=>fixture(async(h,rt)=>{
 h.exportOptions['stl-union'].errorMm=.000001;const before=await sha256(h.root.bytes().slice());await assert.rejects(()=>h.exporter.export(h.input('stl-union')),e=>e.code==='INVALID_SERIALIZATION'&&e.message==='INVALID_SERIALIZATION:STL_FLOAT_ERROR');assert.equal(rt.calls.prepare,0);assert.equal(rt.leases.length,0);assert.equal(await sha256(h.root.bytes().slice()),before);
}));

test('FLOAT actual root helper: generation cancellation during prepare leaves no proposal or output',()=>fixture(async(h,rt)=>{
 const before=await sha256(h.root.bytes().slice());T.before.floatPrepare=(_r,_o,_p,g)=>Atomics.store(M.HEAPU32,M._arch_control_ptr()/4+3,g);
 await rejects(()=>h.exporter.export(h.input('stl-union')),'CANCELLED');assert.equal(rt.leases.length,0);assert.equal(await sha256(h.root.bytes().slice()),before);
}));

test('FLOAT actual root helper: native confirm cancellation retires proposal and keeps primary source',()=>fixture(async(h,rt)=>{
 const input=h.input('stl-union'),before=await sha256(h.root.bytes().slice()),p=await h.exporter.export(input);
 T.before.floatConfirm=(_p,_c,g)=>Atomics.store(M.HEAPU32,M._arch_control_ptr()/4+3,g);
 await rejects(()=>p.confirm(input),'CANCELLED');assert.equal(rt.calls.release,1);assert.equal(await sha256(h.root.bytes().slice()),before);
}));

test('FLOAT actual root helper: real APMS assembly gate blocks before prepare even with injected pass evidence',()=>fixture(async(h,rt)=>{
 // Switch a real product metadata flag only within this owned test snapshot copy.
 const before=await sha256(h.root.bytes().slice());new DataView(h.root.metadata.semanticBytes.buffer,h.root.metadata.semanticBytes.byteOffset).setUint32(24,1,true);
 await rejects(()=>h.exporter.export(h.input('stl-union')),'PRODUCT_EXPORT_BLOCKED');assert.equal(rt.calls.prepare,0);assert.equal(await sha256(h.root.bytes().slice()),before);
}));
