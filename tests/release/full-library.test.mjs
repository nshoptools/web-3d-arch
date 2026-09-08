import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {inputFixture,dir,write,candidate} from './helpers.mjs';
import {startArtifact} from './http-helpers.mjs';
import {hash} from '../../tools/release/core.mjs';
test('full frozen21391-resource catalog: portable HTTPS hashes, inert originals, all7751PNG preview bindings and browser Worker',{timeout:600000},async t=>{
 const libraryRoot=process.env.RELEASE_LIBRARY_ROOT;assert.ok(libraryRoot,'supply own checked deployment via -LibraryRoot or stage-library.mjs');
 const original=JSON.parse(readFileSync(resolve(libraryRoot,'source-library/deployment.json')));
 const catalog=JSON.parse(readFileSync(resolve(libraryRoot,'source-library/catalog.json')));
 const readyBytes=readFileSync(resolve(libraryRoot,'source-library/ready.json')),ready=JSON.parse(readyBytes);
 assert.equal(original.records.length,21391);assert.equal(original.totalUniqueBytes,306260612);assert.equal(catalog.previews.length,7751);
 const rss=[{phase:'beforeBuild',rss:process.memoryUsage().rss}],before=Object.fromEntries(ready.files.map(r=>[r.url,r.sha256]));
 const x=inputFixture({libraryRoot,label:'full-library'});
 const fixturePins=JSON.parse(readFileSync(resolve(candidate,'tests/release/fixtures/source-reader-pins.json')));
 for(const f of fixturePins){const b=readFileSync(resolve(candidate,f.fixture));assert.equal(hash(b),f.sha256);const r=write(x.front,'binding/'+f.fixture.split('/fixtures/')[1],b);x.input.frontend.assets.push({...r,url:'/'+r.file,cache:'revalidate',licenseIds:['application']});}
 let worker=readFileSync(resolve(x.front,'worker.mjs'),'utf8');
 worker="import {createSourceCatalog,createAssetReader} from './binding/integration/source-catalog.mjs';\n"+worker;
 worker=worker.replace("const m=await create(),svg=", "const catalogService=createSourceCatalog(lib);const fontCount=catalogService.queryFonts().length;const query=catalogService.queryEmoji('');const reader=createAssetReader({...lib,fetchImpl:fetch});const m=await create(),svg=");
 worker=worker.replace("const preview=", "const readSource=await reader(svg),controller=new AbortController();controller.abort();let cancelled=false;try{await reader(svg,{signal:controller.signal});}catch(e){cancelled=e.code==='CANCELLED';}const readerHash=await sourceDigest(readSource);const preview=");
 worker=worker.replace("resources:lib.assetURLs.length", "readerHash,fontCount,queried:query.entries.length,cancelled,resources:lib.assetURLs.length");
 const wp=write(x.front,'worker.mjs',worker);Object.assign(x.input.frontend.assets.find(a=>a.file==='worker.mjs'),wp);
 const built=await x.build();rss.push({phase:'afterBuild',rss:process.memoryUsage().rss});
 const m=JSON.parse(readFileSync(resolve(built.directory,'release-manifest.json')));
 assert.equal(m.library.originalResources,21391);assert.equal(m.library.totalUniqueBytes,306260612);
 assert.equal(m.library.previews,7751);assert.equal(m.library.readySha256,hash(readyBytes));
 const transport=JSON.parse(readFileSync(resolve(built.directory,'public'+m.library.documents.transport.url))),wireMap=new Map(transport.records.map(r=>[r.sha256,r]));
 for(const p of catalog.previews){const r=wireMap.get(p.sha256);assert.equal(r.sourceMediaType,'image/png');assert.equal(r.wireMime,'image/png');assert.ok(r.url.endsWith('.png'));}
 for(const [name,key]of [['catalog','catalog'],['deployment','deployment'],['artwork','artwork'],['build-receipt','receipt']]){
  const ref=m.library.documents[key];assert.equal(ref.sha256,before['source-library/'+name+'.json']);
  assert.equal(hash(readFileSync(resolve(built.directory,'public'+ref.url))),ref.sha256);
 }
 // Every source is unchanged after packaging. This is deliberately a full byte/hash check.
 for(const r of original.records)assert.equal(hash(readFileSync(resolve(libraryRoot,r.url))),r.sha256);
 const f=await startArtifact(t,built.directory);rss.push({phase:'hostPreloaded',rss:process.memoryUsage().rss});
 const originalByType=new Map();
 for(const r of original.records)if(!originalByType.has(r.mediaType))originalByType.set(r.mediaType,r);
 const probes=[];
 for(const [mediaType,r]of originalByType){
  const wire=wireMap.get(r.sha256),response=await f.request('GET','/'+wire.url);
  assert.equal(response.status,200);assert.equal(hash(response.raw),r.sha256);assert.equal(response.raw.length,r.bytes);
  assert.equal(response.headers['content-type'],wire.wireMime);assert.equal(wire.sourceMediaType,mediaType);
  probes.push({mediaType,url:wire.url,sha256:r.sha256,bytes:r.bytes,wireMime:wire.wireMime});
 }
 assert.equal((await f.request('GET','/'+originalByType.get('image/svg+xml').url)).status,404);
 const runtime=resolve(process.env.PROJECT_ROOT,'.toolchain/app-runtime/node_modules'),playwright=await import(pathToFileURL(resolve(runtime,'playwright/index.mjs')).href);
 assert.equal(JSON.parse(readFileSync(resolve(runtime,'playwright/package.json'))).version,'1.63.0');
 const root=dir('full-catalog-browser');
 for(const d of ['profile','downloads','artifacts','appdata','localappdata'])mkdirSync(resolve(root,d));
 const context=await playwright.chromium.launchPersistentContext(resolve(root,'profile'),{headless:true,ignoreHTTPSErrors:true,acceptDownloads:false,
  downloadsPath:resolve(root,'downloads'),artifactsDir:resolve(root,'artifacts'),args:['--ignore-certificate-errors','--disable-background-networking'],
  env:{...process.env,APPDATA:resolve(root,'appdata'),LOCALAPPDATA:resolve(root,'localappdata')}});
 t.after(()=>context.close());await context.route('**/*',route=>new URL(route.request().url()).origin===f.origin?route.continue():route.abort('blockedbyclient'));
 const page=context.pages()[0]??await context.newPage();await page.goto(f.origin+'/');await page.waitForFunction(()=>globalThis.releaseSmokeLoaded);
 const result=await page.evaluate(async()=>{
  const worker=await new Promise((yes,no)=>{const w=new Worker('/worker.mjs',{type:'module'}),timer=setTimeout(()=>{w.terminate();no(Error('FULL_WORKER_DEADLINE'));},60000);
   w.onmessage=e=>{clearTimeout(timer);w.terminate();yes(e.data);};w.onerror=()=>{clearTimeout(timer);w.terminate();no(Error('FULL_WORKER_ERROR'));};w.postMessage('run');});
  const b=await(await fetch('/release-bindings.json')).json(),catalog=await(await fetch(b.library.catalog.url)).json(),transport=await(await fetch(b.library.transport.url)).json();
  const images=[];for(const collection of catalog.collections){
   const p=catalog.previews.find(p=>p.collectionId===collection.id),r=transport.records.find(r=>r.sha256===p.sha256);
   const size=await new Promise((yes,no)=>{const im=new Image();im.onload=()=>yes({width:im.naturalWidth,height:im.naturalHeight});im.onerror=()=>no(Error('ORIGINAL_PNG_DECODE'));im.src='/'+r.url;});
   images.push({collection:collection.id,expected:{width:p.width,height:p.height},actual:size});
  }
  const entry=catalog.fonts.find(f=>!f.color),resource=transport.records.find(r=>r.sha256===entry.sha256),font=new FontFace('PinnedReleaseFont','url(/'+resource.url+')');
  await font.load();document.fonts.add(font);
  return {isolated:crossOriginIsolated,worker,images,font:font.status};
 });
 assert.equal(result.isolated,true);assert.equal(result.worker.result,42,'synthetic plumbing module, no native product claim');
 assert.equal(result.worker.resources,21391);assert.equal(result.worker.previews,7751);assert.equal(result.worker.svgHash,result.worker.expectedSvgHash);
 assert.equal(result.worker.readerHash,result.worker.expectedSvgHash);assert.equal(result.worker.cancelled,true);assert.ok(result.worker.fontCount>=53&&result.worker.queried>0);
 assert.equal(result.font,'loaded');assert.equal(result.images.length,2);for(const image of result.images)assert.deepEqual(image.actual,image.expected);
 rss.push({phase:'afterBrowser',rss:process.memoryUsage().rss});
 writeFileSync(resolve(x.root,'full-catalog-evidence.json'),JSON.stringify({status:'passed',packageSha256:built.result.sha256,publicAssets:built.result.publicAssets,
  publicBytes:built.result.publicBytes,originalAssetBytes:306260612,configBytes:41010331,resources:21391,previews:7751,originalByteHashesUnchanged:true,
  probes,result,rss,rssIsNotProcessCap:true,fixtureEntryAndWasm:true,productionAppComplete:false,independentReview:false},null,2)+'\n');
});
