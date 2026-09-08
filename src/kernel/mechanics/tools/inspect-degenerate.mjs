import fs from 'node:fs';
import {readSnapshot,partMesh} from '../tests/oracles/mechanical-oracle.mjs';
const prefix=process.argv[2],s=readSnapshot(fs.readFileSync(prefix+'.bin')),meta=JSON.parse(fs.readFileSync(prefix+'.json'));
for(let i=0;i<s.parts.length;i++){
  const m=partMesh(s,s.parts[i]);let small=0,min=Infinity,example;
  for(const face of m.faces){
    const [a,b,c]=face.map(v=>m.vertices[v]),u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]);
    const area=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]);
    if(area<min){min=area;example=[a,b,c];}if(area<=1e-14)small++;
  }
  if(small)console.log(JSON.stringify({part:i,feature:meta.features[meta.parts[i].feature].id,min,small,example}));
}
