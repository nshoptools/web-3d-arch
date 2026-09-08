import assert from'node:assert/strict';
import{readSnapshot,inspectMesh}from'../oracles/mesh-oracle.mjs';
export{readSnapshot};
const scale=1000000n;
const area2=points=>points.reduce((sum,a,i)=>{const b=points[(i+1)%points.length];return sum+a[0]*b[1]-a[1]*b[0];},0n);
const canonical=ring=>{const s=ring.map(p=>p.join(','));let best=s.join(';');for(let i=1;i<s.length;i++){const t=[...s.slice(i),...s.slice(0,i)].join(';');if(t<best)best=t;}return best;};
export function incidence(mesh){
 const directed=new Map();
 for(const c of mesh.contours)for(let i=0;i<c.ring.length;i++){const a=c.ring[i],b=c.ring[(i+1)%c.ring.length],k=a+':'+b;assert.ok(!directed.has(k));directed.set(k,c.part);}
 for(const e of mesh.edges){
  assert.equal(directed.get(e.a+':'+e.b),e.left);directed.delete(e.a+':'+e.b);
  if(e.right!==0xffffffff){assert.equal(directed.get(e.b+':'+e.a),e.right);directed.delete(e.b+':'+e.a);}
 }
 assert.equal(directed.size,0,'all oriented contours match shared edge IDs exactly');
}
export function extrusionOracle(bytes,{canonicalContours=null,analyticArea=null,svgAffineArea=null}={}){
 const m=readSnapshot(bytes);incidence(m);const metrics=inspectMesh(m);
 const points=m.points.map(p=>p.map(n=>Number(n)/Number(scale)));
 let boundaryCount=0,holes=0,components=0,totalArea=0n;
 const partMetrics=[];
 for(let i=0;i<m.parts.length;i++){
  const p=m.parts[i],contours=m.contours.filter(c=>c.part===i).map(c=>c.ring.map(id=>m.points[id]));
  if(canonicalContours){
   const expected=canonicalContours.find(x=>x.shape===p.source).contours.map(c=>c.map(p=>p.map(BigInt)));
   assert.deepEqual(contours.map(canonical).sort(),expected.map(canonical).sort(),'opaque canonical Clipper boundaries retained, cyclic start only');
  }
  let expected2=0n;for(const c of contours){const a=area2(c);assert.notEqual(a,0n);expected2+=a;if(a>0n)components++;else holes++;boundaryCount+=c.length;}
  assert.ok(expected2>0n);totalArea+=expected2;
  const partVertices=m.vertices.slice(p.vertexStart,p.vertexStart+p.vertexCount),vertexSet=new Set(partVertices.map(v=>v.join(',')));
  const wantedXY=new Set(contours.flat().map(v=>v.map(n=>Number(n)/1e6).join(',')));
  for(const xy of wantedXY)for(const z of [0,.2])assert.ok(vertexSet.has(xy+','+z),'every boundary point has BOTH exact extrusion endpoints '+xy);
  for(const v of partVertices){assert.ok(wantedXY.has(v.slice(0,2).join(',')),'extrusion vertex remains on canonical input boundary');assert.ok(v[2]===0||v[2]===.2);}
  const intXY=new Map(contours.flat().map(v=>[v.map(n=>Number(n)/1e6).join(','),v]));
  const capSum=new Map([[0,0n],[.2,0n]]),sideMap=new Map();
  for(const f of m.faces.slice(p.faceStart,p.faceStart+p.faceCount)){
   const v=f.map(j=>m.vertices[j]),xy=v.map(q=>intXY.get(q.slice(0,2).join(',')));
   if(v.every(q=>q[2]===v[0][2])){const ar=area2(xy);assert.ok(v[0][2]===0?ar<0n:ar>0n,'cap winding');capSum.set(v[0][2],capSum.get(v[0][2])+ar);}
   else {const k=[...new Set(xy.map(q=>q.join(',')))].sort().join('|');assert.equal(new Set(xy.map(q=>q.join(','))).size,2,'side triangle uses one exact boundary edge');sideMap.set(k,(sideMap.get(k)??0)+1);}
  }
  assert.equal(capSum.get(.2),expected2,'top cap exact integer area');assert.equal(capSum.get(0),-expected2,'bottom cap exact integer area');
  for(const c of contours)for(let j=0;j<c.length;j++){const k=[c[j].join(','),c[(j+1)%c.length].join(',')].sort().join('|');assert.equal(sideMap.get(k),2,'every boundary edge has two side triangles');sideMap.delete(k);}
  assert.equal(sideMap.size,0,'no unaccounted side facets');
  const q=inspectMesh({vertices:m.vertices,faces:m.faces.slice(p.faceStart,p.faceStart+p.faceCount)});
  const volume=Number(expected2)/2e12*.2;assert.ok(Math.abs(q.volume-volume)<1e-10,'mesh volume versus exact integer area*height');assert.ok(Math.abs(p.reportedVolume-volume)<1e-10);
  partMetrics.push({source:p.source,area2Grid:expected2.toString(),volume:q.volume,triangles:q.faceCount});
 }
 if(analyticArea!==null)assert.equal(totalArea,BigInt(analyticArea)*2n*scale*scale);
 assert.equal(metrics.euler,2*(components-holes),'component/hole Euler oracle');
 let interpretation=null;
 if(svgAffineArea!==null){
  // Same conservative envelope as permanent tests/kernel/svg-source.test.mjs:
  // <=16 f32 rounding steps, coordinate envelope40mm, final1nm grid.
  // This fixture is axis-aligned paths plus physical-units/viewBox only.
  const coordinateBoundMm=16*40*2**-23+1e-6,perimeterMm=120;
  const areaBoundMm2=perimeterMm*Math.SQRT2*coordinateBoundMm+64*coordinateBoundMm**2;
  const observedDeltaMm2=Number(totalArea)/2e12-svgAffineArea;
  assert.ok(Math.abs(observedDeltaMm2)<=areaBoundMm2,'analytic area within pinned f32 affine fixture envelope');
  interpretation={sourceAreaMm2:svgAffineArea,observedDeltaMm2,coordinateBoundMm,areaBoundMm2,scope:'this authored affine rectangle fixture only; no general source bound'};
 }
 return{...metrics,components,holes,boundaryCount,area2Grid:totalArea.toString(),partMetrics,interpretation};
}
export function frameOracle(beforeBytes,afterBytes,metadata){
 const a=readSnapshot(beforeBytes),b=readSnapshot(afterBytes),f=metadata.sourceFrame;
 assert.equal(b.vertices.length,0);assert.equal(b.faces.length,0);assert.equal(b.points.length,a.points.length);assert.equal(b.parts.length,a.parts.length);
 const [x,y,z,w]=f.linearMatrix.map(BigInt),[tx,ty]=f.translationGrid.map(BigInt),reflection=x*w-y*z<0;
 assert.deepEqual(b.points,a.points.map(([a,b])=>[x*a+z*b+tx,y*a+w*b+ty]));
 assert.deepEqual(b.contours,a.contours.map(c=>({part:c.part,ring:reflection?[...c.ring].reverse():c.ring})));
 assert.deepEqual(b.edges,a.edges.map(e=>reflection?{...e,a:e.b,b:e.a}:e));
 a.contours.forEach((c,i)=>assert.equal(area2(c.ring.map(p=>a.points[p])),area2(b.contours[i].ring.map(p=>b.points[p])),'signed area/hole orientation preserved exactly'));
 assert.deepEqual(b.parts.map(p=>[p.color,p.source,p.contourStart,p.contourCount]),a.parts.map(p=>[p.color,p.source,p.contourStart,p.contourCount]));
 assert.equal(metadata.sourceAssemblyRequired,true);assert.equal(metadata.planarContextOnly,true);assert.equal(f.translationErrorUpperMmPerAxis,.0000005);incidence(b);
 return {points:b.points.length,contours:b.contours.length,edges:b.edges.length,sharedEdges:b.edges.filter(e=>e.right!==0xffffffff).length};
}
export function geometryBytes(b){const c=Buffer.from(b);c.writeUInt32LE(0,16);return c;}

