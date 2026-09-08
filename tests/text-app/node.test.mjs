import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {environment,sha256} from './environment.mjs';
import {fixtureData,mappedAssets} from './fixture-data.mjs';
const env=await environment(),fixture=await fixtureData(env.root),origin='https://text-app.test';
const {createTextOperations}=await import(pathToFileURL(path.join(env.stage,'src/core/text-operations.mjs')));
const {parentPreview}=await import(pathToFileURL(path.join(env.stage,'tests/text-app/kernel-preview.mjs')));
const {runSuite}=await import(pathToFileURL(path.join(env.stage,'tests/text-app/suite.mjs')));
let moduleFactories=0;const Module=await(await import(pathToFileURL(env.modulePath))).default({print(){},printErr(){}});moduleFactories++;
const parent=parentPreview(Module);
let assetURLs=mappedAssets(fixture,origin);const readFixture=async hash=>new Uint8Array(await readFile(fixture.assetFiles.get(hash)));
const requests=[];const fetchImpl=async(url,options)=>{
  const record=assetURLs.find(r=>r.url===url);if(!record)throw Error('Outside Node fixture whitelist');
  requests.push(url);const bytes=await readFixture(record.sha256);
  return new Response(bytes,{status:200,headers:{'content-length':String(bytes.length)}});
};
const options=()=>({Module,catalog:fixture.catalog,assetURLs,origin,fetchImpl,runtime:{engine:'node',version:process.version},previewPaths:parent.callback});
let service=createTextOperations(options()),n=0;
for(const text of fixture.selected){
  const item=fixture.catalog.collections[1].items.find(x=>x.emoji===text),ticket={id:'thumbnail-'+(++n),userId:'fixture-user',projectId:'fixture-project',revision:0,generation:8000+n};
  const r=await service.run({version:'arch-app-adapters/1',ticket,op:'emoji.select',state:fixture.initialState,sourceContext:{version:'arch-source-context/1',operation:'import',id:'thumbnail-source-'+n,revision:0,predecessor:null},assetsMap:new Map(),id:item.id,collectionId:'noto-emoji-monochrome'},
    {isCurrent:()=>true,signal:new AbortController().signal});
  if(!r.preview?.png)throw Error('Missing real mono thumbnail');
  const bytes=r.preview.png,digest=sha256(bytes),file=await env.output('inputs/mono-thumbnails/'+item.id+'.png');await writeFile(file,bytes);
  fixture.assetFiles.set(digest,file);fixture.assetRecords.set(digest,{sha256:digest,bytes:bytes.length,mediaType:'image/png'});
  fixture.catalog.previews.push({collectionId:'noto-emoji-monochrome',itemId:item.id,sha256:digest,sourceKind:'parent-HarfBuzz-mono-planar-preview',sourceHash:fixture.entries.mono.sha256,artifactHash:r.prepared.artifactHash});
}
service.dispose();assetURLs=mappedAssets(fixture,origin);service=createTextOperations(options());
const result=await runSuite({fixture,assetURLs,origin,readFixture,capabilities:{realColor:false,moduleFactories},
  invoke:(request,c)=>service.run(request,{signal:c.signal,onProgress:c.onProgress,isCurrent:t=>JSON.stringify(t)===JSON.stringify(c.ticket)}),
  reset:async()=>service.reset(),onResult:r=>console.log((r.ok?'ok ':'not ok ')+r.name+(r.ok?'':'\n'+r.error))});
const current=Array.from(new Int32Array(Module.HEAPU8.buffer,Module._arch_control_ptr(),4));
const ticket={id:'generation-proof',userId:'fixture-user',projectId:'fixture-project',revision:0,generation:9001};
await service.run({version:'arch-app-adapters/1',ticket,op:'font.import',file:{name:'Inter.ttf',mediaType:'font/ttf',bytes:await readFixture(fixture.entries.inter.sha256)}},{isCurrent:()=>true});
const after=Array.from(new Int32Array(Module.HEAPU8.buffer,Module._arch_control_ptr(),4));
if(JSON.stringify(current)!==JSON.stringify(after))throw Error('Font import changed parent native generation');
service.dispose();
const {coreChecks}=await import(pathToFileURL(path.join(env.stage,'tests/text-app/core-checks.mjs')));
const core=await coreChecks({options:options(),fixture,readFixture});for(const r of core)console.log((r.ok?'ok ':'not ok ')+r.name+(r.ok?'':'\n'+r.error));
const report={...result,core,node:process.version,moduleFactories,moduleHash:sha256(await readFile(env.modulePath.replace(/\.mjs$/,'.wasm'))),nativeGenerationBefore:current,nativeGenerationAfter:after,requests};
await writeFile(await env.output('evidence/text-app-node.json'),JSON.stringify(report,null,2));
await writeFile(await env.output('evidence/text-app-fixture.json'),JSON.stringify({catalog:fixture.catalog,entries:fixture.entries,selected:fixture.selected,initialState:fixture.initialState,assetFiles:[...fixture.assetFiles],assetRecords:[...fixture.assetRecords]}));
await writeFile(await env.output('evidence/text-app-staging.json'),JSON.stringify({modulePath:env.modulePath,copied:env.copied},null,2));
console.log(JSON.stringify({passed:report.passed,total:report.total,moduleFactories,nativeGenerationPreserved:true}));
if(report.passed!==report.total||core.some(r=>!r.ok))process.exitCode=1;
