import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,firefox,webkit} from 'playwright';
import {createIntegrityHost} from './integrity-host.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),run=process.env.PROJECT_REVIEW_RUN;
if(!run||!process.env.ARCH_KERNEL_MODULE)throw Error('Own PROJECT_REVIEW_RUN and explicit ARCH_KERNEL_MODULE required');
const tag=process.env.ARCH_RUNTIME_TEST_TAG??'current';assert.match(tag,/^[a-zA-Z0-9_-]{1,24}$/);
const host=await createIntegrityHost({root,run,modulePath:process.env.ARCH_KERNEL_MODULE,moduleHash:process.env.ARCH_KERNEL_MODULE_SHA256,wasmHash:process.env.ARCH_KERNEL_WASM_SHA256,tag});
const output=path.join(run,'evidence/integrity-workers',tag);await mkdir(output,{recursive:true});
test.after(()=>host.close());
const engines={chromium,firefox,webkit};
for(const[engine,browser]of Object.entries(engines))test('actual pinned production EngineClient/Worker integrity '+engine,{timeout:120000},async()=>{
 const started=performance.now();
 const ctx=await browser.launchPersistentContext(path.join(run,'p',tag,({chromium:'c',firefox:'f',webkit:'w'}[engine])),{headless:true,downloadsPath:path.join(run,'work/downloads',tag,engine),...(engine==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
 const errors=[],record={engine,browserVersion:ctx.browser()?.version()??null,nodeVersion:process.version,tag,module:host.module,wasm:host.wasm,startup:{launchMs:performance.now()-started},cases:[]};
 try{
  // Use a fresh page: Firefox's persistent startup tab can accept HTTP while its
  // content process has not become ready. Keep the same case deadline and record startup.
  const pageStarted=performance.now(),page=await ctx.newPage();record.startup.newPageMs=performance.now()-pageStarted;
  page.on('pageerror',e=>errors.push(e.message));
  const call=(name,arg)=>page.evaluate(async({name,arg})=>(await import('/tests/runtime-bootstrap/browser-scenarios.mjs'))[name](arg),{name,arg});
  await ctx.route('**/*',r=>r.request().url().startsWith(host.origin+'/')?r.continue():r.abort());
  await page.goto(host.origin);assert.equal(await page.evaluate(()=>crossOriginIsolated),true);
  const good=host.scenario(engine+'-verified',{hold:true});
  await call('beginPositive',good);await host.waitFor(good.id,'module');await host.waitFor(good.id,'wasm');
  await host.poisonBackingFiles();host.release(good.id);
  const positive=await call('finishPositive',good.id),requests=host.requests(good.id);
  assert.ok(requests.every(r=>r.status===200),'no undeclared/fallback resource fetch');
  assert.equal(requests.filter(r=>r.kind==='wasm').length,1,'exactly one HTTP WASM fetch; factory uses wasmBinary');
  assert.ok(requests.filter(r=>r.kind==='module').length>=1&&requests.filter(r=>r.kind==='module').length<=2,'verification + native import request path');
  assert.ok(requests.filter(r=>r.kind==='module').every(r=>r.sha256===host.module.sha256));
  assert.ok(requests.filter(r=>r.kind==='wasm').every(r=>r.sha256===host.wasm.sha256));
  record.cases.push({name:'verified-original-bytes-and-one-module',status:'pass',result:positive,requests});
  const mixed=host.scenario(engine+'-mixed-request');const mixedResult=await call('rejectMixedRequest',{...mixed,otherModuleURL:mixed.integrity.module.url.replace('/assets/','/other-assets/')});
  assert.equal(host.requests(mixed.id).length,0);record.cases.push({name:'mixed-module-request-binding',status:'pass',result:mixedResult});
  for(const[name,options,expected]of [
   ['altered-wrapper',{fault:'module-bytes'},'RUNTIME_HASH'],
   ['altered-wasm',{fault:'wasm-bytes'},'RUNTIME_HASH'],
   ['missing-proof',{mode:'missing-proof'},'RUNTIME_INTEGRITY_SCHEMA'],
   ['forged-wasm-proof',{mode:'forged-wasm-hash'},'RUNTIME_INTEGRITY_MISMATCH'],
   ['mixed-ready-pair',{mode:'mixed-proof'},'RUNTIME_INTEGRITY_MISMATCH'],
   ['invalid-root-abi',{mode:'invalid-abi'},'CORE_ABI_MISMATCH'],
   ['invalid-ready-heap',{mode:'invalid-heap'},'CORE_ABI_MISMATCH'],
   ['invalid-control-offset',{mode:'invalid-control'},'CORE_ABI_MISMATCH']
  ]){
   const cfg=host.scenario(engine+'-'+name,options),result=await call('runRefusal',{...cfg,expected});
   if(options.fault)assert.equal(result.events.filter(e=>e.event==='instantiate').length,0,'byte mismatch refuses before factory instantiation');
   else assert.equal(result.events.filter(e=>e.event==='instantiate').length,1,'malformed proof came from actual Module ready before test mutation');
   assert.equal(result.requestSequence,0);record.cases.push({name,status:'pass',result,requests:host.requests(cfg.id)});
  }
  const dup=host.scenario(engine+'-duplicate',{mode:'duplicate-ready'}),dupResult=await call('runDuplicate',dup);
  assert.equal(dupResult.requestSequence,0);record.cases.push({name:'duplicate-actual-ready-retires-proof',status:'pass',result:dupResult,requests:host.requests(dup.id)});
  const replacement=host.scenario(engine+'-replacement'),replacementResult=await call('runReplacement',replacement);
  assert.equal(host.requests(replacement.id).filter(r=>r.kind==='wasm').length,2,'one WASM request per each of two distinct epochs');
  record.cases.push({name:'actual-replacement-aba-and-delayed-old-ready',status:'pass',result:replacementResult,requests:host.requests(replacement.id)});
  const disposal=host.scenario(engine+'-dispose-during-fetch',{hold:true});
  await call('beginDispose',disposal);await host.waitFor(disposal.id,'wasm');
  const disposed=await call('finishDispose',disposal.id);host.release(disposal.id);
  assert.equal(disposed.requestSequence,0);assert.equal(disposed.events.filter(e=>e.event==='instantiate').length,0);
  record.cases.push({name:'dispose-held-initialization',status:'pass',result:disposed,requests:host.requests(disposal.id)});
  host.assertRetained();assert.deepEqual(errors,[]);record.status='pass';record.errors=errors;
  await writeFile(path.join(output,engine+'.json'),JSON.stringify(record,null,2)+'\n');
 }catch(e){record.status='fail';record.error=e.stack;record.errors=errors;record.requests=host.requests().filter(r=>r.scenario?.startsWith(engine+'-'));await writeFile(path.join(output,engine+'-failure.json'),JSON.stringify(record,null,2)+'\n');throw e;}
 finally{await ctx.close();}
});
