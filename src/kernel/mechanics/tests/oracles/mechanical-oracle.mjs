import assert from 'node:assert/strict';
import {readSnapshot,inspectMesh,readSTL} from './indexed-oracle.mjs';
export {readSnapshot,inspectMesh,readSTL};
// Independent measurements: this module never imports generator formulae,
// Manifold, Clipper2, or reported volume/curve bounds as expected values.
export const close=(actual,expected,tolerance=1e-6,message='dimension')=>assert.ok(Math.abs(actual-expected)<=tolerance,`${message}: ${actual} expected ${expected} ±${tolerance}`);
export function partMesh(scene,part){
  return {vertices:scene.vertices.slice(part.vertexStart,part.vertexStart+part.vertexCount),
    faces:scene.faces.slice(part.faceStart,part.faceStart+part.faceCount).map(f=>f.map(v=>v-part.vertexStart))};
}
export function bbox(mesh){
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const v of mesh.vertices)for(let a=0;a<3;a++){min[a]=Math.min(min[a],v[a]);max[a]=Math.max(max[a],v[a]);}
  return {min,max,size:max.map((v,i)=>v-min[i])};
}
export function intersections(mesh,axis,u,v){
  const a=(axis+1)%3,b=(axis+2)%3,hits=[];
  for(const face of mesh.faces){
    const [p,q,r]=face.map(i=>mesh.vertices[i]);
    const d=(q[b]-r[b])*(p[a]-r[a])+(r[a]-q[a])*(p[b]-r[b]);
    if(Math.abs(d)<1e-13)continue;
    const x=((q[b]-r[b])*(u-r[a])+(r[a]-q[a])*(v-r[b]))/d;
    const y=((r[b]-p[b])*(u-r[a])+(p[a]-r[a])*(v-r[b]))/d;
    if(x>=-1e-10&&y>=-1e-10&&x+y<=1+1e-10)hits.push(x*p[axis]+y*q[axis]+(1-x-y)*r[axis]);
  }
  hits.sort((a,b)=>a-b);
  return hits.filter((x,i)=>i===0||x-hits[i-1]>1e-7);
}
export function inside(mesh,point){
  const hits=intersections(mesh,0,point[1],point[2]);
  return hits.filter(x=>x>point[0]+1e-7).length%2===1;
}
export function transform(mesh,m){
  return {faces:mesh.faces,vertices:mesh.vertices.map(p=>[0,1,2].map(a=>m[a]*p[0]+m[4+a]*p[1]+m[8+a]*p[2]+m[12+a]))};
}
export function inspectScene(scene){
  return scene.parts.map(p=>({bounds:bbox(partMesh(scene,p)),...inspectMesh(partMesh(scene,p))}));
}
export function unionAt(scene,metadata,point,group=0,preview=false){
  return scene.parts.some((p,i)=>metadata.parts[i].group===group&&inside(preview?transform(partMesh(scene,p),metadata.parts[i].previewTransform):partMesh(scene,p),point));
}
export function sectionSegments(mesh,z){
  const segments=[];
  for(const face of mesh.faces){
    const hits=[];
    for(let i=0;i<3;i++){
      const a=mesh.vertices[face[i]],b=mesh.vertices[face[(i+1)%3]];
      if((a[2]<z&&b[2]>z)||(b[2]<z&&a[2]>z)){
        const t=(z-a[2])/(b[2]-a[2]);hits.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);
      }
    }
    if(hits.length===2)segments.push(hits);
  }
  return segments;
}
export function radialExtrema(segments,cx,cy,range){
  const distances=[];
  for(const [a,b] of segments){
    const ra=Math.hypot(a[0]-cx,a[1]-cy),rb=Math.hypot(b[0]-cx,b[1]-cy);
    if(ra<range[0]||rb<range[0]||ra>range[1]||rb>range[1])continue;
    const dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy;
    const t=den?Math.max(0,Math.min(1,((cx-a[0])*dx+(cy-a[1])*dy)/den)):0;
    distances.push(ra,rb,Math.hypot(a[0]+t*dx-cx,a[1]+t*dy-cy));
  }
  assert.ok(distances.length>0,'radial section has measured edges');
  return {min:Math.min(...distances),max:Math.max(...distances)};
}
export function collisionProbes(a,b,points){
  for(const p of points)assert.ok(!(inside(a,p)&&inside(b,p)),`independent collision probe ${p}`);
}
