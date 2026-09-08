import {createTextOperations,bindPreparedTextGroup} from '../../src/core/text-operations.mjs';
import {createAssetReader} from '../../src/integration/source-catalog.mjs';
import {assert,equal,rejects} from './suite.mjs';
export async function coreChecks({options,fixture,readFixture}){
 const results=[],test=async(name,fn)=>{try{await fn();results.push({name,ok:true});}catch(e){results.push({name,ok:false,error:e.stack??String(e)});}};
 const ticket={id:'core-check',userId:'fixture-user',projectId:'fixture-project',revision:0,generation:500};
 const state=structuredClone(fixture.initialState);state.content.app.text={...state.content.app.text,text:'OO',fontId:'inter',asSource:true};
 const request={version:'arch-app-adapters/1',ticket,op:'prepare.text',state,assetsMap:new Map()};
 const control={isCurrent:()=>true,signal:new AbortController().signal};
 const use=async(changes,fn)=>{const s=createTextOperations({...options,...changes});try{return await fn(s);}finally{s.dispose();}};
 await test('core refuses missing/different ABI without constructing a module',()=>rejects(async()=>createTextOperations({...options,Module:{_arch_abi_version:()=>1}}),'CORE_ABI_MISMATCH'));
 await test('core requires exact current-ticket predicate',()=>use({},s=>rejects(()=>s.run(request,{}),'CURRENT_TICKET_REQUIRED')));
 await test('core rejects stale ticket before shaping',()=>use({},s=>rejects(()=>s.run(request,{isCurrent:()=>false}),'STALE_JOB')));
 await test('core rejects pre-aborted source job atomically',()=>use({},async s=>{const a=new AbortController();a.abort();await rejects(()=>s.run(request,{...control,signal:a.signal}),'CANCELLED');assert(!s.stats().active&&!s.stats().pending);}));
 await test('core rejects shared/excessive asset maps and unknown operation',()=>use({},async s=>{
   await rejects(()=>s.run({...request,assetsMap:new Map([['0'.repeat(64),new Uint8ClampedArray(4)]])},control),'TEXT_ASSET_BYTES');
   await rejects(()=>s.run({...request,op:'build-fake-product'},control),'TEXT_OPERATION_UNKNOWN');assert(!s.stats().active);
 }));
 await test('core font re-import verifies actual declared SHA',()=>use({},async s=>{
   await rejects(async()=>s.run({...request,op:'font.import',file:{name:'Inter.ttf',mediaType:'font/ttf',bytes:await readFixture(fixture.entries.inter.sha256)},record:{...fixture.entries.inter,sha256:'0'.repeat(64)}},control),'HASH_MISMATCH');
 }));
 await test('core source reader rehashes retained bytes and owns returned copy',async()=>{
   const entry=fixture.entries.inter,original=await readFixture(entry.sha256),reader=createAssetReader({assetURLs:options.assetURLs,origin:options.origin,fetchImpl:()=>{throw Error('Unexpected fetch');}});
   const map=new Map([[entry.sha256,original]]),owned=await reader(entry,{assetsMap:map});owned[0]^=1;assert(original[0]!==owned[0]);
   await rejects(()=>reader(entry,{assetsMap:new Map([[entry.sha256,owned]])}),'HASH_MISMATCH');
 });
 await test('core asset read refuses omitted deployment mapping',async()=>{
   const reader=createAssetReader({assetURLs:[],origin:options.origin});await rejects(()=>reader(fixture.entries.inter),'ASSET_MAPPING_REQUIRED');
 });
 await test('core no-queue busy guard and reset cancel only the active text job',()=>use({},async s=>{
   let resolveEntered;const entered=new Promise(r=>resolveEntered=r);
   const one=s.run(request,{...control,onProgress:p=>{if(p.stage==='shape-run')resolveEntered();}});one.catch(()=>{});
   await entered;await rejects(()=>s.run({...request,ticket:{...ticket,id:'another'}},control),'TEXT_OPERATIONS_BUSY');
   s.reset();await rejects(()=>one,'CANCELLED');assert(!s.stats().active&&!s.stats().pending);
 }));
 await test('core preview parser gap preserves all source paths and explicit diagnostic',()=>use({
   previewPaths:async()=>{throw Object.assign(Error('tiny canonical region'),{code:'REGION_BELOW_BOOLEAN_RESOLUTION'});}},async s=>{
   const r=await s.run(request,control);equal(r.preview,null);equal(r.previewDiagnostic.code,'REGION_BELOW_BOOLEAN_RESOLUTION');assert(r.prepared.geometry.paths.length&&r.prepared.svg);
 }));
 await test('core preview callback preserves native profile metadata verbatim',()=>use({
   previewPaths:async()=>({width:5,height:5,data:new Uint8ClampedArray(100).fill(255),pixelToSourceMm:[1,0,0,-1,0,5],nativeProfileMetadata:{upstreamBound:null,contacts:[17],fitQualification:'unqualified'}})},async s=>{
   const r=await s.run(request,control);equal(r.preview.nativeProfileMetadata,{upstreamBound:null,contacts:[17],fitQualification:'unqualified'});
 }));
 await test('core soft deadline rejects late injected reads without published output',()=>use({
   deadlineMs:20,fetchImpl:async()=>{await new Promise(r=>setTimeout(r,35));return new Response(await readFixture(fixture.entries.inter.sha256));}},async s=>{
   await rejects(()=>s.run(request,control),'TEXT_OPERATION_DEADLINE');assert(!s.stats().active&&!s.stats().pending);
 }));
 await test('core finite width/layer limits reject fractional layers',()=>use({},async s=>{
   const invalid=structuredClone(state);invalid.content.app.text.heightLayers='1.5';
   await rejects(()=>s.run({...request,state:invalid},control),'INVALID_INPUT');
 }));
 await test('core canonical bindings reject absent curves and oversized u64 IDs',async()=>{
   await rejects(async()=>bindPreparedTextGroup({kind:'color-source'},{textId:'1',sourceId:'2',provenanceId:'3'}),'TEXT_PATH_GROUP_REQUIRED');
   await rejects(async()=>bindPreparedTextGroup({kind:'paths',geometry:{}},{textId:'18446744073709551616',sourceId:'2',provenanceId:'3'}),'PRODUCT_PERSISTENT_ID');
 });
 return results;
}
