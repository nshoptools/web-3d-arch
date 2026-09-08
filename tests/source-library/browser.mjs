import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import {pathToFileURL,fileURLToPath} from 'node:url';import assert from 'node:assert/strict';
import {environment,safe,readJSON,writeJSON,sha256,cliArgs} from '../../tools/assets/source-library/common.mjs';import {stageContracts} from './stage.mjs';
export async function browserTests({library,deployment}){
 const {root,run,stage}=stageContracts(library);deployment=safe(run,path.resolve(deployment));const ready=readJSON(path.join(deployment,'source-library/ready.json'));
 const expected=readJSON(path.join(library,'src/assets/source-library/deployment.json'));
 assert.equal(ready.version,'arch-source-deployment-ready/1');assert.equal(ready.files.length,expected.records.length+4);
 // Verify the copied deployment, not a test-only font/emoji data set.
 for(const r of ready.files){const b=fs.readFileSync(safe(run,path.join(deployment,r.url)));assert.equal(b.length,r.bytes);assert.equal(sha256(b),r.sha256);}
 for(const file of ['catalog.json','deployment.json','artwork.json','build-receipt.json'])assert.equal(sha256(fs.readFileSync(path.join(deployment,'source-library',file))),sha256(fs.readFileSync(path.join(library,'src/assets/source-library',file))),'Deployment config bytes '+file);
 const requests=[],server=http.createServer((req,res)=>{
  try{const url=new URL(req.url,'http://localhost');if(url.search||url.hash||url.pathname.includes('%'))throw Error('URL');
   if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Source library Worker contract test</title>');return;}
   let file;if(url.pathname.startsWith('/stage/'))file=safe(stage,path.join(stage,url.pathname.slice(7)));
   else if(url.pathname.startsWith('/deploy/'))file=safe(deployment,path.join(deployment,url.pathname.slice(8)));else throw Error('Route');
   requests.push(url.pathname);res.setHeader('Content-Type',file.endsWith('.mjs')?'text/javascript':file.endsWith('.json')?'application/json':file.endsWith('.png')?'image/png':'application/octet-stream');const b=fs.readFileSync(file);res.setHeader('Content-Length',b.length);res.end(b);
  }catch{res.statusCode=404;res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const {chromium,firefox,webkit}=await import(pathToFileURL(path.join(root,'.toolchain/app-runtime/node_modules/playwright/index.mjs')));
 const reports=[];try{
  for(const [name,browser]of Object.entries({chromium,firefox,webkit})){
   const profile=safe(run,path.join(run,'work/source-library-tests/browser-'+name),{exists:false});fs.mkdirSync(profile,{recursive:true});
   const context=await browser.launchPersistentContext(profile,{headless:true,downloadsPath:path.join(profile,'downloads'),acceptDownloads:false});
   try{
    const errors=[],page=context.pages()[0]??await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
    await context.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===origin?route.continue():route.abort();});
    await page.goto(origin);const result=await page.evaluate(()=>new Promise((resolve,reject)=>{
     const w=new Worker('/stage/tests/source-library/browser-worker.mjs',{type:'module'}),timer=setTimeout(()=>{w.terminate();reject(Error('Worker timeout'));},120000);
     w.onerror=e=>{clearTimeout(timer);w.terminate();reject(Error(e.message));};
     w.onmessage=async({data})=>{try{
      if(!data.ok)throw Error(data.error);
      for(const p of data.previews){const u=URL.createObjectURL(new Blob([p.bytes],{type:'image/png'}));try{const img=new Image();img.src=u;await img.decode();if(img.naturalWidth!==p.width||img.naturalHeight!==p.height)throw Error('Browser PNG dimensions '+p.label);data.checks.push('browser PNG decode '+p.label);}finally{URL.revokeObjectURL(u);}}
      clearTimeout(timer);w.terminate();resolve({checks:data.checks});
     }catch(e){clearTimeout(timer);w.terminate();reject(e);}};
     w.postMessage({});
    }));
    assert.deepEqual(errors,[]);const report={engine:name,version:context.browser()?.version()??await page.evaluate(()=>navigator.userAgent),status:'pass',checks:result.checks};
    reports.push(report);console.log(name+': '+result.checks.length+' checks pass');
   }finally{await context.close();}
  }
 }finally{await new Promise(resolve=>server.close(resolve));}
 assert.ok(requests.every(p=>!p.endsWith('.wasm')));const report={version:'arch-source-library-browser-tests/1',engines:reports,deployedAssetsChecked:ready.files.length,extraWasmRequests:0,scope:'Module Workers use full generated catalog + current main catalog/assetReader; PNGs decoded by browser image decoder. This is not a root geometry build or UI test.'};
 writeJSON(run,path.join(run,'evidence/source-library-browser.json'),report);return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const a=cliArgs(['--library','--deployment']);await browserTests({library:a['--library'],deployment:a['--deployment']});}
