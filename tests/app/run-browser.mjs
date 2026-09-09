import {readFile,readdir,realpath,mkdir,writeFile,appendFile} from 'node:fs/promises';
import {join,dirname,relative,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {setup} from '../server/helpers.mjs';
import {createBackend} from '../../src/server/app.mjs';
import {createServer as createHTTPS, get as httpsGet} from 'node:https';
import {parseArgs,loadContext,loadStage,ownPath,check,allocateBrowserProfile} from './runner-env.mjs';
const args=parseArgs(process.argv.slice(2),['run-id','browsers','cases']),runtime=dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const context=await loadContext(args['run-id'],{start:dirname(fileURLToPath(import.meta.url))}),{root,run}=context,stage=await loadStage(runtime,context);
const browsers=(args.browsers??'chromium,firefox,webkit').split(','),selectedCases=args.cases?.split(',')??null;
check(browsers.length>0&&new Set(browsers).size===browsers.length&&browsers.every(n=>['chromium','firefox','webkit'].includes(n)),'BROWSER_SELECTION');
check(!selectedCases||selectedCases.length>0&&new Set(selectedCases).size===selectedCases.length&&selectedCases.every(n=>/^[A-Za-z][A-Za-z0-9]*$/.test(n)),'CASE_SELECTION');
check(process.env.PLAYWRIGHT_BROWSERS_PATH===join(root,'.toolchain/playwright'),'BROWSER_BINARIES_SCOPE');
const tag=stage.stageId,resultPath=join(stage.evidenceDirectory,'browser-results.json'),after=[],stagedHashes=new Map(stage.files.map(f=>[f.path,f.sha256]));
await writeFile(resultPath,JSON.stringify({status:'starting',runId:context.runId,stageId:tag}),{flag:'wx'});
const f=await setup({after(fn){after.push(fn);}});
f.b.deviceId=f.a.deviceId;await f.b.login('member-b');f.provider.metadata.models[0].qualities=['test'];f.provider.metadata.models[0].sizes=['1x1'];f.provider.metadata.prices.currency='USD';
const tls=createHTTPS({pfx:await readFile(await ownPath(run,join(stage.temporaryDirectory,'test-tls.pfx'))),passphrase:'controller-test-only'});await new Promise(r=>tls.listen(0,'127.0.0.1',r));
const httpsOrigin='https://127.0.0.1:'+tls.address().port;await f.app.close();f.app=createBackend({...f.config,origin:httpsOrigin});await f.app.listen(0);
const content=new Map(),hashes={};
async function add(url,path){const full=await realpath(join(runtime,path));if(!full.startsWith(runtime+sep))throw Error('Whitelist escaped');const b=await readFile(full);const hash=createHash('sha256').update(b).digest('hex');check(stagedHashes.get(path)===hash,'STAGED_MODULE_CHANGED');content.set(url,b);hashes[path]=hash;}
// src/contracts (product-material extension) and src/printing/src (profile validator) are imported by src/app.
for(const dir of ['src/app','src/domain','src/storage','src/editing','src/contracts','src/printing/src'])for(const name of await readdir(join(runtime,dir)))if(name.endsWith('.mjs'))await add('/'+dir+'/'+name,dir+'/'+name);
for(const file of ['harness.html','browser-cases.mjs','test-doubles.mjs','online-policy.browser.mjs','source-approval.fixtures.mjs','source-alignment.browser.mjs','ui-contract.browser.mjs','source-adoption.browser.mjs','source-adoption.cases.mjs'])await add('/tests/app/'+file,'tests/app/'+file);
await add('/src/core/png-encode.mjs','src/core/png-encode.mjs');
await add('/src/viewport/arch-view.mjs','src/viewport/arch-view.mjs');await add('/src/viewport/three-viewport.mjs','src/viewport/three-viewport.mjs');
for(const n of ['three.module.js','three.core.js','OrbitControls.js'])await add('/vendor/three/'+n,'vendor/three/'+n);
const importMapHash=createHash('sha256').update('{"imports":{"three":"/vendor/three/three.module.js","three/addons/controls/OrbitControls.js":"/vendor/three/OrbitControls.js"}}').digest('base64');
const [handler]=f.app.server.listeners('request');f.app.server.removeListener('request',handler);
tls.on('request',(req,res)=>{
 if(content.has(req.url)&&req.method==='GET'&&req.headers.host===new URL(f.app.origin).host){
  res.writeHead(200,{'Content-Type':req.url.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8','Cache-Control':'no-store','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; script-src 'self' 'sha256-"+importMapHash+"'; style-src 'unsafe-inline'; connect-src 'self'; img-src blob:; worker-src 'self'; base-uri 'none'; frame-ancestors 'none'"});res.end(content.get(req.url));
 }else handler(req,res);
});
const report={version:2,runId:context.runId,stageId:stage.stageId,scope:selectedCases?'selected':'full',selectedCases,browserSelection:browsers,tag,originPrivate:true,realBackend:true,httpsLoopback:true,untrustedSelfSignedTestCertificate:true,realIDB:true,realOPFS:true,analyticalKernelTestDouble:true,physicalCrashProof:false,hashes,whitelist:[...content.keys()],capabilityOutcomes:[],browsers:[],results:[]};
async function record(r){report.results.push(r);if(r.evidence?.capability)report.capabilityOutcomes.push({browser:r.browser,...r.evidence.capability});if(r.name==='completeSvgFlow'&&r.evidence){const e=r.evidence;report.capabilityOutcomes.push({browser:r.browser,id:'storage.opfs',status:e.storageCapabilities.opfs.status==='supported'?'supported':'unavailable',details:e.storageCapabilities.opfs},{browser:r.browser,id:'lease.ed25519',status:e.leaseCapability.signature==='verified'?'supported':'unavailable',details:e.leaseCapability});}await writeFile(resultPath,JSON.stringify(report,null,2));console.log(r.browser+' '+r.name+': '+r.status+(r.error?' '+r.error.message:''));}
try{
 for(const path of ['/AGENTS.md','/.git/config','/tmp/','/src/server/app.mjs','/tests/server/helpers.mjs'])if(await new Promise((resolve,reject)=>{httpsGet(f.app.origin+path,{rejectUnauthorized:false},r=>{r.resume();resolve(r.statusCode===200);}).on('error',reject);}))throw Error('Forbidden harness path');
 const pw=await import(pathToFileURL(join(root,'.toolchain/app-runtime/node_modules/playwright/index.mjs')));
 for(const name of browsers){
  const privateDir=await ownPath(run,join(stage.temporaryDirectory,'browser-'+name));for(const p of ['downloads','appdata','localappdata','home','tmp'])await mkdir(join(privateDir,p),{recursive:true});
  let context;
  const profile=await allocateBrowserProfile({run},stage,name,httpsOrigin);
  try{
   const env={...process.env,TEMP:join(privateDir,'tmp'),TMP:join(privateDir,'tmp'),TMPDIR:join(privateDir,'tmp'),APPDATA:join(privateDir,'appdata'),LOCALAPPDATA:join(privateDir,'localappdata'),USERPROFILE:join(privateDir,'home'),HOME:join(privateDir,'home')};
   context=await pw[name].launchPersistentContext(profile.path,{headless:true,ignoreHTTPSErrors:true,downloadsPath:join(privateDir,'downloads'),env,...(name==='chromium'?{args:['--disable-crash-reporter','--disable-breakpad','--disable-background-networking']}:{}),...(name==='firefox'?{firefoxUserPrefs:{'toolkit.telemetry.enabled':false,'datareporting.healthreport.uploadEnabled':false}}:{})});
   await context.route('**/*',route=>route.request().url().startsWith(f.app.origin+'/')?route.continue():route.abort('blockedbyclient'));
   await context.addCookies([...f.a.cookies].map(([name,value])=>({name,value,domain:'127.0.0.1',path:'/',secure:true,httpOnly:true,sameSite:'Lax'})));
   const page=await context.newPage(),errors=[];
   await page.exposeFunction('__testSessionIdentity',async which=>{check(['a','b','none'].includes(which),'TEST_IDENTITY');await context.clearCookies();if(which==='none')return;await context.addCookies([...f[which].cookies].map(([name,value])=>({name,value,domain:'127.0.0.1',path:'/',secure:true,httpOnly:true,sameSite:'Lax'})));});page.on('pageerror',e=>errors.push(e.message));await page.goto(f.app.origin+'/tests/app/harness.html');await page.waitForFunction(()=>globalThis.testAPI?.ready,undefined,{timeout:30000});
   report.browsers.push({name,version:context.browser().version(),profile,errors});
   const names=await page.evaluate(()=>testAPI.caseNames);check(!selectedCases||selectedCases.every(n=>names.includes(n)),'UNKNOWN_CASE_SELECTION');
   for(const testName of names){
    if(selectedCases&&!selectedCases.includes(testName))continue;
    if(testName==='expiryRescueAndWrongUser'){
     const second=await context.newPage();await second.goto(f.app.origin+'/tests/app/harness.html');await second.waitForFunction(()=>testAPI.ready);
     try{
      const id=await page.evaluate(async()=>{globalThis.casC=(await testAPI.fixture({casOnly:true})).controller;return casC.projectId;});
      await second.evaluate(async id=>{globalThis.casC=(await testAPI.fixture({casOnly:true})).controller;testAPI.ok(await casC.dispatch({type:'project.open',id}));},id);
      const outcomes=await Promise.all([page.evaluate(()=>casC.dispatch({type:'parameter.set',id:'size',value:'72'})),second.evaluate(()=>casC.dispatch({type:'parameter.set',id:'size',value:'73'}))]);
      const successes=outcomes.filter(r=>r.ok),loser=outcomes.find(r=>!r.ok);
      if(successes.length!==1||loser?.diagnostic.code!=='CONFLICT')throw Error('Two tabs did not preserve one CAS winner and one conflict: '+JSON.stringify(outcomes));
      await record({browser:name,name:'twoTabsCAS',status:'pass',evidence:{outcomes}});
     }catch(e){await record({browser:name,name:'twoTabsCAS',status:'fail',error:{message:e.message}});}
     finally{await second.evaluate(()=>globalThis.casC?.dispose()).catch(()=>{});await page.evaluate(()=>globalThis.casC?.dispose());await second.close();}
    }
    const timeoutMs=['adoptionInitialProvenanceSourceConversion','adoptionInitialProvenanceRasterPreparation'].includes(testName)?480000:360000;
    const began=Date.now(),tested=await page.evaluate(({n,timeoutMs})=>Promise.race([testAPI.run(n),new Promise((_,reject)=>setTimeout(()=>reject(Error('CASE_TIMEOUT')),timeoutMs))]),{n:testName,timeoutMs});
    tested.durationMs=Date.now()-began;tested.timeoutMs=timeoutMs;
    await record({browser:name,...tested});
   }
  }catch(e){await record({browser:name,name:'session',status:'fail',error:{message:e.message,stack:e.stack}});}
  finally{await context?.close();}
 }
}finally{tls.closeIdleConnections();await new Promise(r=>tls.close(r));for(const fn of after.reverse())await fn();}
report.summary={pass:report.results.filter(r=>r.status==='pass').length,fail:report.results.filter(r=>r.status==='fail').length,unavailable:report.capabilityOutcomes.filter(r=>r.status==='unavailable').length};await writeFile(resultPath,JSON.stringify(report,null,2));
console.log(JSON.stringify(report.summary));process.exitCode=report.summary.fail||!report.summary.pass?1:0;