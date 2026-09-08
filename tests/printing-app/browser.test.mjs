import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir,copyFile} from 'node:fs/promises';
import {resolve,dirname,join,extname,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import http from 'node:http';
import {profiles,sha256} from './fixtures.mjs';
const run=process.env.PROJECT_REVIEW_RUN,repo=process.env.PROJECT_ROOT,base=fileURLToPath(new URL('../../',import.meta.url));
const label=process.env.PRINTING_EVIDENCE_LABEL??'browser',publicRoot=resolve(run,'work/browser-'+label),evidence=resolve(run,'evidence/browser-'+label);
await mkdir(publicRoot,{recursive:true});await mkdir(evidence,{recursive:true});
const pins=JSON.parse(await readFile(resolve(run,'inputs/runtime-test-module.json'),'utf8')),moduleFile=process.env.PRINTING_MODULE;
assert.ok(moduleFile,'PRINTING_MODULE required');const moduleData=await readFile(moduleFile),wasmData=await readFile(moduleFile.replace(/\.mjs$/,'.wasm'));
assert.equal(await sha256(moduleData),pins.moduleSha256);assert.equal(await sha256(wasmData),pins.wasmSha256);
const {rolldown}=await import(pathToFileURL(resolve(repo,'.toolchain/app-runtime/node_modules/rolldown/dist/index.mjs')));
const bundle=await rolldown({input:{browser:resolve(base,'tests/printing-app/browser-entry.mjs'),engine:resolve(base,'src/core/engine-worker.mjs')},platform:'browser'});
try{await bundle.write({dir:publicRoot,format:'es',entryFileNames:'[name].mjs',chunkFileNames:'[name]-[hash].mjs'});}finally{await bundle.close();}
await mkdir(resolve(publicRoot,'module'),{recursive:true});await writeFile(resolve(publicRoot,'module/arch-kernel.mjs'),moduleData);await writeFile(resolve(publicRoot,'module/arch-kernel.wasm'),wasmData);
await writeFile(resolve(publicRoot,'index.html'),'<!doctype html><meta charset="utf-8"><title>Printing RPC implementation test</title><script type="module" src="/browser.mjs"></script>');
async function inventory(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())out.push(...await inventory(p));else out.push(p);}return out;}
const files=new Map();for(const p of await inventory(publicRoot)){const url='/'+relative(publicRoot,p).replaceAll('\\','/');files.set(url,await readFile(p));}files.set('/',files.get('/index.html'));
const server=http.createServer((req,res)=>{
 const b=files.get(req.url);res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cross-Origin-Resource-Policy','same-origin');
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; style-src 'none'; img-src 'none'; object-src 'none'; base-uri 'none'");
 if(req.method!=='GET'||!b){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',req.url.endsWith('.wasm')?'application/wasm':req.url==='/'||req.url.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8');res.end(b);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const PW=await import(pathToFileURL(resolve(repo,'.toolchain/app-runtime/node_modules/playwright/index.mjs'))),P=await profiles(base);
const expected={chromium:'153.0.8010.12',firefox:'155.0',webkit:'26.6'};
test.after(()=>new Promise(resolve=>server.close(resolve)));
for(const name of ['chromium','firefox','webkit'])test('actual parent printing RPC in pinned '+name,{timeout:120000},async()=>{
 const profile=resolve(run,'cache/browser-'+label,name),downloads=resolve(run,'cache/browser-'+label,name+'-downloads');
 await mkdir(profile,{recursive:true});await mkdir(downloads,{recursive:true});
 const browser=await PW[name].launchPersistentContext(profile,{headless:true,downloadsPath:downloads,env:{...process.env,APPDATA:resolve(run,'cache/browser-'+label,'appdata'),LOCALAPPDATA:resolve(run,'cache/browser-'+label,'localappdata')}});
 let blocked=0;
 try{
  assert.equal(browser.browser().version(),expected[name]);
  await browser.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin||!files.has(u.pathname)){blocked++;return route.abort();}return route.continue();});
  const page=browser.pages()[0]??await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);await page.waitForFunction(()=>typeof globalThis.runPrintingBrowser==='function');
  const result=await page.evaluate(data=>globalThis.runPrintingBrowser(data),{profiles:P,pins});
  assert.equal(result.status,'passed');assert.equal(result.printingSends,2);assert.equal(result.rootRuntimeInitializations,1);assert.equal(result.actualParentRPC,true);
  assert.deepEqual(errors,[]);assert.equal(blocked,0);
  const target=resolve(evidence,name);await mkdir(target,{recursive:true});for(const f of result.files)await writeFile(resolve(target,f.name),new Uint8Array(f.bytes));delete result.files;
  await writeFile(resolve(target,'result.json'),JSON.stringify({...result,browser:name,version:expected[name],network:'explicit loopback file whitelist',blocked},null,2));
 }finally{await browser.close();}
});
