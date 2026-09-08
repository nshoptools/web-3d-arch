import {effectiveValues,validateProject} from '../domain/index.mjs';
import {sha256,canonicalJSON,cloneJSON} from '../storage/common.mjs';
import {encodeRasterPNG} from '../core/png-encode.mjs';
import {RasterError,check,integer,record,normalizeOptions,normalizeLimits,validatePacket,bufferMap,hashBytes,freeze,readableSummary,equalBytes} from '../core/raster-schema.mjs';

const VERSION='arch-app-adapters/1', RECEIPT='arch-raster-receipt/1', CONFIRMATION='arch-raster-confirmation/1';
const SOURCE_CONTEXT='arch-source-context/1', SOURCE_METADATA_BYTES=65536;
function contextValue(value) {
  record(value,['version','operation','id','revision','predecessor'],'RASTER_SOURCE_CONTEXT');
  check(Object.keys(value).length===5&&value.version===SOURCE_CONTEXT&&['import','convert'].includes(value.operation),'RASTER_SOURCE_CONTEXT');
  const id=x=>check(typeof x==='string'&&x.length>0&&x.length<=200&&!/[\u0000-\u001f]/.test(x),'RASTER_SOURCE_CONTEXT');
  id(value.id);integer(value.revision,0,Number.MAX_SAFE_INTEGER,'RASTER_SOURCE_CONTEXT');
  const p=value.predecessor;
  if(p!==null){
    record(p,['id','revision','rawHash'],'RASTER_SOURCE_CONTEXT');
    check(Object.keys(p).length===3,'RASTER_SOURCE_CONTEXT');id(p.id);
    integer(p.revision,0,Number.MAX_SAFE_INTEGER,'RASTER_SOURCE_CONTEXT');hashBytes(p.rawHash);
  }
  if(value.operation==='import')check(value.revision===0&&(!p||p.id!==value.id),'RASTER_SOURCE_CONTEXT');
  else check(p&&p.id===value.id&&p.revision<Number.MAX_SAFE_INTEGER&&value.revision===p.revision+1,'RASTER_SOURCE_CONTEXT');
  return freeze(cloneJSON(value));
}
function preparationControl(c,operation) {
  check(c.sourceContext,'RASTER_SOURCE_CONTEXT_REQUIRED');
  const context=contextValue(c.sourceContext),current=c.state.content?.app?.source??null;
  check(context.operation===operation,'RASTER_SOURCE_CONTEXT');
  const predecessor=current?{id:current.id,revision:current.revision,rawHash:current.raw.hash}:null;
  check(same(context.predecessor,predecessor),'RASTER_SOURCE_CONTEXT');
  if(operation==='convert')check(current&&same(current,c.source),'RASTER_SOURCE_CONTEXT');
  return {...c,ticket:freeze(cloneJSON(c.ticket)),sourceContext:context};
}
function candidateContext(receipt,source,expected=source?.metadata?.sourceContext) {
  const context=contextValue(expected);
  check(source&&source.id===context.id&&source.revision===context.revision&&
    same(source.metadata?.sourceContext,context)&&same(receipt.context.sourceContext,context)&&
    receipt.context.sourceRevision===context.revision,'RASTER_SOURCE_CONTEXT');
  if(context.operation==='convert')check(source.raw.hash===context.predecessor.rawHash,'RASTER_SOURCE_CONTEXT');
}
const CATALOG_FIELDS=['k','res','smooth','minA','denoise','eps','tension'];
const controlCheck=c=>{check(c?.version===VERSION&&c.ticket&&typeof c.ticket.projectId==='string'&&c.signal&&typeof c.onProgress==='function','RASTER_CONTROL');check(!c.signal.aborted,'RASTER_CANCELLED');integer(c.ticket.revision,0,Number.MAX_SAFE_INTEGER,'RASTER_CONTROL');};
const same=(a,b)=>canonicalJSON(a)===canonicalJSON(b);
const assetsCheck=a=>check(a instanceof Map,'RASTER_ASSETS');
async function checkedAsset(assets,hash,byteLength=null) {
  hashBytes(hash);const b=assets.get(hash);check(b instanceof Uint8Array&&b.length<=64*1024*1024,'RASTER_ASSET_MISSING');
  const copy=b.slice();check(byteLength===null||copy.length===byteLength,'RASTER_ASSET_SIZE');check(await sha256(copy)===hash,'RASTER_ASSET_HASH');return copy;
}
function stateCheck(state,c) {check(state&&state.revision===c.ticket.revision,'RASTER_STATE_REQUIRED');validateProject(state);}
export function rasterOptionsForState(state,policy={}) {
  validateProject(state);
  check(policy&&Object.keys(policy).every(k=>['alpha','palette','backgroundLabels','limits'].includes(k)),'RASTER_POLICY');
  const values=effectiveValues(state),o={longEdgeMm:values.size};
  for(const k of CATALOG_FIELDS)o[k]=k==='res'?Number(values[k]):values[k];
  for(const k of ['alpha','palette','backgroundLabels'])if(Object.hasOwn(policy,k))o[k]=policy[k];
  return {options:normalizeOptions(o),limits:normalizeLimits(policy.limits??{})};
}
function receiptPayload(receipt) {
  check(receipt?.version===RECEIPT&&receipt.runtimeAbi===1&&receipt.documentSchema===2,'RASTER_RECEIPT_VERSION');
  const {approvalHash,...payload}=cloneJSON(receipt);hashBytes(approvalHash);return payload;
}
async function verifyReceipt(receipt,{requireContext=true}={}) {
  const payload=receiptPayload(receipt);check(new TextEncoder().encode(canonicalJSON(receipt)).length<=SOURCE_METADATA_BYTES,'RASTER_RECEIPT_BUDGET');check(await sha256(canonicalJSON(payload))===receipt.approvalHash,'RASTER_RECEIPT_HASH');
  check(receipt.context&&receipt.input&&receipt.previews&&receipt.summary,'RASTER_RECEIPT_SCHEMA');
  check(['encoded','rgba'].includes(receipt.input.mode)&&['raster','svg','text','emoji'].includes(receipt.input.originalKind),'RASTER_RECEIPT_SCHEMA');
  integer(receipt.context.baseRevision,0,Number.MAX_SAFE_INTEGER-1,'RASTER_RECEIPT_SCHEMA');
  integer(receipt.context.sourceRevision,0,Number.MAX_SAFE_INTEGER,'RASTER_RECEIPT_SCHEMA');
  if(requireContext||receipt.context.sourceContext){
    const context=contextValue(receipt.context.sourceContext);
    check(receipt.context.sourceRevision===context.revision&&
      receipt.input.mode===(context.operation==='import'?'encoded':'rgba')&&
      receipt.input.parentSourceRevision===(context.predecessor?.revision??null),'RASTER_SOURCE_CONTEXT');
    if(context.operation==='convert')check(receipt.input.originalHash===context.predecessor.rawHash,'RASTER_SOURCE_CONTEXT');
  }
  integer(receipt.input.width,1,32768,'RASTER_RECEIPT_SCHEMA');integer(receipt.input.height,1,32768,'RASTER_RECEIPT_SCHEMA');
  check(receipt.input.width*receipt.input.height<=4194304,'RASTER_RECEIPT_SCHEMA');
  integer(receipt.input.originalByteLength,1,67108864,'RASTER_RECEIPT_SCHEMA');
  check(typeof receipt.context.projectId==='string'&&receipt.context.projectId.length<=200,'RASTER_RECEIPT_SCHEMA');
  hashBytes(receipt.proposalHash);hashBytes(receipt.input.originalHash);hashBytes(receipt.input.rgbaHash);
  normalizeOptions(receipt.options);normalizeLimits(receipt.limits);
  check(await sha256(canonicalJSON({options:receipt.options,limits:receipt.limits,origin:receipt.input.origin}))===receipt.settingsHash,'RASTER_SETTINGS_HASH');
  check(Array.isArray(receipt.buffers)&&receipt.buffers.length===30&&receipt.buffers.every((r,i)=>r.kind===i+2),'RASTER_RECEIPT_BUFFERS');
  for(const row of receipt.buffers){hashBytes(row.hash);integer(row.byteLength,0,64*1024*1024,'RASTER_RECEIPT_BUFFERS');}
  return receipt;
}
async function verifyStoredBuffers(receipt,assets) {
  let total=0;const buffers=[];
  for(const row of receipt.buffers){total+=row.byteLength;check(total<=64*1024*1024,'RASTER_OUTPUT_BUDGET');buffers.push({kind:row.kind,bytes:await checkedAsset(assets,row.hash,row.byteLength)});}
  if(receipt.input.lineage){
    await checkedAsset(assets,receipt.input.lineage.initialRGBAHash);
    await checkedAsset(assets,receipt.input.lineage.initialPreviewHash);
  }
  return buffers;
}
function confirmationFor(receipt) {return {kind:'raster',version:CONFIRMATION,approvalHash:receipt.approvalHash,proposalHash:receipt.proposalHash};}
function changesFor(readable) {
  const changes=['Prepare material regions from pixels using '+readable.semantics+'. Confirm this exact derived geometry before manufacturing.'];
  changes.push(...readable.confirmationReasons.map(x=>x.slice(0,1500)));
  changes.push('Processing pixel size is not printer accuracy. Original bytes and editable pre-processing RGBA are retained.');
  return [...new Set(changes)].slice(0,40);
}
function stableSummary(s,m) {
  const r=readableSummary(s,m);const {accepted,status,...rest}=r;return rest;
}
function materialViews(bytes) {
  const a=new Uint32Array(bytes.buffer,bytes.byteOffset,bytes.length/4),result=[];
  for(let i=0;i<a.length;i+=6)if(a[i+4]||a[i+5]){
    const rgba=a[i+1];result.push({id:'raster-label-'+a[i],label:'Material '+a[i],slot:null,role:'region',overridden:false,backgroundEligible:true,excluded:false,color:'#'+[rgba&255,rgba>>>8&255,rgba>>>16&255].map(n=>n.toString(16).padStart(2,'0')).join('')});
  }
  return result;
}
/**
 * Source adapter for contracts-v0.3 (version tag remains /1). The runtime is an
 * injected facade over the parent's existing root Worker, not a module factory.
 * ingest requires the additive frozen state argument. acceptProposal must be
 * called only from the controller's verified, explicit proposal approval path.
 */
