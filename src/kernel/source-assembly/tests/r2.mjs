import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readSnapshot,inspectScene,inspectMesh,partMesh,intersections,close} from '../../mechanics/tests/oracles/mechanical-oracle.mjs';
const target=process.argv[2]??'native';
assert.ok(['native','wasm'].includes(target));
const room=fs.realpathSync(process.env.PROJECT_REVIEW_RUN),root=fs.realpathSync(process.env.PROJECT_ROOT);
assert.ok(room.startsWith(root+path.sep));
const build=process.env.ARCH_R2_BUILD??path.join(room,'work/build-'+target);
const out=path.join(room,'evidence/r2-'+target);fs.mkdirSync(out,{recursive:true});
const digest=b=>createHash('sha256').update(b).digest('hex');
const results=[];
function execute(name,family,phase,opts){
  const stem=path.join(out,name+'-'+phase),binary=path.join(build,target==='native'?'Release':'',family+'_'+(phase==='old'?'probe_old':'new')+(target==='native'?'.exe':'.js'));
  const args=family==='source'?[stem,...Object.entries(opts).map(([k,v])=>k+'='+v)]:['--out',stem];
  if(family==='mechanics')for(const[k,v]of Object.entries(opts)){if(k==='set')for(const[f,x]of Object.entries(v))args.push('--set',f+'='+x);else args.push('--'+k,String(v));}
  const argv=target==='native'?args:[binary,...args],cmd=target==='native'?binary:process.execPath;
  fs.writeFileSync(stem+'.repro.json',JSON.stringify({name,family,phase,options:opts,command:cmd,args:argv},null,2)+'\n');
  const p=spawnSync(cmd,argv,{encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:4e6});
  fs.writeFileSync(stem+'.log',(p.stdout??'')+(p.stderr??''));assert.equal(p.status,0,String(p.error??p.stderr));
  const m=JSON.parse(fs.readFileSync(stem+'.json')),bytes=fs.readFileSync(stem+'.bin'),scene=readSnapshot(bytes);
  assert.ok(family==='source'?m.immutable&&m.lifetime:m.inputUnchanged&&m.priorSnapshotPreserved,'request/previous owner preserved');
  if(m.verdict){assert.equal(scene.parts.length,0);assert.equal(scene.vertices.length,0);if(family==='source')assert.equal(m.slabs.length,0);}
  else if(family==='source'&&phase==='new')assert.equal(m.mechanicsVerdict,0,JSON.stringify(m.mechanicsDiagnostics));
  if(!m.verdict&&(family!=='source'||m.mechanicsVerdict===0)){inspectScene(scene);assert.ok(scene.parts.length);}
  if(family==='source'&&phase==='new')assert.equal(m.semanticsVersion,2);
  return {m,scene,sha256:digest(bytes)};
}
function run(name,family,opts,verdict=0,oracle=()=>{},oldVerdict){
  try{
    const a=execute(name,family,'new',opts);assert.equal(a.m.verdict,verdict,JSON.stringify(a.m.diagnostics));oracle(a);
    let old;
    if(oldVerdict!==undefined){old=execute(name,family,'old',opts);assert.equal(old.m.verdict,oldVerdict,JSON.stringify(old.m.diagnostics));}
    results.push({name,family,options:opts,pass:true,verdict:a.m.verdict,oldVerdict:old?.m.verdict,oldMechanicsVerdict:old?.m.mechanicsVerdict,sha256:a.sha256,oldSha256:old?.sha256,parts:a.scene.parts.length,triangles:a.scene.faces.length,intervals:a.m.intervals,diagnostics:a.m.diagnostics,layout:a.m.abiSizes??a.m.layout});
    return {a,old};
  }catch(e){results.push({name,family,options:opts,pass:false,error:e.stack});console.error(name,e.message);return null;}
}
const diag=code=>x=>assert.ok(x.m.diagnostics.some(d=>(typeof d==='string'?d:d.message).includes(code)),JSON.stringify(x.m.diagnostics));
const intervals=(field,lo,hi,reference)=>x=>{const rows=x.m.intervals.filter(v=>v[0]===field);assert.ok(rows.length);for(const v of rows){close(v[4],lo,1e-12);close(v[5],hi,1e-12);if(reference!==undefined)assert.equal(v[3],reference);}};
const volume=want=>x=>close(x.scene.parts.reduce((s,p)=>s+inspectMesh(partMesh(x.scene,p)).volume,0),want,Math.max(1e-6,Math.abs(want)*1e-9));
const all=(...fs)=>x=>fs.forEach(f=>f(x));
const art=(lo,hi)=>x=>{const slabs=x.m.slabs.filter(s=>s.stage===14);assert.ok(slabs.length);for(const s of slabs){close(s.lo,lo,1e-12);close(s.hi,hi,1e-12);}};
const sample=(s,x,y)=>s.parts.flatMap(p=>intersections(partMesh(s,p),2,x,y)).sort((a,b)=>a-b);
const strap={product:2,width:40,height:30,set:{baseH:6,strapZ:3,strapD:4,strapCham:0}};
const broken={...strap,set:{...strap.set,topBevel:1,topBevelShape:1,topBevelR:2}};
for(const cham of [0,.6]){
  const r=run('accepted-strap-blocker-cham-'+cham,'mechanics',{...broken,set:{...broken.set,strapCham:cham}},1,diag('FINAL_STRAP_ROOF'),0);
  if(r){const hits=sample(r.old.scene,19.5,0);assert.equal(hits.length,2);close(hits[0],0,1e-8);close(hits[1],cham? .9:1,1e-7);r.old.m.analyticWitness=hits;}
}
for(const [name,extra]of [
  ['plain',{}],['small-bevel',{topBevel:1,topBevelShape:1,topBevelR:.6}],['chamfer',{strapCham:.6}],
  ['small-bevel-chamfer',{topBevel:1,topBevelShape:1,topBevelR:.2,strapCham:.6}],
  ['round-bevel',{topBevel:1,topBevelShape:0,topBevelR:.6}],
  ['stepped-bevel',{topBevel:1,topBevelShape:2,topBevelR:.6,topBevelSeg:2}],
  ['rotated-mouth',{strapAngle:17,strapCham:.4}],['quarter-turn',{strapAngle:90}],['lateral-offset',{strapOff:3,strapCham:.4}],
  ['horizontal-capsule',{strapSlot:1.4}],['vertical-capsule',{strapSlot:1.2,strapSlotDir:1}]
]){
  const r=run('strap-valid-'+name,'mechanics',{...strap,set:{...strap.set,...extra}},0,x=>{
    const g=x.m.features.find(f=>f.id==='guard:strap:roof-floor');assert.ok(g);assert.ok(g.dimensions[0]>0&&g.dimensions[1]>0);
  },0);
  if(r)assert.equal(r.a.sha256,r.old.sha256,'queries must leave nominal successful material bytes identical');
}
for(const variant of ['prepared','colors','hole','islands'])run('strap-material-'+variant,'mechanics',{...strap,variant},0,diag('FINAL_STRAP_GUARD'),0);
for(const variant of ['strap-roof-gap','strap-floor-gap'])run(variant,'mechanics',{...strap,variant},1,diag(variant.includes('floor')?'FINAL_STRAP_FLOOR':'FINAL_STRAP_ROOF'),0);
for(const skin of [1e-6,.02,.2]){
  const r=run('strap-roof-skin-'+skin,'mechanics',{...strap,variant:'strap-roof-gap','roof-skin':skin},0,x=>{
    const hits=sample(x.scene,1.173,.013);close(hits.at(-1),5+skin,1e-10);
    const g=x.m.features.find(f=>f.id==='guard:strap:roof-floor');assert.ok(g.dimensions[1]>0&&g.dimensions[1]<=skin+1e-10);
  },0);if(r)assert.equal(r.a.sha256,r.old.sha256);
}
// Native interval arithmetic and the WASM implementation receive the identical
// decimal requests. The oracle is independent B(n), not library interval flags.
const bad={product:0,h0:.16,'layers.baseH':'12,0,0','layers.artH':'4,0,128'};
const oldBug=run('accepted-source-blocker','source',bad,1,diag('SOURCE_REFERENCE_LAYER'),0);
if(oldBug){art(2.36,3.12)(oldBug.old);}
for(const h0 of [.16,.25,.27])for(const h of [.16,.2,.25]){
  const H=h0+11*h,D=4*h;
  const opts={h0,h,'layers.baseH':'12,0,0','layers.artH':'4,12,128'};
  run('schedule-'+h0+'-'+h,'source',opts,0,all(art(H,H+D),intervals(27,H,H+D,12),volume(264*H+200*D)));
  run('bad-reference-'+h0+'-'+h,'source',{...opts,'layers.artH':'4,11,128'},1,diag('SOURCE_REFERENCE_LAYER'),0);
}
for(const binding of ['.8,0,128','.8,12,129','.8,12,130'])run('declared-mm-art-'+binding,'source',{'mm.artH':binding},1,diag(binding.endsWith('128')?'SOURCE_REFERENCE_LAYER':'SOURCE_DATUM_MISMATCH'),0);
run('declared-mm-correct','source',{'mm.artH':'.8,12,128'},0,intervals(27,2.4,3.2,12),0);
run('unspecified-mm-offgrid','source',{h0:.16,baseH:2.4,artH:1.7},0,all(art(2.4,4.1),intervals(27,2.4,4.1,0xffffffff),diag('OFF_GRID_DATUM_CONVERSION_UNAVAILABLE')),0);
run('wrong-declared-offgrid','source',{h0:.16,baseH:2.4,'mm.artH':'1.7,12,128'},1,diag('SOURCE_REFERENCE_LAYER'),0);
run('rim-art-face','source',{h0:.16,rimOn:1,'layers.baseH':'12,0,0','layers.rimH':'3,12,129','layers.artH':'4,15,128'},0,all(intervals(29,2.36,2.96,12),art(2.96,3.76),volume(264*2.96+200*.8)));
run('rim-wrong-mm-face','source',{rimOn:1,'mm.rimH':'.6,0,129'},1,diag('SOURCE_REFERENCE_LAYER'),0);
run('rim-wrong-tag','source',{rimOn:1,'mm.rimH':'.6,12,128'},1,diag('SOURCE_DATUM_MISMATCH'),0);
run('recess-downward','source',{h0:.16,artMode:1,'layers.baseH':'12,0,0','layers.artH':'4,12,131'},0,all(intervals(27,1.56,2.36,12),volume(264*2.36-200*.8)));
run('recess-rim-bed','source',{h0:.16,artMode:1,rimOn:1,'layers.baseH':'12,0,0','layers.artH':'4,12,131','layers.rimH':'3,0,129'},0,intervals(29,0,.56,0));
run('recess-wrong-direction-tag','source',{artMode:1,'mm.artH':'.8,12,128'},1,diag('SOURCE_DATUM_MISMATCH'),0);
run('recess-zero-floor','source',{h0:.16,artMode:1,'layers.baseH':'12,0,0','layers.artH':'12,12,131'},1,diag('RECESS_REQUIRES_POSITIVE_FLOOR'),1);
run('recess-underflow','source',{artMode:1,'layers.artH':'4,2,131'},1,diag('DOWNWARD_LAYERS_BELOW_BED'),0);
run('flat-inset-rim','source',{h0:.16,artMode:2,rimOn:1,'layers.baseH':'16,0,0','layers.flatTop':'3,13,130','layers.rimH':'2,11,129'},0,all(intervals(26,2.56,3.16,13),intervals(29,2.16,2.56,11),volume(264*3.16)));
run('flat-raised','source',{h0:.16,artMode:3,'layers.baseH':'12,0,0','layers.flatTop':'3,12,130'},0,all(intervals(26,2.36,2.96,12),volume(264*2.96)));
run('flat-inset-wrong-mm','source',{artMode:2,'mm.flatTop':'1,12,130'},1,diag('SOURCE_REFERENCE_LAYER'),0);
run('band-schedule','source',{h0:.16,layerBand:1,'layers.baseH':'12,0,0','layers.artH':'4,12,128'},0,x=>{
  const rows=x.m.slabs.filter(s=>s.stage===14);assert.deepEqual(rows.map(s=>s.slot),[2,3]);close(rows[0].hi,3.16,1e-12);close(rows[1].hi,3.96,1e-12);volume(264*2.36+100*.8+100*1.6)(x);
});
run('band-core-unspecified','source',{h0:.16,layerBand:1,bandCore:1,bandCap:.4,'layers.baseH':'12,0,0','layers.artH':'4,12,128'},0,x=>{
  const cap=x.m.intervals.filter(r=>r[0]===33);assert.equal(cap.length,2);close(cap[0][4],2.76,1e-12);close(cap[0][5],3.16,1e-12);close(cap[1][4],3.56,1e-12);assert.deepEqual(cap.map(r=>r[3]),[16,20]);
});
run('band-core-explicit-multiface-rejected','source',{layerBand:1,bandCore:1,'layers.bandCap':'2,16,132'},1,diag('SOURCE_REFERENCE_LAYER'),0);
run('band-core-explicit-single-top','source',{layerBand:1,bandCore:1,samecolor:1,'layers.bandCap':'2,16,132'},0,intervals(33,2.8,3.2,16));
run('override-explicit','source',{override:1,overridebinding:'3,12,128',overridemode:'layers'},0,x=>{const row=x.m.slabs.find(s=>s.source==='101'&&s.stage===14);close(row.hi,3,1e-12);assert.equal(x.m.inputRegions[0].height.reference,12);});
run('override-wrong-mm','source',{override:1,overridebinding:'1,0,128'},1,diag('SOURCE_REFERENCE_LAYER'),0);
run('override-wrong-tag','source',{override:1,overridebinding:'1,12,129'},1,diag('SOURCE_DATUM_MISMATCH'),0);
for(const text of ['on','bed','step','nobase']){
  run('legacy-text-'+text,'source',{text},1,diag('SOURCE_REFERENCE_LAYER'),0);
  run('nominal-text-'+text,'source',{text,textbinding:'unspecified'},0,x=>assert.ok(x.m.inputTexts.every(t=>t.height.datum===0)),0);
}
run('legacy-text-layers','source',{text:'on',textlayers:1,h0:.27},1,diag('SOURCE_REFERENCE_LAYER'),0);
run('text-model-exact','source',{text:'on','text.base.layers':'3,16,134','text.height.layers':'4,19,133'},0,x=>{close(x.m.inputTexts[0].baseHeight.reference,16);const t=x.m.slabs.filter(s=>s.role===7);for(const s of t){close(s.lo,3.8,1e-12);close(s.hi,4.6,1e-12);}});
run('text-bed-first-layer','source',{h0:.16,text:'bed','text.base.layers':'3,0,134','text.height.layers':'4,3,133'},0,x=>{const t=x.m.slabs.filter(s=>s.role===7);for(const s of t){close(s.lo,.56,1e-12);close(s.hi,1.36,1e-12);}});
run('text-mm-wrong-tag','source',{text:'bed',textbinding:'unspecified','text.height.mm':'.8,3,134'},1,diag('SOURCE_DATUM_MISMATCH'),0);
run('text-mm-correct','source',{text:'bed','text.base.mm':'.6,0,134','text.height.mm':'.8,3,133'},0);
const clicky={product:1,defaults:1,pattern:'square',housing:0,'layers.plateT':'8,35,2','layers.artH':'4,43,128'};
run('clicky-manufacturing-faces','source',clicky,0,all(intervals(24,7,8.6,35),intervals(27,8.6,9.4,43),art(1.6,2.4)));
run('clicky-wrong-local-reference','source',{...clicky,'layers.plateT':'8,0,2'},1,diag('SOURCE_REFERENCE_LAYER'),0);
run('clicky-model-text','source',{...clicky,text:'on','text.base.layers':'3,47,134','text.height.layers':'4,50,133'},0,x=>{assert.equal(x.m.bodyDatumZ,7);const t=x.m.intervals.filter(r=>r[0]===0);close(t[0][4],9.4,1e-12);close(t[0][5],10,1e-12);close(t[1][4],10,1e-12);});
run('clicky-bed-text','source',{...clicky,text:'bed',textx:-40,'text.base.layers':'3,0,134','text.height.layers':'4,3,133'},0,x=>{const rows=x.m.intervals.filter(r=>r[0]===0);close(rows[0][4],0,1e-12);close(rows[1][4],.6,1e-12);});
const charm={product:4,defaults:1,pattern:'square',charmGan:1,'mm.baseH':'3,23,1','mm.artH':'.8,38,128'};
run('charm-manufacturing-faces','source',charm,0,all(intervals(23,4.6,7.6,23),intervals(27,7.6,8.4,38),art(3,3.8)));
run('charm-model-text','source',{...charm,text:'on','text.base.mm':'.6,42,134','text.height.mm':'.8,45,133'},0,x=>{const rows=x.m.intervals.filter(r=>r[0]===0);close(rows[0][4],8.4,1e-12);close(rows[1][4],9,1e-12);});
run('charm-wrong-local-binding','source',{...charm,'mm.baseH':'3,0,1'},1,diag('SOURCE_REFERENCE_LAYER'),0);
run('wrong-mm-tag-same-height','source',{'mm.baseH':'2.4,0,2'},1,diag('SOURCE_DATUM_MISMATCH'),0);
run('offgrid-model-text','source',{h0:.16,text:'on',textbinding:'unspecified'},0,x=>{const rows=x.m.intervals.filter(r=>r[0]===0);assert.ok(rows.every(r=>r[3]===0xffffffff));assert.equal(x.m.proposals,0);});
run('inactive-raised-override','source',{artMode:1,override:1,overridemode:'layers',overridebinding:'4,0,128'},0,x=>{
  assert.equal(x.m.inputRegions[0].height.mode,2);assert.equal(x.m.inputRegions[0].height.reference,0);assert.ok(x.m.diagnostics.includes('OBJECT_HEIGHT_RETAINED_INACTIVE'));
});
run('resource','source' ,{ops:2},2,diag('OPERATION_BUDGET'),2);
run('cancel','source',{cancel:5},3,diag('CANCELLED'),3);
run('stale-upstream','source',{stale:1},1,diag('STALE_UPSTREAM_BINDING'),1);
const summary={target,total:results.length,passed:results.filter(r=>r.pass).length,configuredReview:false,fast:'unverified',results};
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(summary,null,2)+'\n');
console.log(target+' R2 '+summary.passed+'/'+summary.total);
if(summary.passed!==summary.total)process.exitCode=1;
