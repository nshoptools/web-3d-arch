import { DatabaseSync,backup } from 'node:sqlite';
import { constants,copyFileSync,existsSync,readFileSync,statSync } from 'node:fs';
import { fail,sha,id,canonical,parse,integer } from './core.mjs';
import { Store } from './database.mjs';
export async function backupDatabase(databasePath,destination,now=Date.now()) {
 fail(existsSync(databasePath)&&!existsSync(destination),409,'BACKUP_DESTINATION_MUST_BE_NEW');integer(now,8_640_000_000_000_000);
 const source=new DatabaseSync(databasePath,{readOnly:true,allowExtension:false});let pages;
 try {
  fail(source.prepare('PRAGMA quick_check').get().quick_check==='ok',500,'DATABASE_INTEGRITY_FAILED');
  pages=await backup(source,destination);
 } finally {source.close();}
 // Stamp the private backup copy, never the live source. Close/checkpoint it before hashing.
 const s=new Store(destination),backupId=id();
 try {
  const held=s.get("SELECT key FROM operational_state WHERE key='restore-ai-hold'");
  const prior=s.get("SELECT r.coverage_from FROM recovery_restores r JOIN operational_state o ON o.key='recovery-restore-id' AND o.value=r.id");
  const stamp={version:'arch-backend-backup/1',backupId,createdAt:now,coverageFrom:held?Math.min(now,prior?.coverage_from??0):now,databaseId:s.get('SELECT database_id FROM recovery_clock WHERE id=1').database_id};
  s.tx(()=>s.run("INSERT OR REPLACE INTO operational_state VALUES('recovery-backup',?)",canonical(stamp)));
  s.db.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;');
 }finally{s.close();}
 return {pages,byteLength:statSync(destination).size,sha256:sha(readFileSync(destination)),containsVaultKeys:false,backupId,createdAt:now,schemaVersion:5};
}
export function restoreDatabase(source,destination,now=Date.now()) {
 fail(existsSync(source)&&!existsSync(destination),409,'RESTORE_DESTINATION_MUST_BE_NEW');integer(now,8_640_000_000_000_000);
 fail(!existsSync(source+'-wal')||statSync(source+'-wal').size===0,409,'BACKUP_WAL_NOT_SEALED');
 const sourceHash=sha(readFileSync(source)),check=new DatabaseSync(source,{readOnly:true,allowExtension:false});let sourceVersion;
 try {
  sourceVersion=check.prepare('PRAGMA user_version').get().user_version;
  fail([1,2,3,4,5].includes(sourceVersion),409,'DATABASE_VERSION_UNSUPPORTED');
  fail(check.prepare('PRAGMA quick_check').get().quick_check==='ok'&&check.prepare('PRAGMA foreign_key_check').all().length===0,500,'DATABASE_INTEGRITY_FAILED');
 } finally {check.close();}
 copyFileSync(source,destination,constants.COPYFILE_EXCL);
 fail(sha(readFileSync(destination))===sourceHash&&sha(readFileSync(source))===sourceHash,409,'BACKUP_CHANGED');
 const s=new Store(destination),restoreId=id();
 try {
  s.tx(()=>{
   const raw=s.get("SELECT value FROM operational_state WHERE key='recovery-backup'");
   const stamp=raw?parse(raw.value):null;
   fail(!stamp||stamp.version==='arch-backend-backup/1',409,'BACKUP_METADATA_UNSUPPORTED');
   s.run('UPDATE image_references SET expires=0');
   s.run('DELETE FROM sessions');s.run('UPDATE users SET auth_version=auth_version+1');
   s.run('UPDATE invites SET revoked=? WHERE revoked IS NULL',now);
   for(const j of s.all("SELECT id,submitted FROM jobs WHERE state IN ('reserved','submitted','running')")){
    const state=j.submitted===null?'failed':'unknown';
    s.run("UPDATE jobs SET state=?,accounting=?,seq=seq+1,updated=? WHERE id=?",state,j.submitted===null?'none':'pending',now,j.id);
    s.run('INSERT INTO job_events VALUES(?,?,?,?)',j.id,s.get('SELECT seq FROM jobs WHERE id=?',j.id).seq,state,now);
   }
   s.run('INSERT INTO recovery_restores VALUES(?,?,?,?,?,NULL,?)',restoreId,sourceHash,stamp?.backupId??null,stamp?.createdAt??null,now,stamp?.coverageFrom??stamp?.createdAt??0);
   s.run("INSERT OR REPLACE INTO operational_state VALUES('recovery-restore-id',?)",restoreId);
   s.run("INSERT OR REPLACE INTO operational_state VALUES('restore-ai-hold','reconciliation-required')");
   s.audit(null,null,'restore.auth-revoked-ai-held',now);
  });
 } finally{s.close();}
 return {status:'restored',sessionsRevoked:true,invitesRevoked:true,aiHold:'reconciliation-required',sourceSha256:sourceHash,restoreId,sourceSchemaVersion:sourceVersion,schemaVersion:5};
}
