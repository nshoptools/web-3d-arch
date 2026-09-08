export function migrateImages(s){
 s.tx(()=>{
  s.db.exec([
   'CREATE TABLE image_references(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),session_id TEXT NOT NULL,project_id TEXT NOT NULL,project_revision TEXT NOT NULL,revision INTEGER NOT NULL,media_type TEXT NOT NULL,hash TEXT NOT NULL,byte_length INTEGER NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL,retain_until INTEGER NOT NULL,bytes BLOB,thumbnail BLOB,thumbnail_hash TEXT NOT NULL,codec TEXT NOT NULL,deleted INTEGER);',
   'CREATE INDEX image_references_owner ON image_references(user_id,expires);',
   'CREATE TABLE artifact_images(id TEXT PRIMARY KEY REFERENCES artifacts(id) ON DELETE CASCADE,width INTEGER NOT NULL,height INTEGER NOT NULL,thumbnail BLOB NOT NULL,thumbnail_hash TEXT NOT NULL,codec TEXT NOT NULL);'
  ].join('\n'));
  for(const table of ['image_references','artifact_images'])for(const event of ['INSERT','UPDATE','DELETE'])
   s.db.exec('CREATE TRIGGER recovery_generation_'+table+'_'+event+' AFTER '+event+' ON '+table+' BEGIN UPDATE recovery_clock SET generation=generation+1 WHERE id=1; END;');
  s.db.exec('PRAGMA user_version=5');
 });
}
