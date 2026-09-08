import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createServer} from 'node:http';import {createHash} from 'node:crypto';
import {envSelection,LIMITS} from '../product-root/selection.mjs';
import {readSnapshot} from '../oracles/mesh-oracle.mjs';
import {inspectCapturedProduct} from '../product-source/capture-oracle.mjs';
const repo=fs.realpathSync(process.env.PROJECT_ROOT),run=fs.realpathSync(process.env.PROJECT_REVIEW_RUN),base=path.resolve(import.meta.dirname,'../..'),tag=process.env.ARCH_ROOT_TAG??'owned-r3';
assert.match(tag,/^[a-z0-9-]{1,40}$/);assert.ok(run.startsWith(repo+path.sep));assert.equal(process.versions.node,'24.19.0');
const hash=b=>createHash('sha256').update(b).digest('hex'),routes=new Map(),audits=new Map(),wasmReads=new Map(),captures=new Map();
const modules=path.join(repo,'.toolchain/app-runtime/node_modules');assert.equal(JSON.parse(fs.readFileSync(path.join(modules,'playwright/package.json'))).version,'1.63.0');
const pw=await import(pathToFileURL(path.join(modules,'playwright/index.mjs'))),fixture=JSON.parse(fs.readFileSync(path.join(run,'inputs/source-fixture-v2.json'))),out=path.join(run,'evidence/controller-browser-'+tag);fs.mkdirSync(out,{recursive:true});
function add(dir,prefix){for(const e of fs.readdirSync(dir,{withFileTypes:true})){
 const p=path.join(dir,e.name),url=prefix+'/'+e.name;if(e.name==='node_modules'||url==='/src/assets')continue;assert.ok(!e.isSymbolicLink());
 if(e.isDirectory())add(p,url);else if(/\.(mjs|js|cjs)$/.test(e.name)||prefix.startsWith('/tests/')&&e.name.endsWith('.json'))routes.set(url,fs.readFileSync(p));
}}
add(path.join(base,'src'),'/src');add(path.join(base,'src/assets/harfbuzz/dist'),'/src/assets/harfbuzz/dist');add(path.join(base,'tests/product-root'),'/tests/product-root');add(path.join(base,'tests/color-product'),'/tests/color-product');
for(const a of fixture.actualAssets)routes.set('/library/'+a.sha256,fs.readFileSync(path.join(run,'inputs/library',a.sha256)));
const moduleFile=fs.realpathSync(process.env.PRODUCT_APP_MODULE);assert.ok(moduleFile.startsWith(run+path.sep));const pins={};
for(const kind of ['module','wasm']){const bytes=fs.readFileSync(kind==='module'?moduleFile:moduleFile.replace(/\.mjs$/,'.wasm')),sha256=hash(bytes),url='/runtime/arch-'+sha256.slice(0,16)+(kind==='module'?'.mjs':'.wasm');routes.set(url,bytes);pins[kind]={url,sha256,bytes:bytes.length};}
fs.writeFileSync(path.join(out,'frozen-route-inputs.json'),JSON.stringify([...routes].map(([url,bytes])=>({url,bytes:bytes.length,sha256:hash(bytes)})),null,2));
let activeEngine,activeGroup;const groups=envSelection({...process.env,ARCH_ROOT_GROUPS:'color',ARCH_ROOT_PRODUCTS:'keychain',ARCH_ROOT_STYLES:'noi'}),caseTimes=new Map();
const server=createServer(async(req,res)=>{
 for(const[k,v]of Object.entries({'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin','Cache-Control':'no-store'}))res.setHeader(k,v);
 const pathname=new URL(req.url,'http://127.0.0.1').pathname;
 if(req.method==='POST'){
  const chunks=[];let n=0;for await(const b of req){n+=b.length;if(n>32*1024*1024){res.writeHead(413);res.end();return;}chunks.push(b);}const bytes=Buffer.concat(chunks);
  const a=/^\/instance-audit\/(chromium|firefox|webkit)$/.exec(pathname);if(a){const rows=audits.get(a[1])??[];rows.push(JSON.parse(bytes));audits.set(a[1],rows);res.end('ok');return;}
  const time=/^\/case-time\/(chromium|firefox|webkit)$/.exec(pathname);if(time){const row=JSON.parse(bytes),rows=caseTimes.get(time[1])??[];rows.push(row);caseTimes.set(time[1],rows);const dir=path.join(out,time[1],activeGroup);fs.mkdirSync(dir,{recursive:true});fs.appendFileSync(path.join(dir,'case-times.jsonl'),JSON.stringify(row)+'\n');res.end('ok');return;}
  const m=/^\/capture\/(chromium|firefox|webkit)\/([a-z0-9-]{1,110})\.(arch|json|asset)$/.exec(pathname);
  if(!m){res.writeHead(404);res.end();return;}const dir=path.join(out,m[1],activeGroup);fs.mkdirSync(dir,{recursive:true});
  if(m[3]==='asset'){if(hash(bytes)!==m[2]){res.writeHead(422);res.end();return;}const assets=path.join(dir,'assets');fs.mkdirSync(assets,{recursive:true});fs.writeFileSync(path.join(assets,m[2]),bytes);}
  else{fs.writeFileSync(path.join(dir,m[2]+'.'+m[3]),bytes);if(m[3]==='json'){
   try{const metadata=JSON.parse(bytes),arch=fs.readFileSync(path.join(dir,m[2]+'.arch')),oracle=inspectCapturedProduct(arch,metadata.semantics,m[2]);fs.writeFileSync(path.join(dir,m[2]+'.oracle.json'),JSON.stringify(oracle));captures.set(m[1]+':'+m[2],oracle);}
   catch(e){fs.writeFileSync(path.join(dir,m[2]+'.oracle-failure.json'),JSON.stringify({message:e.message,stack:e.stack}));res.writeHead(422);res.end('ORACLE_FAILED');return;}
  }}res.end('ok');return;
 }
 if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><title>Fresh product source transaction acceptance</title>');return;}
 const bytes=routes.get(pathname);if(!bytes){res.writeHead(404);res.end();return;}
 if(pathname.endsWith('.wasm'))wasmReads.set(activeEngine,(wasmReads.get(activeEngine)??0)+1);
 res.setHeader('Content-Length',String(bytes.length));res.setHeader('Content-Type',pathname.endsWith('.wasm')?'application/wasm':pathname.endsWith('.json')?'application/json':pathname.startsWith('/library/')?'application/octet-stream':'text/javascript');res.end(bytes);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
test.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
const engines=['chromium'];assert.ok(engines.length&&engines.every(e=>['chromium','firefox','webkit'].includes(e)));
for(const engine of engines)for(const group of groups)test('fresh controller/probe/ASFR '+engine+' '+group.id,{timeout:LIMITS.groupMs},async t=>{
 activeEngine=engine;activeGroup=group.id;audits.set(engine,[]);wasmReads.set(engine,0);caseTimes.set(engine,[]);const dir=path.join(out,engine,group.id);fs.mkdirSync(dir,{recursive:true});
 const browser=await pw[engine].launchPersistentContext(path.join(run,'work/profiles-product-root-'+tag,engine,group.id),{headless:true,acceptDownloads:false,downloadsPath:path.join(run,'work/downloads-product-root-'+tag,engine),...(engine==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
 const stop=()=>{void browser.close().catch(()=>{});};t.signal.addEventListener('abort',stop,{once:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));const diagnostics=[];page.on('console',m=>{if(m.text().startsWith('TEST_PRODUCT_DIAGNOSTIC '))diagnostics.push(m.text());});
 try{
  await browser.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());await page.goto(origin,{waitUntil:'domcontentloaded',timeout:60000});
  const integrity={version:'arch-engine-integrity/1',module:pins.module,wasm:pins.wasm};
  const result=await page.evaluate(async args=>(await import('/tests/color-product/browser-page.mjs')).run(args),{catalog:fixture.catalog,assetURLs:fixture.assetRecords.map(r=>({...r,url:origin+'/library/'+r.sha256})),runtime:{engine,version:browser.browser().version()},integrity,moduleURL:pins.module.url,group});
  assert.equal(result.paintAudit.length,3);assert.equal(new Set(result.paintAudit.map(p=>p.hash)).size,1);assert.ok(result.paintAudit.every(p=>p.gradients>0&&p.operations>1));
  const captured=JSON.parse(fs.readFileSync(path.join(dir,'color-emoji-converted.json'))),src=captured.state.content.app.source,asset=h=>fs.readFileSync(path.join(dir,'assets',h));
  const color=fixture.selection.colorFont;assert.equal(src.kind,'emoji');assert.equal(src.metadata.selection.sourceKind,'COLRv1');assert.equal(src.metadata.selection.item.id,'1f600');
  assert.equal(hash(asset(color.sha256)),color.sha256);assert.equal(asset(color.sha256).length,color.bytes);assert.deepEqual(asset(color.sha256),fs.readFileSync(path.join(run,'inputs/library',color.sha256)));
  const original=JSON.parse(asset(src.raw.hash));assert.equal(original.sourceKind,'COLRv1');assert.equal(original.sourceHash,color.sha256);assert.equal(original.id,'1f600');
  assert.equal(hash(asset(src.raw.hash)),src.raw.hash);assert.equal(hash(asset(src.raster.rgba)),src.raster.rgba);assert.notEqual(src.raster.rgba,src.raw.hash);
  assert.equal(captured.row.nativeHead.sourceHash,src.raw.hash);assert.equal(src.metadata.productBindings.contexts[0].sha256,src.raw.hash);
  assert.equal(src.metadata.rasterPreparation.input.origin.sourceHash,src.raw.hash);assert.equal(src.metadata.confirmationReceipt.rgbaHash,src.raster.rgba);
  assert.equal(src.metadata.rasterPreparation.input.origin.confirmationId,src.metadata.sourceConversion.approvalHash);
  for(const a of src.metadata.sourceConversion.assets)assert.equal(hash(asset(a.sha256)),a.sha256);
  assert.deepEqual(result.trace.map(t=>t.beforeRevision),[1,2,2,3,3]);assert.equal(captured.state.revision,4);
  assert.ok(new Set(readSnapshot(fs.readFileSync(path.join(dir,'color-emoji-converted.arch'))).parts.map(p=>p.color)).size>1);assert.equal(captured.semantics.mechanicsSemantics,3);assert.equal(captured.semantics.sourceSemantics,2);
  assert.equal(result.status,'pass');assert.equal(result.crossOriginIsolated,true);assert.deepEqual(errors,[]);
  const instances=audits.get(engine),roots=instances.filter(r=>r.kind==='instantiate'),trampolines=instances.filter(r=>r.kind==='constructor');assert.equal(roots.length,1,JSON.stringify(instances));assert.equal(roots[0].instance,true);assert.equal(roots[0].inputHash,pins.wasm.sha256);assert.equal(roots[0].inputBytes,pins.wasm.bytes);for(const r of trampolines){assert.ok(r.inputBytes>0&&r.inputBytes<=256,'bounded Emscripten addFunction trampoline');assert.deepEqual(r.exports,[{name:'f',kind:'function'}]);assert.deepEqual(r.imports,[{module:'e',name:'f',kind:'function'}]);assert.equal(r.bytes.length,r.inputBytes);}assert.equal(instances.length,roots.length+trampolines.length);assert.deepEqual(result.rows.map(r=>r.id).sort(),[...group.expectedIds].sort(),'whole group required');assert.equal(wasmReads.get(engine),1,'no second WASM fetch');
  for(const row of result.rows)assert.ok(captures.has(engine+':'+row.id),'missing host numeric oracle');
  fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify({...result,instances,caseTimes:caseTimes.get(engine),wasmReads:wasmReads.get(engine),browserVersion:browser.browser().version(),playwright:'1.63.0',independentReview:false},null,2));console.log(JSON.stringify({engine,group:group.id,models:result.rows.length,instances:instances.length,wasmReads:wasmReads.get(engine)}));
 }catch(e){fs.writeFileSync(path.join(dir,'failure.json'),JSON.stringify({message:e.message,stack:e.stack,errors,diagnostics,instances:audits.get(engine),wasmReads:wasmReads.get(engine)},null,2));throw e;}
 finally{t.signal.removeEventListener('abort',stop);await browser.close();}
});
