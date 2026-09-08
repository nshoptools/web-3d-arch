import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {spawnSync,spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {inputFixture,write,tlsRoot,candidate,wire} from './helpers.mjs';
import {freePort} from './http-helpers.mjs';
import {configureRelease,readOperator} from '../../tools/release/config.mjs';
import {hash,jsonBytes} from '../../tools/release/core.mjs';
import {buildRelease} from '../../tools/release/build.mjs';
import {defaultPolicy} from '../server/helpers.mjs';
function invoke(f,component,action,extra={}){
 const r=spawnSync(process.execPath,[resolve(f.artifact,'tools/release/operator.mjs'),f.configDir,f.configSha256,component,action],{
  env:{...process.env,BACKEND_DATA_DIR:'untrusted-inherited-routing',BACKEND_AI_ADAPTERS:'untrusted-shared-fallback',BACKEND_OWNER_SUBJECT:'wrong-owner',...extra},
  encoding:'utf8',timeout:30000,windowsHide:true});
 assert.equal(r.error,undefined);return r;
}
async function fixture(){
 const x=inputFixture(),built=await x.build(),root=x.root,privateDir=resolve(root,'private');
 const oidc={issuer:'https://identity.example.com',authorizationEndpoint:'https://identity.example.com/authorize',
  tokenEndpoint:'https://identity.example.com/token',jwksUri:'https://identity.example.com/jwks',clientId:'explicit-synthetic-client',authMethod:'none'};
 write(privateDir,'oidc.json',jsonBytes(oidc));const policy=defaultPolicy();policy.allowedProviders=[];write(privateDir,'policy.json',jsonBytes(policy));
 const c={version:'arch-release-operator/1',package:{directory:built.directory,sha256:built.result.sha256},
  origin:'https://localhost:'+await freePort(),host:{bindAddress:'127.0.0.1',port:0,serviceWorker:false,runtimeDirectory:resolve(privateDir,'host-runtime')},
  backend:{port:await freePort(),dataDirectory:resolve(privateDir,'backend-data'),keysFile:resolve(privateDir,'backend-keys.json'),oidcFile:resolve(privateDir,'oidc.json'),aiAdapters:''},
  tls:{keyFile:resolve(tlsRoot,'synthetic-key.pem'),certificateFile:resolve(tlsRoot,'synthetic-cert.pem')},
  bootstrap:{issuer:oidc.issuer,subject:'explicit-synthetic-owner',policyFile:resolve(privateDir,'policy.json')},runtime:{}};
 c.host.port=Number(new URL(c.origin).port);mkdirSync(c.host.runtimeDirectory);
 const configInput=resolve(root,'operator.json');writeFileSync(configInput,jsonBytes(c));
 const configDir=resolve(root,'config'),checked=await configureRelease(configInput,configDir);
 return {...x,c,configInput,configDir,configSha256:checked.configSha256,artifact:built.directory,packageHash:built.result.sha256};
}
async function start(f,component){
 const child=spawn(process.execPath,[resolve(candidate,'tests/release/operator-child.mjs'),resolve(f.artifact,'tools/release/operator.mjs'),f.configDir,f.configSha256,component,'serve'],
  {env:{...process.env,NODE_OPTIONS:''},windowsHide:true,stdio:['pipe','pipe','pipe']});
 let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
 const completion=new Promise((yes,no)=>{child.once('error',no);child.once('exit',code=>yes({code,stdout,stderr}));});
 const ready=component==='backend'?'listening':'https-listening',until=Date.now()+20000;let record;
 while(Date.now()<until&&child.exitCode===null){
  record=stdout.split(/\r?\n/).flatMap(s=>{try{return [JSON.parse(s)];}catch{return [];}}).find(x=>x.status===ready);
  if(record)break;await new Promise(r=>setTimeout(r,20));
 }
 assert.ok(record,'foreground start: '+stderr);
 return {child,completion,record,async stop(){if(child.exitCode===null)child.stdin.end('stop\n');return completion;}};
}
test('operator config is concrete/private/strict and B11 schema5/default5min validate does not mutate keys/database',async()=>{
 const f=await fixture();assert.equal(existsSync(f.c.backend.keysFile),false);
 assert.equal(invoke(f,'backend','generate-keys').status,0);assert.equal(invoke(f,'backend','generate-keys').status,1);
 assert.equal(invoke(f,'backend','bootstrap').status,0);
 const db=resolve(f.c.backend.dataDirectory,'backend.sqlite'),before=hash(readFileSync(db)),key=hash(readFileSync(f.c.backend.keysFile));
 const checked=invoke(f,'backend','validate-config');assert.equal(checked.status,0,checked.stderr);
 const result=JSON.parse(checked.stdout.trim());assert.equal(result.databaseSchema,5);assert.equal(result.runtime.maintenance.intervalMs,300000);
 assert.equal(result.aiKeyPolicy,'per-user-byok-only');assert.equal(hash(readFileSync(db)),before);assert.equal(hash(readFileSync(f.c.backend.keysFile)),key);
 assert.ok(!checked.stdout.includes('PRIVATE KEY')&&!checked.stderr.includes('untrusted'));
 const generated=readOperator(f.configDir,f.configSha256).configuration;
 assert.equal(generated.backend.aiAdapters,'');assert.equal(generated.bootstrap.subject,'explicit-synthetic-owner');
 writeFileSync(resolve(f.configDir,'host.json'),'{}');assert.throws(()=>readOperator(f.configDir,f.configSha256),{code:'CONFIG_CHANGED'});
});
test('operator rejects secret/config/test bypass and TLS/path/port problems before publishing configuration',async()=>{
 const f=await fixture();
 for(const [name,mutate]of [
  ['test-switch',c=>c.testOnly=true],['port',c=>c.host.port=0],['no-IdP',c=>c.backend.oidcFile='absent'],
  ['shared-key',c=>c.backend.ownerKey='not-a-real-key'],['runtime-retry',c=>c.runtime={maintenance:{retryAI:true}}],
  ['private-in-public',c=>c.backend.dataDirectory=resolve(c.package.directory,'public/data')]
 ]){
  const c=structuredClone(f.c);mutate(c);const input=resolve(f.root,name+'.json'),output=resolve(f.root,name+'-out');writeFileSync(input,jsonBytes(c));
  await assert.rejects(configureRelease(input,output));assert.equal(existsSync(output),false);
 }
});
test('existing host/backend foreground CLIs start/stop; legitimate writer lock blocks validation without state change', {timeout:90000},async t=>{
 const f=await fixture();assert.equal(invoke(f,'backend','generate-keys').status,0);assert.equal(invoke(f,'backend','bootstrap').status,0);
 const backend=await start(f,'backend');t.after(()=>backend.stop());
 const host=await start(f,'host');t.after(()=>host.stop());
 const health=await wire(f.c.origin,'GET','/api/v1/health');assert.equal(health.status,200);
 assert.equal((await wire(f.c.origin,'GET','/')).status,200);
 const db=resolve(f.c.backend.dataDirectory,'backend.sqlite'),before=hash(readFileSync(db));
 const locked=invoke(f,'backend','validate-config');assert.equal(locked.status,1);assert.match(locked.stderr,/EEXIST/);
 assert.equal(hash(readFileSync(db)),before);
 const stoppedHost=await host.stop();assert.equal(stoppedHost.code,0,stoppedHost.stderr);
 const stoppedBackend=await backend.stop();assert.equal(stoppedBackend.code,0,stoppedBackend.stderr);
 assert.equal(existsSync(resolve(f.c.host.runtimeDirectory,'host.lock')),false);
 assert.equal(existsSync(resolve(f.c.backend.dataDirectory,'writer.lock')),false);
 assert.ok(!stoppedBackend.stdout.includes('PRIVATE KEY'));
});
test('artifact/catalog rollback and offline backup/restore preserve exact hashes and B05 reconciliation hold', {timeout:90000},async()=>{
 const f=await fixture();assert.equal(invoke(f,'backend','generate-keys').status,0);assert.equal(invoke(f,'backend','bootstrap').status,0);
 const db=resolve(f.c.backend.dataDirectory,'backend.sqlite'),originalDb=hash(readFileSync(db)),keyHash=hash(readFileSync(f.c.backend.keysFile));
 const backup=resolve(f.root,'private','backup.sqlite');
 const backed=invoke(f,'backend','backup',{BACKEND_BACKUP_FILE:backup});assert.equal(backed.status,0,backed.stderr);
 assert.equal(hash(readFileSync(db)),originalDb);const backupHash=hash(readFileSync(backup));
 const oldCatalog=JSON.parse(readFileSync(resolve(f.artifact,'release-manifest.json'))).library.documents.catalog;
 // A different compiled entry yields a new immutable artifact. The old whole catalog is retained with its old pin.
 const changed=write(f.front,'entry.mjs','globalThis.releaseSmokeLoaded=true;globalThis.releaseEdition=2;');
 Object.assign(f.input.frontend.assets.find(a=>a.file==='entry.mjs'),changed);f.save();
 const upgrade=resolve(f.root,'upgrade'),built=await buildRelease(f.inputPath,upgrade);assert.notEqual(built.sha256,f.packageHash);
 const freshConfig=async(c,name)=>{const file=resolve(f.root,name+'.json'),configDir=resolve(f.root,name);writeFileSync(file,jsonBytes(c));
  const r=await configureRelease(file,configDir);return {...f,c,configDir,configSha256:r.configSha256,artifact:c.package.directory};};
 const upgraded=await freshConfig({...f.c,package:{directory:upgrade,sha256:built.sha256}},'upgrade-config');
 assert.equal(invoke(upgraded,'backend','validate-config').status,0);assert.equal(hash(readFileSync(db)),originalDb);
 const rollback=await freshConfig(f.c,'rollback-config');assert.equal(invoke(rollback,'backend','validate-config').status,0);
 assert.equal(hash(readFileSync(db)),originalDb);assert.equal(hash(readFileSync(resolve(f.artifact,'public'+oldCatalog.url))),oldCatalog.sha256);
 const restored=await freshConfig({...f.c,backend:{...f.c.backend,dataDirectory:resolve(f.root,'private','restored-data')}},'restore-config');
 const restore=invoke(restored,'backend','restore',{BACKEND_RESTORE_FILE:backup});assert.equal(restore.status,0,restore.stderr);
 assert.equal(hash(readFileSync(backup)),backupHash);assert.equal(hash(readFileSync(f.c.backend.keysFile)),keyHash);
 const after=new DatabaseSync(resolve(restored.c.backend.dataDirectory,'backend.sqlite'),{readOnly:true});
 try{assert.equal(after.prepare('PRAGMA user_version').get().user_version,5);assert.ok(after.prepare("SELECT value FROM operational_state WHERE key='restore-ai-hold'").get());
  assert.equal(after.prepare('SELECT count(*) n FROM sessions').get().n,0);}finally{after.close();}
 const validated=invoke(restored,'backend','validate-config');assert.equal(validated.status,0);assert.equal(JSON.parse(validated.stdout).restoreHold,true);
 const held=invoke(restored,'backend','maintenance');assert.equal(held.status,2);assert.match(held.stdout,/"status":"held"/);
});
