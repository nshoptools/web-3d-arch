import test from 'node:test';import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath} from 'node:url';import {createServer} from 'node:http';
import {build} from 'vite';import {chromium,firefox,webkit} from 'playwright';
import {oracle} from '../../src/kernel/final-scene-export/tests/oracles.mjs';
import {source as productSource,makeRequest} from '../product-runtime/fixtures.mjs';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../../',import.meta.url)),run=process.env.PROJECT_REVIEW_RUN;
if(!run||!process.env.ARCH_WASM_MODULE)throw Error('Assigned run and ARCH_WASM_MODULE required');
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),out=path.join(run,'evidence/final-export-rpc-'+stamp),work=path.join(run,'work/final-export-rpc-'+stamp);
await mkdir(out,{recursive:true});await mkdir(work,{recursive:true});const routes=new Map(),bundle=path.join(work,'bundle');
await build({configFile:false,root,cacheDir:path.join(run,'cache/vite-final-rpc'),logLevel:'warn',build:{target:'es2022',modulePreload:false,outDir:bundle,emptyOutDir:false,minify:false,
  rollupOptions:{input:path.join(root,'src/core/engine-worker.mjs'),output:{entryFileNames:'engine-worker.mjs',chunkFileNames:'chunks/[name]-[hash].mjs'}}}});
