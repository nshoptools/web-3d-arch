import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:net';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {syntheticChromiumTLSOptions} from './synthetic-tls.mjs';
import {sanitizedRoute,redactText} from './records.mjs';
import {fileHash} from './artifact.mjs';
import {scopedHTTPS} from './scoped-https.mjs';
export async function runtime(input,engine,label,{headless=true}={}){
 const timingStart=performance.now(),timings=[];const phase=name=>{const entry={name,ms:performance.now()-timingStart};timings.push(entry);console.log(JSON.stringify({startup:entry}));};
 const run=process.env.PROJECT_REVIEW_RUN,root=process.env.PROJECT_ROOT;
 assert.ok(run&&root);const record=JSON.parse(await readFile(join(run,'inputs',input.id,'artifact-check.json')));
 assert.equal(record.releaseSHA256,input.releaseSHA256);assert.equal(record.preparedSHA256,input.preparedSHA256);
 assert.equal(await fileHash(join(input.releaseRoot,'release-manifest.json')),input.releaseSHA256);
 assert.equal(await fileHash(join(input.preparedRoot,'prepared.json')),input.preparedSHA256);
 process.env.ACCEPTANCE_RELEASE_ROOT=resolve(input.releaseRoot);
 const {setup}=await import('./synthetic-identity.mjs'),after=[];
 const f=await setup({after(fn){after.push(fn);}},{realtime:true});phase('signed-idp-three-accounts-sqlite-ready');
 let context,host;try{
 const {createBackend}=await import(pathToFileURL(join(input.releaseRoot,'src/server/app.mjs')).href);
 const {createHost}=await import(pathToFileURL(join(input.releaseRoot,'src/host/server.mjs')).href);
 const reservation=createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
 const origin='https://127.0.0.1:'+port;
 await f.app.close();f.app=createBackend({...f.config,origin});const backend=await f.app.listen(0);f.transportOrigin='http://127.0.0.1:'+backend.port;
 const dir=join(run,'evidence',label+'-'+engine);await mkdir(dir);
 const net=[],issues=[],workers=[],routePins=[];const assets=JSON.parse(await readFile(record.manifestPath)).assets;const byURL=new Map(assets.map(a=>[a.url,a]));
 phase('before-host-create');
 host=createHost({schemaVersion:1,origin,bindAddress:'127.0.0.1',port,backendPort:backend.port,webroot:record.webroot,manifestPath:record.manifestPath,
  tlsKeyPath:join(run,'temp/tls/synthetic-key.pem'),tlsCertPath:join(run,'temp/tls/synthetic-cert.pem'),hstsSeconds:0},{logger:entry=>{}});
 phase('after-host-create');
 host.server.on('request',(req,res)=>{const r=sanitizedRoute(origin+req.url);res.once('finish',()=>net.push({via:'host',method:req.method,path:r.path,queryPresent:r.queryPresent,status:res.statusCode}));});
 await host.listen();phase('host-listen');
 f.transportOrigin=origin;f.transportFetch=scopedHTTPS(origin,await readFile(join(run,'temp/tls/synthetic-cert.pem')));
 const require=createRequire(join(root,'.toolchain/app-runtime/package.json'));const pw=require('playwright');
 const profile=join(run,'p',engine[0]+randomUUID().slice(0,7));await mkdir(profile,{recursive:true});
 const opts={headless,ignoreHTTPSErrors:true,viewport:{width:1280,height:900},acceptDownloads:true,downloadsPath:join(dir,'downloads'),
  ...(engine==='chromium'?syntheticChromiumTLSOptions(join(run,'temp/tls/synthetic-cert.pem')):{}),
  ...(engine==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})};
 context=await pw[engine].launchPersistentContext(profile,opts);context.setDefaultTimeout(10000);phase('browser-launched');
 await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===origin&&['https:','blob:'].includes(u.protocol))return r.continue();net.push({via:'blocked-external',...sanitizedRoute(u.href)});return r.abort();});
 await context.addInitScript(({origin,deviceId})=>{
  if(location.origin===origin&&!localStorage.getItem('arch-device-v1'))localStorage.setItem('arch-device-v1',deviceId);
  globalThis.acceptanceObservation={csp:[],styles:[]};
  document.addEventListener('securitypolicyviolation',e=>acceptanceObservation.csp.push({directive:e.effectiveDirective,blockedURI:e.blockedURI,line:e.lineNumber,source:e.sourceFile}));
  new MutationObserver(rs=>{for(const r of rs)for(const n of r.addedNodes)if(n.nodeName==='STYLE')acceptanceObservation.styles.push(n.textContent?.slice(0,500));}).observe(document,{childList:true,subtree:true});
 },{origin,deviceId:f.a.deviceId});
 await context.addCookies([...f.a.cookies].map(([name,value])=>({name,value,domain:'127.0.0.1',path:'/',secure:true,httpOnly:true,sameSite:'Lax'})));
 const page=await context.newPage();phase('explicit-tab-created');
 // Retain the unused initial about:blank until context shutdown. Closing that
 // initial Firefox tab stalled startup in the controlled follow-up; it loads no app.
 page.on('worker',w=>{const entry={url:sanitizedRoute(w.url()),createdAt:Date.now()};workers.push(entry);w.on('close',()=>{entry.closedAt=Date.now();});});
 page.on('pageerror',e=>issues.push({kind:'pageerror',message:redactText(e.message,f.secrets)}));
 page.on('console',m=>{if(m.type()==='error')issues.push({kind:'console',message:redactText(m.text(),f.secrets)});});
 context.on('requestfailed',r=>net.push({via:'browser',...sanitizedRoute(r.url()),type:r.resourceType(),failure:r.failure()}));
 context.on('response',r=>{const u=new URL(r.url()),a=byURL.get(u.pathname);if(a)routePins.push({path:u.pathname,status:r.status(),sha256:a.sha256,bytes:a.bytes});});
 page.on('request',req=>{if(req.isNavigationRequest())net.push({via:'navigation-request',...sanitizedRoute(req.url())});});
 const capture=async(name)=>{
  await writeFile(join(dir,name+'-ui.txt'),redactText(await page.locator('body').innerText(),f.secrets));
  const before=await page.evaluate(()=>({observation:globalThis.acceptanceObservation,viewport:{width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight},step:document.querySelector('[data-step-chip][aria-current="step"]')?.dataset.stepChip,readouts:document.querySelector('#w3a-stage-readouts')?.innerText,exports:Array.from(document.querySelectorAll('[data-export-option]')).map(e=>({...e.dataset,text:e.innerText}))}));
  await page.screenshot({path:join(dir,name+'.png'),fullPage:true,timeout:15000}).catch(e=>issues.push({kind:'capture',message:redactText(e.message,f.secrets)}));
  const afterCapture=await page.evaluate(()=>globalThis.acceptanceObservation);
  await writeFile(join(dir,name+'-dom.json'),JSON.stringify({before,afterCapture},null,2));
  return before;
 };
 const captureDiagnostics=async(name)=>{
  if(await page.getByRole('dialog').count())return {notOpened:'pending modal retained'};
  const button=page.getByRole('button',{name:'Mở nhật ký',exact:true}).first();if(!await button.count())return {notOpened:'no diagnostic action'};
  await button.click();await page.getByRole('dialog').waitFor({timeout:10000});await capture(name+'-diagnostics');await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden',timeout:10000});return {opened:true};
 };
 let closed=false;
 return {f,page,context,host,origin,dir,issues,workers,net,profile,capture,captureDiagnostics,artifact:record,
  async close(){if(closed)return;closed=true;
   await writeFile(join(dir,'runtime.json'),JSON.stringify({engine,browserVersion:context.browser().version(),profile,profileLength:profile.length,
    origin,artifact:record,issues,workers,routePins,network:net,timings,resourceUsage:process.resourceUsage(),scope:{identity:'real backend/SQLite, synthetic local signed OIDC+PKCE bootstrapped by HTTP; no IdP UI qualification',provider:'explicit synthetic local adapter; no outbound paid calls'},memory:process.memoryUsage()},null,2));
   await context.close();await host.close();for(const fn of after.reverse())await fn();
   await writeFile(join(dir,'cleanup.json'),JSON.stringify({browserClosed:true,hostClosed:true,backendClosed:true,idpClosed:true,ownProfileRetained:true,sqliteRetained:true,secretsLogged:false}));
  }};
 }catch(error){await context?.close().catch(()=>{});await host?.close().catch(()=>{});for(const fn of after.reverse())await fn().catch(()=>{});throw error;}
}

