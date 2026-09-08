import {readFileSync,statSync,lstatSync,realpathSync,existsSync,mkdirSync,writeFileSync,openSync,closeSync,fstatSync} from 'node:fs';
import {resolve,sep,dirname} from 'node:path';
import {fail,parse,canonical,sha} from './core.mjs';
import {RECOVERY_LIMITS} from './recovery.mjs';
/** Private, data-root-contained operational inputs. No path comes from invoice JSON. */
export function privateRecoveryPath(data,raw) {
 const base=realpathSync(data),path=resolve(raw??'');
 fail(path.toLowerCase().startsWith((base+sep).toLowerCase()),400,'RECOVERY_PRIVATE_PATH_REQUIRED');
 for(let p=path;p!==dirname(p);p=dirname(p))if(existsSync(p))fail(!lstatSync(p).isSymbolicLink(),400,'RECOVERY_SYMLINK');
 return path;
}
function boundedRead(path,max){
 const fd=openSync(path,'r');
 try{const st=fstatSync(fd);fail(st.isFile()&&st.nlink===1&&st.size>0&&st.size<=max,413,'RECOVERY_FILE_LIMIT');const bytes=readFileSync(fd);fail(bytes.length===st.size&&bytes.length<=max,413,'RECOVERY_FILE_CHANGED');return bytes;}finally{closeSync(fd);}
}
export function readRecoveryBundle(data,bundlePath) {
 const file=privateRecoveryPath(data,bundlePath),base=privateRecoveryPath(data,resolve(data,'recovery/inbox'));
 fail(file.toLowerCase().startsWith((base+sep).toLowerCase()),400,'RECOVERY_INBOX_REQUIRED');
 const raw=boundedRead(file,RECOVERY_LIMITS.bundleBytes),bundle=parse(raw.toString('utf8'));
 fail(Array.isArray(bundle.evidence)&&bundle.evidence.length<=RECOVERY_LIMITS.evidenceFiles,413,'RECOVERY_RESOURCE_LIMIT');
 const evidence=new Map();let total=0;
 for(const item of bundle.evidence){
  fail(typeof item.sha256==='string'&&/^[a-f0-9]{64}$/.test(item.sha256),400,'RECOVERY_HASH');
  const bytes=boundedRead(privateRecoveryPath(data,resolve(base,'evidence',item.sha256)),RECOVERY_LIMITS.fileBytes);
  total+=bytes.length;fail(total<=RECOVERY_LIMITS.evidenceBytes,413,'RECOVERY_EVIDENCE_LIMIT');
  fail(sha(bytes)===item.sha256,400,'RECOVERY_EVIDENCE_HASH');evidence.set(item.sha256,bytes);
 }
 return {bundle,evidence};
}
export function writeRecoveryReport(data,name,report) {
 fail(/^[a-f0-9]{64}$/.test(name),400,'RECOVERY_HASH');
 const path=privateRecoveryPath(data,resolve(data,'recovery/reports',name+'.json'));mkdirSync(dirname(path),{recursive:true,mode:0o700});
 // Reports are deterministic private derivatives; evidence and plan rows are authoritative.
 if(existsSync(path)){const st=lstatSync(path);fail(st.isFile()&&st.nlink===1,400,'RECOVERY_REPORT_TARGET');}
 writeFileSync(path,canonical(report),{mode:0o600});
}
