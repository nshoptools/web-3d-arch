import test from 'node:test';import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath} from 'node:url';import{createServer}from'node:http';
import{build}from'vite';import{chromium,firefox,webkit}from'playwright';
import{readSnapshot,inspectMesh,verticalIntersections}from'../oracles/mesh-oracle.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),run=process.env.PROJECT_REVIEW_RUN;
if(!run||!process.env.ARCH_WASM_MODULE)throw Error('Assigned run and ARCH_WASM_MODULE required');
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),out=path.join(run,'evidence/raster-rpc-'+stamp),work=path.join(run,'work/raster-rpc-'+stamp);
await mkdir(out,{recursive:true});await mkdir(work,{recursive:true});
const routes=new Map(),bundle=path.join(work,'bundle');
await build({configFile:false,root,cacheDir:path.join(run,'cache/vite-raster-rpc'),logLevel:'warn',
 build:{target:'es2022',modulePreload:false,outDir:bundle,emptyOutDir:false,minify:false,rollupOptions:{input:path.join(root,'src/core/engine-worker.mjs'),output:{entryFileNames:'engine-worker.mjs',chunkFileNames:'chunks/[name]-[hash].mjs'}}}});
async function add(dir){for(const ent of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory())await add(p);else routes.set('/src/core/'+path.relative(bundle,p).replaceAll('\\','/'),await readFile(p));}}
await add(bundle);
for(const name of ['engine-client.mjs','engine-raster-runtime.mjs','raster-operations.mjs','raster-schema.mjs'])routes.set('/src/core/'+name,await readFile(path.join(root,'src/core',name)));
for(const ext of ['mjs','wasm'])routes.set('/runtime/arch-kernel.'+ext,await readFile(process.env.ARCH_WASM_MODULE.replace(/\.mjs$/,'.'+ext)));
const server=createServer((req,res)=>{
 res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('Cache-Control','no-store');
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="vi"><meta charset="utf-8"><title>Raster RPC</title><body>Raster RPC integration</body></html>');return;}
 const b=routes.get(req.url);if(!b){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',req.url.endsWith('.wasm')?'application/wasm':'text/javascript');res.setHeader('Content-Length',b.length);res.end(b);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
test.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="10mm" viewBox="0 0 10 10"><path d="M0 0H10V10H0Z"/></svg>';
for(const [engine,type]of Object.entries({chromium,firefox,webkit}))test(`RASTER RPC ${engine}: approval, holes, registry isolation, cancellation and retired-token collision`,{timeout:120000},async()=>{
 const browser=await type.launchPersistentContext(path.join(run,'cache/raster-rpc-'+stamp,engine),{headless:true,downloadsPath:path.join(work,'downloads',engine),...(engine==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
 const page=browser.pages()[0],errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await browser.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());await page.goto(origin);
  const result=await page.evaluate(async({svg})=>{
   const{EngineClient}=await import('/src/core/engine-client.mjs');
   const{createEngineRasterRuntime}=await import('/src/core/engine-raster-runtime.mjs');
   const{validatePacket}=await import('/src/core/raster-schema.mjs');
   const hash=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(b))),n=>n.toString(16).padStart(2,'0')).join('');
   const errorOf=async fn=>{try{await fn();return 'NO_ERROR';}catch(e){return e.code;}};
   const client=new EngineClient({moduleURL:'/runtime/arch-kernel.mjs',cancelGraceMs:5000});
   let generation=0,old,context;const control=()=>({signal:new AbortController().signal});
   const run=async(c,invoke)=>{if(c.signal.aborted)throw Error('Unexpected aborted fixture');return invoke(client,++generation);};
   const make=()=>createEngineRasterRuntime(client,{run});
   function grid(width=24,height=20){const data=new Uint8ClampedArray(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(!(x>=8&&x<16&&y>=6&&y<14))data.set([255,0,0,255],(y*width+x)*4);return{width,height,data,options:{smooth:0,minA:0,denoise:0,eps:0,tension:0,longEdgeMm:24}};}
   try{
    old=await client.build({kind:'svg',source:svg,thicknessMm:2},{generation:++generation});const before=await hash(old.bytes()),epoch=client.epoch,worker=client.worker;
    const runtime=make(),input=grid(),pending=runtime.prepareRGBA(input,control());input.data.fill(0);const prepared=await pending;
    const packet=await prepared.copy(),summary=validatePacket(packet).summary,graphHash=await hash(packet.buffers[27].bytes);
    packet.buffers[27].bytes.fill(0);const copiedGraph=await hash((await prepared.copy()).buffers[27].bytes);
    const unconfirmed=await errorOf(()=>runtime.buildSourceContext(prepared,{thicknessMm:2},control()));
    const badHash=await errorOf(()=>runtime.confirm(prepared,'0'.repeat(64),control()));
    const accepted=await runtime.confirm(prepared,prepared.summary.proposalHash,control());
    context=await runtime.buildSourceContext(accepted,{thicknessMm:2},control());const contextBytes=Array.from(await context.copy());
    // Registry traffic is deliberately concurrent with a normal root SVG build.
    const expectedRegistryGeneration=++generation;
    const building=client.build({kind:'svg',source:svg,thicknessMm:3},{generation:expectedRegistryGeneration});
    const copying=accepted.copy(),extra=accepted.acquire();const built=await building;
    const parallelCopy=await copying,reader=await extra;await reader.release();await reader.release();
    const registryGeneration=Atomics.load(new Int32Array(client.memory,client.controlOffset,4),0);built.release();
    let cancelled=false;
    client.onStatus=status=>{if(status.phase==='running'&&!cancelled){cancelled=true;void client.cancel();}};
    const cancellation=await errorOf(()=>runtime.prepareRGBA(grid(256,256),control()));client.onStatus=()=>{};
    const afterFailure=await hash(old.bytes()),sameEpoch=client.epoch===epoch,sameWorker=client.worker===worker;
    await runtime.reset();const retiredByReset=await errorOf(()=>accepted.copy());
    const rootSurvivedReset=await hash(old.bytes()),contextRetired=await errorOf(()=>context.copy());context=null;
    const proxy=await runtime.prepareRGBA(grid(),control());const oldProxyHash=proxy.summary.proposalHash;
    client.terminate('TEST_FORCED_RETIREMENT');
    const retiredCopy=await errorOf(()=>proxy.copy()),retiredPrepare=await errorOf(()=>runtime.prepareRGBA(grid(),control()));
    const replacement=await client.build({kind:'svg',source:svg,thicknessMm:4},{generation:++generation}),newEpoch=client.epoch,newRuntime=make();
    const live=await newRuntime.prepareRGBA(grid(),control()),sequence=client.requestSequence;
    await proxy.release();await runtime.reset({runtimeRetired:true});await runtime.reset();
    const noRetiredRPC=client.requestSequence===sequence,newCopy=await live.copy();
    const preservedReplacement=await hash(replacement.bytes());await newRuntime.reset();replacement.release();
    return{before,afterFailure,rootSurvivedReset,graphHash,copiedGraph,summary,unconfirmed,badHash,contextBytes,
      parallelCopyHash:await hash(parallelCopy.buffers[27].bytes),registryGeneration,expectedRegistryGeneration,
      cancellation,sameEpoch,sameWorker,retiredByReset,contextRetired,retiredCopy,retiredPrepare,noRetiredRPC,
      replacementEpochAdvanced:newEpoch>epoch,replacementHash:preservedReplacement,oldProxyHash,newProxyHash:validatePacket(newCopy).summary.proposalHash,
      pendingRegistry:client.registryPending.size};
   }finally{await context?.release().catch(()=>{});old?.release();client.dispose();}
  },{svg});
  assert.equal(result.before,result.afterFailure);assert.equal(result.before,result.rootSurvivedReset);
  assert.equal(result.sameEpoch,true);assert.equal(result.sameWorker,true);assert.equal(result.graphHash,result.copiedGraph);assert.equal(result.graphHash,result.parallelCopyHash);
  assert.equal(result.registryGeneration,result.expectedRegistryGeneration);
  assert.equal(result.unconfirmed,'RASTER_CONFIRMATION_REQUIRED');assert.equal(result.badHash,'RASTER_CONFIRMATION_MISMATCH');assert.equal(result.cancellation,'CANCELLED');
  assert.equal(result.retiredByReset,'RASTER_LEASE_RETIRED');assert.equal(result.contextRetired,'RASTER_LEASE_RETIRED');assert.equal(result.retiredCopy,'RASTER_LEASE_RETIRED');assert.equal(result.retiredPrepare,'RASTER_RUNTIME_RETIRED');
  assert.equal(result.noRetiredRPC,true);assert.equal(result.replacementEpochAdvanced,true);assert.equal(result.oldProxyHash,result.newProxyHash);assert.equal(result.pendingRegistry,0);
  const snapshot=readSnapshot(Uint8Array.from(result.contextBytes)),oracle=inspectMesh(snapshot);
  assert.equal(snapshot.parts.length,1);assert.ok(Math.abs(oracle.volume-832)<1e-8);assert.equal(oracle.euler,0);
  const xs=snapshot.vertices.map(v=>v[0]),ys=snapshot.vertices.map(v=>v[1]);
  const cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
  assert.deepEqual(verticalIntersections(snapshot,cx,cy),[]);assert.deepEqual(errors,[]);
  const{contextBytes,...bounded}=result;await writeFile(path.join(out,engine+'.json'),JSON.stringify({status:'pass',scope:'Actual root raster RPC and analytical source context; not finished product geometry',...bounded,oracle},null,2));
  await writeFile(path.join(out,engine+'-source.arch'),Uint8Array.from(contextBytes));
 }catch(e){await writeFile(path.join(out,engine+'-failure.json'),JSON.stringify({error:e.stack,errors},null,2));throw e;}
 finally{await browser.close();}
});
