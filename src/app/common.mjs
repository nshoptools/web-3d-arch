import {cloneJSON,parseJSON,canonicalJSON,sha256,check,keys,integer} from '../storage/common.mjs';
import {EXPORT_MESSAGES} from './export-messages.mjs';
import {PROFILE_MESSAGES} from './profile-messages.mjs';
import {APP_MESSAGES} from './app-messages.mjs';
export {cloneJSON,parseJSON,canonicalJSON,sha256,check,keys,integer};
export const VERSION='arch-app-adapters/1';
export const utf8=new TextEncoder();
export const decode=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes);
export const uuid=()=>crypto.randomUUID();
export function error(code,message=code,details={}) {return Object.assign(new Error(message),{code,details});}
export function assert(ok,code,details){if(!ok)throw error(code,code,details);}
export function diagnostic(e){
 const code=typeof e.code==='string'?e.code:(e.name==='AbortError'?'CANCELLED':e.name??'APP_OPERATION_FAILED');
 const message=Object.hasOwn(PROFILE_MESSAGES,code)?PROFILE_MESSAGES[code]:Object.hasOwn(EXPORT_MESSAGES,code)?EXPORT_MESSAGES[code]:Object.hasOwn(APP_MESSAGES,code)?APP_MESSAGES[code]:typeof e.code==='string'?code:'Thao tác của ứng dụng thất bại.';
 return {code,message,severity:'error',...(e.requestId?{detail:'Yêu cầu '+e.requestId}:{})};
}
export function freeze(v){if(v&&typeof v==='object'&&!ArrayBuffer.isView(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
export function data(v){return cloneJSON(v);}
export function sameOrigin(origin,input,{api=false}={}){
 const base=new URL(origin);assert(base.origin===origin&&['https:','http:'].includes(base.protocol),'ORIGIN_INVALID');
 const u=new URL(input,origin);
 assert(u.origin===origin&&!u.username&&!u.password&&!u.hash,'URL_ORIGIN_BLOCKED');
 if(api)assert(u.pathname.startsWith('/api/v1/')&&!/%2f|%5c/i.test(u.pathname),'API_PATH_BLOCKED');
 return u;
}
export function moneyMicros(raw){
 assert(typeof raw==='string'&&/^(?:0|[1-9]\d*)(?:[.,]\d{1,6})?$/.test(raw),'MONEY_DECIMAL');
 const [whole,frac='']=raw.replace(',','.').split('.');
 const n=BigInt(whole)*1000000n+BigInt(frac.padEnd(6,'0'));
 assert(n<=1000000000000n,'MONEY_RANGE');return Number(n);
}
export function moneyText(n){assert(Number.isSafeInteger(n)&&n>=0,'MONEY_RANGE');return (n/1000000).toFixed(6).replace(/\.?0+$/,'')||'0';}
export function boundedBytes(b,max=128*1024*1024){
 assert(b instanceof Uint8Array&&b.byteLength<=max,'BYTE_BUDGET');return new Uint8Array(b);
}
export function assertTicket(result,ticket){assert(result?.version===VERSION&&result.ticket&&canonicalJSON(result.ticket)===canonicalJSON(ticket),'ADAPTER_TICKET');}
export function adapter(a){assert(a?.version===VERSION,'ADAPTER_REQUIRED');return a;}
export function capable(a,id){return !!a?.capabilities?.some(c=>c.id===id&&c.available===true);}
export function fileName(n){assert(typeof n==='string'&&n.length>0&&n.length<=240&&!/[\\/\x00-\x1f]/.test(n),'FILE_NAME');return n;}
