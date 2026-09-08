import {createHash} from 'node:crypto';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createServer} from 'node:http';
import {inspectCapturedProduct} from './capture-oracle.mjs';
const root=process.env.PROJECT_ROOT,run=process.env.PROJECT_REVIEW_RUN,base=path.resolve(import.meta.dirname,'../..');
assert.equal(process.versions.node,'24.19.0');assert.ok(fs.realpathSync(run).startsWith(fs.realpathSync(root)+path.sep));
const modules=path.join(root,'.toolchain/app-runtime/node_modules');
assert.equal(JSON.parse(fs.readFileSync(path.join(modules,'playwright/package.json'))).version,'1.63.0');
const pw=await import(pathToFileURL(path.join(modules,'playwright/index.mjs')));
const fixture=JSON.parse(fs.readFileSync(path.join(run,'inputs/source-fixture.json'))),routes=new Map(),captures=new Map();
const color=process.env.ARCH_BRIDGE_COLOR==='1',tag=process.env.ARCH_BRIDGE_TAG??'exploratory',suffix=(color?'source-color':'source-browser')+'-'+tag;
const families=process.env.ARCH_BRIDGE_FAMILIES?.split(',');
if(families){assert.equal(new Set(families).size,families.length);assert.ok(families.length>0&&families.every(f=>['svg','raster','text','emoji'].includes(f)),'Explicit supported source families required');}
assert.match(tag,/^[a-z0-9-]{1,40}$/);
const out=path.join(run,'evidence',suffix);fs.mkdirSync(out,{recursive:true});
function add(dir,prefix){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name),url=prefix+'/'+e.name;
 // These are not served or traversed, even when a repository-local package link
 // is present. Every route we actually admit must remain an ordinary file.
 if(e.name==='node_modules'||url==='/src/assets')continue;
 assert.ok(!e.isSymbolicLink(),'Unexpected served link: '+url);
 if(e.isDirectory()){add(p,url);}
 else if(/\.(?:mjs|js|cjs)$/.test(e.name)||prefix.startsWith('/tests/')&&e.name.endsWith('.json'))routes.set(url,p);
}}
add(path.join(base,'src'),'/src');add(path.join(base,'tests/product-source'),'/tests/product-source');
add(path.join(base,'src/assets/harfbuzz/dist'),'/src/assets/harfbuzz/dist');
for(const ext of ['mjs','wasm'])routes.set('/runtime/arch-kernel.'+ext,path.join(run,'work/module/arch-kernel.'+ext));
for(const a of fixture.actualAssets)routes.set('/library/'+a.sha256,path.join(run,'inputs/library',a.sha256));
for(const [url,file]of routes)routes.set(url,fs.readFileSync(file));
fs.writeFileSync(path.join(out,'frozen-route-inputs.json'),JSON.stringify([...routes].map(([url,bytes])=>({url,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')})),null,2));
const server=createServer(async(req,res)=>{
 for(const [k,v]of Object.entries({'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin','Cache-Control':'no-store'}))res.setHeader(k,v);
 if(req.method==='POST'){
  const match=/^\/capture\/(chromium|firefox|webkit)\/([a-z0-9-]{1,100})\.(arch|json|failure|asset)$/.exec(req.url);
  if(!match){res.writeHead(404);res.end();return;}const chunks=[];let count=0;
  for await(const b of req){count+=b.length;if(count>32*1024*1024){res.writeHead(413);res.end();return;}chunks.push(b);}
  const body=Buffer.concat(chunks),dir=path.join(out,match[1]);fs.mkdirSync(dir,{recursive:true});
  if(match[3]==='asset'){
   if(createHash('sha256').update(body).digest('hex')!==match[2]){res.writeHead(422);res.end();return;}
   const assetDir=path.join(dir,'assets');fs.mkdirSync(assetDir,{recursive:true});fs.writeFileSync(path.join(assetDir,match[2]),body);res.end('captured');return;
  }
  fs.writeFileSync(path.join(dir,match[2]+'.'+match[3]),body);
  if(match[3]==='json'){
   const metadata=JSON.parse(body),arch=fs.readFileSync(path.join(dir,match[2]+'.arch'));
   const oracles=inspectCapturedProduct(arch,metadata.semantics,match[2]);
   captures.set(match[1]+':'+match[2],oracles);fs.writeFileSync(path.join(dir,match[2]+'.oracle.json'),JSON.stringify(oracles));
  }
  res.end('captured');return;
 }
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><title>Product source bridge component qualification</title>');return;}
 const p=routes.get(req.url);if(!p){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',req.url.endsWith('.wasm')?'application/wasm':req.url.endsWith('.json')?'application/json':req.url.startsWith('/library/')?'application/octet-stream':'text/javascript');res.end(p);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
test.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
for(const engine of ['chromium','firefox','webkit'])test('Real root Worker source bridge '+engine,{timeout:600000},async()=>{
 const profile=path.join(run,'work/profiles-'+suffix,engine),context=await pw[engine].launchPersistentContext(profile,{headless:true,downloadsPath:path.join(run,'work/downloads-'+suffix,engine),acceptDownloads:false,...(engine==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 try{
  await context.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());await page.goto(origin);
  const result=await page.evaluate(async args=>(await import('/tests/product-source/browser-page.mjs')).run(args),{
   catalog:fixture.catalog,assetURLs:fixture.assetRecords.map(r=>({...r,url:origin+'/library/'+r.sha256})),runtime:{engine,version:context.browser().version()},matrix:process.env.ARCH_BRIDGE_MATRIX==='1',color,families});
  assert.equal(result.status,'pass');assert.equal(result.crossOriginIsolated,true);assert.deepEqual(errors,[]);
  for(const row of result.trace)if(row.id)assert.ok(captures.has(engine+':'+row.id),'Missing independent mesh oracle');
  if(color)assert.ok(captures.has(engine+':emoji-color-default'));
  fs.writeFileSync(path.join(out,engine,'summary.json'),JSON.stringify({...result,engine,browserVersion:context.browser().version(),playwright:'1.63.0',errors,independentReview:false},null,2));
  console.log(JSON.stringify({engine,models:color?result.models:result.trace.length,negatives:result.negatives?.length??0}));
 }catch(e){fs.writeFileSync(path.join(out,engine+'-failure.json'),JSON.stringify({message:e.message,stack:e.stack,errors},null,2));throw e;}
 finally{await context.close();}
});
