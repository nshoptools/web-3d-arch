import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {readSnapshot,partMesh,inspectMesh,inside,intersections,sectionSegments,radialExtrema,close,bbox} from './oracles/spatial-oracle.mjs';
import {room,evidence} from '../tools/test-env.mjs';
const target=process.argv[2]??'native';assert.ok(['native','wasm'].includes(target));
const dir=path.join(evidence,`bridge-${target}`);fs.mkdirSync(dir,{recursive:true});
const binary=path.join(room,`work/build-source-${target}`,target==='native'?'Release/mechanics_bridge_fixture.exe':'mechanics_bridge_fixture.js'),records=[];
function run(id,options={},check=()=>{},verdict=0){const base=path.join(dir,id),args=['--out',base];for(const[k,v]of Object.entries(options)){if(k==='set')for(const[a,b]of Object.entries(v))args.push('--set',`${a}=${b}`);else args.push(`--${k}`,String(v));}
  const result=spawnSync(target==='native'?binary:process.execPath,target==='native'?args:[binary,...args],{encoding:'utf8',timeout:180000});fs.writeFileSync(base+'.log',(result.stdout??'')+(result.stderr??''));fs.writeFileSync(base+'.repro.json',JSON.stringify({id,options,target},null,2)+'\n');
  try{assert.equal(result.status,0,result.stderr);const m=JSON.parse(fs.readFileSync(base+'.json')),s=readSnapshot(fs.readFileSync(base+'.bin'));assert.equal(m.verdict,verdict,JSON.stringify(m.diagnostics));assert.ok(m.inputUnchanged&&m.priorSnapshotPreserved);assert.equal(m.fitQualification,0);if(verdict)assert.equal(s.parts.length,0);else{const meshes=s.parts.map(p=>partMesh(s,p));meshes.forEach(inspectMesh);check(m,s,meshes);}records.push({id,status:'pass'});}catch(e){records.push({id,status:'fail',error:e.message});console.error(id,e.message);}}
run('groove-rectangle',{product:3,width:40,height:30},(m,s,meshes)=>{const expected=6720-15*Math.PI*2.45**2*1.8-(70*Math.PI*.8**2-16*.8**3/3);close(meshes.reduce((sum,x)=>sum+inspectMesh(x).volume,0),expected,1);for(const dz of [-.71,-.4,0,.37,.69]){const hits=meshes.flatMap(x=>intersections(x,0,.173,2.8+dz));close(Math.max(...hits),20-Math.sqrt(.64-dz*dz),.0011);}});
for(const variant of ['hole','islands','colors'])run('groove-'+variant,{product:3,variant},(m,s,meshes)=>{if(variant==='hole')assert.ok(!meshes.some(x=>inside(x,[0,0,4])));});
for(const tol of [.001,.0005,.0001])run('concave-'+tol,{product:3,variant:'concave',tol},(m,s,meshes)=>{const radial=radialExtrema(meshes.flatMap(x=>sectionSegments(x,2.8317)),0,0,[.79,.81]),r=Math.sqrt(.64-.0317**2);assert.ok(radial.min>=r-2e-8&&radial.max<=r+tol,JSON.stringify(radial));assert.ok(!meshes.some(x=>inside(x,[.1,.1,4])));});
run('literal-zero',{product:3,set:{legoRanhZ:0}});
run('roof-invalid',{product:3,set:{legoRanhR:3}},()=>{},1);
run('exact-shared-material',{variant:'prepared',width:20,height:10,set:{ringOn:0}},(m,s,meshes)=>{const color=s.parts.map((p,i)=>p.color!==0x30353bff?i:-1).filter(i=>i>=0);assert.equal(color.length,2);for(const z of [1.41,1.8,2.31]){close(Math.max(...intersections(meshes[color[0]],0,.17,z)),0,1e-12);close(Math.min(...intersections(meshes[color[1]],0,.17,z)),0,1e-12);}});
run('disjoint-z',{variant:'z-separated',width:20,height:10,set:{ringOn:0}},(m,s,meshes)=>{close(meshes.reduce((v,x)=>v+inspectMesh(x).volume,0),880);assert.ok(!meshes.some(x=>inside(x,[.17,.29,3.9])));});
run('overlap-invalid',{variant:'z-overlap',set:{ringOn:0}},()=>{},1);
run('stale-invalid',{stale:1},()=>{},1);
const summary={target,records,total:records.length,passed:records.filter(r=>r.status==='pass').length};fs.writeFileSync(path.join(evidence,`bridge-${target}-results.json`),JSON.stringify(summary,null,2)+'\n');console.log(`${target} bridge ${summary.passed}/${summary.total}`);if(summary.total!==summary.passed)process.exitCode=1;
