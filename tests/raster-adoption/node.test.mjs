import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {kernel,fixture,assetURLs,origin,runControllerCases,updateContext,versions} from '../mesh-generated-base/runtime.mjs';
import {noOwned} from '../mesh-generated-base/native.mjs';
import {inspectCapturedProduct} from '../product-source/capture-oracle.mjs';
const out=path.join(process.env.PROJECT_REVIEW_RUN,'evidence');
test('fresh raster controller import has two explicit consents, one atomic commit and an actual root product',{timeout:60000},async()=>{
 const captures=[];
 const result=await runControllerCases({
  kernel,catalog:fixture.catalog,assetURLs,origin,onContext:updateContext,
  group:'matrix',families:['raster'],products:['keychain'],styles:['noi'],
  async capture(id,{bytes,semantics,row,state,bindings,assets}){
   const dir=path.join(out,'fresh-raster');fs.mkdirSync(dir,{recursive:true});
   fs.writeFileSync(path.join(dir,'model.arch'),bytes);
   fs.writeFileSync(path.join(dir,'model.json'),JSON.stringify(semantics,null,2));
   const oracle=inspectCapturedProduct(bytes,semantics,id);
   captures.push({id,row,oracle,source:state.content.app.source,bindings,assetHashes:[...assets.keys()]});
  }
 });
 assert.equal(result.rows.length,1);assert.equal(result.trace.length,2);
 fs.writeFileSync(path.join(out,'fresh-raster-controller.json'),JSON.stringify({versions,result,captures},null,2));
 noOwned();
});
import {runRasterController} from './controller.mjs';
import {createEditingClient} from '../mesh-generated-base/runtime.mjs';
import {client,dispatcher,M,transportLog} from '../mesh-generated-base/native.mjs';
import {canonicalJSON,sha256,uuid} from '../../src/app/common.mjs';
import {validatePacket,bufferMap} from '../../src/core/raster-schema.mjs';
import {encodeRasterPNG} from '../../src/core/png-encode.mjs';
// Observe the real RPC results; do not substitute any native operation.
const activeRasterTokens=new Set(),registryEvents=[];
const nativeMutation=client.rasterOperation.bind(client),nativeRegistry=client.rasterRegistry.bind(client);
client.rasterOperation=async(...args)=>{
 const result=await nativeMutation(...args);
 if(result?.token){activeRasterTokens.add(result.token);registryEvents.push({event:'publish',method:args[0],token:result.token});}
 return result;
};
client.rasterRegistry=async(...args)=>{
 const result=await nativeRegistry(...args);
 if(args[0]==='release'){activeRasterTokens.delete(args[1].token);registryEvents.push({event:'release',token:args[1].token});}
 if(args[0]==='reset'){activeRasterTokens.clear();registryEvents.push({event:'reset'});}
 if(args[0]==='acquire'&&result?.token)activeRasterTokens.add(result.token);
 return result;
};
test.afterEach(()=>{noOwned();assert.equal(activeRasterTokens.size,0,'no raster or planar source tokens survive the controller');});
test.after(()=>{
 fs.writeFileSync(path.join(out,'registry-lifetime.json'),JSON.stringify({events:registryEvents,remaining:[...activeRasterTokens],rasterOwnedBytes:M._arch_raster_owned_bytes()},null,2));
});
const base={kernel,catalog:fixture.catalog,assetURLs,origin,onContext:updateContext,createEditingClient,
 async capture(id,{bytes,semantics}){
  const oracle=inspectCapturedProduct(bytes,semantics,id);
  fs.writeFileSync(path.join(out,id+'.arch'),bytes);
  fs.writeFileSync(path.join(out,id+'-oracle.json'),JSON.stringify(oracle,null,2));
 }};
