import assert from 'node:assert/strict';
const sub=(a,b)=>a.map((x,i)=>x-b[i]),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const cycle=f=>{const k=f.indexOf(Math.min(...f));return [f[k],f[(k+1)%3],f[(k+2)%3]].join(',');};
// Oracle only: comparison correspondence never modifies a manufacturing mesh.
// Each vertex must map bijectively, within the unchanged 1e-8 mm parity budget.
// Exact matches are assigned first; unmatched vertices use closest unused
// neighbors. Ambiguous/unmatched correspondences fail instead of welding.
export function compareSurface(a,b,budget=1e-8){
 assert.equal(a.vertices.length,b.vertices.length,'vertex count');assert.equal(a.faces.length,b.faces.length,'face count');
 const key=p=>p.join(','),exact=new Map(a.vertices.map((p,i)=>[key(p),i]));assert.equal(exact.size,a.vertices.length,'duplicate source vertex');
 const mapping=new Int32Array(b.vertices.length).fill(-1),used=new Set();let maxVertexDelta=0;
 for(let j=0;j<b.vertices.length;j++){const i=exact.get(key(b.vertices[j]));if(i!==undefined){assert.ok(!used.has(i));mapping[j]=i;used.add(i);}}
 const buckets=new Map(),cell=p=>p.map(x=>Math.floor(x/budget));
 for(let i=0;i<a.vertices.length;i++)if(!used.has(i)){const k=key(cell(a.vertices[i]));if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(i);}
 const candidates=[];for(let j=0;j<b.vertices.length;j++)if(mapping[j]<0){const p=b.vertices[j],c=cell(p),near=[];
  for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)for(const i of buckets.get(key([c[0]+x,c[1]+y,c[2]+z]))??[]){const d=Math.hypot(...sub(p,a.vertices[i]));if(d<=budget)near.push({i,j,d});}
  assert.ok(near.length,'unmatched parity vertex');near.sort((a,b)=>a.d-b.d);assert.ok(near.length===1||near[0].d<near[1].d,'ambiguous parity vertex');candidates.push(near[0]);
 }
 candidates.sort((a,b)=>a.d-b.d);for(const {i,j,d}of candidates){assert.ok(!used.has(i),'non-bijective parity correspondence');mapping[j]=i;used.add(i);maxVertexDelta=Math.max(maxVertexDelta,d);}
 assert.equal(used.size,a.vertices.length);
 const af=new Map(a.faces.map(f=>[cycle(f),f]));assert.equal(af.size,a.faces.length,'duplicate oriented source face');
 const onlyB=[];for(const face of b.faces){const f=face.map(i=>mapping[i]),k=cycle(f);if(af.has(k))af.delete(k);else onlyB.push(f);}
 const changed=[...[...af.values()].map(f=>({f,sign:1})),...onlyB.map(f=>({f,sign:-1}))];
 const parents=changed.map((_,i)=>i),find=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;},edgeKey=(a,b)=>a<b?a+','+b:b+','+a,edgeSides=new Map();
 for(let i=0;i<changed.length;i++)for(let k=0;k<3;k++){const f=changed[i].f,key=edgeKey(f[k],f[(k+1)%3]);if(!edgeSides.has(key))edgeSides.set(key,[]);edgeSides.get(key).push(i);}
 // Common edges are preserved patch boundaries. Joining across them would
 // combine adjacent, differently oriented planar facets into a curved region
 // even when only each facet's internal diagonal changed.
 for(const owners of edgeSides.values())if(owners.every(i=>changed[i].sign===changed[owners[0]].sign))for(const i of owners)parents[find(i)]=find(owners[0]);
 const pieces=new Map();for(let i=0;i<changed.length;i++){const r=find(i);if(!pieces.has(r))pieces.set(r,[]);pieces.get(r).push(changed[i]);}
 const groups=new Map();for(const piece of pieces.values()){
  const boundary=new Map();for(const {f}of piece)for(let k=0;k<3;k++){const u=f[k],v=f[(k+1)%3],key=edgeKey(u,v);boundary.set(key,(boundary.get(key)??0)+(u<v?1:-1));}
  const key=[...boundary].filter(([,n])=>n).sort(([a],[b])=>a<b?-1:1).map(([e,n])=>e+':'+n).join(';');
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(piece);
 }
 const paired=[];for(const pair of groups.values()){assert.ok(pair.length===2&&pair[0][0].sign!==pair[1][0].sign,'changed patch boundary differs');paired.push(pair.flat());}
 let maxSurfaceBound=maxVertexDelta,maxPlaneWidth=0;
 for(const group of paired){
  const normal=f=>cross(sub(a.vertices[f[1]],a.vertices[f[0]]),sub(a.vertices[f[2]],a.vertices[f[0]]));
  const reference=group.reduce((best,x)=>Math.hypot(...normal(x.f))>Math.hypot(...normal(best.f))?x:best),raw=normal(reference.f),length=Math.hypot(...raw);assert.ok(length>0,'degenerate changed patch');
  const n=raw.map(x=>x/length),origin=a.vertices[reference.f[0]],ledger=new Map();let lo=Infinity,hi=-Infinity;
  for(const {f,sign}of group){assert.ok(dot(normal(f),n)>0,'changed patch folds or reverses orientation');
   for(const i of f){const d=dot(sub(a.vertices[i],origin),n);lo=Math.min(lo,d);hi=Math.max(hi,d);}
   for(let k=0;k<3;k++){const u=f[k],v=f[(k+1)%3],key=edgeKey(u,v);ledger.set(key,(ledger.get(key)??0)+(u<v?sign:-sign));}
  }
  assert.ok([...ledger.values()].every(x=>x===0),'changed patch boundary differs');
  // Identical directed projected boundary + consistently oriented triangles
  // describes the same planar domain. Both surfaces lie in this plane slab.
  // Returning B's vertices from comparison correspondence to their original
  // positions adds at most maxVertexDelta by convex interpolation on a face.
  const width=hi-lo,bound=width+maxVertexDelta;assert.ok(bound<=budget,'non-coplanar retriangulation exceeds parity budget: '+bound);
  maxPlaneWidth=Math.max(maxPlaneWidth,width);maxSurfaceBound=Math.max(maxSurfaceBound,bound);
 }
 return {maxVertexDelta,maxSurfaceBound,maxPlaneWidth,changedFaces:changed.length,patches:paired.length,orientedTrianglesIdentical:changed.length===0};
}
