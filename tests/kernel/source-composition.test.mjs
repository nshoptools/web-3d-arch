import test from 'node:test';import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath} from 'node:url';import {createServer} from 'node:http';
import {build} from 'vite';import {chromium,firefox,webkit} from 'playwright';
import {fixtureData,mappedAssets} from '../text-app/fixture-data.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),run=process.env.PROJECT_REVIEW_RUN;
if(!run||!process.env.ARCH_WASM_MODULE)throw Error('Assigned run and root ARCH_WASM_MODULE required');
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),out=path.join(run,'evidence/source-composition-'+stamp),work=path.join(run,'work/source-composition-'+stamp);
await mkdir(out,{recursive:true});await mkdir(work,{recursive:true});const fixture=await fixtureData(root),routes=new Map(),bundle=path.join(work,'bundle');
await build({configFile:false,root,cacheDir:path.join(run,'cache/vite-source-composition'),logLevel:'warn',build:{target:'es2022',modulePreload:false,outDir:bundle,emptyOutDir:false,minify:false,
  rollupOptions:{preserveEntrySignatures:'strict',input:{'engine-worker':path.join(root,'src/core/engine-worker.mjs'),'source-page':path.join(root,'tests/kernel/source-composition-page.mjs')},output:{entryFileNames:'[name].mjs',chunkFileNames:'chunks/[name]-[hash].mjs'}}}});
async function add(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())await add(p);else routes.set('/bundle/'+path.relative(bundle,p).replaceAll('\\','/'),await readFile(p));}}
await add(bundle);for(const ext of ['mjs','wasm'])routes.set('/runtime/arch-kernel.'+ext,await readFile(process.env.ARCH_WASM_MODULE.replace(/\.mjs$/,'.'+ext)));
for(const [digest,file]of fixture.assetFiles)routes.set('/library/'+digest,await readFile(file));
const server=createServer((req,res)=>{for(const [k,v]of Object.entries({'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin','Cache-Control':'no-store'}))res.setHeader(k,v);
  if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="vi"><meta charset="utf-8"><title>Source composition component test</title><body>Source composition component test</body></html>');return;}
  const b=routes.get(req.url);if(!b){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',req.url.endsWith('.wasm')?'application/wasm':req.url.startsWith('/library/')?'application/octet-stream':'text/javascript');res.end(b);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
test.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
for(const [engine,type]of Object.entries({chromium,firefox,webkit}))test('Source composition '+engine+': real SVG/text/color/raster, distinct consent and retirement',{timeout:240000},async()=>{
  const browser=await type.launchPersistentContext(path.join(run,'p/source-'+stamp+'-'+engine),{headless:true,downloadsPath:path.join(work,'downloads',engine),...(engine==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
  const page=browser.pages()[0],errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{await browser.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());await page.goto(origin);
    const result=await page.evaluate(async args=>(await import('/bundle/source-page.mjs')).runSourceComposition(args),{catalog:fixture.catalog,assetURLs:mappedAssets(fixture,origin),initialState:fixture.initialState,runtime:{engine,version:browser.browser().version()}});
    assert.equal(result.status,'pass');assert.equal(result.trace.length,3);assert.deepEqual(errors,[]);await writeFile(path.join(out,engine+'.json'),JSON.stringify(result,null,2));
  }catch(e){await writeFile(path.join(out,engine+'-failure.json'),JSON.stringify({error:e.stack,errors},null,2));throw e;}finally{await browser.close();}
});
