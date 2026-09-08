import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {readSnapshot,readSTL,inspectMesh,verticalIntersections} from '../oracles/mesh-oracle.mjs';

const binary=process.env.ARCH_NATIVE_BIN;
const run=process.env.PROJECT_REVIEW_RUN;
if(!binary||!run)throw new Error('Set ARCH_NATIVE_BIN and run the project environment first.');
const evidence=path.join(run,'evidence','native-oracle');
await mkdir(evidence,{recursive:true});
const near=(a,b)=>assert.ok(Math.abs(a-b)<=1e-8,`${a} != ${b}`);

for(const [name,expected] of Object.entries({
  hole:{volume:[368],euler:[0],area:[184],seam:0},
  seam:{volume:[200,200],euler:[2,2],area:[100,100],seam:10},
  't-junction':{volume:[200,100,100],euler:[2,2,2],area:[100,50,50],seam:20},
  overlap:{volume:[200,200],euler:[2,2],area:[100,100],seam:10},
}))test(`G1 analytic ${name}: ABI, independent topology/volume/caps, STL readback, shared seams`,async()=>{
  const prefix=path.join(evidence,name);
  const result=spawnSync(binary,['analytic',name,prefix],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.error?.message);
  const bytes=await readFile(`${prefix}.arch`),snapshot=readSnapshot(bytes);
  assert.equal(snapshot.generation,1);assert.equal(snapshot.parts.length,expected.volume.length);
  const results=[];
  for(let i=0;i<snapshot.parts.length;i++){
    const p=snapshot.parts[i];
    const indexed={vertices:snapshot.vertices,faces:snapshot.faces.slice(p.faceStart,p.faceStart+p.faceCount)};
    const oracle=inspectMesh(indexed);near(oracle.volume,expected.volume[i]);assert.equal(oracle.euler,expected.euler[i]);
    near(oracle.caps[0],expected.area[i]);near(oracle.caps[2],expected.area[i]);
    near(p.reportedVolume,oracle.volume);
    const stl=readSTL(await readFile(`${prefix}.part-${i}.stl`));
    const readback=inspectMesh(stl);near(readback.volume,expected.volume[i]);assert.equal(readback.euler,expected.euler[i]);
    if(name==='hole'){
      assert.deepEqual(verticalIntersections(stl,10,5),[],'hole remains open');
      assert.deepEqual(verticalIntersections(stl,1.234,2.345),[0,2],'material has both caps');
    }
    results.push({indexed:oracle,stl:readback});
  }
  let seam=0;
  for(const edge of snapshot.edges){
    if(edge.right===0xffffffff)continue;
    const a=snapshot.points[edge.a],b=snapshot.points[edge.b];
    seam+=Math.hypot(Number(b[0]-a[0]),Number(b[1]-a[1]))/1e6;
    const references=[];
    for(const c of snapshot.contours)for(let j=0;j<c.ring.length;j++){
      const x=c.ring[j],y=c.ring[(j+1)%c.ring.length];
      if(x===edge.a&&y===edge.b)references.push([c.part,1]);
      if(x===edge.b&&y===edge.a)references.push([c.part,-1]);
    }
    assert.deepEqual(references,[[edge.left,1],[edge.right,-1]],'both regions share the same directed edge');
  }
  near(seam,expected.seam);
  await writeFile(`${prefix}.oracle.json`,JSON.stringify({fixture:name,results,sharedSeamMm:seam,scope:'analytic-fixture; no general self-intersection or physical-fit claim'},null,2));
});
