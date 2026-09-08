import {id} from './core.mjs';
/** Additive schema4 migration. Plan bookkeeping never changes the checked ledger generation. */
export function migrateRecovery(s) {
 s.tx(()=>{
  s.db.exec(`
   ALTER TABLE jobs ADD COLUMN recovery_bound INTEGER CHECK(recovery_bound IS NULL OR recovery_bound>=0);
   ALTER TABLE jobs ADD COLUMN recovery_period_at INTEGER;
   CREATE TABLE recovery_clock(id INTEGER PRIMARY KEY CHECK(id=1),database_id TEXT NOT NULL,generation INTEGER NOT NULL CHECK(generation BETWEEN 0 AND 9007199254740991));
   CREATE TABLE recovery_restores(id TEXT PRIMARY KEY,source_hash TEXT,backup_id TEXT,backup_at INTEGER,restored_at INTEGER NOT NULL,completed_plan TEXT,coverage_from INTEGER NOT NULL);
   CREATE TABLE recovery_plans(hash TEXT PRIMARY KEY,bundle_id TEXT UNIQUE NOT NULL,bundle_hash TEXT NOT NULL,ledger_hash TEXT NOT NULL,restore_id TEXT,created INTEGER NOT NULL,json TEXT NOT NULL,checked TEXT);
   CREATE TABLE recovery_applications(bundle_id TEXT PRIMARY KEY,plan_hash TEXT UNIQUE NOT NULL,bundle_hash TEXT NOT NULL,receipt TEXT NOT NULL);
   CREATE TABLE recovery_evidence(hash TEXT PRIMARY KEY,media_type TEXT NOT NULL,byte_length INTEGER NOT NULL,bytes BLOB NOT NULL);
   CREATE TABLE recovery_obligations(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),operation_id TEXT NOT NULL,idem TEXT NOT NULL,payload_hash TEXT NOT NULL,provider_id TEXT NOT NULL,endpoint_id TEXT NOT NULL,credential_id TEXT NOT NULL,credential_version INTEGER NOT NULL,request_id TEXT,submitted INTEGER NOT NULL,day TEXT NOT NULL,month TEXT NOT NULL,currency TEXT NOT NULL,cap INTEGER NOT NULL,byte_cap INTEGER NOT NULL,actual INTEGER,recovery_bound INTEGER,state TEXT NOT NULL,accounting TEXT NOT NULL,record TEXT NOT NULL,bundle_id TEXT NOT NULL,updated INTEGER NOT NULL,UNIQUE(user_id,operation_id),UNIQUE(user_id,idem));
   CREATE INDEX recovery_obligations_budget ON recovery_obligations(user_id,currency,day,month);
   CREATE TABLE recovery_changes(bundle_id TEXT NOT NULL,entry_id TEXT NOT NULL,target_id TEXT NOT NULL,evidence_hash TEXT NOT NULL,before_json TEXT NOT NULL,after_json TEXT NOT NULL,PRIMARY KEY(bundle_id,entry_id));
  `);
  s.run('INSERT INTO recovery_clock VALUES(1,?,0)',id());
  if(s.get("SELECT key FROM operational_state WHERE key='restore-ai-hold'")){
   const restoreId=id();s.run('INSERT INTO recovery_restores VALUES(?,NULL,NULL,NULL,0,NULL,0)',restoreId);
   s.run("INSERT INTO operational_state VALUES('recovery-restore-id',?)",restoreId);
  }
  const tables=['users','invites','sessions','policy','settings','conflicts','credentials','budgets','jobs','job_events','settlements','artifacts','tombstones','counters','audit','deletion_tasks','operational_state','recovery_obligations','recovery_restores','recovery_changes'];
  for(const table of tables)for(const event of ['INSERT','UPDATE','DELETE'])
   s.db.exec(`CREATE TRIGGER recovery_generation_${table}_${event} AFTER ${event} ON ${table} BEGIN UPDATE recovery_clock SET generation=generation+1 WHERE id=1; END;`);
  s.db.exec('PRAGMA user_version=4');
 });
}
