import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {inputFixture,dir} from './helpers.mjs';
import {startArtifact} from './http-helpers.mjs';
const runtime=resolve(process.env.PROJECT_ROOT,'.toolchain/app-runtime/node_modules');
const playwright=await import(pathToFileURL(resolve(runtime,'playwright/index.mjs')).href);
assert.equal(JSON.parse(readFileSync(resolve(runtime,'playwright/package.json'))).version,'1.63.0');
const pins=JSON.parse(readFileSync(resolve(runtime,'playwright-core/browsers.json'))).browsers;
const expected={chromium:['1243','153.0.8010.12'],firefox:['1543','155.0'],webkit:['2359','26.6']};
for(const name of Object.keys(expected)){const p=pins.find(x=>x.name===name);assert.deepEqual([p.revision,p.browserVersion],expected[name]);}
// The test runner uses --test-concurrency=1; this loop launches exactly one browser at a time.
for(const name of ['chromium','firefox','webkit'])test('portable artifact browser '+name+': HTTPS Worker/WASM/transport + real PNG + auth/cache/shutdown',{timeout:90000},async t=>{
 const x=inputFixture(),built=await x.build(),f=await startArtifact(t,built.directory),root=dir('browser-'+name);
 for(const s of ['profile','downloads','artifacts','appdata','localappdata'])mkdirSync(resolve(root,s));
 const context=await playwright[name].launchPersistentContext(resolve(root,'profile'),{headless:true,ignoreHTTPSErrors:true,acceptDownloads:false,
  downloadsPath:resolve(root,'downloads'),artifactsDir:resolve(root,'artifacts'),serviceWorkers:'allow',
  env:{...process.env,APPDATA:resolve(root,'appdata'),LOCALAPPDATA:resolve(root,'localappdata')},
  ...(name==='chromium'?{args:['--ignore-certificate-errors','--disable-background-networking']}: {})});
 t.after(()=>context.close());
 const allowed=new Set([f.origin,f.identity.origin]);await context.route('**/*',route=>allowed.has(new URL(route.request().url()).origin)?route.continue():route.abort('blockedbyclient'));
 const page=context.pages()[0]??await context.newPage();assert.equal((await page.goto(f.origin+'/')).status(),200);
 await page.waitForFunction(()=>globalThis.releaseSmokeLoaded);
 const result=await page.evaluate(async()=>{
  const value=await new Promise((yes,no)=>{const w=new Worker('/worker.mjs',{type:'module'}),timer=setTimeout(()=>{w.terminate();no(Error('WORKER_DEADLINE'));},30000);
   w.onmessage=e=>{clearTimeout(timer);w.terminate();yes(e.data);};w.onerror=()=>{clearTimeout(timer);w.terminate();no(Error('WORKER_ERROR'));};w.postMessage('run');});
  const png=await new Promise((yes,no)=>{const im=new Image();im.onload=()=>yes({width:im.naturalWidth,height:im.naturalHeight});im.onerror=()=>no(Error('PNG_DECODE'));im.src=value.previewURL;});
  return {secure:isSecureContext,isolated:crossOriginIsolated,worker:value,png};
 });
 assert.equal(result.secure,true);assert.equal(result.isolated,true);assert.equal(result.worker.result,42);
 assert.equal(result.worker.isolated,true);assert.equal(result.worker.shared,8);assert.equal(result.worker.resources,4);
 assert.equal(result.worker.svgMedia,'image/svg+xml');assert.ok(result.worker.svgURL.endsWith('.bin'));
 assert.equal(result.worker.svgHash,result.worker.expectedSvgHash);assert.deepEqual(result.png,{width:1,height:1});
 await page.evaluate(async()=>{await navigator.serviceWorker.register('/host-sw.js',{scope:'/',updateViaCache:'none'});await navigator.serviceWorker.ready;});
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller);await page.reload();
 const start=await page.evaluate(async()=>{const r=await fetch('/api/v1/auth/start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({deviceId:crypto.randomUUID()})});return {status:r.status,json:await r.json()};});
 assert.equal(start.status,200);await page.goto(f.origin+f.identity.issue('synthetic-owner',start.json.authorizationUrl));
 await page.waitForURL(f.origin+'/');
 const auth=await page.evaluate(async()=>{
  const me=await fetch('/api/v1/me'),data=await me.json();
  await fetch('/release-bindings.json');await fetch('/api/v1/health');
  const logout=await fetch('/api/v1/logout',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':data.csrfToken},body:'{}'});
  const after=await fetch('/api/v1/me');return {me:me.status,role:data.user?.role,logout:logout.status,after:after.status,cache:me.headers.get('cache-control'),jsCookie:document.cookie};
 });
 assert.deepEqual([auth.me,auth.role,auth.logout,auth.after,auth.jsCookie],[200,'owner',200,401,'']);assert.match(auth.cache,/no-store/);
 const cached=await page.evaluate(async()=>{const out=[];for(const name of await caches.keys()){const c=await caches.open(name);for(const r of await c.keys())out.push(new URL(r.url).pathname);}return out;});
 assert.ok(cached.includes('/')&&cached.includes('/release-bindings.json'));assert.ok(cached.every(p=>!p.startsWith('/api/')&&!p.endsWith('.keys')&&p!=='/host-sw.js'));
 await f.host.close();const offline=await page.reload();assert.equal(offline.status(),200);
 const unavailable=await page.evaluate(async()=>{try{await fetch('/api/v1/me');return false;}catch{return true;}});assert.equal(unavailable,true);
 writeFileSync(resolve(root,'evidence.json'),JSON.stringify({browser:name,pins:expected[name],playwright:'1.63.0',
  syntheticTLS:true,syntheticIdentity:true,actualPortableArtifact:true,productionAppComplete:false,result,auth,cached,offlinePublicShell:true},null,2)+'\n');
});
