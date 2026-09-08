import {createServer} from 'node:http';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {environment,sha256} from './environment.mjs';
const env=await environment(),fixture=JSON.parse(await readFile(path.join(env.run,'evidence/text-app-fixture.json'),'utf8'));
const pwPath=path.join(env.root,'.toolchain/app-runtime/node_modules/playwright'),pw=await import(pathToFileURL(path.join(pwPath,'index.mjs')));
const pkg=JSON.parse(await readFile(path.join(pwPath,'package.json'),'utf8'));if(pkg.version!=='1.63.0')throw Error('Playwright pin differs');
const pins={chromium:'153.0.8010.12',firefox:'155.0',webkit:'26.6'},names=process.argv[2]?[process.argv[2]]:Object.keys(pins);
if(names.some(n=>!pins[n]))throw Error('Unknown engine');
const routes=new Map([['/',{bytes:Buffer.from('<!doctype html><meta charset="utf-8"><title>Text application Worker binding acceptance</title>'),type:'text/html'}]]);
routes.set('/fixture/config.json',{bytes:Buffer.from(JSON.stringify({...fixture,assetFiles:undefined})),type:'application/json'});
async function stageRoutes(dir,prefix){for(const f of await readdir(dir,{withFileTypes:true})){
  const file=path.join(dir,f.name),url=prefix+'/'+f.name;
  if(f.isDirectory())await stageRoutes(file,url);else if(f.isFile()&&f.name.endsWith('.mjs'))routes.set(url,{file,type:'text/javascript'});
}}
await stageRoutes(env.stage,'/stage');
for(const [digest,file]of fixture.assetFiles){const record=new Map(fixture.assetRecords).get(digest);routes.set('/library/'+digest,{file,type:record.mediaType});}
for(const ext of ['mjs','wasm'])routes.set('/engine/arch-kernel.'+ext,{file:env.modulePath.replace(/\.mjs$/,'.'+ext),type:ext==='mjs'?'text/javascript':'application/wasm'});
const moduleHash=sha256(await readFile(env.modulePath.replace(/\.mjs$/,'.wasm'))),requests=[],blocked=[];let port;
const server=createServer(async(req,res)=>{
  const r=routes.get(req.url);
  if(req.method!=='GET'||req.headers.host!=='127.0.0.1:'+port||!r){blocked.push(req.url);res.writeHead(404);res.end();return;}
  try{const bytes=r.bytes??await readFile(r.file);requests.push(req.url);res.writeHead(200,{'Content-Type':r.type,'Content-Length':bytes.length,
    'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin',
    'Content-Security-Policy':"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; font-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'",
    'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});res.end(bytes);
  }catch(e){res.writeHead(500);res.end(String(e));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));port=server.address().port;const origin='http://127.0.0.1:'+port,summary=[];
try{
  for(const name of names){
    // One live engine by construction. Context is closed before the next engine launches.
    const profile=await env.output('cache/text-app-browser/'+name,true),artifacts=await env.output('temp/text-app-browser/'+name,true);
    const context=await pw[name].launchPersistentContext(profile,{headless:true,artifactsDir:artifacts,downloadsPath:artifacts,serviceWorkers:'block'});
    try{
      const version=context.browser().version();if(version!==pins[name])throw Error('Engine pin differs: '+version);
      await context.route('**/*',route=>{const req=route.request(),url=new URL(req.url());
        if(url.origin!==origin||url.search||!routes.has(url.pathname)||req.method()!=='GET'){blocked.push(req.url());return route.abort('blockedbyclient');}return route.continue();});
      const page=await context.newPage();page.on('console',m=>{if(m.text().startsWith('FAIL '))console.log(name+' '+m.text());});
      await page.goto(origin);console.log(name+' '+version+' started on own loopback '+port);
      const report=await page.evaluate(async runtime=>(await import('/stage/tests/text-app/browser-page.mjs')).browserSuite(runtime),{engine:name,version});
      const samples=[];for(const [i,s]of report.samples.entries()){
        const {pngBase64,...meta}=s,bytes=Buffer.from(pngBase64,'base64'),file=await env.output('evidence/text-app-browser/'+name+'/emoji-'+i+'.png');await writeFile(file,bytes);
        samples.push({...meta,file,pngHash:sha256(bytes)});
      }
      report.samples=samples;const result={...report,engine:name,version,playwright:pkg.version,moduleHash,port,profile,artifacts,stagedFiles:env.copied};
      await writeFile(await env.output('evidence/text-app-browser/'+name+'/results.json'),JSON.stringify(result,null,2));
      const compact={engine:name,version,total:result.total,passed:result.passed,capabilities:result.capabilities,fallback:result.fallback,frames:result.frames,maxRenderSyncMs:result.maxRenderSyncMs};
      summary.push(compact);console.log(JSON.stringify(compact));for(const r of result.core??[])if(!r.ok)console.log(name+' CORE FAIL '+r.name+' '+r.error);
      if(result.total!==result.passed||(result.core??[]).some(r=>!r.ok))process.exitCode=1;
    }finally{await context.close();}
  }
  await writeFile(await env.output('evidence/text-app-browser/run-'+names.join('-')+'.json'),JSON.stringify({moduleHash,origin,allowedPaths:[...routes.keys()],requests,blocked,summary},null,2));
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
