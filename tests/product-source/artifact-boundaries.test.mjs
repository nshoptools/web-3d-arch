import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createServer} from 'node:http';
import {M,client,operation,raster,setLive,controlFor,noOwned} from '../product-app/harness.mjs';
import {createProductSourceContexts} from '../../src/integration/product-source-contexts.mjs';
import {createTextAdapters} from '../../src/integration/text-adapters.mjs';
import {createSourceCatalog} from '../../src/integration/source-catalog.mjs';
import {createEngineTextService} from '../../src/core/engine-text-service.mjs';
import {sha256,canonicalJSON} from '../../src/storage/common.mjs';
import {appContent} from '../../src/app/documents.mjs';
import * as domain from '../../src/domain/index.mjs';
const run=process.env.PROJECT_REVIEW_RUN,fixture=JSON.parse(fs.readFileSync(path.join(run,'inputs/source-fixture.json')));
const server=createServer((req,res)=>{const h=req.url.slice(1);if(!fixture.actualAssets.some(r=>r.sha256===h)){res.writeHead(404);res.end();return;}res.end(fs.readFileSync(path.join(run,'inputs/library',h)));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const assetURLs=fixture.assetRecords.map(r=>({...r,url:origin+'/'+r.sha256})),catalog=createSourceCatalog({catalog:fixture.catalog,assetURLs,origin});
const service=createEngineTextService(M,{catalog:fixture.catalog,assetURLs,origin,runtime:{engine:'node',version:process.versions.node}},{origin});
client.serviceCapabilities={geometryVersions:{mechanicsAbi:M._arch_mech_abi_version(),mechanicsSemantics:M._arch_mech_semantics_version(),sourceAbi:M._arch_source_abi_version(),sourceSemantics:M._arch_source_semantics_version(),datumExtension:M._arch_mech_source_datum_extension_version()}};
let live;function set(v){live={sessionKey:'test-session-1',...v};setLive(v);}
const text=createTextAdapters({catalog,context:()=>live,invoke:(request,c)=>operation(c,(_,generation)=>{assert.equal(M._arch_control_reset(generation),1);return service.run(request,{generation,signal:c.signal,onProgress:()=>{},isCurrent:t=>t.revision===live.state.revision});})});
const bridge=createProductSourceContexts({frameTransport:'product-context-bundle/2',kernel:{operation,ensureRuntime:async()=>client},sources:{source:text,text,raster:raster.source},context:()=>live});
test.after(async()=>{bridge.reset();text.reset();service.dispose();await new Promise(r=>{server.closeAllConnections();server.close(r);});noOwned();});
test('real HarfBuzz negative absolute overlay uses an explicit bounded canonical translation; no placement repair',async()=>{
 const state=structuredClone(domain.createProject({product:'keychain',content:{app:appContent('Negative actual text frame')}}));
 Object.assign(state.content.app.text,{text:'O',placement:'beside',xMm:'-60',yMm:'2',baseEnabled:true,baseThicknessLayers:'2',heightLayers:'3'});
 set({state,userId:'user-a',projectId:'project-persistent',assetsMap:new Map()});const before=canonicalJSON(state);
 const negative=await bridge.captureArtifacts(controlFor(state));assert.equal(negative.overlay.frame.version,'arch-text-manufacturing-frame/2');assert.ok(BigInt(negative.overlay.frame.translationNm[0])<0n);
 assert.equal(canonicalJSON(state),before);
 state.content.app.text.xMm='60';const plan=await bridge.captureArtifacts(controlFor(state));
 assert.equal(plan.overlay.frame.mode,'absolute-overlay');assert.ok(plan.overlay.frame.transform[4]>59);
 assert.ok(plan.assets.length>=3);noOwned();
});
test('replay of captured real source rejects rehashed forged frame and stale text before any product consumer',async()=>{
 const capture=JSON.parse(fs.readFileSync(path.join(run,'evidence/source-node-final/svg-actual-overlay.json'))),state=capture.state;
 assert.ok(state?.content?.app?.source);const assets=new Map(capture.assetHashes.map(h=>[h,new Uint8Array(fs.readFileSync(path.join(run,'evidence/source-node-final/assets',h)))]));
 const base={state,userId:'source-bridge-user',projectId:'source-bridge-project',assetsMap:assets};set(base);
 const request=()=>({control:controlFor(live.state),state:live.state,source:live.state.content.app.source,assets,
  bindings:live.state.content.app.source.metadata.productBindings,domainRecord:{records:[]}});
 let calls=0;await bridge.withPreparedSource(request(),async p=>{calls++;p.assertOwned();return true;});assert.equal(calls,1);noOwned();
 const forged=structuredClone(base);set(forged);const overlay=forged.state.content.app.source.metadata.productArtifacts.overlay;
 overlay.frame.transform[4]+=1;
 const {sha256:_sha,derivationHash:_frame,...framePayload}=overlay.frame;overlay.frame.derivationHash=await sha256(canonicalJSON(framePayload));
 const {derivationHash:_outer,...outerPayload}=overlay;overlay.derivationHash=await sha256(canonicalJSON(outerPayload));
 forged.state.content.app.source.metadata.productBindings.contexts[1].derivationHash=overlay.derivationHash;
 await assert.rejects(bridge.withPreparedSource(request(),async()=>{calls++;}),{code:'PRODUCT_TEXT_FRAME_PROVENANCE'});assert.equal(calls,1);noOwned();
 const stale=structuredClone(base);set(stale);stale.state.content.app.text.text='X';
 await assert.rejects(bridge.withPreparedSource(request(),async()=>{calls++;}),{code:'PRODUCT_TEXT_ARTIFACT_STALE'});assert.equal(calls,1);noOwned();
});
