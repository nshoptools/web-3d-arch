import test from'node:test';import assert from'node:assert/strict';import{readFile,writeFile,mkdir,readdir}from'node:fs/promises';import path from'node:path';import{fileURLToPath}from'node:url';import{createHash}from'node:crypto';import{createServer}from'node:http';
import{build}from'vite';import{chromium,firefox,webkit}from'playwright';import{extrusionOracle,frameOracle,geometryBytes}from'./oracles.mjs';
import{source as productSVG,makeRequest}from'../product-runtime/fixtures.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),run=process.env.PROJECT_REVIEW_RUN,modulePath=process.env.ARCH_KERNEL_MODULE;if(!run||!modulePath)throw Error('Own PROJECT_REVIEW_RUN and ARCH_KERNEL_MODULE required');
const out=path.join(run,'evidence/source-workers'),bundle=path.join(run,'work/source-worker-bundle'),hash=b=>createHash('sha256').update(b).digest('hex');await mkdir(out,{recursive:true});
const cases=[];for(const name of ['combined-vietnamese-original','combined-vietnamese-adopted','shared-hole-accent','oo-multiline','nfd-accent','nfd-regular-multiline'])cases.push({name,svg:await readFile(path.join(root,'tests/native-source/fixtures',name+'.svg'),'utf8')});
const golden=JSON.parse(await readFile(path.join(root,'tests/native-source/fixtures/clipper-viewport.json'),'utf8'));
const product=makeRequest('keychain','noi',{sourceHash:hash(productSVG),headHash:hash('framed-keychain')});
await build({configFile:false,root,cacheDir:path.join(run,'cache/vite-source-workers'),logLevel:'warn',build:{target:'es2022',modulePreload:false,outDir:bundle,emptyOutDir:false,minify:false,rollupOptions:{input:path.join(root,'src/core/engine-worker.mjs'),output:{entryFileNames:'engine-worker.mjs',chunkFileNames:'chunks/[name]-[hash].mjs'}}}});
const routes=new Map();async function add(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())await add(p);else routes.set('/src/core/'+path.relative(bundle,p).replaceAll('\\','/'),await readFile(p));}}await add(bundle);
for(const name of ['engine-client.mjs','source-frame.mjs','runtime-integrity.mjs'])routes.set('/src/core/'+name,await readFile(path.join(root,'src/core',name)));
for(const ext of ['mjs','wasm'])routes.set('/runtime/arch-kernel.'+ext,await readFile(modulePath.replace(/\.mjs$/,'.'+ext)));
const server=createServer((req,res)=>{for(const[k,v]of Object.entries({'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin','Cache-Control':'no-store'}))res.setHeader(k,v);if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Actual source root Worker tests</title>');return;}const b=routes.get(req.url);if(!b){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',req.url.endsWith('.wasm')?'application/wasm':'text/javascript');res.end(b);});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;test.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
for(const[engine,browserType]of Object.entries({chromium,firefox,webkit}))test('actual same root source frame Worker '+engine,{timeout:120000},async()=>{
 const context=await browserType.launchPersistentContext(path.join(run,'p/'+({chromium:'c',firefox:'f',webkit:'w'}[engine])),{headless:true,downloadsPath:path.join(run,'work/source-downloads',engine),...(engine==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
 const page=context.pages()[0]??await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await context.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());await page.goto(origin);
  const result=await page.evaluate(async({cases,productSVG,packed})=>{
   const{EngineClient}=await import('/src/core/engine-client.mjs');const client=new EngineClient({moduleURL:'/runtime/arch-kernel.mjs',cancelGraceMs:5000});let g=0;const checks=[],records=[];
   const ck=(c,n)=>{if(!c)throw Error('CHECK '+n);checks.push(n);};const error=async f=>{try{await f();return 'NO_ERROR';}catch(e){return e.code??e.message;}};
   const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(b))),v=>v.toString(16).padStart(2,'0')).join('');
   const options=(lease,matrix=[1,0,0,-1,-15,-6.25])=>({version:'arch-source-frame/1',sourceHash:lease.metadata.sourceHash,matrix});
   try{
    for(const c of cases){
     let src=null,framed=null;
     try{
      src=await client.build({kind:'svg',source:c.svg,thicknessMm:.2,longEdgeMm:0,toleranceMm:.001},{generation:++g});
      ck(client.serviceCapabilities.sourceFrameVersion===1,'actual frame version1 '+c.name);
      const before=src.bytes().slice(),matrix=c.name==='combined-vietnamese-original'?[1,0,0,-1,-.1294126883682002,13.453764550524818]:[1,0,0,-1,-15,-6.25];
      const request=options(src,matrix),pending=client.sourceFrame(src,request,{generation:++g});request.matrix[4]=9000;framed=await pending;
      ck(await sha(src.bytes())===await sha(before),'immutable original '+c.name);
      ck(framed.metadata.sourceFrame.sourceSnapshotSha256===await sha(before),'exact source hash binding '+c.name);
      ck(framed.metadata.sourceFrame.requestedMatrix[4]!==9000,'request captured before yield '+c.name);
      ck(await error(()=>client.sourceFrame({...src},options(src),{generation:++g}))==='SNAPSHOT_LEASE_OWNERSHIP','forged lease rejected');
      ck(await error(()=>client.sourceFrame(src,{...options(src),sourceHash:'0'.repeat(64)},{generation:++g}))==='SOURCE_FRAME_HASH','wrong source hash rejected');
      ck(await error(()=>client.sourceFrame(framed,options(framed),{generation:++g}))==='SOURCE_FRAME_ALREADY_APPLIED','no hidden repeated rounding');
      ck(await error(()=>client.sourceFrame(src,options(src,[1,0,.5,1,0,0]),{generation:++g}))==='SOURCE_FRAME_ISOMETRY_REQUIRED','shear rejected');
      const f=framed.bytes().slice();records.push({name:c.name,original:Array.from(before),frame:Array.from(f),metadata:framed.metadata});
     }finally{framed?.release();src?.release();}
    }
    let src=await client.build({kind:'svg',source:productSVG,thicknessMm:.2,longEdgeMm:0,toleranceMm:.001},{generation:++g});
    const worker=client.worker,epoch=client.epoch,before=await sha(src.bytes()),oldId=src.id;
    let cancelOnce=false;client.onStatus=s=>{if(s.phase==='running'&&!cancelOnce){cancelOnce=true;void client.cancel();}};
    ck(await error(()=>client.sourceFrame(src,options(src),{generation:++g}))==='CANCELLED','controlled running-frame cancellation no publication');client.onStatus=()=>{};
    const f=await client.sourceFrame(src,options(src),{generation:++g});
    // Release source while its frame is usable: the frame owns independent XY.
    src.release();ck(await error(()=>client.sourceFrame(src,options(src),{generation:++g}))==='SNAPSHOT_RELEASED','released reader cannot start a job');
    let product=null;
    try{
     product=await client.build({kind:'product',source:{kind:'snapshot',id:f.id,generation:f.generation,epoch:f.epoch},packed:new Uint8Array(packed)},{generation:++g});
     ck(product.metadata.kind==='product','framed planar context consumed by actual source assembly');
     ck(new DataView(product.bytes().buffer,product.bytes().byteOffset,product.byteLength).getUint32(24,true)>0,'assembly produces real triangles');
    }finally{product?.release();}
    const held=f.bytes().slice();ck(await sha(held)===f.metadata.sourceFrame.geometrySha256,'independent frame remains after assembly');
    ck(worker===client.worker&&epoch===client.epoch,'one Worker and Module for source/frame/product');
    client.terminate('TEST_PRIVATE_RETIRE');ck(client.serviceCapabilities.sourceFrameVersion===null,'retire version proof');
    const seq=client.requestSequence;f.release();ck(await error(()=>client.sourceFrame(f,options(f),{generation:++g}))==='SNAPSHOT_RETIRED','retired opaque lease never restored');
    ck(client.worker===null&&seq===client.requestSequence,'cleanup no runtime restart');
    g=0;const again=await client.build({kind:'svg',source:productSVG,thicknessMm:.2,longEdgeMm:0,toleranceMm:.001},{generation:++g});
    ck(again.epoch!==epoch&&client.serviceCapabilities.sourceFrameVersion===1,'replacement obtains new actual capability');
    ck(await error(()=>client.sourceFrame(f,options(f),{generation:++g}))==='SNAPSHOT_RETIRED','old frame stays retired after replacement/ABA');
    again.release();return{checks,records};
   }finally{client.dispose();}
  },{cases,productSVG,packed:Array.from(product.packed)});
  const records=[];
  for(const r of result.records){
   const original=Buffer.from(r.original),framed=Buffer.from(r.frame),expected=r.name.startsWith('combined')?{canonicalContours:golden.cases[r.name].contours}:r.name==='shared-hole-accent'?{svgAffineArea:185}:{};
   const metrics=extrusionOracle(original,expected),frame=frameOracle(original,framed,r.metadata),native=await readFile(path.join(run,'evidence/native-source',r.name+'.arch'));
   assert.deepEqual(geometryBytes(original),geometryBytes(native),'native/browser geometry bytes');
   await writeFile(path.join(out,engine+'-'+r.name+'.arch'),original);await writeFile(path.join(out,engine+'-'+r.name+'-frame.arch'),framed);
   records.push({name:r.name,metrics,frame,metadata:r.metadata});
  }
  assert.deepEqual(errors,[]);await writeFile(path.join(out,engine+'.json'),JSON.stringify({status:'pass',engine,checks:result.checks,records,errors,moduleSha256:hash(routes.get('/runtime/arch-kernel.wasm'))},null,2));
 }catch(e){await writeFile(path.join(out,engine+'-failure.json'),JSON.stringify({error:e.stack,errors},null,2));throw e;}finally{await context.close();}
});

