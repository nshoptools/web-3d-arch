import {createServer} from 'node:http';
import {readFile,readdir,realpath,mkdir,writeFile,appendFile,lstat} from 'node:fs/promises';
import {resolve,join,dirname,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=await realpath(process.env.PROJECT_ROOT),run=await realpath(process.env.PROJECT_REVIEW_RUN);
const runRelative=relative(root,run);
if(!runRelative||isAbsolute(runRelative)||runRelative.startsWith('..'))throw new Error('Wrong run output scope');
const candidate=await realpath(resolve(dirname(fileURLToPath(import.meta.url)),'../..'));
if(candidate!==root)throw new Error('Storage tests must use the integrated project source');
const evidence=join(run,'evidence'),runId=new Date().toISOString().replace(/[:.]/g,'-');
const resultPath=join(evidence,'browser-'+runId+'.json'),eventPath=join(evidence,'browser-'+runId+'.jsonl');
await mkdir(evidence,{recursive:true});
const modules=(await readdir(join(candidate,'src/storage'))).filter(n=>/^[a-z-]+\.mjs$/.test(n));
const whitelist=new Map([
 ['/harness.html','tests/storage/harness.html'],['/harness.mjs','tests/storage/harness.mjs'],
 ['/cases.mjs','tests/storage/cases.mjs'],['/batch-cases.mjs','tests/storage/batch-cases.mjs'],...modules.map(n=>['/src/'+n,'src/storage/'+n])
]);
const content=new Map(),hashes={};
for(const [url,path]of whitelist){
  const full=await realpath(join(candidate,path));if(!full.startsWith(candidate+sep))throw new Error('Whitelist symlink escaped candidate');
  const bytes=await readFile(full);content.set(url,bytes);hashes[path]=createHash('sha256').update(bytes).digest('hex');
}
const server=createServer((req,res)=>{
  const address=server.address(),host='127.0.0.1:'+address.port;
  if(req.headers.host!==host||!['GET','HEAD'].includes(req.method)||!content.has(req.url)){
    res.writeHead(404,{'Cache-Control':'no-store'});res.end();return;
  }
  res.writeHead(200,{
    'Content-Type':req.url.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8',
    'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
    'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp',
    'Content-Security-Policy':"default-src 'none'; script-src 'self'; connect-src 'self'; worker-src 'self'; base-uri 'none'; frame-ancestors 'none'",
  });
  res.end(req.method==='HEAD'?undefined:content.get(req.url));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const report={runId,startedAt:new Date().toISOString(),platform:process.platform,node:process.version,originPrivate:true,whitelist:[...whitelist.keys()],hashes,browsers:[],results:[],scope:{realIDB:true,realOPFS:true,physicalCrashProof:false}};
async function record(result){
  report.results.push(result);await appendFile(eventPath,JSON.stringify(result)+'\n');
  await writeFile(resultPath,JSON.stringify(report,null,2));
  console.log(result.browser+'/'+result.backend+' '+result.name+': '+result.status+(result.error?' '+result.error.message.split('\n')[0]:''));
}
try{
  for(const path of ['/','/AGENTS.md','/tmp/','/%2e%2e/AGENTS.md','/src/../AGENTS.md','/harness.html?x=1','/.git/config']){
    const response=await fetch(origin+path);if(response.status!==404)throw new Error('Server route was not denied: '+path);
  }
  const playwright=await import(pathToFileURL(join(root,'.toolchain/app-runtime/node_modules/playwright/index.mjs')).href);
  const browserNames=(process.env.STORAGE_BROWSERS??'chromium,firefox,webkit').split(',');
  const backends=(process.env.STORAGE_BACKENDS??'opfs,idb').split(',');
  for(const name of browserNames){
    const privateDir=join(run,'temp','browser-'+runId+'-'+name),profile=join(privateDir,'profile');
    for(const sub of ['profile','downloads','appdata','localappdata','home','tmp'])await mkdir(join(privateDir,sub),{recursive:true});
    let context;
    try{
      const browserEnv={...process.env,TEMP:join(privateDir,'tmp'),TMP:join(privateDir,'tmp'),TMPDIR:join(privateDir,'tmp'),
        APPDATA:join(privateDir,'appdata'),LOCALAPPDATA:join(privateDir,'localappdata'),USERPROFILE:join(privateDir,'home'),HOME:join(privateDir,'home')};
      context=await playwright[name].launchPersistentContext(profile,{headless:true,acceptDownloads:false,
        downloadsPath:join(privateDir,'downloads'),env:browserEnv,
        ...(name==='chromium'?{args:['--disable-crash-reporter','--disable-breakpad','--disable-background-networking']}:{}),
        ...(name==='firefox'?{firefoxUserPrefs:{'toolkit.telemetry.enabled':false,'datareporting.healthreport.uploadEnabled':false}}:{})});
      await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort('blockedbyclient'));
      const page=await context.newPage();
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(origin+'/harness.html');await page.waitForFunction(()=>globalThis.testAPI?.ready,{},{timeout:30000});
      const browserInfo={name,version:context.browser()?.version()??null,userAgent:await page.evaluate(()=>navigator.userAgent),capabilities:[]};report.browsers.push(browserInfo);
      for(const backend of backends){
        const capability=await page.evaluate(async b=>{
          const f=await testAPI.fixture(b),cap=f.store.capabilities;f.store.close();testAPI.fixtures.delete(f.userId);return cap;
        },backend);
        browserInfo.capabilities.push({backend,...capability});
        if(capability.selectedBackend!==backend){
          await record({browser:name,backend,name:'capability',status:'unavailable',details:capability});continue;
        }
        const names=await page.evaluate(()=>testAPI.caseNames);
        for(const testName of names){
          if(process.env.STORAGE_CASES&&!process.env.STORAGE_CASES.split(',').includes(testName))continue;
          const result=await page.evaluate(async({testName,backend})=>testAPI.run(testName,backend),{testName,backend});
          await record({browser:name,...result});
        }
        if(!process.env.STORAGE_CASES||process.env.STORAGE_CASES.includes('multiTab')){
          const {runMultiTab}=await import('./multi-tab.mjs');
          for(const result of await runMultiTab({context,origin,backend}))await record({browser:name,backend,...result});
        }
        const rescue=await page.evaluate(()=>globalThis.lastRescue??null);
        if(rescue){
          const base=join(evidence,'rescue-'+runId+'-'+name+'-'+backend);
          await writeFile(base+'.zip',Buffer.from(rescue.bytes));await writeFile(base+'.metadata.json',JSON.stringify(rescue.metadata,null,2));
        }
      }
      browserInfo.pageErrors=errors;
    }catch(error){
      await record({browser:name,backend:'launch-or-harness',name:'browserSession',status:'fail',error:{message:error.message,stack:error.stack}});
    }finally{if(context)await context.close();}
  }
}catch(error){report.runnerError={message:error.message,stack:error.stack};process.exitCode=1;}
finally{
  server.closeAllConnections();await new Promise(r=>server.close(r));
  report.completedAt=new Date().toISOString();
  report.counts=Object.fromEntries(['pass','fail','unavailable'].map(s=>[s,report.results.filter(r=>r.status===s).length]));
  if(report.counts.fail)process.exitCode=1;else if(report.counts.unavailable&&!process.exitCode)process.exitCode=2;
  report.exitCode=process.exitCode??0;
  await writeFile(resultPath,JSON.stringify(report,null,2));
  await writeFile(join(evidence,'latest-browser-result.txt'),resultPath+'\n');
  console.log('RESULT '+resultPath+' exit='+report.exitCode+' '+JSON.stringify(report.counts));
}
