import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync,writeFileSync,existsSync,mkdirSync,mkdtempSync } from 'node:fs';
import { spawnSync,spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { request as httpRequest } from 'node:http';
import { Store } from '../../src/server/database.mjs';
import { bootstrap } from '../../src/server/accounts.mjs';
import { backupDatabase,restoreDatabase } from '../../src/server/operations.mjs';
import { createBackend } from '../../src/server/app.mjs';
import { setup,defaultPolicy,Client } from './helpers.mjs';
import {cliCommand} from './cli-command.mjs';
const cli=fileURLToPath(new URL('../../src/server/cli.mjs',import.meta.url));
const command=action=>cliCommand(cli,action);
function run(action,env){const r=spawnSync('pwsh.exe',['-NoProfile','-Command',command(action)],{env:{...process.env,...env},encoding:'utf8',windowsHide:true,timeout:20000});assert.equal(r.error,undefined,'CLI process must run');return r;}
test('EXT-05: consistent SQLite backup/restore preserves settings and revokes old auth; AI stays held',async t=>{
  const f=await setup(t);
  await f.a.ok('PUT','/api/v1/settings',{schemaVersion:1,values:{language:'vi'}},{'If-Match':'"r0"'});
  const backup=join(f.root,'snapshot.sqlite'),destination=join(f.root,'restored.sqlite');
  const meta=await backupDatabase(f.config.databasePath,backup);assert.ok(meta.pages>0);assert.ok(meta.byteLength>0);
  await assert.rejects(()=>backupDatabase(f.config.databasePath,backup),/BACKUP_DESTINATION_MUST_BE_NEW/);
  const restored=restoreDatabase(backup,destination,f.clock());assert.equal(restored.sessionsRevoked,true);
  assert.throws(()=>restoreDatabase(backup,destination),/RESTORE_DESTINATION_MUST_BE_NEW/);
  const s=new Store(destination);
  assert.equal(s.get('SELECT count(*) n FROM sessions').n,0);assert.equal(s.get('SELECT json FROM settings WHERE user_id=?',f.a.user.id).json,'{"language":"vi"}');
  assert.equal(s.get("SELECT value FROM operational_state WHERE key='restore-ai-hold'").value,'reconciliation-required');s.close();
  const another=createBackend({...f.config,databasePath:destination});await another.listen(0);
  try {
    const mirror={...f,app:another},c=new Client(mirror);await c.login('member-a');
    assert.equal((await c.ok('GET','/api/v1/settings')).values.language,'vi');
    assert.equal((await c.request('POST','/api/v1/ai/jobs',{})).json.error.code,'RESTORE_RECONCILIATION_REQUIRED');
  } finally{await another.close();}
});
test('ACC-01: bootstrap is one explicit local command; no password or public first-admin endpoint',async t=>{
  const root=mkdtempSync(join(process.env.PROJECT_REVIEW_RUN,'evidence','cli-'));
  const data=join(root,'data'),keys=join(root,'key-material','keys.json'),policyPath=join(root,'policy.json');
  const policy=defaultPolicy();policy.allowedProviders=[];writeFileSync(policyPath,JSON.stringify(policy));
  const env={BACKEND_DATA_DIR:data,BACKEND_KEYS_FILE:keys,BACKEND_POLICY_FILE:policyPath,BACKEND_OWNER_ISSUER:'https://identity.example.invalid',BACKEND_OWNER_SUBJECT:'synthetic-cli-owner',BACKEND_ORIGIN:'https://app.example.invalid'};
  assert.equal(run('generate-keys',env).status,0);
  const before=readFileSync(keys);assert.notEqual(run('generate-keys',env).status,0);assert.ok(before.equals(readFileSync(keys)),'existing key file not replaced');
  const absent=run('bootstrap',{...env,BACKEND_OWNER_SUBJECT:''});assert.equal(absent.status,1);
  const result=run('bootstrap',env);assert.equal(result.status,0);assert.ok(!result.stdout.includes('BEGIN PRIVATE KEY'));assert.equal(run('bootstrap',env).status,1);
  const backup=join(root,'backup.sqlite');assert.equal(run('backup',{...env,BACKEND_BACKUP_FILE:backup}).status,0);
  const restoredDir=join(root,'restored-data');assert.equal(run('restore',{...env,BACKEND_DATA_DIR:restoredDir,BACKEND_RESTORE_FILE:backup}).status,0);
  assert.equal(run('maintenance',env).status,0);assert.equal(run('rewrap-vault',env).status,0);
  writeFileSync(join(data,'writer.lock'),'existing-writer');
  const blocked=run('serve',env);assert.equal(blocked.status,1);assert.equal(readFileSync(join(data,'writer.lock'),'utf8'),'existing-writer');
  // Do not unlink the synthetic lock: its retained value is evidence of no takeover.
  assert.equal(run('bootstrap',{...env,BACKEND_DATA_DIR:process.env.PROJECT_ROOT}).status,1);
});
test('CLI serve binds OS-assigned loopback port, disables production AI, and keeps lock after abrupt termination',async t=>{
  const root=mkdtempSync(join(process.env.PROJECT_REVIEW_RUN,'evidence','serve-')),data=join(root,'data'),keys=join(root,'keys.json'),policyPath=join(root,'policy.json');
  const p=defaultPolicy();p.allowedProviders=[];writeFileSync(policyPath,JSON.stringify(p));
  const env={BACKEND_DATA_DIR:data,BACKEND_KEYS_FILE:keys,BACKEND_POLICY_FILE:policyPath,BACKEND_OWNER_ISSUER:'https://identity.example.invalid',BACKEND_OWNER_SUBJECT:'serve-owner',BACKEND_ORIGIN:'https://app.example.invalid',BACKEND_PORT:'0'};
  assert.equal(run('generate-keys',env).status,0);assert.equal(run('bootstrap',env).status,0);
  // The wrapper dot-sources project-env before the Node child that writes SQLite.
  const child=spawn('pwsh.exe',['-NoProfile','-Command',command('serve')],{env:{...process.env,...env},windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='',errors='';child.stderr.on('data',b=>{errors+=b;});
  const address=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('serve startup timeout')),15000);
    child.stdout.on('data',b=>{output+=b;for(const line of output.split(/\r?\n/)){try{const v=JSON.parse(line);if(v.status==='listening'){clearTimeout(timer);resolve(v);}}catch{}}});
    child.once('exit',()=>{clearTimeout(timer);reject(new Error('serve exited before ready'));});
  });
  assert.ok(Number.isInteger(address.pid)&&address.pid>0&&address.pid!==process.pid);
  const stop=async()=>{
    if(child.exitCode===null){process.kill(address.pid);await new Promise(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',resolve);});}
  };
  t.after(stop);
  // Raw HTTP lets the test represent the configured reverse proxy Host exactly.
  const r=await new Promise((resolve,reject)=>{
    const req=httpRequest({hostname:'127.0.0.1',port:address.port,path:'/api/v1/health',headers:{Host:'app.example.invalid'}},res=>{
      let text='';res.on('data',b=>{text+=b;});res.on('end',()=>resolve({status:res.statusCode,health:JSON.parse(text)}));
    });req.on('error',reject);req.end();
  });
  assert.equal(r.status,200);assert.equal(address.address,'127.0.0.1');assert.equal(address.aiEnabled,false);assert.deepEqual(r.health.capabilities.aiProviders,[]);
  await stop();
  assert.equal(readFileSync(join(data,'writer.lock'),'utf8'),String(address.pid));
  assert.ok(!output.includes('BEGIN PRIVATE KEY'));assert.ok(!errors.includes('BEGIN PRIVATE KEY'));
});
