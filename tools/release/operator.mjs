import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readOperator} from './config.mjs';
import {need,safeCode,outputPath} from './core.mjs';
export async function operate(directory,pin,component,action){
 const {root,configuration:c}=readOperator(directory,pin);
 need(['host','backend'].includes(component),'COMPONENT_REQUIRED');
 const allowed=['generate-keys','bootstrap','validate-config','serve','maintenance','maintenance-status','rewrap-vault',
  'backup','restore','recovery-status','recovery-plan','recovery-check','recovery-apply'];
 need(component==='host'?action==='serve':allowed.includes(action),'COMMAND_REQUIRED');
 const retained={};
 for(const k of ['BACKEND_OIDC_CLIENT_SECRET','BACKEND_BACKUP_FILE','BACKEND_RESTORE_FILE','BACKEND_RECOVERY_BUNDLE',
  'BACKEND_RECOVERY_PLAN_HASH','BACKEND_RECOVERY_APPROVE_HASH'])if(process.env[k])retained[k]=process.env[k];
 for(const k of ['BACKEND_BACKUP_FILE','BACKEND_RESTORE_FILE','BACKEND_RECOVERY_BUNDLE'])if(retained[k])outputPath(retained[k]);
 // Clear inherited routing, selection and bootstrap state; no user or owner AI key environment is accepted.
 for(const k of Object.keys(process.env))if(k.startsWith('BACKEND_')||k.startsWith('HOST_'))delete process.env[k];
 Object.assign(process.env,retained,{
  BACKEND_DATA_DIR:c.backend.dataDirectory,BACKEND_KEYS_FILE:c.backend.keysFile,BACKEND_OIDC_FILE:c.backend.oidcFile,
  BACKEND_RUNTIME_FILE:resolve(root,'runtime.json'),BACKEND_ORIGIN:c.origin,BACKEND_PORT:String(c.backend.port),
  BACKEND_AI_ADAPTERS:c.backend.aiAdapters,HOST_CONFIG_FILE:resolve(root,'host.json'),HOST_RUNTIME_DIR:c.host.runtimeDirectory});
 if(c.bootstrap)Object.assign(process.env,{BACKEND_OWNER_ISSUER:c.bootstrap.issuer,BACKEND_OWNER_SUBJECT:c.bootstrap.subject,BACKEND_POLICY_FILE:c.bootstrap.policyFile});
 if(component==='host'){
  const path=resolve(c.package.directory,'src/host/cli.mjs');process.argv=[process.execPath,path,'serve'];
  const module=await import(pathToFileURL(path).href+'?release-wrapper');await module.main();return;
 }
 const path=resolve(c.package.directory,'src/server/cli.mjs');
 if(action==='serve'){
  process.argv=[process.execPath,path,'validate-config'];await import(pathToFileURL(path).href+'?release-validate');
  if(process.exitCode)return;
 }
 process.argv=[process.execPath,path,action];await import(pathToFileURL(path).href+'?release-'+action);
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
 try{
  need(process.argv.length===6,'ARGUMENTS_REQUIRED');
  await operate(...process.argv.slice(2));
 }catch(e){console.error(JSON.stringify({error:safeCode(e)}));process.exitCode=1;}
}
