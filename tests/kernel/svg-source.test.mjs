import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {readSnapshot,readSTL,inspectMesh,verticalIntersections} from '../oracles/mesh-oracle.mjs';

const run=process.env.PROJECT_REVIEW_RUN,binary=process.env.ARCH_NATIVE_BIN,modulePath=process.env.ARCH_WASM_MODULE;
if(!run||!binary||!modulePath)throw new Error('Project environment, ARCH_NATIVE_BIN and ARCH_WASM_MODULE are required.');
const output=path.join(run,'evidence','svg-source-oracle');await mkdir(output,{recursive:true});
const engine=await (await import(pathToFileURL(modulePath).href)).default();
const error=()=>new TextDecoder().decode(new Uint8Array(engine.HEAPU8.subarray(engine._arch_error_ptr(),engine._arch_error_ptr()+engine._arch_error_len())));
const bytes=id=>new Uint8Array(engine.HEAPU8.buffer,engine._arch_snapshot_ptr(id),engine._arch_snapshot_len(id));
const svg=body=>`<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="0 0 20 10">${body}</svg>`;
const hole=await readFile(new URL('../fixtures/corpus-v1/rectangle-hole.svg',import.meta.url),'utf8');
const seam=await readFile(new URL('../fixtures/corpus-v1/shared-seam.svg',import.meta.url),'utf8');
// These are analytic rectangles with affine transforms/clipping only. The
// coordinate envelope is 40 source units/mm. A conservative 16 f32 rounding
// operations plus a 1 nm grid bounds THESE fixtures, not general SVG parsing,
// stroking, trig, or curve flattening. The production ledger remains unverified.
const coordinateBound=16*40*2**-23+1e-6;
const areaBound=(perimeter,e)=>perimeter*Math.SQRT2*e+64*e*e;
const cases=[
  {name:'hole',source:hole,areas:[184],euler:[0],perimeters:[76]},
  {name:'seam',source:seam,areas:[100,100],euler:[2,2],perimeters:[40,40]},
  {name:'clip-union',source:svg('<defs><clipPath id="c"><rect x="2" y="2" width="4" height="6"/><rect x="10" y="2" width="4" height="6"/></clipPath></defs><rect width="20" height="10" clip-path="url(#c)"/>'),areas:[48],euler:[4],perimeters:[40]},
  {name:'nested-clip',source:svg('<defs><clipPath id="a"><rect x="2" y="1" width="12" height="8"/></clipPath><clipPath id="b"><rect x="4" y="2" width="6" height="6"/></clipPath></defs><g clip-path="url(#a)"><rect width="20" height="10" clip-path="url(#b)"/></g>'),areas:[36],euler:[2],perimeters:[24]},
  {name:'viewport',source:svg('<rect x="-5" y="-5" width="40" height="30"/>'),areas:[200],euler:[2],perimeters:[60]},
  {name:'scaled-hole',source:hole,longEdge:40,areas:[736],euler:[0],perimeters:[152]},
];
function buildWasm(source,generation,longEdge=0){
  const input=new TextEncoder().encode(source),handle=engine._arch_input_create(input.length);
  assert.ok(handle>0);engine.HEAPU8.set(input,engine._arch_input_ptr(handle));
  assert.equal(engine._arch_control_reset(generation),1,error());
  const id=engine._arch_build_svg(handle,2,longEdge,0.004,generation);
  assert.equal(engine._arch_input_ptr(handle),0,'build consumes immutable source input');
  return id;
}
for(const [index,fixture] of cases.entries())test(`SVG ${fixture.name}: actual native source, clip graph, WASM parity and exported-file oracle`,async()=>{
  const sourcePath=path.join(output,`${fixture.name}.svg`),prefix=path.join(output,fixture.name);
  await writeFile(sourcePath,fixture.source);
  const command=['svg',sourcePath,prefix,'2'];if(fixture.longEdge)command.push(String(fixture.longEdge));
  const result=spawnSync(binary,command,{encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stderr||result.error?.message);
  const native=readSnapshot(await readFile(`${prefix}.arch`));
  const id=buildWasm(fixture.source,index+1,fixture.longEdge);assert.ok(id>0,error());
  try{
    const web=readSnapshot(bytes(id));assert.equal(web.generation,index+1);
    assert.deepEqual(web.vertices,native.vertices);assert.deepEqual(web.faces,native.faces);
    const metadata=JSON.parse(await readFile(`${prefix}.metadata.json`,'utf8'));
    assert.equal(metadata.totalErrorBoundMm,null,'fixture evidence must not invent a general import error bound');
    assert.equal(native.parts.length,fixture.areas.length);
    const observations=[];
    for(const [i,part] of native.parts.entries()){
      const indexed=inspectMesh({vertices:native.vertices,faces:native.faces.slice(part.faceStart,part.faceStart+part.faceCount)});
      const stl=readSTL(await readFile(`${prefix}.part-${i}.stl`)),exported=inspectMesh(stl);
      const importBound=areaBound(fixture.perimeters[i],coordinateBound);
      const floatBound=areaBound(fixture.perimeters[i],coordinateBound+40*2**-23);
      for(const [actual,bound] of [[indexed,importBound],[exported,floatBound]]){
        assert.equal(actual.euler,fixture.euler[i]);assert.ok(Math.abs(actual.volume-2*fixture.areas[i])<=2*bound);
        assert.ok(Math.abs(actual.caps[0]-fixture.areas[i])<=bound);assert.ok(Math.abs(actual.caps[2]-fixture.areas[i])<=bound);
      }
      if(fixture.name==='hole')assert.deepEqual(verticalIntersections(stl,10,5),[]);
      observations.push({indexed,exported,sourceArea:fixture.areas[i],coordinateBoundMm:coordinateBound,importAreaBound:importBound,stlAreaBound:floatBound});
    }
    await writeFile(`${prefix}.oracle.json`,JSON.stringify({observations,scope:'analytic affine/rectangular fixture only; not a general SVG or fit qualification'},null,2));
  }finally{assert.equal(engine._arch_snapshot_release(id),1);}
});
test('SVG rejected source and point contacts cannot publish a new snapshot or any output file',async()=>{
  const retained=buildWasm(hole,100);assert.ok(retained>0,error());const previous=Buffer.from(bytes(retained));
  const invalid=[svg('<script>alert(1)</script><rect width="20" height="10"/>'),svg('<path d="M0 0H10V10H0Z M10 10H20V20H10Z"/>'),'<svg invalid'];
  // Use a larger viewport for the corner-contact case so clipping cannot
  // remove the second lobe and accidentally turn the rejection into a pass.
  invalid[1]=invalid[1].replace('height="10mm"','height="20mm"').replace('viewBox="0 0 20 10"','viewBox="0 0 20 20"');
  try{for(const [i,source] of invalid.entries()){
    const id=buildWasm(source,101+i);assert.equal(id,0);assert.ok(error().length>0);
    assert.deepEqual(Buffer.from(bytes(retained)),previous,'last good generation remains intact');
    const sourcePath=path.join(output,`rejected-${i}.svg`),prefix=path.join(output,`rejected-${i}`);await writeFile(sourcePath,source);
    const result=spawnSync(binary,['svg',sourcePath,prefix],{encoding:'utf8',timeout:30000});assert.notEqual(result.status,0);
    await assert.rejects(access(`${prefix}.arch`));await assert.rejects(access(`${prefix}.part-0.stl`));
    if(i===1)assert.match(result.stderr,/PLANAR_POINT_CONTACT/);
  }}finally{engine._arch_snapshot_release(retained);}
});