export function createRasterAdapters({runtime,encodePNG=encodeRasterPNG,processingPolicy=()=>({}),renderSource=null}) {
  check(runtime?.version==='arch-raster-operations/1'&&typeof encodePNG==='function'&&typeof processingPolicy==='function','RASTER_ADAPTER_BINDING');
  let epoch=1;
  const guard=(e,c)=>{check(epoch===e,'RASTER_PRIVATE_RESET');controlCheck(c);};
  function policyFor(state) {return rasterOptionsForState(state,processingPolicy({state}));}
  async function finishProposal({lease,c,state,input,originalBytes,sourceKind,sourceMetadata={},settings,e}) {
    let packet;
    try{packet=await lease.copy();}finally{await lease.release();}
    guard(e,c);const parsed=validatePacket(packet),s=parsed.summary,m=parsed.metadata,b=bufferMap(packet);
    check(equalBytes(originalBytes,input.mode==='encoded'?b.get(2):originalBytes),'RASTER_ORIGINAL_CHANGED');
    const originalHash=await sha256(originalBytes),originalRGBAHash=await sha256(b.get(3));
    check(originalRGBAHash===s.originalRGBAHash,'RASTER_RGBA_HASH');
    if(input.mode==='encoded')check(originalHash===s.sourceHash,'RASTER_ORIGINAL_CHANGED');
    const rgba=new Uint8ClampedArray(b.get(3).slice().buffer),pixelSizeMm=Math.max(s.widthMm,s.heightMm)/Math.max(s.inputWidth,s.inputHeight);
    const originalPNG=await encodePNG({width:s.inputWidth,height:s.inputHeight,data:rgba},{signal:c.signal});
    const processedPNG=await encodePNG({width:s.width,height:s.height,data:new Uint8ClampedArray(b.get(5).slice().buffer)},{signal:c.signal});
    guard(e,c);
    for(const [png,w,h] of [[originalPNG,s.inputWidth,s.inputHeight],[processedPNG,s.width,s.height]]) {
      check(png instanceof Uint8Array&&png.length>=33&&png.length<=33554432,'RASTER_PNG_BUDGET');
      const header=new DataView(png.buffer,png.byteOffset,png.byteLength);
      check([137,80,78,71,13,10,26,10].every((x,i)=>png[i]===x)&&header.getUint32(8)===13&&header.getUint32(12)===0x49484452&&header.getUint32(16)===w&&header.getUint32(20)===h,'RASTER_PNG_SCHEMA');
    }
    const previewHashes={original:await sha256(originalPNG),processed:await sha256(processedPNG),
      processedTransform:{width:s.width,height:s.height,mmPerPixelX:s.mmPerPixelX,mmPerPixelY:s.mmPerPixelY,domain:'final-label-grid-preview-not-smoothed-geometry'}};
    const buffers=[],assets=[];
    for(let kind=2;kind<=31;kind++){const bytes=b.get(kind),hash=await sha256(bytes);buffers.push({kind,hash,byteLength:bytes.length});assets.push({kind:'derived',bytes});}
    for(const bytes of input.lineageBytes??[])assets.push({kind:'derived',bytes:bytes.slice()});
    assets.push({kind:'source',bytes:originalBytes.slice()},{kind:'derived',bytes:originalPNG.slice()},{kind:'derived',bytes:processedPNG.slice()});
    check(assets.reduce((sum,a)=>sum+a.bytes.byteLength,0)<=134217728,'RASTER_SOURCE_RESULT_BUDGET');
    const payload={version:RECEIPT,runtimeAbi:1,documentSchema:2,semantics:m.semantics,
      context:{projectId:c.ticket.projectId,baseRevision:state.revision,sourceRevision:c.sourceContext.revision,sourceContext:cloneJSON(c.sourceContext)},
      input:{mode:input.mode,parentSourceRevision:c.sourceContext.predecessor?.revision??null,lineage:input.lineage??{initialRGBAHash:originalRGBAHash,initialPreviewHash:previewHashes.original,parentRGBAHash:null,parentPreparationHash:null,renderOrigin:input.origin??null},originalHash,originalByteLength:originalBytes.length,originalKind:sourceKind,rgbaHash:originalRGBAHash,width:s.inputWidth,height:s.inputHeight,origin:input.origin??null},
      options:parsed.options,limits:parsed.limits,settingsHash:await sha256(canonicalJSON({options:parsed.options,limits:parsed.limits,origin:input.origin??null})),proposalHash:s.proposalHash,buffers,previews:previewHashes,
      summary:stableSummary(s,m)};
    const receipt={...payload,approvalHash:await sha256(canonicalJSON(payload))};
    guard(e,c);
    const {confirmationReceipt:_oldApproval,rasterReceipt:_legacyApproval,rasterPreparation:_oldPreparation,sourceContext:_oldContext,...preservedMetadata}=cloneJSON(sourceMetadata);
    const metadata={...preservedMetadata,sourceContext:cloneJSON(c.sourceContext),rasterPreparation:receipt};
    check(new TextEncoder().encode(canonicalJSON(metadata)).length<=SOURCE_METADATA_BYTES,'RASTER_SOURCE_METADATA_BUDGET');
    const result={version:VERSION,ticket:cloneJSON(c.ticket),kind:sourceKind,metadata,
      assets,materials:materialViews(b.get(7)),
      // Editable raster and its PNG both represent the same original, oriented RGBA.
      raster:{width:s.inputWidth,height:s.inputHeight,data:rgba,pixelSizeMm,preview:originalPNG,previewMediaType:'image/png'},
      ...(Math.abs(s.mmPerPixelX-s.mmPerPixelY)<=1e-12*Math.max(s.mmPerPixelX,s.mmPerPixelY)?
        {preview:{width:s.width,height:s.height,pixelSizeMm:s.mmPerPixelX,png:processedPNG,mediaType:'image/png'}}:{})};
    return {status:'proposal',result,changes:changesFor(readableSummary(s,m)),confirmation:confirmationFor(receipt)};
  }
  async function makeEncoded(c,state,bytes,settings) {
    const e=epoch,input=bytes.slice(),lease=await runtime.prepareEncoded({bytes:input,...settings},c);
    return finishProposal({lease,c,state,input:{mode:'encoded'},originalBytes:input,sourceKind:'raster',settings,e});
  }
  async function makeRGBA(c,state,source,assets,settings) {
    const e=epoch;assetsCheck(assets);const originalBytes=await checkedAsset(assets,source.raw.hash,source.raw.byteLength);
    let raster,origin,lineage=null,lineageBytes=[];
    // Keep only the original approved render dependencies, not every intermediate
    // segmentation packet. Current document references must survive history GC.
    const conversion=source.metadata?.sourceConversion;
    if(conversion){
      const {approvalHash,...payload}=conversion;
      check(await sha256(canonicalJSON(payload))===approvalHash,'RASTER_RENDER_PREPARATION_CHANGED');
      check(Array.isArray(conversion.assets)&&conversion.assets.length>0&&conversion.assets.length<=256,'RASTER_RENDER_ASSET_BUDGET');
      let total=0;
      for(const ref of conversion.assets){
        integer(ref.bytes,1,67108864,'RASTER_RENDER_ASSET_BUDGET');total+=ref.bytes;
        check(total<=134217728&&source.assetHashes.includes(ref.sha256),'RASTER_RENDER_ASSET_BUDGET');
        lineageBytes.push(await checkedAsset(assets,ref.sha256,ref.bytes));
      }
    }
    if(source.raster) {
      const r=source.raster,data=await checkedAsset(assets,r.rgba);
      raster={width:r.width,height:r.height,data:new Uint8ClampedArray(data.buffer)};
      const previous=source.metadata?.rasterPreparation;
      if(previous) {
        await verifyReceipt(previous,{requireContext:false});
        origin=previous.input.origin??null;
        const first=previous.input.lineage??{initialRGBAHash:previous.input.rgbaHash,initialPreviewHash:previous.previews.original,renderOrigin:origin};
        lineage={initialRGBAHash:first.initialRGBAHash,initialPreviewHash:first.initialPreviewHash,parentRGBAHash:previous.input.rgbaHash,parentPreparationHash:previous.approvalHash,renderOrigin:first.renderOrigin??origin};
        lineageBytes.push(await checkedAsset(assets,lineage.initialRGBAHash),await checkedAsset(assets,lineage.initialPreviewHash));
      }else{
        origin=source.metadata?.renderProvenance?cloneJSON(source.metadata.renderProvenance):null;
        if(!origin&&source.kind!=='raster'&&typeof renderSource==='function'){
          const rendered=await renderSource({state,source:cloneJSON(source),assets,c});
          check(rendered?.data instanceof Uint8ClampedArray&&rendered.width===r.width&&rendered.height===r.height&&
            equalBytes(new Uint8Array(rendered.data.buffer,rendered.data.byteOffset,rendered.data.byteLength),data),'RASTER_RENDER_CHANGED');
          origin=cloneJSON(rendered.origin);
          if(rendered.lineage){
            lineage=cloneJSON(rendered.lineage);
            lineageBytes.push(await checkedAsset(assets,lineage.initialRGBAHash),await checkedAsset(assets,lineage.initialPreviewHash));
          }
        }
      }
      if(source.kind!=='raster')check(origin,'RASTER_RENDER_CONFIRMATION_REQUIRED');
    }else{
      check(typeof renderSource==='function','RASTER_CONFIRMED_RENDER_REQUIRED');
      const rendered=await renderSource({state,source:cloneJSON(source),assets,c});
      check(rendered?.data instanceof Uint8ClampedArray&&rendered.origin,'RASTER_RENDER_CONFIRMATION_REQUIRED');
      raster={width:rendered.width,height:rendered.height,data:new Uint8ClampedArray(rendered.data)};
      origin=cloneJSON(rendered.origin);
    }
    if(origin)check(origin.sourceHash===source.raw.hash,'RASTER_RENDER_ORIGIN');
    guard(e,c);const lease=await runtime.prepareRGBA({...raster,origin,...settings},c);
    return finishProposal({lease,c,state,input:{mode:'rgba',origin,lineage,lineageBytes},originalBytes,sourceKind:source.kind,sourceMetadata:source.metadata??{},settings,e});
  }
  async function replay(c,receipt,source,assets) {
    candidateContext(receipt,source);
    const raw=await checkedAsset(assets,receipt.input.originalHash,receipt.input.originalByteLength);
    const rgba=await checkedAsset(assets,receipt.input.rgbaHash,receipt.input.width*receipt.input.height*4);
    check(source.kind===receipt.input.originalKind&&source.raw.hash===receipt.input.originalHash&&source.raw.byteLength===receipt.input.originalByteLength&&source.revision===receipt.context.sourceRevision&&source.raster?.rgba===receipt.input.rgbaHash&&source.raster.width===receipt.input.width&&source.raster.height===receipt.input.height,'RASTER_RECEIPT_STALE');
    const expectedPixelSize=Math.max(receipt.summary.widthMm,receipt.summary.heightMm)/Math.max(receipt.input.width,receipt.input.height);
    check(source.raster.pixelSizeMm===expectedPixelSize,'RASTER_RECEIPT_STALE');
    const settings={options:receipt.options,limits:receipt.limits};
    const lease=receipt.input.mode==='encoded'?await runtime.prepareEncoded({bytes:raw,...settings},c):await runtime.prepareRGBA({data:rgba,width:receipt.input.width,height:receipt.input.height,origin:receipt.input.origin,...settings},c);
    try {
      check(lease.summary.proposalHash===receipt.proposalHash,'RASTER_PROPOSAL_CHANGED');
      const packet=await lease.copy(),b=bufferMap(packet);
      for(const row of receipt.buffers)check(await sha256(b.get(row.kind))===row.hash,'RASTER_DERIVED_CHANGED');
      return lease;
    }catch(error){await lease.release();throw error;}
  }
  const source={
    version:VERSION,capabilities:[{id:'source.raster',available:true},{id:'source.convert-raster',available:true}],
    async ingest(c) {
      controlCheck(c);stateCheck(c.state,c);check(c.purpose==='source'&&c.file?.bytes instanceof Uint8Array,'RASTER_SOURCE_PURPOSE');
      c=preparationControl(c,'import');
      c.onProgress({stage:'raster-prepare',progress:null});
      return makeEncoded(c,c.state,c.file.bytes,policyFor(c.state));
    },
    async convert(c) {
      controlCheck(c);stateCheck(c.state,c);check(c.target==='raster'&&c.source,'RASTER_CONVERSION_TARGET');
      c=preparationControl(c,'convert');
      c.onProgress({stage:'raster-prepare',progress:null});
      return makeRGBA(c,c.state,c.source,c.assets,policyFor(c.state));
    },
    /** The caller has already verified pending proposal, head CAS and explicit consent.
     * Without a consumer, returns the unchanged generic acceptance envelope.
     * A consumer borrows the exact accepted native source until its promise settles.
     */
    async acceptProposal(c,consume=null) {
      check(consume===null||typeof consume==='function','RASTER_SOURCE_CONSUMER');
      controlCheck(c);c={...c,ticket:freeze(cloneJSON(c.ticket)),confirmation:freeze(cloneJSON(c.confirmation)),source:freeze(cloneJSON(c.source)),sourceContext:contextValue(c.sourceContext)};const e=epoch;
      check(c.confirmation?.kind==='raster'&&c.confirmation.version===CONFIRMATION,'RASTER_CONFIRMATION_REQUIRED');
      const receipt=cloneJSON(await verifyReceipt(c.source?.metadata?.rasterPreparation));
      candidateContext(receipt,c.source,c.sourceContext);
      check(receipt.context.projectId===c.ticket.projectId&&receipt.context.baseRevision===c.ticket.revision,'RASTER_CONFIRMATION_CONTEXT');
      integer(c.acceptedAtRevision,c.ticket.revision+1,c.ticket.revision+1,'RASTER_CONFIRMATION_CONTEXT');
      check(same(confirmationFor(receipt),c.confirmation),'RASTER_CONFIRMATION_MISMATCH');
      assetsCheck(c.assets);await verifyStoredBuffers(receipt,c.assets);
      await checkedAsset(c.assets,receipt.previews.original);await checkedAsset(c.assets,receipt.previews.processed);
      guard(e,c);const prepared=await replay(c,receipt,c.source,c.assets);let accepted;
      try {
        guard(e,c);accepted=await runtime.confirm(prepared,receipt.proposalHash,c);guard(e,c);
        check(accepted.summary.accepted&&accepted.summary.proposalHash===receipt.proposalHash,'RASTER_CONFIRMATION_MISMATCH');
        const approval={kind:'raster',version:'arch-source-confirmation-receipt/1',approvalHash:receipt.approvalHash,proposalHash:receipt.proposalHash,sourceHash:receipt.input.originalHash,rgbaHash:receipt.input.rgbaHash,settingsHash:receipt.settingsHash,projectId:c.ticket.projectId,sourceRevision:receipt.context.sourceRevision,acceptedAtRevision:c.acceptedAtRevision};
        const answer=freeze({version:VERSION,ticket:cloneJSON(c.ticket),confirmation:cloneJSON(c.confirmation),receipt:approval});
        if(!consume)return answer;
        check(typeof runtime.productSource==='function','RASTER_PRODUCT_TRANSPORT_REQUIRED');
        const packet=await accepted.copy();validatePacket(packet);guard(e,c);
        // Keep both native readers live through the awaited consumer. Product
        // adoption retains its own planar authority before returning a proposal;
        // that separate owner can survive this borrow without replaying pixels.
        const result=await consume({...answer,status:'ready',kind:'raster-source-geometry',
          sourceAssemblyRequired:true,coordinateKind:28,unitMm:0.000001,packet,
          preparation:freeze(cloneJSON(receipt)),nativeSource:runtime.productSource(accepted)});
        try{guard(e,c);}catch(error){if(typeof result?.release==='function')await result.release();throw error;}
        return result;
      }finally{try{await accepted?.release();}finally{await prepared.release();}}
    },
    /** Ready geometry is owned typed buffers, including exact indexed kind28.
     * Changed/unapproved input returns a source proposal, never an unapproved model.
     */
    async prepareRecipe(c,consume=null) {
      check(consume===null||typeof consume==='function','RASTER_SOURCE_CONSUMER');
      controlCheck(c);stateCheck(c.state,c);assetsCheck(c.assets);
      const e=epoch,src=c.state.content?.app?.source;check(src?.raster,'RASTER_SOURCE_REQUIRED');
      const stored=src.metadata?.rasterPreparation?cloneJSON(src.metadata.rasterPreparation):null,settings=policyFor(c.state);
      let compatible=false;
      if(stored){
        await verifyReceipt(stored,{requireContext:false});
        compatible=!!stored.context.sourceContext&&same(stored.context.sourceContext,src.metadata?.sourceContext)&&stored.context.sourceContext.id===src.id&&stored.context.projectId===c.ticket.projectId&&stored.context.sourceRevision===src.revision&&stored.input.originalHash===src.raw.hash&&stored.input.rgbaHash===src.raster.rgba&&same(stored.options,settings.options)&&same(stored.limits,settings.limits);
      }
      guard(e,c);const acceptance=src.metadata?.confirmationReceipt;
      if(!compatible||!acceptance){
        if(!c.sourceContext)throw new RasterError('RASTER_SOURCE_CONVERSION_REQUIRED','Controller must reserve a convert SourceContext before preparing changed or unapproved raster.',{operation:'convert',sourceId:src.id,sourceRevision:src.revision});
        const prepare=preparationControl({...c,source:src},'convert');
        return {status:'proposal',sourceProposal:await makeRGBA(prepare,c.state,src,c.assets,settings)};
      }
      check(acceptance.kind==='raster'&&acceptance.version==='arch-source-confirmation-receipt/1'&&acceptance.sourceHash===stored.input.originalHash&&acceptance.rgbaHash===stored.input.rgbaHash&&acceptance.settingsHash===stored.settingsHash&&acceptance.approvalHash===stored.approvalHash&&acceptance.proposalHash===stored.proposalHash&&acceptance.projectId===c.ticket.projectId&&acceptance.sourceRevision===src.revision&&Number.isSafeInteger(acceptance.acceptedAtRevision)&&acceptance.acceptedAtRevision===stored.context.baseRevision+1&&acceptance.acceptedAtRevision<=c.state.revision,'RASTER_CONFIRMATION_STALE');
      await verifyStoredBuffers(stored,c.assets);guard(e,c);
      const prepared=await replay(c,stored,src,c.assets);let accepted;
      try{
        // Replay of persisted, exact consent; no new processing proposal is approved here.
        accepted=await runtime.confirm(prepared,stored.proposalHash,c);guard(e,c);
        const packet=await accepted.copy();validatePacket(packet);guard(e,c);
        const ready={status:'ready',kind:'raster-source-geometry',sourceAssemblyRequired:true,coordinateKind:28,unitMm:0.000001,packet,receipt:freeze(cloneJSON(acceptance)),preparation:freeze(cloneJSON(stored))};
        if(consume){
          check(typeof runtime.productSource==='function','RASTER_PRODUCT_TRANSPORT_REQUIRED');
          // Keep the accepted native source alive until the parent has consumed
          // it in a product build. A failed/cancelled consumer releases both
          // readers below; its separately owned finished snapshot can outlive us.
          const result=await consume({...ready,nativeSource:runtime.productSource(accepted)});
          try{guard(e,c);}catch(error){if(typeof result?.release==='function')await result.release();throw error;}
          return result;
        }
        return ready;
      }finally{await accepted?.release();await prepared.release();}
    },
    async reset(options={}){epoch++;await runtime.reset(options);}
  };
  return {source,async reset(options={}){await source.reset(options);}};
}

/** Moderate-level recipe helper: assembly is injected and must validate mechanics.
 * This function never substitutes a flat raster extrusion for a finished product.
 */
export function createRasterRecipeHelper({source,assemble}) {
  check(source?.prepareRecipe&&typeof assemble==='function','RASTER_ASSEMBLY_BINDING');
  return async c=>{
    const prepared=await source.prepareRecipe(c);
    if(prepared.status==='proposal')return prepared;
    const {summary,metadata}=validatePacket(prepared.packet),b=bufferMap(prepared.packet);
    const geometry={version:'arch-raster-geometry/1',sourceAssemblyRequired:true,coordinateKind:28,unitMm:0.000001,proposalHash:summary.proposalHash,
      xyNm:new BigInt64Array(b.get(28).buffer),edges:new Uint32Array(b.get(12).buffer),loops:new Uint32Array(b.get(13).buffer),indices:new Uint32Array(b.get(14).buffer),
      palette:new Uint32Array(b.get(7).buffer),labels:new Uint16Array(b.get(6).buffer),curves:new BigInt64Array(b.get(17).buffer),
      packet:prepared.packet,summary,metadata,receipt:prepared.receipt};
    return assemble({state:c.state,assets:c.assets,geometry,control:c});
  };
}
