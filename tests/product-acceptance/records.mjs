import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {sha256} from './artifact.mjs';
export const verdicts=Object.freeze(['pass','fail','unverified','unsupported']);
export function suiteExit(records){if(!records.length)return 2;return records.some(r=>r.verdict==='fail')?1:records.some(r=>r.verdict!=='pass')?2:0;}
export function sanitizedRoute(value){
 try{const u=new URL(value);return {origin:u.origin,path:u.pathname,queryPresent:!!u.search,protocol:u.protocol};}catch{return {invalid:true};}
}
export function redactText(value,secrets=[]){let text=String(value);for(const s of secrets)if(s)text=text.split(s).join('[REDACTED]');return text.replace(/https?:\/\/[^\s"'<>]+/g,url=>{const r=sanitizedRoute(url);return r.invalid?'[URL]':r.origin+r.path+(r.queryPresent?'?[REDACTED]':'');}).slice(0,16384);}
export async function recordCase(root,record){
 assert.ok(verdicts.includes(record.verdict));assert.match(record.id,/^[A-Z0-9_-]+$/);assert.ok(['chromium','firefox','webkit','node-infrastructure'].includes(record.engine));
 assert.ok(Array.isArray(record.requirements)&&record.requirements.length>0&&Array.isArray(record.steps)&&record.steps.length>0);
 assert.ok(record.artifact?.preparedSHA256&&record.artifact?.manifestSHA256,'exact artifact pins');
 assert.ok(record.scope&&record.expected!==undefined&&record.actual!==undefined);
 if(record.verdict==='pass')assert.ok(record.evidence?.length>0,'pass requires actual evidence');
 const pinned=[];for(const e of record.evidence??[]){
  const path=resolve(root,e);const r=relative(resolve(root),path);assert.ok(r&&!r.startsWith('..')&&!isAbsolute(r));
  const b=await readFile(path);pinned.push({path:r.replaceAll('\\','/'),sha256:sha256(b),bytes:b.length});
 }
 await mkdir(join(root,'records'),{recursive:true});const file=join(root,'records',record.engine+'-'+record.id+'.json');
 const out={schema:'whole-product-acceptance-record/1',...record,evidence:pinned};
 await writeFile(file,JSON.stringify(out,null,2)+'\n',{flag:'wx'});return out;
}
export function featureVerdict({executed,capabilityAvailable,oraclePassed,refusalPolicyPassed}){
 // A correct refusal never becomes a successful product feature.
 if(!executed)return 'unverified';if(!capabilityAvailable)return 'unsupported';return oraclePassed?'pass':'fail';
}

