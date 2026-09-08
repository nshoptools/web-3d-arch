import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createServer} from 'node:http';import {pathToFileURL} from 'node:url';
import {readSnapshot,inspectMesh} from '../oracles/mesh-oracle.mjs';
import {readProductSemantics} from '../../src/core/product-operations.mjs';
import {run,repo,base,modulePath} from './environment.mjs';
const playwright=await import(pathToFileURL(path.join(repo,'.toolchain/app-runtime/node_modules/playwright/index.mjs')));
const output=path.join(run,'evidence/browser-product');fs.mkdirSync(output,{recursive:true});
const routes=new Map();
function add(dir,prefix){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())add(p,prefix+'/'+e.name);else if(e.name.endsWith('.mjs'))routes.set(prefix+'/'+e.name,p);}}
for(const name of ['src/core','src/domain','src/viewport','src/kernel/mechanics/src','tests/product-runtime'])add(path.join(base,name),'/'+name);
routes.set('/engine/arch-kernel.mjs',modulePath);
routes.set('/engine/arch-kernel.wasm',modulePath.replace(/\.mjs$/,'.wasm'));
routes.set('/fixtures/product-text-request',path.join(run,'evidence/native-product-special/prepared-text.request'));
routes.set('/fixtures/product-text-svg',path.join(run,'evidence/native-product-special/prepared-text.svg'));
const names=new Set(['keychain','clicky','strap','lego','charm'].flatMap(p=>['default','noi','chim','phang','phang2'].flatMap(a=>[p+'-'+a,...(a==='default'?[]:['raster-'+p+'-'+a])])));
names.add('prepared-text');
const server=createServer(async(req,res)=>{
 res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('Cache-Control','no-store');
 const url=new URL(req.url,'http://localhost');
 if(req.method==='POST'){
  const m=/^\/capture\/(chromium|firefox|webkit)\/([a-z0-9-]+)\.(arch|buf1|json)$/.exec(url.pathname);
  if(!m||!names.has(m[2])){res.writeHead(404);res.end();return;}
  const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>16*1024*1024){res.writeHead(413);res.end();return;}chunks.push(chunk);}
  const dir=path.join(output,m[1]);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,m[2]+'.'+m[3]),Buffer.concat(chunks));res.end('saved');return;
 }
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><title>Isolated product runtime proof</title>');return;}
 if(!routes.has(url.pathname)){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',url.pathname.endsWith('.wasm')?'application/wasm':'text/javascript');res.end(fs.readFileSync(routes.get(url.pathname)));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
test.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r)}));
for(const name of ['chromium','firefox','webkit'])test(name+' root EngineClient: 5 defaults + SVG/raster 40 art modes, leases, proposal, cancellation',{timeout:240000},async()=>{
 const profile=path.join(run,'work/browser-profiles',name);fs.mkdirSync(profile,{recursive:true});
 const context=await playwright[name].launchPersistentContext(profile,{headless:true,acceptDownloads:false});
 const page=await context.newPage();
 try{
  await page.goto(origin);
  const result=await page.evaluate(async name=>{
   const {EngineClient}=await import('/src/core/engine-client.mjs');
   const {readProductSemantics,readProductHead}=await import('/src/core/product-operations.mjs');
   const {source,products,artModes,makeRequest,rasterFixture,makeRasterRequest}=await import('/tests/product-runtime/fixtures.mjs');
   const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
   const hash=async s=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
   const sourceHash=await hash(source),client=new EngineClient({moduleURL:'/engine/arch-kernel.mjs',cancelGraceMs:2000,watchdogMs:60000});
   let generation=0;const records=[];
   const make=async(p,a)=>({kind:'product',source:{kind:'svg',source},packed:makeRequest(p,a,{sourceHash,headHash:await hash(p+'-'+(a??'default'))}).packed});
   const capture=async(id,ext,bytes)=>{const r=await fetch('/capture/'+name+'/'+id+'.'+ext,{method:'POST',body:bytes});if(!r.ok)throw Error('CAPTURE_FAILED');};
   await client.start();let retained=null,retainedHash;
   for(const p of products)for(const art of [null,...artModes]){
    const lease=await client.build(await make(p,art),{generation:++generation}),bytes=new Uint8Array(lease.bytes());
    if(!(lease.bytes().buffer instanceof SharedArrayBuffer))throw Error('MESH_NOT_SHARED');
    const m=readProductSemantics(lease.metadata.semanticBytes),head=readProductHead(lease.metadata.descriptor);
    if(m.sourceVerdict||m.mechanicsVerdict||head.sourceHash!==sourceHash)throw Error('SEMANTIC_CONTRACT');
    const id=p+'-'+(art??'default');await capture(id,'arch',bytes);await capture(id,'buf1',lease.metadata.semanticBytes);
    await capture(id,'json',new TextEncoder().encode(JSON.stringify({parts:m.parts.length,revision:m.revision,head,sourceHash:lease.metadata.sourceHash,fitQualification:m.fitQualification,totalErrorBoundMm:m.totalErrorBoundMm})));
    records.push({id,parts:m.parts.length,features:m.features.length,shared:true});
    if(!retained){retained=lease;retainedHash=hex(await crypto.subtle.digest('SHA-256',bytes));}else lease.release();
    if(hex(await crypto.subtle.digest('SHA-256',new Uint8Array(retained.bytes())))!==retainedHash)throw Error('RETAINED_CHANGED');
   }

   const fixture=rasterFixture(),rasterHash=hex(await crypto.subtle.digest('SHA-256',fixture.bytes));
   const candidate=await client.prepareRaster(fixture,{generation:++generation});
   const accepted=await client.confirmRaster(candidate,candidate.summary.slice(128,160),{generation:++generation});candidate.release();
   for(const p of products)for(const art of artModes){
    accepted.assertOwned();
    const packed=makeRasterRequest(p,art,{sourceHash:rasterHash,headHash:await hash('raster-'+p+'-'+art)}).packed;
    const recipe={kind:'product',source:{kind:'raster',acceptedHandle:accepted.id,epoch:accepted.epoch},packed};
    const lease=await client.build(recipe,{generation:++generation}),bytes=new Uint8Array(lease.bytes());
    const sem=readProductSemantics(lease.metadata.semanticBytes),head=readProductHead(lease.metadata.descriptor);
    if(sem.mechanicsSemantics!==3||sem.sourceSemantics!==2||head.sourceHash!==rasterHash||lease.metadata.sourceMetadata.confirmation!=='accepted-runtime-proposal')throw Error('RASTER_PRODUCT_SEMANTICS');
    const id='raster-'+p+'-'+art;await capture(id,'arch',bytes);await capture(id,'buf1',lease.metadata.semanticBytes);
    await capture(id,'json',new TextEncoder().encode(JSON.stringify({head,sourceMetadata:lease.metadata.sourceMetadata,parts:sem.parts.length})));
    records.push({id,parts:sem.parts.length,features:sem.features.length,shared:lease.bytes().buffer instanceof SharedArrayBuffer});
    const {productExportDescriptor}=await import('/src/core/product-export-descriptor.mjs');
    const descriptor=productExportDescriptor(lease,{headHash:head.headHash,revision:head.revision});
    if(descriptor.parts.length!==sem.parts.length||descriptor.groups.length<2)throw Error('PRODUCT_EXPORT_MAPPING');
    lease.release();
   }
   accepted.release();try{accepted.assertOwned();throw Error('RASTER_LEASE_NOT_RELEASED');}catch(e){if(e.code!=='SNAPSHOT_RELEASED')throw e;}


   const mainContext=await client.build({kind:'svg',source,thicknessMm:.2,toleranceMm:.001},{generation:++generation});
   const textSource=await(await fetch('/fixtures/product-text-svg')).text();
   const textContext=await client.build({kind:'svg',source:textSource,thicknessMm:.2,toleranceMm:.001},{generation:++generation});
   const contextRecipe={kind:'product',source:{kind:'contexts',contexts:[
     {id:mainContext.id,generation:mainContext.generation,epoch:mainContext.epoch,sourceHash},
     {id:textContext.id,generation:textContext.generation,epoch:textContext.epoch,sourceHash:await hash(textSource)}
    ]},packed:new Uint8Array(await(await fetch('/fixtures/product-text-request')).arrayBuffer())};
   const staleContext=structuredClone(contextRecipe);staleContext.source.contexts[1].epoch--;
   try{await client.build(staleContext,{generation:++generation});throw Error('FOREIGN_EPOCH_ACCEPTED');}catch(e){if(e.code!=='SNAPSHOT_RETIRED')throw e;}
   const textProduct=await client.build(contextRecipe,{generation:++generation});mainContext.release();textContext.release();
   const textSem=readProductSemantics(textProduct.metadata.semanticBytes);
   if(![132,133,134].every(tag=>textSem.sourceIntervals.some(i=>i.datum===tag)))throw Error('SOURCE_DATUM_EXTENSION_LOST');
   await capture('prepared-text','arch',new Uint8Array(textProduct.bytes()));await capture('prepared-text','buf1',textProduct.metadata.semanticBytes);
   records.push({id:'prepared-text',parts:textSem.parts.length,features:textSem.features.length,shared:true});
   textProduct.release();
   try{await client.build(contextRecipe,{generation:++generation});throw Error('RELEASED_CONTEXT_ACCEPTED');}catch(e){if(e.code!=='PRODUCT_SOURCE_LEASE_OWNERSHIP')throw e;}

   const bad=await make('keychain','noi');bad.packed[96]^=1;let invalid;
   try{await client.build(bad,{generation:++generation});throw Error('INVALID_PUBLISHED');}catch(e){invalid=e.code;if(invalid!=='PRODUCT_SOURCE_HASH_MISMATCH')throw e;}
   const nextRecipe=await make('keychain','noi');
   let wake;const running=new Promise(r=>wake=r);client.onStatus=s=>{if(s.phase==='running')wake();};
   const pending=client.build(nextRecipe,{generation:++generation}).then(l=>{l.release();return 'published';},e=>e.code);
   await running;await client.cancel();const cancelled=await pending;client.onStatus=()=>{};
   if(cancelled!=='CANCELLED')throw Error('CANCEL_PUBLISHED');
   if(hex(await crypto.subtle.digest('SHA-256',new Uint8Array(retained.bytes())))!==retainedHash)throw Error('CANCEL_RETAINED_CHANGED');
   const draft=await make('lego','noi'),dv=new DataView(draft.packed.buffer);
   for(let i=0;i<dv.getUint32(16,true);i++)if(dv.getUint32(256+i*40,true)===23)dv.setFloat64(256+i*40+24,1.2,true);
   let proposal;try{await client.build(draft,{generation:++generation});throw Error('PROPOSAL_PUBLISHED');}catch(e){if(e.code!=='PRODUCT_NEEDS_ACCEPTANCE')throw e;proposal=e.proposal;}
   const ph=readProductHead(proposal.descriptor);let stale;
   try{await client.confirmProduct(proposal,{headHash:ph.headHash,revision:BigInt(ph.revision)+1n},{generation:++generation});throw Error('STALE_CONFIRMED');}catch(e){stale=e.code;if(stale!=='PRODUCT_CONFIRMATION_HEAD_MISMATCH')throw e;}
   const receipt=await client.confirmProduct(proposal,{headHash:ph.headHash,revision:ph.revision},{generation:++generation});
   if(hex(receipt)!==hex(proposal.descriptor))throw Error('RECEIPT_MISMATCH');
   client.releaseProductProposal(proposal);
   if(hex(await crypto.subtle.digest('SHA-256',new Uint8Array(retained.bytes())))!==retainedHash)throw Error('PROPOSAL_RETAINED_CHANGED');
   retained.release();let released;try{retained.bytes();}catch(e){released=e.code;}
   client.dispose();return {isolated:crossOriginIsolated,records,invalid,cancelled,stale,released,proposalParts:readProductSemantics(proposal.semanticBytes).parts.length,receiptOnly:true};
  },name);
  assert.equal(result.isolated,true);assert.equal(result.records.length,46);assert.equal(result.proposalParts,0);assert.equal(result.released,'SNAPSHOT_RELEASED');
  const oracles=[];for(const item of result.records){
   const s=readSnapshot(fs.readFileSync(path.join(output,name,item.id+'.arch'))),m=readProductSemantics(new Uint8Array(fs.readFileSync(path.join(output,name,item.id+'.buf1'))));
   assert.equal(s.parts.length,m.parts.length);const checked=s.parts.map(p=>inspectMesh({vertices:s.vertices,faces:s.faces.slice(p.faceStart,p.faceStart+p.faceCount)}));
   const n=readSnapshot(fs.readFileSync(path.join(run,item.id==='prepared-text'?'evidence/native-product-special':item.id.startsWith('raster-')?'evidence/native-raster-product':'evidence/native-product',item.id.replace(/^raster-/, '')+'.arch')));
   checked.forEach((c,i)=>assert.ok(Math.abs(c.volume-n.parts[i].reportedVolume)<1e-6));oracles.push({id:item.id,parts:checked.length,triangles:s.faces.length});
  }
  fs.writeFileSync(path.join(output,name+'-result.json'),JSON.stringify({engine:name,version:context.browser()?.version()??'persistent',result,oracles},null,2)+'\n');
 }catch(e){fs.writeFileSync(path.join(output,name+'-failure.txt'),e.stack);throw e;}
 finally{await context.close();}
});
