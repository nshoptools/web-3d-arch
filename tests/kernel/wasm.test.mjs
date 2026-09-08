import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {readSnapshot,inspectMesh} from '../oracles/mesh-oracle.mjs';

const modulePath=process.env.ARCH_WASM_MODULE;
const run=process.env.PROJECT_REVIEW_RUN;
if(!modulePath||!run)throw new Error('Set ARCH_WASM_MODULE and project environment.');
const createModule=(await import(pathToFileURL(modulePath).href)).default;
const module=await createModule();
const error=()=>new TextDecoder().decode(module.HEAPU8.subarray(module._arch_error_ptr(),module._arch_error_ptr()+module._arch_error_len()));
const view=id=>new Uint8Array(module.HEAPU8.buffer,module._arch_snapshot_ptr(id),module._arch_snapshot_len(id));
const canonical=s=>s.faces.map(f=>{
  const p=f.map(i=>s.vertices[i].map(v=>Math.round(v*1e8)/1e8).join(','));
  return [p.join('|'),[p[1],p[2],p[0]].join('|'),[p[2],p[0],p[1]].join('|')].sort()[0];
}).sort();
const evidence=path.join(run,'evidence','wasm-oracle');await mkdir(evidence,{recursive:true});

test('Rust+C++ uses one Emscripten shared memory module, matching native canonical geometry',async()=>{
  assert.equal(module._arch_abi_version(),2);
  assert.ok(module.HEAPU8.buffer instanceof SharedArrayBuffer);
  const reports=[];
  for(const [index,name] of ['hole','seam','t-junction','overlap'].entries()){
    module._arch_control_reset(index+10);
    const id=module._arch_test_fixture(index,index+10);assert.ok(id>0,error());
    const snapshot=readSnapshot(view(id));assert.equal(snapshot.generation,index+10);
    const native=readSnapshot(await readFile(path.join(run,'evidence','native-oracle',`${name}.arch`)));
    assert.deepEqual(canonical(snapshot),canonical(native));
    const results=snapshot.parts.map(p=>inspectMesh({vertices:snapshot.vertices,faces:snapshot.faces.slice(p.faceStart,p.faceStart+p.faceCount)}));
    reports.push({name,results});
    await writeFile(path.join(evidence,`${name}.arch`),view(id));
    assert.equal(module._arch_snapshot_release(id),1);assert.equal(module._arch_snapshot_ptr(id),0);
  }
  await writeFile(path.join(evidence,'summary.json'),JSON.stringify({shared:true,reports,scope:'Node engine; browser Worker tests required separately'},null,2));
});

test('snapshot leases keep old generation immutable; cancel does not publish or destroy it',()=>{
  module._arch_control_reset(100);
  const first=module._arch_test_fixture(0,100);assert.ok(first>0,error());
  const before=Buffer.from(view(first));
  assert.ok(module._arch_snapshot_acquire(first)>0);
  module._arch_control_reset(101);
  const second=module._arch_test_fixture(1,101);assert.ok(second>0,error());
  assert.deepEqual(Buffer.from(view(first)),before);
  assert.equal(module._arch_snapshot_release(first),1);assert.ok(module._arch_snapshot_ptr(first)>0,'pinned reader remains');
  module._arch_control_reset(102);
  const control=new Int32Array(module.HEAPU8.buffer,module._arch_control_ptr(),4);
  Atomics.store(control,3,102);
  assert.equal(module._arch_test_fixture(2,102),0);assert.equal(error(),'CANCELLED');assert.equal(Atomics.load(control,1),4);
  assert.deepEqual(Buffer.from(view(first)),before);assert.equal(readSnapshot(view(second)).generation,101);
  assert.equal(module._arch_snapshot_release(first),1);assert.equal(module._arch_snapshot_ptr(first),0);
  assert.equal(module._arch_snapshot_release(first),0,'duplicate release rejected');
  assert.equal(module._arch_snapshot_release(second),1);
});

test('published handle transfers one lease; 24 acquire/read/release cycles do not exhaust eight snapshots',()=>{
  for(let generation=200;generation<224;generation++){
    assert.equal(module._arch_control_reset(generation),1);
    const id=module._arch_test_fixture(0,generation);assert.ok(id>0,error());
    // Creation transfers the producer's first lease. Acquire is only for a
    // second reader, which owns a separately balanced release.
    assert.ok(module._arch_snapshot_acquire(id)>0);
    assert.equal(readSnapshot(view(id)).generation,generation);
    assert.equal(module._arch_snapshot_release(id),1);
    assert.ok(module._arch_snapshot_ptr(id)>0);
    assert.equal(module._arch_snapshot_release(id),1);
    assert.equal(module._arch_snapshot_ptr(id),0);
  }
});
