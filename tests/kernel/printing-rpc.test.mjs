import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,firefox,webkit} from 'playwright';
import {build} from 'vite';
import {fixtureProfile} from '../../src/printing/tests/profile-fixtures.mjs';
import {sealed,sha256} from '../../src/printing/src/contracts.mjs';
import {inspect3MF} from '../../src/printing/src/zip-inspect.mjs';
import {inspectMesh} from '../oracles/mesh-oracle.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)),run=process.env.PROJECT_REVIEW_RUN;
if(!run||!process.env.ARCH_WASM_MODULE)throw Error('Run environment and ARCH_WASM_MODULE required');
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),out=path.join(run,'evidence/printing-rpc-'+stamp);
await mkdir(out,{recursive:true});
const profile=await fixtureProfile(root,'bambu');
const source='<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="0 0 20 10"><path fill="#0099cc" fill-rule="evenodd" d="M0 0H10V10H0Z M3 3H7V7H3Z"/><path fill="#ee7733" d="M10 0H20V10H10Z"/></svg>';
const request={schemaVersion:1,purpose:'inspection',revision:'analytic-revision-1',printerProfile:profile,
  schedule:await sealed({schemaVersion:1,kind:'constant-first-regular',profileId:profile.payload.id,profileHash:profile.sha256,
    firstLayerHeight:.2,layerHeight:.2,origin:{firstLayerHeight:'user',layerHeight:'profile'}}),
  parts:[{partIndex:0,id:'blue-ring',name:'Khối xanh có lỗ',materialId:'blue'},{partIndex:1,id:'orange-box',name:'Khối cam',materialId:'orange'}],
  materialTable:{schemaVersion:1,materials:['#0099CC','#EE7733'].map((color,i)=>({id:i?'orange':'blue',name:i?'Cam':'Xanh',color,type:profile.payload.settings.filament_type[i],slot:i+1,extruder:1}))},
  sourceHashes:[{id:'analytical-hole-seam.svg',sha256:await sha256(new TextEncoder().encode(source))}]};
// Freeze the tested public inputs in memory before serving; no mutable repo file
// can change an active test's module pair or imported JavaScript.
const routes=new Map();
for(const dir of ['src/core','src/printing/src','src/viewport'])for(const name of await readdir(path.join(root,dir)))
  if(name.endsWith('.mjs'))routes.set('/'+dir+'/'+name,await readFile(path.join(root,dir,name)));
const bundle=path.join(run,'work/printing-rpc-'+stamp,'bundle');
await build({configFile:false,root,cacheDir:path.join(run,'cache/vite-printing-rpc'),logLevel:'warn',
  build:{target:'es2022',modulePreload:false,outDir:bundle,emptyOutDir:false,minify:false,rollupOptions:{input:path.join(root,'src/core/engine-worker.mjs'),
    output:{entryFileNames:'engine-worker.mjs',chunkFileNames:'chunks/[name]-[hash].mjs'}}}});
