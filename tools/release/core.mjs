import {resolve,dirname,relative,sep,isAbsolute} from 'node:path';
import {existsSync,lstatSync,mkdirSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {readPlain,plainPath,inside,exact,need} from '../../src/host/core.mjs';
export {readPlain,plainPath,inside,exact,need};
export const NODE='24.19.0';
export const LIMITS=Object.freeze({assetBytes:64*1024*1024,publicBytes:512*1024*1024,inputBytes:32*1024*1024,
 files:65536,packageBytes:768*1024*1024,scriptBytes:32*1024*1024});
export const hash=b=>createHash('sha256').update(b).digest('hex');
export const order=(a,b)=>a<b?-1:a>b?1:0;
export const sorted=(xs,key)=>[...xs].sort((a,b)=>order(key(a),key(b)));
export function canonical(v){
 if(v===null||typeof v==='boolean'||typeof v==='string')return JSON.stringify(v);
 if(typeof v==='number'){need(Number.isFinite(v),'JSON_NUMBER');return JSON.stringify(v);}
 if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
 need(v&&typeof v==='object','JSON_VALUE');
 return '{'+Object.keys(v).sort(order).map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
}
export const jsonBytes=v=>Buffer.from(canonical(v)+'\n');
export function sha(v){need(typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),'HASH_INVALID');return v;}
export function count(v,max=LIMITS.assetBytes){need(Number.isSafeInteger(v)&&v>0&&v<=max,'BYTES_LIMIT');return v;}
export function portable(v){
 need(typeof v==='string'&&v.length<=2048&&!isAbsolute(v)&&!v.includes('\\')&&/^[A-Za-z0-9_./-]+$/.test(v),'RELATIVE_PATH_REQUIRED');
 need(v.split('/').every(x=>x&&x!=='.'&&x!=='..'&&!x.startsWith('.')&&!x.endsWith('.')&&!/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(x)),'PATH_REJECTED');
 return v;
}
export function resolveInput(root,name){portable(name);const p=resolve(plainPath(root),name);need(inside(root,p),'INPUT_ESCAPE');return plainPath(p);}
export function pinned(root,ref,max=LIMITS.assetBytes){
 exact(ref,['file','sha256','bytes']);sha(ref.sha256);count(ref.bytes,max);
 const file=root?resolveInput(root,ref.file):plainPath(ref.file);need(inside(environment().root,file),'INPUT_OUTSIDE_REPOSITORY');const b=readPlain(file,max);
 need(b.length===ref.bytes&&hash(b)===ref.sha256,'INPUT_INTEGRITY');return {bytes:b,path:file};
}
export function parse(bytes){try{return JSON.parse(bytes.toString('utf8'));}catch{need(false,'JSON_INVALID');}}
export function checkedJson(path,max=LIMITS.inputBytes){return parse(readPlain(path,max));}
export function environment(){
 need(process.versions.node===NODE,'NODE_24_19_REQUIRED');
 const root=plainPath(process.env.PROJECT_ROOT),run=plainPath(process.env.PROJECT_REVIEW_RUN);
 need(inside(root,run)&&run!==root,'PROJECT_ENV_REQUIRED');
 return {root,run};
}
export function outputPath(raw,{artifact=false}={}){
 const {root,run}=environment();need(typeof raw==='string'&&isAbsolute(raw),'ABSOLUTE_PATH_REQUIRED');
 const target=resolve(raw),rel=relative(run,target).split(sep);
 const own=inside(run,target)&&rel.length>=2&&['inputs','work','evidence','reports','cache','temp'].includes(rel[0]);
 const released=artifact&&dirname(target)===resolve(root,'report/release')&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(target.split(sep).at(-1));
 need(own||released,'OUTPUT_OUTSIDE_RUN');
 for(let a=target;;a=dirname(a)){if(existsSync(a))plainPath(a);if(dirname(a)===a)break;}
 return target;
}
export function freshFile(path,bytes){outputPath(path);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,bytes,{flag:'wx',mode:0o600});}
export function relativeFiles(root,max=LIMITS.files+512){
 const out=[];function walk(dir){
  for(const item of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>order(a.name,b.name))){
   const path=resolve(dir,item.name);plainPath(path);need(!item.isSymbolicLink(),'SYMLINK_REJECTED');
   if(item.isDirectory())walk(path);else {need(item.isFile()&&lstatSync(path).nlink===1,'FILE_REJECTED');out.push(relative(root,path).split(sep).join('/'));need(out.length<=max,'PACKAGE_FILES_LIMIT');}
  }
 }walk(plainPath(root));return out;
}
export function safeCode(e){return typeof e?.code==='string'&&/^[A-Z][A-Z0-9_]{2,79}$/.test(e.code)?e.code:'RELEASE_FAILED';}
