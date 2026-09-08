import test from 'node:test';import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath} from 'node:url';import{createServer}from'node:http';
import{build}from'vite';import{chromium,firefox,webkit}from'playwright';
import{fixtureData,mappedAssets}from'../text-app/fixture-data.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),run=process.env.PROJECT_REVIEW_RUN;
if(!run||!process.env.ARCH_WASM_MODULE)throw Error('Assigned run and ARCH_WASM_MODULE required');
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),out=path.join(run,'evidence/text-rpc-'+stamp),work=path.join(run,'work/text-rpc-'+stamp);
await mkdir(out,{recursive:true});await mkdir(work,{recursive:true});
const fixture=await fixtureData(root),routes=new Map();
const bundle=path.join(work,'bundle');
await build({configFile:false,root,cacheDir:path.join(run,'cache/vite-text-rpc'),logLevel:'warn',
 build:{target:'es2022',modulePreload:false,outDir:bundle,emptyOutDir:false,minify:false,rollupOptions:{preserveEntrySignatures:'strict',input:{'engine-worker':path.join(root,'src/core/engine-worker.mjs'),'engine-text-renderer':path.join(root,'src/core/engine-text-renderer.mjs')},output:{entryFileNames:'[name].mjs',chunkFileNames:'chunks/[name]-[hash].mjs'}}}});
