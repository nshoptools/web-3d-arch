import {assert,sameOrigin,error,parseJSON,utf8,decode,sha256} from './common.mjs';
export class ApiClient {
 #receipts=new WeakMap();#boundMe=null;
 constructor({origin,fetchImpl=(...args)=>globalThis.fetch(...args),onAuthLost=()=>{},onAccessFailure=()=>{}}){this.origin=origin;sameOrigin(origin,origin);this.fetchImpl=fetchImpl;this.onAuthLost=onAuthLost;this.onAccessFailure=onAccessFailure;this.epoch=0;this.csrf=null;this.userId=null;this.pending=new Set();}
 bind(me){this.reset();this.#boundMe=me;this.csrf=me.csrfToken;this.userId=me.user.id;}
 reset(){this.#boundMe=null;this.epoch++;this.csrf=null;this.userId=null;for(const c of this.pending)c.abort();this.pending.clear();}
 async request(path,{method='GET',body,etag,idempotencyKey,signal,raw=false,maxBytes=32*1024*1024,authStart=false,fresh=false}={}){
  const url=sameOrigin(this.origin,path,{api:true}),epoch=this.epoch,user=this.userId,c=new AbortController();
  const stop=()=>c.abort();signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)c.abort();this.pending.add(c);
  let timedOut=false;const timeout=fresh?setTimeout(()=>{timedOut=true;c.abort();},15000):null;
  const headers={'Accept':raw?'application/octet-stream':'application/json'};
  if(method!=='GET'){headers['Content-Type']='application/json';headers.Origin=this.origin;if(this.csrf)headers['X-CSRF-Token']=this.csrf;}
  if(etag!==undefined){assert(/^"r\d+"$/.test(etag),'ETAG_REQUIRED');headers['If-Match']=etag;}
  if(idempotencyKey)headers['Idempotency-Key']=idempotencyKey;
  try{
   let response;
   try{response=await this.fetchImpl(url.href,{method,headers,credentials:'same-origin',mode:'same-origin',cache:'no-store',redirect:'error',referrerPolicy:'same-origin',signal:c.signal,...(body!==undefined?{body:JSON.stringify(body)}:{})});}
   catch(e){throw error(c.signal.aborted?'CANCELLED':'NETWORK_UNCERTAIN');}
   assert(epoch===this.epoch,'ACCESS_CHANGED');
   assert(!response.redirected,'API_REDIRECT_BLOCKED');
   if(fresh)assert(new URL(this.origin).protocol==='https:'&&response.url===url.href&&
    /(?:^|,)\s*no-store(?:\s*,|\s*$)/i.test(response.headers.get('cache-control')??'')&&
    Number(response.headers.get('age')??0)===0,'FRESH_HTTPS_RESPONSE_REQUIRED');
   const declared=Number(response.headers.get('content-length')??0);assert(Number.isFinite(declared)&&declared<=maxBytes,'RESPONSE_BUDGET');
   const chunks=[];let total=0;
   if(response.body){const reader=response.body.getReader();try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>maxBytes){await reader.cancel();throw error('RESPONSE_BUDGET');}chunks.push(value);}}finally{reader.releaseLock();}}
   const bytes=new Uint8Array(total);let offset=0;for(const b of chunks){bytes.set(b,offset);offset+=b.length;}
   assert(epoch===this.epoch,'ACCESS_CHANGED');
   if(!response.ok){
    let failure;try{failure=parseJSON(decode(bytes)).error;}catch{}
    const e=error(failure?.code??'HTTP_ERROR');e.status=response.status;e.details=failure?.details??{};e.requestId=failure?.requestId;
    throw e;
   }
   if(user&&!authStart)assert(response.headers.get('x-user-id')===user,'RESPONSE_USER_MISMATCH');
   if(raw)return {bytes,mediaType:response.headers.get('content-type')??'',etag:response.headers.get('etag')};
   assert(response.headers.get('content-type')?.includes('application/json'),'RESPONSE_TYPE');
   const result={value:parseJSON(decode(bytes)),etag:response.headers.get('etag')};
   if(fresh)this.#receipts.set(result,{epoch,path:url.pathname,received:performance.now()});
   return result;
  }catch(caught){
   const e=timedOut?error('ONLINE_PREFLIGHT_TIMEOUT'):caught;
   if(!authStart&&e.status===401)await this.onAuthLost(e);
   else if(!authStart&&['NETWORK_UNCERTAIN','RESPONSE_USER_MISMATCH','API_REDIRECT_BLOCKED','FRESH_HTTPS_RESPONSE_REQUIRED','ONLINE_PREFLIGHT_TIMEOUT'].includes(e.code))await this.onAccessFailure(e);
   throw e;
  }finally{if(timeout!==null)clearTimeout(timeout);this.pending.delete(c);signal?.removeEventListener('abort',stop);}
 }
 consumeOnlineExchange(me,reply){
  const m=this.#receipts.get(me),r=this.#receipts.get(reply);
  assert(m&&r&&m.path==='/api/v1/me'&&r.path==='/api/v1/offline/lease'&&
   m.epoch+1===this.epoch&&r.epoch===this.epoch&&this.#boundMe===me.value&&
   performance.now()-m.received<=30000&&performance.now()-r.received<=30000,'ONLINE_EXCHANGE_REQUIRED');
  this.#receipts.delete(me);this.#receipts.delete(reply);
  return validateLeaseClaims(reply.value,me.value);
 }
}
const signedProofs=new WeakSet();
export const isVerifiedLease=input=>!!input&&signedProofs.has(input);
const unbase=s=>{assert(typeof s==='string'&&/^[A-Za-z0-9_-]+$/.test(s),'LEASE_ENCODING');return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));};
export function validateLeaseClaims(reply,me){
 const p=parseJSON(decode(unbase(reply?.lease?.payload)));
 assert(p.type==='offline-workspace-v1'&&p.userId===me.user.id&&p.deviceId===me.deviceId&&p.authVersion===me.user.authVersion,'LEASE_IDENTITY');
 assert(Number.isSafeInteger(reply.serverTime)&&Number.isSafeInteger(p.issuedAt)&&Number.isSafeInteger(p.expiresAt)&&p.expiresAt>p.issuedAt&&p.expiresAt-p.issuedAt<=86400000&&p.issuedAt<=reply.serverTime&&reply.serverTime<p.expiresAt,'LEASE_INTERVAL');
 return {userId:p.userId,deviceId:p.deviceId,authVersion:p.authVersion,verifiedAt:p.issuedAt,expiresAt:p.expiresAt};
}
/** Strict signed proof only. The legacy allowAuthenticatedResponse option cannot mint offline trust. */
export async function verifyOnlineLease(reply,me,{onCapability=()=>{}}={}){
 const {lease,publicKey}=reply;
 assert(lease&&publicKey?.kty==='OKP'&&publicKey.crv==='Ed25519','LEASE_KEY');
 try{
  const key=await crypto.subtle.importKey('jwk',publicKey,{name:'Ed25519'},false,['verify']);
  assert(await crypto.subtle.verify('Ed25519',key,unbase(lease.signature),utf8.encode(lease.payload)),'LEASE_SIGNATURE');
 }catch(e){
  if(e.name!=='NotSupportedError')throw e;
  onCapability({signature:'unsupported',reason:e.name,trust:'blocked'});throw error('LEASE_SIGNATURE_UNSUPPORTED');
 }
 const verified=Object.freeze({...validateLeaseClaims(reply,me),verified:true});
 signedProofs.add(verified);onCapability({signature:'verified',trust:'webcrypto'});return verified;
}
