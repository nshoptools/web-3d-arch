import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,lstat,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {fixtureData} from './fixture-data.mjs';
import {testEnvironment,testModule} from './test-environment.mjs';
const {root,run}=await testEnvironment();
async function output(relative,directory=false){
  const result=path.resolve(run,relative);if(!result.startsWith(run+path.sep))throw Error('Escaped room');
  for(let p=result;p!==run;p=path.dirname(p)){
    try{if((await lstat(p)).isSymbolicLink())throw Error('Reparse output '+p);}catch(e){if(e.code!=='ENOENT')throw e;}
  }
  await mkdir(directory?result:path.dirname(result),{recursive:true});return result;
}
const pwPath=path.join(root,'.toolchain/app-runtime/node_modules/playwright'),pw=await import(pathToFileURL(path.join(pwPath,'index.mjs')));
const pkg=JSON.parse(await readFile(path.join(pwPath,'package.json'),'utf8'));if(pkg.version!=='1.63.0')throw Error('Playwright pin differs');
const pins={chromium:'153.0.8010.12',firefox:'155.0',webkit:'26.6'};
const names=process.argv[2]?[process.argv[2]]:Object.keys(pins);if(names.some(n=>!pins[n]))throw Error('Unknown engine');
const fixture=await fixtureData(root),config={entries:fixture.entries,collections:fixture.collections,selected:fixture.selected,svgAssets:fixture.svgAssets};
const routes=new Map();
routes.set('/',{bytes:Buffer.from('<!doctype html><meta charset="utf-8"><title>Text source Worker acceptance</title>'),type:'text/html'});
routes.set('/fixture/config.json',{bytes:Buffer.from(JSON.stringify(config)),type:'application/json'});
routes.set('/fixture/reference.json',{bytes:await readFile(path.join(run,'evidence/reference-cases.json')),type:'application/json'});
for(const [sha,bytes] of fixture.bytes)routes.set('/asset/'+sha,{bytes,type:'application/octet-stream'});
const candidate=fileURLToPath(new URL('../../',import.meta.url));
for(const name of ['source-contract','text-layout','paint-contract','native-color-renderer','color-render-bridge','emoji-source','text-source','index']){
  const relative='src/input/'+name+'.mjs';routes.set('/candidate/'+relative,{bytes:await readFile(path.join(candidate,relative)),type:'text/javascript'});
}
for(const name of ['browser-worker','shared-suite','renderer-suite','message-worker','bridge-worker','bridge-page']){
  const relative='tests/text-source/'+name+'.mjs';routes.set('/candidate/'+relative,{bytes:await readFile(path.join(candidate,relative)),type:'text/javascript'});
}
for(const name of ['harfbuzz-engine','font-source-core']){
  routes.set('/parent/'+name+'.mjs',{bytes:await readFile(path.join(root,'src/input',name+'.mjs')),type:'text/javascript'});
}
const existingModulePath=await testModule(root);
for(const ext of ['mjs','wasm'])routes.set('/engine/arch-kernel.'+ext,{bytes:await readFile(existingModulePath.replace(/\.mjs$/,'.'+ext)),type:ext==='mjs'?'text/javascript':'application/wasm'});
const engineHash=createHash('sha256').update(routes.get('/engine/arch-kernel.wasm').bytes).digest('hex');
let port,origin;const requests=[],blocked=[];
const server=createServer((req,res)=>{
  const route=routes.get(req.url);
  if(req.method!=='GET'||req.headers.host!=='127.0.0.1:'+port||!route){blocked.push(req.url);res.writeHead(404);res.end();return;}
  requests.push(req.url);
  res.writeHead(200,{'Content-Type':route.type,'Content-Length':route.bytes.length,
    'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin',
    'Content-Security-Policy':"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; font-src 'self' blob:; img-src 'self' blob: data:; object-src 'none'; base-uri 'none'",
    'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});
  res.end(route.bytes);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));port=server.address().port;origin='http://127.0.0.1:'+port;
const all=[];
try{
  for(const name of names){
    // Serial by construction; await context.close() before launching the next engine.
    const profile=await output('cache/browser/'+name,true),artifacts=await output('temp/browser/'+name,true);
    const context=await pw[name].launchPersistentContext(profile,{headless:true,artifactsDir:artifacts,downloadsPath:artifacts,serviceWorkers:'block'});
    try{
      const version=context.browser().version();if(version!==pins[name])throw Error('Engine pin differs: '+version);
      await context.route('**/*',route=>{
        const request=route.request(),url=new URL(request.url());
        if(url.origin!==origin||url.search||!routes.has(url.pathname)||request.method()!=='GET'){blocked.push(request.url());return route.abort('blockedbyclient');}
        return route.continue();
      });
      const page=await context.newPage();
      page.on('console',msg=>{if(msg.type()==='error')console.log(name+' page: '+msg.text());});
      await page.goto(origin);
      console.log(name+' '+version+' started, loopback '+port);
      const report=await page.evaluate(runtime=>new Promise((resolve,reject)=>{
        const worker=new Worker('/candidate/tests/text-source/browser-worker.mjs',{type:'module'}),checks=[];let frames=0;
        const animate=()=>{frames++;if(worker)requestAnimationFrame(animate);};requestAnimationFrame(animate);
        const timeout=setTimeout(()=>{worker.terminate();reject(Error('Worker acceptance timeout'));},180000);
        worker.onerror=e=>{clearTimeout(timeout);worker.terminate();reject(Error(e.message));};
        worker.onmessage=({data})=>{
          if(data.type==='check'){checks.push(data.result);return;}
          clearTimeout(timeout);worker.terminate();
          if(data.type==='fatal')reject(Error(data.error));else resolve({...data,frames,checksReceived:checks.length,crossOriginIsolated});
        };
        worker.postMessage(runtime);
      }),{engine:name,version});
      const samples=[];
      for(const [i,sample] of report.samples.entries()){
        const file=await output('evidence/browser/'+name+'/sample-'+String(i).padStart(2,'0')+'.png');
        const png=Buffer.from(sample.pngBase64,'base64');await writeFile(file,png);
        const {pngBase64,...meta}=sample;samples.push({...meta,file,pngHash:createHash('sha256').update(png).digest('hex')});
      }
      report.samples=samples;
      const messages=await page.evaluate(async fixture=>{
        const w=new Worker('/candidate/tests/text-source/message-worker.mjs',{type:'module'});
        const next=()=>new Promise((resolve,reject)=>{
          const timer=setTimeout(()=>reject(Error('Message test timeout')),30000);
          w.onmessage=e=>{clearTimeout(timer);resolve(e.data);};w.onerror=e=>{clearTimeout(timer);reject(Error(e.message));};
        });
        const results=[];let n=next();w.postMessage({type:'init'});if((await n).type!=='ready')throw Error('No ready message');
        const command={version:'arch-text-source/1',kind:'text',id:'rpc-job',expected:{sourceId:'source-fixture',revision:3},
          text:'Tiếng Việt\nO',font:fixture,size:{value:10,unit:'mm'}};
        try{
          for(const action of ['cancel','stale','complete']){
            if(action==='complete')w.postMessage({type:'revision',revision:3});
            const terminal=new Promise((resolve,reject)=>{
              const timer=setTimeout(()=>reject(Error('RPC job timeout')),30000);let sent=false;
              w.onmessage=({data})=>{
                if(data.type==='progress'){
                  if(!sent&&data.phase==='shape-run'){
                    if(action==='cancel')w.postMessage({type:'cancel',id:command.id});
                    if(action==='stale')w.postMessage({type:'revision',revision:4});
                    sent=true;
                  }
                  return;
                }
                clearTimeout(timer);resolve(data);
              };
            });
            w.postMessage({type:'prepare',command});
            const result=await terminal;
            if(action==='complete'){
              if(result.type!=='prepared'||!(result.result.svg instanceof Uint8Array)||!result.result.geometry.paths.length)throw Error('No real prepared geometry over Worker boundary');
            }else if(result.type!=='error'||result.code!==(action==='cancel'?'CANCELLED':'STALE_SOURCE')||result.stats.pending!==null)throw Error('RPC atomicity failed '+JSON.stringify(result));
            results.push({name:'actual Worker messages '+action,ok:true});
          }
        }finally{w.terminate();}
        return results;
      },fixture.entries.inter);
      report.messages=messages;
      const bridge=await page.evaluate(async({runtime,fixture})=>{
        const {runBridgePage}=await import('/candidate/tests/text-source/bridge-page.mjs');
        return runBridgePage(runtime,fixture);
      },{runtime:{engine:name,version},fixture:config});
      const bridgeSamples=[];
      for(const [i,sample] of bridge.samples.entries()){
        const file=await output('evidence/browser/'+name+'/bridge-sample-'+String(i).padStart(2,'0')+'.png');
        const png=Buffer.from(sample.pngBase64,'base64');await writeFile(file,png);
        const {pngBase64,...meta}=sample;bridgeSamples.push({...meta,file,pngHash:createHash('sha256').update(png).digest('hex')});
      }
      bridge.samples=bridgeSamples;report.bridge=bridge;
      const checks=[...report.shared,...report.renderer,...report.messages,...report.bridge.results],failed=checks.filter(r=>!r.ok);
      const result={verdict:failed.length?'fail':checks.some(r=>r.skipped)?'unsupported-native-preview':'pass',engine:name,version,playwright:pkg.version,engineHash,port,profile,artifacts,passed:checks.filter(r=>r.ok&&!r.skipped).length,skipped:checks.filter(r=>r.skipped).length,total:checks.length,...report};
      all.push(result);await writeFile(await output('evidence/browser/'+name+'/results.json'),JSON.stringify(result,null,2));
      console.log(JSON.stringify({engine:name,passed:result.passed,skipped:result.skipped,total:result.total,capabilities:report.capabilities,frames:report.frames,bridgeMaxSyncMs:report.bridge.maxSyncMs,bridgeMaxRenderSyncMs:report.bridge.maxRenderSyncMs,bridgeFontSetupMs:report.bridge.maxFontSetupSpentMs,bridgeFrames:report.bridge.frames}));
      for(const fail of failed)console.log('FAIL '+fail.name+'\n'+fail.error);
      if(failed.length)process.exitCode=1;
      else if(checks.some(r=>r.skipped)&&process.exitCode!==1)process.exitCode=2;
    }finally{await context.close();}
  }
  await writeFile(await output('evidence/browser/run-'+names.join('-')+'.json'),JSON.stringify({engineHash,loopback:origin,allowedPaths:[...routes.keys()],requests,blocked,results:all.map(r=>({verdict:r.verdict,engine:r.engine,version:r.version,total:r.total,passed:r.passed,skipped:r.skipped,capabilities:r.capabilities,frames:r.frames}))},null,2));
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
