// Independent indexed/STL reader and combinatorial oracle. No imports from
// the kernel, Manifold, Clipper2, exporters, or their generated assertions.
import assert from 'node:assert/strict';

export function readSnapshot(bytes) {
  const b=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  assert.ok(b.length>=128,'header');
  const u=o=>b.readUInt32LE(o);
  assert.equal(u(0),0x48435241);assert.equal(u(4),1);assert.equal(u(8),128);assert.equal(u(12),b.length);
  const counts=[u(20),u(24),u(28),u(32),u(36),u(40),u(44)];
  const strides=[24,12,40,16,16,4,16];
  const alignment=[8,4,8,8,4,4,4];
  const offsets=counts.map((_,i)=>u(48+4*i));
  let end=128;
  counts.forEach((count,i)=>{
    assert.ok(count<=4_000_000,'bounded count');
    assert.equal(offsets[i]%alignment[i],0,'alignment');
    assert.ok(offsets[i]>=end,'non-overlap');end=offsets[i]+strides[i]*count;
    assert.ok(end<=b.length,'array extent');
  });
  assert.equal(end,b.length);
  const vertices=Array.from({length:counts[0]},(_,i)=>[0,1,2].map(a=>b.readDoubleLE(offsets[0]+24*i+8*a)));
  const faces=Array.from({length:counts[1]},(_,i)=>[0,1,2].map(a=>u(offsets[1]+12*i+4*a)));
  const parts=Array.from({length:counts[2]},(_,i)=>{
    const start=offsets[2]+40*i;const v=Array.from({length:8},(_,j)=>u(start+4*j));
    assert.ok(v[0]+v[1]<=vertices.length);assert.ok(v[2]+v[3]<=faces.length);
    for(const face of faces.slice(v[2],v[2]+v[3])) for(const index of face) assert.ok(index>=v[0]&&index<v[0]+v[1]);
    return {vertexStart:v[0],vertexCount:v[1],faceStart:v[2],faceCount:v[3],color:v[4],source:v[5],contourStart:v[6],contourCount:v[7],reportedVolume:b.readDoubleLE(start+32)};
  });
  const points=Array.from({length:counts[3]},(_,i)=>[b.readBigInt64LE(offsets[3]+16*i),b.readBigInt64LE(offsets[3]+16*i+8)]);
  const indices=Array.from({length:counts[5]},(_,i)=>u(offsets[5]+i*4));
  const contours=Array.from({length:counts[4]},(_,i)=>{
    const start=offsets[4]+16*i,from=u(start),count=u(start+4),part=u(start+8);
    assert.ok(from+count<=indices.length&&part<parts.length&&count>=3);
    const ring=indices.slice(from,from+count);assert.ok(ring.every(p=>p<points.length));return {part,ring};
  });
  const edges=Array.from({length:counts[6]},(_,i)=>{
    const o=offsets[6]+16*i;const e={a:u(o),b:u(o+4),left:u(o+8),right:u(o+12)};
    assert.ok(e.a<points.length&&e.b<points.length&&e.a!==e.b&&e.left<parts.length&&(e.right===0xffffffff||e.right<parts.length));return e;
  });
  return {generation:u(16),vertices,faces,parts,points,contours,edges};
}

export function readSTL(bytes) {
  assert.ok(bytes.length>=84);
  const count=bytes.readUInt32LE(80);assert.equal(bytes.length,84+50*count);
  const vertices=[],faces=[],map=new Map();
  for(let i=0;i<count;i++){
    const face=[];
    for(let j=0;j<3;j++){
      const p=[0,1,2].map(a=>bytes.readFloatLE(84+50*i+12+j*12+a*4));
      assert.ok(p.every(Number.isFinite));
      const key=p.map(v=>Object.is(v,-0)?0:v).join(',');
      if(!map.has(key)){map.set(key,vertices.length);vertices.push(p);}
      face.push(map.get(key));
    }
    faces.push(face);
  }
  return {vertices,faces};
}

const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0);
export function inspectMesh({vertices,faces}) {
  const edges=new Map(),links=new Map(),used=new Set();let volume=0,area=0;
  const caps=new Map();
  for(const f of faces){
    assert.equal(new Set(f).size,3,'distinct triangle vertices');
    assert.ok(f.every(i=>Number.isInteger(i)&&i>=0&&i<vertices.length));
    const [a,b,c]=f.map(i=>vertices[i]);assert.ok([a,b,c].flat().every(Number.isFinite));
    const n=cross(sub(b,a),sub(c,a));const twiceArea=Math.hypot(...n);
    assert.ok(twiceArea>1e-14,'non-degenerate triangle');area+=twiceArea/2;
    volume+=dot(a,cross(b,c))/6;
    if(a[2]===b[2]&&b[2]===c[2])caps.set(a[2],(caps.get(a[2])??0)+Math.abs(n[2])/2);
    for(let j=0;j<3;j++){
      const v=f[j],w=f[(j+1)%3],other=f[(j+2)%3];used.add(v);
      const key=[Math.min(v,w),Math.max(v,w)].join(':');
      const entry=edges.get(key)??{count:0,direction:0};entry.count++;entry.direction+=v<w?1:-1;edges.set(key,entry);
      if(!links.has(v))links.set(v,new Map());
      const link=links.get(v);
      for(const [x,y] of [[w,other],[other,w]]){if(!link.has(x))link.set(x,[]);link.get(x).push(y);}
    }
  }
  for(const e of edges.values()){assert.equal(e.count,2,'two incident faces');assert.equal(e.direction,0,'opposite edge orientation');}
  // Edge incidence alone misses pinched vertices. Each vertex link must be
  // one connected cycle, not multiple cycles meeting at the same point.
  for(const link of links.values()){
    for(const neighbors of link.values())assert.equal(neighbors.length,2,'vertex link degree');
    const seen=new Set(),queue=[link.keys().next().value];
    while(queue.length){const v=queue.pop();if(seen.has(v))continue;seen.add(v);queue.push(...link.get(v).filter(x=>!seen.has(x)));}
    assert.equal(seen.size,link.size,'one vertex link cycle');
  }
  assert.ok(volume>0,'positive signed volume');
  return {vertexCount:used.size,faceCount:faces.length,edgeCount:edges.size,euler:used.size-edges.size+faces.length,volume,area,caps:Object.fromEntries(caps)};
}

export function verticalIntersections(mesh,x,y) {
  const hits=[];
  for(const f of mesh.faces){
    const [a,b,c]=f.map(i=>mesh.vertices[i]);
    const denominator=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
    if(Math.abs(denominator)<1e-12)continue;
    const p=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/denominator;
    const q=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/denominator;
    if(p>=-1e-12&&q>=-1e-12&&p+q<=1+1e-12)hits.push(a[2]*p+b[2]*q+c[2]*(1-p-q));
  }
  return [...new Set(hits.map(z=>Math.round(z*1e9)/1e9))].sort((a,b)=>a-b);
}
