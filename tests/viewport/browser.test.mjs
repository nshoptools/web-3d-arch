import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,readdir,realpath} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import {chromium,firefox,webkit} from 'playwright';
const root=await realpath(fileURLToPath(new URL('../../',import.meta.url)));
const run=await realpath(process.env.PROJECT_REVIEW_RUN),modulePath=await realpath(process.env.ARCH_WASM_MODULE);
for(const target of [run,modulePath]){const relative=path.relative(root,target);assert.ok(relative&&!path.isAbsolute(relative)&&!relative.startsWith('..'));}
const output=path.join(run,'evidence/viewport'),dist=path.join(run,'work/viewport-harness');await mkdir(output,{recursive:true});
await build({configFile:false,root,publicDir:false,cacheDir:path.join(run,'cache/viewport-vite'),logLevel:'warn',
  build:{outDir:dist,emptyOutDir:false,minify:false,lib:{entry:{viewport:path.join(root,'tests/viewport/harness.mjs'),'engine-worker':path.join(root,'src/core/engine-worker.mjs')},formats:['es'],fileName:(_format,name)=>name+'.mjs'}}});
const routes=new Map([
  ['/arch-kernel.mjs',modulePath],['/arch-kernel.wasm',modulePath.replace(/\.mjs$/,'.wasm')],
  ['/engine-worker.mjs',path.join(dist,'engine-worker.mjs')]
]);
async function files(directory){for(const entry of await readdir(directory,{withFileTypes:true})){assert.ok(!entry.isSymbolicLink());const file=path.join(directory,entry.name);if(entry.isDirectory())await files(file);else routes.set('/'+path.relative(dist,file).replaceAll(path.sep,'/'),file);}}
await files(dist);
const server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
  res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('X-Content-Type-Options','nosniff');
  if(req.url==='/'&&req.method==='GET'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="vi"><meta charset="utf-8"><title>Kiểm khung xem 3D</title><style>body{margin:0;background:#e8edf2}#viewport{width:800px;height:600px}</style><body><div id="viewport"></div></body></html>');return;}
  if(!routes.has(req.url)||req.method!=='GET'){res.writeHead(404);res.end();return;}
  try{res.setHeader('Content-Type',req.url.endsWith('.wasm')?'application/wasm':'text/javascript');res.end(await readFile(routes.get(req.url)));}catch{res.writeHead(500);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
test.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
for(const [name,type] of Object.entries({chromium,firefox,webkit}))test(`Three viewport ${name}: actual SVG, picking, immutable geometry and teardown`,{timeout:90000},async()=>{
  const privateDir=path.join(run,'cache/viewport-browser',name);await mkdir(privateDir,{recursive:true});
  const context=await type.launchPersistentContext(path.join(privateDir,'profile'),{headless:true,viewport:{width:950,height:720},downloadsPath:path.join(privateDir,'downloads'),
    ...(name==='chromium'?{args:['--disable-breakpad','--disable-background-networking','--use-angle=swiftshader','--enable-unsafe-swiftshader']}:{})});
  const page=await context.newPage(),errors=[];
  try{
    await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
    page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
    await page.exposeFunction('captureViewport',()=>page.screenshot({path:path.join(output,name+'.png')}));
    const result=await page.evaluate(async()=>{const m=await import('/viewport.mjs');return m.runViewportChecks();});
    assert.deepEqual(errors,[]);assert.equal(result.manufacturingBytesUnchanged,true);
    await writeFile(path.join(output,name+'.json'),JSON.stringify({engine:name,version:context.browser()?.version(),result},null,2));
  }catch(e){await page.screenshot({path:path.join(output,name+'-failure.png')}).catch(()=>{});throw e;}
  finally{await context.close();}
});
