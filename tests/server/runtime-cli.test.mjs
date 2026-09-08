import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {mkdtempSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {createServer} from 'node:net';
import {request} from 'node:http';
import {Store} from '../../src/server/database.mjs';
import {Vault,credentialContext} from '../../src/server/vault.mjs';
import {id,sha} from '../../src/server/core.mjs';
import {cliCommand} from './cli-command.mjs';
import {defaultPolicy} from './helpers.mjs';

const cli=fileURLToPath(new URL('../../src/server/cli.mjs',import.meta.url));
const envBase=()=>Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('BACKEND_')));
function run(action,env){
 const r=spawnSync('pwsh.exe',['-NoProfile','-Command',cliCommand(cli,action)],
 {env:{...envBase(),...env},windowsHide:true,encoding:'utf8',timeout:30000});
 assert.equal(r.error,undefined);return r;
}
function fixture(){
 const root=mkdtempSync(join(process.env.PROJECT_REVIEW_RUN,'evidence','runtime-cli-'));
 const data=join(root,'data'),keys=join(root,'keys.json'),policy=join(root,'policy.json'),oidc=join(root,'oidc.json');
 const p=defaultPolicy();p.allowedProviders=[];writeFileSync(policy,JSON.stringify(p));
 writeFileSync(oidc,JSON.stringify({issuer:'https://synthetic-idp.invalid',authorizationEndpoint:'https://synthetic-idp.invalid/authorize',
  tokenEndpoint:'https://synthetic-idp.invalid/token',jwksUri:'https://synthetic-idp.invalid/jwks',clientId:'synthetic-local-contract',
  authMethod:'none'}));
 const env={BACKEND_DATA_DIR:data,BACKEND_KEYS_FILE:keys,BACKEND_POLICY_FILE:policy,
  BACKEND_OWNER_ISSUER:'https://synthetic-idp.invalid',BACKEND_OWNER_SUBJECT:'explicit-synthetic-owner',
  BACKEND_OIDC_FILE:oidc,BACKEND_ORIGIN:'https://localhost:8443',BACKEND_PORT:'9080',BACKEND_AI_ADAPTERS:''};
 assert.equal(run('generate-keys',env).status,0);assert.equal(run('bootstrap',env).status,0);
 return {root,data,keys,env,db:join(data,'backend.sqlite')};
}
async function freePort(){const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
async function launch(f){
 const wrapper=fileURLToPath(new URL('./runtime-cli-child.mjs',import.meta.url));
 const child=spawn('pwsh.exe',['-NoProfile','-Command',cliCommand(wrapper,'serve')],{env:{...envBase(),...f.env},windowsHide:true,stdio:['pipe','pipe','pipe']});
 let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
 const completion=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve({code,stdout,stderr}));});
 const started=Date.now();let record;
 while(Date.now()-started<20000&&child.exitCode===null){
  record=stdout.split(/\r?\n/).flatMap(s=>{try{return[JSON.parse(s)];}catch{return[];}}).find(x=>x.status==='listening');
  if(record)break;await new Promise(r=>setTimeout(r,10));
 }
 assert.ok(record,'actual foreground service listens');
 return {child,record,completion,stop:()=>{child.stdin.end('stop\n');return completion;}};
}
test('B11 validate-config verifies existing key versions, bounded config and explicit OIDC offline without DB mutations',async()=>{
 const f=fixture(),before=sha(readFileSync(f.db)),keyHash=sha(readFileSync(f.keys));
 let r=run('validate-config',f.env);assert.equal(r.status,0);assert.ok(r.stdout.includes('config-checked'));
 assert.equal(sha(readFileSync(f.db)),before);assert.equal(sha(readFileSync(f.keys)),keyHash);
 assert.equal(run('validate-config',{...f.env,BACKEND_PORT:'0'}).status,1);
 assert.equal(run('validate-config',{...f.env,BACKEND_OIDC_FILE:''}).status,1);
 const runtime=join(f.root,'runtime.json');writeFileSync(runtime,JSON.stringify({maintenance:{retryAI:true}}));
 assert.equal(run('validate-config',{...f.env,BACKEND_RUNTIME_FILE:runtime}).status,1);
 const material=JSON.parse(readFileSync(f.keys)),s=new Store(f.db);
 const c={id:id(),user_id:s.get("SELECT id FROM users WHERE role='owner'").id,provider_id:'synthetic',endpoint_id:'explicit',version:1};
 const vault=new Vault(new Map([['v1',Buffer.from(material.vaultKeys.v1,'base64')]]),'v1');
 const sealed=vault.seal(credentialContext(c),Buffer.from('synthetic-user-private-key'));
 s.run('INSERT INTO credentials VALUES(?,?,?,?,?,?,?,?,?,NULL)',c.id,c.user_id,c.provider_id,c.endpoint_id,'private-label','unchecked',1,'v1',sealed.sealed);s.close();
 const checked=run('validate-config',f.env);assert.equal(checked.status,0);assert.ok(checked.stdout.includes('"credentialCiphertextsChecked":1'));
 material.vaultKeys={v2:material.vaultKeys.v1};material.activeVaultKey='v2';const missing=join(f.root,'missing-version.json');writeFileSync(missing,JSON.stringify(material));
 r=run('validate-config',{...f.env,BACKEND_KEYS_FILE:missing});assert.equal(r.status,1);assert.ok(r.stderr.includes('VAULT_KEY_VERSION_MISSING'));
 assert.ok(!r.stdout.includes('synthetic-user-private-key'));assert.equal(sha(readFileSync(f.keys)),keyHash);
});