async function bundleRoutes(dir){for(const entry of await readdir(dir,{withFileTypes:true})){
  const file=path.join(dir,entry.name);if(entry.isDirectory())await bundleRoutes(file);
  else routes.set('/src/core/'+path.relative(bundle,file).replaceAll('\\','/'),await readFile(file));
}}
await bundleRoutes(bundle);
for(const ext of ['mjs','wasm'])routes.set('/runtime/arch-kernel.'+ext,await readFile(process.env.ARCH_WASM_MODULE.replace(/\.mjs$/,'.'+ext)));
const server=createServer((req,res)=>{
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
  res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('Cache-Control','no-store');
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="vi"><meta charset="utf-8"><title>Printing RPC test</title><body>Actual Worker export</body></html>');return;}
  const bytes=routes.get(url.pathname);if(!bytes){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',url.pathname.endsWith('.wasm')?'application/wasm':'text/javascript');res.end(bytes);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
test.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));

for(const [engine,type]of Object.entries({chromium,firefox,webkit}))test(`PRINT RPC ${engine}: reader ownership, errors, cancellation and both 3MF paths`,{timeout:120000},async()=>{
  const browser=await type.launchPersistentContext(path.join(run,'cache/printing-rpc-'+stamp,engine),{headless:true,
    downloadsPath:path.join(run,'work/printing-rpc-'+stamp,'downloads',engine),...(engine==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
  const page=browser.pages()[0],errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await browser.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
    await page.goto(origin);
    const result=await page.evaluate(async({source,request})=>{
      const {EngineClient}=await import('/src/core/engine-client.mjs');
      const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes))),n=>n.toString(16).padStart(2,'0')).join('');
      const fail=async(fn)=>{try{await fn();return 'NO_ERROR';}catch(e){return e.code;}};
      const client=new EngineClient({moduleURL:'/runtime/arch-kernel.mjs'}),artifacts=[];
      let generation=0,lease;
      try{
        const buildRequest={kind:'svg',source,thicknessMm:2};
        const firstBuild=client.build(buildRequest,{generation:++generation});
        buildRequest.source='changed after dispatch';
        const invalidDuringInit=await fail(()=>client.build({kind:'svg',source,invalid:()=>{}},{generation:++generation}));
        lease=await firstBuild;
        const original=await hash(lease.bytes());
        const exportRequest=structuredClone(request);
        const firstExport=client.export3MF(lease,exportRequest,{generation:++generation,format:'core'});
        exportRequest.materialTable.materials[0].color='#FFFFFF';
        const core=await firstExport;
        artifacts.push({name:'core.3mf',bytes:Array.from(core.bytes),report:core.report});
        const afterCore=await hash(lease.bytes());
        const invalid=structuredClone(request);invalid.materialTable.materials[0].color='#FFFFFF';
        const invalidCode=await fail(()=>client.export3MF(lease,invalid,{generation:++generation}));
        const afterFailure=await hash(lease.bytes());
        const project=await client.export3MF(lease,request,{generation:++generation,format:'project'});
        artifacts.push({name:'bambu.3mf',bytes:Array.from(project.bytes),report:project.report});
        const afterProject=await hash(lease.bytes());
        const cloneFailure=await fail(()=>client.export3MF(lease,{...request,uncloneable:()=>{}},{generation:++generation}));
        const sharedFailure=await fail(()=>client.export3MF(lease,{...request,borrowed:new Uint8Array(new SharedArrayBuffer(4))},{generation:++generation}));
        const idleAfterCloneFailure=client.active===null;
        let started;
        const running=new Promise(r=>started=r);
        client.onStatus=s=>{if(s.phase==='running')started();};
        const pending=client.export3MF(lease,request,{generation:++generation}).then(()=> 'PUBLISHED',e=>e.code);
        await running;await client.cancel();const cancelled=await pending;
        const afterCancel=await hash(lease.bytes());
        // Exercise repeated failed exports while the original mesh remains
        // readable and a subsequent export still succeeds. This does not alone
        // prove every reader was reclaimed; native ownership tests cover that.
        for(let i=0;i<10;i++)if(await fail(()=>client.export3MF(lease,invalid,{generation:++generation}))!=='SNAPSHOT_MATERIAL_COLOR')throw Error('Invalid export changed behavior');
        const stl=await client.exportSTL(lease,0,{generation:++generation});
        const afterPressure=await hash(lease.bytes());
        lease.release();
        const released=await fail(()=>client.export3MF(lease,request,{generation:++generation}));
        const next=await client.build({kind:'svg',source,thicknessMm:2},{generation:++generation});
        client.terminate('TEST_RESET');
        const retired=await fail(()=>client.export3MF(next,request,{generation:++generation}));
        next.release();
        return {original,afterCore,afterFailure,afterProject,afterCancel,afterPressure,invalidCode,invalidDuringInit,cloneFailure,sharedFailure,idleAfterCloneFailure,cancelled,released,retired,stlBytes:stl.length,artifacts};
      }finally{lease?.release();client.dispose();}
    },{source,request});
    for(const key of ['afterCore','afterFailure','afterProject','afterCancel','afterPressure'])assert.equal(result[key],result.original,key);
    assert.equal(result.invalidCode,'SNAPSHOT_MATERIAL_COLOR');assert.equal(result.cancelled,'CANCELLED');
    assert.equal(result.cloneFailure,'REQUEST_SERIALIZATION');assert.equal(result.idleAfterCloneFailure,true);
    assert.equal(result.invalidDuringInit,'REQUEST_SERIALIZATION');assert.equal(result.sharedFailure,'REQUEST_SHARED_MEMORY');
    assert.equal(result.released,'SNAPSHOT_RELEASED');assert.equal(result.retired,'SNAPSHOT_RETIRED');assert.ok(result.stlBytes>84);
    for(const artifact of result.artifacts){
      const bytes=new Uint8Array(artifact.bytes),parsed=await inspect3MF(bytes,artifact.name==='bambu.3mf'?{adapterId:profile.payload.adapterId}:{});
      assert.equal(parsed.meshes.length,2);
      const oracles=parsed.meshes.map(mesh=>inspectMesh({vertices:mesh.vertices,faces:mesh.faces}));
      assert.ok(Math.abs(oracles[0].volume-168)<.001);assert.ok(Math.abs(oracles[1].volume-200)<.001);
      await writeFile(path.join(out,engine+'-'+artifact.name),bytes);
      artifact.byteLength=bytes.length;artifact.oracles=oracles;delete artifact.bytes;
    }
    assert.deepEqual(errors,[]);
    await writeFile(path.join(out,engine+'-result.json'),JSON.stringify({status:'pass',engine,version:browser.browser().version(),result,errors,scope:'actual shared Worker RPC; analytic SVG, not product or slicer qualification'},null,2));
  }catch(error){await writeFile(path.join(out,engine+'-failure.json'),JSON.stringify({status:'fail',error:error.stack,errors},null,2));throw error;}
  finally{await browser.close();}
});
