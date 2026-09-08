import assert from'node:assert/strict';import{readFile,writeFile}from'node:fs/promises';import path from'node:path';import{readSTL,inspectMesh}from'../oracles/mesh-oracle.mjs';
const run=process.env.PROJECT_REVIEW_RUN;if(!run)throw Error('PROJECT_REVIEW_RUN required');const dir=path.join(run,'evidence/native-root');
const bytes=await readFile(path.join(dir,'confirmed.stl')),metadata=JSON.parse(await readFile(path.join(dir,'proposal.json'))),summary=metadata.conditioning;
const mesh=readSTL(bytes),metrics=inspectMesh(mesh);assert.equal(metrics.euler,4);assert.equal(metrics.vertexCount,2424);assert.equal(metrics.faceCount,4840);
const array=async(k,T)=>{const b=await readFile(path.join(dir,`buffer-${k}.bin`));const owned=Uint8Array.from(b);return new T(owned.buffer);};
const old=await array(1,Float64Array),oldT=await array(2,Uint32Array),vertices=await array(3,Float64Array),triangles=await array(4,Uint32Array),map=await array(5,Uint32Array),kept=await array(6,Uint32Array),removed=await array(7,Uint32Array),edges=await array(8,Uint32Array);
assert.equal(map.length,old.length/3);assert.equal(kept.length+removed.length,oldT.length/3);assert.equal(kept.length,triangles.length/3);assert.equal(removed.length,448);assert.equal(edges.length/2,224);
assert.equal(new Set([...kept,...removed]).size,oldT.length/3);const targetEdges=new Set();for(let i=0;i<triangles.length;i+=3){for(let k=0;k<3;k++)targetEdges.add([triangles[i+k],triangles[i+(k+1)%3]].sort((a,b)=>a-b).join(':'));}
const bnd=summary.hausdorffUpperBoundMm;let actual=0;
for(let i=0;i<map.length;i++){assert.ok(map[i]<vertices.length/3);const d=Math.hypot(...[0,1,2].map(k=>old[3*i+k]-vertices[3*map[i]+k]));assert.ok(d<=bnd);actual=Math.max(actual,d);}
for(let i=0;i<kept.length;i++)for(let k=0;k<3;k++)assert.equal(triangles[3*i+k],map[oldT[3*kept[i]+k]]);
for(const face of removed){const image=[...new Set([0,1,2].map(k=>map[oldT[3*face+k]]))];assert.ok(image.length<=2);if(image.length===2)assert.ok(targetEdges.has(image.sort((a,b)=>a-b).join(':')));}
for(const x of vertices)assert.equal(x,Math.fround(x));
// Independent file readback: normals and every emitted corner equal the agreed
// indexed candidate, without tolerance-based welding or discarded faces.
for(let i=0;i<kept.length;i++){const offset=84+50*i;const corners=[0,1,2].map(j=>[0,1,2].map(k=>vertices[3*triangles[3*i+j]+k]));
 for(let j=0;j<3;j++)for(let k=0;k<3;k++)assert.equal(bytes.readFloatLE(offset+12+12*j+4*k),corners[j][k]);
 const u=corners[1].map((x,k)=>x-corners[0][k]),v=corners[2].map((x,k)=>x-corners[0][k]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],l=Math.hypot(...n);assert.ok(l>0);for(let k=0;k<3;k++)assert.equal(bytes.readFloatLE(offset+k*4),Math.fround(n[k]/l));assert.equal(bytes.readUInt16LE(offset+48),0);
}
// The affine correspondence is checked for ALL original faces via IDs/map.
// Convexity then proves the domain bound, including collapsed face images;
// this is not a claim based on sampling vertices alone.
const result={status:'pass',oracle:'independent file decoder + combinatorial mesh oracle + exhaustive affine correspondence',vertices:vertices.length/3,triangles:triangles.length/3,oldVertices:old.length/3,oldTriangles:oldT.length/3,collapsedEdges:edges.length/2,removedFaces:removed.length,maximumMeasuredDisplacementMm:actual,hausdorffUpperBoundMm:bnd,metrics,globalPipelineErrorMm:null,ambientIsotopy:'unverified'};
await writeFile(path.join(run,'evidence/float-file-oracle.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
