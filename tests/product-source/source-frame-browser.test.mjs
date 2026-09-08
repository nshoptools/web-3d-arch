import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createServer} from 'node:http';import {createHash} from 'node:crypto';
import {inspectCapturedProduct} from './capture-oracle.mjs';
const root=process.env.PROJECT_ROOT,run=process.env.PROJECT_REVIEW_RUN,base=path.resolve(import.meta.dirname,'../..'),engine=process.env.ARCH_BRIDGE_ENGINES;
assert.ok(['chromium','firefox','webkit'].includes(engine));
const tag=process.env.ARCH_BRIDGE_TAG??'initial';assert.match(tag,/^[a-z0-9-]{1,30}$/);
const out=path.join(run,'evidence/asfr-worker-'+engine+'-'+tag);fs.mkdirSync(out,{recursive:true});
const routes=new Map(),fixture=JSON.parse(fs.readFileSync(path.join(run,'inputs/source-fixture.json')));
function add(dir,prefix){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())add(p,prefix+'/'+e.name);else if(e.name.endsWith('.mjs')||e.name.endsWith('.json'))routes.set(prefix+'/'+e.name,p);}}
add(path.join(base,'src'),'/src');add(path.join(base,'tests/product-source'),'/tests/product-source');
for(const ext of ['mjs','wasm'])routes.set('/runtime/arch-kernel.'+ext,path.join(run,'work/boole-frame-module/arch-kernel.'+ext));
for(const name of ['engine-client.mjs','engine-worker.mjs','source-frame.mjs'])routes.set('/src/core/'+name,path.join(run,'inputs/boole-source-frame/core',name));
for(const a of fixture.actualAssets)routes.set('/library/'+a.sha256,path.join(run,'inputs/library',a.sha256));
for(const p of ['keychain','clicky','strap','lego','charm'])for(const s of ['noi','chim','phang','phang2']){
 const id='update-svg-'+p+'-'+s,dir=path.join(run,'evidence/source-browser-final-wk-'+p,'webkit'),file=path.join(dir,id+'.json'),saved=JSON.parse(fs.readFileSync(file));
 routes.set('/heads/'+id+'.json',file);for(const h of saved.assetHashes)routes.set('/head-assets/'+h,path.join(dir,'assets',h));
}
for(const [url,file]of routes)routes.set(url,fs.readFileSync(file));
fs.writeFileSync(path.join(out,'inputs.json'),JSON.stringify([...routes].map(([url,b])=>({url,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')})),null,2));
const oracles=[];
const server=createServer(async(req,res)=>{
 for(const [k,v]of Object.entries({'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin','Cache-Control':'no-store'}))res.setHeader(k,v);
 if(req.method==='POST'){
  const m=/^\/capture\/(chromium|firefox|webkit)\/(update-svg-[a-z0-9-]+)\.(arch|json)$/.exec(req.url);if(!m){res.writeHead(404);res.end();return;}
  const chunks=[];let count=0;for await(const b of req){count+=b.length;if(count>32*1024*1024){res.writeHead(413);res.end();return;}chunks.push(b);}
  const bytes=Buffer.concat(chunks);fs.writeFileSync(path.join(out,m[2]+'.'+m[3]),bytes);
  try{if(m[3]==='json'){const value=JSON.parse(bytes),oracle=inspectCapturedProduct(fs.readFileSync(path.join(out,m[2]+'.arch')),value.semantics,m[2]);oracles.push({id:m[2],oracle});fs.writeFileSync(path.join(out,m[2]+'.oracle.json'),JSON.stringify(oracle));}res.end('captured');}
  catch(e){res.writeHead(422);res.end(String(e));}return;
 }
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>ASFR Worker test</title>');return;}
 const bytes=routes.get(req.url);if(!bytes){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',req.url.endsWith('.wasm')?'application/wasm':req.url.endsWith('.json')?'application/json':req.url.endsWith('.mjs')?'text/javascript':'application/octet-stream');res.end(bytes);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
test.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
const pw=await import(pathToFileURL(path.join(root,'.toolchain/app-runtime/node_modules/playwright/index.mjs')));
test('ASFR/1 real root Worker '+engine+' replays20 confirmed on-model heads',{timeout:600000},async t=>{
 const context=await pw[engine].launchPersistentContext(path.join(run,'work/asfr-profiles',engine+'-'+tag),{headless:true,acceptDownloads:false,downloadsPath:path.join(run,'work/asfr-downloads',engine+'-'+tag),...(engine==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
 const abort=()=>{void context.close().catch(()=>{});};t.signal.addEventListener('abort',abort,{once:true});
 try{const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());await page.goto(origin,{waitUntil:'domcontentloaded',timeout:60000});
  const result=await page.evaluate(async args=>(await import('/tests/product-source/source-frame-browser-page.mjs')).run(args),{catalog:fixture.catalog,assetURLs:fixture.assetRecords.map(r=>({...r,url:origin+'/library/'+r.sha256})),runtime:{engine,version:context.browser().version()}});
  assert.equal(result.status,'pass');assert.equal(result.crossOriginIsolated,true);assert.equal(result.rows.length,20);assert.equal(oracles.length,20);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({...result,oracles,browserVersion:context.browser().version(),playwright:'1.63.0',independentReview:false},null,2));
 }finally{t.signal.removeEventListener('abort',abort);await context.close();}
});

