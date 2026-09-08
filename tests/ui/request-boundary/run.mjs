import fs from 'node:fs';import path from 'node:path';import {pathToFileURL,fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
import {capture,env,safe,write,json,sha,walk} from './support.mjs';import {browserCases} from './browser-cases.mjs';import {typecheck} from './typecheck.mjs';
import {exportCases} from './export-cases.mjs';
const candidate=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const c=capture(candidate),{root,run,stage,input}=c;
const label=process.env.ARCH_UI_EVIDENCE_LABEL??'latest';if(!/^[A-Za-z0-9_-]+$/.test(label))throw Error('Invalid evidence label');const output=safe(run,path.join(run,'evidence/ui-request-boundary',label),false);fs.mkdirSync(output,{recursive:true});
for(const p of ['cache/a','cache/l','cache/v','work/p'])fs.mkdirSync(safe(run,path.join(run,p),false),{recursive:true});
Object.assign(process.env,{ARCH_UI_TEST_INPUT:input,APPDATA:path.join(run,'cache/a'),LOCALAPPDATA:path.join(run,'cache/l'),PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:'1'});
const pure=spawnSync(process.execPath,['--test',path.join(candidate,'tests/ui/request-boundary/pure.test.mjs')],{env:process.env,encoding:'utf8'});write(path.join(output,'pure.txt'),pure.stdout+pure.stderr);console.log(pure.stdout);if(pure.stderr)console.error(pure.stderr);
const deps=safe(root,path.join(root,'.toolchain/app-runtime/node_modules'));
const types=typecheck(c,output);console.log('Typecheck exit '+types.exit);if(types.output)console.log(types.output);
const {createServer}=await import(pathToFileURL(path.join(deps,'vite/dist/node/index.js')));
const pw=await import(pathToFileURL(path.join(deps,'playwright/index.mjs')));
const aliases=['react','react-dom','three'].map(name=>({find:new RegExp('^'+name+'(?=/|$)'),replacement:path.join(deps,name).replaceAll('\\','/')}));
const server=await createServer({configFile:false,root:stage,cacheDir:path.join(run,'cache/v'),resolve:{alias:aliases,dedupe:['react','react-dom']},server:{host:'127.0.0.1',port:0,strictPort:false,hmr:false,fs:{allow:[stage,deps]},watch:null},logLevel:'warn'});
const results=[];
try{
 await server.listen();const address=server.httpServer.address(),url=`http://127.0.0.1:${address.port}/`;
 for(const [name,short] of [['chromium','c'],['firefox','f'],['webkit','w']]){
  if(process.env.ARCH_UI_ENGINES&&!process.env.ARCH_UI_ENGINES.split(',').includes(name))continue;
  let context;const checks=[],errors=[],requests=[];try{
   context=await pw[name].launchPersistentContext(safe(run,path.join(run,'work/p',short),false),{headless:true,viewport:{width:1280,height:900},acceptDownloads:false,env:process.env,...(name==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
   const page=context.pages()[0]??await context.newPage();page.on('filechooser',()=>{});page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
   await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===new URL(url).origin)return route.continue();requests.push(u.origin);return route.abort()});
   await page.goto(url);await page.waitForFunction(()=>!!window.boundary);if(process.env.ARCH_UI_CASE_SCOPE!=='exports')await browserCases(page,r=>{checks.push(r);console.log(name+' '+(r.pass?'PASS ':'FAIL ')+r.name)});
   await exportCases(page,r=>{checks.push(r);console.log(name+' '+(r.pass?'PASS ':'FAIL ')+r.name)});
   results.push({engine:name,browserVersion:context.browser()?.version()??'persistent',checks,errors,deniedOrigins:requests});
  }catch(e){results.push({engine:name,checks,errors,deniedOrigins:requests,fatal:String(e.stack)})}finally{await context?.close()}
  write(path.join(output,name+'.json'),results.at(-1));
 }
}finally{await server.close()}
const evidence={version:'arch-ui-request-boundary-tests/1',scope:'Actual captured React UI/hooks with synthetic deferred AppBridge; no backend, paid calls, geometry, or independent review',captureHash:sha(fs.readFileSync(c.recordFile)),inputRevision:c.revision,pureExit:pure.status,typecheckExit:types.exit,testFiles:walk(path.join(candidate,'tests/ui/request-boundary')).map(f=>({file:path.relative(candidate,f).replaceAll('\\','/'),sha256:sha(fs.readFileSync(f))})),packages:Object.fromEntries(['react','react-dom','vite','typescript','playwright'].map(n=>[n,json(path.join(deps,n,'package.json')).version])),results};
write(path.join(output,'results.json'),evidence);
const failed=pure.status!==0||types.exit!==0||results.some(r=>r.fatal||r.errors.length||r.deniedOrigins.length||r.checks.some(c=>!c.pass));console.log('Evidence: '+output);process.exitCode=failed?1:0;

