import {resolve,dirname,relative,sep} from 'node:path';
import {mkdirSync,writeFileSync,existsSync,readdirSync,lstatSync} from 'node:fs';
import {environment,outputPath,plainPath,inside,readPlain,hash,jsonBytes,parse,need,exact,canonical,sha,portable} from '../release/core.mjs';
export {environment,outputPath,plainPath,inside,readPlain,hash,jsonBytes,parse,need,exact,canonical,sha,portable};
export const VERSION='arch-application-build/1';
export const LIMITS=Object.freeze({sourceFiles:1024,sourceBytes:64*1024*1024,fileBytes:64*1024*1024,frontendFiles:4096,frontendBytes:64*1024*1024,toolchainFiles:20000,toolchainBytes:1024*1024*1024,compileMs:180000});
export const rel=(root,path)=>relative(root,path).split(sep).join('/');
export function inputRoot(raw){const p=plainPath(raw);need(inside(environment().root,p),'INPUT_OUTSIDE_REPOSITORY');need(lstatSync(p).isDirectory(),'INPUT_DIRECTORY');return p;}
export function put(path,bytes){outputPath(path);mkdirSync(dirname(path),{recursive:true});plainPath(dirname(path));writeFileSync(path,bytes,{flag:'wx',mode:0o600});}
export function pin(file,max=LIMITS.fileBytes){need(inside(environment().root,plainPath(file)),'INPUT_OUTSIDE_REPOSITORY');const bytes=readPlain(file,max);return {file,bytes:bytes.length,sha256:hash(bytes)};}
export function checked(ref,max=LIMITS.fileBytes){exact(ref,['file','sha256','bytes']);sha(ref.sha256);need(Number.isSafeInteger(ref.bytes)&&ref.bytes>=0&&ref.bytes<=max,'INPUT_BYTES');const r=pin(ref.file,max);need(r.sha256===ref.sha256&&r.bytes===ref.bytes,'INPUT_INTEGRITY');return readPlain(ref.file,max);}
export function walk(root,{maxFiles=LIMITS.sourceFiles,accept=()=>true,descend=()=>true}={}){
 const files=[];function visit(dir){for(const d of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:1)){const p=resolve(dir,d.name);plainPath(p);need(!d.isSymbolicLink(),'SYMLINK_REJECTED');if(d.isDirectory()){if(descend(rel(root,p)))visit(p);}else if(accept(rel(root,p))){need(d.isFile()&&lstatSync(p).nlink===1,'FILE_REJECTED');files.push(p);need(files.length<=maxFiles,'FILE_COUNT_LIMIT');}}}visit(root);return files;
}
export function table(files,{maxBytes=LIMITS.sourceBytes,base=null}={}){let total=0;return files.map(file=>{const r=pin(file);total+=r.bytes;need(total<=maxBytes,'INPUT_TOTAL_BYTES');return {...r,...(base?{relative:rel(base,file)}:{})};});}
export function assertTable(rows,code='INPUT_CHANGED'){for(const r of rows){let current;try{current=pin(r.file);}catch{need(false,code);}need(current.sha256===r.sha256&&current.bytes===r.bytes,code);}}
export function safeCode(e){return typeof e?.code==='string'&&/^[A-Z][A-Z0-9_]{2,79}$/.test(e.code)?e.code:'APPLICATION_BUILD_FAILED';}
export function newDirectory(raw){const out=outputPath(raw);need(!existsSync(out),'OUTPUT_EXISTS');return out;}
export function filePin(record){return {file:record.file,bytes:record.bytes,sha256:record.sha256};}
export function sourceName(name){return !/(?:^|\/)(?:tests?|fixtures?|node_modules|target|tools|docs|pins|hooks|compat|scripts)(?:\/|$)/i.test(name)&&!/(?:^|[./_-])(?:credentials?|secrets?|user\.keys|\.env)(?:[./_-]|$)/i.test(name);}
