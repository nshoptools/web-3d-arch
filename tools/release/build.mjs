import {resolve,dirname,basename} from 'node:path';
import {mkdirSync,writeFileSync,existsSync,renameSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {setImmediate as yieldTurn} from 'node:timers/promises';
import {planRelease} from './plan.mjs';
import {verifyRelease} from './verify.mjs';
import {outputPath,plainPath,readPlain,need,hash} from './core.mjs';
/** Immutable publication: every source checked before staging and again while copying. */
export async function buildRelease(inputPath,destination){
 const output=outputPath(destination,{artifact:true});
 need(!existsSync(output),'OUTPUT_EXISTS');
 const plan=await planRelease(inputPath); // Failure here writes nothing.
 mkdirSync(dirname(output),{recursive:true});plainPath(dirname(output));
 const lock=output+'.publish-lock';let fd;
 try{
  fd=openSync(lock,'wx',0o600);writeFileSync(fd,String(process.pid));
  need(!existsSync(output),'OUTPUT_EXISTS');
  const stage=resolve(dirname(output),basename(output)+'.staging-'+randomUUID());
  mkdirSync(stage);
  let n=0;
  for(const r of plan.files){
   let b;try{b=r.source?readPlain(r.source,r.bytes):r.generated;}catch{need(false,'SOURCE_CHANGED_BEFORE_PUBLICATION');}
   need(b.length===r.bytes&&hash(b)===r.sha256,'SOURCE_CHANGED_BEFORE_PUBLICATION');
   const path=resolve(stage,r.path);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,b,{flag:'wx',mode:0o600});
   if(++n%64===0)await yieldTurn();
  }
  writeFileSync(resolve(stage,'release-manifest.json'),plan.manifestBytes,{flag:'wx',mode:0o600});
  const digest=hash(plan.manifestBytes),checked=verifyRelease(stage,digest);
  need(!existsSync(output),'OUTPUT_EXISTS');
  renameSync(stage,output);
  const {manifest,...summary}=checked;return {...summary,status:'packaged',published:true};
 }finally{if(fd!==undefined){closeSync(fd);unlinkSync(lock);}}
}
