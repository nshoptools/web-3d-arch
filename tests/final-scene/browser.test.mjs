import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createServer} from 'node:http';import {createHash} from 'node:crypto';import os from 'node:os';
const root=fs.realpathSync(process.env.PROJECT_ROOT),run=fs.realpathSync(process.env.PROJECT_REVIEW_RUN),base=path.resolve(import.meta.dirname,'../..');
assert.ok(run.startsWith(root+path.sep));const pw=await import(pathToFileURL(path.join(root,'.toolchain/app-runtime/node_modules/playwright/index.mjs')));
const tag=process.env.SCENE_BROWSER_TAG??'r1';assert.match(tag,/^[a-z0-9-]{1,24}$/);
const engines=(process.env.SCENE_BROWSER_ENGINES??'chromium,firefox,webkit').split(',');
assert.ok(engines.length>0&&new Set(engines).size===engines.length&&engines.every(n=>['chromium','firefox','webkit'].includes(n)));
const pageMode=process.env.SCENE_BROWSER_PAGE??'new';assert.ok(['new','initial'].includes(pageMode));
const expected=process.env.SCENE_EXPECTED_QUALIFICATION??'complete';assert.ok(['complete','legacy','material-only'].includes(expected));
const privateDirectory=value=>{const resolved=fs.realpathSync(value);assert.ok(resolved.startsWith(run+path.sep));return resolved;};
const runtimeDirectory=privateDirectory(process.env.SCENE_RUNTIME_DIRECTORY??path.join(run,'work/module'));
const overlay=process.env.SCENE_INPUT_OVERLAY?privateDirectory(process.env.SCENE_INPUT_OVERLAY):null;
const out=path.join(run,'evidence/browser-'+tag);fs.mkdirSync(out,{recursive:true});const routes=new Map(),outcomes=[];
function add(dir,prefix){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())add(p,prefix+'/'+e.name);else if(e.name.endsWith('.mjs'))routes.set(prefix+'/'+e.name,fs.readFileSync(p));}}
add(path.join(base,'src'),'/src');for(const name of ['browser-page.mjs','fixtures.mjs'])routes.set('/tests/final-scene/'+name,fs.readFileSync(path.join(import.meta.dirname,name)));
if(overlay){
 const coreFiles=fs.readdirSync(path.join(overlay,'src/core')).filter(n=>n.endsWith('.mjs'));
 assert.ok(coreFiles.includes('engine-client.mjs')&&coreFiles.includes('engine-worker.mjs'));
 assert.ok(coreFiles.every(n=>!n.startsWith('mesh-qualification')&&n!=='mesh-predicates.mjs'),'overlay must not replace candidate checker');
 for(const relative of [...coreFiles.map(n=>'src/core/'+n),'src/kernel/final-scene-export/float-runtime.mjs','src/kernel/final-scene-export/runtime-helper.mjs']){
  const file=fs.realpathSync(path.join(overlay,relative));assert.ok(file.startsWith(overlay+path.sep));routes.set('/'+relative,fs.readFileSync(file));
 }
}
for(const ext of ['mjs','wasm']){
 const file=fs.realpathSync(path.join(runtimeDirectory,'arch-kernel.'+ext));assert.ok(file.startsWith(runtimeDirectory+path.sep));
 routes.set('/runtime/arch-kernel.'+ext,fs.readFileSync(file));
}
const fixtureManifest=JSON.parse(fs.readFileSync(path.join(import.meta.dirname,'fixtures/manifest.json')));
for(const item of fixtureManifest.files){const b=fs.readFileSync(path.join(import.meta.dirname,'fixtures',item.path));assert.equal(b.length,item.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),item.sha256);routes.set('/fixtures/'+item.path,b);}
fs.writeFileSync(path.join(out,'route-manifest.json'),JSON.stringify([...routes].map(([url,b])=>({url,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')})),null,2));
const requests=[];let currentEngine=null;
const server=createServer((req,res)=>{
 const request={engine:currentEngine,time:Date.now(),path:req.url==='/'||routes.has(req.url)?req.url:'[unlisted]',method:req.method};requests.push(request);
 res.once('finish',()=>{request.status=res.statusCode;request.finished=Date.now();});
 res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'");
 if(req.method!=='GET'){res.writeHead(405);return res.end();}
 if(req.url==='/'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><meta charset="utf-8"><title>Final scene component evidence</title>');}
 const b=routes.get(req.url);if(!b){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',req.url.endsWith('.wasm')?'application/wasm':req.url.endsWith('.json')?'application/json':'text/javascript');res.end(b);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
test.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
test.after(()=>{const products=outcomes.flatMap(r=>r.trace.filter(t=>t.case!=='real-validator-worker-valid-invalid-cancel').map(t=>({engine:r.engine,...t})));fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify({status:products.length===15&&products.every(p=>p.status==='pass')?'qualified':'incomplete',expected,qualified:products.filter(p=>p.status==='pass').length,materialOnly:products.filter(p=>p.status==='material-only').length,unavailable:products.filter(p=>p.status==='unavailable').length,expectedProducts:15,products:products.map(p=>({engine:p.engine,case:p.case,status:p.status,code:p.code}))},null,2));});
for(const name of engines)test('real root + validator Workers '+name,{timeout:600000},async()=>{
 currentEngine=name;const factors={start:Date.now(),freeMemory:os.freemem(),totalMemory:os.totalmem(),logicalCPUs:os.cpus().length,node:process.version,pageMode};
 const profile=path.join(run,'p',tag+'-'+name[0]),context=await pw[name].launchPersistentContext(profile,{headless:true,downloadsPath:path.join(run,'temp/downloads-'+tag+'-'+name),acceptDownloads:false,serviceWorkers:'block',...(name==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
 const page=pageMode==='initial'?(context.pages()[0]??await context.newPage()):await context.newPage(),browserErrors=[],navigation=[];
 const localPath=url=>url.startsWith(origin)?url.slice(origin.length):'[outside-harness]';
 page.on('request',r=>navigation.push({event:'request',path:localPath(r.url()),time:Date.now()}));
 page.on('response',r=>navigation.push({event:'response',path:localPath(r.url()),status:r.status(),time:Date.now()}));
 for(const event of ['domcontentloaded','load'])page.on(event,()=>navigation.push({event,time:Date.now()}));page.on('pageerror',e=>browserErrors.push(e.message));page.on('requestfailed',r=>browserErrors.push({url:r.url().replace(origin,''),error:r.failure()?.errorText}));
 try{
  await page.goto(origin);const r=await page.evaluate(async()=>await (await import('/tests/final-scene/browser-page.mjs')).run());
  const result={...r,engine:name,browser:context.browser().version(),profile,profileLength:profile.length,browserErrors};outcomes.push(result);
  fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({engine:name,cases:r.trace.map(x=>({case:x.case,status:x.status,code:x.code})),errors:r.errors}));
  assert.equal(r.crossOriginIsolated,true);assert.deepEqual(browserErrors,[]);
  const products=r.trace.filter(x=>x.case!=='real-validator-worker-valid-invalid-cancel');
  assert.deepEqual(products.map(x=>x.case),['keychain','clicky','strap','lego','charm']);
  if(expected==='complete'){assert.deepEqual(r.errors,[]);assert.ok(products.every(x=>x.status==='pass'),'all five default products must qualify');}
  else if(expected==='material-only'){assert.deepEqual(r.errors,[]);assert.equal(r.finalSceneGeometry,true);assert.ok(products.every(x=>x.status==='material-only'));}
  else{assert.deepEqual(r.errors,[{product:'clicky',code:'INVALID_SERIALIZATION'}]);assert.equal(products.filter(x=>x.status==='pass').length,4);}
  // Expected partial/legacy observations are NOT normal product qualification;
  // acceptance.json counts each material-only/unavailable product explicitly.
 }catch(e){fs.writeFileSync(path.join(out,name+'-failure.json'),JSON.stringify({code:e.code,message:e.message,stack:e.stack,browserErrors},null,2));throw e;}
 finally{
  fs.writeFileSync(path.join(out,name+'-navigation.json'),JSON.stringify({factors,end:Date.now(),freeMemoryAtEnd:os.freemem(),navigation,requests:requests.filter(r=>r.engine===name)},null,2));
  await context.close();
 }
});
