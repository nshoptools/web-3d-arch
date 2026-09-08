import {setImmediate as yieldTurn} from 'node:timers/promises';
import {DAY,canonical,fail,integer,period,Fault} from './core.mjs';

export const MAINTENANCE_KEY='runtime-maintenance';
const VERSION='arch-backend-maintenance/1';
const phases=['recover','references','artifacts','events','settlements','jobs','audit','sessions','counters','obligations','deletions'];
const tables={recover:'jobs',references:'image_references',artifacts:'artifacts',events:'job_events',settlements:'settlements',
 jobs:'jobs',audit:'audit',sessions:'sessions',counters:'counters',obligations:'recovery_obligations',deletions:'deletion_tasks'};
const countKeys=['scanned','recoveredUnknown','recoveredUnsent','referencesPurged','artifactBytesPurged','artifactsPurged',
 'jobEventsPurged','settlementsPurged','jobsPurged','auditPurged','sessionsPurged','countersPurged',
 'unknownPending','recoveryPending','backupPurgeOverdue'];
const emptyCounts=()=>Object.fromEntries(countKeys.map(k=>[k,0]));
// An unverified recovery bound is a retained liability even on a terminal row.
const eligible=(j,at)=>j.updated<at-90*DAY&&['succeeded','failed','cancelled'].includes(j.state)&&j.accounting!=='pending'&&(j.recovery_bound===null||j.actual!==null);
const jobCols='j.updated,j.state,j.accounting,j.recovery_bound,j.actual';
export function maintenanceHold(s){
 return s.get("SELECT key FROM operational_state WHERE key='restore-ai-hold'")?'RESTORE_RECONCILIATION_REQUIRED':null;
}
export function readMaintenance(s){
 const row=s.get('SELECT value FROM operational_state WHERE key=?',MAINTENANCE_KEY);
 if(!row)return {version:VERSION,lastWall:null,lastCompletedAt:null,lastSummary:null};
 fail(row.value.length<=4096,503,'MAINTENANCE_CHECKPOINT_INVALID');
 let x;try{x=JSON.parse(row.value);}catch{throw new Fault(503,'MAINTENANCE_CHECKPOINT_INVALID');}
 fail(x?.version===VERSION&&Object.keys(x).sort().join(',')==='lastCompletedAt,lastSummary,lastWall,version',503,'MAINTENANCE_CHECKPOINT_INVALID');
 for(const k of ['lastWall','lastCompletedAt'])fail(x[k]===null||Number.isSafeInteger(x[k])&&x[k]>=0&&x[k]<=8_640_000_000_000_000,503,'MAINTENANCE_CHECKPOINT_INVALID');
 fail(x.lastCompletedAt===null||x.lastWall!==null&&x.lastCompletedAt<=x.lastWall,503,'MAINTENANCE_CHECKPOINT_INVALID');
 fail(x.lastSummary===null||countKeys.every(k=>Number.isSafeInteger(x.lastSummary[k])&&x.lastSummary[k]>=0)&&Object.keys(x.lastSummary).length===countKeys.length,503,'MAINTENANCE_CHECKPOINT_INVALID');
 return x;
}
export function newMaintenancePass(s,at,{recoverOnly=false}={}){
 integer(at,8_640_000_000_000_000);
 const names=recoverOnly?['recover']:phases;
 return {at,phase:0,cursor:0,phases:names,ceilings:Object.fromEntries(names.map(p=>[p,s.get('SELECT COALESCE(MAX(rowid),0) n FROM '+tables[p]).n])),counts:emptyCounts(),done:false};
}
function scan(s,p,n){
 const name=p.phases[p.phase],table=tables[name],bounds=[p.cursor,p.ceilings[name],n];
 let fields;
 if(['artifacts','events','settlements'].includes(name)){
  fields=name==='artifacts'?'t.id,COALESCE(length(t.bytes),0)+COALESCE(length(i.thumbnail),0) blobBytes':'t.job_id';
  return s.all('SELECT t.rowid rid,'+fields+','+jobCols+' FROM '+table+' t JOIN jobs j ON j.id=t.job_id '+
   (name==='artifacts'?'LEFT JOIN artifact_images i ON i.id=t.id ':'')+
   'WHERE t.rowid>? AND t.rowid<=? ORDER BY t.rowid LIMIT ?',...bounds);
 }
 fields={
  recover:'id,state,submitted',references:'id,retain_until,bytes IS NOT NULL hasBytes,COALESCE(length(bytes),0)+COALESCE(length(thumbnail),0) blobBytes',
  jobs:'id,user_id,operation_id,idem,payload_hash,updated,state,accounting,recovery_bound,actual',
  audit:'at',sessions:'created,last_seen',counters:'dimension,period',
  obligations:'state,accounting',deletions:'backup_purge_deadline,status'
 }[name];
 return s.all('SELECT rowid rid,'+fields+' FROM '+table+' WHERE rowid>? AND rowid<=? ORDER BY rowid LIMIT ?',...bounds);
}
/** One synchronous transaction. No provider, key, filesystem, timer or image decode. */
export function maintenanceBatch(s,pass,{rows=100,bytes=32*1024*1024,now=Date.now(),isLive=()=>false,checkpoint=true}={}){
 integer(rows,500,1);integer(bytes,64*1024*1024,16*1024*1024);integer(now,8_640_000_000_000_000);
 fail(pass&&!pass.done,409,'MAINTENANCE_PASS_COMPLETE');
 const previousTimeout=s.get('PRAGMA busy_timeout').timeout;
 // Never occupy the foreground event loop waiting for another database writer.
 s.db.exec('PRAGMA busy_timeout=0;');
 try{return s.tx(()=>{
  const held=maintenanceHold(s);if(held)return {status:'held',code:held,pass,scanned:0,blobBytes:0};
  const saved=readMaintenance(s);
  if(saved.lastWall!==null&&now<saved.lastWall||now<pass.at)return {status:'held',code:'CLOCK_BACKWARD',pass,scanned:0,blobBytes:0};
  const next=structuredClone(pass),name=next.phases[next.phase],table=tables[name];
  let scanned=0,blobBytes=0;
  const selected=scan(s,next,rows);
  for(const r of selected){
   const removeBlob=name==='references'?r.hasBytes&&r.retain_until<=next.at:name==='artifacts'&&eligible(r,next.at);
   if(removeBlob){
    fail(r.blobBytes<=bytes,503,'MAINTENANCE_OBJECT_TOO_LARGE');
    if(blobBytes+r.blobBytes>bytes)break;
    blobBytes+=r.blobBytes;
   }
   next.cursor=r.rid;scanned++;next.counts.scanned++;
   const del=()=>s.run('DELETE FROM '+table+' WHERE rowid=?',r.rid);
   if(name==='recover'&&['reserved','submitted','running'].includes(r.state)&&!isLive(r.id)){
    const state=r.submitted===null?'failed':'unknown';
    s.run("UPDATE jobs SET state=?,accounting=?,error_code=CASE WHEN submitted IS NULL THEN 'SERVER_RESTART_BEFORE_SEND' ELSE error_code END,seq=seq+1,updated=? WHERE id=?",state,r.submitted===null?'none':'pending',now,r.id);
    s.run('INSERT INTO job_events VALUES(?,?,?,?)',r.id,s.get('SELECT seq FROM jobs WHERE id=?',r.id).seq,state,now);
    next.counts[r.submitted===null?'recoveredUnsent':'recoveredUnknown']++;
   }else if(name==='references'&&removeBlob){
    s.run('UPDATE image_references SET bytes=NULL,thumbnail=NULL,revision=revision+1,deleted=? WHERE rowid=?',now,r.rid);next.counts.referencesPurged++;
   }else if(['artifacts','events','settlements'].includes(name)&&eligible(r,next.at)){
    del();next.counts[{artifacts:'artifactsPurged',events:'jobEventsPurged',settlements:'settlementsPurged'}[name]]++;
    if(name==='artifacts')next.counts.artifactBytesPurged+=r.blobBytes;
   }else if(name==='jobs'){
    if(r.state==='unknown'&&r.accounting==='pending')next.counts.unknownPending++;
    if(eligible(r,next.at)&&!s.get('SELECT 1 FROM artifacts WHERE job_id=? LIMIT 1',r.id)&&
      !s.get('SELECT 1 FROM job_events WHERE job_id=? LIMIT 1',r.id)&&!s.get('SELECT 1 FROM settlements WHERE job_id=? LIMIT 1',r.id)){
     s.run('INSERT INTO tombstones VALUES(?,?,?,?,?)',r.user_id,r.operation_id,r.idem,r.payload_hash,r.id);
     del();next.counts.jobsPurged++;
    }
   }else if(name==='audit'&&r.at<next.at-90*DAY){del();next.counts.auditPurged++;
   }else if(name==='sessions'&&(r.created<=next.at-12*3_600_000||r.last_seen<=next.at-3_600_000)){del();next.counts.sessionsPurged++;
   }else if(name==='counters'){
    const expired=['http-requests','auth-requests'].includes(r.dimension)?/^\d+$/.test(r.period)&&Number(r.period)<Math.floor(next.at/60_000)-2:
     ['sync-bytes','image-upload-count','image-upload-bytes'].includes(r.dimension)&&r.period<period(next.at-90*DAY).day;
    if(expired){del();next.counts.countersPurged++;}
   }else if(name==='obligations'&&r.accounting==='pending'){next.counts.recoveryPending++;
   }else if(name==='deletions'&&r.status!=='complete'&&r.backup_purge_deadline<=next.at){next.counts.backupPurgeOverdue++;}
  }
  if(scanned===selected.length&&(selected.length<rows||next.cursor>=next.ceilings[name])){
   next.phase++;next.cursor=0;if(next.phase>=next.phases.length)next.done=true;
  }
  if(checkpoint){
   const record={version:VERSION,lastWall:now,lastCompletedAt:next.done&&next.phases.length>1?now:saved.lastCompletedAt,
    lastSummary:next.done&&next.phases.length>1?next.counts:saved.lastSummary};
   s.run('INSERT INTO operational_state VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',MAINTENANCE_KEY,canonical(record));
  }
  return {status:next.done?'complete':'more',pass:next,scanned,blobBytes};
 });}finally{s.db.exec('PRAGMA busy_timeout='+previousTimeout);}
}
/** Finite snapshot pass for the existing offline operations API. Await, do not busy-loop. */
export async function runMaintenance(s,{clock=Date.now,rows=100,bytes=32*1024*1024,isLive=()=>false,recoverOnly=false,signal,onBatch=()=>{},yieldFn=yieldTurn}={}){
 const held=maintenanceHold(s);if(held)return {status:'held',code:held};
 let pass=newMaintenancePass(s,clock(),{recoverOnly});
 while(!pass.done){
  if(signal?.aborted)return {status:'stopped'};
  const result=maintenanceBatch(s,pass,{rows,bytes,now:clock(),isLive,checkpoint:!recoverOnly});
  onBatch(result);if(result.status==='held')return {status:'held',code:result.code};
  pass=result.pass;if(!pass.done)await yieldFn();
 }
 return {status:'complete',counts:pass.counts};
}
