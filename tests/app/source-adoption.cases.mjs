// Controller tests. Source/material preparation is explicitly synthetic; no geometry support is claimed.
import {VERSION,sha256,canonicalJSON,utf8,uuid} from '../../src/app/common.mjs';
import {createRasterEditingAdapter} from '../../src/app/index.mjs';
import {encodeRasterPNG} from '../../src/core/png-encode.mjs';
import {testPreparation,testFlatReceipt} from './source-approval.fixtures.mjs';
export const check=(v,m='TEST_CHECK')=>{if(!v)throw Error(m);};
export const eq=(a,b,m='TEST_EQUAL')=>check(canonicalJSON(a)===canonicalJSON(b),m);
export const ok=r=>{check(r.ok,r.diagnostic?.code);return r;};
const bad=(r,code)=>{check(!r.ok,'expected rejection');if(code)check(r.diagnostic.code===code,r.diagnostic.code+' expected '+code);return r;};
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
export const svg=()=>new File(['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 5"><path d="M0 0H10V5H0Z"/></svg>'],'fixture.svg',{type:'image/svg+xml'});
const mat=(id='auto-body',role='body')=>({id,label:id,color:'#ff0000',slot:1,role,overridden:false,backgroundEligible:true,excluded:false});
const reply=(input)=>({version:input.version,ticket:{...input.ticket},productBindings:{version:'TEST-product-bindings/1',product:input.state.product,sourceId:input.source.id,sourceRevision:input.source.revision,bodyMaterialId:'auto-body'},materials:[mat()],materialDefaults:[mat()]});
function mark(c){return {doc:canonicalJSON(c.doc),head:c.headRevision,keys:[...c.assets.keys()].sort(),id:c.projectId};}
function same(c,b){eq(mark(c),b,'rejected change advanced state/assets/head');check(!c.pendingOperation&&!c.job,'no orphan proposal/job');}
async function confirmed(c,r){if(!r.ok&&r.confirmation)return ok(await c.dispatch(r.confirmation.retry));return ok(r);}
async function rasterFixture(c,adapters,{confirmation=false,kind='raster',metadataFactory}={}){
 const image={width:8,height:8,pixelSizeMm:.1,data:new Uint8ClampedArray(256).fill(255)},png=await encodeRasterPNG(image),font=utf8.encode('TEST original font bytes, not a validated font'),fontHash=await sha256(font);
 const descriptor={kind,version:'TEST-approval/1',approvalHash:'a'.repeat(64),proposalHash:'b'.repeat(64)};
 adapters.source.ingest=async input=>{
  const rawHash=await sha256(input.file.bytes),rgbaHash=await sha256(new Uint8Array(image.data.buffer)),pngHash=await sha256(png);
  const metadata=metadataFactory?.({rawHash,rgbaHash,pngHash,fontHash})??{};
  if(confirmation)metadata.rasterPreparation=testPreparation(input,rawHash,rgbaHash);
  const result={version:input.version,ticket:input.ticket,kind,metadata,assets:[{kind:'dependency',bytes:font}],raster:{...image,preview:png,previewMediaType:'image/png'}};
  return confirmation?{status:'proposal',result,confirmation:descriptor,changes:['TEST exact initial raster approval']}:result;
 };
 return {file:new File([png],'fixture.png',{type:'image/png'}),fontHash,png};
}
export const adoptionCases={
 async coldSvgAndLegacy({c,adapters}){
  const legacyIngest=adapters.source.ingest;adapters.source.ingest=async input=>({...await legacyIngest(input),materials:[]});
  const before=mark(c),generation=c.generation;let seen,adopts=0;
  adapters.source.prepareAdoption=async input=>{
   adopts++;seen=input;check(input.purpose==='source'&&input.operation==='import','hook scope');check(input.state.sourceKind==='none'&&input.state.content.app.source===null,'cold immutable base');
   check(Object.isFrozen(input.state.content.app)&&Object.isFrozen(input.source.metadata.sourceContext)&&Object.isFrozen(input.materials),'deep frozen inputs');
   check(input.source.revision===0&&input.source.id===input.sourceContext.id&&input.source.raw.hash===await sha256(input.assets.get(input.source.raw.hash)),'complete descriptor/hash');
   for(const bytes of input.assets.values())bytes.fill(0);input.assets.clear(); // private byte/map copies only
   return reply(input);
  };
  ok(await c.importFile(svg()));check(adopts===1&&c.generation===generation+1&&c.headRevision===before.head+1&&c.doc.history.cursor===1,'one job/commit/history');
  const source=c.doc.state.content.app.source;eq(source.metadata.sourceContext,seen.sourceContext);eq(source.raw,seen.source.raw);eq(source.metadata.productBindings,reply(seen).productBindings);
  eq(c.doc.state.content.app.materials,[mat()]);check(await sha256(c.assets.get(source.raw.hash).bytes)===source.raw.hash,'hook cannot mutate source bytes');
  ok(await c.dispatch({type:'history.undo'}));check(c.doc.state.content.app.source===null&&c.doc.state.content.app.materials.length===0,'undo both');
  ok(await c.dispatch({type:'history.redo'}));check(c.doc.state.content.app.source.id===source.id,'redo same durable IDs');
  delete adapters.source.prepareAdoption;adapters.source.ingest=legacyIngest;ok(await c.importFile(svg()));
  check(!Object.hasOwn(c.doc.state.content.app.source.metadata,'productBindings'),'no hook retains legacy metadata');
  eq(c.doc.state.content.app.materialDefaults,c.doc.state.content.app.materials);return {oneAdoption:true,legacy:true,copiedAssets:true};
 },
 async rasterApprovalAndConversion({c,adapters,createEditingClient}){
  const fixture=await rasterFixture(c,adapters,{confirmation:true,metadataFactory:({rawHash,rgbaHash,pngHash,fontHash})=>({sourceConversion:{original:{hash:rawHash},assets:[{sha256:rawHash},{sha256:rgbaHash},{sha256:pngHash},{sha256:fontHash}],raster:{sha256:rgbaHash,pngHash}}})});let calls=0,accepts=0,preparedMetadata,receipt;
  adapters.source.prepareAdoption=async input=>{calls++;preparedMetadata=structuredClone(input.source.metadata);return reply(input);};
  adapters.source.acceptProposal=async input=>{accepts++;eq(input.source.metadata.rasterPreparation,preparedMetadata.rasterPreparation,'adoption preserved preparation');
   check(input.source.metadata.productBindings.bodyMaterialId==='auto-body','adopted candidate reaches approval');const out=testFlatReceipt(input);receipt=out.receipt;return out;};
  const initial=mark(c),proposal=bad(await c.importFile(fixture.file),'PROPOSAL_REQUIRED');
  check(calls===1&&accepts===0&&c.headRevision===initial.head&&c.doc.state.content.app.source===null,'no early adoption commit');
  ok(await c.dispatch(proposal.confirmation.retry));check(accepts===1&&calls===1&&c.headRevision===initial.head+1&&c.doc.history.cursor===1,'exact one acceptance commit');
  const source=c.doc.state.content.app.source;eq(source.metadata.confirmationReceipt,receipt);eq(source.metadata.rasterPreparation,preparedMetadata.rasterPreparation);
  const previous=structuredClone(source);
  adapters.source.convert=async input=>{
   const result=await adapters.source.ingest({...input,file:{bytes:input.assets.get(input.source.raw.hash)}});return result;
  };
  const converted=bad(await c.dispatch({type:'source.convert',target:'raster'}),'PROPOSAL_REQUIRED'),head=c.headRevision;
  check(c.doc.state.content.app.source.revision===0,'conversion remains pending');ok(await c.dispatch(converted.confirmation.retry));
  const next=c.doc.state.content.app.source;check(next.id===previous.id&&next.revision===1&&next.raw.hash===previous.raw.hash,'conversion context preserved/incremented');
  check(c.headRevision===head+1&&calls===2&&accepts===2,'one conversion adoption/commit');eq(next.metadata.confirmationReceipt,receipt);
  check(next.metadata.confirmationReceipt.kind==='raster','latest confirmed preparation is raster');
  const origin=canonicalJSON(next.metadata.sourceConversion),initialRGBA=next.raster.rgba;
  adapters.editing=createRasterEditingAdapter({encodePNG:image=>encodeRasterPNG({...image,data:new Uint8ClampedArray(image.data)}),...(createEditingClient?{createEditingClient}:{})});
  ok(await c.dispatch({type:'editor.settings',values:{cutMode:'hole',healAuto:false}}));
  ok(await c.editSource({id:uuid(),projectRevision:c.doc.state.revision,sourceRevision:next.revision,tool:'erase',points:[{x:1,y:3},{x:6,y:3}],snap:'none'}));
  const edited=c.doc.state.content.app.source;check(edited.raster.rgba!==initialRGBA,'actual edit after raster receipt');
  check(canonicalJSON(edited.metadata.sourceConversion)===origin&&edited.metadata.confirmationReceipt.kind==='raster','raster receipt never replaces original conversion metadata');
  for(const a of next.metadata.sourceConversion.assets)check(edited.assetHashes.includes(a.sha256)&&await sha256(c.assets.get(a.sha256).bytes)===a.sha256,'sourceConversion assets survive raster receipt and edit');
  return {preparedMetadataPreserved:true,flatReceipt:true,initialRevision:0,conversionRevision:1,sourceConversionSurvivesRasterReceipt:true};
 },
 async badAdoptionIsAtomic({c,adapters}){
  const mutations=[
   r=>({...r,version:'invented'}),r=>({...r,ticket:{...r.ticket,revision:r.ticket.revision+1}}),
   r=>({...r,source:{id:'replacement'}}),r=>({...r,productBindings:[]}),
   r=>({...r,materials:[{...mat(),extra:true}]}),r=>({...r,materialDefaults:[{...mat(),extra:true}]}),
   r=>({...r,materials:[{...mat(),id:''}]}),r=>({...r,materialDefaults:[{...mat(),id:undefined}]}),
   r=>({...r,materials:[mat(),mat()]}),r=>({...r,materialDefaults:[mat('unknown')]}),
   r=>({...r,materialDefaults:[{...mat(),slot:0}]}),r=>({...r,materialDefaults:[{...mat(),role:'unknown'}]}),
   r=>({...r,materialDefaults:[]}),r=>({...r,materials:Array.from({length:257},(_,i)=>mat('m'+i))}),
   r=>({...r,materialDefaults:Array.from({length:257},(_,i)=>mat('m'+i))}),
   r=>({...r,materials:[{...mat(),backgroundEligible:1}]}),r=>({...r,materialDefaults:[{...mat(),color:'red'}]}),
   r=>({...r,productBindings:JSON.parse('{"__proto__":{"unsafe":true}}')}),r=>({...r,productBindings:{broken:NaN}}),
   r=>({...r,materials:Array.from({length:256},(_,i)=>({...mat('m'+i),excludedReason:'x'.repeat(1500)}))}),
  ];
  const before=mark(c);for(const mutate of mutations){adapters.source.prepareAdoption=async input=>mutate(reply(input));bad(await c.importFile(svg()));same(c,before);}
  let accessed=false;adapters.source.prepareAdoption=async input=>Object.defineProperty(reply(input),'materials',{enumerable:true,get(){accessed=true;return [];}});bad(await c.importFile(svg()));check(!accessed,'getter not evaluated');same(c,before);
  adapters.source.prepareAdoption=null;bad(await c.importFile(svg()),'SOURCE_ADOPTION_ADAPTER');same(c,before);
  return {rejected:mutations.length+2,noHeadAdvance:true};
 },
 async metadataByteBoundary({c,adapters}){
  let overflow=0;
  adapters.source.prepareAdoption=async input=>{
   const r=reply(input);r.productBindings={padding:''};const available=65536-utf8.encode(canonicalJSON({...input.source.metadata,productBindings:r.productBindings})).length;
   r.productBindings.padding='ă'.repeat(Math.floor(available/2))+'x'.repeat(available%2+overflow);return r;
  };
  ok(await c.importFile(svg()));check(utf8.encode(canonicalJSON(c.doc.state.content.app.source.metadata)).length===65536,'exact UTF8 bound accepted');
  const before=mark(c);overflow=1;bad(await c.importFile(svg()),'SOURCE_METADATA_BUDGET');same(c,before);return {acceptedBytes:65536,rejectedBytes:65537};
 },
 async adoptionRaces({c,adapters}){
  const outcomes=[];
  for(const action of ['cancel','parameter','save','project','source']){
   const entered=gate(),release=gate();let first=true,captured;
   adapters.source.prepareAdoption=async input=>{if(first){first=false;captured=input;entered.resolve();await release.promise;}return reply(input);};
   const pending=c.importFile(svg());await entered.promise;
   if(action==='cancel')ok(await c.dispatch({type:'job.cancel',id:c.job.id}));
   else if(action==='parameter')ok(await c.dispatch({type:'parameter.set',id:'size',value:'51'}));
   else if(action==='save')ok(await c.dispatch({type:'project.save'}));
   else if(action==='project')ok(await c.dispatch({type:'project.create',product:'charm'}));
   else ok(await c.importFile(svg()));
   const committed=mark(c);release.resolve();const rejected=bad(await pending);same(c,committed);check(captured.signal.aborted,'obsolete control aborted');outcomes.push({action,code:rejected.diagnostic.code});
  }
  return {outcomes,noOrphanCommit:true};
 },
 async proposalHashAndRejection({c,adapters}){
  const fixture=await rasterFixture(c,adapters,{confirmation:true});let adopted,accepts=0;
  adapters.source.prepareAdoption=async input=>{adopted=reply(input);return adopted;};
  adapters.source.acceptProposal=async input=>{accepts++;throw Error('TEST worker rejected approval');};
  const before=mark(c),r=bad(await c.importFile(fixture.file),'PROPOSAL_REQUIRED');const p=c.pendingOperation,hash=await p.verify();
  adopted.productBindings.bodyMaterialId='mutated later';adopted.materials[0].color='#00ff00';check(await p.verify()===hash&&p.outputHash===hash,'return values detached before output hash');
  bad(await c.dispatch(r.confirmation.retry));same(c,before);check(accepts===1,'approval called once');
  adapters.source.acceptProposal=async input=>{accepts++;return testFlatReceipt(input);};
  const stale=bad(await c.importFile(fixture.file),'PROPOSAL_REQUIRED');ok(await c.dispatch({type:'parameter.set',id:'size',value:'54'}));const current=mark(c);
  bad(await c.dispatch(stale.confirmation.retry),'STALE_CONFIRMATION');same(c,current);check(accepts===1,'stale never reached approval');
  return {exactCandidateHash:true,rejectionAtomic:true,staleSuppressed:true};
 },
 async skipFontMesh({c,adapters}){
  let calls=0;adapters.source.prepareAdoption=async()=>{calls++;throw Error('not source');};
  adapters.source.ingest=async input=>({version:VERSION,ticket:input.ticket,kind:input.purpose==='font'?'text':'mesh',metadata:{testOnly:true}});
  ok(await c.importFile(new File(['TEST mesh'],'mesh.stl',{type:'model/stl'}),'mesh'));
  ok(await c.importFile(new File(['TEST font'],'font.ttf',{type:'font/ttf'}),'font'));
  check(calls===0,'font/mesh skip adoption');return {font:true,mesh:true};
 },
 async initialProvenanceAfterEdits({c,adapters,createEditingClient,provenanceKinds=['sourceConversion','rasterPreparation']}){
  for(const metadataKind of provenanceKinds){
   const fixture=await rasterFixture(c,adapters,{metadataFactory:({rawHash,rgbaHash,pngHash,fontHash})=>metadataKind==='sourceConversion'?{
    sourceConversion:{original:{hash:rawHash},assets:[{sha256:rawHash},{sha256:rgbaHash},{sha256:pngHash},{sha256:fontHash},{sha256:'f'.repeat(64)}],raster:{sha256:rgbaHash,pngHash}},
   }:{rasterPreparation:{buffers:[{hash:rgbaHash}],input:{originalHash:rawHash,rgbaHash,lineage:{initialRGBAHash:rgbaHash,initialPreviewHash:pngHash}}}}});
   adapters.source.prepareAdoption=async input=>reply(input);ok(await c.importFile(fixture.file));
   const initial=structuredClone(c.doc.state.content.app.source),metadata=canonicalJSON(initial.metadata),intermediate=[];
   adapters.editing=createRasterEditingAdapter({encodePNG:image=>encodeRasterPNG({...image,data:new Uint8ClampedArray(image.data)}),...(createEditingClient?{createEditingClient}:{})});
   ok(await c.dispatch({type:'editor.settings',values:{cutMode:'hole',healAuto:false}}));
   for(const y of [1,4,7]){
    const current=c.doc.state.content.app.source;
    ok(await c.editSource({id:uuid(),projectRevision:c.doc.state.revision,sourceRevision:current.revision,tool:'erase',points:[{x:1,y},{x:6,y}],snap:'none'}));
    const src=c.doc.state.content.app.source;check(src.raster.rgba!==current.raster.rgba,'actual edit changed pixels');
    for(const h of [initial.raw.hash,initial.raster.rgba,initial.raster.preview,fixture.fontHash])check(src.assetHashes.includes(h),'initial raw/render/font retained');
    check(!src.assetHashes.includes('f'.repeat(64)),'metadata cannot introduce unknown hash');
    for(const h of intermediate)if(![initial.raster.rgba,initial.raster.preview,src.raster.rgba,src.raster.preview].includes(h))check(!src.assetHashes.includes(h),'unreferenced intermediate left source refs');
    intermediate.push(src.raster.rgba,src.raster.preview);check(canonicalJSON(src.metadata)===metadata,'edit preserves preparation/receipt/bindings');
   }
   // Force history pruning; provenance must be in current source refs, not rescued accidentally by old undo entries.
   for(let n=0;n<22;n++)await confirmed(c,await c.dispatch({type:'parameter.set',id:'size',value:String(55+n)}));
   for(const h of [initial.raw.hash,initial.raster.rgba,initial.raster.preview,fixture.fontHash])check(c.assets.has(h),'initial still present after history GC');
   check(!c.assets.has(intermediate[0]),'unreferenced first edited frame leaves retained inventory after history GC');
   ok(await c.dispatch({type:'project.save'}));ok(await c.dispatch({type:'project.open',id:c.projectId}));
   for(const h of [initial.raw.hash,initial.raster.rgba,initial.raster.preview,fixture.fontHash])check(c.doc.state.content.app.source.assetHashes.includes(h)&&await sha256(c.assets.get(h).bytes)===h,'verified source replay bytes after reopen');
   ok(await c.dispatch({type:'project.create',product:'keychain'}));
  }
  return {knownMetadataKinds:provenanceKinds.length,actualPixelEdits:3*provenanceKinds.length,historyPruned:true,initialVerifiedAfterReopen:true};
 }
};
