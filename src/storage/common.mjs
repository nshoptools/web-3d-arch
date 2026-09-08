export class StorageError extends Error {
  constructor(code,message,details={}){super(message);this.name='StorageError';this.code=code;this.details=details;}
}
export const fail=(code,message,details)=>{throw new StorageError(code,message,details);};
export const check=(ok,code,message,details)=>{if(!ok)fail(code,message,details);};
export const LIMITS=Object.freeze({asset:128*1024*1024,package:128*1024*1024,expanded:512*1024*1024,entries:10000,json:32*1024*1024,depth:64,nodes:200000});
export const HASH=/^[a-f0-9]{64}$/;
export const encoder=new TextEncoder();
export function errorInfo(error){
  return {code:typeof error.code==='string'?error.code:error.name??'IO_ERROR',message:String(error.message??error),details:error.details??{}};
}
export function abortCheck(signal){if(signal?.aborted)fail('ABORTED','Operation was cancelled.');}
export function identity(value,label='ID'){
  check(typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)&&!['constructor','prototype','__proto__'].includes(value),'INVALID_ID','Invalid '+label);
  return value;
}
export function hashId(hash){check(typeof hash==='string'&&HASH.test(hash),'INVALID_HASH','Expected lowercase SHA-256 hex.');return hash;}
export function integer(value,min=0,max=Number.MAX_SAFE_INTEGER){
  check(Number.isSafeInteger(value)&&value>=min&&value<=max,'INTEGER_RANGE','Invalid bounded integer.',{min,max});return value;
}
const forbidden=new Set(['__proto__','prototype','constructor']);
const secretKeys=new Set(['token','accesstoken','refreshtoken','idtoken','apikey','authorization','cookie','cookies','sessioncookie','sessioncookies','providercredentials','credentials','secrets','offlinelease']);
export function cloneJSON(input,{denySecrets=true}={}){
  const seen=new Set();let nodes=0;
  function copy(value,depth){
    check(depth<=LIMITS.depth&&++nodes<=LIMITS.nodes,'JSON_BUDGET','JSON exceeds depth/node budget.');
    if(value===null||typeof value==='string'||typeof value==='boolean')return value;
    if(typeof value==='number'){check(Number.isFinite(value),'NONFINITE','Only finite JSON numbers are allowed.');return value===0?0:value;}
    check(value&&typeof value==='object','JSON_TYPE','Only plain JSON data is allowed.');
    check(!seen.has(value),'JSON_CYCLE','Cyclic data is not allowed.');
    const array=Array.isArray(value);
    check(array||[Object.prototype,null].includes(Object.getPrototypeOf(value)),'JSON_TYPE','Expected plain JSON record.');
    seen.add(value);const result=array?[]:{};
    for(const key of Reflect.ownKeys(value)){
      if(array&&key==='length')continue;
      check(typeof key==='string'&&!forbidden.has(key),'UNSAFE_KEY','Prototype keys are forbidden.');
      check(!denySecrets||!secretKeys.has(key.replace(/[-_]/g,'').toLowerCase()),'SECRET_FIELD','Credentials/session material must never be passed to project storage.',{key});
      const d=Object.getOwnPropertyDescriptor(value,key);
      check(d&&'value'in d&&d.enumerable,'JSON_ACCESSOR','Getters/non-enumerable properties are forbidden.');
      if(array)check(/^(0|[1-9]\d*)$/.test(key)&&Number(key)<value.length,'JSON_ARRAY','Invalid array property.');
      result[key]=copy(d.value,depth+1);
    }
    if(array)check(Object.keys(value).length===value.length,'JSON_ARRAY','Sparse arrays are forbidden.');
    seen.delete(value);return result;
  }
  return copy(input,0);
}
export function keys(record,allowed,required=allowed){
  check(record!==null&&typeof record==='object'&&!Array.isArray(record),'RECORD_REQUIRED','Expected a record.');
  for(const k of Object.keys(record))check(allowed.includes(k),'UNKNOWN_FIELD','Unknown schema field.',{field:k});
  for(const k of required)check(Object.hasOwn(record,k),'MISSING_FIELD','Missing schema field.',{field:k});
}
export function canonicalJSON(input){
  const value=cloneJSON(input);
  const encode=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(encode).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+encode(v[k])).join(',')+'}';
  const text=encode(value);check(encoder.encode(text).length<=LIMITS.json,'JSON_BUDGET','JSON byte budget exceeded.');return text;
}
function numberIdentity(token){
  const m=/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token);
  let digits=(m[2]+(m[3]??'')).replace(/^0+/,'');
  if(!digits)return '0';
  let exponent=BigInt(m[4]??'0')-BigInt((m[3]??'').length);
  const trim=digits.length-digits.replace(/0+$/,'').length;
  return m[1]+digits.slice(0,digits.length-trim)+'e'+(exponent+BigInt(trim));
}
export function parseJSON(raw,{exactNumbers=true}={}){
  check(typeof raw==='string'&&raw.length<=LIMITS.json&&encoder.encode(raw).length<=LIMITS.json,'JSON_BUDGET','JSON input is too large.');
  let i=0,nodes=0;
  const ws=()=>{while(i<raw.length&&/[ \t\n\r]/.test(raw[i]))i++;};
  const string=()=>{
    const start=i++;
    while(i<raw.length){
      if(raw[i]==='\\'){i+=2;continue;}
      if(raw[i++]==='"'){try{return JSON.parse(raw.slice(start,i));}catch{fail('INVALID_JSON','Invalid JSON string.');}}
    }
    fail('INVALID_JSON','Unterminated JSON string.');
  };
  const read=depth=>{
    check(depth<=LIMITS.depth&&++nodes<=LIMITS.nodes,'JSON_BUDGET','JSON exceeds depth/node budget.');ws();
    if(raw[i]==='"')return string();
    if(raw[i]==='{'||raw[i]==='['){
      const array=raw[i++]==='[',end=array?']':'}',out=array?[]:{},seen=new Set();
      ws();if(raw[i]===end){i++;return out;}
      for(;;){
        ws();let key;
        if(!array){
          check(raw[i]==='"','INVALID_JSON','Object key expected.');key=string();
          check(!forbidden.has(key),'UNSAFE_KEY','Prototype keys are forbidden.');
          check(!seen.has(key),'DUPLICATE_KEY','Duplicate JSON key.');seen.add(key);
          ws();check(raw[i++]===':','INVALID_JSON','Expected colon.');
        }
        const value=read(depth+1);if(array)out.push(value);else out[key]=value;
        ws();const delimiter=raw[i++];if(delimiter===end)return out;
        check(delimiter===',','INVALID_JSON','Expected delimiter.');
      }
    }
    for(const [literal,value]of [['null',null],['true',true],['false',false]])
      if(raw.startsWith(literal,i)){i+=literal.length;return value;}
    const m=/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(raw.slice(i));
    check(m&&m[0].length<=128,'INVALID_JSON','Invalid/oversized number token.');i+=m[0].length;
    const value=Number(m[0]);
    if(exactNumbers)check(Number.isFinite(value)&&numberIdentity(m[0])===numberIdentity(String(value)),'NUMBER_LOSS','JSON number cannot be retained exactly as a canonical Number.');
    return value;
  };
  const value=read(0);ws();check(i===raw.length,'INVALID_JSON','Trailing JSON data.');return value;
}
export function copyBytes(input){
  let view;
  if(input instanceof ArrayBuffer)view=new Uint8Array(input);
  else if(ArrayBuffer.isView(input))view=new Uint8Array(input.buffer,input.byteOffset,input.byteLength);
  else fail('BYTES_REQUIRED','Expected ArrayBuffer or typed bytes.');
  check(view.byteLength<=LIMITS.asset,'ASSET_BUDGET','Single asset byte budget exceeded.');
  return view.slice();
}
export async function sha256(bytes){
  check(globalThis.crypto?.subtle,'WEBCRYPTO_UNAVAILABLE','Secure-context WebCrypto SHA-256 is required.');
  const view=typeof bytes==='string'?encoder.encode(bytes):bytes;
  const hash=await crypto.subtle.digest('SHA-256',view);
  return [...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
export const jsonHash=value=>sha256(canonicalJSON(value));
export function byteEqual(a,b){if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true;}
export function decodeUTF8(bytes){try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('INVALID_UTF8','Invalid UTF-8 metadata.');}}
export function validateAck(expected,actual){
  for(const key of ['transactionId','generation','stepId'])
    check(expected[key]===actual[key],'STALE_ACK','Ack belongs to another transaction/generation/step.',{key});
  if(expected.hash!==undefined)check(expected.hash===actual.hash,'STALE_ACK','Ack content hash mismatch.');
  check(actual.status==='ok','STEP_FAILED','Storage step was not acknowledged successfully.');
  return true;
}
