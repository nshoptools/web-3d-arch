import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {ApiClient,verifyOnlineLease,isVerifiedLease} from '../../src/app/http.mjs';
import {createAppController} from '../../src/app/controller.mjs';
import {OfflineAccess} from '../../src/storage/access.mjs';
import {createOnlineGrant} from '../../src/storage/online-grant.mjs';
function signed(){
 const {privateKey,publicKey}=generateKeyPairSync('ed25519'),issuedAt=Date.now();
 const me={user:{id:'test-user',authVersion:1},deviceId:'test-device'},claims={type:'offline-workspace-v1',userId:me.user.id,deviceId:me.deviceId,authVersion:1,issuedAt,expiresAt:issuedAt+86400000};
 const payload=Buffer.from(JSON.stringify(claims)).toString('base64url');
 return {me,reply:{publicKey:publicKey.export({format:'jwk'}),serverTime:issuedAt,lease:{payload,signature:sign(null,Buffer.from(payload),privateKey).toString('base64url')}}};
}
test('signed offline proof remains usable until expiry; copied bool is not controller proof',async()=>{
 const {reply,me}=signed(),proof=await verifyOnlineLease(reply,me);assert.equal(isVerifiedLease(proof),true);assert.equal(isVerifiedLease(structuredClone(proof)),false);
 const access=new OfflineAccess({userId:me.user.id,deviceId:me.deviceId,now:()=>proof.expiresAt+1});access.unlock(proof);assert.equal(access.status().canEdit,false);assert.equal(access.status().canRescue,true);
 let opened=0;const c=createAppController({origin:'https://test.invalid',deviceId:me.deviceId,storeFactory:async()=>{opened++;throw Error('must not open');}});
 const result=await c.resumeOffline({user:me.user,verifiedLease:structuredClone(proof)});assert.equal(result.ok,false);assert.equal(result.diagnostic.code,'OFFLINE_PROOF_REQUIRED');assert.equal(opened,0);await c.dispose();
});
test('real invalid Ed25519 signature never falls back to HTTPS assertion',async()=>{
 const {reply,me}=signed();const bytes=Buffer.from(reply.lease.signature,'base64url');bytes[0]^=128;reply.lease.signature=bytes.toString('base64url');
 await assert.rejects(()=>verifyOnlineLease(reply,me,{allowAuthenticatedResponse:true}),{code:'LEASE_SIGNATURE'});
});
test('forced unsupported crypto cannot use legacy bool or clone a fresh exchange receipt',async()=>{
 const original=crypto.subtle.importKey;crypto.subtle.importKey=async()=>{throw new DOMException('TEST forced unavailable','NotSupportedError');};
 try{const {reply,me}=signed();await assert.rejects(()=>verifyOnlineLease(reply,me,{allowAuthenticatedResponse:true}),{code:'LEASE_SIGNATURE_UNSUPPORTED'});}
 finally{crypto.subtle.importKey=original;}
 const api=new ApiClient({origin:'https://test.invalid'});
 assert.throws(()=>api.consumeOnlineExchange({value:{}},{value:{}}),{code:'ONLINE_EXCHANGE_REQUIRED'});
 assert.throws(()=>createAppController({origin:'https://test.invalid',deviceId:'d',allowAuthenticatedLeaseResponse:true}),{code:'EXPLICIT_LEASE_POLICY_REQUIRED'});
});
test('online grant is in-memory only, cannot unlock offline, and suspension allows only rescue',async()=>{
 const now=Date.now(),identity={userId:'test-user',deviceId:'test-device',authVersion:1,verifiedAt:now,expiresAt:now+60000};let active=true,calls=0;
 const grant=createOnlineGrant(identity,{assertCurrent({rescue=false}={}){if(!active&&!rescue)throw Error('TEST revoked');},async preflight(){calls++;}});
 const access=new OfflineAccess({...identity,now:()=>now});
 assert.throws(()=>JSON.stringify(grant),/ONLINE_GRANT_NOT_SERIALIZABLE/);
 assert.throws(()=>access.unlock(grant),{code:'OFFLINE_PROOF_REQUIRED'});
 assert.throws(()=>access.unlockOnline({...identity,kind:'authenticated-online',verified:true}),{code:'ONLINE_GRANT_REQUIRED'});
 access.unlockOnline(grant);await access.preflight();assert.equal(calls,1);
 active=false;assert.equal(access.status().canEdit,false);assert.equal(access.status().canRescue,true);
 await assert.rejects(()=>access.preflight());access.lock();assert.equal(access.status().canRescue,false);
});
test('fresh HTTPS receipt rejects cacheable, aged, cross-origin and synthetic Responses',async()=>{
 for(const specimen of [
  {url:'https://test.invalid/api/v1/me',cache:'public,max-age=60',age:'0'},
  {url:'https://test.invalid/api/v1/me',cache:'no-store',age:'1'},
  {url:'https://other.invalid/api/v1/me',cache:'no-store',age:'0'},
  {url:'',cache:'no-store',age:'0'}
 ]){
  // Explicit response-validation test double; no account/storage success is fabricated.
  const api=new ApiClient({origin:'https://test.invalid',fetchImpl:async()=>{const r=new Response('{}',{headers:{'content-type':'application/json','cache-control':specimen.cache,age:specimen.age}});Object.defineProperty(r,'url',{value:specimen.url});return r;}});
  await assert.rejects(()=>api.request('/api/v1/me',{fresh:true}),{code:'FRESH_HTTPS_RESPONSE_REQUIRED'});
 }
});


