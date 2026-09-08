import {resolve,dirname} from 'node:path';
import {existsSync,renameSync,mkdirSync,openSync,writeFileSync,closeSync,unlinkSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {VERSION,LIMITS,parse,readPlain,pin,checked,hash,jsonBytes,put,inputRoot,newDirectory,need,canonical,walk,rel,assertTable,filePin,outputPath,environment,safeCode,plainPath} from './core.mjs';
import {validateInput,capture,unchanged} from './snapshot.mjs';
import {writeEngine,deriveWrapper} from './engine.mjs';
import {inspectFrontend} from './frontend.mjs';
const codeRoot=fileURLToPath(new URL('./',import.meta.url));
export const BUILDER_FILES=Object.freeze(['core.mjs','snapshot.mjs','engine.mjs','engine-build.mjs','compile.mjs','frontend.mjs','build.mjs','cli.mjs','pin-input.mjs','run.ps1']);
function childEnv(){
 const env={};for(const k of ['SystemRoot','SYSTEMROOT','WINDIR','windir','COMSPEC','ComSpec','PATHEXT','PATH','Path','TEMP','TMP','TMPDIR','PROJECT_ROOT','PROJECT_REVIEW_RUN','XDG_CACHE_HOME','XDG_CONFIG_HOME','XDG_DATA_HOME','XDG_STATE_HOME'])if(process.env[k]!==undefined)env[k]=process.env[k];
 return {...env,NODE_ENV:'production',NODE_OPTIONS:'',NODE_PATH:'',CI:'1',NO_COLOR:'1',npm_config_update_notifier:'false'};
}
async function compile(spec,out){
 return await new Promise((yes,no)=>{
  const child=spawn(process.execPath,['--max-old-space-size=1536',resolve(codeRoot,'compile.mjs'),spec],{cwd:out,env:childEnv(),windowsHide:true,stdio:['ignore','pipe','pipe']});
  const chunks=[];let total=0,timed=false;
  const collect=b=>{total+=b.length;if(total>1024*1024){timed=true;child.kill();}else chunks.push(b);};child.stdout.on('data',collect);child.stderr.on('data',collect);
  const timer=setTimeout(()=>{timed=true;child.kill();},LIMITS.compileMs);
  child.once('error',e=>{clearTimeout(timer);no(e);});
  child.once('close',code=>{clearTimeout(timer);put(resolve(out,'compiler.log'),Buffer.concat(chunks));try{need(!timed,'COMPILER_DEADLINE');need(code===0,'COMPILER_FAILED');yes();}catch(e){no(e);}});
 });
}
export async function prepareApplication(inputPath,rawOutput){
 const out=newDirectory(rawOutput),inputBytes=readPlain(pin(inputPath).file,4*1024*1024),input=validateInput(parse(inputBytes));
 // Validation above is read-only. Refuse arbitrary destinations before any compiler process.
 const builder=BUILDER_FILES.map(f=>pin(resolve(codeRoot,f)));
 let snapshot;
 try{
  put(resolve(out,'application-input.json'),inputBytes);
  const captured=capture(input,out);snapshot=captured.snapshot;
  put(resolve(out,'inputs/builder-pins.json'),jsonBytes(builder));
  const spec={version:VERSION,source:captured.source,appToolchainRoot:input.appToolchainRoot,printingToolchainRoot:input.printingToolchainRoot,
   frontend:resolve(out,'frontend'),cache:resolve(out,'cache/vite'),result:resolve(out,'compiler-graph.json')};
  put(resolve(out,'compiler-input.json'),jsonBytes(spec));
  await compile(resolve(out,'compiler-input.json'),out);
  const engine=writeEngine(snapshot.engineOwned,spec.frontend);put(resolve(out,'engine-derivation.json'),jsonBytes(engine));
  const graph=parse(readPlain(spec.result,16*1024*1024));
  assertTable(graph.loaded,'COMPILER_INPUT_CHANGED');assertTable(builder,'BUILDER_CHANGED');unchanged(snapshot);
  const inspection=inspectFrontend(spec.frontend,graph,engine,captured.licenses.map(l=>l.id));
  put(resolve(out,'frontend-receipt.json'),jsonBytes(inspection.receipt));
  const releaseInput={version:'arch-release-input/1',frontendRoot:spec.frontend,frontend:inspection.frontend,
   engine:{moduleUrl:'/'+engine.moduleName,wasmUrl:'/'+engine.wasmName,binaryRequest:engine.wasmName,abi:2,semantics:3,source:2},
   library:input.library,runtimeRoot:captured.source,runtimeLock:pin(resolve(out,'runtime-lock.json')),licenses:captured.licenses};
  put(resolve(out,'package-input.json'),jsonBytes(releaseInput));
  // Use exactly the captured main release tool/runtime bytes, not a later live tool version.
  const {planRelease}=await import(pathToFileURL(resolve(captured.source,'tools/release/plan.mjs')).href);
  const plan=await planRelease(resolve(out,'package-input.json'));
  unchanged(snapshot);assertTable(builder,'BUILDER_CHANGED');
  put(resolve(out,'release-plan.json'),plan.manifestBytes);
  put(resolve(out,'input-stability.json'),jsonBytes({version:VERSION,sourceUnchanged:true,toolchainsUnchanged:true,originalPairUnchanged:true,sourceFiles:snapshot.source.length,
   capturedBeforeCompile:true,checkedAfterCompileAndPlan:true,privateLicenseRef:input.privateLicenseRef,applicationQualification:'parent-required',runtimeProof:'parent-required'}));
  const files=walk(out,{maxFiles:24000}).map(p=>({...pin(p),file:rel(out,p)}));
  const receipt={version:VERSION,status:'prepared',inputSHA256:hash(inputBytes),sourceSnapshotSHA256:pin(resolve(out,'inputs/snapshot.json')).sha256,
   engine,engineBuild:snapshot.engineBuild,frontend:inspection.receipt,releasePlanSHA256:hash(plan.manifestBytes),publicBuildId:plan.manifest.buildId,publicAssets:plan.publicManifest.assets.length,publicBytes:plan.manifest.publicBytes,
   databaseSchema:5,applicationQualification:'parent-required',runtimeProof:'parent-required',files};
  put(resolve(out,'prepared.json'),jsonBytes(receipt));
  return {version:VERSION,status:'prepared',sha256:hash(jsonBytes(receipt)),publicBuildId:receipt.publicBuildId,publicAssets:receipt.publicAssets,publicBytes:receipt.publicBytes,frontendFiles:inspection.receipt.files,sourceUnchanged:true,runtimeProof:'parent-required'};
 }catch(e){
  if(existsSync(out)&&!existsSync(resolve(out,'failure.json'))){
   let sourceUnchanged=null;if(snapshot){try{unchanged(snapshot);sourceUnchanged=true;}catch{sourceUnchanged=false;}}
   put(resolve(out,'failure.json'),jsonBytes({version:VERSION,status:'failed',code:safeCode(e),sourceUnchanged,published:false}));
  }
  throw e;
 }
}
export function verifyApplication(rawOutput,expectedSHA256){
 const out=inputRoot(rawOutput),bytes=checked({file:resolve(out,'prepared.json'),...pin(resolve(out,'prepared.json')),sha256:expectedSHA256}),receipt=parse(bytes);
 need(receipt.version===VERSION&&receipt.status==='prepared','PREPARED_VERSION');
 const names=walk(out,{maxFiles:24000}).map(p=>rel(out,p)).sort();
 need(canonical(names)===canonical([...receipt.files.map(r=>r.file),'prepared.json'].sort()),'PREPARED_FILE_SET');
 for(const r of receipt.files)checked({...r,file:resolve(out,r.file)});
 const snapshot=parse(readPlain(resolve(out,'inputs/snapshot.json'),16*1024*1024)),builder=parse(readPlain(resolve(out,'inputs/builder-pins.json'),1048576));
 need(hash(readPlain(resolve(out,'inputs/snapshot.json'),16*1024*1024))===receipt.sourceSnapshotSHA256,'SNAPSHOT_INTEGRITY');
 assertTable(builder,'BUILDER_CHANGED');unchanged(snapshot);
 const d=deriveWrapper(checked(snapshot.engineOwned.module),checked(snapshot.engineOwned.wasm));
 need(d.receipt.moduleSHA256===receipt.engine.moduleSHA256&&d.receipt.wasmSHA256===receipt.engine.wasmSHA256,'DERIVATION_INTEGRITY');
 need(hash(readPlain(resolve(out,'frontend',d.receipt.moduleName),16*1024*1024))===d.receipt.moduleSHA256,'DERIVATION_INTEGRITY');
 return {version:VERSION,status:'verified',sha256:expectedSHA256,receipt,snapshot};
}
export async function packageApplication(prepared,expectedSHA256,destination){
 const final=outputPath(destination,{artifact:true});need(!existsSync(final),'OUTPUT_EXISTS');
 const verified=verifyApplication(prepared,expectedSHA256);
 mkdirSync(dirname(final),{recursive:true});plainPath(dirname(final));let lock;
 const lockPath=final+'.application-lock',stage=resolve(environment().run,'temp','application-package-'+randomUUID());
 try{
  lock=openSync(lockPath,'wx',0o600);writeFileSync(lock,'application-package\n');need(!existsSync(final),'OUTPUT_EXISTS');
  const {buildRelease}=await import(pathToFileURL(resolve(prepared,'inputs/source/tools/release/build.mjs')).href);
  const result=await buildRelease(resolve(prepared,'package-input.json'),stage);
  // The release builder rechecks copied source bytes; this also protects the live main capture.
  verifyApplication(prepared,expectedSHA256);need(!existsSync(final),'OUTPUT_EXISTS');
  renameSync(stage,final);
  return {...result,version:VERSION,status:'packaged',preparedSHA256:expectedSHA256,runtimeProof:'parent-required',applicationQualification:'parent-required'};
 }finally{if(lock!==undefined){closeSync(lock);unlinkSync(lockPath);}}
}
