import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
import {readSnapshot,inspectMesh,partMesh,bbox} from '../../src/kernel/mechanics/tests/oracles/mechanical-oracle.mjs';
const run=fs.realpathSync(process.env.PROJECT_REVIEW_RUN),repo=fs.realpathSync(process.env.PROJECT_ROOT),tag=process.argv[2]??'candidate-native';
const borrowed=process.env.CURVED_BORROW_ROOT??(fs.existsSync(path.join(run,'work/root-borrow'))?path.join(run,'work/root-borrow'):repo);
const {readProductSemantics}=await import(pathToFileURL(path.join(borrowed,'src/core/product-operations.mjs')));
const corpus=path.join(run,'inputs',process.env.CURVED_CORPUS??'corpus');
const out=path.join(run,'evidence',tag),rows=JSON.parse(fs.readFileSync(path.join(out,'summary.json'))),results=[];
const close=(a,b,t,msg)=>assert.ok(Math.abs(a-b)<=t,`${msg}: ${a} expected ${b} +/-${t}`);
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),sub=(a,b)=>a.map((x,i)=>x-b[i]);
function ray(mesh,o,dir){const hits=[];for(const face of mesh.faces){const [a,b,c]=face.map(i=>mesh.vertices[i]),e1=sub(b,a),e2=sub(c,a);
 const p=[dir[1]*e2[2]-dir[2]*e2[1],dir[2]*e2[0]-dir[0]*e2[2],dir[0]*e2[1]-dir[1]*e2[0]],det=dot(e1,p);if(Math.abs(det)<1e-15)continue;
 const t=sub(o,a),u=dot(t,p)/det;if(u< -1e-10||u>1+1e-10)continue;const q=[t[1]*e1[2]-t[2]*e1[1],t[2]*e1[0]-t[0]*e1[2],t[0]*e1[1]-t[1]*e1[0]],v=dot(dir,q)/det;
 if(v>=-1e-10&&u+v<=1+1e-10)hits.push(dot(e2,q)/det);
 }hits.sort((a,b)=>a-b);return hits.filter((x,i)=>!i||x-hits[i-1]>1e-7);}
const area=r=>r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p[0]*q[1]-q[0]*p[1];},0)/2;
const dist=(p,a,b)=>{const d=sub(b,a),t=Math.max(0,Math.min(1,dot(sub(p,a),d)/dot(d,d)));return Math.hypot(...p.map((x,i)=>x-a[i]-t*d[i]));};
const contains=(rs,p)=>{let w=0;for(const r of rs)for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length],cross=(b[0]-a[0])*(p[1]-a[1])-(p[0]-a[0])*(b[1]-a[1]);if(a[1]<=p[1]&&b[1]>p[1]&&cross>0)w++;if(a[1]>p[1]&&b[1]<=p[1]&&cross<0)w--;}return w!==0;};
function planarHits(rs,y){const h=[];for(const r of rs)for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length];if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y))h.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));}return h.sort((a,b)=>a-b);}
// Oriented area integral over actual triangle/plane intersections. No contour
// reconstruction, triangulation, library slicing or reported part volume.
function sectionArea(mesh,z){let twice=0;for(const face of mesh.faces){const p=face.map(i=>mesh.vertices[i]),hits=[];
 for(let i=0;i<3;i++){const a=p[i],b=p[(i+1)%3];if((a[2]<=z&&b[2]>z)||(b[2]<=z&&a[2]>z)){const t=(z-a[2])/(b[2]-a[2]);hits.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}}
 if(hits.length!==2)continue;let [a,b]=hits;const u=sub(p[1],p[0]),v=sub(p[2],p[0]),nx=u[1]*v[2]-u[2]*v[1],ny=u[2]*v[0]-u[0]*v[2];
 if((b[0]-a[0])*(-ny)+(b[1]-a[1])*nx<0)[a,b]=[b,a];twice+=a[0]*b[1]-b[0]*a[1];}return twice/2;}
