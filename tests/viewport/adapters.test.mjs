import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {build} from 'vite';
import {chromium,firefox,webkit} from 'playwright';
import {readSTL,inspectMesh} from '../oracles/mesh-oracle.mjs';
const root=await realpath(fileURLToPath(new URL('../../',import.meta.url))),run=await realpath(process.env.PROJECT_REVIEW_RUN),modulePath=await realpath(process.env.ARCH_WASM_MODULE);
for(const p of [run,modulePath]){const r=path.relative(root,p);assert.ok(r&&!path.isAbsolute(r)&&!r.startsWith('..'));}
const dist=path.join(run,'work/adapter-harness'),output=path.join(run,'evidence/adapter-harness');await mkdir(output,{recursive:true});
await build({configFile:false,root,publicDir:false,cacheDir:path.join(run,'cache/adapter-vite'),logLevel:'warn',build:{outDir:dist,emptyOutDir:false,minify:false,lib:{entry:path.join(root,'tests/viewport/adapters-harness.mjs'),formats:['es'],fileName:()=> 'adapters.mjs'}}});
const routes=new Map([['/arch-kernel.mjs',modulePath],['/arch-kernel.wasm',modulePath.replace(/\.mjs$/,'.wasm')]]);
for(const file of ['src/core/engine-worker.mjs','src/core/source-preview.mjs','src/core/png-worker.mjs','src/core/png-encode.mjs','src/viewport/arch-view.mjs'])routes.set('/'+file,path.join(root,file));
async function collect(dir){for(const item of await readdir(dir,{withFileTypes:true})){assert.ok(!item.isSymbolicLink());const p=path.join(dir,item.name);if(item.isDirectory())await collect(p);else routes.set('/'+path.relative(dist,p).replaceAll(path.sep,'/'),p);}}await collect(dist);
const server=createServer(async(req,res)=>{
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('Cache-Control','no-store');
  if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="vi"><meta charset="utf-8"><title>Adapter verification</title><body>Component adapter harness</body></html>');return;}
  const p=routes.get(req.url);if(!p){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',p.endsWith('.wasm')?'application/wasm':'text/javascript');res.end(await readFile(p));
});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
test.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
for(const [name,type] of Object.entries({chromium,firefox,webkit}))test(`Application adapters ${name}: actual source/PNG/build/STL leases and private Worker reset`,{timeout:90000},async()=>{
  const privateDir=path.join(run,'cache/adapter-browser',name),context=await type.launchPersistentContext(path.join(privateDir,'profile'),{headless:true,downloadsPath:path.join(privateDir,'downloads')});
  const phases=[];
  try{await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.text().startsWith('adapter-phase:'))phases.push(e.text());});await page.goto(origin);
    const result=await page.evaluate(async()=>{const m=await import('/adapters.mjs');return m.runAdapterChecks();});assert.deepEqual(errors,[]);
    const volumes=[];for(const f of result.parts){const bytes=Buffer.from(f.base64,'base64'),mesh=inspectMesh(readSTL(bytes));volumes.push(mesh.volume);await writeFile(path.join(output,name+'-'+f.name),bytes);}
    assert.equal(volumes.length,2);assert.ok(Math.abs(volumes[0]-168)<.005);assert.ok(Math.abs(volumes[1]-200)<.005);
    result.parts=result.parts.map(({name})=>({name}));await writeFile(path.join(output,name+'.json'),JSON.stringify({browser:name,volumes,result},null,2));
  }finally{await writeFile(path.join(output,name+'-phases.json'),JSON.stringify(phases));await context.close();}
});
