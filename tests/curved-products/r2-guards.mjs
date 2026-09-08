// R2's adjudicated roof regressions, replayed on the current child fixture.
// Oracle uses serialized vertices and triangle intersections, never Manifold.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {readSnapshot,inspectScene,partMesh,intersections,close} from '../../src/kernel/mechanics/tests/oracles/mechanical-oracle.mjs';
const kind=process.argv[2]??'native',run=fs.realpathSync(process.env.PROJECT_REVIEW_RUN);
assert.ok(['native','wasm'].includes(kind));
const out=path.join(run,'evidence/curved-r2-'+kind);fs.mkdirSync(out,{recursive:true});
const exe=process.env.ARCH_MECHANICS_FIXTURE??path.join(run,'work/build-'+kind,'src/kernel/mechanics',kind==='native'?'Release/mechanics_fixture.exe':'mechanics_fixture.js');
const results=[],base={product:2,width:40,height:30,set:{baseH:6,strapZ:3,strapD:4,strapCham:0}};
function test(id,extra,verdict=0,code,skin){
 const options={...base,...extra,set:{...base.set,...extra.set}},stem=path.join(out,id),args=['--out',stem];
 for(const[k,v]of Object.entries(options)){if(k==='set')for(const[f,x]of Object.entries(v))args.push('--set',f+'='+x);else args.push('--'+k,String(v));}
 fs.writeFileSync(stem+'.repro.json',JSON.stringify({kind,id,options,seed:null},null,2)+'\n');
 try{const r=spawnSync(kind==='native'?exe:process.execPath,kind==='native'?args:[exe,...args],{encoding:'utf8',windowsHide:true,timeout:120000});
  fs.writeFileSync(stem+'.log',(r.stdout??'')+(r.stderr??''));assert.equal(r.status,0,String(r.error??r.stderr));
  const m=JSON.parse(fs.readFileSync(stem+'.json')),scene=readSnapshot(fs.readFileSync(stem+'.bin'));
  assert.equal(m.verdict,verdict,JSON.stringify(m.diagnostics));assert.ok(m.inputUnchanged&&m.priorSnapshotPreserved);assert.equal(m.fitQualification,0);
  if(code)assert.ok(m.diagnostics.some(d=>d.message.includes(code)),JSON.stringify(m.diagnostics));
  let guard;if(verdict){assert.equal(m.exportBlocked,1);assert.equal(scene.parts.length,0);assert.equal(scene.vertices.length,0);}
  else{inspectScene(scene);guard=m.features.find(f=>f.id==='guard:strap:roof-floor')?.dimensions;assert.ok(guard&&guard[0]>0&&guard[1]>0);
   if(skin){const hits=scene.parts.flatMap(p=>intersections(partMesh(scene,p),2,1.173,.013)).sort((a,b)=>a-b);close(hits.at(-1),5+skin,1e-10);assert.ok(guard[1]<=skin+1e-10);}
  }results.push({id,pass:true,verdict,guard,options});console.log('PASS '+id);
 }catch(e){results.push({id,pass:false,error:e.stack,options});console.log('FAIL '+id+' '+e.message);}
}
for(const cham of [0,.6])test('r2-roof-after-bevel-'+cham,{set:{topBevel:1,topBevelShape:1,topBevelR:2,strapCham:cham}},1,'FINAL_STRAP_ROOF');
for(const [name,set]of [
 ['plain',{}],['small-bevel',{topBevel:1,topBevelShape:1,topBevelR:.6}],['chamfer',{strapCham:.6}],
 ['bevel-chamfer',{topBevel:1,topBevelShape:1,topBevelR:.2,strapCham:.6}],['round-bevel',{topBevel:1,topBevelShape:0,topBevelR:.6}],
 ['steps',{topBevel:1,topBevelShape:2,topBevelR:.6,topBevelSeg:2}],['rotated',{strapAngle:17,strapCham:.4}],['quarter-turn',{strapAngle:90}],
 ['offset',{strapOff:3,strapCham:.4}],['horizontal-capsule',{strapSlot:1.4}],['vertical-capsule',{strapSlot:1.2,strapSlotDir:1}]
])test('r2-valid-'+name,{set});
for(const variant of ['prepared','colors','hole','islands'])test('r2-material-'+variant,{variant},0,'FINAL_STRAP_GUARD');
for(const side of ['roof','floor'])test('r2-'+side+'-gap',{variant:'strap-'+side+'-gap'},1,'FINAL_STRAP_'+side.toUpperCase());
for(const skin of [.000001,.02,.2])test('r2-roof-skin-'+skin,{variant:'strap-roof-gap','roof-skin':skin},0,'FINAL_STRAP_GUARD',skin);
fs.writeFileSync(path.join(run,'reports/curved-r2-'+kind+'.json'),JSON.stringify({version:1,results},null,2)+'\n');process.exitCode=results.some(r=>!r.pass)?1:0;
