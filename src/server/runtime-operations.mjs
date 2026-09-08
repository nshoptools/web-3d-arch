import {performance} from 'node:perf_hooks';
import {setImmediate as yieldTurn} from 'node:timers/promises';
import {maintenanceHold,readMaintenance,newMaintenancePass,maintenanceBatch} from './maintenance.mjs';
import {validateRuntime} from './runtime-config.mjs';

const safeCode=e=>e?.errcode===5||e?.errcode===6?'DATABASE_WRITER_BUSY':
 ['MAINTENANCE_CHECKPOINT_INVALID','MAINTENANCE_OBJECT_TOO_LARGE'].includes(e?.code)?e.code:'MAINTENANCE_FAILED';

/** Foreground-owned timer, one serial bounded turn; no external jobs or provider calls. */
export class RuntimeOperations {
 constructor(s,{runtime={},clock=Date.now,monotonic=()=>performance.now(),isLive=()=>false,logger=()=>{},
  setTimer=setTimeout,clearTimer=clearTimeout,yieldFn=yieldTurn}={}){
  Object.assign(this,{s,clock,monotonic,isLive,logger,setTimer,clearTimer,yieldFn});
  this.config=validateRuntime(runtime).maintenance;this.started=false;this.stopping=false;this.timer=null;this.running=null;this.pass=null;
  this.saved=readMaintenance(s);this.code=null;this.forwardHold=false;this.lastMono=null;this.lastWall=null;
  this.state=this.config.enabled?'idle':'disabled';this.startedMono=null;this.lastSuccessMono=null;
 }
 status(){
  let state=this.state,code=this.code;
  if(!code&&this.saved.lastSummary?.backupPurgeOverdue>0){state='degraded';code='BACKUP_PURGE_EVIDENCE_REQUIRED';}
  if(this.started&&!this.stopping&&!code&&this.config.enabled&&this.monotonic()-(this.lastSuccessMono??this.startedMono)>this.config.maxLagMs){state='degraded';code='MAINTENANCE_OVERDUE';}
  return {version:'arch-backend-runtime-status/1',state,code,enabled:this.config.enabled,running:!!this.running,
   lastCompletedAt:this.saved.lastCompletedAt,lastSummary:this.saved.lastSummary,
   pass:this.pass?{phase:this.pass.phases[this.pass.phase]??null,scanned:this.pass.counts.scanned,cutoffAt:this.pass.at}:null,
   externalBackupPurge:'operator-evidence-required'};
 }
 observe(){
  const wall=this.clock(),mono=this.monotonic();
  if(!Number.isSafeInteger(wall)||wall<0||wall>8_640_000_000_000_000||!Number.isFinite(mono)||mono<0)return 'CLOCK_INVALID';
  if(this.forwardHold)return 'CLOCK_FORWARD';
  const durable=this.saved.lastWall??0;
  if(wall<durable||this.lastWall!==null&&wall<this.lastWall)return 'CLOCK_BACKWARD';
  if(this.lastMono!==null&&(mono<this.lastMono||wall-this.lastWall-(mono-this.lastMono)>this.config.maxClockStepMs)){
   this.forwardHold=true;return 'CLOCK_FORWARD';
  }
  this.lastWall=wall;this.lastMono=mono;return null;
 }
 report(state,code=null){
  const changed=this.state!==state||this.code!==code;this.state=state;this.code=code;
  if(changed)try{this.logger({category:'maintenance',state,code});}catch{}
 }
 start(){
  if(this.started||this.stopping)return;this.started=true;this.startedMono=this.monotonic();
  if(this.config.enabled)this.schedule(0);
 }
 schedule(delay){
  if(!this.started||this.stopping||!this.config.enabled||this.timer!==null)return;
  this.timer=this.setTimer(()=>{this.timer=null;void this.runOnce().then(()=>{
   this.schedule(this.code?this.config.failureDelayMs:this.pass?this.config.catchUpDelayMs:this.config.intervalMs);
  });},delay);
 }
 runOnce(){
  if(this.running)return this.running;
  if(this.stopping)return Promise.resolve(this.status());
  if(this.timer!==null){this.clearTimer(this.timer);this.timer=null;}
  // Defer the first batch so overlapping callers receive the same promise.
  this.running=Promise.resolve().then(async()=>{
   try{
    for(let i=0;i<this.config.maxBatchesPerTurn&&!this.stopping;i++){
     const blocked=maintenanceHold(this.s)??this.observe();
     if(blocked){this.report('held',blocked);break;}
     this.pass??=newMaintenancePass(this.s,this.clock());
     this.report('running');
     const r=maintenanceBatch(this.s,this.pass,{rows:this.config.batchRows,bytes:this.config.batchBytes,now:this.clock(),isLive:this.isLive});
     if(r.status==='held'){this.report('held',r.code);break;}
     this.pass=r.pass;this.saved=readMaintenance(this.s);
     if(this.pass.done){this.pass=null;this.lastSuccessMono=this.monotonic();this.report('idle');break;}
     this.report('catching-up');
     if(i+1<this.config.maxBatchesPerTurn)await this.yieldFn();
    }
   }catch(e){this.report('degraded',safeCode(e));}
  }).finally(()=>{
   this.running=null;if(this.stopping)this.report('stopped',this.code);
   this.schedule(this.code?this.config.failureDelayMs:this.pass?this.config.catchUpDelayMs:this.config.intervalMs);
  }).then(()=>this.status());
  return this.running;
 }
 async stop(){
  this.stopping=true;if(this.timer!==null){this.clearTimer(this.timer);this.timer=null;}
  if(this.running)await this.running;
  this.report('stopped',this.code);
  return this.status();
 }
}
