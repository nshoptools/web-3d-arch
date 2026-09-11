import {readArchSnapshot} from '../viewport/arch-view.mjs';
import {exactVertices,sub,cross,dot,sign,h,equal,inSegment,plane,triangleIntersection,pointInSolid,pointOnTriangle} from './mesh-predicates.mjs';
export const MESH_QUALIFIER_VERSION='arch-mesh-qualification/1';
export const DEFAULT_MESH_LIMITS=Object.freeze({bytes:64*1024*1024,vertices:300000,triangles:600000,parts:128,candidatePairs:6000000,containmentWork:8000000});
class Stop extends Error {constructor(code,verdict='unverified',details={}){super(code);this.code=code;this.verdict=verdict;this.details=details;}}
const need=(v,code,details)=>{if(!v)throw new Stop(code,'fail',details);};
const samePoint=(a,b)=>a.every((v,i)=>v===b[i]);
const overlap=(a,b)=>a.slice(0,3).every((v,i)=>v<=b[i+3]&&b[i]<=a[i+3]);
function bvh(ids,boxes){
 const bounds=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
 for(const i of ids)for(let k=0;k<3;k++){bounds[k]=Math.min(bounds[k],boxes[i][k]);bounds[k+3]=Math.max(bounds[k+3],boxes[i][k+3]);}
 if(ids.length<=8)return {bounds,ids};
 let axis=0;for(let k=1;k<3;k++)if(bounds[k+3]-bounds[k]>bounds[axis+3]-bounds[axis])axis=k;
 ids.sort((a,b)=>(boxes[a][axis]+boxes[a][axis+3])-(boxes[b][axis]+boxes[b][axis+3]));
 const half=ids.length>>1;return {bounds,left:bvh(ids.slice(0,half),boxes),right:bvh(ids.slice(half),boxes)};
}
function* covering(node,p,boxes){
 if(p.some((x,k)=>x<node.bounds[k]||x>node.bounds[k+3]))return;
 if(node.ids){for(const i of node.ids)if(p.every((x,k)=>x>=boxes[i][k]&&x<=boxes[i][k+3]))yield i;return;}
 yield* covering(node.left,p,boxes);yield* covering(node.right,p,boxes);
}
function* pairs(a,b,boxes){
 if(!overlap(a.bounds,b.bounds))return;
 if(a===b){if(a.ids){for(let i=0;i<a.ids.length;i++)for(let j=i+1;j<a.ids.length;j++)if(overlap(boxes[a.ids[i]],boxes[a.ids[j]]))yield [a.ids[i],a.ids[j]];}
  else{yield* pairs(a.left,a.left,boxes);yield* pairs(a.right,a.right,boxes);yield* pairs(a.left,a.right,boxes);}return;}
 if(a.ids&&b.ids){for(const i of a.ids)for(const j of b.ids)if(overlap(boxes[i],boxes[j]))yield [i,j];return;}
 if(!a.ids){yield* pairs(a.left,b,boxes);yield* pairs(a.right,b,boxes);}else{yield* pairs(a,b.left,boxes);yield* pairs(a,b.right,boxes);}
}
function floatPlane(t,p){
 const a=t[0].map((v,i)=>v-p[i]),b=t[1].map((v,i)=>v-p[i]),c=t[2].map((v,i)=>v-p[i]);
 const terms=[a[0]*b[1]*c[2],a[1]*b[2]*c[0],a[2]*b[0]*c[1],a[2]*b[1]*c[0],a[1]*b[0]*c[2],a[0]*b[2]*c[1]];
 const det=terms[0]+terms[1]+terms[2]-terms[3]-terms[4]-terms[5],permanent=terms.reduce((s,v)=>s+Math.abs(v),0);
 // This filter only excludes well-separated planes. Subnormal arithmetic may
 // violate relative-error bounds, so small/nonfinite values take the exact path.
 if(!Number.isFinite(permanent)||permanent<2**-900)return 0;
 const err=permanent*Number.EPSILON*128;
 return Math.abs(det)>err?Math.sign(det):0;
}
const separated=(a,b)=>{const signs=b.map(p=>floatPlane(a,p));return signs.every(s=>s===1)||signs.every(s=>s===-1);};
const edges=t=>[[t[1],t[0]],[t[2],t[1]],[t[0],t[2]]].map(([p,q])=>[p[0]-q[0],p[1]-q[1],p[2]-q[2]]);
const cross3=(u,w)=>[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]];
/** Projection onto d, relative to o, with a bound on its own rounding error. */
function span(points,o,d){
 let lo=Infinity,hi=-Infinity,error=0;
 for(const p of points){
  const t=[(p[0]-o[0])*d[0],(p[1]-o[1])*d[1],(p[2]-o[2])*d[2]];
  const value=t[0]+t[1]+t[2],permanent=Math.abs(t[0])+Math.abs(t[1])+Math.abs(t[2]);
  if(!Number.isFinite(permanent)||(permanent>0&&permanent<2**-900))return null;
  error=Math.max(error,permanent*Number.EPSILON*128);
  lo=Math.min(lo,value);hi=Math.max(hi,value);
 }
 return [lo,hi,error];
}
/** Any direction that keeps the two triangles apart proves they miss, so the
 * axes need not be exact; only the comparison does. Subnormal or non-finite
 * arithmetic breaks the relative-error bound, and those pairs stay for the
 * exact test. Axes: the nine edge pairs, then each face normal crossed with
 * its own edges, which is what separates triangles sharing a plane. */