const ok=r=>assert.equal(r.ok,true,JSON.stringify(r));
const consent=c=>c.dispatch({type:'proposal.accept',id:c.pendingOperation.id,confirmed:true});
const retired=token=>assert.throws(()=>dispatcher.withSourceReference(token,()=>null),e=>e.code==='RASTER_LEASE_RETIRED');
const immediate=()=>new Promise(r=>setImmediate(r));
function observeBorrow(sources,observe){
 const accept=sources.raster.acceptProposal;
 sources.raster.acceptProposal=(input,consume)=>accept(input,async ready=>{
  assert.equal(typeof consume,'function');
  assert.equal(ready.version,'arch-app-adapters/1');
  assert.deepEqual(ready.ticket,input.ticket);assert.deepEqual(ready.confirmation,input.confirmation);
  assert.equal(ready.nativeSource.kind,'raster-token');assert.equal(ready.nativeSource.epoch,client.epoch);
  assert.equal(typeof ready.nativeSource.token,'string');assert.ok(!('acceptedHandle' in ready.nativeSource));
  const packet=validatePacket(ready.packet);assert.equal(ready.packet.buffers.length,31);
  assert.equal(packet.summary.accepted,true);
  assert.equal(packet.summary.proposalHash,input.confirmation.proposalHash);
  assert.equal(ready.receipt.sourceHash,input.source.raw.hash);
  assert.deepEqual(ready.preparation,input.source.metadata.rasterPreparation);
  const before=new Uint8Array(bufferMap(ready.packet).get(28));
  await immediate(); // The consumer really suspends with both readers still owned.
  dispatcher.withSourceReference(ready.nativeSource.token,ref=>assert.equal(ref.kind,'raster'));
  assert.deepEqual(bufferMap(await client.rasterRegistry('copy',{token:ready.nativeSource.token})).get(28),before);
  return observe(input,ready,consume);
 });
}
test('fresh import then real erase/reconversion retains original bytes, full RGBA, current IDs and atomic native adoption',{timeout:60000},async()=>{
 const tokens=[],records=[];
 const result=await runRasterController({...base,async scenario({c,sources,prepare,newProject,confirmChain,snapshot}){
  observeBorrow(sources,async(input,ready,consume)=>{tokens.push(ready.nativeSource.token);return consume(ready);});
  await newProject('keychain','noi');
  let count=c.store.commits.length,revision=c.doc.state.revision;
  const first=await prepare('raster');assert.equal(first.diagnostic.code,'PROPOSAL_REQUIRED');
  assert.equal(c.doc.state.content.app.source,null);
  const ids=await confirmChain(first,{baseCommits:count,baseRevision:revision});
  assert.equal(ids.length,2);assert.equal(c.store.commits.length,count+1);assert.equal(c.doc.state.revision,revision+1);
  for(const t of tokens)retired(t);
  const original=structuredClone(c.doc.state.content.app.source),assetDigests=new Map([...c.assets].map(([h,a])=>[h,new Uint8Array(a.bytes)]));
  const data=new Uint8ClampedArray(16*12*4);
  for(let y=0;y<12;y++)for(let x=0;x<16;x++){if(x>=2&&x<=3&&y>=3&&y<=4)continue;data.set(x<8?[224,68,68,255]:[51,136,238,255],(y*16+x)*4);}
  const png=await encodeRasterPNG({width:16,height:12,data});
  assert.deepEqual(c.assets.get(original.raw.hash).bytes,png);
  assert.deepEqual(c.assets.get(original.raster.rgba).bytes,new Uint8Array(data));
  assert.equal(original.metadata.confirmationReceipt.sourceHash,await sha256(png));
  await snapshot('fresh-raster-native');
  ok(await c.dispatch({type:'editor.settings',values:{cutMode:'hole',strokeWidthPx:'3'}}));
  ok(await c.editSource({id:uuid(),tool:'erase',projectRevision:c.doc.state.revision,sourceRevision:original.revision,points:[{x:10,y:8},{x:13,y:8}],snap:'none'}));
  const edited=structuredClone(c.doc.state.content.app.source),editedRGBA=c.assets.get(edited.raster.rgba).bytes.slice();
  assert.notEqual(edited.raster.rgba,original.raster.rgba);assert.equal(edited.raw.hash,original.raw.hash);
  const before=canonicalJSON(c.doc.state);count=c.store.commits.length;revision=c.doc.state.revision;
  const conversion=await c.dispatch({type:'source.convert',target:'raster'});
  assert.equal(conversion.diagnostic.code,'PROPOSAL_REQUIRED');assert.equal(canonicalJSON(c.doc.state),before);
  assert.equal(c.store.commits.length,count);
  const conversionIds=await confirmChain(conversion,{baseCommits:count,baseRevision:revision});
  assert.equal(conversionIds.length,2);assert.equal(c.store.commits.length,count+1);assert.equal(c.doc.state.revision,revision+1);
  const current=c.doc.state.content.app.source;assert.equal(current.id,original.id);assert.ok(current.revision>original.revision);
  assert.equal(current.raw.hash,original.raw.hash);assert.equal(current.raster.rgba,edited.raster.rgba);
  assert.deepEqual(c.assets.get(current.raster.rgba).bytes,editedRGBA);
  assert.deepEqual(c.assets.get(original.raw.hash).bytes,png);
  assert.deepEqual(c.assets.get(original.raster.rgba).bytes,assetDigests.get(original.raster.rgba));
  assert.equal(current.metadata.confirmationReceipt.rgbaHash,current.raster.rgba);
  assert.equal(current.metadata.confirmationReceipt.sourceRevision,current.revision);
  for(const row of current.metadata.rasterPreparation.buffers)assert.equal(await sha256(c.assets.get(row.hash).bytes),row.hash);
  const oldBindings=original.metadata.productBindings,newBindings=current.metadata.productBindings;
  const unchanged=newBindings.regions.filter(r=>oldBindings.regions.some(o=>o.geometryHash===r.geometryHash));
  const changed=newBindings.regions.filter(r=>!oldBindings.regions.some(o=>o.geometryHash===r.geometryHash));
  assert.equal(unchanged.length,1);assert.equal(changed.length,1);
  const previous=oldBindings.regions.find(o=>o.geometryHash===unchanged[0].geometryHash);
  assert.equal(unchanged[0].sourceKey,previous.sourceKey);
  assert.equal(unchanged[0].materialId,previous.materialId);
  assert.ok(!oldBindings.regions.some(o=>o.sourceKey===changed[0].sourceKey),'changed unproven geometry receives a fresh durable source identity');
  for(const kind of ['source','provenance','region','region-provenance']){
   const key=kind.startsWith('region')?previous.sourceKey:'root';
   const oldRecord=oldBindings.identityLedger.records.find(r=>r.kind===kind&&r.key===key);
   const newRecord=newBindings.identityLedger.records.find(r=>r.kind===kind&&r.key===key);
   assert.ok(oldRecord&&newRecord);assert.deepEqual(newRecord,oldRecord);
  }
  await snapshot('raster-erase-reconvert-native');
  records.push({original,current,commits:c.store.commits,acceptedCallbacks:tokens.length,originalByteLength:png.length,editedRGBAHash:await sha256(editedRGBA)});
 }});
 assert.equal(tokens.length,2);for(const t of tokens)retired(t);noOwned();
 fs.writeFileSync(path.join(out,'conversion-controller.json'),JSON.stringify({result,records},null,2));
});
test('discarding either displayed raster/product consent leaves fresh document, assets and native ownership unchanged',{timeout:30000},async()=>{
 const records=[];
 for(const stage of [1,2]){
  await runRasterController({...base,async scenario({c,prepare,newProject,contexts}){
   await newProject('keychain','noi');const before=canonicalJSON(c.doc),assets=[...c.assets.keys()],count=c.store.commits.length;
   let r=await prepare('raster');assert.equal(r.diagnostic.code,'PROPOSAL_REQUIRED');
   if(stage===2){r=await consent(c);assert.equal(r.diagnostic.code,'PROPOSAL_REQUIRED');assert.equal(c.pendingOperation.kind,'product source update');}
   const id=c.pendingOperation.id;
   ok(await c.dispatch({type:'proposal.discard',id}));
   assert.equal(canonicalJSON(c.doc),before);assert.deepEqual([...c.assets.keys()],assets);
   assert.equal(c.store.commits.length,count);assert.equal(c.visible,null);
   const stale=await c.dispatch({type:'proposal.accept',id,confirmed:true});
   assert.equal(stale.diagnostic.code,'STALE_CONFIRMATION');
   await contexts.reset();noOwned();records.push({stage,stale:stale.diagnostic.code,commits:0,ownedBytes:M._arch_raster_owned_bytes()});
  }});noOwned();
 }
 fs.writeFileSync(path.join(out,'discard-controller.json'),JSON.stringify(records,null,2));
});
test('consumer failure and in-flight cancellation retire exact accepted raster without partial publication',{timeout:30000},async()=>{
 const records=[];
 for(const mode of ['throw','cancel','reset']){
  let token;
  await runRasterController({...base,async scenario({c,sources,prepare,newProject}){
   observeBorrow(sources,async(input,ready,consume)=>{
    token=ready.nativeSource.token;
    if(mode==='throw')throw Object.assign(Error('synthetic consumer failure'),{code:'TEST_CONSUMER_FAILED'});
    if(mode==='cancel'){c.job.abort.abort();return consume(ready);}
    await sources.raster.reset();
    return {release(){records.push({mode,event:'returned-owner-released'});}};
   });
   await newProject('keychain','noi');const before=canonicalJSON(c.doc),assets=[...c.assets.keys()],count=c.store.commits.length;
   const r=await prepare('raster');assert.equal(r.diagnostic.code,'PROPOSAL_REQUIRED');
   const accepted=await consent(c);assert.equal(accepted.ok,false);assert.ok(token);
   if(mode==='throw')assert.equal(accepted.diagnostic.code,'TEST_CONSUMER_FAILED');
   if(mode==='cancel')assert.match(accepted.diagnostic.code,/CANCEL/);
   if(mode==='reset')assert.equal(accepted.diagnostic.code,'RASTER_PRIVATE_RESET');
   assert.equal(canonicalJSON(c.doc),before);assert.deepEqual([...c.assets.keys()],assets);
   assert.equal(c.store.commits.length,count);assert.equal(c.visible,null);assert.equal(c.pendingOperation,null);
   retired(token);noOwned();records.push({mode,code:accepted.diagnostic.code,commits:0});
  }});noOwned();
 }
 assert.ok(records.some(r=>r.mode==='reset'&&r.event==='returned-owner-released'));
 fs.writeFileSync(path.join(out,'failure-controller.json'),JSON.stringify(records,null,2));
});
test('legacy acceptance envelope is unchanged and tampered confirmation/assets cannot enter consumer',{timeout:30000},async()=>{
 const records=[];
 for(const mode of ['legacy','confirmation','asset']){
  let called=0;
  await runRasterController({...base,async scenario({c,sources,prepare,newProject}){
   const accept=sources.raster.acceptProposal;
   sources.raster.acceptProposal=async(input,consume)=>{
    if(mode==='legacy'){
     // Explicitly test the old single-argument API on this displayed consent.
     const answer=await accept(input);
     assert.deepEqual(Object.keys(answer).sort(),['confirmation','receipt','ticket','version']);
     assert.deepEqual(answer.confirmation,input.confirmation);
     assert.deepEqual(answer.ticket,input.ticket);
     assert.equal(answer.receipt.acceptedAtRevision,input.acceptedAtRevision);
     noOwned();
     // Separately exercise the new callback path; no product state was published above.
     return accept(input,ready=>{called++;return consume(ready);});
    }
    if(mode==='confirmation')input={...input,confirmation:{...input.confirmation,proposalHash:'0'.repeat(64)}};
    else{
     const assets=new Map(input.assets),hash=input.source.metadata.rasterPreparation.buffers.find(b=>b.byteLength>0).hash;
     const bytes=assets.get(hash).slice();bytes[0]^=1;assets.set(hash,bytes);
     input={...input,assets};
    }
    return accept(input,ready=>{called++;return consume(ready);});
   };
   await newProject('keychain','noi');const before=canonicalJSON(c.doc),assets=[...c.assets.keys()],count=c.store.commits.length;
   const r=await prepare('raster');assert.equal(r.diagnostic.code,'PROPOSAL_REQUIRED');
   const result=await consent(c);
   assert.equal(result.ok,false);
   if(mode==='legacy'){
    assert.equal(called,1);assert.equal(result.diagnostic.code,'PROPOSAL_REQUIRED');
    ok(await c.dispatch({type:'proposal.discard',id:c.pendingOperation.id}));
   }else{
    assert.equal(called,0);
    assert.equal(result.diagnostic.code,mode==='confirmation'?'RASTER_CONFIRMATION_MISMATCH':'RASTER_ASSET_HASH');
   }
   assert.equal(canonicalJSON(c.doc),before);assert.deepEqual([...c.assets.keys()],assets);assert.equal(c.store.commits.length,count);
   records.push({mode,code:result.diagnostic.code,consumerCalls:called});
  }});noOwned();
 }
 fs.writeFileSync(path.join(out,'acceptance-contract.json'),JSON.stringify(records,null,2));
});
