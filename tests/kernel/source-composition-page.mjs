import {createKernelAdapters} from '../../src/integration/kernel-adapters.mjs';
import {createApplicationSources} from '../../src/integration/source-compositor.mjs';
import {createEngineTextRenderer} from '../../src/core/engine-text-renderer.mjs';
import {confirmedRender} from '../../src/integration/confirmed-render.mjs';
import {SourceOperations} from '../../src/app/sources.mjs';
import {createSourceContext,sourcePreparation,sourceReceipt} from '../../src/app/source-approval.mjs';
import {setParameter,validateState} from '../../src/app/documents.mjs';
import {sha256} from '../../src/storage/common.mjs';
import {validatePacket} from '../../src/core/raster-schema.mjs';
import {encodeRasterPNG} from '../../src/core/png-encode.mjs';

const version='arch-app-adapters/1',clone=structuredClone;
const must=(v,m)=>{if(!v)throw Error(m);};
const errorOf=async f=>{try{await f();return 'NO_ERROR';}catch(e){return e.code??e.message;}};
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="24mm" height="20mm" viewBox="0 0 24 20"><path fill="#ff0000" fill-rule="evenodd" d="M0 0H12V20H0Z M4 6V14H8V6Z"/><path fill="#0000ff" d="M12 0H24V20H12Z"/></svg>';

/** Real root Worker/renderer/segmentation plus controller descriptor and receipt
 * validators. The local adoption driver is a fixture, not a storage/UI test. */
