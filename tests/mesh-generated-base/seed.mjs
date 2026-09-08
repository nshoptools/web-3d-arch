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
import {LIMITS} from '../product-root/selection.mjs';
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
  while(c.pendingOperation){
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
  for(const family of families){
   await newProject('keychain','noi',false);
   const before=c.store.commits.length,revision=c.doc.state.revision;
   await confirmChain(await prepare(family));

   await snapshot(family+'-current-source');
   trace.push({fixtureOnly:true,observedSourceAdoptionCommits:c.store.commits.length-before,beforeRevision:revision,afterRevision:c.doc.state.revision});
  }
  await beforeDispose(ctl());return {status:'pass',rows,trace,storage:'labelled-memory-current-source-seed',atomicAdoptionQualified:false};
 }finally{await c.dispose();}
}