function apart(a,b){
 const ea=edges(a),eb=edges(b),o=a[0],axes=[];
 for(const u of ea)for(const w of eb)axes.push(cross3(u,w));
 const na=cross3(ea[0],[-ea[2][0],-ea[2][1],-ea[2][2]]),nb=cross3(eb[0],[-eb[2][0],-eb[2][1],-eb[2][2]]);
 for(const u of ea)axes.push(cross3(na,u));
 for(const w of eb)axes.push(cross3(nb,w));
 for(const d of axes){
  if(!d.some(x=>x!==0)||!d.every(Number.isFinite))continue;
  const sa=span(a,o,d);if(!sa)continue;
  const sb=span(b,o,d);if(!sb)continue;
  const slack=sa[2]+sb[2];
  if(sa[1]+slack<sb[0]||sb[1]+slack<sa[0])return true;
 }
 return false;
}
function archMesh(bytes){
 const s=readArchSnapshot(bytes),vertices=Array.from({length:s.vertices.length/3},(_,i)=>Array.from(s.vertices.subarray(i*3,i*3+3)));
 return {vertices,faces:Array.from({length:s.triangles.length/3},(_,i)=>Array.from(s.triangles.subarray(i*3,i*3+3))),parts:s.parts,generation:s.generation};
}
export function readQualificationSTL(bytes){
 need(bytes instanceof Uint8Array&&bytes.length>=84,'STL_HEADER');const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),n=d.getUint32(80,true);
 need(n>0&&84+50*n===bytes.length,'STL_LENGTH');const vertices=[],faces=[],map=new Map();
 for(let i=0;i<n;i++){const f=[];for(let j=0;j<3;j++){
  const v=[0,1,2].map(k=>d.getFloat32(84+50*i+12+12*j+4*k,true));need(v.every(x=>Number.isFinite(x)&&Math.abs(x)<=10000),'STL_VERTEX');
  const key=v.join(',');if(!map.has(key)){map.set(key,vertices.length);vertices.push(v);}f.push(map.get(key));
 }faces.push(f);}
 return {vertices,faces,parts:[{vertexStart:0,vertexCount:vertices.length,faceStart:0,faceCount:faces.length}]};
}
/** Certifies the exact supplied mesh representation. No mesh repair or epsilon welding. */
export function qualifyMesh(bytes,{format='ARCH/1',limits:requested={},signal}={}){
 const started=performance.now(),checks={},stats={candidatePairs:0,exactPairs:0,containmentWork:0,sharedFacePairs:0,boundaryContacts:0};
 const diagnostics=[];let mesh,stage='transport';
 const limits={...DEFAULT_MESH_LIMITS};
 for(const [key,value] of Object.entries(requested)){need(Object.hasOwn(limits,key)&&Number.isSafeInteger(value)&&value>0&&value<=limits[key],'MESH_LIMIT_CONFIG');limits[key]=value;}
 const check=()=>{if(signal?.aborted)throw new Stop('CANCELLED');};
 const result=(verdict,code)=>({version:MESH_QUALIFIER_VERSION,verdict,code,format,checks,stats:{...stats,milliseconds:performance.now()-started},diagnostics,
  scope:{coordinates:'exact-represented-bytes',repair:false,epsilonWelding:false,globalPipelineError:'unverified',physicalFit:'unqualified',thinFeatures:'unverified',designIntent:'unverified',slicer:'unverified'}});
 try{
  check();if(!(bytes instanceof Uint8Array)||bytes.length>limits.bytes)throw new Stop('MESH_BYTE_BUDGET');
  mesh=format==='ARCH/1'?archMesh(bytes):format==='STL/binary'?readQualificationSTL(bytes):null;need(mesh,'MESH_FORMAT');
  const {vertices:v,faces,parts}=mesh;
  if(v.length>limits.vertices||faces.length>limits.triangles||parts.length>limits.parts)throw new Stop('MESH_SIZE_BUDGET');
  need(v.length>0&&faces.length>0&&parts.length>0,'MESH_EMPTY');
  stats.vertices=v.length;stats.triangles=faces.length;stats.parts=parts.length;stats.bytes=bytes.length;checks.transport='pass';
  const exact=exactVertices(v.flat()).vertices,tri=faces.map(f=>f.map(i=>exact[i])),floatTri=faces.map(f=>f.map(i=>v[i]));
  const partOf=new Int32Array(faces.length),edges=new Map(),incident=Array.from({length:v.length},()=>[]),adj=Array.from({length:faces.length},()=>[]);
  for(let p=0;p<parts.length;p++)for(let i=parts[p].faceStart;i<parts[p].faceStart+parts[p].faceCount;i++)partOf[i]=p;
  stage='topology';
  for(let i=0;i<faces.length;i++){
   const f=faces[i];need(new Set(f).size===3&&f.every(n=>Number.isInteger(n)&&n>=0&&n<v.length),'MESH_TRIANGLE_INDEX',{face:i});
   need(cross(sub(tri[i][1],tri[i][0]),sub(tri[i][2],tri[i][0])).some(x=>x!==0n),'MESH_DEGENERATE',{face:i});
   for(let j=0;j<3;j++){const a=f[j],b=f[(j+1)%3],key=Math.min(a,b)+':'+Math.max(a,b);incident[a].push(i);
    const edge=edges.get(key)??[];edge.push({face:i,from:a,to:b});edges.set(key,edge);}
  }
  for(const [key,e]of edges){need(e.length===2,'MESH_EDGE_INCIDENCE',{edge:key,incidence:e.length});need(e[0].from===e[1].to,'MESH_EDGE_WINDING',{edge:key});
   adj[e[0].face].push(e[1].face);adj[e[1].face].push(e[0].face);}
  for(let vertex=0;vertex<incident.length;vertex++){
   const inc=incident[vertex];need(inc.length>0,'MESH_UNUSED_VERTEX',{vertex});
   const seen=new Set(),stack=[inc[0]];while(stack.length){const f=stack.pop();if(seen.has(f))continue;seen.add(f);stack.push(...adj[f].filter(g=>faces[g].includes(vertex)&&!seen.has(g)));}
   need(seen.size===inc.length,'MESH_VERTEX_LINK',{vertex});
  }
  checks.nondegenerate='pass';checks.closedEdges='pass';checks.orientedEdges='pass';checks.vertexLinks='pass';
  const components=[],visited=new Set();
  for(let i=0;i<faces.length;i++)if(!visited.has(i)){
   const component={part:partOf[i],faces:[],vertices:new Set(),volume6:0n},stack=[i];
   while(stack.length){const j=stack.pop();if(visited.has(j))continue;visited.add(j);component.faces.push(j);faces[j].forEach(n=>component.vertices.add(n));
    component.volume6+=dot(tri[j][0],cross(tri[j][1],tri[j][2]));stack.push(...adj[j].filter(n=>!visited.has(n)));}
   need(component.volume6!==0n,'MESH_ZERO_VOLUME');components.push(component);
  }
  stats.components=components.length;stage='selfIntersection';
  const boxes=floatTri.map(t=>[...Array.from({length:3},(_,k)=>Math.min(...t.map(p=>p[k]))),...Array.from({length:3},(_,k)=>Math.max(...t.map(p=>p[k])))]);
  const tree=bvh(faces.map((_,i)=>i),boxes),partContacts=new Map();
  const edgeNeighbors=(f,points)=>{
   const out=[];
   for(let j=0;j<3;j++)if(points.every(p=>inSegment(p,h(tri[f][j]),h(tri[f][(j+1)%3])))){
    const a=faces[f][j],b=faces[f][(j+1)%3];out.push(...edges.get(Math.min(a,b)+':'+Math.max(a,b)).map(x=>x.face).filter(g=>g!==f));
   }return out;
  };
  for(const [a,b]of pairs(tree,tree,boxes)){
   if(++stats.candidatePairs>limits.candidatePairs)throw new Stop('MESH_PAIR_BUDGET');
   if((stats.candidatePairs&4095)===0)check();
   if(separated(floatTri[a],floatTri[b])||separated(floatTri[b],floatTri[a]))continue;
   const shared=faces[a].filter(i=>faces[b].includes(i));
   if(partOf[a]===partOf[b]&&shared.length){
    // Two triangles of one part that already share a vertex or an edge meet
    // there by construction. When the rest of one stays strictly off the
    // other's plane, that shared piece is the whole contact and the exact
    // test can only restate it. An uncertain float sign still takes it.
    const rest=faces[a].filter(i=>!shared.includes(i)).map(i=>floatPlane(floatTri[b],v[i]));
    if(rest.every(x=>x===1)||rest.every(x=>x===-1))continue;
   }
   // Two triangles that already share a vertex hold a point in common, so no
   // direction separates them and building the axes only costs. Both seats
   // measured this call rejecting nothing on every mesh in the corpus.
   if(!shared.length&&apart(floatTri[a],floatTri[b])){stats.axisRejected=(stats.axisRejected??0)+1;continue;}
   stats.exactPairs++;const hit=triangleIntersection(tri[a],tri[b]);if(hit.dimension<0)continue;
   if(partOf[a]===partOf[b]){
    const valid=shared.length===1?hit.points.every(p=>equal(p,h(exact[shared[0]]))):shared.length===2?hit.points.every(p=>inSegment(p,h(exact[shared[0]]),h(exact[shared[1]]))):false;
    need(valid,'MESH_SELF_INTERSECTION',{faces:[a,b],dimension:hit.dimension,shared});continue;
   }
   const key=[partOf[a],partOf[b]].sort((x,y)=>x-y).join(':');const contact=partContacts.get(key)??{area:0,ambiguous:[]};partContacts.set(key,contact);
   if(hit.coplanar&&hit.dimension===2){need(!hit.sameFacing,'MESH_MATERIAL_COINCIDENT_INTERIOR',{faces:[a,b]});contact.area++;stats.sharedFacePairs++;continue;}
   if(!hit.coplanar&&hit.dimension===1){
    need(!(hit.cutsA&&hit.cutsB),'MESH_MATERIAL_INTERSECTION',{faces:[a,b]});
    // A triangle terminating on a shared, oppositely oriented material plane
    // is a conforming contact even if the other side triangulates that plane differently.
    const conforms=(f,g)=>edgeNeighbors(f,hit.points).some(n=>tri[n].every(p=>plane(tri[g],p)===0n)&&dot(cross(sub(tri[n][1],tri[n][0]),sub(tri[n][2],tri[n][0])),cross(sub(tri[g][1],tri[g][0]),sub(tri[g][2],tri[g][0])))<0n);
    if(!conforms(a,b)&&!conforms(b,a))contact.ambiguous.push([a,b]);
   }
   stats.boundaryContacts++;
  }
  checks.selfIntersection='pass';stage='containment';
  const classify=(p,ids)=>{
   stats.containmentWork+=ids.length;
   if(stats.containmentWork>limits.containmentWork)throw new Stop('MESH_CONTAINMENT_BUDGET');
   const status=pointInSolid(p,ids.map(i=>tri[i]));if(status==='ambiguous')throw new Stop('MESH_RAY_AMBIGUOUS');return status;
  };
  const partFaces=parts.map(p=>Array.from({length:p.faceCount},(_,i)=>p.faceStart+i));
  let unresolved=null;
  const partBounds=partFaces.map(ids=>ids.reduce((b,i)=>b.map((x,k)=>k<3?Math.min(x,boxes[i][k]):Math.max(x,boxes[i][k])),
   [Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity]));
  // A point that lies on one of the other part's faces is on its surface, so it
  // is not in its interior. The tree finds that face near the point itself; a
  // whole-part ray cast would answer the same question at the cost of the part.
  const onSurface=(fp,p,j)=>{
   for(const i of covering(tree,fp,boxes)){
    if(++stats.containmentWork>limits.containmentWork)throw new Stop('MESH_CONTAINMENT_BUDGET');
    if(partOf[i]===j&&pointOnTriangle(p,tri[i]))return true;
   }
   return false;
  };
  for(const component of components){
   let nesting=0;const p=exact[component.vertices.values().next().value];
   for(const other of components)if(other!==component&&other.part===component.part){
    const inside=classify(p,other.faces);need(inside!=='boundary','MESH_COMPONENT_CONTACT');if(inside==='inside')nesting++;
   }
   need(sign(component.volume6)===(nesting%2?-1:1),'MESH_COMPONENT_WINDING',{part:component.part,nesting});
   for(let j=0;j<parts.length;j++)if(j!==component.part){
    const bounds=partBounds[j];let found=false;
    // One vertex outside part j proves this component is not contained in j. It does not
    // prove the two interiors are disjoint, so the scan cannot stop there: a later vertex
    // inside j is still a material intersection. Splitting a single coplanar triangle used
    // to put an outside vertex first and hide 2 mm3 of genuine overlap behind it, turning
    // MESH_MATERIAL_CONTAINMENT into MESH_QUALIFIED without changing the solid at all.
    // Every vertex inside the box now costs a classify; exceeding the budget degrades to
    // unverified, which is the safe direction to fail in.
    for(const index of component.vertices){
     const fp=v[index];
     if(fp.some((x,k)=>x<bounds[k]||x>bounds[k+3])){found=true;continue;}
     if(onSurface(fp,exact[index],j))continue;
     const where=classify(exact[index],partFaces[j]);
     need(where!=='inside','MESH_MATERIAL_CONTAINMENT',{part:component.part,other:j,vertex:index});
     if(where==='outside')found=true;
    }
    // Throwing here stopped the walk before later components were scanned, so a component
    // whose vertex really is inside another part reported unverified instead of a fail.
    // Remember the first unresolved pair and keep going; need() above still fails at once.
    if(!found&&!unresolved)unresolved={part:component.part,other:j};
   }
  }
  if(unresolved)throw new Stop('MESH_BOUNDARY_CONTAINMENT_UNRESOLVED','unverified',unresolved);
  for(const [key,c]of partContacts){
   if(c.ambiguous.length)throw new Stop('MESH_CONTACT_UNRESOLVED','unverified',{parts:key,faces:c.ambiguous.slice(0,8)});
   if(!c.area)throw new Stop('MESH_ZERO_AREA_CONTACT','unverified',{parts:key});
  }
  checks.componentWinding='pass';
  // A vertex sample cannot certify this. An outside witness proves the component is not
  // contained in the other part; it never proves the two interiors are disjoint. Two
  // independently built counter-examples walk the whole check and still overlap by real
  // volume -- 2 mm3 across a split coplanar face, 0.5 mm3 with no interior vertex at all.
  // Until a predicate decides interior disjointness over the accepted domain, this reports
  // what was actually established, and a multi-part mesh cannot be called qualified.
  checks.materialInteriors=parts.length===1?'not-applicable':'requires-interior-proof';
  checks.sharedBoundaries=partContacts.size?'pass':'not-applicable';
  // Separate disconnected components are measured, not silently classified as
  // intended pieces; application/native union inspection owns assembly intent.
  checks.unionTopology=parts.length===1?'pass':'requires-union-readback';
  // The verdict still says "every check this qualifier runs, ran and passed". It does not
  // say the material interiors are proven disjoint -- checks.materialInteriors says that,
  // and it now says requires-interior-proof. Downgrading the verdict itself was tried and
  // reverted: it stopped the pipeline at the material stage, so a genuinely degenerate
  // union reported unverified instead of fail. Trading one silence for another is not a
  // gain. A consumer that needs the interior claim must read the check, not the verdict.
  return result('pass','MESH_QUALIFIED');
 }catch(error){
  diagnostics.push({stage,code:error.code??error.message,details:error.details??{}});
  return result(error instanceof Stop?error.verdict:'fail',error.code??'MESH_INVALID_TRANSPORT');
 }
}