export async function runSourceComposition({catalog,assetURLs,initialState,runtime}){
  let state=clone(initialState),projectId='composition-project',userId='composition-user',n=0;
  const records=new Map(),writer=new SourceOperations(),trace=[];
  const bytes=()=>new Map([...records].map(([h,a])=>[h,a.bytes]));
  const context=()=>({state,projectId,userId,assetsMap:bytes()});
  const kernel=createKernelAdapters({moduleURL:'/runtime/arch-kernel.mjs',workerURL:'/bundle/engine-worker.mjs',
    selectRecipe:()=>{throw Error('Test does not substitute source geometry for a product');},
    textConfig:{catalog,assetURLs,origin:location.origin,runtime},createTextRenderer:createEngineTextRenderer({catalog})});
  const sources=createApplicationSources({kernel,catalog,assetURLs,origin:location.origin,context});
  const control=(operation,previous=state.content.app.source)=>({version,
    ticket:{id:'composition-'+ ++n,userId,projectId,revision:state.revision,generation:n},
    signal:new AbortController().signal,onProgress:()=>{},...(operation?{sourceContext:createSourceContext(operation,previous)}:{})});
  async function descriptor(result,file,c){
    const raw=await writer.addAsset(file.bytes,'source',records),hashes=[raw.hash];
    for(const a of result.assets??[])hashes.push((await writer.addAsset(a.bytes,a.kind,records)).hash);
    const raster=result.raster?await writer.rasterDescriptor(result.raster,records):null;
    const preview=result.preview?await writer.previewDescriptor(result.preview,records):null;
    if(raster)hashes.push(raster.rgba,raster.preview,raster.originalPreview);if(preview)hashes.push(preview.png);
    return {id:c.sourceContext.id,revision:c.sourceContext.revision,name:file.name,mediaType:file.mediaType,kind:result.kind,raw,
      assetHashes:[...new Set(hashes)],metadata:{...clone(result.metadata),sourceContext:clone(c.sourceContext)},...(raster?{raster}:{}),...(preview?{preview}:{})};
  }
  async function adopt(reply,file,c,{tamper=false}={}){
    const result=reply.result??reply,desc=await descriptor(result,file,c);
    if(reply.confirmation){
      sourcePreparation({control:c,confirmation:reply.confirmation,source:desc});
      const input={...c,confirmation:reply.confirmation,source:desc,assets:bytes(),acceptedAtRevision:state.revision+1};
      if(tamper){
        const bad=new Map(input.assets),b=bad.get(desc.raster.rgba).slice();b[0]^=255;bad.set(desc.raster.rgba,b);
        const rejected=await errorOf(()=>sources.source.acceptProposal({...input,assets:bad}));
        must(rejected==='SOURCE_ASSET_CHANGED'||rejected==='CONFIRMATION_ASSET_CHANGED','Changed render bytes must refuse: '+rejected);
        const oldProject=projectId;projectId='other-project';
        const stale=await errorOf(()=>sources.source.acceptProposal(input));projectId=oldProject;
        must(stale==='STALE_JOB','Cross-project acceptance must refuse: '+stale);
      }
      const receipt=await sources.source.acceptProposal(input);
      desc.metadata.confirmationReceipt=sourceReceipt(receipt,{control:c,confirmation:reply.confirmation,source:desc,acceptedAtRevision:state.revision+1});
    }
    state=clone(state);state.revision++;state.content.app.source=desc;state.sourceKind=desc.kind;
    if(result.materials){state.content.app.materials=clone(result.materials);state.content.app.materialDefaults=clone(result.materials);}
    state=validateState(state);return desc;
  }
  function fresh(){state=clone(initialState);for(const [id,value]of Object.entries({res:'360',k:2,smooth:0,minA:0,denoise:0,eps:0,tension:0,size:24}))state=setParameter(state,id,value);}
  try{
    for(const kind of ['svg','text','emoji']){
      fresh();let file,c=control('import'),reply;
      if(kind==='emoji'){
        const selected=await sources.source.selectEmoji({...c,id:'😀',collectionId:'noto-color-emoji'});file=selected.file;reply=selected.result;
      }else{
        file={name:kind==='svg'?'two-regions.svg':'vietnamese.txt',mediaType:kind==='svg'?'image/svg+xml':'text/plain',bytes:new TextEncoder().encode(kind==='svg'?svg:'Tiếng Việt Ấ ộ')};
        reply=await sources.source.ingest({...c,state:clone(state),file,purpose:'source'});
      }
      const original=await adopt(reply,file,c);must(!original.raster,'Original vector/text remains non-raster');
      c=control('convert');reply=await sources.source.convert({...c,target:'raster',source:clone(original),state:clone(state),assets:bytes()});
      must(reply.status==='proposal'&&reply.confirmation.kind===kind,'Typed exact render proposal');
      const rendered=await adopt(reply,file,c,{tamper:kind==='svg'}),renderApproval=rendered.metadata.confirmationReceipt.approvalHash;
      const check=control(),verified=await confirmedRender({state,source:rendered,assets:bytes(),c:check});
      must(verified.origin.confirmationId===renderApproval,'Actual persisted render consent');
      const forged=clone(rendered);delete forged.metadata.confirmationReceipt;
      must(await errorOf(()=>confirmedRender({state,source:forged,assets:bytes(),c:check}))==='SOURCE_RENDER_APPROVAL_REQUIRED','Missing consent refusal');
      const changed=clone(rendered);changed.metadata.preview.renderer.id='different-renderer';
      must(await errorOf(()=>confirmedRender({state,source:changed,assets:bytes(),c:check}))==='SOURCE_RENDER_PROVENANCE','Changed renderer refusal');
      const initialRefs=rendered.metadata.sourceConversion.assets.map(a=>a.sha256);
      // Explicit edit fixture preserves the initial refs. Real edit/history GC is
      // covered by the controller suite, separate from this adapter composition.
      const pixel=bytes().get(rendered.raster.rgba).slice();pixel[0]^=1;
      const edited=await writer.addAsset(pixel,'derived',records);state=clone(state);state.revision++;
      state.content.app.source.revision++;state.content.app.source.raster.rgba=edited.hash;state.content.app.source.assetHashes.push(edited.hash);
      c=control('convert');reply=await sources.source.convert({...c,target:'raster',source:clone(state.content.app.source),state:clone(state),assets:bytes()});
      must(reply.status==='proposal'&&reply.confirmation.kind==='raster','Segmentation has separate explicit consent');
      must(reply.result.metadata.rasterPreparation.options.alpha.policy==='threshold'&&reply.result.metadata.rasterPreparation.options.alpha.cutoff===128,'Versioned app alpha policy is captured in the proposal');
      must(reply.result.metadata.rasterPreparation.input.origin.confirmationId===renderApproval,'Segmentation keeps actual consent ID');
      const prepared=await adopt(reply,file,c);
      must(initialRefs.every(h=>prepared.assetHashes.includes(h)),'Original fonts, curves and rendered assets survive segmentation');
      const ready=await sources.raster.prepareRecipe({...control(),state:clone(state),assets:bytes()});
      must(ready.status==='ready'&&ready.sourceAssemblyRequired===true,'Source-only geometry is explicit');
      const parsed=validatePacket(ready.packet);must(parsed.summary.accepted&&parsed.summary.confirmedRender,'Replay uses accepted source');
      trace.push({kind,sourceId:prepared.id,sourceRevision:prepared.revision,rawHash:prepared.raw.hash,renderApproval,
        width:prepared.raster.width,height:prepared.raster.height,initialAssets:initialRefs.length,retained:initialRefs.every(h=>prepared.assetHashes.includes(h)),
        regions:parsed.summary.regions,materials:parsed.summary.materials,proposalHash:parsed.summary.proposalHash});
      must(await sha256(file.bytes)===prepared.raw.hash,'Original exact byte identity');
    }
    fresh();const rgba=new Uint8ClampedArray(24*20*4);for(let i=0;i<rgba.length;i+=4)rgba.set([30,120,230,255],i);
    const png=await encodeRasterPNG({width:24,height:20,data:rgba},{signal:new AbortController().signal});
    let c=control('import'),file={name:'actual.png',mediaType:'image/png',bytes:png};
    const rasterReply=await sources.source.ingest({...c,state:clone(state),purpose:'source',file});
    must(rasterReply.confirmation.kind==='raster','Encoded raster routed to real decoder');await adopt(rasterReply,file,c);
    const ready=await sources.raster.prepareRecipe({...control(),state:clone(state),assets:bytes()});must(ready.status==='ready','Encoded source replay');
    const rc=control(),client=await kernel.ensureRuntime(rc),epoch=client.epoch;
    const old=await sources.runtime.prepareRGBA({width:24,height:20,data:rgba,options:{smooth:0,minA:0,denoise:0,eps:0,tension:0}},rc);
    const oldHash=old.summary.proposalHash;client.terminate('TEST_SOURCE_RETIRE');const seq=client.requestSequence;
    const retiredCode=await errorOf(()=>sources.runtime.confirm(old,oldHash,control()));
    must(retiredCode==='RASTER_LEASE_RETIRED','Old root facade refused: '+retiredCode);
    await old.release();must(client.requestSequence===seq,'Retired lease does not restart Worker or mutate replacement');
    const replacement=await sources.runtime.prepareRGBA({width:24,height:20,data:rgba,options:{smooth:0,minA:0,denoise:0,eps:0,tension:0}},control());
    must(client.epoch>epoch&&replacement.summary.proposalHash===oldHash,'New epoch owns new source');
    await sources.reset();must(await errorOf(()=>replacement.copy())==='RASTER_LEASE_RETIRED','Private reset retires active source leases');
    const unapproved=await errorOf(()=>sources.raster.prepareRecipe({...control(),state:clone(state),assets:bytes()}));
    // Persisted exact receipts may replay after reset; this is only a smoke check.
    must(unapproved==='NO_ERROR','Persisted receipt replay after private cache reset: '+unapproved);
    return {status:'pass',scope:'Actual source adapter composition and receipt/lease boundaries; local fixture adoption, no UI/storage/product certification',trace,encodedRaster:true,retirement:true};
  }finally{await sources.reset();await kernel.reset();}
}
