import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';
import {syntheticChromiumTLSOptions} from './support/synthetic-tls.mjs';
import {scopedHTTPS} from './support/scoped-https.mjs';
import {hash,json,put} from './stage.mjs';
const route=url=>{try{const u=new URL(url);return {path:u.pathname,origin:u.origin,queryPresent:!!u.search};}catch{return {invalid:true};}};
export async function runtime(stage,label){
 const root=process.env.PROJECT_ROOT,run=process.env.PROJECT_REVIEW_RUN,started=performance.now(),timings=[],network=[],issues=[],workers=[],cleanup=[];
 const phase=name=>{const p={name,ms:performance.now()-started};timings.push(p);console.log(JSON.stringify({startup:p}));};
 const dir=join(run,'evidence',label);await mkdir(dir);
 assert.equal(hash(await readFile(stage.manifestPath)),stage.manifestSHA256);
 process.env.ACCEPTANCE_RELEASE_ROOT=stage.source;
 const {setup}=await import('./support/synthetic-identity.mjs'),f=await setup({after:fn=>cleanup.push(fn)},{realtime:true});
 phase('actual-http-sqlite-local-signed-idp-ready');
 const redact=value=>{let s=String(value);for(const v of f.secrets)if(v)s=s.split(v).join('[REDACTED]');return s.replace(/https?:\/\/[^\s"'<>]+/g,u=>{const p=route(u);return (p.origin??'')+(p.path??'')+(p.queryPresent?'?[REDACTED]':'');}).slice(0,16000);};
 let context,host;
 try{
  const {createBackend}=await import(pathToFileURL(join(stage.source,'src/server/app.mjs')).href);
  const {createHost}=await import(pathToFileURL(join(stage.source,'src/host/server.mjs')).href);
  const reservation=createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
  const origin='https://127.0.0.1:'+port;
  await f.app.close();f.app=createBackend({...f.config,origin});const back=await f.app.listen(0);
  const tls=join(run,'temp/tls'),cert=join(tls,'synthetic-cert.pem');
  phase('before-allowlisted-host');
  host=createHost({schemaVersion:1,origin,bindAddress:'127.0.0.1',port,backendPort:back.port,webroot:stage.webroot,
   manifestPath:stage.manifestPath,tlsKeyPath:join(tls,'synthetic-key.pem'),tlsCertPath:cert,hstsSeconds:0},{logger:()=>{}});
  host.server.on('request',(req,res)=>{const p=route(origin+req.url);res.once('finish',()=>network.push({via:'host',method:req.method,...p,status:res.statusCode}));});
  await host.listen();f.transportOrigin=origin;f.transportFetch=scopedHTTPS(origin,await readFile(cert));
  phase('allowlisted-host-ready');
  const require=createRequire(join(root,'.toolchain/app-runtime/package.json')),{chromium}=require('playwright');
  const profile=join(run,'p','c'+randomUUID().slice(0,7));await mkdir(profile,{recursive:true});
  context=await chromium.launchPersistentContext(profile,{headless:false,viewport:{width:1280,height:900},acceptDownloads:true,downloadsPath:join(dir,'downloads'),...syntheticChromiumTLSOptions(cert)});
  context.setDefaultTimeout(10000);phase('chromium-launched');
  await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===origin&&['https:','blob:'].includes(u.protocol))return r.continue();network.push({via:'blocked-external',...route(u.href)});return r.abort();});
  await context.addInitScript(({origin,deviceId})=>{
   if(location.origin===origin&&!localStorage.getItem('arch-device-v1'))localStorage.setItem('arch-device-v1',deviceId);
   globalThis.csgCSP=[];document.addEventListener('securitypolicyviolation',e=>csgCSP.push({directive:e.effectiveDirective,blockedURI:e.blockedURI,source:e.sourceFile,line:e.lineNumber}));
  },{origin,deviceId:f.a.deviceId});
  await context.addCookies([...f.a.cookies].map(([name,value])=>({name,value,domain:'127.0.0.1',path:'/',secure:true,httpOnly:true,sameSite:'Lax'})));
  const page=await context.newPage();phase('explicit-page-created');
  page.on('pageerror',e=>issues.push({type:'pageerror',message:redact(e.stack??e)}));
  page.on('console',e=>{if(e.type()==='error')issues.push({type:'console',message:redact(e.text())});});
  page.on('worker',w=>{const r={...route(w.url()),started:performance.now()-started};workers.push(r);w.on('close',()=>r.closed=performance.now()-started);});
  context.on('requestfailed',r=>network.push({via:'failed',...route(r.url()),type:r.resourceType(),failure:r.failure()}));
  const capture=async name=>{
   await put(join(dir,name+'.dom.txt'),redact(await page.locator('body').innerText()));
   await page.screenshot({path:join(dir,name+'.png'),fullPage:true,timeout:15000});
   await put(join(dir,name+'.browser.json'),json(await page.evaluate(()=>({crossOriginIsolated,isSecureContext,csp:globalThis.csgCSP,boot:globalThis.csgAcceptanceBootError??null,snapshot:globalThis.csgAcceptance?.snapshot()}))));
  };
  let closed=false;
  return {f,page,context,origin,dir,issues,network,workers,stage,timings,phase,capture,redact,
   async close(){
    if(closed)return;closed=true;
    await put(join(dir,'runtime.json'),json({origin,profile,profileLength:profile.length,browser:context.browser().version(),stage,
     timings,issues,workers,network,memory:process.memoryUsage(),resourceUsage:process.resourceUsage(),
     identity:'real backend/SQLite with explicit local signed OIDC fixture; not production OIDC',providerCalls:f.provider.calls.length}));
    try{await context.close();}finally{try{await host.close();}finally{for(const fn of cleanup.reverse())await fn();}}
    await put(join(dir,'cleanup.json'),json({browserClosed:true,hostClosed:true,backendClosed:true,identityClosed:true,oldPreviewUntouched:true,privateFilesRetained:true}));
   }};
 }catch(e){await context?.close().catch(()=>{});await host?.close().catch(()=>{});for(const fn of cleanup.reverse())await fn().catch(()=>{});await put(join(dir,'startup-failure.json'),json({timings,issues,error:redact(e.stack??e)}));throw e;}
}

