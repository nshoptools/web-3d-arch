import fs from'node:fs';import path from'node:path';import assert from'node:assert/strict';import{createHash}from'node:crypto';
import{readSnapshot,inspectMesh,verticalIntersections}from'../../../tests/oracles/mesh-oracle.mjs';
const run=path.resolve(process.env.PROJECT_REVIEW_RUN),dirs=process.argv.slice(2).map(x=>path.resolve(run,x));assert(dirs.length);
const results=[];const near=(x,y,n)=>assert(Math.abs(x-y)<1e-7,n+': '+x+' vs '+y);
function measure(b){const s=readSnapshot(b),parts=s.parts.map(p=>inspectMesh({vertices:s.vertices,faces:s.faces.slice(p.faceStart,p.faceStart+p.faceCount)}));
 const hash=createHash('sha256');const rows=s.faces.map(f=>{const points=f.map(i=>s.vertices[i].map(x=>Object.is(x,-0)?0:x));const cycles=[0,1,2].map(i=>JSON.stringify([...points.slice(i),...points.slice(0,i)]));return cycles.sort()[0];}).sort();hash.update(JSON.stringify(rows));
 return {s,parts,volume:parts.reduce((n,p)=>n+p.volume,0),triangleCoordinateHash:hash.digest('hex')};}
for(const dir of dirs){
 assert(dir.startsWith(run+path.sep));
 const base=measure(fs.readFileSync(path.join(dir,'parent.arch')));near(base.volume,8288,'area1184 × (base6+art1)');assert.deepEqual(verticalIntersections(base.s,-13,-7),[],'original through-hole');
 for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.arch')&&!/parent|material|transaction|strap/.test(n))){
  const m=measure(fs.readFileSync(path.join(dir,name)));let expected;
  if(name.includes('side-union')){const angle=35*Math.PI/180,xa=19,xb=19+2*Math.cos(angle),xc=19-2*Math.sin(angle);expected=8288+6*(xb-20)**2/((xb-xa)*(xb-xc));}
  else if(name.includes('intersection'))expected=1184+6; // only selected body is intersected; art remains
  else if(name.includes('disconnected'))expected=8288+12;
  else if(name.includes('holed'))expected=8288-12;
  else expected=8288-6;
  near(m.volume,expected,name);assert.deepEqual(verticalIntersections(m.s,-13,-7),[],'original hole retained '+name);
  if(name.includes('holed')){
   const a=27*Math.PI/180,at=(x,y)=>[3+x*Math.cos(a)-y*Math.sin(a),-2+x*Math.sin(a)+y*Math.cos(a)];
   const cut=verticalIntersections(m.s,...at(.5,.5)),kept=verticalIntersections(m.s,...at(2,2));
   assert(cut.includes(1)&&cut.includes(2),'full ring tool creates bounded cavity');
   assert(!kept.includes(1)&&!kept.includes(2),'tool hole preserves the central source column');
  }
  results.push({directory:path.relative(run,dir),name,volume:m.volume,expectedVolume:expected,parts:m.parts.map(p=>({volume:p.volume,euler:p.euler})),triangleCoordinateHash:m.triangleCoordinateHash});
 }
}
const parity=[];
const natives=results.filter(r=>r.directory.includes('root-native'));
for(const a of natives){const b=results.find(r=>r.name===a.name&&!r.directory.includes('root-native'));if(!b)continue;
 near(a.volume,b.volume,'native/WASM analytic parity');assert.equal(a.parts.length,b.parts.length);
 parity.push({name:a.name,native:a.directory,wasm:b.directory,volumeDelta:Math.abs(a.volume-b.volume),exactTriangleCoordinateMultiset:a.triangleCoordinateHash===b.triangleCoordinateHash});
}
const report={version:'independent-root-csg-oracles/1',reader:'tests/oracles/mesh-oracle.mjs',scope:'analytic represented geometry; comparison tolerance1e-7mm3 is test arithmetic only, not a global error or fit receipt',results,parity};
const out=path.join(run,'reports/root-oracles.json');fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify({checked:results.length,parity:parity.length,maxVolumeDelta:Math.max(0,...parity.map(p=>p.volumeDelta))}));
