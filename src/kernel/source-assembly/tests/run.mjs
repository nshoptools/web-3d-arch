import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {readSnapshot,inspectMesh,partMesh,bbox,inside,intersections,close} from './oracles/spatial-oracle.mjs';
import {room,evidence} from '../tools/test-env.mjs';
const target=process.argv[2]??'native';assert.ok(['native','wasm'].includes(target));
const output=path.join(evidence,`tests-${target}`);fs.mkdirSync(output,{recursive:true});
const fixture=process.env.ARCH_SOURCE_FIXTURE;
const exe=target==='native'?(fixture??path.join(room,'work/build-source-native/Release/source_fixture.exe')):process.execPath;
const prefix=target==='native'?[]:[fixture??path.join(room,'work/build-source-wasm/source_fixture.js')];
const cases=[],failures=[];
function run(id,opts={},verify=()=>{},expected=0,mech=0){
  // See docs/R2-FIXTURE-ADJUDICATION.md, written before these expectation changes.
  // Exact old declarations are still run against both libraries by tests/r2.mjs.
  if(opts.text&&!opts.textlayers)opts={textbinding:'unspecified',...opts};
  const rejectedLegacyBinding=id==='text-layers'||/^(first-layers|relative-layers|rim-layers|flat-layers|recess-layers|cap-layers)-/.test(id);
  if(rejectedLegacyBinding){expected=1;mech=-1;}

  const base=path.join(output,id),args=[...prefix,base,...Object.entries(opts).map(([k,v])=>`${k}=${v}`)];
  const result=spawnSync(exe,args,{encoding:'utf8',timeout:300000,maxBuffer:4e6});
  fs.writeFileSync(base+'.log',(result.stdout??'')+(result.stderr??''));
  fs.writeFileSync(base+'.repro.json',JSON.stringify({id,target,seed:'0x5a17c0de',options:opts,expected,mech},null,2)+'\n');
  try{
    assert.equal(result.status,0,result.error?.message??result.stderr);const m=JSON.parse(fs.readFileSync(base+'.json','utf8')),scene=readSnapshot(fs.readFileSync(base+'.bin'));
    assert.equal(m.verdict,expected,JSON.stringify(m.diagnostics));assert.ok(m.immutable&&m.lifetime);assert.equal(m.bridge,1);
    if(rejectedLegacyBinding)assert.ok(m.diagnostics.some(d=>/SOURCE_REFERENCE_LAYER|DOWNWARD_LAYERS/.test(d)),JSON.stringify(m.diagnostics));
    if(expected){assert.equal(m.slabs.length,0);assert.equal(scene.parts.length,0);}
    else{
      assert.ok(m.errors.some(e=>e[0]===100&&e[4]>0&&e[4]<=Number(opts.tol??.001)),'enforced accumulated generated source bound');
      assert.equal(m.mechanicsVerdict,mech,JSON.stringify(m.mechanicsDiagnostics));
      if(mech===0){assert.ok(scene.parts.length);const meshes=scene.parts.map(p=>partMesh(scene,p)),measures=meshes.map(mesh=>inspectMesh(mesh));
        m.measuredVolume=measures.reduce((s,p)=>s+p.volume,0);m.bounds=bbox(scene);m.meshes=meshes;
        for(const mesh of meshes){const seen=new Map(),vertices=[],faces=mesh.faces.map(f=>f.map(i=>{const p=mesh.vertices[i],key=p.map(v=>Object.is(v,-0)?0:v).join(',');if(!seen.has(key)){seen.set(key,vertices.length);vertices.push(p);}return seen.get(key);}));inspectMesh({vertices,faces});}
        verify(m,scene);
      }
    }
    cases.push({id,status:'pass',verdict:m.verdict,mechanicsVerdict:m.mechanicsVerdict,slabs:m.slabs.length,parts:scene.parts.length,triangles:scene.faces.length,volume:m.measuredVolume,bounds:m.bounds,operations:m.operations});
    return {m,scene};
  }catch(e){failures.push({id,error:e.message});cases.push({id,status:'fail',error:e.message});console.error(id,e.message);return null;}
}
const volume=want=>(m)=>close(m.measuredVolume,want,Math.max(1e-5,want*5e-10),'independent signed mesh volume');
const probe=(m,p,role)=>{const owners=m.meshes.flatMap((mesh,i)=>inside(mesh,p)?[i]:[]);assert.equal(owners.length,role===null?0:1,`partition owners at ${p}: ${owners}`);if(role!==null)assert.equal(m.parts[owners[0]].role,role);};
const totals=[793.6,473.6,633.6,897.6],tops=[3.2,2.4,2.4,3.4];
for(let style=0;style<4;style++)for(const rim of [0,1])run(`style-${style}-rim-${rim}`,{artMode:style,rimOn:rim},(m,s)=>{
  const want=totals[style]+(rim&&(style===0||style===3)?264*.6:0);volume(want)(m);close(m.bounds.max[2],tops[style]+(rim&&(style===0||style===3)?.6:0));
  probe(m,[-5.123,.234,style===1?2.1:tops[style]-.1+(rim&&(style===0||style===3)?.6:0)],style===1?null:1);
  const z=style===1?1.1:tops[style]-.2+(rim&&(style===0||style===3)?.6:0);for(const x of [-.00001,.00001])probe(m,[x,.237,z],1);
  assert.ok(m.contacts.some(c=>c[2]===0&&Math.abs(c[3]-(style===0?8:style===1?rim?10:16:10))<1e-6));
});
run('bands',{layerBand:1},m=>{volume(873.6)(m);probe(m,[-5,.13,3.7],null);probe(m,[5,.13,3.7],1);const colors=m.slabs.filter(s=>s.role===1);assert.deepEqual(colors.map(s=>s.hi),[3.2,4]);});
run('core',{layerBand:1,bandCore:1},m=>{volume(873.6)(m);probe(m,[-5,.13,2.5],0);probe(m,[-5,.13,2.9],1);probe(m,[5,.13,3.3],0);probe(m,[5,.13,3.7],1);});
run('contact-intervals',{layerBand:1,bandCore:1},m=>{const body=m.slabs.findIndex(s=>s.stage===10),cap=m.slabs.findIndex(s=>s.stage===13);assert.ok(!m.contacts.some(c=>(c[0]===body&&c[1]===cap)||(c[1]===body&&c[0]===cap)),'same XY with positive Z gap is not contact');for(const c of m.contacts){if(c[2]===0)assert.ok(c[5]>c[4]);else assert.equal(c[5],c[4]);}});
run('contact-analytic',{},m=>{assert.equal(m.contacts.length,3);const vertical=m.contacts.filter(c=>c[2]===0),horizontal=m.contacts.filter(c=>c[2]===1);assert.equal(vertical.length,1);close(vertical[0][3],8);assert.equal(horizontal.length,2);for(const c of horizontal)close(c[3],100);});
run('override',{layerBand:1,bandCore:1,override:1.7},m=>{volume(963.6)(m);close(m.bounds.max[2],4.1);close(m.parameters.find(p=>p.id===27).value,.8);});
run('inactive-override',{artMode:2,override:1.7,layerBand:1,bandCore:1},m=>{volume(633.6)(m);assert.ok(m.diagnostics.includes('OBJECT_HEIGHT_RETAINED_INACTIVE'));assert.equal(m.parameters.find(p=>p.id===31).value,1);});
for(const fill of [0,1])run(`hole-${fill}`,{pattern:'hole',fillHoles:fill},m=>{volume((fill?264:260)*2.4+196*.8)(m);probe(m,[-7,.17,.3],fill?0:null);probe(m,[-7,.17,2.8],null);});
for(const style of [1,2,3])for(const fill of [0,1])run(`hole-style-${style}-${fill}`,{pattern:'hole',fillHoles:fill,artMode:style},m=>{const P=fill?264:260,want=style===1?P*2.4-196*.8:style===2?P*2.4:P*3.4;volume(want)(m);probe(m,[-7,.17,.3],fill?0:null);probe(m,[-7,.17,style===3?2.8:2.1],fill?0:null);});
run('color-overrides',{roleoverride:1},m=>{volume(793.6)(m);assert.ok(m.slabs.some(s=>s.role===0&&s.color===0x998811ff&&s.slot===6&&s.origin===1));assert.ok(m.slabs.some(s=>s.source==='101'&&s.color===0xe04444ff&&s.origin===1));assert.ok(m.slabs.some(s=>s.source==='102'&&s.color===0x112233ff&&s.slot===7));});
const base=run('stable-base'),reorder=run('stable-reorder',{reverse:1,indexed:1});
if(base&&reorder)assert.deepEqual(base.m.slabs,reorder.m.slabs,'stable IDs and geometry independent of region vector order');
run('indexed',{indexed:1},volume(793.6));
run('large-slope-seam',{pattern:'slope',indexed:1},m=>{close(m.measuredVolume,793.59996,.0001);probe(m,[-.00001,.173,2.8],1);probe(m,[.00001,.173,2.8],1);});
const Q=16-(4-Math.PI)*.09;
run('text-bed',{text:'bed'},m=>{close(m.measuredVolume,793.6+Q*.6+6.6*.8,.0013);probe(m,[31,.2,.9],7);});
run('text-on',{text:'on'},m=>{close(m.measuredVolume,793.6+Q*.6+6.6*.8,.0013);probe(m,[-1,.2,3.5],8);probe(m,[-1,.2,4.1],7);});
run('text-step',{text:'step',layerBand:1},m=>{close(m.measuredVolume,873.6+Q*.6+(10-(4-Math.PI)*.045)*.8+6.6*.8,.0029);probe(m,[-1,.2,3.7],8);probe(m,[.7,.2,3.7],1);probe(m,[.7,.2,4.3],8);});
run('text-nobase',{text:'nobase'},m=>{volume(793.6+6.6*.8)(m);probe(m,[-1,.2,3.7],7);});
run('text-layers',{text:'on',textlayers:1,h0:.27},m=>{close(m.bounds.max[2],3.2+.47+.8);assert.equal(m.inputTexts[0].height.mode,2);assert.equal(m.inputTexts[0].height.reference,3);assert.equal(m.inputTexts[0].baseHeight.count,2);});
for(const [id,opts] of [['clicky',{product:1,defaults:1,pattern:'square'}],['charm-integral',{product:4,charmGan:1,defaults:1,pattern:'square'}],['charm-separate',{product:4,charmRap:1,defaults:1,pattern:'square'}]])run(`bed-${id}`,{...opts,text:'bed',textx:-40},m=>{
  const indices=m.parts.flatMap((p,i)=>p.group===2?[i]:[]);assert.equal(indices.length,3);const vertices=indices.flatMap(i=>m.meshes[i].vertices),b=bbox({vertices});close(b.min[2],0);close(b.max[2],1.4);close(b.min[0],-40.5,.000002);for(const i of indices)assert.deepEqual(m.parts[i].preview,[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
});
run('bed-tray-collision',{product:1,defaults:1,pattern:'square',text:'bed',textx:35},()=>{},0,1);
for(const h of [.16,.20,.25]){
  const d=.27+3*h;
  run(`first-layers-${h}`,{h,h0:.27,'layers.artH':'4,0,128'},m=>{volume(633.6+200*d)(m);close(m.bounds.max[2],2.4+d);const p=m.parameters.find(p=>p.id===27);assert.equal(p.mode,2);assert.equal(p.count,4);assert.equal(p.datum,128);});
  run(`relative-layers-${h}`,{h,h0:.27,'layers.artH':'4,2,128',layerBand:1},m=>{volume(633.6+100*4*h+100*8*h)(m);close(m.bounds.max[2],2.4+8*h);});
  run(`nominal-${h}`,{h,h0:.27,baseH:5.5,artH:1.7,flatTop:1.85},m=>{volume(264*5.5+200*1.7)(m);close(m.bounds.max[2],7.2);for(const [id,value]of[[23,5.5],[27,1.7],[26,1.85]])close(m.parameters.find(p=>p.id===id).value,value);});
  run(`rim-layers-${h}`,{h,h0:.27,rimOn:1,'layers.rimH':'3,0,129'},volume(793.6+264*(.27+2*h)));
  run(`flat-layers-${h}`,{h,h0:.27,artMode:3,'layers.flatTop':'4,3,130'},volume(264*(2.4+4*h)));
  run(`recess-layers-${h}`,{h,h0:.27,artMode:1,'layers.artH':'3,0,131'},volume(264*2.4-200*(.27+2*h)));
  run(`cap-layers-${h}`,{h,h0:.27,layerBand:1,bandCore:1,'layers.bandCap':'3,1,132'},m=>{volume(873.6)(m);const red=m.slabs.find(s=>s.stage===13&&s.source==='101');close(red.hi-red.lo,3*h);});
}
for(const size of [12,45,100])for(const tol of [.0002,.001,.002])run(`circle-${size}-${tol}`,{size,tol,outline:2,offset:1},m=>{const radius=Math.hypot(size/2,size/4)+1;close(m.measuredVolume,Math.PI*radius**2*2.4+size**2/2*.8,2*Math.PI*radius*(tol/8+.000001)*2.4+.00001);close(m.bounds.size[0],2*radius,.000003);});
for(let product=0;product<5;product++)for(let artMode=0;artMode<4;artMode++)run(`product-${product}-style-${artMode}`,{product,artMode,defaults:1,pattern:product===1?'square':'rect'},m=>{assert.ok(m.slabs.some(s=>s.role===1));assert.ok(m.meshes.length);});
run('accent-preserved',{pattern:'accent',outline:0,weld:0,offset:0,minFeature:4},m=>{assert.ok(m.proposals>0);assert.ok(m.slabs.some(s=>s.source==='102'));});
run('body-round',{outline:1,cornerR:2},m=>close(m.measuredVolume,(264-(4-Math.PI)*4)*2.4+160,.003));
run('body-silhouette',{outline:0,weld:0},m=>close(m.measuredVolume,(260+Math.PI)*2.4+160,.003));
run('body-square',{outline:3},volume(22*22*2.4+160));
run('body-capsule',{outline:1,offset:5,cornerR:10},m=>{close(m.measuredVolume,(200+100*Math.PI)*2.4+160,.02);close(m.bounds.size[0],30,.000002);close(m.bounds.size[1],20,.000002);});
run('body-weld',{pattern:'accent',outline:0,weld:1,offset:.1},m=>{assert.ok(m.slabs.some(s=>s.source==='102'));});
run('wrong-footprint',{badfootprint:1},()=>{},0,1);
run('clicky-size-proposal',{product:1,defaults:1},()=>{},0,3);
for(const style of [0,1,2,3])run(`bevel-style-${style}`,{artMode:style,topBevel:1,bevelGop:1,topBevelR:.3},m=>{assert.ok(m.measuredVolume>0&&m.measuredVolume<totals[style]);});
run('text-eyelet',{text:'bed',eyelet:1,ringOn:1,ringTren:1,ringOuterD:4,ringInnerD:1.5,ringOverlap:1},m=>{assert.ok(m.parts.some(p=>p.role===8));assert.ok(m.bounds.max[0]>33);});
for(const opts of [{product:3},{product:3,artMode:1,offset:.3}])run(`groove-section-${opts.artMode??0}`,opts,m=>{
  const edge=5+(opts.offset??1),z0=2.8,r=.8;
  for(const dz of [0,.2,.5,.79]){const hits=m.meshes.flatMap(mesh=>intersections(mesh,1,z0+dz,3.173)).filter(y=>y>0&&y<edge+.01);assert.ok(hits.length);const y=Math.max(...hits),radius=Math.hypot(edge-y,dz);assert.ok(radius>=r-.000002&&radius<=r+.001,`signed groove radius ${radius}`);}
});
const invalid=[['overlap',{pattern:'overlap'},'CANONICAL_REGION_OVERLAP'],['point-contact',{pattern:'point'},'SAME_REGION_POINT_CONTACT_OR_DUPLICATE'],['raw-edge',{pattern:'rawedge'},'RAW_EDGE_UNDER_TWO_GRID_UNITS'],['stale',{stale:1},'STALE_UPSTREAM_BINDING'],['index',{indexed:1,badindex:1},'INDEXED_POINT'],['rim-floor',{artMode:2,flatTop:2,rimOn:1,rimH:1},'SOURCE_POSITIVE_HEIGHT'],['recess-floor',{artMode:1,artH:2.4},'RECESS_REQUIRES_POSITIVE_FLOOR'],['cap-depth',{layerBand:1,bandCore:1,bandCap:1},'CAP_THICKER_THAN_COLUMN'],['rounding',{cornerR:9},'ROUNDING_RADIUS_DOES_NOT_FIT'],['text-floating',{text:'nobase',layerBand:1},'TEXT_NO_BASE_REQUIRES_FLAT_CONTACT'],['text-outside',{text:'outside'},'TEXT_BASE_OUTSIDE_BODY_SUPPORT'],['datum',{'layers.artH':'4,0,1'},'SOURCE_DATUM_MISMATCH']];
for(const[id,opts,diagnostic]of invalid){const x=run('invalid-'+id,opts,()=>{},1,-1);if(x)assert.ok(x.m.diagnostics.includes(diagnostic),`${id}: ${x.m.diagnostics}`);}
run('budget-operations',{ops:2},()=>{},2,-1);run('budget-points',{points:12},()=>{},2,-1);run('cancel-checkpoint',{cancel:5},()=>{},3,-1);
let seed=0x5a17c0de;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/2**32;};
for(let i=0;i<24;i++){const size=12+Math.floor(random()*80),pad=Number((.5+random()*2).toFixed(4)),H=Number((3+random()*4).toFixed(4)),D=Number((.3+random()*1.5).toFixed(4)),C=Number((.3+random()).toFixed(4)),style=i%4;const A=size*size/2,P=(size+2*pad)*(size/2+2*pad),want=[P*H+A*D,P*H-A*D,P*H,P*(H+C)][style];run(`seed-${i}`,{size,offset:pad,baseH:H,artH:D,flatTop:C,artMode:style},volume(want));}
fs.writeFileSync(path.join(evidence,`source-${target}-results.json`),JSON.stringify({target,seed:'0x5a17c0de',cases,failures,passed:cases.filter(c=>c.status==='pass').length,total:cases.length},null,2)+'\n');
console.log(`${target}: ${cases.length-failures.length}/${cases.length} passed`);if(failures.length)process.exitCode=1;
