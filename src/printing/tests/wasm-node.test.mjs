import {zipSync} from 'fflate';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {export3MFCore,export3MFProject} from '../src/exporter.mjs';
import {inspect3MF,readZip} from '../src/zip-inspect.mjs';
import {sha256} from '../src/contracts.mjs';
import {fixtureProfile} from './profile-fixtures.mjs';
import {request} from './analytic-fixtures.mjs';
const run=process.env.PROJECT_REVIEW_RUN,repo=process.env.PROJECT_ROOT;
const binary=process.env.ARCH_PRINTING_TEST_MODULE??join(run,'work/build-printing-wasm-cross/arch3mf.mjs');
const factory=(await import(pathToFileURL(binary))).default;
const module=await factory({wasmBinary:await readFile(binary.replace(/\.mjs$/,'.wasm'))});
await mkdir(join(run,'evidence/wasm'),{recursive:true});
test('AT-013.2 native C ABI built to WASM exports analytic cube, shared face, hole through lib3mf',async()=>{
 for(const kind of ['bambu','u1']){
  const profile=await fixtureProfile(repo,kind);
  for(const shape of ['cube','adjacent','ring']){
   const r=await request(profile,shape);
   const result=await export3MFProject(r,module);
   assert.equal(result.report.checks.perPartEdgeAndVertexManifold,'pass');
   assert.equal(result.report.verdict,'unverified');
   await writeFile(join(run,'evidence/wasm',kind+'-'+shape+'.3mf'),result.bytes);
   await writeFile(join(run,'evidence/wasm',kind+'-'+shape+'.report.json'),JSON.stringify(result.metadata,null,2));
   const re=await inspect3MF(result.bytes,{adapterId:profile.payload.adapterId});
   assert.equal(re.meshes.length,shape==='adjacent'?2:1);
   assert.equal(Number(re.settings.initial_layer_print_height),kind==='bambu'?.16:.25);
   if(kind==='u1')assert.deepEqual(re.physicalExtruders,[1,2,3,4]);
  }
 }
});
test('Core 3MF has mm/base materials/build with no vendor project defaults',async()=>{
 const r=await request(await fixtureProfile(repo,'bambu'),'cube');
 const result=await export3MFCore(r,module),re=await inspect3MF(result.bytes);
 assert.equal(re.settings,null);assert.equal(re.builds.length,1);
 await writeFile(join(run,'evidence/wasm/core-cube.3mf'),result.bytes);
});
test('user .25 override persists despite Bambu .16 default; output owns bytes across later jobs and memory growth',async()=>{
 const profile=await fixtureProfile(repo,'bambu'),r=await request(profile,'cube',.25);
 const before=JSON.stringify(r);const result=await export3MFProject(r,module),hash=result.metadata.sha256;
 assert.equal(JSON.stringify(r),before);
 const re=await inspect3MF(result.bytes);assert.equal(Number(re.settings.initial_layer_print_height),.25);
 const mem=module._malloc(80*1024*1024);assert.ok(mem);module._free(mem);
 await export3MFProject(await request(profile,'ring'),module);
 assert.equal(await sha256(result.bytes),hash);
 await writeFile(join(run,'evidence/wasm/bambu-override-cube.3mf'),result.bytes);
});
test('mesh failure, part/material refs and stale snapshot reject without artifact',async()=>{
 const r=await request(await fixtureProfile(repo,'u1'),'cube');
 for(const mutate of [
  x=>x.mesh.vertices[0]=NaN,
  x=>x.mesh.faces[0]=99999,
  x=>x.mesh.state='building',
  x=>{delete x.revision;delete x.mesh.revision;},
  x=>x.mesh.revision='other',
  x=>x.mesh.facePartIds[0]='absent',
  x=>x.materialTable.materials[0].slot=6
 ]){
  const bad=structuredClone(r);mutate(bad);await assert.rejects(()=>export3MFProject(bad,module));
 }
 const open=structuredClone(r);open.mesh.faces.splice(0,3);open.mesh.facePartIds.splice(0,1);
 await assert.rejects(()=>export3MFProject(open,module),/EDGE_NOT_MANIFOLD/);
 // Context poisoning must not poison a subsequent independent job.
 await export3MFProject(r,module);
});
test('AT-014.3 durable U1 six-slot fixture rejects, both reference packages share one geometry oracle',async()=>{
 const manifest=JSON.parse(await readFile(join(repo,'tests/fixtures/printing-reference/v1/manifest.json')));
 const geometries=[];
 for(const name of ['bambu-project.3mf','u1-inconsistent-slots.3mf']){
  const bytes=await readFile(join(repo,'tests/fixtures/printing-reference/v1',name));
  assert.equal(await sha256(bytes),manifest.files.find(f=>f.path===name).sha256);
  const entries=readZip(bytes);geometries.push(await sha256(entries.get('3D/Objects/object_1.model')));
  if(name.startsWith('u1'))await assert.rejects(()=>inspect3MF(bytes,{adapterId:'export.3mf.snapmaker-project'}),/MATERIAL_SLOT_MISMATCH/);
 }
 assert.equal(geometries[0],geometries[1]);
 assert.equal(geometries[0],'67faa754111f2b0504e66b10897a60e10d09d2e5e121c54d7a1f735e7cad3265');
});