test('B11 maintenance needs no missing vault keys, reports hold nonzero and does not release accounting',async()=>{
 const f=fixture(),keys=join(f.root,'does-not-exist.json');
 let r=run('maintenance',{...f.env,BACKEND_KEYS_FILE:keys});assert.equal(r.status,0);assert.ok(r.stdout.includes('"status":"complete"'));assert.equal(existsSync(keys),false);
 assert.equal(run('maintenance-status',{...f.env,BACKEND_KEYS_FILE:keys}).status,0);
 const s=new Store(f.db);s.run("INSERT INTO operational_state VALUES('restore-ai-hold','reconciliation-required')");s.close();
 const before=sha(readFileSync(f.db));r=run('maintenance',{...f.env,BACKEND_KEYS_FILE:keys});
 assert.equal(r.status,2);assert.ok(r.stdout.includes('RESTORE_RECONCILIATION_REQUIRED'));
 assert.equal(sha(readFileSync(f.db)),before);assert.equal(existsSync(keys),false);
});

test('B11 real foreground lock excludes planning/maintenance/backup/config; graceful stop releases only its own lock',async t=>{
 const f=fixture();f.env.BACKEND_PORT=String(await freePort());
 const runtime=join(f.root,'disabled-cadence.json');writeFileSync(runtime,JSON.stringify({maintenance:{enabled:false}}));f.env.BACKEND_RUNTIME_FILE=runtime;
 const app=await launch(f);let stopped=false;t.after(async()=>{if(!stopped)await app.stop();});
 const lock=join(f.data,'writer.lock'),bytes=readFileSync(lock),before=sha(readFileSync(f.db));
 const walHash=()=>existsSync(f.db+'-wal')?sha(readFileSync(f.db+'-wal')):null;const beforeWal=walHash();
 for(const action of ['maintenance','maintenance-status','recovery-plan','recovery-check','recovery-apply','backup','validate-config']){
  const r=run(action,f.env);assert.equal(r.status,1);assert.deepEqual(readFileSync(lock),bytes);
 }
 assert.equal(sha(readFileSync(f.db)),before);assert.equal(walHash(),beforeWal);
 // Disabled cadence makes refused CLI non-mutation observable against the live writer.
 const health=await new Promise((resolve,reject)=>{
  const req=request({host:'127.0.0.1',port:app.record.port,path:'/api/v1/health',headers:{Host:'localhost:8443'}},res=>{
   let text='';res.on('data',b=>text+=b);res.on('end',()=>resolve({status:res.statusCode,value:JSON.parse(text)}));
  });req.on('error',reject);req.end();
 });
 assert.equal(health.status,200);assert.equal(health.value.operations.reason,null);
 const result=await app.stop();stopped=true;assert.equal(result.code,0);assert.ok(result.stdout.includes('"status":"closed"'));
 assert.equal(existsSync(lock),false);assert.ok(!result.stdout.includes('PRIVATE KEY'));
 assert.equal(run('maintenance-status',f.env).status,0);
});

test('B11 invalid runtime config fails before listen and leaves no unlocked open backend writer',()=>{
 const f=fixture(),runtime=join(f.root,'bad-runtime.json');writeFileSync(runtime,'{"shutdownGraceMs":1}');
 const r=run('serve',{...f.env,BACKEND_RUNTIME_FILE:runtime});assert.equal(r.status,1);
 assert.equal(existsSync(join(f.data,'writer.lock')),false);
 assert.equal(run('maintenance-status',f.env).status,0);
});
