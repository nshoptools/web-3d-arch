import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const root=process.env.PROJECT_ROOT;if(!root)throw Error('PROJECT_ROOT required');
const {readSTL,inspectMesh,verticalIntersections}=await import(pathToFileURL(path.join(root,'tests/oracles/mesh-oracle.mjs')));
const {readZip}=await import(pathToFileURL(path.join(root,'src/printing/src/zip-inspect.mjs')));
const {DOMParser}=createRequire(path.join(root,'src/printing/package.json'))('@xmldom/xmldom');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
export const oracleSources=['tests/oracles/mesh-oracle.mjs','src/printing/src/zip-inspect.mjs','src/printing/src/contracts.mjs'].map(p=>({path:p,sha256:hash(readFileSync(path.join(root,p)))}));
const close=(a,b,tol=1e-4)=>assert.ok(Math.abs(a-b)<=tol,`${a} ~= ${b} (tol ${tol})`);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
function mesh(bytes,expected){
 const parsed=readSTL(bytes);let inspected;
 if(expected.topologyFail){assert.throws(()=>inspectMesh(parsed));inspected={volume:parsed.faces.reduce((s,f)=>{const [a,b,c]=f.map(i=>parsed.vertices[i]);return s+dot(a,cross(b,c))/6},0),euler:null};}
 else inspected=inspectMesh(parsed);
 for(let t=0;t<parsed.faces.length;t++){const [a,b,c]=parsed.faces[t].map(i=>parsed.vertices[i]);const n=cross(sub(b,a),sub(c,a)),length=Math.hypot(...n);const written=[0,1,2].map(i=>bytes.readFloatLE(84+t*50+i*4));close(Math.hypot(...written),1,2e-7);close(dot(n,written)/length,1,2e-7);assert.equal(bytes.readUInt16LE(84+t*50+48),0);}
 const bbox=[0,1,2].map(a=>Math.min(...parsed.vertices.map(v=>v[a]))).concat([0,1,2].map(a=>Math.max(...parsed.vertices.map(v=>v[a]))));
 return {...inspected,bbox,parsed};
}
function rings(d){
 const tokens=d.match(/[MLZ]|[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?/g)??[];let contours=[],p=[],i=0;
 while(i<tokens.length){const c=tokens[i++];if(c==='Z'){assert.ok(p.length>=3);contours.push(p);p=[];continue;}assert.ok(c==='M'||c==='L');const x=Number(tokens[i++]),y=Number(tokens[i++]);assert.ok(Number.isFinite(x)&&Number.isFinite(y));p.push([x,y]);}
 assert.equal(p.length,0);return contours;
}
function signedArea(r){return r.reduce((a,p,i)=>{const q=r[(i+1)%r.length];return a+p[0]*q[1]-p[1]*q[0]},0)/2;}
function inside(rings,[x,y]){let winding=0;for(const ring of rings)for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],side=(b[0]-a[0])*(y-a[1])-(x-a[0])*(b[1]-a[1]);if(a[1]<=y&&b[1]>y&&side>0)winding++;if(a[1]>y&&b[1]<=y&&side<0)winding--;}return winding!==0;}
export function oracle(test,result,bytes){
 const e=test.expect;assert.equal(result.sourceUnchanged,true);assert.equal(result.inputConsumed,true);
 if(e.error){assert.equal(result.ok,false);assert.match(result.error,new RegExp(e.error));assert.equal(result.phase,3);return {rejected:result.error};}
 assert.equal(result.ok,true,result.error);assert.equal(result.phase,2);assert.equal(result.progress,1000);
 assert.ok(bytes?.length>0);const m=result.metadata;assert.equal(m.download.bytes,bytes.length);assert.equal(m.download.sha256,hash(bytes));
 assert.equal(m.scope,'final-post-csg-manufacturing-scene');assert.equal(m.sourceProjectRevision,test.config.revision);assert.deepEqual(m.mapping,test.config.mapping.map(a=>({part:a.part,slot:a.slot,colorRGBA:a.rgba.toString(16).padStart(8,'0'),sourceIndex:a.source,materialSourceId:a.materialSource})));
 for(const warning of e.warnings??[])assert.ok(m.warnings.includes(warning));if(e.filename)assert.equal(m.download.filename,e.filename);
 if(e.transform)assert.deepEqual(m.exportTransformRowMajor,e.transform);if(e.inputSum)close(m.inputVolumeSumMm3,e.inputSum);
 const metrics={format:test.config.format,groups:m.groups.length,meshes:[],sections:[]};
 if(test.config.format===3){
  const doc=new DOMParser().parseFromString(bytes.toString('utf8'),'image/svg+xml');assert.equal(doc.getElementsByTagName('parsererror').length,0);
  const svg=doc.documentElement;assert.equal(svg.namespaceURI,'http://www.w3.org/2000/svg');assert.equal(svg.getAttribute('data-scope'),'final-post-csg-section');
  assert.ok(svg.getAttribute('width').endsWith(test.config.units?'in':'mm'));const vb=svg.getAttribute('viewBox').split(' ').map(Number);if(e.svgBBox)e.svgBBox.forEach((x,i)=>close(vb[i],x,1e-10));
  const paths=Array.from(doc.getElementsByTagName('path'));const areas=[],scale=test.config.units?25.4:1;const all=[];
  for(const p of paths){const r=rings(p.getAttribute('d'));const area=Math.abs(r.reduce((s,a)=>s+signedArea(a),0))*scale**2;areas.push(area);all.push(r);assert.equal(p.getAttribute('fill-rule'),'nonzero');const rgba=p.getAttribute('data-rgba');assert.equal(p.getAttribute('fill'),'#'+rgba.slice(0,6));}
  assert.equal(areas.length,e.areas.length);e.areas.forEach((a,i)=>close(areas[i],a,1e-7));
  if(e.samples){const gs=Array.from(doc.getElementsByTagName('g'));assert.equal(gs.length,e.samples);assert.equal(gs[0].hasAttribute('style'),false);assert.ok(gs.slice(1).every(g=>g.getAttribute('style')==='display:none'));}
  const convert=p=>[(test.config.side?-p[0]:p[0])/scale,-p[1]/scale];if(e.hole)assert.equal(inside(all[0],convert(e.hole)),false);if(e.solid)assert.equal(inside(all[0],convert(e.solid)),true);
  metrics.sections=areas;metrics.svgBBox=vb;
 }else{
  let files;
  if(test.config.format===2){const entries=readZip(new Uint8Array(bytes));assert.ok(entries.has('manifest.json'));const manifest=JSON.parse(new TextDecoder().decode(entries.get('manifest.json')));assert.deepEqual(manifest.mapping,m.mapping);assert.deepEqual(manifest.exportTransformRowMajor,m.exportTransformRowMajor);
   files=manifest.files.map(f=>{const b=Buffer.from(entries.get(f.name));assert.equal(hash(b),f.sha256);assert.equal(b.length,f.bytes);return b;});assert.equal(entries.size,files.length+1);
  }else files=[bytes];
  const measured=files.map(b=>mesh(b,e));metrics.meshes=measured.map(({volume,euler,bbox,faceCount})=>({volume,euler,bbox,faceCount}));
  const total=measured.reduce((s,a)=>s+a.volume,0);close(total,e.volume);close(m.unionVolumeMm3,e.unionVolume??e.volume);if(e.groups)assert.equal(files.length,e.groups);
  if(e.bbox)e.bbox.forEach((x,i)=>close(measured[0].bbox[i],x,3e-6));if(e.euler!==undefined)assert.equal(measured[0].euler,e.euler);
  if(e.groupVolumes)e.groupVolumes.forEach((v,i)=>close(measured[i].volume,v));if(e.groupBounds)e.groupBounds.forEach((b,i)=>b.forEach((x,j)=>close(measured[i].bbox[j],x,3e-6)));
  for(const [x,y,hits]of e.probes??[]){const actual=verticalIntersections(measured[0].parsed,x,y);assert.equal(actual.length,hits.length);hits.forEach((z,i)=>close(actual[i],z,1e-7));}
 }
 return metrics;
}