test('tampered unit, namespace, relationships, component cycles, material refs and transforms are rejected',async()=>{
 const result=await export3MFCore(await request(await fixtureProfile(repo,'bambu'),'cube'),module);
 const base=readZip(result.bytes),decoder=new TextDecoder(),encoder=new TextEncoder();
 for(const [path,change,error] of [
  ['3D/3dmodel.model',s=>s.replace('unit="millimeter"','unit="inch"'),'MODEL_UNIT'],
  ['3D/3dmodel.model',s=>s.replace('xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"','xmlns="urn:bad"'),'CORE_NAMESPACE'],
  ['_rels/.rels',s=>s.replace('Target="/3D/3dmodel.model"','Target="https://example.com/model" TargetMode="External"'),'RELATIONSHIP_EXTERNAL'],
  ['3D/3dmodel.model',s=>s.replace('pid="1"','pid="999"'),'MATERIAL_REFERENCE'],
  ['3D/3dmodel.model',s=>s.replace('<component objectid="3"','<component objectid="2"'),'COMPONENT_CYCLE'],
  ['3D/3dmodel.model',s=>s.replace('<item objectid="2"','<item transform="1 0 0 0 1 0 0 0 1 NaN 0 0" objectid="2"'),'BUILD_TRANSFORM']
 ]){
  const entries=new Map(base),original=decoder.decode(entries.get(path)),mutated=change(original);
  assert.notEqual(original,mutated,'mutation fixture must apply: '+error);
  entries.set(path,encoder.encode(mutated));
  await assert.rejects(()=>inspect3MF(zipSync(Object.fromEntries(entries))),new RegExp(error));
 }
});
test('ZIP declared size lies and oversized ZIP64 offsets cannot bypass decompression bounds',async()=>{
 const bytes=zipSync({'small':new Uint8Array(10000)}),d=new DataView(bytes.buffer);
 const end=bytes.length-22,cd=d.getUint32(end+16,true);d.setUint32(22,16,true);d.setUint32(cd+24,16,true);
 assert.throws(()=>readZip(bytes),/ZIP_DECOMPRESS_BOUND/);
 const result=await export3MFCore(await request(await fixtureProfile(repo,'bambu'),'cube'),module);
 const raw=result.bytes.slice(),view=new DataView(raw.buffer);const locator=raw.length-42;
 assert.equal(view.getUint32(locator,true),0x07064b50);
 view.setBigUint64(locator+8,2n**60n,true);assert.throws(()=>readZip(raw),/ZIP64_BOUND/);
});
