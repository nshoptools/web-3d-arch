import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,appendFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {chromium,firefox,webkit} from 'playwright';
import {readSTL,inspectMesh} from '../oracles/mesh-oracle.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const run=process.env.PROJECT_REVIEW_RUN;
const modulePath=process.env.ARCH_WASM_MODULE;
if(!run||!modulePath)throw new Error('Project environment and ARCH_WASM_MODULE are required.');
const output=path.join(run,'evidence','browser-kernel');await mkdir(output,{recursive:true});
const routes=new Map([
  ['/src/core/engine-client.mjs',path.join(root,'src/core/engine-client.mjs')],
  ['/src/core/engine-worker.mjs',path.join(root,'src/core/engine-worker.mjs')],
  ['/src/core/source-preview.mjs',path.join(root,'src/core/source-preview.mjs')],
  ['/src/core/png-encode.mjs',path.join(root,'src/core/png-encode.mjs')],
  ['/src/viewport/arch-view.mjs',path.join(root,'src/viewport/arch-view.mjs')],
  ['/tests/kernel/stalled-worker.mjs',path.join(root,'tests/kernel/stalled-worker.mjs')],
  ['/engine/arch-kernel.mjs',modulePath],
  ['/engine/arch-kernel.wasm',modulePath.replace(/\.mjs$/,'.wasm')],
]);
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname!=='/without-coi'){
    res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
  }
  res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('Cache-Control','no-store');
  if(url.pathname==='/'||url.pathname==='/without-coi'){
    res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="vi"><meta charset="utf-8"><title>Kernel test harness</title><body>Worker/WASM contract test harness</body></html>');return;
  }
  if(!routes.has(url.pathname)){res.writeHead(404);res.end('Not found');return;}
  try{const bytes=await readFile(routes.get(url.pathname));res.setHeader('Content-Type',url.pathname.endsWith('.wasm')?'application/wasm':'text/javascript; charset=utf-8');res.end(bytes);}
  catch{res.writeHead(500);res.end('Fixture unavailable');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
test.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));

