import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync,spawn} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,unlinkSync} from 'node:fs';
import {fixture,identity,bundle,writeBundle} from './recovery-helpers.mjs';
import {recoveryLedger} from '../../src/server/recovery.mjs';
import {cliCommand} from './cli-command.mjs';
const cli=fileURLToPath(new URL('../../src/server/cli.mjs',import.meta.url));
function run(action,env) {
 const r=spawnSync('pwsh.exe',['-NoProfile','-Command',cliCommand(cli,action)],{env:{...process.env,...env},windowsHide:true,encoding:'utf8',timeout:25000});
 assert.equal(r.error,undefined,'CLI completes in bounded time');return r;
}
const parse=r=>JSON.parse(r.stdout.trim().split(/\r?\n/).at(-1));
test('B-05 CLI: plan/check/apply use the service writer lock, stable canonical action, private evidence and redacted stdout/stderr',async t=>{
 const f=fixture(t);f.now=Date.now()-1000;
 const input=bundle(f,{missing:[{record:identity(f,{at:f.now-100})}]});
 const file=writeBundle(f.root,input),env={BACKEND_DATA_DIR:f.root,BACKEND_RECOVERY_BUNDLE:file,
  BACKEND_KEYS_FILE:join(f.root,'keys.json'),BACKEND_ORIGIN:'https://app.example.invalid',BACKEND_PORT:'0',BACKEND_AI_ADAPTERS:'',BACKEND_OIDC_FILE:''};
 // This test observes an exact ledger head while a legitimate service holds the
 // lock. Disable cadence here so refused commands can be measured independently.
 const runtime=join(f.root,'runtime-no-cadence.json');writeFileSync(runtime,JSON.stringify({maintenance:{enabled:false}}));
 env.BACKEND_RUNTIME_FILE=runtime;
 const outputs=[];
 const planned=run('recovery-plan',env);outputs.push(planned);assert.equal(planned.status,0);
 const p=parse(planned);assert.equal(p.status,'planned');env.BACKEND_RECOVERY_PLAN_HASH=p.planHash;env.BACKEND_RECOVERY_APPROVE_HASH=p.planHash;
 const check=run('recovery-check',env);outputs.push(check);assert.equal(check.status,0);
 const stored=f.s.get('SELECT json FROM recovery_plans WHERE hash=?',p.planHash).json;
 assert.equal(run('generate-keys',env).status,0);
 const child=spawn('pwsh.exe',['-NoProfile','-Command',cliCommand(cli,'serve')],{env:{...process.env,...env},windowsHide:true,stdio:['ignore','pipe','pipe']});
 let output='',errors='',pid;
 child.stderr.on('data',b=>{errors+=b;});
 const stop=async()=>{if(pid&&child.exitCode===null){process.kill(pid);await new Promise(resolve=>child.exitCode===null?child.once('exit',resolve):resolve());}};
 t.after(stop);
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('synthetic service startup timeout')),15000);
  child.stdout.on('data',b=>{output+=b;for(const line of output.split(/\r?\n/)){try{const r=JSON.parse(line);if(r.status==='listening'){pid=r.pid;clearTimeout(timer);resolve();}}catch{}}});
  child.once('exit',()=>{clearTimeout(timer);reject(Error('synthetic service stopped before ready'));});
 });
 const lock=join(f.root,'writer.lock'),lockBytes=readFileSync(lock),before=recoveryLedger(f.s);
 for(const action of ['recovery-plan','recovery-check','recovery-apply']){
  const blocked=run(action,env);outputs.push(blocked);assert.equal(blocked.status,1);assert.match(blocked.stderr,/EEXIST/);
  assert.deepEqual(recoveryLedger(f.s),before);assert.ok(readFileSync(lock).equals(lockBytes));
 }
 assert.equal(f.s.get('SELECT count(*) n FROM recovery_obligations').n,0);
 await stop();
 // Only this synthetic process/lock is removed, after its observed exit; no CLI takeover exists.
 if(existsSync(lock)){assert.equal(readFileSync(lock,'utf8'),String(pid));unlinkSync(lock);}
 const applied=run('recovery-apply',env);outputs.push(applied);assert.equal(applied.status,0);assert.equal(parse(applied).receipt.entries,1);
 const once=recoveryLedger(f.s),replayed=run('recovery-apply',env);outputs.push(replayed);assert.equal(replayed.status,0);assert.equal(parse(replayed).replayed,true);
 assert.deepEqual(recoveryLedger(f.s),once);assert.equal(f.s.get('SELECT json FROM recovery_plans WHERE hash=?',p.planHash).json,stored);
 const status=run('recovery-status',env);outputs.push(status);assert.equal(status.status,0);
 writeFileSync(file,JSON.stringify({...input.bundle,bundleId:crypto.randomUUID()}));
 const changed=run('recovery-apply',env);outputs.push(changed);assert.equal(changed.status,1);assert.deepEqual(recoveryLedger(f.s),once);
 const text=outputs.map(r=>r.stdout+r.stderr).join('')+output+errors;
 for(const secret of ['SYNTHETIC_INVOICE_SECRET_NEVER_STDOUT','SYNTHETIC_PRIVATE_PROMPT_DO_NOT_PRINT','BEGIN PRIVATE KEY',f.users[0],input.bundle.entries[0].record.requestId].filter(Boolean))assert.ok(!text.includes(secret),'CLI emits bounded operational identifiers and counts only');
 assert.equal(f.s.get('SELECT count(*) n FROM credentials WHERE sealed IS NOT NULL').n,0);
});