async function add(dir){for(const ent of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory())await add(p);else routes.set('/src/core/'+path.relative(bundle,p).replaceAll('\\','/'),await readFile(p));}}
await add(bundle);routes.set('/src/core/engine-client.mjs',await readFile(path.join(root,'src/core/engine-client.mjs')));
for(const ext of ['mjs','wasm'])routes.set('/runtime/arch-kernel.'+ext,await readFile(process.env.ARCH_WASM_MODULE.replace(/\.mjs$/,'.'+ext)));
// Asset bytes are frozen before launch; serving uses only this explicit map.
for(const [digest,file]of fixture.assetFiles)routes.set('/library/'+digest,await readFile(file));
const server=createServer((req,res)=>{
 res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('Cache-Control','no-store');
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="vi"><meta charset="utf-8"><title>Text RPC</title><body>Text RPC integration</body></html>');return;}
 const b=routes.get(req.url);if(!b){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',req.url.endsWith('.wasm')?'application/wasm':req.url.startsWith('/library/')?'application/octet-stream':'text/javascript');res.setHeader('Content-Length',b.length);res.end(b);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
test.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="10mm" viewBox="0 0 10 10"><path d="M0 0H10V10H0Z"/></svg>';
for(const [engine,type]of Object.entries({chromium,firefox,webkit}))test(`TEXT RPC ${engine}: same Module, Vietnamese preview, request capture, source failure and old mesh lease`,{timeout:120000},async()=>{
 const browser=await type.launchPersistentContext(path.join(run,'cache/text-rpc-'+stamp,engine),{headless:true,downloadsPath:path.join(work,'downloads',engine),...(engine==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
 const page=browser.pages()[0],errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await browser.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());await page.goto(origin);
  const result=await page.evaluate(async({catalog,assetURLs,state,svg,engine,engineVersion})=>{
   const{EngineClient}=await import('/src/core/engine-client.mjs');
   const{createEngineTextRenderer}=await import('/src/core/engine-text-renderer.mjs');
   const hash=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(b))),n=>n.toString(16).padStart(2,'0')).join('');
   const errorOf=async fn=>{try{await fn();return 'NO_ERROR';}catch(e){return e.code;}};
   const timings=[],renderers=[],canvasCount=document.querySelectorAll('canvas').length,fontCount=document.fonts.size;
   const factory=createEngineTextRenderer({catalog,onTiming:p=>timings.push(p)});
   const client=new EngineClient({moduleURL:'/runtime/arch-kernel.mjs',textConfig:{origin:location.origin,catalog,assetURLs,runtime:{engine,version:engineVersion}},
     createTextRenderer:input=>{const renderer=factory(input);renderers.push(renderer);return renderer;}});
   let generation=0,lease,retained=false;
   try{
    const init=client.start().then(()=> 'NO_ERROR',e=>e.code);client.terminate('INIT_RETIRED');
    if(await init!=='INIT_RETIRED')throw Error('Retired initialization did not reject its own waiter');
    lease=await client.build({kind:'svg',source:svg,thicknessMm:2},{generation:++generation});const before=await hash(lease.bytes()),epoch=client.epoch,worker=client.worker;
    const ticket={id:'text-request',userId:'fixture-user',projectId:'fixture-project',revision:state.revision,generation:77};
    const value='Tiếng Việt Ấ ộ',input={version:'arch-app-adapters/1',ticket,op:'text.import',state,assetsMap:new Map(),file:{name:'tieng-viet.txt',mediaType:'text/plain',bytes:new TextEncoder().encode(value)},sourceContext:{version:'arch-source-context/1',operation:'import',id:'text-source',revision:0,predecessor:null}};
    const promise=client.textOperation(input,{generation:++generation});input.file.bytes.fill(0);input.state.content.app.text.sizeMm='999';
    const text=await promise,after=await hash(lease.bytes());
    const bad=structuredClone(input);bad.file.bytes=new TextEncoder().encode(value);bad.sourceContext.revision=5;
    const rejected=await errorOf(()=>client.textOperation(bad,{generation:++generation}));
    const stl=await client.exportSTL(lease,0,{generation:++generation});
    globalThis.textRpcSession={client,lease,generation,hash,timings,renderers,canvasCount,fontCount};retained=true;
    return {before,after,afterFailure:await hash(lease.bytes()),sameEpoch:epoch===client.epoch,sameWorker:worker===client.worker,text:text.prepared.geometry?.text,preview:text.preview?{width:text.preview.width,height:text.preview.height,png:Array.from(text.preview.png.subarray(0,8)),hash:text.preview.sha256,transform:text.preview.pixelToSourceMm}:null,kind:text.prepared.kind,ticket:text.ticket,rejected,stlTriangles:new DataView(stl.buffer,stl.byteOffset,stl.byteLength).getUint32(80,true),services:client.serviceCapabilities};
   }finally{if(!retained){lease?.release();client.dispose();}}
  },{catalog:fixture.catalog,assetURLs:mappedAssets(fixture,origin),state:structuredClone(fixture.initialState),svg,engine,engineVersion:browser.browser().version()});
  assert.equal(result.sameEpoch,true);assert.equal(result.sameWorker,true);assert.equal(result.before,result.after);assert.equal(result.before,result.afterFailure);
  assert.equal(result.kind,'paths');assert.equal(result.text.originalText,'Tiếng Việt Ấ ộ');assert.equal(result.ticket.generation,77);
  assert.ok(result.preview?.width>0&&result.preview.height>0);assert.deepEqual(result.preview.png,[137,80,78,71,13,10,26,10]);
  assert.equal(result.rejected,'SOURCE_CONTEXT_PREDECESSOR');assert.equal(result.stlTriangles,12);assert.deepEqual(errors,[]);
  const color=async token=>page.evaluate(async({state,token})=>{
    const s=textRpcSession,epoch=s.client.epoch;
    const color=await s.client.textOperation({version:'arch-app-adapters/1',op:'emoji.select',
      ticket:{id:'color-'+s.generation,userId:'fixture-user',projectId:'fixture-project',revision:state.revision,generation:101},
      state,assetsMap:new Map(),id:token,collectionId:'noto-color-emoji',raster:{width:256,height:256},
      sourceContext:{version:'arch-source-context/1',operation:'import',id:'color-source',revision:0,predecessor:null}}, {generation:++s.generation});
    const colors=new Set();for(let i=0;i<color.preview.data.length;i+=4)if(color.preview.data[i+3]>128)colors.add(Array.from(color.preview.data.subarray(i,i+3)).join(','));
    return {epochBefore:epoch,epochAfter:s.client.epoch,kind:color.prepared.kind,selection:color.prepared.selection,
      renderer:color.preview.renderer,hash:color.preview.sha256,colors:colors.size,png:Array.from(color.preview.png),
      portFactories:s.renderers.length,noDomCanvas:document.querySelectorAll('canvas').length===s.canvasCount,
      timings:s.timings,capabilities:s.client.serviceCapabilities.text};
  },{state:structuredClone(fixture.initialState),token});
  result.color=await color('😀');
  assert.ok(result.color.colors>8,'Real color glyph has multiple source colors');assert.equal(result.color.selection.originalText,'😀');
  const fallback=engine==='webkit'&&!result.color.capabilities.canvas2d;
  assert.equal(result.color.portFactories,fallback?1:0);assert.equal(result.color.noDomCanvas,true);
  assert.equal(result.color.renderer.id,fallback?'main-thread-native-font-image/1':'browser-font-and-image/1');
  await writeFile(path.join(out,engine+'-color.png'),new Uint8Array(result.color.png));delete result.color.png;
  // Hold a new font's network response, then cancel while the same engine waits.
  // This distinguishes cooperative source cancellation from killing the Worker.
  const uncached=fixture.catalog.fonts.find(f=>f.id!==fixture.catalog.defaultFontId&&!f.color&&!f.id.includes('noto'));
  assert.ok(uncached);let entered,release;
  const enteredPromise=new Promise(resolve=>entered=resolve),held=new Promise(resolve=>release=resolve);
  await browser.route(origin+'/library/'+uncached.sha256,async route=>{entered();await held;await route.abort().catch(()=>{});});
  try{
    await page.evaluate(({state,fontId})=>{
      const s=textRpcSession;state.content.app.text.fontId=fontId;state.content.app.text.text='Nguồn đang chờ';
      s.cancelledText=s.client.textOperation({version:'arch-app-adapters/1',op:'prepare.text',ticket:{id:'cancel-text',userId:'fixture-user',projectId:'fixture-project',revision:state.revision,generation:99},state,assetsMap:new Map()},{generation:++s.generation}).then(()=> 'NO_ERROR',e=>e.code);
    },{state:structuredClone(fixture.initialState),fontId:uncached.id});
    let timer;
    try{await Promise.race([enteredPromise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Uncached font request not observed')),20000))]);}finally{clearTimeout(timer);}
    result.cancellation=await page.evaluate(async()=>{const s=textRpcSession,epoch=s.client.epoch;await s.client.cancel();return {code:await s.cancelledText,sameEpoch:s.client.epoch===epoch,hash:await s.hash(s.lease.bytes())};});
    assert.equal(result.cancellation.code,'CANCELLED');assert.equal(result.cancellation.sameEpoch,true);assert.equal(result.cancellation.hash,result.before);
  }finally{release();}
  result.colorAfterCancel=await color('👩🏽‍💻');delete result.colorAfterCancel.png;
  assert.equal(result.colorAfterCancel.epochBefore,result.colorAfterCancel.epochAfter);assert.ok(result.colorAfterCancel.colors>8);
  assert.equal(result.colorAfterCancel.portFactories,fallback?1:0);assert.equal(result.colorAfterCancel.selection.originalText,'👩🏽‍💻');
  const retirement=await page.evaluate(()=>{const s=textRpcSession;s.client.terminate('TEST_RETIRE');let code;try{s.lease.bytes();}catch(e){code=e.code;}
    return {code,fontsClean:document.fonts.size===s.fontCount,disposed:s.renderers.every(r=>r.stats().disposed)};});
  assert.deepEqual(retirement,{code:'SNAPSHOT_RETIRED',fontsClean:true,disposed:true});result.retirement=retirement;
  result.colorAfterRestart=await color('😀');delete result.colorAfterRestart.png;
  assert.equal(result.colorAfterRestart.portFactories,fallback?2:0);assert.ok(result.colorAfterRestart.colors>8);
  assert.equal(result.colorAfterRestart.hash,result.color.hash,'Same exact source and renderer reproduce after restart');assert.deepEqual(errors,[]);
  await writeFile(path.join(out,engine+'.json'),JSON.stringify({status:'pass',scope:'Root text/color transport with actual capabilities, source capture, same-Worker cancellation and port retirement; not complete product acceptance',...result},null,2));
 }catch(e){await writeFile(path.join(out,engine+'-failure.json'),JSON.stringify({error:e.stack,errors},null,2));throw e;}
 finally{await page.evaluate(()=>{globalThis.textRpcSession?.lease.release();globalThis.textRpcSession?.client.dispose();}).catch(()=>{});await browser.close();}
});
