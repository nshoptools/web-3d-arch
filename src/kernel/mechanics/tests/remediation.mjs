import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {readSnapshot,partMesh,inspectScene,intersections,unionAt,close} from './oracles/mechanical-oracle.mjs';
const target=process.argv[2]??'native',filter=process.argv[3];assert.ok(['native','wasm'].includes(target));
const room=process.env.PROJECT_REVIEW_RUN;assert.ok(room&&process.env.PROJECT_ROOT&&!path.isAbsolute(path.relative(process.env.PROJECT_ROOT,room))&&!path.relative(process.env.PROJECT_ROOT,room).startsWith('..'),'Project run required');
const dir=path.join(room,'evidence/remediation-'+target);fs.mkdirSync(dir,{recursive:true});
const binary=process.env.ARCH_MECHANICS_FIXTURE??path.join(room,target==='native'?'work/build-mechanics-native/Release/mechanics_fixture.exe':'work/build-mechanics-wasm/mechanics_fixture.js');
const cases=[];
function run(id,options,verdict,code,measure){
  if(filter&&!id.includes(filter))return;
  const stem=path.join(dir,id),args=['--out',stem];for(const[k,v]of Object.entries(options)){if(k==='set'){for(const[f,x]of Object.entries(v))args.push('--set',f+'='+x);}else args.push('--'+k,String(v));}
  const argv=target==='native'?args:[binary,...args],command=target==='native'?binary:process.execPath;
  fs.writeFileSync(stem+'.repro.json',JSON.stringify({id,target,command,args:argv,options,seed:id.startsWith('seed-')?'0x00120269':null},null,2)+'\n');
  const p=spawnSync(command,argv,{encoding:'utf8',windowsHide:true,timeout:120000,env:process.env});fs.writeFileSync(stem+'.log',(p.stdout??'')+(p.stderr??''));
  try{
    assert.equal(p.status,0,String(p.error??p.stderr));const meta=JSON.parse(fs.readFileSync(stem+'.json')),scene=readSnapshot(fs.readFileSync(stem+'.bin'));
    assert.equal(meta.verdict,verdict,JSON.stringify(meta.diagnostics));assert.equal(meta.inputUnchanged,true);assert.equal(meta.priorSnapshotPreserved,true);assert.equal(meta.fitQualification,0);
    if(code)assert.ok(meta.diagnostics.some(d=>d.message.includes(code)),JSON.stringify(meta.diagnostics));
    if(verdict){assert.equal(meta.exportBlocked,1);assert.equal(scene.parts.length,0);assert.equal(scene.vertices.length,0);}
    else {assert.ok(scene.parts.length);inspectScene(scene);}
    const measured=measure?.(scene,meta)??null;cases.push({id,pass:true,verdict,measured,options});console.log('PASS '+id);return{scene,meta};
  }catch(e){cases.push({id,pass:false,error:e.stack,options});console.log('FAIL '+id+': '+e.message);}
}
const wall=(id,z,x,r,w)=> (s,m)=>{
  const hits=s.parts.flatMap((p,i)=>m.parts[i].group===0?intersections(partMesh(s,p),0,.031,z):[]).sort((a,b)=>a-b);
  const outer=hits.at(-1),hole=hits.filter(v=>v>x&&v<x+r+.01).at(-1);assert.ok(hole!==undefined,'outermost bore boundary must be present');
  const thickness=outer-hole;assert.ok(thickness>=w-2e-5,`${id} wall ${thickness} < ${w}`);
  assert.equal(unionAt(s,m,[x,.031,z]),false);assert.equal(unionAt(s,m,[(hole+outer)/2,.031,z]),true);
  const guards=m.features.filter(f=>f.id.startsWith('guard:wall-roof:'));assert.ok(guards.length);assert.ok(guards.every(f=>f.dimensions[2]>0));return{outer,hole,thickness,minReportedRoof:Math.min(...guards.map(f=>f.dimensions[2]))};
};
const bevel={product:3,height:30,set:{baseH:2,legoHoleH:1.8,topBevel:1,topBevelR:1.5,topBevelShape:1,legoRanhOn:0}};
for(const width of [39,39.500002,40,41.09,41.099998])run('001-lego-bevel-invalid-'+width,{...bevel,width},1,'FINAL_CAVITY_WALL_MISSING');
for(const width of [41.100002,41.11,42,49])run('001-lego-bevel-valid-'+width,{...bevel,width},0,null,wall('lego-bevel',1.799999,16,2.45,.8));
for(const shape of [0,2]){
  run('001-lego-profile-invalid-'+shape,{...bevel,width:39,set:{...bevel.set,topBevelShape:shape,topBevelSeg:3}},1,'FINAL_CAVITY_WALL_MISSING');
  run('001-lego-profile-valid-'+shape,{...bevel,width:42,set:{...bevel.set,topBevelShape:shape,topBevelSeg:3}},0,null,wall('lego-profile',1.799,16,2.45,.8));
}
for(const radius of [.6,2.3,2.35,3])run('001-lego-groove-'+radius,{product:3,width:40,set:{baseH:8,legoRanhR:radius,legoRanhZ:4}},radius<2.35?0:1,radius<2.35?null:'FINAL_CAVITY_WALL_MISSING',radius<2.35?wall('lego-groove',1.799,16,2.45,.8):null);
const charm={product:4,height:25,set:{baseH:3,charmOffX:6,charmChotD:12,charmChotH:2.9,topBevel:1,topBevelShape:1,topBevelR:2.8}};
for(const width of [25,29.89,29.91,32])run('001-charm-wide-pin-'+width,{...charm,width},width<29.9?1:0,width<29.9?'FINAL_CAVITY_WALL_MISSING':null,width>=29.9?wall('charm',2.899,6,6.1,.149):null);
run('001-charm-original-control',{...charm,width:25,set:{...charm.set,topBevel:0}},0,null,wall('charm-control',2.8,6,6.1,.39));
const gap={product:3,width:20,height:20,variant:'roof-gap',set:{baseH:3,legoHoleH:1.8,legoRanhOn:0,legoPitch:32}};
run('001-roof-gap',gap,1,'FINAL_CAVITY_ROOF_NOT_POSITIVE');
for(const skin of [.000001,.02,.2])run('001-roof-skin-'+skin,{...gap,'roof-skin':skin},0,null,(s,m)=>{
  const hits=s.parts.flatMap((p,i)=>m.parts[i].group===0?intersections(partMesh(s,p),2,.031,.047):[]).sort((a,b)=>a-b);
  close(hits.at(-2),1.8,1e-7);close(hits.at(-1),1.8+skin,1e-7);const g=m.features.find(f=>f.id==='guard:wall-roof:mech:lego:bore:0:0');close(g.dimensions[2],skin,1.1e-7);return{roof:hits.at(-1)-hits.at(-2),conservativeReportedRoof:g.dimensions[2],queryBudget:g.dimensions[5]};
});
for(const hollow of [0,1])for(const tol of [.001,.0005,.0001])run('001-flexure-hollow-'+hollow+'-'+tol,{product:3,width:40,tol,set:{legoRong:hollow,legoXeOn:1,legoRanhOn:0}},0,'INTENTIONAL_FLEXURE_VOID',(s,m)=>{
  assert.equal(unionAt(s,m,[2.8,.071,.9]),false,'declared cross opening');assert.equal(unionAt(s,m,[2.2,2.2,.9]),true,'remaining diagonal wall');assert.equal(unionAt(s,m,[.031,.047,1.9]),true,'roof above flexure remains');return{explicitFlexure:m.features.filter(f=>f.id.startsWith('guard:wall-roof:')).every(f=>f.dimensions[4]===1)};
});
for(const variant of ['colors','prepared','hole','islands'])run('001-final-source-'+variant,{product:3,width:40,variant,set:{legoRanhOn:0,baseH:3}},0,'FINAL_CAVITY_GUARDS');
run('001-flexure-hollow-tab-opening',{product:3,set:{legoRanhOn:0,legoRong:1,legoXeOn:1,legoTaiOn:1}},0,'INTENTIONAL_FLEXURE_VOID',(s,m)=>{
  assert.equal(unionAt(s,m,[-19.225,.031,.5]),false,'late tab must not fill the final .05 mm of declared flexure');
  assert.equal(unionAt(s,m,[-20.05,.031,.5]),true,'sacrificial tab remains');return{lateCutProbeEmpty:true};
});
for(let product=0;product<5;product++){
  run('002-import-enabled-'+product,{product,set:{impOn:1}},2,'IMPORTED_MESH_CSG_REQUIRES_PARENT_EXECUTOR');
  run('002-import-disabled-'+product,{product,set:{impOn:0}},0);
}
for(const [h0,h,ref] of [[.2,.2,35],[.27,.16,43],[.16,.2,36],[.25,.25,29]])for(const count of [6,7]){
  const post=h0+(ref-1)*h,mm=h*(count+.5),expected=count%2===0?-h/2:h/2;
  run('004-nearest-'+h0+'-'+h+'-'+count,{product:1,h0,h,set:{housing:0,postH:post},'mm-datum':`plateT,${mm},${ref},2`},0,null,(s,m)=>{const i=m.intervals.find(i=>i.field==='plateT');close(i.nearest,expected,1e-12);close(i.z1-i.z0,mm,1e-12);return{nearest:i.nearest,expected,reference:i.referenceLayer};});
}
run('003-review-mm-datum',{product:1,set:{housing:0},'mm-datum':'plateT,1.5,35,2'},0,null,(s,m)=>{const i=m.intervals.find(i=>i.field==='plateT');assert.equal(i.referenceLayer,35);assert.equal(i.datum,2);close(i.nearest,.1,1e-12);close(i.z1,8.5,1e-12);return i;});
run('003-mm-wrong-reference',{product:1,set:{housing:0},'mm-datum':'plateT,1.5,34,2'},1,'HEIGHT_REFERENCE_LAYER_DOES_NOT_MEET_FEATURE');
run('003-mm-wrong-face',{product:1,set:{housing:0},'mm-datum':'plateT,1.5,35,3'},1,'HEIGHT_DATUM_MISMATCH');
run('005-skirt-old-body-datum',{product:1,set:{housing:0},layers:'skirtH,40,0,1'},1,'HEIGHT_DATUM_MISMATCH');
for(const datum of [0,11])run('005-skirt-bed-'+datum,{product:1,set:{housing:0},layers:`skirtH,40,0,${datum}`},0,null,(s,m)=>{const i=m.intervals.find(i=>i.field==='skirtH');assert.equal(i.datum,11);close(i.z0,0);close(i.z1,8);return i;});
run('005-skirt-elevated',{product:1,set:{housing:0},layers:'skirtH,15,20,11'},0,null,(s,m)=>{const i=m.intervals.find(i=>i.field==='skirtH');close(i.z0,4);close(i.z1,7);assert.equal(i.datum,11);return i;});
run('006-steps-fractional',{product:3,set:{legoOn:0,topBevel:1,topBevelShape:2,topBevelSeg:3.9}},1,'PARAMETER_INTEGER_REQUIRED');
for(const steps of [3,4])run('006-steps-integer-'+steps,{product:3,set:{legoOn:0,topBevel:1,topBevelShape:2,topBevelSeg:steps}},0,null,(s,m)=>{assert.equal(m.features.filter(f=>f.id.startsWith('source:bevel:step:')).length,steps);return{steps};});
for(const diameter of [4,6,11])run('007-no-collar-'+diameter,{product:1,width:12,height:6,set:{housing:0,collarH:0,postD2:diameter}},0,null,(s,m)=>{
  assert.equal(m.features.some(f=>f.id==='mech:mx:collar'),false);assert.equal(m.parameters.find(p=>p.id==='postD2').value,diameter);assert.equal(unionAt(s,m,[2.5,.071,1]),true);assert.equal(unionAt(s,m,[.071,.047,1]),false);return{inactiveDiameter:diameter};
});
run('007-collar-above-socket',{product:1,set:{housing:0,collarH:1,postD2:4}},0);
run('007-collar-intersects-socket',{product:1,set:{housing:0,collarH:2,postD2:4}},1,'MX_SOCKET_BREAKS_POST_WALL');
run('OBS01-auto-stored-nonzero',{'auto-nonzero':5},1,'AUTO_MODE_REQUIRES_STORED_ZERO');
let seed=0x00120269;for(let i=0;i<12;i++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;const magnitude=.01+(seed%1000)/100000,sign=i%2?1:-1,width=Math.round((41.1+sign*magnitude)*1e6)/1e6;
  run('seed-001-boundary-'+i,{...bevel,width},sign>0?0:1,sign>0?null:'FINAL_CAVITY_WALL_MISSING',sign>0?wall('seed-wall',1.7999,16,2.45,.8):null);
}
const result={target,total:cases.length,passed:cases.filter(c=>c.pass).length,cases};fs.writeFileSync(path.join(room,'evidence/remediation-'+target+'-results.json'),JSON.stringify(result,null,2)+'\n');console.log(`${result.passed}/${result.total}`);if(result.passed!==result.total)process.exitCode=1;
