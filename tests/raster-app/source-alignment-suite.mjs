import {createRasterAdapters,createRasterRecipeHelper,rasterOptionsForState} from '../../src/integration/raster-adapters.mjs';
import {encodeRasterPNG} from '../../src/core/png-encode.mjs';
import {sha256,canonicalJSON} from '../../src/storage/common.mjs';
import {newDocument,contentEdit,validateState} from '../../src/app/documents.mjs';
import {SourceOperations} from '../../src/app/sources.mjs';
import {ProposalOperations} from '../../src/app/proposals.mjs';
import {createSourceContext,sourceConfirmation,sourceReceipt} from '../../src/app/source-approval.mjs';
const assert=(ok,label)=>{if(!ok)throw Error(label);};
const clone=x=>structuredClone(x),same=(a,b)=>canonicalJSON(a)===canonicalJSON(b);
async function rejects(fn,code){try{await fn();}catch(e){assert(e.code===code,code+' got '+(e.code??e.message));return;}throw Error('Expected '+code);}
export async function sourceAlignment({test,runtime,readFixture,notes}) {
 const service=createRasterAdapters({runtime}),source=service.source,initial=(await newDocument('keychain')).document.state;
 const h=Object.create(SourceOperations.prototype);
 for(const name of Object.getOwnPropertyNames(ProposalOperations.prototype))if(name!=='constructor')Object.defineProperty(h,name,Object.getOwnPropertyDescriptor(ProposalOperations.prototype,name));
 let serial=0,publications=0,lastHook=null,lastAnswer=null,holdHook=null;
 Object.assign(h,{
  doc:{state:initial},assets:new Map(),projectId:'alignment-project',headRevision:0,epoch:1,history:[],pendingOperation:null,
  requireProject(){assert(this.doc,'project');},emit(){},result(fn){return fn();},
  guard(epoch){if(epoch!==this.epoch)throw Object.assign(Error('epoch'),{code:'STALE_PROJECT'});},
  startJob(){const abort=new AbortController();return {epoch:this.epoch,abort,ticket:{id:'job-'+(++serial),userId:'u',projectId:this.projectId,revision:this.doc.state.revision,generation:serial}};},
  jobControl(job){return {version:'arch-app-adapters/1',ticket:clone(job.ticket),signal:job.abort.signal,onProgress:()=>{}};},
  jobGuard(job){this.guard(job.epoch);assert(!job.abort.signal.aborted&&job.ticket.revision===this.doc.state.revision,'job guard');},
  finishJob(){},enqueue(fn){return fn();},store:{async load(){return {headRevision:h.headRevision};}},
  async edit(next,_command,{assets=this.assets}={}){
   assert(next.revision===this.doc.state.revision+1,'single domain revision');
   this.history.push({state:clone(this.doc.state),assets:this.assets});
   this.doc={state:validateState(clone(next))};this.assets=assets;this.headRevision++;publications++;
  },
  adapters:{source:{...source,async acceptProposal(c){
   lastHook=c;const before=canonicalJSON(c.source);if(holdHook)await holdHook;
   const answer=await source.acceptProposal(c);assert(canonicalJSON(c.source)===before,'hook modified candidate');
   lastAnswer=answer;return answer;
  }},editing:{version:'arch-app-adapters/1',async edit(c){
   // Test-only deterministic byte gesture, through the actual controller editSource.
   const raster={...c.raster,data:new Uint8ClampedArray(c.raster.data)};raster.data[0]^=1;
   raster.preview=await encodeRasterPNG(raster,{signal:c.signal});
   return {version:c.version,ticket:c.ticket,changed:true,raster};
  }}}
 });
 const state=()=>h.doc.state,src=()=>state().content.app.source;
 const control=()=>h.jobControl(h.startJob());
 const assets=()=>new Map([...h.assets].map(([hash,a])=>[hash,a.bytes]));
 const accept=()=>h.acceptOperation(h.pendingOperation.id,true);
 const convert=()=>h.convertSource('raster');
 const ingest=bytes=>h.sourceJob(async()=>({file:{name:'synthetic.jpg',mediaType:'image/jpeg',bytes}}),'source');
 let imported=null,originalHash=null,initialRGBA=null;
 await test('aligned actual controller import / exact flat receipt / candidate hash gate',async()=>{
  const bytes=await readFixture('synthetic-rgb.jpg'),c=control();
  const defaults=rasterOptionsForState(state()).options;
  assert(defaults.k===4&&defaults.res===520&&defaults.smooth===3&&defaults.minA===5&&defaults.denoise===1&&defaults.eps===35&&defaults.tension===65,'catalog defaults');
  await rejects(()=>source.ingest({...c,file:{bytes},purpose:'source'}),'RASTER_STATE_REQUIRED');
  await rejects(()=>source.ingest({...c,state:state(),file:{bytes},purpose:'source'}),'RASTER_SOURCE_CONTEXT_REQUIRED');
  await rejects(()=>ingest(bytes),'PROPOSAL_REQUIRED');
  assert(!src()&&publications===0&&h.pendingOperation.control.sourceContext.operation==='import','import must wait');
  const pending=h.pendingOperation;await rejects(()=>h.acceptOperation(pending.id,false),'STALE_CONFIRMATION');
  assert(h.pendingOperation===pending,'non-consent leaves proposal pending');
  await accept();assert(publications===1&&src().revision===0,'atomic initial import');
  originalHash=await sha256(bytes);initialRGBA=src().raster.rgba;imported=clone(state());
  assert(src().raw.hash===originalHash&&src().metadata.sourceContext.predecessor===null,'original bytes/context');
  assert(lastAnswer.confirmation.kind==='raster'&&same(sourceConfirmation(lastAnswer.confirmation),lastAnswer.confirmation),'required kind');
  assert(lastAnswer.receipt.version==='arch-source-confirmation-receipt/1'&&Object.keys(lastAnswer).sort().join(',')==='confirmation,receipt,ticket,version','flat common envelope');
  assert(Object.keys(src().metadata).includes('confirmationReceipt')&&!('rasterReceipt'in src().metadata),'single generic approval field');
  const binding={control:lastHook,confirmation:lastHook.confirmation,source:lastHook.source,acceptedAtRevision:lastHook.acceptedAtRevision};
  assert(same(sourceReceipt(lastAnswer,binding),lastAnswer.receipt),'actual controller receipt checker');
  for(const change of [r=>{r.confirmation.kind='text';},r=>{r.receipt.sourceRevision++;},r=>{r.receipt.settingsHash='0'.repeat(64);},r=>{r.receipt.artifactHash='0'.repeat(64);}]) {
   const bad=clone(lastAnswer);change(bad);let rejected=false;try{sourceReceipt(bad,binding);}catch{rejected=true;}assert(rejected,'receipt mutation rejected');
  }
  await rejects(()=>source.acceptProposal({...lastHook,confirmation:{...lastHook.confirmation,proposalHash:'0'.repeat(64)}}),'RASTER_CONFIRMATION_MISMATCH');
  await rejects(()=>source.acceptProposal({...lastHook,acceptedAtRevision:lastHook.acceptedAtRevision+1}),'RASTER_CONFIRMATION_CONTEXT');
  const bad=clone(lastHook.source);bad.metadata.rasterPreparation.options.eps=71;
  await rejects(()=>source.acceptProposal({...lastHook,source:bad}),'RASTER_RECEIPT_HASH');
  const target=clone(lastHook.source),context={...lastHook.sourceContext,id:'different-target'};target.id=context.id;target.metadata.sourceContext=context;
  await rejects(()=>source.acceptProposal({...lastHook,source:target,sourceContext:context}),'RASTER_SOURCE_CONTEXT');
  const a=await source.prepareRecipe({...control(),state:state(),assets:assets()});
  assert(a.status==='ready'&&a.coordinateKind===28&&a.sourceAssemblyRequired,'ready is indexed source, not final product');
  await service.reset();
  const helper=createRasterRecipeHelper({source,assemble:({geometry})=>{assert(geometry.xyNm instanceof BigInt64Array&&geometry.coordinateKind===28,'exact indexed geometry');return 'source-assembly-input';}});
  assert(await helper({...control(),state:validateState(JSON.parse(canonicalJSON(state()))),assets:assets()})==='source-assembly-input','reset/reopen replay');
 });
 await test('edited source7 -> same ID8 -> ID9 / original and lineage / stale context refusal',async()=>{
  for(let i=0;i<7;i++)await h.editSource({tool:'erase',projectRevision:state().revision,sourceRevision:src().revision,id:'edit-'+i});
  assert(src().revision===7&&src().raw.hash===originalHash,'actual controller edits preserve source');
  await rejects(()=>source.prepareRecipe({...control(),state:state(),assets:assets()}),'RASTER_SOURCE_CONVERSION_REQUIRED');
  const c={...control(),state:state(),source:clone(src()),assets:assets(),target:'raster'},context=createSourceContext('convert',src());
  assert(context.revision===8&&context.predecessor.revision===7&&context.id===src().id,'controller explicit target');
  for(const bad of [{...context,revision:0},{...context,id:'replacement'},{...context,predecessor:{...context.predecessor,rawHash:'0'.repeat(64)}},{...context,operation:'import',revision:0},{...context,extra:true}])
   await rejects(()=>source.convert({...c,sourceContext:bad}),'RASTER_SOURCE_CONTEXT');
  const before=canonicalJSON(state()),count=publications;
  await rejects(convert,'PROPOSAL_REQUIRED');assert(canonicalJSON(state())===before&&publications===count,'pending conversion no publish');
  assert(h.pendingOperation.control.sourceContext.revision===8,'no hardcoded zero');await accept();
  const p=src().metadata.rasterPreparation;
  assert(src().id===imported.content.app.source.id&&src().revision===8&&p.context.sourceRevision===8&&p.input.parentSourceRevision===7,'revision bound at all layers');
  assert(same(p.context.sourceContext,src().metadata.sourceContext)&&p.input.originalHash===originalHash&&p.input.lineage.initialRGBAHash===initialRGBA,'context and original lineage persisted');
  assert(src().metadata.confirmationReceipt.sourceRevision===8&&src().metadata.confirmationReceipt.acceptedAtRevision===state().revision,'source/domain revisions distinct');
  assert((await source.prepareRecipe({...control(),state:state(),assets:assets()})).status==='ready','converted receipt replays');
  const staleControl=h.pendingOperation?.control??c;
  await rejects(()=>source.convert({...staleControl,state:state(),ticket:control().ticket,source:clone(src()),sourceContext:context,assets:assets(),target:'raster'}),'RASTER_SOURCE_CONTEXT');
  await rejects(convert,'PROPOSAL_REQUIRED');await accept();
  assert(src().revision===9&&src().metadata.rasterPreparation.input.parentSourceRevision===8,'second conversion increments once');
  assert((await source.prepareRecipe({...control(),state:state(),assets:assets()})).status==='ready','second conversion replay');
  assert(h.history.some(x=>x.state.content.app.source?.revision===7)&&h.history.some(x=>x.state.content.app.source?.revision===8),'predecessor snapshots retained');
 });
 await test('manual settings require exact new consent / context hash / metadata cap',async()=>{
  const prior=clone(src().metadata.confirmationReceipt);
  await h.edit(contentEdit(state(),app=>{app.name='Unrelated title revision';}));
  assert((await source.prepareRecipe({...control(),state:state(),assets:assets()})).status==='ready','unrelated domain revision reuses exact consent');
  const changed=clone(state());changed.parameters.common.eps={origin:'user',value:36};changed.revision++;await h.edit(changed);
  await rejects(()=>source.prepareRecipe({...control(),state:state(),assets:assets()}),'RASTER_SOURCE_CONVERSION_REQUIRED');
  const prepared=await source.prepareRecipe({...control(),state:state(),assets:assets(),sourceContext:createSourceContext('convert',src())});
  assert(prepared.status==='proposal'&&prepared.sourceProposal.confirmation.proposalHash!==prior.proposalHash&&!prepared.sourceProposal.result.metadata.confirmationReceipt,'changed eps remains unapproved');
  await rejects(convert,'PROPOSAL_REQUIRED');await accept();
  assert(src().metadata.rasterPreparation.options.eps===36&&src().metadata.confirmationReceipt.proposalHash!==prior.proposalHash,'manual value and exact geometry hash');
  const bytes=await readFixture('synthetic-rgb.jpg'),c=control(),one=createSourceContext('import',src()),two=createSourceContext('import',src());
  const r1=await source.ingest({...c,state:state(),sourceContext:one,file:{bytes},purpose:'source'});
  const r2=await source.ingest({...c,state:state(),sourceContext:two,file:{bytes},purpose:'source'});
  assert(r1.confirmation.proposalHash===r2.confirmation.proposalHash&&r1.confirmation.approvalHash!==r2.confirmation.approvalHash,'target ID bound to approval, not native geometry');
  const oversized=clone(state());oversized.content.app.source.metadata.testPadding='x'.repeat(65536);
  const before=publications;
  await rejects(()=>source.convert({...control(),state:oversized,source:oversized.content.app.source,sourceContext:createSourceContext('convert',oversized.content.app.source),assets:assets(),target:'raster'}),'RASTER_SOURCE_METADATA_BUDGET');
  assert(publications===before,'metadata failure cannot publish');
 });
 await test('actual controller guard rejects stale head / in-flight acceptance epoch / fresh replacement import',async()=>{
  let before=canonicalJSON(state()),count=publications;
  await rejects(convert,'PROPOSAL_REQUIRED');h.headRevision++;
  await rejects(accept,'STALE_CONFIRMATION');
  assert(canonicalJSON(state())===before&&publications===count,'stale head no publish');
  await rejects(convert,'PROPOSAL_REQUIRED');
  let resume;holdHook=new Promise(r=>{resume=r;});const pending=accept();
  // The actual hook wrapper captures input before awaiting this explicit test latch.
  const expected=state().revision;
  for(let i=0;i<100&&lastHook.ticket.revision!==expected;i++)await new Promise(r=>setTimeout(r,0));
  assert(lastHook.ticket.revision===expected,'accept reached hook');h.epoch++;resume();holdHook=null;
  await rejects(()=>pending,'STALE_PROJECT');
  assert(canonicalJSON(state())===before&&publications===count,'retired epoch no partial publish');
  const old=clone(src()),bytes=await readFixture('synthetic-rgb.jpg');
  await rejects(()=>ingest(bytes),'PROPOSAL_REQUIRED');
  const ctx=h.pendingOperation.control.sourceContext;
  assert(ctx.operation==='import'&&ctx.id!==old.id&&ctx.revision===0&&ctx.predecessor.id===old.id&&ctx.predecessor.revision===old.revision,'replacement is explicit import only');
  await accept();assert(src().id===ctx.id&&src().revision===0,'replacement import uses reserved identity');
  await service.reset();
 });
 notes.push('Staged current-main controller SourceOperations/ProposalOperations/receipt validators exercised with real raster Module. Host persistence/epoch guard is an explicit in-memory test harness, not a backend/CAS security qualification.');
}
