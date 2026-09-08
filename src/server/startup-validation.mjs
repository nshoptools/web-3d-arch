import {DatabaseSync} from 'node:sqlite';
import {setImmediate as yieldTurn} from 'node:timers/promises';
import {Vault,SessionCrypto,credentialContext} from './vault.mjs';
import {Oidc} from './oidc.mjs';
import {validatePolicy} from './policy.mjs';
import {validateRuntime} from './runtime-config.mjs';
import {fail} from './core.mjs';

/** Offline validation under the CLI writer lock. No bootstrap, migration or network. */
export async function validateStartup(config,{strict=true}={}){
 const runtime=validateRuntime(config.runtime);
 let u;try{u=new URL(config.origin);}catch{}
 fail(u?.protocol==='https:'&&u.origin===config.origin,500,'HTTPS_ORIGIN_REQUIRED');
 fail(Number.isInteger(config.port)&&config.port>0&&config.port<=65535,500,'PRODUCTION_PORT_REQUIRED');
 fail(!strict||config.oidc,500,'OIDC_NOT_CONFIGURED');
 const oidc=new Oidc(config.oidc),vault=new Vault(config.vaultKeys,config.activeVaultKey);
 new SessionCrypto(config.csrfKey,config.leaseKey);
 const db=new DatabaseSync(config.databasePath,{readOnly:true,allowExtension:false});
 try{
  fail(db.prepare('PRAGMA user_version').get().user_version===5,503,'DATABASE_VERSION_UNSUPPORTED');
  fail(db.prepare('PRAGMA quick_check').get().quick_check==='ok'&&!db.prepare('PRAGMA foreign_key_check').get(),503,'DATABASE_INTEGRITY_FAILED');
  fail(db.prepare("SELECT id FROM users WHERE role='owner' AND status='active' LIMIT 1").get(),503,'OWNER_BOOTSTRAP_REQUIRED');
  const policy=db.prepare('SELECT json FROM policy WHERE id=1').get();fail(policy,503,'POLICY_REQUIRED');validatePolicy(JSON.parse(policy.json));
  let cursor=0,checked=0;const ceiling=db.prepare('SELECT COALESCE(MAX(rowid),0) n FROM credentials').get().n;
  while(cursor<ceiling){
   const rows=db.prepare('SELECT rowid rid,* FROM credentials WHERE rowid>? AND rowid<=? ORDER BY rowid LIMIT 100').all(cursor,ceiling);
   if(!rows.length)break;
   for(const c of rows){cursor=c.rid;if(c.sealed!==null){
    fail(vault.keys.has(c.key_version),503,'VAULT_KEY_VERSION_MISSING');
    const plain=vault.open(credentialContext(c),c.key_version,c.sealed);plain.fill(0);checked++;
   }}
   await yieldTurn();
  }
  return {version:'arch-backend-config-check/1',status:'config-checked',databaseSchema:5,identityConfigured:!!oidc.config,
   runtime,credentialCiphertextsChecked:checked,aiKeyPolicy:'per-user-byok-only',
   restoreHold:!!db.prepare("SELECT key FROM operational_state WHERE key='restore-ai-hold'").get(),
   deploymentVerified:false};
 }finally{db.close();}
}
