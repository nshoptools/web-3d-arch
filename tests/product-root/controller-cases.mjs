import {createAppController} from '../../src/app/controller.mjs';
import {verifyDocument} from '../../src/app/documents.mjs';
import {applicationContext} from '../../src/integration/application-context.mjs';
import {createApplicationSources} from '../../src/integration/source-compositor.mjs';
import {createProductSourceContexts} from '../../src/integration/product-source-contexts.mjs';
import {createProductAdapters} from '../../src/integration/product-adapters.mjs';
import {createProductTransactions} from '../../src/integration/product-transactions.mjs';
import {createGeometryProposalBridge} from '../../src/integration/geometry-proposals.mjs';
import {createRasterEditingAdapter} from '../../src/app/index.mjs';
import {sha256,canonicalJSON,uuid} from '../../src/app/common.mjs';
import {encodeRasterPNG} from '../../src/core/png-encode.mjs';
import {LIMITS} from './selection.mjs';
export const must=(x,msg)=>{if(!x)throw Error(msg);},copy=structuredClone;
const ok=r=>{must(r.ok,JSON.stringify(r));return r;};
export const SVG='<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="30mm" viewBox="0 0 40 30"><path id="west" fill="#e04444" fill-rule="evenodd" d="M0 0H20V30H0Z M5 6H9V10H5Z"/><path id="east" fill="#3388ee" d="M20 0H40V30H20Z"/></svg>';
/** Labelled storage recorder only. Controller/domain/history/CAS/asset validation
 * are real; these tests do not qualify authentication, IDB or offsite backups. */