import {boundedSourceMetadata,sourceConfirmation,sourceReceipt} from '../../src/app/source-approval.mjs';
import {testBinding,testFlatReceipt} from './source-approval.fixtures.mjs';
test('flat source receipt cannot replace bytes and binds exact approval/source/ticket',()=>{
 const binding=testBinding(),make=()=>testFlatReceipt({...binding.control,...binding});
 assert.equal(sourceReceipt(make(),binding).sourceHash,binding.source.raw.hash);
 for(const change of [
  r=>{r.ticket.generation++;},r=>{r.confirmation.approvalHash='d'.repeat(64);},r=>{r.receipt.sourceRevision++;},
  r=>{r.receipt.sourceHash='f'.repeat(64);},r=>{r.receipt.rgbaHash='f'.repeat(64);},r=>{r.receipt.acceptedAtRevision++;},
  r=>{r.receipt.settingsHash='f'.repeat(64);},r=>{r.source={id:'replacement'};},r=>{r.bytes=new Uint8Array([1]);}
 ]){const r=make();change(r);assert.throws(()=>sourceReceipt(r,binding));}
});
test('source/font metadata is bounded plain JSON and confirmation has exact required kind fields',()=>{
 assert.throws(()=>boundedSourceMetadata({label:'a'.repeat(65536)}),{code:'SOURCE_METADATA_BUDGET'});
 assert.throws(()=>boundedSourceMetadata(JSON.parse('{"__proto__":{"polluted":true}}')));
 const c=testBinding().confirmation;
 assert.throws(()=>sourceConfirmation({...c,receiptField:'rasterReceipt'}));
 const {kind,...missing}=c;assert.throws(()=>sourceConfirmation(missing));
 assert.equal(sourceConfirmation(c).kind,'raster');
});
import {AuthenticatedOnlineSession} from '../../src/app/session-policy.mjs';
test('online authorizer fences authVersion/session/device changes and awaits its reset barrier',async()=>{
 for(const mismatch of ['authVersion','sessionId','deviceId']){
  const now=Date.now(),me={user:{id:'u',authVersion:1},deviceId:'d',sessionId:'s',absoluteExpiresAt:now+60000,idleExpiresAt:now+60000,serverTime:now};
  let release,invalidated=false,finished=false;const barrier=new Promise(resolve=>{release=resolve;});
  // Policy unit context only. Browser tests use the actual controller/backend/Workers.
  const context={epoch:1,online:true,closed:false,now:()=>now,resetBarrier:Promise.resolve(),
   api:{async request(path,options){assert.equal(path,'/api/v1/me');assert.equal(options.fresh,true);const value=structuredClone(me);if(mismatch==='authVersion')value.user.authVersion++;else value[mismatch]='different';return {value};}},
   invalidate(status,options){assert.equal(status,'expired');assert.equal(options.rescue,true);invalidated=true;this.epoch++;this.resetBarrier=barrier;}
  };
  const session=new AuthenticatedOnlineSession(context,me,{userId:'u',deviceId:'d',authVersion:1,verifiedAt:now,expiresAt:now+60000});context.onlineSession=session;
  const pending=session.preflight().finally(()=>{finished=true;});await Promise.resolve();await Promise.resolve();
  assert.equal(invalidated,true);assert.equal(finished,false);release();
  await assert.rejects(()=>pending,{code:'ONLINE_IDENTITY_CHANGED'});assert.equal(finished,true);
 }
});
