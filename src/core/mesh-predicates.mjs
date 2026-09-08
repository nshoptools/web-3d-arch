// Exact predicates for the represented binary64 coordinates. No tolerance weld.
// Homogeneous points have a positive denominator. Bounds limit integer growth.
export const sign=n=>n<0n?-1:n>0n?1:0;
export const sub=(a,b)=>a.map((v,i)=>v-b[i]);
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0n);
const abs=n=>n<0n?-n:n;
const gcd=(a,b)=>{a=abs(a);b=abs(b);while(b){const r=a%b;a=b;b=r;}return a;};
export function normalized(p){if(p[3]<0n)p=p.map(x=>-x);let g=p.reduce(gcd);return g>1n?p.map(x=>x/g):p;}
export const h=p=>[...p,1n];
export const equal=(a,b)=>a.slice(0,3).every((v,i)=>v*b[3]===b[i]*a[3]);
export const compare=(a,b,k)=>sign(a[k]*b[3]-b[k]*a[3]);
export const interpolate=(a,b,da,db)=>normalized([...a.map((v,i)=>v*(-db)+b[i]*da),da-db]);
export const plane=(tri,p)=>dot(cross(sub(tri[1],tri[0]),sub(tri[2],tri[0])),sub(p,tri[0]));
export function exactVertices(vertices){
 const d=new DataView(new ArrayBuffer(8)),parts=[];let exponent=0;
 for(const v of vertices){
  if(!Number.isFinite(v))throw Error('MESH_NONFINITE');
  d.setFloat64(0,v);const u=d.getBigUint64(0),e=Number((u>>52n)&2047n),frac=u&((1n<<52n)-1n);
  let m=e?(1n<<52n)|frac:frac;if(u>>63n)m=-m;
  const shift=e?e-1075:-1074;parts.push([m,shift]);if(m&&shift<exponent)exponent=shift;
 }
 if(-exponent>1100)throw Error('MESH_INTEGER_BUDGET');
 const result=[];for(let i=0;i<parts.length;i+=3)result.push(parts.slice(i,i+3).map(([m,e])=>m?m<<BigInt(e-exponent):0n));
 return {vertices:result,exponent};
}
export function projectAxes(tri){const n=cross(sub(tri[1],tri[0]),sub(tri[2],tri[0]));let k=0;for(let i=1;i<3;i++)if(abs(n[i])>abs(n[k]))k=i;return [0,1,2].filter(i=>i!==k);}
export function orient2(a,b,c,axes){
 const [i,j]=axes;
 const x=b[i]*a[3]-a[i]*b[3],y=b[j]*a[3]-a[j]*b[3];
 return x*(c[j]*a[3]-a[j]*c[3])-y*(c[i]*a[3]-a[i]*c[3]);
}
function inside(p,tri,axes){const s=tri.map((a,i)=>sign(orient2(a,tri[(i+1)%3],p,axes)));return !s.some(x=>x<0)||!s.some(x=>x>0);}
export function inSegment(p,a,b){
 if(!cross(sub(p.slice(0,3).map(v=>v*a[3]),a.slice(0,3).map(v=>v*p[3])),
 sub(b.slice(0,3).map(v=>v*a[3]),a.slice(0,3).map(v=>v*b[3]))).every(x=>x===0n))return false;
 return [0,1,2].every(k=>compare(a,b,k)<=0?compare(a,p,k)<=0&&compare(p,b,k)<=0:compare(b,p,k)<=0&&compare(p,a,k)<=0);
}
function coplanar(a,b){
 const axes=projectAxes(a),ah=a.map(h),bh=b.map(h),points=[];
 const add=p=>{if(!points.some(q=>equal(p,q)))points.push(p);};
 ah.filter(p=>inside(p,bh,axes)).forEach(add);bh.filter(p=>inside(p,ah,axes)).forEach(add);
 for(let i=0;i<3;i++)for(let j=0;j<3;j++){
  const a0=ah[i],a1=ah[(i+1)%3],b0=bh[j],b1=bh[(j+1)%3];
  const x=orient2(b0,b1,a0,axes),y=orient2(b0,b1,a1,axes);
  const z=orient2(a0,a1,b0,axes),w=orient2(a0,a1,b1,axes);
  if(sign(x)*sign(y)<0&&sign(z)*sign(w)<0)add(interpolate(a[i],a[(i+1)%3],x,y));
 }
 let dimension=points.length?0:-1;
 if(points.length>1)dimension=1;
 if(points.length>2&&points.slice(2).some(p=>orient2(points[0],points[1],p,axes)!==0n))dimension=2;
 return {dimension,points,coplanar:true,sameFacing:sign(dot(cross(sub(a[1],a[0]),sub(a[2],a[0])),cross(sub(b[1],b[0]),sub(b[2],b[0]))))>0};
}
function cut(t,ds){
 const points=[];const add=p=>{if(!points.some(q=>equal(p,q)))points.push(p);};
 for(let i=0;i<3;i++){const j=(i+1)%3;if(ds[i]===0n)add(h(t[i]));if(sign(ds[i])*sign(ds[j])<0)add(interpolate(t[i],t[j],ds[i],ds[j]));}
 return points;
}
export function triangleIntersection(a,b){
 const da=a.map(p=>plane(b,p)),db=b.map(p=>plane(a,p));
 const separate=d=>d.every(v=>v>0n)||d.every(v=>v<0n);
 if(separate(da)||separate(db))return {dimension:-1,points:[]};
 if(da.every(v=>v===0n)&&db.every(v=>v===0n))return coplanar(a,b);
 const ap=cut(a,da),bp=cut(b,db);if(!ap.length||!bp.length)return {dimension:-1,points:[]};
 const direction=cross(cross(sub(a[1],a[0]),sub(a[2],a[0])),cross(sub(b[1],b[0]),sub(b[2],b[0])));
 const k=direction.findIndex(v=>v!==0n);if(k<0)return {dimension:-1,points:[]};
 ap.sort((x,y)=>compare(x,y,k));bp.sort((x,y)=>compare(x,y,k));
 const lo=compare(ap[0],bp[0],k)>0?ap[0]:bp[0],ae=ap.at(-1),be=bp.at(-1),hi=compare(ae,be,k)<0?ae:be;
 const c=compare(lo,hi,k);
 return {dimension:c>0?-1:c===0?0:1,points:c>0?[]:c===0?[lo]:[lo,hi],coplanar:false,
  cutsA:da.some(v=>v>0n)&&da.some(v=>v<0n),cutsB:db.some(v=>v>0n)&&db.some(v=>v<0n)};
}
export function pointInSolid(point,triangles,{maxRays=12}={}){
 // Bounded deterministic generic rays; any edge/vertex hit retries, never votes.
 const dirs=[[1n,37n,101n],[103n,29n,7n],[13n,1n,89n],[53n,61n,1n],[17n,43n,127n],[131n,19n,31n],[47n,113n,5n],[11n,107n,71n],[73n,23n,109n],[79n,97n,41n],[59n,137n,83n],[139n,149n,157n]];
 for(const direction of dirs.slice(0,maxRays)){
  let count=0,bad=false;
  for(const tri of triangles){
   const n=cross(sub(tri[1],tri[0]),sub(tri[2],tri[0])),d=dot(n,direction),distance=dot(n,sub(tri[0],point));
   if(distance===0n){
    const hp=h(point),axes=projectAxes(tri);
    if(inside(hp,tri.map(h),axes))return 'boundary';
    // An entire ray lies in this face plane. Do not infer parity from an
    // omitted coplanar hit; retry another deterministic direction.
    if(d===0n){bad=true;break;}
   }
   if(d===0n||distance===0n||sign(d)!==sign(distance))continue;
   const p=normalized([...point.map((v,i)=>v*d+direction[i]*distance),d]),axes=projectAxes(tri);
   const s=tri.map((v,i)=>sign(orient2(h(v),h(tri[(i+1)%3]),p,axes)));
   if(s.some(v=>v<0)&&s.some(v=>v>0))continue;
   if(s.some(v=>v===0)){bad=true;break;}count++;
  }
  if(!bad)return count%2?'inside':'outside';
 }
 return 'ambiguous';
}
