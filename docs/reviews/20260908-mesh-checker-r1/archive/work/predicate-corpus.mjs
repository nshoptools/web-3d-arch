import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {exactVertices,triangleIntersection} from './review-source/src/core/mesh-predicates.mjs';
const dir=import.meta.dirname,source=fs.readFileSync(path.join(dir,'review-source/src/core/mesh-qualification.mjs'),'utf8');
const filter=source.slice(source.indexOf('function floatPlane('),source.indexOf('function archMesh('))+'\nexport {floatPlane,separated};\n';
const isolated=path.join(dir,'isolated-floating-filter.mjs');if(fs.existsSync(isolated))throw Error('Preserve prior extracted code');fs.writeFileSync(isolated,filter);
const {separated}=await import(pathToFileURL(isolated));
let seed=0x8b177efd;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
const num=()=>Math.floor(rand()*17)-8,tri=()=>Array.from({length:3},()=>[num(),num(),num()]);
const tests=[];const add=(kind,a,b)=>{
 const v=exactVertices([...a,...b].flat()).vertices;
 const nondeg=t=>{const x=t[1].map((n,i)=>n-t[0][i]),y=t[2].map((n,i)=>n-t[0][i]);return x.some((_,i)=>x[(i+1)%3]*y[(i+2)%3]!==x[(i+2)%3]*y[(i+1)%3]);};
 if(!nondeg(v.slice(0,3))||!nondeg(v.slice(3)))return;
 const r=triangleIntersection(v.slice(0,3),v.slice(3));tests.push({kind,a,b,intersects:r.dimension>=0,dimension:r.dimension,filterSeparated:separated(a,b)||separated(b,a)});
};
for(let i=0;i<1800;i++){
 const a=tri(),b=tri();let kind='integer-generic';
 if(i%5===0){a.forEach(p=>p[2]=0);b.forEach(p=>p[2]=0);kind='coplanar';}
 if(i%5===1){b[0]=a[0].slice();kind='shared-vertex';}
 if(i%5===2){b[0]=a[1].slice();b[1]=a[0].slice();kind='shared-edge';}
 add(kind,a,b);
}
for(let i=0;i<800;i++){
 const scale=2**([-1074,-1000,-600,-300,-30,0,9][i%7]),base=i%3===0?5000:0;
 const a=tri().map(p=>p.map(x=>x*scale+base)),b=tri().map(p=>p.map(x=>x*scale+base));add('dyadic-dynamic-range',a,b);
}
for(let i=0;i<500;i++){
 const a=tri().map(([x,y])=>[x,y,x+y]),b=tri().map(([x,y])=>[x,y,x+y]);
 const delta=2**(-45-(i%8));b[i%3][2]+=delta;add('near-coplanar',a,b);
}
fs.writeFileSync(path.join(process.env.PROJECT_REVIEW_RUN,'evidence/predicate-corpus.json'),JSON.stringify({seed:'0x8b177efd',tests}));
console.log(JSON.stringify({pairs:tests.length,kindCounts:tests.reduce((r,t)=>(r[t.kind]=(r[t.kind]??0)+1,r),{})}));
