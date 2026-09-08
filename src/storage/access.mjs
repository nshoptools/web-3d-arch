import {check,identity,integer,cloneJSON,keys,StorageError} from './common.mjs';
import {isOnlineGrant} from './online-grant.mjs';
const DAY=24*60*60*1000,ROLLBACK=5*60*1000;
export class OfflineAccess {
 #grant=null;#epoch=0;#lastSeen=0;#mode='locked';
 constructor({userId,deviceId,now}){
  this.userId=identity(userId,'user ID');this.deviceId=identity(deviceId,'device ID');
  check(typeof now==='function','CLOCK_REQUIRED','Caller must supply its trusted UTC/monotonic clock.');
  this.now=now;this.listeners=new Set();
 }
 get epoch(){return this.#epoch;}
 get authVersion(){return this.#grant?.authVersion??0;}
 get lastSeen(){return this.#lastSeen;}
 unlock(input,watermark={lastSeen:0,authVersion:0}){
  check(!isOnlineGrant(input),'OFFLINE_PROOF_REQUIRED','An online grant cannot become an offline lease.');
  const lease=cloneJSON(input,{denySecrets:false});
  keys(lease,['userId','deviceId','authVersion','verifiedAt','expiresAt','verified']);
  check(lease.verified===true,'LEASE_UNVERIFIED','Caller must verify the signed offline lease outside storage.');
  return this.#activate({...lease,kind:'signed-offline'},watermark);
 }
 unlockOnline(grant,watermark={lastSeen:0,authVersion:0}){
  check(isOnlineGrant(grant),'ONLINE_GRANT_REQUIRED','Only a live in-memory authorizer can unlock online access.');
  grant.assertCurrent();return this.#activate(grant,watermark);
 }
 #activate(grant,watermark){
  check(grant.userId===this.userId&&grant.deviceId===this.deviceId,'USER_MISMATCH','Grant user/device mismatch.');
  integer(grant.authVersion,1);integer(grant.verifiedAt);integer(grant.expiresAt);
  check(grant.expiresAt>grant.verifiedAt&&grant.expiresAt-grant.verifiedAt<=DAY,'LEASE_INTERVAL','Grant must not exceed 24 hours.');
  check(grant.authVersion>=(watermark.authVersion??0),'AUTH_VERSION','A newer auth version was already observed.');
  this.lock('replaced-grant');this.#grant=grant;
  this.#lastSeen=Math.max(this.#lastSeen,watermark.lastSeen??0,grant.verifiedAt);this.#mode='active';return this.status();
 }
 status(){
  const g=this.#grant;
  if(!g||this.#mode==='locked')return {mode:'locked',canEdit:false,canRescue:false,reason:'LOCKED',epoch:this.#epoch};
  if(g.kind==='authenticated-online'){
   try{g.assertCurrent({rescue:true});}catch{return {mode:'locked',canEdit:false,canRescue:false,reason:'ACCESS_CHANGED',epoch:this.#epoch};}
  }
  const observed=integer(this.now()),rollback=observed<this.#lastSeen-ROLLBACK;this.#lastSeen=Math.max(observed,this.#lastSeen);
  let reason=rollback?'CLOCK_ROLLBACK':'LEASE_EXPIRED_OR_CLOCK';
  if(rollback||this.#lastSeen>=g.expiresAt){this.#mode='rescue';}
  if(g.kind==='authenticated-online'&&this.#mode==='active')try{g.assertCurrent();}catch{reason='ONLINE_SESSION_REQUIRED';this.#mode='rescue';}
  return {mode:this.#mode,canEdit:this.#mode==='active',canRescue:true,trust:g.kind,
   reason:this.#mode==='active'?null:reason,epoch:this.#epoch};
 }
 async preflight(signal){
  const g=this.#grant;this.assert();
  if(g?.kind==='authenticated-online')await g.preflight(signal);
  this.assert();
 }
 assert({rescue=false,epoch=this.#epoch}={}){
  check(epoch===this.#epoch,'ACCESS_CHANGED','User/session changed during operation.');
  const s=this.status();
  check(rescue?s.canRescue:s.canEdit,s.reason??'LOCKED','Project is locked; rescue requires the matching verified identity.',s);
  return s;
 }
 suspend(reason='online-session-lost'){
  this.#epoch++;this.#mode=this.#grant?'rescue':'locked';
  for(const listener of this.listeners)listener(new StorageError('ACCESS_CHANGED',reason));
 }
 lock(reason='logout'){
  this.#epoch++;this.#mode='locked';this.#grant=null;
  for(const listener of this.listeners)listener(new StorageError('ACCESS_CHANGED',reason));
 }
}
