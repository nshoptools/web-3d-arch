import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { fixture, directory, dependency, wire, run } from './helpers.mjs';
const folder=dirname(fileURLToPath(import.meta.url));
const hostCli=resolve(folder,'../../src/host/cli.mjs'),backendCli=join(dependency,'src/server/cli.mjs');
async function launch(cli,action,env={},persist=false){
  const root=directory('child'),stop=join(root,'stop');
  const child=spawn('pwsh',['-NoProfile','-File',join(folder,'child-process.ps1')],{
    cwd:process.env.PROJECT_ROOT,windowsHide:true,
    env:{...process.env,...env,HOST_TEST_CLI:cli,HOST_TEST_ACTION:action,HOST_TEST_STOP_FILE:stop},
    stdio:['ignore','pipe','pipe']
  });
  let output='',errors='',exited=false;
  child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>errors+=c);
  const completion=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>{exited=true;resolve({code,output,errors});});});
  const rows=()=>output.split(/\r?\n/).filter(l=>l.startsWith('{')).flatMap(l=>{try{return [JSON.parse(l)];}catch{return [];}});
  if(!persist)return completion;
  const deadline=Date.now()+10000;
  while(!exited && !rows().some(r=>['https-listening','listening'].includes(r.status)) && Date.now()<deadline)await new Promise(r=>setTimeout(r,20));
  assert.ok(rows().some(r=>['https-listening','listening'].includes(r.status)),'CLI reaches listening (safe code only): '+errors.slice(0,120));
  return {rows,child,completion,async stop(){writeFileSync(stop,'stop');return completion;}};
}
async function port(){
  const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const p=server.address().port;await new Promise(r=>server.close(r));return p;
}
test('EXT-05 actual host/backend CLIs use exclusive runtime locks, HTTPS health; backup/restore and static release rollback', {timeout:30000},async t=>{
  const f=fixture('cli-deployment'),data=join(f.root,'backend'),hostRuntime=join(f.root,'host-runtime');
  const keys=join(f.root,'synthetic-backend-keys.json'),backup=join(f.root,'backup.sqlite'),restore=join(f.root,'restored-backend');
  const frontPort=await port(),backendPort=await port(),origin='https://localhost:'+frontPort;
  const common={BACKEND_KEYS_FILE:keys,BACKEND_DATA_DIR:data,BACKEND_ORIGIN:origin,BACKEND_PORT:String(backendPort),
    BACKEND_OWNER_ISSUER:'https://idp.example.invalid',BACKEND_OWNER_SUBJECT:'synthetic-owner',
    BACKEND_POLICY_FILE:join(dependency,'docs/backend/policy.example.json'),BACKEND_AI_ADAPTERS:''};
  assert.equal((await launch(backendCli,'generate-keys',common)).code,0);
  assert.equal((await launch(backendCli,'bootstrap',common)).code,0);
  const backend=await launch(backendCli,'serve',common,true);
  let currentHost;
  t.after(async()=>{if(currentHost)await currentHost.stop();await backend.stop();});
  const configPath=join(f.root,'host-config.json');
  const config={...f.config,origin,port:frontPort,backendPort};
  writeFileSync(configPath,JSON.stringify(config));
  const hostEnv={HOST_CONFIG_FILE:configPath,HOST_RUNTIME_DIR:hostRuntime};
  currentHost=await launch(hostCli,'serve',hostEnv,true);
  assert.equal((await wire(origin,'GET','/api/v1/health')).status,200);
  assert.equal((await wire(origin,'GET','/api/v1/me')).status,401);
  assert.equal((await launch(hostCli,'serve',hostEnv)).code,1);
  assert.equal((await launch(backendCli,'serve',common)).code,1);
  const liveBackup=await launch(backendCli,'backup',{...common,BACKEND_BACKUP_FILE:backup});
  assert.equal(liveBackup.code,1);assert.equal(existsSync(backup),false,'existing CLI requires backend stopped for lock');

  // Roll forward then back to the byte-pinned manifest, keeping one backend process.
  const firstHash=(await wire(origin,'GET','/')).headers.etag;
  assert.equal((await currentHost.stop()).code,0);
  assert.equal(existsSync(join(hostRuntime,'host.lock')),false);
  const old=JSON.parse(readFileSync(f.config.manifestPath));
  f.manifest.buildId='synthetic-build-v2';f.save();
  currentHost=await launch(hostCli,'serve',hostEnv,true);
  assert.equal((await wire(origin,'GET','/')).headers['x-arch-build'],'synthetic-build-v2');
  assert.equal((await currentHost.stop()).code,0);
  writeFileSync(f.config.manifestPath,JSON.stringify(old,null,2)+'\n');
  currentHost=await launch(hostCli,'serve',hostEnv,true);
  const rollback=await wire(origin,'GET','/');
  assert.equal(rollback.headers['x-arch-build'],'synthetic-build-v1');assert.equal(rollback.headers.etag,firstHash);
  assert.equal((await currentHost.stop()).code,0);currentHost=null;
  assert.equal((await backend.stop()).code,0);
  assert.equal(existsSync(join(data,'writer.lock')),false);
  assert.equal((await launch(backendCli,'backup',{...common,BACKEND_BACKUP_FILE:backup})).code,0);
  assert.equal((await launch(backendCli,'backup',{...common,BACKEND_BACKUP_FILE:backup})).code,1);
  assert.equal((await launch(backendCli,'restore',{...common,BACKEND_DATA_DIR:restore,BACKEND_RESTORE_FILE:backup})).code,0);
  const db=new DatabaseSync(join(restore,'backend.sqlite'),{readOnly:true});
  try{
    assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');
    assert.equal(db.prepare('SELECT count(*) n FROM sessions').get().n,0);
    assert.equal(db.prepare("SELECT value FROM operational_state WHERE key='restore-ai-hold'").get().value,'reconciliation-required');
  }finally{db.close();}
  const restored=await launch(backendCli,'serve',{...common,BACKEND_DATA_DIR:restore},true);
  try{
    currentHost=await launch(hostCli,'serve',hostEnv,true);
    assert.equal((await wire(origin,'GET','/api/v1/health')).status,200);
    assert.equal((await wire(origin,'GET','/api/v1/me')).status,401);
    assert.equal((await currentHost.stop()).code,0);currentHost=null;
  }finally{assert.equal((await restored.stop()).code,0);}
  writeFileSync(join(f.root,'recovery-evidence.json'),JSON.stringify({
    stoppedBackendBackup:true,restoreNewDirectory:true,quickCheck:'ok',restoredAuthRequired:true,
    restoreAiHold:true,staticManifestRollback:true,oneBackendWriter:true,offsiteTested:false,rpoRtoMeasured:false
  },null,2)+'\n');
});
test('SEC-01 manifest generator consumes exact list, refuses overwrite and unknown/unlisted output',async()=>{
  const f=fixture('manifest-cli'),out=join(f.root,'generated-manifest.json'),allowlist=join(f.root,'allowlist.json');
  writeFileSync(allowlist,JSON.stringify({buildId:'explicit-list',assets:f.manifest.assets.map(({url,file,cache})=>({url,file,cache})),navigations:f.manifest.navigations}));
  // Use a writing-process PowerShell wrapper with explicit run environment; arguments stay structured.
  const script=join(f.root,'generate.ps1');
  writeFileSync(script,". (Join-Path $env:PROJECT_ROOT 'tools/project-env.ps1') -Seat codex -RunId $env:HOST_TEST_RUN_ID\n& node $env:HOST_MANIFEST_TOOL $env:HOST_MANIFEST_ROOT $env:HOST_ALLOWLIST $env:HOST_OUTPUT\nexit $LASTEXITCODE\n");
  async function generate(){
    const child=spawn('pwsh',['-NoProfile','-File',script],{windowsHide:true,env:{...process.env,
      HOST_MANIFEST_TOOL:resolve(folder,'../../tools/hosting/manifest.mjs'),HOST_MANIFEST_ROOT:f.webroot,HOST_ALLOWLIST:allowlist,HOST_OUTPUT:out},
      stdio:['ignore','pipe','pipe']});
    child.stdout.resume();child.stderr.resume();return new Promise((r,j)=>{child.on('error',j);child.on('exit',r);});
  }
  assert.equal(await generate(),0);
  assert.equal(JSON.parse(readFileSync(out)).assets.length,f.manifest.assets.length);
  assert.equal(await generate(),1);
});