async function add(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())await add(p);else routes.set('/src/core/'+path.relative(bundle,p).replaceAll('\\','/'),await readFile(p));}}
await add(bundle);routes.set('/src/core/engine-client.mjs',await readFile(path.join(root,'src/core/engine-client.mjs')));
for(const ext of ['mjs','wasm'])routes.set('/runtime/arch-kernel.'+ext,await readFile(process.env.ARCH_WASM_MODULE.replace(/\.mjs$/,'.'+ext)));
const server=createServer((req,res)=>{for(const[k,v]of Object.entries({'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin','Cache-Control':'no-store'}))res.setHeader(k,v);
  if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><title>Final scene RPC</title>');return;}
  const b=routes.get(req.url);if(!b){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',req.url.endsWith('.wasm')?'application/wasm':'text/javascript');res.end(b);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
test.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="10mm" viewBox="0 0 10 10"><path fill="#ff0000" fill-rule="evenodd" d="M0 0H5V10H0Z M2 4V6H3V4Z"/><path fill="#0000ff" d="M5 0H10V10H5Z"/></svg>';
const sourceHash=createHash('sha256').update(productSource).digest('hex');
const authorityCases=[['charm','charmRap'],['clicky','assemble'],['keychain',null]].map(([product,field])=>{
 const r=makeRequest(product,'noi',{sourceHash,headHash:createHash('sha256').update('authority-'+product).digest('hex'),changes:field?[{id:field,value:true}]:[]});
 return {product,blocked:!!field,revision:String(r.project.revision),packed:Array.from(r.packed)};
});
for(const[engine,type]of Object.entries({chromium,firefox,webkit}))test('Product export authority RPC '+engine,{timeout:120000},async()=>{
 const browser=await type.launchPersistentContext(path.join(run,'p/authority-'+stamp+'-'+engine),{headless:true,downloadsPath:path.join(work,'authority-downloads',engine),...(engine==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
 const page=browser.pages()[0],errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{await browser.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());await page.goto(origin);
  const result=await page.evaluate(async({source,cases})=>{
   const {EngineClient}=await import('/src/core/engine-client.mjs'),client=new EngineClient({moduleURL:'/runtime/arch-kernel.mjs'});let generation=0;const results=[];
   const failure=async f=>{try{await f();return 'NO_ERROR';}catch(e){return e.code??e.message;}};
   try{for(const item of cases){const lease=await client.build({kind:'product',source:{kind:'svg',source},packed:new Uint8Array(item.packed)},{generation:++generation});
    try{const b=lease.bytes(),v=new DataView(b.buffer,b.byteOffset,b.byteLength),at=v.getUint32(56,true),count=v.getUint32(28,true);
     const base={format:1,generation:lease.generation,gates:0,verdict:1,inspection:0,revision:item.revision,expectedRevision:item.revision,filename:'Product authority',mapping:Array.from({length:count},(_,i)=>({part:i,slot:i%16+1,rgba:v.getUint32(at+i*40+16,true),source:v.getUint32(at+i*40+20,true),materialSource:i+1,reserved:0}))};
     const codes=[];for(const format of [1,2,3])for(const inspection of [0,1])codes.push(await failure(()=>client.finalExport(lease,{...base,format,inspection,...(item.blocked?{}:{revision:'9007199254741235',expectedRevision:'9007199254741235'})},{generation:++generation})));
     const legacy=item.blocked?await failure(()=>client.exportSTL(lease,0,{generation:++generation})):null;
     const valid=item.blocked?null:await client.finalExport(lease,base,{generation:++generation});
     results.push({product:item.product,blocked:item.blocked,codes,legacy,revision:valid?.metadata.sourceProjectRevision??null,bytes:valid?.bytes.length??0,expectedRevision:item.revision});
    }finally{lease.release();}}
    return results;
   }finally{client.dispose();}
  },{source:productSource,cases:authorityCases});
  for(const r of result){assert.deepEqual(r.codes,Array(6).fill(r.blocked?'ASSEMBLY_VIEW':'STALE_REVISION'));if(r.blocked)assert.equal(r.legacy,'ASSEMBLY_VIEW');else{assert.equal(r.revision,r.expectedRevision);assert.ok(r.bytes>84);}}
  assert.deepEqual(errors,[]);await writeFile(path.join(out,engine+'-product-authority.json'),JSON.stringify({scope:'Immutable root product payload and actual EngineClient/Worker export; explicit fixture material mapping, not application qualification',result,errors},null,2));
 }finally{await browser.close();}
});
for(const[engine,type]of Object.entries({chromium,firefox,webkit}))test('Final scene RPC '+engine+': actual union/ZIP/section, gates and exact snapshot owner',{timeout:120000},async()=>{
  const browser=await type.launchPersistentContext(path.join(run,'p/final-'+stamp+'-'+engine),{headless:true,downloadsPath:path.join(work,'downloads',engine),...(engine==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
  const page=browser.pages()[0],errors=[],network=[],started=Date.now();page.on('pageerror',e=>errors.push(e.message));
  const mark=(event,detail)=>{if(network.length<200)network.push({ms:Date.now()-started,event,detail});};
  page.on('request',r=>mark('request',new URL(r.url()).pathname));
  page.on('requestfailed',r=>mark('failed',{path:new URL(r.url()).pathname,error:r.failure()?.errorText}));
  page.on('response',r=>mark('response',{path:new URL(r.url()).pathname,status:r.status()}));
  page.on('domcontentloaded',()=>mark('domcontentloaded'));page.on('load',()=>mark('load'));
  try{await browser.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());await page.goto(origin);
    const result=await page.evaluate(async svg=>{
      const{EngineClient}=await import('/src/core/engine-client.mjs');const client=new EngineClient({moduleURL:'/runtime/arch-kernel.mjs',cancelGraceMs:5000});
      const hash=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(b))),v=>v.toString(16).padStart(2,'0')).join('');
      const fail=async f=>{try{await f();return 'NO_ERROR';}catch(e){return e.code??e.message;}};let generation=0,lease;
      try{lease=await client.build({kind:'svg',source:svg,thicknessMm:2},{generation:++generation});const before=await hash(lease.bytes()),epoch=client.epoch,worker=client.worker;
        const d=new DataView(lease.bytes().buffer,lease.bytes().byteOffset,lease.byteLength),count=d.getUint32(28,true),at=d.getUint32(56,true);
        // Explicit fixture material IDs/validity: the Node oracle separately
        // checks these manufactured files. Production gates come from the app.
        const config={format:1,gates:0,verdict:1,inspection:0,revision:'9',expectedRevision:'9',filename:'Nguồn có lỗ',generation:lease.generation,
          mapping:Array.from({length:count},(_,part)=>({part,slot:part+1,rgba:d.getUint32(at+part*40+16,true),source:d.getUint32(at+part*40+20,true),materialSource:900+part,reserved:0}))};
        const request=structuredClone(config),pending=client.finalExport(lease,request,{generation:++generation});request.gates=1;request.mapping[0].rgba=0;
        const first=await pending,files=[{config,result:{bytes:Array.from(first.bytes),metadata:first.metadata},expect:{volume:196,euler:0,probes:[[2.5,5,[]],[1,1,[0,2]]]}}];
        for(const [format,extra,expect]of [[2,{}, {volume:196,groups:2,groupVolumes:[96,100]}],[3,{z0:1,z1:1,side:0,color:0,units:0},{areas:[98]}]]){
          const c={...config,...extra,format},r=await client.finalExport(lease,c,{generation:++generation});files.push({config:c,result:{bytes:Array.from(r.bytes),metadata:r.metadata},expect});
        }
        const invalid=await fail(()=>client.finalExport(lease,{...config,gates:1,inspection:1},{generation:++generation}));
        const forged=await fail(()=>client.finalExport({...lease},config,{generation:++generation}));
        const mismatched=await fail(()=>client.finalExport(lease,{...config,generation:lease.generation+1},{generation:++generation}));
        const stale=await fail(()=>client.finalExport(lease,{...config,expectedRevision:'10'},{generation:++generation}));
        const cloneFailure=await fail(()=>client.finalExport(lease,{...config,callback:()=>{}},{generation:++generation}));
        const sharedFailure=await fail(()=>client.finalExport(lease,{...config,borrowed:new Uint8Array(new SharedArrayBuffer(8))},{generation:++generation}));
        let cancelled=false;client.onStatus=s=>{if(s.phase==='running'&&!cancelled){cancelled=true;void client.cancel();}};
        const cancelledCode=await fail(()=>client.finalExport(lease,config,{generation:++generation}));client.onStatus=()=>{};
        const after=await client.finalExport(lease,config,{generation:++generation});const unchanged=before===await hash(lease.bytes()),reproduced=await hash(after.bytes)===await hash(first.bytes);
        const oldSTL=await client.exportSTL(lease,0,{generation:++generation});
        const sameWorker=worker===client.worker&&epoch===client.epoch;lease.release();const released=await fail(()=>client.finalExport(lease,config,{generation:++generation}));
        const replacement=await client.build({kind:'svg',source:svg,thicknessMm:3},{generation:++generation});client.terminate('TEST_FINAL_RETIRE');
        const seq=client.requestSequence,retired=await fail(()=>client.finalExport(replacement,config,{generation:++generation}));const noRestart=client.worker===null&&seq===client.requestSequence;
        return {files,invalid,forged,mismatched,stale,cloneFailure,sharedFailure,cancelledCode,unchanged,reproduced,sameWorker,released,retired,noRestart,legacyBytes:oldSTL.length,capabilities:client.serviceCapabilities};
      }finally{lease?.release();client.dispose();}
    },svg);
    assert.equal(result.invalid,'INVALID_INPUT');assert.equal(result.forged,'SNAPSHOT_LEASE_OWNERSHIP');assert.equal(result.mismatched,'SNAPSHOT_GENERATION');
    assert.notEqual(result.stale,'NO_ERROR');assert.equal(result.cloneFailure,'REQUEST_SERIALIZATION');assert.equal(result.sharedFailure,'REQUEST_SHARED_MEMORY');assert.equal(result.cancelledCode,'CANCELLED');
    assert.equal(result.unchanged,true);assert.equal(result.reproduced,true);assert.equal(result.sameWorker,true);assert.equal(result.released,'SNAPSHOT_RELEASED');assert.equal(result.retired,'SNAPSHOT_RETIRED');assert.equal(result.noRestart,true);assert.ok(result.legacyBytes>84);
    assert.equal(result.capabilities.finalExport,true);assert.deepEqual(result.capabilities.geometryVersions,{mechanicsAbi:2,mechanicsSemantics:3,sourceAbi:1,sourceSemantics:2,datumExtension:1});
    const metrics=[];for(const f of result.files){const bytes=Buffer.from(f.result.bytes);metrics.push(oracle({config:f.config,expect:f.expect},{ok:true,phase:2,progress:1000,sourceUnchanged:true,inputConsumed:true,metadata:f.result.metadata},bytes));await writeFile(path.join(out,engine+'-'+f.config.format+'.bin'),bytes);delete f.result.bytes;}
    assert.deepEqual(errors,[]);await writeFile(path.join(out,engine+'.json'),JSON.stringify({status:'pass',scope:'Root native export transport plus independent file/analytic oracles; synthetic trusted gates, not whole application gate qualification',...result,metrics},null,2));
  }catch(e){await writeFile(path.join(out,engine+'-failure.json'),JSON.stringify({error:e.stack,errors,network},null,2));throw e;}finally{await writeFile(path.join(out,engine+'-network.json'),JSON.stringify(network,null,2));await browser.close();}
});