export function memoryStore(){
 const records=new Map(),commits=[];return {commits,capabilities:{selectedBackend:'TEST-memory',database:{readOnly:false}},status:()=>({canEdit:true,canRescue:true,capabilities:{database:{readOnly:false}}}),close(){},
  async listProjects(){return [...records].map(([projectId,r])=>({projectId,revision:r.headRevision,title:r.manifest.document.title}));},
  async load(id){return copy(records.get(id)??{status:'empty'});},
  async commit(input,{signal}={}){
   must(!signal?.aborted,'STORE_ABORTED');const revision=records.get(input.projectId)?.headRevision??0;
   if(input.expectedRevision!==revision)throw Object.assign(Error('TEST CAS'),{code:'CONFLICT'});
   const assets=[];for(const a of input.assets){const bytes=a.bytes.slice(),hash=await sha256(bytes);assets.push({hash,byteLength:bytes.length,kind:a.kind,bytes});}
   await verifyDocument(input.document,new Map(assets.map(a=>[a.hash,a])));must(!signal?.aborted,'STORE_ABORTED');
   const head={revision:revision+1,transactionId:input.transactionId};
   const record={status:'editable',head,headRevision:head.revision,assets,manifest:{document:copy(input.document),engine:input.engine,assets:assets.map(({bytes,...a})=>a),dependencies:[]}};
   records.set(input.projectId,record);commits.push({projectId:input.projectId,domainRevision:input.document.state.revision,head,assetHashes:assets.map(a=>a.hash)});return {head};
  }
 };
}
export async function runControllerCases({kernel,catalog,assetURLs,origin,createEditingClient,capture=async()=>{},families=['svg','raster','text','emoji'],products=['keychain'],styles=['noi'],group='matrix',onContext=()=>{},recordCase=async()=>{},beforeDispose=async()=>{},signal}){
 let c,product,contexts,sources,transactions,geometry;const rows=[],trace=[],caseTimes=[];let caseStarted=0;
 async function measured(id,fn){caseStarted=performance.now();let status='fail',failure;try{if(signal?.aborted)throw Error('GROUP_ABORTED');await fn();must(performance.now()-caseStarted<=LIMITS.caseMs,'CASE_RUNTIME_LIMIT');status='pass';}catch(e){failure={message:e.message,code:e.code};throw e;}finally{const row={id,status,elapsedMs:performance.now()-caseStarted,limitMs:LIMITS.caseMs,...(failure?{failure}:{})};caseTimes.push(row);await recordCase(row);}}
 const context=()=>{const x=applicationContext(c);onContext(x);return x;};
 sources=createApplicationSources({kernel,catalog,assetURLs,origin,context});
 contexts=createProductSourceContexts({kernel,sources,context,probeDatums:input=>product.probeDatums(input)});
 geometry=createGeometryProposalBridge();
 product=createProductAdapters({operation:kernel.operation,kernelLeases:kernel.kernelLeases,context,withPreparedSource:contexts.withPreparedSource,
  withPreparedDatumSource:contexts.withPreparedDatumSource,probeNative:(a,r,g)=>a.probeProduct(r,g),onGeometryProposal:geometry.onGeometryProposal});
 transactions=createProductTransactions({sourceContexts:contexts,context});
 const editing=createEditingClient?createRasterEditingAdapter({createEditingClient,encodePNG:image=>encodeRasterPNG({...image,data:new Uint8ClampedArray(image.data)})}):undefined;
 c=createAppController({origin,deviceId:uuid(),adapters:{engine:geometry.wrap(product.engine),source:contexts.source,productTransactions:transactions,...(editing?{editing}:{}),
  async reset(){transactions.reset();await contexts.reset();geometry.reset();await product.reset();await sources.reset();await editing?.reset();}}});
 const report=c.report.bind(c);c.report=e=>{if(e.code!=='PROPOSAL_REQUIRED')console.log('TEST_PRODUCT_DIAGNOSTIC '+JSON.stringify({code:e.code,message:e.message,details:e.details}));return report(e);};
 c.store=memoryStore();c.session={...c.session,status:'signed-in',user:{id:'TEST-product-root-user',name:'TEST',role:'member'}};c.api.userId=c.session.user.id;c.remote.settings={values:{}};c.remote.settingsUpdate=async()=>{};
 const ctl=()=>({version:'arch-app-adapters/1',ticket:{id:uuid(),userId:c.session.user.id,projectId:c.projectId,revision:c.doc.state.revision,generation:++c.generation},signal:new AbortController().signal,onProgress:()=>{}});
 async function newProject(productId,style,overlay=false){
  ok(await c.dispatch({type:'project.create',product:productId}));ok(await c.dispatch({type:'parameter.set',id:'artMode',value:style}));
  if(overlay)ok(await c.dispatch({type:'text.update',values:{text:'I',placement:'on-model',fontId:'inter',sizeMm:'4',sizeDisplay:'4',xMm:'-1',yMm:'-1',baseEnabled:true,baseThicknessLayers:'2',heightLayers:'3'}}));
  context();
 }
 async function prepare(family){
  if(family==='emoji')return c.selectEmoji('😀','noto-emoji-monochrome');
  let bytes;
  if(family==='raster'){
   const width=16,height=12,data=new Uint8ClampedArray(width*height*4);
   for(let y=0;y<height;y++)for(let x=0;x<width;x++){if(x>=2&&x<=3&&y>=3&&y<=4)continue;data.set(x<8?[224,68,68,255]:[51,136,238,255],(y*width+x)*4);}
   bytes=await encodeRasterPNG({width,height,data});
  }else bytes=new TextEncoder().encode(family==='svg'?SVG:family==='text'?'O':'E\u0302\u0301\nĐO');
  const file={name:family==='svg'?'shared-hole.svg':['text','nfd'].includes(family)?'original-nfd.txt':'original-palette.png',type:family==='svg'?'image/svg+xml':['text','nfd'].includes(family)?'text/plain':'image/png',size:bytes.length,arrayBuffer:async()=>new Uint8Array(bytes).buffer};
  return c.importFile(file);
 }
 /** Only this labelled fixture driver gives explicit consent to displayed plans. */
 async function confirmChain(result,{baseCommits=c.store.commits.length,baseRevision=c.doc.state.revision,max=5}={}){
  let n=0;const ids=[];
  while(!result.ok&&result.diagnostic.code==='PROPOSAL_REQUIRED'){
   must(++n<=max,'CONSENT_CHAIN_LIMIT');const proposal=c.pendingOperation;must(proposal&&proposal.outputHash,'EXPLICIT_PROPOSAL_REQUIRED');
   ids.push(proposal.id);trace.push({kind:proposal.kind,hash:proposal.outputHash,beforeRevision:c.doc.state.revision,changes:proposal.changes});
   if(c.doc.state.revision===baseRevision)must(c.store.commits.length===baseCommits,'PARTIAL_COMMIT_BEFORE_CONSENT');
   result=await c.dispatch({type:'proposal.accept',id:proposal.id,confirmed:true});
  }
  ok(result);return ids;
 }
 async function snapshot(id){
  const model=c.visible?.lease;must(model&&model.ticket.revision===c.doc.state.revision,'FRESH_MODEL_REQUIRED');const source=c.doc.state.content.app.source;
  const m=model.product.semantics;must(m.mechanicsSemantics===3&&m.sourceSemantics===2,'STRICT_3_2');
  must(source.metadata.productBindings.identityLedger.records.length>0,'DURABLE_IDENTITIES_REQUIRED');
  const bytes=new Uint8Array(model.bytes()),row={id,sourceKind:source.kind,revision:c.doc.state.revision,parts:model.blocks.length,meshHash:await sha256(bytes),sourceHash:source.raw.hash,
   nativeHead:copy(model.product.head),datums:m.sourceIntervals,geometryVerified:false};
  row.elapsedBeforeOracleMs=performance.now()-caseStarted;await capture(id,{bytes,semantics:copy(m),row,state:copy(c.doc.state),bindings:copy(source.metadata.productBindings),assets:new Map([...c.assets].map(([h,a])=>[h,new Uint8Array(a.bytes)]))});rows.push(row);return row;
 }
 try{
  if(group==='matrix')for(const family of families)for(const p of products)for(const style of styles)await measured(family+'-'+p+'-'+style,async()=>{
   await newProject(p,style);const before=c.store.commits.length,revision=c.doc.state.revision;
   const r=await prepare(family);must(!r.ok&&r.diagnostic.code==='PROPOSAL_REQUIRED','NEW_SOURCE_NEEDS_CONSENT '+JSON.stringify(r));
   must(c.doc.state.content.app.source===null&&c.store.commits.length===before,'NEW_SOURCE_COMMITTED_EARLY');
   const ids=await confirmChain(r,{baseCommits:before,baseRevision:revision});must(c.doc.state.revision===revision+1&&c.store.commits.length===before+1,'SINGLE_ATOMIC_ADOPTION');
   if(family==='raster')must(ids.length===2,'RASTER_AND_PRODUCT_SEPARATE_CONSENT');
   await snapshot(family+'-'+p+'-'+style);
  });
  if(group==='overlay'||group==='raster-edit'){
   for(const p of products)for(const family of (group==='raster-edit'?['raster']:families))await measured(group+'-'+family+'-'+p,async()=>{
    await newProject(p,'noi',true);const before=c.store.commits.length,revision=c.doc.state.revision;
    await confirmChain(await prepare(family),{baseCommits:before,baseRevision:revision});must(c.store.commits.length===before+1,'ATOMIC_NEW_OVERLAY');
    const row=group==='raster-edit'?{datums:c.visible.lease.product.semantics.sourceIntervals}:await snapshot(family+'-'+p+'-new-negative-overlay');must(row.datums.some(i=>i.datum===133&&i.referenceLayer>0),'NEW_HEAD_PROBE_REFERENCE');
    const beforeText=c.store.commits.length,old=copy(c.doc.state),oldAssets=[...c.assets.keys()];
    const result=await c.dispatch({type:'text.update',values:{text:'O',xMm:'-2',yMm:'-2'}});
    must(!result.ok&&result.diagnostic.code==='PROPOSAL_REQUIRED'&&canonicalJSON(c.doc.state)===canonicalJSON(old),'TEXT_RECAPTURE_ATOMIC');
    await confirmChain(result,{baseCommits:beforeText,baseRevision:old.revision});must(c.store.commits.length===beforeText+1,'SINGLE_TEXT_COMMIT');if(group!=='raster-edit')await snapshot(family+'-'+p+'-recaptured-overlay');
    must(c.doc.state.content.app.source.raw.hash===old.content.app.source.raw.hash&&c.assets.has(old.content.app.source.raw.hash),'ORIGINAL_SOURCE_RETAINED');
    if(group==='raster-edit'&&family==='raster'&&editing&&p==='keychain'){
     const original=copy(c.doc.state.content.app.source),rgba=original.raster.rgba,palette=copy(c.doc.state.content.app.source.metadata.productBindings.adoption?.sourcePalette??[]);
     ok(await c.dispatch({type:'editor.settings',values:{cutMode:'hole',strokeWidthPx:'3'}}));
     const g={id:uuid(),tool:'erase',projectRevision:c.doc.state.revision,sourceRevision:original.revision,points:[{x:10,y:8},{x:13,y:8}],snap:'none'};
     const edited=await c.editSource(g);ok(edited);must(c.doc.state.content.app.source.raster.rgba!==rgba,'ACTUAL_ERASE_CHANGED');
     const staged=c.doc.state,commitCount=c.store.commits.length;await confirmChain(await c.dispatch({type:'source.convert',target:'raster'}),{baseCommits:commitCount,baseRevision:staged.revision});
     const next=c.doc.state.content.app.source;must(next.raw.hash===original.raw.hash&&c.assets.has(rgba)&&next.assetHashes.includes(original.raw.hash),'ORIGINAL_AND_FULL_RGBA_RETAINED');
     await snapshot('raster-erase-reconvert');
    }
   });
  }
  if(group==='nfd')await measured('nfd-original-source',async()=>{await newProject('keychain','noi');await confirmChain(await prepare('nfd'));await snapshot('nfd-original-source');});
  if(group==='negative-nfd')await measured('nfd-negative-overlay-refusal',async()=>{
   await newProject('keychain','noi',true);await confirmChain(await prepare('svg'));
   const before=canonicalJSON(c.doc.state),commits=c.store.commits.length;const result=await c.dispatch({type:'text.update',values:{text:'E\u0302\u0301\nĐO',bend:'12',letterSpacing:'0.35',lineSpacing:'1.4',xMm:'-2',yMm:'-2'}});
   must(!result.ok&&result.diagnostic.code==='PRODUCT_DATUM_PROPOSAL_BLOCKED','NFD_NATIVE_REFUSAL_CHANGED_REINVESTIGATE');must(canonicalJSON(c.doc.state)===before&&c.store.commits.length===commits,'NFD_REFUSAL_ATOMIC');trace.push({negative:'nfd-short-canonical-edge',code:result.diagnostic.code,knownReleaseIssue:true});
  });
  if(group==='text-source')for(const p of products)for(const style of styles)await measured('text-source-'+p+'-'+style,async()=>{
   await newProject(p,style);const original='E\u0302\u0301\nĐO';const before=canonicalJSON(c.doc.state),count=c.store.commits.length;
   const result=await c.dispatch({type:'text.update',values:{text:original,fontId:'inter',asSource:true}});
   must(!result.ok&&result.diagnostic.code==='PROPOSAL_REQUIRED','TEXT_SOURCE_CONSENT '+JSON.stringify(result));must(canonicalJSON(c.doc.state)===before&&c.store.commits.length===count,'TEXT_SOURCE_ATOMIC_BEFORE');
   await confirmChain(result,{baseCommits:count,baseRevision:JSON.parse(before).revision});must(c.store.commits.length===count+1,'TEXT_SOURCE_ONE_COMMIT');
   const src=c.doc.state.content.app.source;must(c.doc.state.content.app.text.asSource&&src.kind==='text'&&new TextDecoder().decode(c.assets.get(src.raw.hash).bytes)===original&&src.metadata.originalText===original,'TEXT_SOURCE_ORIGINAL_NFD');
   await snapshot('text-source-'+p+'-'+style);
  });
  if(group==='color')await measured('color-emoji-converted',async()=>{
   await newProject('keychain','noi');await confirmChain(await c.selectEmoji('😀','noto-color-emoji'));const original=c.doc.state.content.app.source.raw.hash;
   must(!c.visible&&c.doc.state.content.app.source.metadata.productBindings.version==='arch-product-bindings-pending/1','COLOR_RETAINED_NO_FAKE_MODEL');
   for(let i=0;i<2;i++)await confirmChain(await c.dispatch({type:'source.convert',target:'raster'}));
   must(c.doc.state.content.app.source.raw.hash===original&&c.assets.has(original),'COLOR_ORIGINAL_RETAINED');await snapshot('color-emoji-converted');
  });
  if(group==='lifecycle')await measured('discard-has-no-commit',async()=>{
   await newProject('keychain','noi');let r=await prepare('svg');const before=canonicalJSON(c.doc.state),count=c.store.commits.length;
   must(!r.ok&&c.pendingOperation,'DISCARD_PROPOSAL');ok(await c.dispatch({type:'proposal.discard',id:c.pendingOperation.id}));
   must(canonicalJSON(c.doc.state)===before&&c.store.commits.length===count&&!c.visible,'DISCARD_HAS_NO_COMMIT');
  });
  await beforeDispose(ctl());return {status:'pass',rows,trace,caseTimes,group,storage:'labelled-memory-recorder-real-controller-history-CAS',geometryVerified:false};
 }finally{await c.dispose();}
}
