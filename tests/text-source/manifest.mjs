// Run only after dot-sourcing this run's environment. Inventories the candidate; never promotes it.
import {readFile,writeFile,readdir,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fixtureData} from './fixture-data.mjs';
const root=await realpath(process.env.PROJECT_ROOT),run=await realpath(process.env.PROJECT_REVIEW_RUN);
const candidate=await realpath(fileURLToPath(new URL('../../',import.meta.url)));
if(!run.endsWith(path.join('codex','runs','20260908-text-source-wave1'))||candidate!==path.join(run,'work','text-source'))throw Error('Wrong room/candidate');
for(let p=path.join(run,'evidence');p!==root;p=path.dirname(p))if((await lstat(p)).isSymbolicLink())throw Error('Reparse output');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),relative=p=>path.relative(root,p).split(path.sep).join('/');
async function fileInfo(file){const bytes=await readFile(file);return {path:relative(file),bytes:bytes.byteLength,sha256:sha(bytes)};}
async function walk(dir){
  const list=[];
  for(const ent of await readdir(dir,{withFileTypes:true})){
    const file=path.join(dir,ent.name);if((await lstat(file)).isSymbolicLink())throw Error('Reparse input '+file);
    if(ent.isDirectory())list.push(...await walk(file));else if(ent.isFile())list.push(file);else throw Error('Non-file candidate entry');
  }
  return list.sort();
}
const readEvidence=async p=>JSON.parse(await readFile(path.join(run,'evidence',p),'utf8'));
const node=await readEvidence('node-results.json'),protocol=await readEvidence('bridge-client-results.json');
if(node.total!==85||node.passed!==85||node.results.some(r=>!r.ok))throw Error('Node acceptance incomplete');
if(protocol.total!==10||protocol.passed!==10||protocol.results.some(r=>!r.ok))throw Error('Bridge protocol acceptance incomplete');
const aggregate=await readEvidence('browser/run-chromium-firefox-webkit.json'),browser=[];
for(const name of ['chromium','firefox','webkit']){
  const result=await readEvidence('browser/'+name+'/results.json');
  const checks=[...result.shared,...result.renderer,...result.messages,...result.bridge.results];
  if(checks.some(r=>!r.ok)||result.total!==144)throw Error('Browser assertion failure: '+name);
  if(result.passed!==(name==='webkit'?137:144)||result.skipped!==(name==='webkit'?7:0))throw Error('Unexpected browser count: '+name);
  if(!result.crossOriginIsolated||!result.sharedHeap||result.frames<1)throw Error('Worker/COI responsiveness evidence absent');
  const bridge=result.bridge;
  if(bridge.results.length!==31||bridge.results.some(r=>!r.ok||r.skipped)||bridge.frames<1)throw Error('Main bridge incomplete');
  if(!Number.isFinite(bridge.maxRenderSyncMs)||bridge.maxRenderSyncMs>100||
     !Number.isFinite(bridge.maxFontSetupSpentMs)||bridge.maxFontSetupSpentMs>500)throw Error('Main bridge observed budget exceeded');
  const backend=name==='webkit'?'detached-HTMLCanvasElement':'main-OffscreenCanvas';
  if(bridge.canvasBackends.length!==1||bridge.canvasBackends[0]!==backend||bridge.rawSvgDom||bridge.objectUrls)throw Error('Bridge capability/provenance mismatch');
  for(const sample of bridge.samples){
    if(sample.width>512||sample.height>512||sample.renderer.id!=='main-thread-native-font-image/1'||
       sample.sampling.bridge.canvas!==backend||sample.sampling.bridge.maxFontSetupMs!==500)throw Error('Incorrect bridge sample provenance');
  }
  if(!bridge.samples.length)throw Error('Missing real main bridge samples');
  const record=aggregate.results.find(r=>r.engine===name);
  if(!record||record.passed!==result.passed||record.skipped!==result.skipped||record.total!==result.total||
      aggregate.engineHash!==result.engineHash||aggregate.loopback!=='http://127.0.0.1:'+result.port)throw Error('Aggregate evidence stale');
  browser.push(result);
}
const typesCommand=[path.join(root,'.toolchain/app-runtime/node_modules/typescript/bin/tsc'),'--ignoreConfig','--noEmit','--strict','--module','NodeNext','--moduleResolution','NodeNext','--target','ES2024','--lib','ES2024,WebWorker',path.join(candidate,'tests/text-source/types.test.mts')];
const types=await promisify(execFile)(process.execPath,typesCommand,{cwd:root,env:process.env,windowsHide:true});
const typeResult={verdict:'pass',command:[process.execPath,...typesCommand],stdout:types.stdout,stderr:types.stderr,typescript:'7.0.2'};
await writeFile(path.join(run,'evidence/type-check.json'),JSON.stringify(typeResult,null,2));
const fixture=await fixtureData(root);
const assets=[];for(const [expected,file] of fixture.assetFiles){
  const actual=await fileInfo(file);if(actual.sha256!==expected)throw Error('Original fixture hash mismatch');assets.push(actual);
}
const files=await Promise.all((await walk(candidate)).map(fileInfo));
const product=files.filter(f=>f.path.includes('/src/input/')&&f.path.endsWith('.mjs'));
for(const f of product){
  const text=await readFile(path.join(root,f.path),'utf8');
  if(/\bfetch\s*\(|\bXMLHttpRequest\b|from\s+['"]node:|\binnerHTML\b|\bcreateObjectURL\b|new\s+Worker\s*\(|WebAssembly\.(?:instantiate|compile)/u.test(text))throw Error('Production boundary violation: '+f.path);
}
const dependencyPaths=[
  'src/input/harfbuzz-engine.mjs','src/input/font-source-core.mjs','src/input/font-source.mjs',
  'src/assets/harfbuzz/assets-lock.json','src/assets/harfbuzz/LICENSE',
  'src/assets/emoji/collections.json','src/assets/emoji/color/assets-lock.json',
  'tmp/reviews/codex/runs/20260908-implementation-wave1/work/module/arch-kernel.mjs',
  'tmp/reviews/codex/runs/20260908-implementation-wave1/work/module/arch-kernel.wasm',
  '.toolchain/app-runtime/node_modules/playwright/package.json','.toolchain/app-runtime/node_modules/playwright-core/browsers.json',
  '.toolchain/app-runtime/node_modules/typescript/package.json',
];
const dependencies=await Promise.all(dependencyPaths.map(p=>fileInfo(path.join(root,p))));
const wasm=dependencies.find(p=>p.path.endsWith('arch-kernel.wasm'));
if(browser.some(b=>b.engineHash!==wasm.sha256))throw Error('Parent WASM changed since browser verification; rerun before sealing');
for(const b of browser)for(const s of [...b.samples,...b.bridge.samples]){
  if((await fileInfo(s.file)).sha256!==s.pngHash)throw Error('Sample PNG differs from browser evidence');
}
const evidencePaths=[
  'evidence/node-results.json','evidence/reference-cases.json','evidence/bridge-client-results.json','evidence/type-check.json',
  'evidence/browser/chromium/results.json','evidence/browser/firefox/results.json','evidence/browser/webkit/results.json',
  'evidence/browser/run-chromium-firefox-webkit.json',
  'evidence/bridge-font-budget-100ms-failure.json','evidence/main-font-load-probe.json',
  ...browser.flatMap(b=>[...b.samples,...b.bridge.samples].map(s=>path.relative(run,s.file))),
];
const evidence=await Promise.all(evidencePaths.map(p=>fileInfo(path.join(run,p))));
const manifest={
  schemaVersion:1,createdAt:new Date().toISOString(),candidate:relative(candidate),runId:'20260908-text-source-wave1',
  phase:'implementation-self-verification',review:{independent:false,inheritedAssignment:'Astra/max',fastSetting:'not-exposed',childAgents:0},
  productFiles:product.length,candidateFiles:files.length,candidateBytes:files.reduce((n,f)=>n+f.bytes,0),
  verdict:'source-and-bounded-bridge-pass-worker-capability-partial',
  results:{node:{version:node.node,passed:node.passed,total:node.total},bridgeProtocol:{passed:protocol.passed,total:protocol.total},types:{version:'7.0.2',verdict:'pass'},
    browsers:browser.map(b=>({engine:b.engine,version:b.version,passed:b.passed,skipped:b.skipped,total:b.total,verdict:b.verdict,frames:b.frames,port:b.port,workerCapabilities:b.capabilities,
      bridge:{passed:b.bridge.results.length,total:b.bridge.results.length,canvasBackends:b.bridge.canvasBackends,frames:b.bridge.frames,maxFrameGapMs:b.bridge.maxFrameGapMs,
        maxNativeCallMs:b.bridge.maxSyncMs,maxRenderCallMs:b.bridge.maxRenderSyncMs,maxFontSetupSpentMs:b.bridge.maxFontSetupSpentMs,samples:b.bridge.samples.length}}))},
  dependencies:{harfbuzz:{version:'14.4.0',revision:'36cb489cb02ce4b92099669ba9f9bea348eff93f',wrapper:'harfbuzzjs 1.6.1',abi:2},playwright:'1.63.0',files:dependencies},
  sourceAssets:assets,files,evidence,
  constraints:['Prefer Worker native rendering on Chromium/Firefox; WebKit Worker OffscreenCanvas remains unavailable',
    'Explicit host-installed main bridge: real Noto COLRv1/CBDT, 512 edge, 4096 paints, exact source allowlist, two cached fonts/8MB',
    'Main native budgets are observed, not preemptive: 100ms render call, 500ms aggregate font setup, 10s cooperative deadline',
    'Explicit host itemization for mixed scripts/bidi; no fallback',
    'Four cached Worker font readers and bounded products; parent native heap/deadline watchdog required',
    'Original SVG routed to existing validated parser; no raw SVG DOM or object URLs',
    'Host confirms source-to-RGBA proposal and separate color reduction; parent owns history/persistence/geometry',
    'No total source error bound, micron geometry, final mesh or physical fit qualification'],
};
// Re-read every inventory entry immediately before publishing.
for(const entry of [...files,...dependencies,...assets,...evidence])
  if((await fileInfo(path.join(root,entry.path))).sha256!==entry.sha256)throw Error('Input changed during inventory: '+entry.path);
const output=path.join(run,'evidence/checked-manifest.json');
await writeFile(output,JSON.stringify(manifest,null,2)+'\n');
const checked=await fileInfo(output);
const seal={manifest:checked.path,sha256:checked.sha256,candidateFiles:files.length,checked:true};
await writeFile(path.join(run,'evidence/manifest-check.json'),JSON.stringify(seal,null,2)+'\n');
console.log(JSON.stringify(seal));
