import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {readSnapshot,inspectMesh,readSTL} from '../oracles/mesh-oracle.mjs';
import {readProductSemantics} from '../../src/core/product-operations.mjs';
import {inside,intersections,partMesh} from '../../src/kernel/source-assembly/tests/oracles/spatial-oracle.mjs';
import {run} from './environment.mjs';
const selection=process.argv[2]??'native-product';
const selections=['native-product','native-raster-product','node-wasm-product','browser-product/chromium','browser-product/firefox','browser-product/webkit'];
assert.ok(selections.includes(selection),'explicit captured evidence target');
const dir=path.join(run,'evidence',selection),records=[];
const extensions=selection==='node-wasm-product'?'.apms':'.buf1';
for(const file of fs.readdirSync(dir).filter(f=>/^(raster-)?(keychain|clicky|strap|lego|charm)-(default|noi|chim|phang|phang2)\.arch$/.test(f))){
 const name=file.slice(0,-5),s=readSnapshot(fs.readFileSync(path.join(dir,file))),m=readProductSemantics(new Uint8Array(fs.readFileSync(path.join(dir,name+extensions))));
 try{
  assert.equal(m.parts.length,s.parts.length);assert.equal(s.contours.length,0,'3D mechanics must not forge planar contacts');
  const meshes=s.parts.map(p=>partMesh(s,p)),checks=meshes.map(inspectMesh);
  for(const p of m.parts)assert.ok(m.features[p.featureIndex].id===p.id&&p.id&&!p.id.startsWith('part-'));
  assert.ok(m.inputRegions.some(r=>r.semanticId==='9007199254741101'));assert.ok(m.inputRegions.some(r=>r.semanticId==='9007199254741102'));
  assert.ok(m.lineage.some(r=>r.sourceId==='9007199254741101'));assert.ok(m.lineage.some(r=>r.sourceId==='9007199254741102'));
  assert.ok(m.sourceErrors.every(e=>[e.signedMinMm,e.signedMaxMm].every(Number.isFinite)));
  assert.ok(m.sourceErrors.filter(e=>e.stage===100).every(e=>e.signedMaxMm<=m.sourceToleranceMm));
  assert.equal(m.totalErrorBoundMm,null);assert.equal(m.fitQualification,'unqualified');
  // Hole in the colored original source must survive independently of whether
  // fillHoles creates support under it. Test every original-artwork slab's mesh
  // at its own middle Z using source lineage (no palette-derived identity).
  const leftSlabs=new Set(m.lineage.filter(l=>l.sourceId==='9007199254741101').map(l=>l.slabId));
  const scale=m.sourceTransform[0],x=7*scale+m.sourceTransform[4],y=8*scale+m.sourceTransform[5];
  const left=m.parts.filter(p=>leftSlabs.has(p.sourceId)&&p.role===1);
  for(const p of left){
   const mesh=meshes[p.meshPart],zs=mesh.vertices.map(v=>v[2]),z=(Math.min(...zs)+Math.max(...zs))/2;
   assert.ok(!inside(mesh,[x,y,z]),'source artwork hole must be empty');
  }
  // Common x=20 source line must remain exactly coincident for paired artwork.
  const seamX=20*scale+m.sourceTransform[4],seamY=14.123*scale+m.sourceTransform[5];
  let seamPairs=0;
  const xyTable=m.tables.get(25),dv=new DataView(m.bytes.buffer,m.bytes.byteOffset,m.bytes.byteLength);
  const xs=Array.from({length:xyTable.count},(_,i)=>Number(dv.getBigInt64(xyTable.offset+i*16,true))/1e6);
  const canonicalSeam=xs.reduce((a,b)=>Math.abs(a-seamX)<=Math.abs(b-seamX)?a:b);
  // Compare mesh against the actual captured canonical source partition, then
  // assert equality between material boundaries. The unrounded SVG coordinate
  // is not a post-quantization coordinate (upstream bound remains unverified).
  const art=m.parts.filter(p=>p.role===1);
  for(let i=0;i<art.length;i++)for(let j=i+1;j<art.length;j++){
   const a=meshes[art[i].meshPart],b=meshes[art[j].meshPart],az=a.vertices.map(v=>v[2]),bz=b.vertices.map(v=>v[2]);
   const z0=Math.max(Math.min(...az),Math.min(...bz)),z1=Math.min(Math.max(...az),Math.max(...bz));
   if(z1<=z0+1e-6)continue;for(const fraction of [.127,.381,.733,.917]){const z=z0+fraction*(z1-z0);
   const ah=intersections(a,0,seamY,z),bh=intersections(b,0,seamY,z);
   const ac=ah.filter(v=>Math.abs(v-canonicalSeam)<=2e-8),bc=bh.filter(v=>Math.abs(v-canonicalSeam)<=2e-8);
   if(ac.length&&bc.length){assert.ok(ac.some(a=>bc.some(b=>Math.abs(a-b)<=1e-12)),'two material boundaries differ');seamPairs++;}
   }
  }
  assert.ok(seamPairs>0,'paired artwork seam must meet without independent epsilon');
  const stlfile=path.join(dir,name+'.stl');if(fs.existsSync(stlfile))inspectMesh(readSTL(fs.readFileSync(stlfile)));
  records.push({name,status:'pass',parts:checks.length,triangles:s.faces.length,volumes:checks.map(c=>c.volume),seamPairs,holePartsChecked:left.length});
 }catch(e){records.push({name,status:'fail',error:e.message});console.error(name,e.stack);}
}
fs.writeFileSync(path.join(run,'evidence/'+selection.replaceAll('/','-')+'-oracles.json'),JSON.stringify(records,null,2)+'\n');
console.log(JSON.stringify({passed:records.filter(r=>r.status==='pass').length,total:records.length,parts:records.reduce((n,r)=>n+(r.parts??0),0)}));
if(records.some(r=>r.status!=='pass'))process.exitCode=1;
