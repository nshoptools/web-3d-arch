import { readFileSync,statSync,writeFileSync,mkdirSync,lstatSync,realpathSync,existsSync,openSync,closeSync,unlinkSync } from 'node:fs';
import { resolve,dirname,sep } from 'node:path';
import { randomBytes,generateKeyPairSync,createPrivateKey } from 'node:crypto';
import { Store } from './database.mjs';
import { backupDatabase,restoreDatabase } from './operations.mjs';
import { bootstrap } from './accounts.mjs';
import { validatePolicy } from './policy.mjs';
import { createBackend } from './app.mjs';
import { Vault,credentialContext } from './vault.mjs';
import { fail } from './core.mjs';
import { productionAdapters } from './adapters/registry.mjs';
import {recoveryStatus,createRecoveryPlan,checkRecoveryPlan,applyRecoveryPlan} from './recovery.mjs';
import {readRecoveryBundle,writeRecoveryReport} from './recovery-files.mjs';
import {validateRuntime} from './runtime-config.mjs';
import {validateStartup} from './startup-validation.mjs';
import {runMaintenance,readMaintenance,maintenanceHold} from './maintenance.mjs';
function configJson(path){
 fail(path&&existsSync(path)&&statSync(path).isFile()&&statSync(path).size<=262144,500,'CONFIG_FILE_INVALID');
 return JSON.parse(readFileSync(path,'utf8'));
}
function runtimeConfig(){return validateRuntime(process.env.BACKEND_RUNTIME_FILE?configJson(process.env.BACKEND_RUNTIME_FILE):{});}
function oidcConfig(){
 if(!process.env.BACKEND_OIDC_FILE)return null;
 const c=configJson(process.env.BACKEND_OIDC_FILE);
 if(process.env.BACKEND_OIDC_CLIENT_SECRET)c.clientSecret=process.env.BACKEND_OIDC_CLIENT_SECRET;
 return c;
}
function inside(raw) {
  const room=process.env.PROJECT_REVIEW_RUN;fail(room&&existsSync(room),500,'PROJECT_ENV_REQUIRED');
  const root=realpathSync(room),dest=resolve(raw??'');
  fail(dest.toLowerCase().startsWith((root+sep).toLowerCase()),500,'DATA_PATH_OUTSIDE_RUN');
  let p=dest;
  while(p!==dirname(p)){if(existsSync(p))fail(!lstatSync(p).isSymbolicLink(),500,'SYMLINK_OUTPUT_REJECTED');p=dirname(p);}
  return dest;
}
function readKeys() {
  const path=process.env.BACKEND_KEYS_FILE;fail(path,500,'BACKEND_KEYS_FILE_REQUIRED');
  const raw=configJson(path);
  const vaultKeys=new Map(Object.entries(raw.vaultKeys).map(([k,v])=>[k,Buffer.from(v,'base64')]));
  return {vaultKeys,activeVaultKey:raw.activeVaultKey,csrfKey:Buffer.from(raw.csrfKey,'base64'),leaseKey:createPrivateKey(raw.leasePrivateKey)};
}
let backend=null,lock=null,lockFd=null;
function unlock(){if(lockFd!==null){closeSync(lockFd);lockFd=null;unlinkSync(lock);}}
try {
  fail(Number(process.versions.node.split('.')[0])===24&&Number(process.versions.node.split('.')[1])>=19,500,'NODE_24_19_REQUIRED');
  const action=process.argv[2];
  if(action==='generate-keys') {
    const dest=inside(process.env.BACKEND_KEYS_FILE);mkdirSync(dirname(dest),{recursive:true});
    const {privateKey}=generateKeyPairSync('ed25519');
    writeFileSync(dest,JSON.stringify({activeVaultKey:'v1',vaultKeys:{v1:randomBytes(32).toString('base64')},csrfKey:randomBytes(32).toString('base64'),leasePrivateKey:privateKey.export({format:'pem',type:'pkcs8'})},null,2),{flag:'wx',mode:0o600});
    console.log(JSON.stringify({status:'keys-created'}));
  } else {
    fail(['bootstrap','serve','rewrap-vault','maintenance','maintenance-status','validate-config','backup','restore','recovery-status','recovery-plan','recovery-check','recovery-apply'].includes(action),400,'COMMAND_REQUIRED');
    const data=inside(process.env.BACKEND_DATA_DIR);mkdirSync(data,{recursive:true});
    const databasePath=resolve(data,'backend.sqlite');
    lock=inside(resolve(data,'writer.lock'));lockFd=openSync(lock,'wx',0o600);
    writeFileSync(lockFd,String(process.pid));
    if(action.startsWith('recovery-')){
      fail(existsSync(databasePath),404,'RECOVERY_DATABASE_MISSING');
      const s=new Store(databasePath);
      try {
        if(action==='recovery-status'){
          const report=recoveryStatus(s,{details:true});writeRecoveryReport(data,report.ledgerHash,report);
          const {private:details,...summary}=report;console.log(JSON.stringify(summary));
        }else {
          const input=readRecoveryBundle(data,process.env.BACKEND_RECOVERY_BUNDLE);
          let result;
          if(action==='recovery-plan')result=createRecoveryPlan(s,input);
          else if(action==='recovery-check'){
            result=checkRecoveryPlan(s,process.env.BACKEND_RECOVERY_PLAN_HASH,input);
            writeRecoveryReport(data,result.planHash,result);
          }else result=applyRecoveryPlan(s,process.env.BACKEND_RECOVERY_PLAN_HASH,input,{approveHash:process.env.BACKEND_RECOVERY_APPROVE_HASH});
          console.log(JSON.stringify({status:result.status??'checked',planHash:result.planHash??result.receipt?.planHash,
            issues:Array.isArray(result.issues)?result.issues.length:result.issues,releaseHold:result.releaseHold,
            discrepancies:Array.isArray(result.discrepancies)?result.discrepancies.length:result.discrepancies,
            ...(result.receipt?{receipt:result.receipt}:{}),...(result.replayed!==undefined?{replayed:result.replayed}:{})}));
        }
      }finally{s.close();unlock();}
    } else if(action==='validate-config'){
      fail(existsSync(databasePath),404,'DATABASE_REQUIRED');
      productionAdapters(process.env.BACKEND_AI_ADAPTERS??'');
      const result=await validateStartup({databasePath,...readKeys(),runtime:runtimeConfig(),origin:process.env.BACKEND_ORIGIN,
        port:Number(process.env.BACKEND_PORT),oidc:oidcConfig()});
      console.log(JSON.stringify(result));unlock();
    } else if(action==='maintenance'||action==='maintenance-status'){
      fail(existsSync(databasePath),404,'DATABASE_REQUIRED');
      const s=new Store(databasePath);
      try{
        const runtime=runtimeConfig();
        const result=action==='maintenance-status'?{status:maintenanceHold(s)?'held':'status',code:maintenanceHold(s),...readMaintenance(s)}:
          await runMaintenance(s,{rows:runtime.maintenance.batchRows,bytes:runtime.maintenance.batchBytes});
        console.log(JSON.stringify({...result,backupPurge:'requires-operator-evidence'}));
        if(!['complete','status'].includes(result.status))process.exitCode=2;
      }finally{s.close();unlock();}
    } else if(action==='backup'){
      fail(process.env.BACKEND_BACKUP_FILE,500,'BACKUP_PATH_REQUIRED');
      const destination=inside(process.env.BACKEND_BACKUP_FILE);mkdirSync(dirname(destination),{recursive:true});
      const evidence=await backupDatabase(databasePath,destination);console.log(JSON.stringify({status:'backup-complete',...evidence}));unlock();
    } else if(action==='restore'){
      fail(process.env.BACKEND_RESTORE_FILE,500,'RESTORE_PATH_REQUIRED');
      console.log(JSON.stringify(restoreDatabase(inside(process.env.BACKEND_RESTORE_FILE),databasePath)));unlock();
    } else if(action==='bootstrap'){
      fail(process.env.BACKEND_OWNER_ISSUER&&process.env.BACKEND_OWNER_SUBJECT&&process.env.BACKEND_POLICY_FILE,500,'EXPLICIT_BOOTSTRAP_REQUIRED');
      const policy=validatePolicy(JSON.parse(readFileSync(process.env.BACKEND_POLICY_FILE,'utf8')));
      const s=new Store(databasePath);
      try{const userId=bootstrap(s,{issuer:process.env.BACKEND_OWNER_ISSUER,subject:process.env.BACKEND_OWNER_SUBJECT,policy});console.log(JSON.stringify({status:'owner-created',userId}));}finally{s.close();unlock();}
    } else if(action==='rewrap-vault') {
      const keys=readKeys(),vault=new Vault(keys.vaultKeys,keys.activeVaultKey),s=new Store(databasePath);
      try{
        const count=s.tx(()=>{const rows=s.all('SELECT * FROM credentials WHERE sealed IS NOT NULL');
          for(const c of rows){const plain=vault.open(credentialContext(c),c.key_version,c.sealed);try{const e=vault.seal(credentialContext(c),plain);s.run('UPDATE credentials SET key_version=?,sealed=? WHERE id=?',e.keyVersion,e.sealed,c.id);}finally{plain.fill(0);}}return rows.length;});
        console.log(JSON.stringify({status:'vault-rewrapped',count}));
      }finally{s.close();unlock();}
    } else {
      const keys=readKeys();
      const oidc=oidcConfig(),runtime=runtimeConfig();
      const adapters=productionAdapters(process.env.BACKEND_AI_ADAPTERS??'');
      backend=createBackend({databasePath,...keys,runtime,origin:process.env.BACKEND_ORIGIN,oidc,providers:adapters,logger:r=>console.log(JSON.stringify(r))});
      {
        const port=Number(process.env.BACKEND_PORT??0);fail(Number.isInteger(port)&&port>=0&&port<=65535,400,'PORT_INVALID');
        const address=await backend.listen(port);console.log(JSON.stringify({status:'listening',pid:process.pid,address:address.address,port:address.port,apiVersion:1,aiEnabled:adapters.length>0,aiProviders:adapters.map(a=>a.metadata.id)}));
        let stopping=false;
        const stop=async()=>{
          if(stopping)return;stopping=true;
          try{await backend.close();unlock();}
          catch(e){
            console.error(JSON.stringify({error:e.code==='SHUTDOWN_DRAIN_TIMEOUT'?e.code:'SHUTDOWN_FAILED',status:'not-clean'}));process.exitCode=1;
            // Deadline is not permission to release a lock over a live SQLite writer.
            try{await backend.whenClosed;if(e.code==='SHUTDOWN_DRAIN_TIMEOUT'){unlock();console.log(JSON.stringify({status:'closed-after-deadline'}));}}
            catch{console.error(JSON.stringify({error:'SHUTDOWN_FAILED',writerLock:'retained'}));}
          }
        };
        process.on('SIGINT',stop);process.on('SIGTERM',stop);
      }
    }
  }
} catch(e) {
  if(backend){try{await backend.close();unlock();}catch{console.error(JSON.stringify({error:'SHUTDOWN_FAILED',writerLock:'retained'}));}}
  else unlock();
  // Do not print exception messages, stacks, config or environment values.
  console.error(JSON.stringify({error:typeof e.code==='string'&&/^[A-Z_]{3,80}$/.test(e.code)?e.code:'STARTUP_FAILED'}));process.exitCode=1;
}
