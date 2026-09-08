import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
export const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');
export const jsonBytes=v=>Buffer.from(JSON.stringify(v,null,2)+'\n');
export function safe(root,value,{exists=true}={}){
 root=fs.realpathSync(root);const full=path.resolve(value);if(full!==root&&!full.startsWith(root+path.sep))throw Error('Path escapes root: '+full);
 for(let p=full;p!==root;p=path.dirname(p))if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('Reparse path: '+p);
 if(exists){const real=fs.realpathSync(full);if(real!==root&&!real.startsWith(root+path.sep))throw Error('Resolved path escapes root');}
 return full;
}
export function environment(){
 if(!process.env.PROJECT_ROOT||!process.env.PROJECT_REVIEW_RUN)throw Error('Dot-source tools/development/env.ps1 with assigned seat/RunId');
 const root=fs.realpathSync(process.env.PROJECT_ROOT),run=safe(root,process.env.PROJECT_REVIEW_RUN);
 if(!/^tmp[\\/]reviews[\\/](codex|opus|grok)[\\/]runs[\\/][A-Za-z0-9_-]+$/.test(path.relative(root,run)))throw Error('Explicit own review run required');return {root,run};
}
export const readJSON=p=>JSON.parse(fs.readFileSync(p,'utf8'));
export function writeJSON(root,file,value){file=safe(root,file,{exists:false});fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,jsonBytes(value));}
export function cliArgs(allowed){const out={};for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i];if(!allowed.includes(key)||!process.argv[i+1]||Object.hasOwn(out,key))throw Error('Unknown/duplicate CLI argument '+key);out[key]=process.argv[i+1];}return out;}