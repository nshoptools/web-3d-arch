import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {readSnapshot,inspectScene,partMesh,intersections,close} from '../../src/kernel/mechanics/tests/oracles/mechanical-oracle.mjs';
const kind=process.argv[2]??'native',run=fs.realpathSync(process.env.PROJECT_REVIEW_RUN);assert.ok(['native','wasm'].includes(kind));
const dir=path.join(run,'evidence/curved-resource-'+kind);fs.mkdirSync(dir,{recursive:true});
const exe=process.env.ARCH_MECHANICS_FIXTURE??path.join(run,'work/build-'+kind,'src/kernel/mechanics',kind==='native'?'Release/mechanics_fixture.exe':'mechanics_fixture.js'),results=[];
function test(id,options,verdict,code){const stem=path.join(dir,id),args=['--out',stem];
 for(const[k,v]of Object.entries(options)){if(k==='set')for(const[f,x]of Object.entries(v))args.push('--set',f+'='+x);else args.push('--'+k,String(v));}
 fs.writeFileSync(stem+'.repro.json',JSON.stringify({id,kind,options,seed:'0x20260908'},null,2)+'\n');const start=performance.now();
 try{const r=spawnSync(kind==='native'?exe:process.execPath,kind==='native'?args:[exe,...args],{encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:1e6});
  fs.writeFileSync(stem+'.log',(r.stdout??'')+(r.stderr??''));assert.equal(r.status,0,String(r.error??r.stderr));
  const m=JSON.parse(fs.readFileSync(stem+'.json')),s=readSnapshot(fs.readFileSync(stem+'.bin'));assert.equal(m.verdict,verdict,JSON.stringify(m.diagnostics));assert.ok(m.inputUnchanged&&m.priorSnapshotPreserved);assert.equal(m.fitQualification,0);
  if(code)assert.ok(m.diagnostics.some(d=>d.message.includes(code)),JSON.stringify(m.diagnostics));
  let dimensions;if(verdict){assert.equal(m.exportBlocked,1);assert.equal(s.vertices.length,0);assert.equal(s.parts.length,0);}
  else{inspectScene(s);const z=options.product===3?5:0,x=0,y=.037,hits=s.parts.flatMap(p=>intersections(partMesh(s,p),0,y,z)).sort((a,b)=>a-b);
   if(options.product===3){assert.ok(hits.length>=2);close(hits.at(-1),options.width/2-.6,.001);dimensions={grooveLipX:hits.at(-1),expected:options.width/2-.6};
    if(options.variant==='shallow-notch'){
     dimensions.cornerSignedDeviations=[];const radius=.6,cy=options.height/2-options['notch-depth'];
     for(const fraction of [0,.3,.6,.9]){const dz=radius*fraction,ys=s.parts.flatMap(p=>intersections(partMesh(s,p),1,5+dz,0)).sort((a,b)=>a-b);
      assert.ok(ys.length>=2);const actual=Math.hypot(cy-ys.at(-1),dz),deviation=actual-radius;
      assert.ok(deviation>=-1.2e-7&&deviation<=options.tol,'signed analytic reentrant tube '+deviation);dimensions.cornerSignedDeviations.push(deviation);}
    }
   }
   else assert.ok(m.features.some(f=>f.id==='guard:strap:roof-floor'));
  }results.push({id,pass:true,verdict,ms:performance.now()-start,dimensions,options});console.log('PASS '+id);
 }catch(e){results.push({id,pass:false,error:e.stack,options});console.log('FAIL '+id+' '+e.message);}
}
const lego={product:3,width:40,height:40,variant:'dense-ellipse',set:{baseH:10,legoRanhOn:1,legoRanhR:.6}};
test('groove-513-real-solids',{...lego,segments:513},0,'GROOVE_WORK');
test('groove-6000-preflight',{...lego,segments:6000},1,'GROOVE_PRIMITIVE_TRIANGLE_BUDGET');
test('source-200001-point-budget',{...lego,segments:200001},1,'SOURCE_CONTEXT');
test('strap-scan-1024',{product:2,width:40,height:30,variant:'dense-ellipse',segments:1024,set:{baseH:10,strapZ:5,strapCham:.6}},0,'CHAMFER_WORK');
// Seeded normal cases exercise different real tessellations, with no expectation
// changed to accept a refusal. The invalid resource cases above are separate.
let seed=0x20260908;for(let i=0;i<3;i++){seed=(Math.imul(1664525,seed)+1013904223)>>>0;test('seed-normal-'+i,{...lego,segments:514+seed%99},0,'GROOVE_WORK');}
for(const depth of [.000001,.001,.2])for(const [size,tol]of [[40,.001],[50,.0005],[60,.00025]]){
 test(`groove-notch-${depth}-${size}`,{...lego,width:size,height:size,variant:'shallow-notch','notch-depth':depth,tol},0,'GROOVE_WORK');
}
fs.writeFileSync(path.join(run,'reports/curved-resource-'+kind+'.json'),JSON.stringify({version:2,seed:'0x20260908',results},null,2)+'\n');process.exitCode=results.some(x=>!x.pass)?1:0;
