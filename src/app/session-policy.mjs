import {assert,error} from './common.mjs';
import {createOnlineGrant} from '../storage/online-grant.mjs';
/** One live HTTPS session, never a resumable offline lease. No credentials or grant are serialized. */
export class AuthenticatedOnlineSession {
 #mode='active';#epoch;#identity;#controller;
 constructor(controller,me,claims){
  this.#controller=controller;this.#epoch=controller.epoch;
  assert(typeof me.sessionId==='string'&&me.sessionId.length>0&&Number.isSafeInteger(me.absoluteExpiresAt)&&Number.isSafeInteger(me.idleExpiresAt),'SESSION_METADATA');
  this.#identity=Object.freeze({...claims,sessionId:me.sessionId,
   expiresAt:Math.min(claims.expiresAt,me.absoluteExpiresAt,me.idleExpiresAt)});
  assert(this.#identity.expiresAt>claims.verifiedAt,'SESSION_EXPIRED');
 }
 grant(){
  const {sessionId,...identity}=this.#identity;
  return createOnlineGrant(identity,{assertCurrent:options=>this.assertCurrent(options),preflight:signal=>this.preflight(signal)});
 }
 assertCurrent({rescue=false}={}){
  const c=this.#controller;
  assert(this.#mode!=='closed'&&!c.closed&&this.#epoch===c.epoch&&c.onlineSession===this,'ACCESS_CHANGED');
  if(rescue)return;
  assert(this.#mode==='active'&&c.online&&c.now()<this.#identity.expiresAt,'ONLINE_SESSION_REQUIRED');
 }
 async preflight(signal){
  const c=this.#controller,epoch=this.#epoch;
  try{
   this.assertCurrent();assert(!signal?.aborted,'CANCELLED');
   const result=await c.api.request('/api/v1/me',{fresh:true,signal}),me=result.value,i=this.#identity;
   this.assertCurrent();assert(epoch===this.#epoch,'ACCESS_CHANGED');
   assert(me.user.id===i.userId&&me.deviceId===i.deviceId&&me.user.authVersion===i.authVersion&&me.sessionId===i.sessionId,'ONLINE_IDENTITY_CHANGED');
   assert(Number.isSafeInteger(me.serverTime)&&me.serverTime>=i.verifiedAt&&me.serverTime<i.expiresAt&&me.serverTime<me.absoluteExpiresAt&&me.serverTime<me.idleExpiresAt,'SESSION_EXPIRED');
  }catch(e){
   if(signal?.aborted&&this.#mode==='active'&&epoch===c.epoch)throw e;
   if(c.onlineSession===this&&epoch===c.epoch)c.invalidate('expired',{rescue:true});
   await c.resetBarrier;throw e;
  }
 }
 suspend(epoch){this.#mode='rescue';this.#epoch=epoch;}
 close(){this.#mode='closed';}
}
