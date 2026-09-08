import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readSnapshot} from './oracles/mechanical-oracle.mjs';
const room=process.env.PROJECT_REVIEW_RUN;
assert.ok(room&&process.env.PROJECT_ROOT&&!path.relative(process.env.PROJECT_ROOT,room).startsWith('..'),'Project run required');
const executable=process.env.ARCH_MECHANICS_FIXTURE??path.join(room,'work/build-mechanics-native/Release/mechanics_fixture.exe');
const output=path.join(room,'evidence/cancellation-native');fs.mkdirSync(output,{recursive:true});
const cases=[];
for(let i=0;i<3;i++){
  const stem=path.join(output,`observer-${i}`),args=['--product','3','--width','100','--height','95','--cancel','during','--out',stem];
  fs.writeFileSync(stem+'.reproducer.json',JSON.stringify({command:executable,args},null,2)+'\n');
  const start=Date.now(),p=spawnSync(executable,args,{env:process.env,encoding:'utf8',timeout:15000,windowsHide:true});
  const elapsedMs=Date.now()-start;fs.writeFileSync(stem+'.log',(p.stdout??'')+(p.stderr??''));
  assert.equal(p.status,0,p.error?.message??p.stderr);
  const bytes=fs.readFileSync(stem+'.bin'),scene=readSnapshot(bytes),metadata=JSON.parse(fs.readFileSync(stem+'.json'));
  assert.equal(metadata.verdict,5);assert.equal(metadata.exportBlocked,1);assert.equal(metadata.inputUnchanged,true);
  assert.equal(scene.vertices.length,0);assert.equal(scene.parts.length,0);
  assert.ok(metadata.diagnostics.some(d=>d.message.includes('CANCELLED')));
  cases.push({verdict:'pass',elapsedMs,artifact:path.relative(room,stem+'.bin'),sha256:createHash('sha256').update(bytes).digest('hex')});
}
fs.writeFileSync(path.join(room,'reports/mechanics-cancellation.json'),JSON.stringify({version:1,at:new Date().toISOString(),target:'native',
  method:'Independent thread waits for stage >= 3 (surfaces), then cancels generation 17; independent reader checks zero mesh',
  scope:'In-flight cancellation and publication gate; does not prove every library query is interruptible or a hard latency SLA',cases},null,2)+'\n');
console.log(`PASS native in-flight cancellation: ${cases.length} observers, no partial mesh`);