for(const [name,type] of Object.entries({chromium,firefox,webkit}))test(`G2 ${name}: real Worker/SAB, generations, cancellation, errors, watchdog and COI gate`,{timeout:90000},async()=>{
  const phase=label=>appendFile(path.join(output,`${name}-phases.jsonl`),JSON.stringify({at:new Date().toISOString(),label})+'\n');
  await phase('launch-start');
  const browser=await type.launch({headless:true});await phase('launch-complete');
  const page=await browser.newPage();await phase('page-created');
  try{
    await page.goto(origin);
    await phase('harness-loaded');
    const result=await page.evaluate(async()=>{
      const {EngineClient}=await import('/src/core/engine-client.mjs');
      const statuses=[];const client=new EngineClient({moduleURL:'/engine/arch-kernel.mjs',onStatus:s=>statuses.push(s)});
      await client.start();
      const describe=lease=>{
        const bytes=lease.bytes(),d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
        const count=d.getUint32(28,true),offset=d.getUint32(56,true);
        return {generation:d.getUint32(16,true),parts:count,volumes:Array.from({length:count},(_,i)=>d.getFloat64(offset+40*i+32,true)),shared:bytes.buffer instanceof SharedArrayBuffer};
      };
      const first=await client.build({kind:'test-fixture',index:0},{generation:1});const initial=describe(first);
      const second=await client.build({kind:'test-fixture',index:2},{generation:2});const next=describe(second);
      const retained=describe(first);
      let invalid;
      try{await client.build({kind:'test-fixture',index:999},{generation:3});}catch(e){invalid=e.code;}
      const afterFailure=describe(second);
      let runningResolve;
      const running=new Promise(r=>runningResolve=r);
      client.onStatus=s=>{statuses.push(s);if(s.phase==='running')runningResolve();};
      const pending=client.build({kind:'test-fixture',index:2},{generation:4}).then(lease=>{lease.release();return 'published';},e=>e.code);
      await running;await client.cancel();const cancelled=await pending;
      first.release();second.release();let releaseError;
      try{first.bytes();}catch(e){releaseError=e.code;}
      const recovered=await client.build({kind:'test-fixture',index:1},{generation:5});const recovery=describe(recovered);recovered.release();
      const source='<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="0 0 20 10"><path fill-rule="evenodd" d="M0 0H20V10H0Z M8 3H12V7H8Z"/></svg>';
      const imported=await client.build({kind:'svg',source,thicknessMm:2},{generation:6});
      const svg={...describe(imported),metadata:imported.metadata};
      const stl=await client.exportSTL(imported,0,{generation:7});
      let raw='';for(const b of stl)raw+=String.fromCharCode(b);const stlBase64=btoa(raw);
      let invalidExport;try{await client.exportSTL(imported,999,{generation:8});}catch(e){invalidExport=e.code;}
      const retry=await client.exportSTL(imported,0,{generation:9});
      if(retry.length!==stl.length||!retry.every((v,i)=>v===stl[i]))throw new Error('Export retry changed source/bytes');
      const preview=await client.previewSVG({kind:'svg',source,thicknessMm:.2},{generation:10,resolution:200,includeRGBA:true});
      const p=preview.preview,at=(x,y)=>Array.from(p.rgba.slice((y*p.width+x)*4,(y*p.width+x)*4+4));
      const previewProof={width:p.width,height:p.height,pixelSizeMm:p.pixelSizeMm,hole:at(100,50),solid:at(20,20),pngSignature:Array.from(p.png.slice(0,8)),frame:p.frame,sourceHash:preview.metadata.sourceHash};
      const image=new Image(),imageURL=URL.createObjectURL(new Blob([p.png],{type:'image/png'}));
      try{
        await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('PNG decode failed'));image.src=imageURL;});
        const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
        const context=canvas.getContext('2d');context.drawImage(image,0,0);
        previewProof.decodedPNG={width:image.width,height:image.height,hole:Array.from(context.getImageData(100,50,1,1).data),solid:Array.from(context.getImageData(20,20,1,1).data)};
      }finally{URL.revokeObjectURL(imageURL);}
      const afterPreview=await client.exportSTL(imported,0,{generation:11});
      if(!afterPreview.every((v,i)=>v===stl[i]))throw new Error('Preview changed retained model');
      const seamSource='<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="0 0 20 10"><path fill="#ff0000" d="M0 0H10.03V10H0Z"/><path fill="#0000ff" d="M10.03 0H20V10H10.03Z"/></svg>';
      const seamPreview=await client.previewSVG({kind:'svg',source:seamSource,thicknessMm:.2},{generation:12,resolution:200,includeRGBA:true});
      previewProof.seamPixel=Array.from(seamPreview.preview.rgba.slice((50*200+100)*4,(50*200+100)*4+4));
      let previewRejected;try{await client.previewSVG({kind:'svg',source:'<svg><script>alert(1)</script></svg>'},{generation:13,resolution:200});}catch(e){previewRejected=e.code;}
      imported.release();
      client.dispose();
      let frames=0,animate=true;function frame(){frames++;if(animate)requestAnimationFrame(frame);}requestAnimationFrame(frame);
      const stalled=new EngineClient({moduleURL:'/engine/arch-kernel.mjs',workerURL:'/tests/kernel/stalled-worker.mjs',watchdogMs:300});
      let watchdog;
      try{await stalled.build({kind:'test-fixture',index:0},{generation:1});}catch(e){watchdog=e.code;}
      stalled.dispose();animate=false;
      return {isolated:crossOriginIsolated,initial,next,retained,invalid,afterFailure,cancelled,releaseError,recovery,svg,stlBase64,invalidExport,previewProof,previewRejected,watchdog,frames};
    });
    await phase('worker-scenarios-complete');
    assert.equal(result.isolated,true);assert.equal(result.initial.shared,true);
    // Volume is a computed float, not a canonical serialized integer. Use
    // the same independent 1e-8 mm³ analytic tolerance as the native oracle.
    for(const [actual,expected] of [[result.initial.volumes,[368]],[result.next.volumes,[200,100,100]]]){
      assert.equal(actual.length,expected.length);actual.forEach((value,i)=>assert.ok(Math.abs(value-expected[i])<=1e-8));
    }
    assert.deepEqual(result.retained,result.initial);assert.deepEqual(result.afterFailure,result.next);
    assert.equal(result.invalid,'UNKNOWN_FIXTURE');assert.equal(result.cancelled,'CANCELLED');
    assert.equal(result.releaseError,'SNAPSHOT_RELEASED');assert.equal(result.recovery.generation,5);
    assert.equal(result.svg.parts,1);assert.ok(Math.abs(result.svg.volumes[0]-368)<0.002);
    assert.equal(result.svg.metadata.totalErrorBoundMm,null);assert.equal(result.svg.shared,true);
    assert.equal(result.invalidExport,'UNKNOWN_PART');const stlBytes=Buffer.from(result.stlBase64,'base64');
    const stlOracle=inspectMesh(readSTL(stlBytes));assert.ok(Math.abs(stlOracle.volume-368)<.002);assert.equal(stlOracle.euler,0);
    await writeFile(path.join(output,`${name}-worker-export.stl`),stlBytes);
    const p=result.previewProof;assert.equal(p.width,200);assert.equal(p.height,100);
    // Two endpoint quanta (1e-6 mm) over 200 pixels: 1e-8 mm/pixel tolerance.
    assert.ok(Math.abs(p.pixelSizeMm-.1)<=1e-8);
    assert.deepEqual(p.hole,[0,0,0,0]);assert.deepEqual(p.solid,[0,0,0,255]);assert.deepEqual(p.pngSignature,[137,80,78,71,13,10,26,10]);
    assert.deepEqual(p.decodedPNG,{width:200,height:100,hole:[0,0,0,0],solid:[0,0,0,255]});
    assert.ok(p.seamPixel[3]>=254,'disjoint shared edge coverage must not create a transparent hairline');
    assert.match(p.sourceHash,/^[a-f0-9]{64}$/);assert.ok(result.previewRejected,'active SVG content must not reach browser rendering');
    assert.equal(result.watchdog,'ENGINE_WATCHDOG');assert.ok(result.frames>=2,'main thread continues animation while Worker stalls');
    await page.goto(`${origin}/without-coi`);
    await phase('no-coi-page-loaded');
    const blocked=await page.evaluate(async()=>{
      const {EngineClient}=await import('/src/core/engine-client.mjs');
      const c=new EngineClient({moduleURL:'/engine/arch-kernel.mjs'});
      try{await c.start();return 'unexpectedly-ready';}catch(e){return e.code;}finally{c.dispose();}
    });
    assert.equal(blocked,'CORE_UNAVAILABLE');
    await phase('no-coi-gate-complete');
    await writeFile(path.join(output,`${name}.json`),JSON.stringify({engine:name,version:browser.version(),result,withoutCOI:blocked,scope:'kernel integration, not full product UX or storage recovery'},null,2));
  }catch(error){await page.screenshot({path:path.join(output,`${name}-failure.png`)}).catch(()=>{});throw error;}
  finally{await phase('browser-close-start');await browser.close();await phase('browser-close-complete');}
});
