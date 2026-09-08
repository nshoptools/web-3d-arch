import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildRelease} from './build.mjs';
import {verifyRelease} from './verify.mjs';
import {pinRuntime} from './plan.mjs';
import {configureRelease} from './config.mjs';
import {need,jsonBytes,freshFile,hash,safeCode} from './core.mjs';
export async function main(args=process.argv.slice(2)){
 need(args.length===3,'ARGUMENTS_REQUIRED');const [action,a,b]=args;
 if(action==='pin-runtime'){
  const bytes=jsonBytes(pinRuntime(a));freshFile(resolve(b),bytes);return {status:'runtime-pinned',sha256:hash(bytes),bytes:bytes.length};
 }
 if(action==='build')return buildRelease(a,b);
 if(action==='verify'){const {manifest,...summary}=verifyRelease(a,b);return summary;}
 if(action==='configure')return configureRelease(a,b);
 need(false,'COMMAND_REQUIRED');
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
 try{console.log(JSON.stringify(await main()));}
 catch(e){console.error(JSON.stringify({error:safeCode(e)}));process.exitCode=1;}
}