for(const row of rows){try{
 assert.equal(row.sourceVerdict,0,row.id);assert.equal(row.mechanicsVerdict,0,row.id);assert.equal(row.blocked,false,row.id);
 const bytes=new Uint8Array(fs.readFileSync(path.join(out,row.id+'.apms'))),m=readProductSemantics(bytes),d=new DataView(bytes.buffer),q=fs.readFileSync(path.join(corpus,row.id+'.aprq')),qd=new DataView(q.buffer,q.byteOffset,q.length);
 const scene=readSnapshot(fs.readFileSync(path.join(out,row.id+'.arch'))),meshes=scene.parts.map(p=>partMesh(scene,p)),measures=meshes.map(x=>inspectMesh(x));
 const param=n=>{const v=m.parameters.find(x=>x.field===n);assert.ok(v,n);return v.value;},body=meshes.filter((x,i)=>m.parts[i].assemblyGroup===0);
 for(let i=0;i<qd.getUint32(16,true);i++){const a=256+40*i,id=qd.getUint32(a,true),p=m.parameters.find(x=>x.fieldId===id);assert.ok(p);assert.deepEqual([p.fieldId,p.mode,p.origin,p.datum,p.referenceLayer,p.layerCount],Array.from({length:6},(_,j)=>qd.getUint32(a+4*j,true)));assert.equal(p.value,qd.getFloat64(a+24,true));assert.equal(p.provenanceId,qd.getBigUint64(a+32,true).toString());}
 assert.equal(m.fitQualification,'unqualified');assert.equal(m.revision,qd.getBigUint64(64,true).toString());
 const matingTolerance=qd.getFloat64(208,true),numericGrooveBudget=Math.min(1e-7,matingTolerance/1000)+2e-8;
 const rt=m.tables.get(24),pt=m.tables.get(25),st=m.tables.get(21),rings=Array.from({length:rt.count},(_,i)=>{const a=rt.offset+16*i,start=d.getUint32(a,true),n=d.getUint32(a+4,true);return Array.from({length:n},(_,j)=>[Number(d.getBigInt64(pt.offset+16*(start+j),true))/1e6,Number(d.getBigInt64(pt.offset+16*(start+j)+8,true))/1e6]);});
 const slabs=Array.from({length:st.count},(_,i)=>{const a=st.offset+72*i,start=d.getUint32(a,true),count=d.getUint32(a+4,true);return {rings:rings.slice(start,start+count),start,lo:d.getFloat64(a+32,true),hi:d.getFloat64(a+40,true),color:d.getUint32(a+16,true),slot:d.getUint32(a+20,true),kind:d.getUint32(a+12,true)};});
 const footprint=rings.slice(0,Math.min(...slabs.map(s=>s.start))),outer=footprint.filter(r=>area(r)>0),edges=outer.flatMap(r=>r.map((a,i)=>[a,r[(i+1)%r.length]]));
 assert.equal(row.bottomBoundaryResiduals,0);assert.equal(row.bottomAreaDifferenceMm2,0);
 // Numeric source-side partition probe at all open Z intervals: no overlapping
 // slab owners; each horizontal section remains the declared four-mode formula.
 const zs=[...new Set(slabs.flatMap(s=>[s.lo,s.hi]))].sort((a,b)=>a-b),bounds=bbox({vertices:footprint.flatMap(r=>r.map(p=>[...p,0]))}),H=param(m.product===1?'plateT':'baseH'),mode=param('artMode');
 let spatial=0;for(let zi=0;zi+1<zs.length;zi++){const z=(zs[zi]+zs[zi+1])/2;
  for(let ix=0;ix<13;ix++)for(let iy=0;iy<11;iy++){const x=bounds.min[0]+(ix+.371)*bounds.size[0]/13,y=bounds.min[1]+(iy+.613)*bounds.size[1]/11;
   const owners=slabs.filter(s=>s.lo<z&&s.hi>z&&contains(s.rings,[x,y]));assert.ok(owners.length<=1,`${row.id} overlapping materials`);spatial++;
   if(z<Math.min(...slabs.map(s=>s.hi)))assert.equal(owners.length>0,contains(footprint,[x,y]),'bottom support occupancy');
  }
 }
 // Artwork source preservation against the original root canonical rings,
 // transformed independently. This tests all holes and disconnected contours,
 // not a preview image or the generator's reported bound.
 const original=fs.readFileSync(path.join(corpus,row.id+'.arch')),od=new DataView(original.buffer,original.byteOffset,original.length),ou=a=>od.getUint32(a,true),source=[];
 const points=Array.from({length:ou(32)},(_,i)=>[Number(od.getBigInt64(ou(60)+16*i,true))/1e6,Number(od.getBigInt64(ou(60)+16*i+8,true))/1e6]);
 const ob=bbox({vertices:points.map(p=>[...p,0])}),scale=param('size')/Math.max(ob.size[0],ob.size[1]);
 for(let i=0;i<ou(36);i++){const a=ou(64)+16*i;source.push(Array.from({length:ou(a+4)},(_,j)=>points[ou(ou(68)+4*(ou(a)+j))].map((x,k)=>(x-(ob.min[k]+ob.max[k])/2)*scale)));}
 const art=slabs.filter((s,i)=>[14,22,33].includes(m.lineage[i].stage));assert.equal(art.length,1,'actual PSB corpus has one authored material region');assert.equal(art[0].rings.length,source.length);
 const R=param('rimOn')&&m.product!==1&&m.product!==3?param('rimH'):0,D=param('artH'),C=param('flatTop');
 const expectedArt=[[H+R,H+R+D],[R,H-D],[H-C,H],[H+R,H+R+C]][mode];
 close(art[0].lo,expectedArt[0],1e-12,'nominal art lower face');close(art[0].hi,expectedArt[1],1e-12,'nominal art upper face');
 const sourceArea=art[0].rings.reduce((s,r)=>s+area(r),0),footprintArea=footprint.reduce((s,r)=>s+area(r),0);
 const expectedVolume=[footprintArea*(H+R)+sourceArea*D,footprintArea*H-sourceArea*D,footprintArea*H,footprintArea*(H+R+C)][mode];
 const slabVolume=slabs.reduce((s,c)=>s+c.rings.reduce((a,r)=>a+area(r),0)*(c.hi-c.lo),0);
 close(slabVolume,expectedVolume,Math.max(1e-6,expectedVolume*1e-10),'four-mode source volume formula');
 const expectedTop=mode===0?H+R+D:mode===3?H+R+C:H;
 close(bbox({vertices:body.flatMap(x=>x.vertices)}).max[2],m.bodyDatumZ+expectedTop,1e-7,'manufacturing top retains nominal MM');
 const sourceEdges=source.flatMap(r=>r.map((a,i)=>[a,r[(i+1)%r.length]]));let maxSourceDelta=0;for(const r of art[0].rings)for(const p of r)maxSourceDelta=Math.max(maxSourceDelta,Math.min(...sourceEdges.map(([a,b])=>dist(p,a,b))));
 assert.ok(maxSourceDelta<=.000001,'artwork displacement exceeds one nm');
 const measured={spatialProbes:spatial,maxArtworkDisplacementMm:maxSourceDelta,topologyParts:measures.length,volume:measures.reduce((s,v)=>s+v.volume,0),bounds:bbox(scene),slabVolume,expectedSourceVolume:expectedVolume,matingToleranceMm:matingTolerance,groove:[],cornerGroove:[],mouth:[],openings:0,holeDeviations:[]};
 if(m.product===3){
  const radius=param('legoRanhR'),cz=m.bodyDatumZ+(param('legoRanhZ')||H/2);let tested=0;
  for(let k=0;k<edges.length&&tested<12;k+=Math.max(1,Math.floor(edges.length/19))){const [a,b]=edges[k],dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy),normal=[-dy/l,dx/l],p=a.map((v,i)=>(v+b[i])/2),test=p.map((v,i)=>v+normal[i]*radius);
   if(!contains(footprint,test)||Math.min(...edges.map(([a,b])=>dist(test,a,b)))<radius-1e-7)continue;
   for(const fraction of [0,.3,.6,.9]){const dz=fraction*radius,o=[...p,cz+dz],dir=[...normal,0],hits=body.flatMap(mesh=>ray(mesh,o,dir)).filter(t=>t>1e-7&&t<2*radius).sort((a,b)=>a-b);assert.ok(hits.length,'groove section opening');const actual=Math.hypot(hits[0],dz),deviation=actual-radius;assert.ok(deviation>=-numericGrooveBudget&&deviation<=matingTolerance,`${row.id} signed groove ${deviation}`);measured.groove.push(deviation);}
   tested++;
  }assert.ok(tested>=8,'distributed groove sections');
  // Reentrant vertex bisectors exercise the rolling sectors, including the
  // smallest source-grid turns. Analytic distance to every original segment
  // selects unobstructed probes; it does not use a generated cutter surface.
  const corners=[];for(const ring of outer)for(let i=0;i<ring.length;i++){
   const a=ring[i],u=sub(a,ring[(i+ring.length-1)%ring.length]),v=sub(ring[(i+1)%ring.length],a),turn=Math.atan2(u[0]*v[1]-u[1]*v[0],dot(u,v));if(turn>=0)continue;
   const angle=Math.atan2(v[1],v[0])+Math.PI/2-turn/2,normal=[Math.cos(angle),Math.sin(angle)],p=a.map((x,k)=>x+normal[k]*radius);
   if(contains(footprint,p)&&Math.min(...edges.map(([a,b])=>dist(p,a,b)))>=radius-1e-8)corners.push({a,normal,turn});
  }
  corners.sort((a,b)=>Math.abs(a.turn)-Math.abs(b.turn));
  for(const {a,normal,turn}of corners.slice(0,12))for(const fraction of [0,.6,.9]){
   const dz=fraction*radius,hits=body.flatMap(mesh=>ray(mesh,[...a,cz+dz],[...normal,0])).filter(t=>t>1e-7&&t<2*radius).sort((a,b)=>a-b);
   assert.ok(hits.length,'corner groove opening');const deviation=Math.hypot(hits[0],dz)-radius;
   assert.ok(deviation>=-numericGrooveBudget&&deviation<=matingTolerance,`${row.id} signed corner groove ${deviation}, turn ${turn}`);measured.cornerGroove.push(deviation);
  }
  measured.eligibleReentrantCorners=corners.length;
  for(const f of m.features.filter(f=>/^mech:lego:bore:-?\d+:-?\d+$/.test(f.id))){const [i,j]=f.id.split(':').slice(-2).map(Number),cx=i*param('legoPitch')+param('legoOffX'),cy=j*param('legoPitch')+param('legoOffY'),r=param('legoHoleD')/2+(param('legoThua')?param('legoHoDu'):0);
   close(f.dimensions[0],cx,1e-12,'pitch x');close(f.dimensions[1],cy,1e-12,'pitch y');close(f.dimensions[2],r*2,1e-12,'one-side sparse-mask clearance (ADR-001)');
   const hits=body.flatMap(mesh=>ray(mesh,[cx,cy,m.bodyDatumZ+param('legoHoleH')/2],[1,0,0])).filter(t=>t>0).sort((a,b)=>a-b);assert.ok(hits.length);assert.ok(hits[0]>=r-2e-8&&hits[0]<=r+matingTolerance,'nominal hole radius');measured.holeDeviations.push(hits[0]-r);measured.openings++;
  }assert.ok(measured.openings>0);
 }
 if(m.product===2){
  const a=param('strapAngle')*Math.PI/180,axis=[Math.cos(a),Math.sin(a)],normal=[-axis[1],axis[0]],cx=(bounds.min[0]+bounds.max[0])/2+normal[0]*param('strapOff'),cy=(bounds.min[1]+bounds.max[1])/2+normal[1]*param('strapOff'),r=param('strapD')/2,c=param('strapCham'),cz=m.bodyDatumZ+param('strapZ');
  assert.equal(param('strapSlot'),0,'captured default circular bore');const local=footprint.map(poly=>poly.map(p=>[dot(sub(p,[cx,cy]),axis),dot(sub(p,[cx,cy]),normal)]));
  for(const rho of [r+c*.2,r+c*.5,r+c*.8])for(const theta of [.3,1.1,2.1]){const u=rho*Math.cos(theta),v=rho*Math.sin(theta),ends=planarHits(local,u);assert.equal(ends.length,2,'convex default mouth domain');const expected=[ends[0]+r+c-rho,ends[1]-(r+c-rho)],origin=[cx+normal[0]*u,cy+normal[1]*u,cz+v],hits=body.flatMap(mesh=>ray(mesh,origin,[...axis,0])).sort((a,b)=>a-b);assert.ok(hits.length>=2);for(const [x,y]of [[hits[0],expected[0]],[hits.at(-1),expected[1]]]){close(x,y,matingTolerance,'45 degree mouth chamfer');measured.mouth.push(x-y);}}
  const hits=body.flatMap(mesh=>ray(mesh,[cx,cy,cz],[...axis,0]));assert.equal(hits.length,0,'strap axis remains fully open');measured.openings++;
  const g=m.features.find(f=>f.id==='guard:strap:roof-floor');assert.ok(g);measured.roofFloor=[];
  measured.uncutSections=[];
  const cutTop=cz+r+c;
  for(const z of [cutTop+.01,(cutTop+art[0].hi+m.bodyDatumZ)/2,art[0].hi+m.bodyDatumZ-.001,art[0].hi+m.bodyDatumZ+.001]){
    const expected=slabs.filter(s=>s.lo+m.bodyDatumZ<z&&s.hi+m.bodyDatumZ>z).reduce((a,s)=>a+s.rings.reduce((a,r)=>a+area(r),0),0);
    const actual=body.reduce((a,mesh)=>a+sectionArea(mesh,z),0);close(actual,expected,1e-5,'complete uncut source section preserved');
    for(let i=0;i<meshes.length;i++)if(m.parts[i].assemblyGroup===0){const sid=m.parts[i].sourceId,sourceSlab=slabs.filter((s,j)=>m.lineage[j].slabId===sid&&s.lo+m.bodyDatumZ<z&&s.hi+m.bodyDatumZ>z);
      const expectedPart=sourceSlab.reduce((a,s)=>a+s.rings.reduce((a,r)=>a+area(r),0),0);close(sectionArea(meshes[i],z),expectedPart,1e-5,'per-source material slab preservation');}
    measured.uncutSections.push({z,actual,expected});
  }
  for(const along of [-5,0,5])for(const u of [-.991,.013,.773]){
    const o=[cx+axis[0]*along+normal[0]*u,cy+axis[1]*along+normal[1]*u,0];
    // Union the independently intersected material intervals. Two opposite
    // faces at a shared color/slab seam are not an exterior air boundary.
    const spans=[];for(const mesh of body){const hits=ray(mesh,o,[0,0,1]);assert.equal(hits.length%2,0,'closed material ray');for(let i=0;i<hits.length;i+=2)spans.push([hits[i],hits[i+1]]);}
    spans.sort((a,b)=>a[0]-b[0]);const united=[];for(const span of spans){const previous=united.at(-1);if(previous&&span[0]<=previous[1]+1e-7)previous[1]=Math.max(previous[1],span[1]);else united.push([...span]);}
    const zhits=united.flat();
    const lower=zhits.filter(z=>z<cz),upper=zhits.filter(z=>z>cz);assert.ok(lower.length>=2&&upper.length>=2,'continuous roof and floor');
    const floor=lower.at(-1)-lower.at(-2),roof=upper[1]-upper[0];
    assert.ok(floor>=g.dimensions[0]-1e-7&&roof>=g.dimensions[1]-1e-7,'conservative reported clearance');measured.roofFloor.push({floor,roof});
  }
 }
 results.push({id:row.id,pass:true,...measured});console.log('PASS oracle '+row.id);
 }catch(e){results.push({id:row.id,pass:false,error:e.stack});console.log('FAIL oracle '+row.id+' '+e.message);}}
fs.writeFileSync(path.join(run,'reports',tag+'-oracles.json'),JSON.stringify({version:2,oracle:'independent numeric rays with material interval union, integer boundary accounting, shoelace, winding and frozen indexed mesh topology; no Manifold/Clipper oracle',physicalFit:'unqualified',wholePipelineBound:'unverified',results},null,2)+'\n');
process.exitCode=results.some(x=>!x.pass)?1:0;
