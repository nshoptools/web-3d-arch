import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import {pathToFileURL}from'node:url';import{createHash}from'node:crypto';
const repo=path.resolve(process.cwd()),run=path.resolve(process.env.PROJECT_REVIEW_RUN),tag=process.env.PROOF_TAG??'r1',pkg=path.join(run,'work/imported-csg-root/src/mesh-import'),out=path.join(run,'evidence/root-browser-'+tag),pub=path.join(run,'work/root-browser-public-'+tag);
if(!run.startsWith(repo+path.sep)||fs.existsSync(out)||fs.existsSync(pub))throw Error('own fresh evidence paths');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(pub,{recursive:true});
const {rolldown}=await import(pathToFileURL(path.join(repo,'node_modules/rolldown/dist/index.mjs')));
for(const [name,file]of [['proof',path.join(pkg,'tests/root-browser.mjs')],['engine-worker',path.join(pkg,'../core/engine-worker.mjs')],['mesh-qualification-worker',path.join(pkg,'../core/mesh-qualification-worker.mjs')]]){
 const bundle=await rolldown({input:file,platform:'browser',resolve:{alias:{'@xmldom/xmldom':path.join(repo,'src/printing/node_modules/@xmldom/xmldom/lib/index.js')}},onwarn:w=>{if(w.code==='UNRESOLVED_IMPORT')throw Error(w.message);},external:id=>id.startsWith('node:')});
 await bundle.write({file:path.join(pub,name+'.mjs'),format:'esm',codeSplitting:false});await bundle.close();
}
const sha=b=>createHash('sha256').update(b).digest('hex'),pins={};
for(const [kind,ext]of[['module','mjs'],['wasm','wasm']]){
 const bytes=fs.readFileSync(path.join(run,'work/module/arch-kernel.'+ext)),hash=sha(bytes),name='arch-kernel.'+hash.slice(0,16)+'.'+ext;
 fs.writeFileSync(path.join(pub,name),bytes);pins[kind]={url:'/'+name,sha256:hash,bytes:bytes.length};
}
fs.writeFileSync(path.join(pub,'index.html'),'<!doctype html><meta charset="utf-8"><title>Owned root mesh RPC proof</title><script type="module" src="/proof.mjs"></script>');
const files=new Map(fs.readdirSync(pub).map(name=>['/'+name,fs.readFileSync(path.join(pub,name))]));
const requests=[];const server=http.createServer((req,res)=>{
 const url=req.url==='/'?'/index.html':req.url;requests.push({method:req.method,url});
 if(req.method!=='GET'||!files.has(url)){res.writeHead(404);res.end();return;}
 const bytes=files.get(url);res.writeHead(200,{'Content-Type':url.endsWith('.wasm')?'application/wasm':url.endsWith('.mjs')?'text/javascript':'text/html','Content-Length':bytes.length,'Cache-Control':'no-store','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin'});res.end(bytes);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,pin={version:'arch-engine-integrity/1',...Object.fromEntries(Object.entries(pins).map(([k,p])=>[k,{...p,url:origin+p.url}]))};
const pw=await import(pathToFileURL(path.join(repo,'.toolchain/app-runtime/node_modules/playwright/index.mjs'))),summaries=[];let failed=false;
try{
 const browsers=(process.env.PROOF_BROWSERS??'firefox,chromium,webkit').split(',');if(!browsers.every(b=>['chromium','firefox','webkit'].includes(b)))throw Error('engine selection');
 for(const browser of browsers){
  const logs=[],context=await pw[browser].launchPersistentContext(path.join(run,'cache/profiles/root-'+tag+'-'+browser),{headless:true,viewport:{width:1000,height:720},downloadsPath:path.join(run,'temp/downloads-'+tag+'-'+browser),acceptDownloads:false});
  await context.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());
  try{
   const page=await context.newPage();page.on('requestfailed',r=>logs.push({type:'requestfailed',url:r.url(),failure:r.failure()}));page.on('response',r=>logs.push({type:'response',url:r.url(),status:r.status()}));page.on('console',m=>logs.push({type:m.type(),text:m.text()}));page.on('pageerror',e=>logs.push({type:'pageerror',text:e.stack??String(e)}));
   await page.goto(origin,{waitUntil:'load',timeout:45000});await page.waitForFunction(()=>typeof globalThis.runProof==='function',{},{timeout:20000});
   const result=await page.evaluate(pin=>globalThis.runProof(pin),pin);
   const dir=path.join(out,browser);fs.mkdirSync(dir);for(const a of result.artifacts){if(!/^[a-z0-9.-]+$/.test(a.name))throw Error('artifact name');fs.writeFileSync(path.join(dir,a.name),Uint8Array.from(a.bytes));}
   delete result.artifacts;fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(result,null,2));summaries.push({browser,pass:true,records:result.records.length});
  }catch(e){failed=true;summaries.push({browser,pass:false,error:e.stack??String(e)});}
  finally{await context.close();fs.writeFileSync(path.join(out,browser+'.log.json'),JSON.stringify(logs,null,2));}
 }
}finally{await new Promise(r=>server.close(r));fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({pin,summaries,servedFiles:[...files.keys()],requests},null,2));}
const wasmRequests=requests.filter(r=>r.url===new URL(pin.wasm.url).pathname).length;if(wasmRequests!==summaries.length){failed=true;console.error('EXACT_WASM_REQUEST_COUNT',wasmRequests);}
console.log(JSON.stringify(summaries));if(failed)process.exitCode=1;
