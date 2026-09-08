// Independent arithmetic over serialized bytes, never generator status/volume.
import {parseXml,readZip} from '../../src/printing/src/zip-inspect.mjs';
export const near=(a,b,t=1e-6)=>{if(Math.abs(a-b)>t)throw Error(`oracle ${a} != ${b} within ${t}`);};
const check=(v,m)=>{if(!v)throw Error('oracle '+m);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sub=(a,b)=>a.map((v,i)=>v-b[i]);const dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0);
export function stlOracle(bytes){
 const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.length);check(bytes.length===84+50*d.getUint32(80,true),'STL length');
 let volume=0;const bbox=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity],edges=new Map(),faces=[];
 for(let at=84;at<bytes.length;at+=50){const values=Array.from({length:12},(_,i)=>d.getFloat32(at+4*i,true)),normal=values.slice(0,3),p=[values.slice(3,6),values.slice(6,9),values.slice(9,12)];
  const n=cross(sub(p[1],p[0]),sub(p[2],p[0]));near(Math.hypot(...normal),1,2e-7);near(dot(n,normal)/Math.hypot(...n),1,2e-7);volume+=dot(p[0],cross(p[1],p[2]))/6;faces.push(p);
  for(const a of p)for(let i=0;i<3;i++){bbox[i]=Math.min(bbox[i],a[i]);bbox[i+3]=Math.max(bbox[i+3],a[i]);}
  for(let i=0;i<3;i++){const a=p[i].join(','),b=p[(i+1)%3].join(','),key=[a,b].sort().join('/');const e=edges.get(key)??[0,0];e[0]++;e[1]+=a<b?1:-1;edges.set(key,e);}
 }
 check(volume>0,'positive volume');check([...edges.values()].every(e=>e[0]===2&&e[1]===0),'welded oriented edges');return {volume,bbox,triangles:faces.length};
}
export function sectionOracle(bytes){
 const doc=parseXml(bytes),paths=Array.from(doc.getElementsByTagName('path')),samples=[];
 for(const p of paths){const tokens=p.getAttribute('d').match(/[MLZ]|[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?/gi)??[];let ring=[],rings=[],at=0;
  while(at<tokens.length){const c=tokens[at++];if(c==='Z'){check(ring.length>=3,'section closed ring');rings.push(ring);ring=[];}else{check(c==='M'||c==='L','linear final-section oracle');ring.push([Number(tokens[at++]),Number(tokens[at++])]);}}
  check(!ring.length,'section close');const areas=rings.map(r=>r.reduce((n,a,i)=>{const b=r[(i+1)%r.length];return n+a[0]*b[1]-b[0]*a[1];},0)/2);
  samples.push({area:Math.abs(areas.reduce((a,b)=>a+b,0)),rings:rings.length,areas});
 }return {samples,width:doc.documentElement.getAttribute('width'),height:doc.documentElement.getAttribute('height')};
}
export function zipOracle(bytes){const entries=readZip(bytes);return {entries:[...entries.keys()],groups:[...entries].filter(([n])=>n.endsWith('.stl')).map(([name,b])=>({name,...stlOracle(b)})),manifest:JSON.parse(new TextDecoder().decode(entries.get('manifest.json')))};}
