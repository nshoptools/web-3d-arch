import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { start, directory, run } from './helpers.mjs';
const runtime=resolve(process.env.PROJECT_ROOT,'.toolchain/app-runtime/node_modules');
const playwright=await import(pathToFileURL(join(runtime,'playwright/index.mjs')).href);
assert.equal(JSON.parse(readFileSync(join(runtime,'playwright/package.json'))).version,'1.63.0');

for(const name of ['chromium','firefox','webkit']) {
  test('WEB-01/ACC-01 browser '+name+': real HTTPS COI, Worker/WASM/font/CSP, OIDC redirect, logout; SW API cache exclusion', {timeout:60000},async t=>{
    const f=await start(t,{backend:true,browserIdp:true,label:'browser-'+name});
    const root=directory('profile-'+name);
    for(const d of ['profile','downloads','artifacts','appdata','localappdata'])mkdirSync(join(root,d));
    const context=await playwright[name].launchPersistentContext(join(root,'profile'),{
      headless:true,ignoreHTTPSErrors:true,acceptDownloads:false,downloadsPath:join(root,'downloads'),
      artifactsDir:join(root,'artifacts'),env:{...process.env,APPDATA:join(root,'appdata'),LOCALAPPDATA:join(root,'localappdata')},
      ...(name==='chromium'?{args:['--ignore-certificate-errors','--disable-background-networking']}:{}),
      serviceWorkers:'allow'
    });
    t.after(()=>context.close());
    const page=context.pages()[0]??await context.newPage();
    await context.route('**/*',route=>{
      const u=new URL(route.request().url());
      if(['localhost','127.0.0.1'].includes(u.hostname))return route.continue();
      return route.abort('blockedbyclient');
    });
    const browserVersion=context.browser()?.version()??'persistent-context';
    let response=await page.goto(f.origin+'/');
    assert.equal(response.status(),200);
    await page.waitForFunction(()=>window.fixtureLoaded===true);
    const initial=await page.evaluate(async()=>{
      const font=new FontFace('HostFixture','url(/fixture-font.ttf)');
      await font.load();document.fonts.add(font);
      const worker=await new Promise((resolve,reject)=>{
        const w=new Worker('/worker.mjs',{type:'module'});
        const timer=setTimeout(()=>{w.terminate();reject(new Error('worker deadline'));},5000);
        w.onmessage=e=>{clearTimeout(timer);w.terminate();resolve(e.data);};
        w.onerror=()=>{clearTimeout(timer);w.terminate();reject(new Error('worker failure'));};
        w.postMessage('run');
      });
      const nativeEval=(()=>{try{(0,eval)('window.evalRan=true');return true;}catch{return false;}})();
      const inline=document.createElement('script');inline.textContent='window.inlineRan=true';document.body.appendChild(inline);
      const svg=document.createElement('object');svg.data='/malicious.svg';document.body.appendChild(svg);
      return {secure:isSecureContext,isolated:crossOriginIsolated,shared:new SharedArrayBuffer(16).byteLength,worker,
        font:font.status,evalRan:!!window.evalRan,inlineRan:!!window.inlineRan,nativeEval};
    });
    assert.equal(initial.secure,true);assert.equal(initial.isolated,true);assert.equal(initial.shared,16);
    assert.deepEqual(initial.worker,{isolated:true,shared:16,result:42,fetched:true});
    assert.equal(initial.font,'loaded');assert.equal(initial.evalRan,false);assert.equal(initial.inlineRan,false);assert.equal(initial.nativeEval,false);

    await page.evaluate(async()=>{await navigator.serviceWorker.register('/host-sw.js',{scope:'/',updateViaCache:'none'});await navigator.serviceWorker.ready;});
    await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    await page.reload();
    assert.equal(await page.evaluate(()=>crossOriginIsolated),true);
    // Network-first fetches populate only exact manifest URLs after SHA/build verification.
    await page.evaluate(async()=>{await fetch('/public.json');await fetch('/api/v1/health');await fetch('/api/v1/me');});
    const startResponse=await page.evaluate(async()=>{
      const r=await fetch('/api/v1/auth/start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({deviceId:crypto.randomUUID()})});
      return {status:r.status,json:await r.json()};
    });
    assert.equal(startResponse.status,200);
    await page.goto(startResponse.json.authorizationUrl); // Real top-level cross-origin redirect, no popup/opener.
    // Playwright can expose the final response for a redirect under an active SW.
    // Observe the host's actual 303; exact wire headers have a separate HTTPS integration oracle.
    assert.ok(f.records.some(r=>r.route==='api' && r.status===303));
    await page.waitForURL(f.origin+'/');
    assert.equal(await page.evaluate(()=>crossOriginIsolated),true);
    const authenticated=await page.evaluate(async()=>{
      const r=await fetch('/api/v1/me');const me=await r.json();
      const bad=await fetch('/api/v1/logout',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':'bad'},body:'{}'});
      const logout=await fetch('/api/v1/logout',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':me.csrfToken},body:'{}'});
      const after=await fetch('/api/v1/me');
      return {before:r.status,role:me.user?.role,cache:r.headers.get('cache-control'),bad:bad.status,logout:logout.status,after:after.status,jsCookie:document.cookie};
    });
    assert.deepEqual([authenticated.before,authenticated.role,authenticated.bad,authenticated.logout,authenticated.after],[200,'owner',403,200,401]);
    assert.equal(authenticated.jsCookie,'');assert.match(authenticated.cache,/no-store/);
    const cached=await page.evaluate(async()=>{
      const names=await caches.keys(),entries=[];
      for(const name of names){const c=await caches.open(name);for(const r of await c.keys())entries.push(new URL(r.url).pathname);}
      return entries;
    });
    assert.ok(cached.includes('/public.json'));assert.ok(cached.includes('/'));
    assert.ok(cached.every(p=>p!=='/host-sw.js'&&!p.startsWith('/api/')));
    // Offline shell is public only; backend auth/data remains unavailable.
    await f.host.close(); // Actual server unavailability; no browser offline emulation.
    const offline=await page.reload();
    assert.equal(offline.status(),200);
    assert.equal(await page.evaluate(()=>crossOriginIsolated),true);
    const offlineApi=await page.evaluate(async()=>{try{await fetch('/api/v1/me');return 'unexpected';}catch{return 'network-error';}});
    assert.equal(offlineApi,'network-error');

    writeFileSync(join(f.root,'browser-evidence.json'),JSON.stringify({
      browser:name,browserVersion,playwright:'1.63.0',syntheticTLS:true,certificateErrorsIgnoredForSyntheticFixture:true,
      realHostIdpQualified:false,offlineMode:'actual-host-stopped',initial,authenticated:{...authenticated,jsCookie:'empty'},cached,offlineApi
    },null,2)+'\n');
  });
}
