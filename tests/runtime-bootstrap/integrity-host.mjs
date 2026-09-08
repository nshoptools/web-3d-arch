import {readFile,writeFile,mkdir,readdir,realpath} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {build} from 'vite';
import assert from 'node:assert/strict';
const hash=b=>createHash('sha256').update(b).digest('hex');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
export async function createIntegrityHost({root,run,modulePath,moduleHash,wasmHash,tag='current'}){
 const absoluteRun=await realpath(run),repo=await realpath(process.env.PROJECT_ROOT);
 assert.ok(absoluteRun.startsWith(repo+path.sep),'own run inside repository');
 assert.match(tag,/^[a-zA-Z0-9_-]{1,24}$/);
 assert.match(moduleHash??'',/^[a-f0-9]{64}$/);assert.match(wasmHash??'',/^[a-f0-9]{64}$/);
 const module=Buffer.from(await readFile(modulePath)),wasm=Buffer.from(await readFile(modulePath.replace(/\.mjs$/,'.wasm')));
 assert.equal(hash(module),moduleHash,'explicit authorized module pin');assert.equal(hash(wasm),wasmHash,'explicit authorized WASM pin');
 assert.ok(module.length<=16*1024*1024&&wasm.length<=64*1024*1024);
 const bundle=path.join(run,'work/integrity-worker-bundles',tag),backing=path.join(run,'work/integrity-host-inputs',tag);
 await mkdir(backing,{recursive:true});
 // These expendable files prove that the host serves its verified retained
 // buffers. Captured input artifacts are never modified.
 await writeFile(path.join(backing,'arch-kernel.mjs'),module);await writeFile(path.join(backing,'arch-kernel.wasm'),wasm);
 await build({configFile:false,root,cacheDir:path.join(run,'cache/vite-integrity'),logLevel:'warn',build:{target:'es2022',modulePreload:false,outDir:bundle,emptyOutDir:false,minify:false,rollupOptions:{input:path.join(root,'src/core/engine-worker.mjs'),output:{entryFileNames:'engine-worker.mjs',chunkFileNames:'chunks/[name]-[hash].mjs'}}}});
 const routes=new Map(),requests=[],scenarios=new Map();
 const add=async dir=>{for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())await add(p);else routes.set('/src/core/'+path.relative(bundle,p).replaceAll('\\','/'),{body:Buffer.from(await readFile(p)),mediaType:'text/javascript'});}};
 await add(bundle);
 for(const rel of ['src/core/engine-client.mjs','src/core/runtime-integrity.mjs','src/core/source-frame.mjs','tests/runtime-bootstrap/observed-worker.mjs','tests/runtime-bootstrap/browser-scenarios.mjs'])routes.set('/'+rel,{body:Buffer.from(await readFile(path.join(root,rel))),mediaType:'text/javascript'});
 const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://private.test').pathname;
  for(const[k,v]of Object.entries({'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin','X-Content-Type-Options':'nosniff',
   'Content-Security-Policy':"default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'"}))res.setHeader(k,v);
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Actual production runtime integrity Worker tests</title>');return;}
  const route=routes.get(pathname);if(!route){const candidate=pathname.split('/')[2];requests.push({path:pathname,scenario:scenarios.has(candidate)?candidate:null,kind:pathname.endsWith('.wasm')?'wasm':'unmapped',status:404,bytes:0,sha256:null,method:req.method});res.writeHead(404);res.end();return;}
  const record={path:pathname,scenario:route.scenario??null,kind:route.kind??'harness',status:200,bytes:route.body.length,sha256:hash(route.body),method:req.method};
  requests.push(record);
  if(route.scenario){
   const s=scenarios.get(route.scenario);s.seen[route.kind].resolve();
   if(route.kind==='wasm'&&s.hold)await s.release.promise;
  }
  if(res.destroyed)return;
  res.setHeader('Content-Type',route.mediaType);res.setHeader('Content-Length',route.body.length);
  res.setHeader('Cache-Control',route.scenario?'public, max-age=31536000, immutable':'no-store');
  res.end(route.body);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 function scenario(id,{fault=null,mode='normal',hold=false}={}){
  assert.match(id,/^[a-z0-9-]+$/);assert.ok(!scenarios.has(id),'unique immutable scenario');
  const moduleURL='/assets/'+id+'/arch-kernel.'+moduleHash+'.mjs',wasmURL='/assets/'+id+'/arch-kernel.'+wasmHash+'.wasm';
  const m=Buffer.from(module),w=Buffer.from(wasm);
  if(fault==='module-bytes')m[m.length-1]^=1;
  if(fault==='wasm-bytes')w[w.length-1]^=1;
  routes.set(moduleURL,{body:m,mediaType:'text/javascript',scenario:id,kind:'module'});
  routes.set(wasmURL,{body:w,mediaType:'application/wasm',scenario:id,kind:'wasm'});
  scenarios.set(id,{hold,release:deferred(),seen:{module:deferred(),wasm:deferred()}});
  return{id,integrity:{version:'arch-engine-integrity/1',module:{url:origin+moduleURL,sha256:moduleHash,bytes:module.length},wasm:{url:origin+wasmURL,sha256:wasmHash,bytes:wasm.length}},workerURL:origin+'/tests/runtime-bootstrap/observed-worker.mjs?mode='+mode};
 }
 async function waitFor(id,kind){
  const s=scenarios.get(id);let timeout;try{await Promise.race([s.seen[kind].promise,new Promise((_,reject)=>timeout=setTimeout(()=>reject(Error('Held request deadline '+id+'/'+kind)),10000))]);}finally{clearTimeout(timeout);}
 }
 return{origin,scenario,waitFor,release:id=>scenarios.get(id).release.resolve(),
  requests:id=>requests.filter(r=>id===undefined||r.scenario===id),
  async poisonBackingFiles(){await writeFile(path.join(backing,'arch-kernel.mjs'),Buffer.alloc(module.length,0));await writeFile(path.join(backing,'arch-kernel.wasm'),Buffer.alloc(wasm.length,0));},
  assertRetained(){assert.equal(hash(module),moduleHash);assert.equal(hash(wasm),wasmHash);},
  async close(){for(const s of scenarios.values())s.release.resolve();await new Promise(resolve=>{server.closeAllConnections();server.close(resolve);});},
  module:{bytes:module.length,sha256:moduleHash},wasm:{bytes:wasm.length,sha256:wasmHash}};
}
