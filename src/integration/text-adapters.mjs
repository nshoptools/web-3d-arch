import {artifactHash} from '../input/index.mjs';
const CONFIRMATION='arch-text-confirmation/1';
const confirmationFor=p=>({kind:p.kind,version:CONFIRMATION,approvalHash:p.approvalHash,proposalHash:p.receipt.proposalHash});
const byteMap=input=>{requireValue(input instanceof Map&&input.size<=10000,'TEXT_ASSET_MAP');return input;};
async function checkedAsset(map,digest,size){
  const raw=map.get(digest);requireValue(raw instanceof Uint8Array&&raw.buffer instanceof ArrayBuffer,'CONFIRMATION_ASSET_MISSING');
  requireValue(raw.length===size&&await hash(raw)===digest,'CONFIRMATION_ASSET_CHANGED');
}

import {APP_VERSION,checkedTicket,sameTicket,checkControl,copy,requireValue,fail} from './source-catalog.mjs';
import {ownedBytes,hash} from '../input/source-contract.mjs';
import {parseDecimal,quantizeDecimal} from '../domain/decimal.mjs';
const utf8=new TextEncoder();
const fileName=value=>{requireValue(typeof value==='string'&&value.length>0&&value.length<=240&&!/[\\/\u0000-\u001f]/u.test(value),'FILE_NAME');return value;};
/** Use in the parent text.update hook. sizeMm stays canonical when only the display unit changes. */
export function normalizeTextEdit(previous,patch){
  const t={...copy(previous),...copy(patch)};requireValue(['mm','pt'].includes(t.sizeUnit),'TEXT_SIZE_UNIT');
  let mm=parseDecimal(t.sizeMm).value;
  if(Object.hasOwn(patch,'sizeDisplay')&&!Object.hasOwn(patch,'sizeMm')){
    const display=parseDecimal(patch.sizeDisplay).value;
    mm=quantizeDecimal(String(t.sizeUnit==='pt'?display*25.4/72:display),'0.000001','nearest-ties-even');
  }
  requireValue(mm>=.001&&mm<=1000,'TEXT_SIZE_RANGE');t.sizeMm=String(mm);
  t.sizeDisplay=String(quantizeDecimal(String(t.sizeUnit==='pt'?mm*72/25.4:mm),'0.000001','nearest-ties-even'));
  return t;
}
/** Only source dependencies cross the text RPC; mesh/history buffers never ride along. */
export function collectTextAssets(state,assetsMap){
  requireValue(assetsMap instanceof Map,'TEXT_ASSET_MAP');
  const a=state?.content?.app;requireValue(a?.text,'TEXT_STATE');
  const keys=new Set(a.source?.assetHashes??[]);
  if(a.text.fontId.startsWith('imported:'))keys.add(a.text.fontId.slice(9));
  const fontRecord=state.provenance?.inputFonts?.[a.text.fontId.slice(9)];if(fontRecord)keys.add(fontRecord.sha256);
  requireValue(keys.size<=256,'TEXT_ASSET_MAP');const result=new Map();let bytes=0;
  for(const key of keys)if(assetsMap.has(key)){
    const source=assetsMap.get(key);requireValue(source instanceof Uint8Array,'TEXT_ASSET_BYTES');bytes+=source.length;
    requireValue(bytes<=128*1024*1024,'TEXT_ASSET_BUDGET');result.set(key,new Uint8Array(source));
  }
  return result;
}
/** Concrete SourceAdapter extension. invoke delegates to the parent's existing engine transport.
 * @param {import('../../docs/text-app/API.mjs').TextAdapterOptions} options
 * @returns {import('../../docs/text-app/API.mjs').TextAdapter}
 */
export function createTextAdapters({catalog,invoke,context}){
  requireValue(catalog&&typeof catalog.font==='function'&&typeof invoke==='function'&&typeof context==='function','TEXT_ADAPTER_OPTIONS');
  let epoch=0,disposed=false,pending=null;
  const ctx=()=>{requireValue(!disposed,'TEXT_ADAPTER_DISPOSED');const c=context();requireValue(c?.state&&c.assetsMap instanceof Map,'TEXT_CONTEXT');return c;};
  function restoreFonts(c){
    for(const digest of c.state.content?.app?.fontAssets??[]){
      const stored=c.state.provenance?.inputFonts?.[digest],record=stored?.font??stored;if(record)catalog.registerImported(record);
    }
  }
  function publication(control,start){
    requireValue(!disposed&&epoch===start,'TEXT_ADAPTER_RESET');checkControl(control);
    requireValue(ctx().state.revision===control.ticket.revision,'STALE_JOB');
  }
  async function call(op,control,extra={},withState=true){
    checkControl(control);requireValue(!disposed,'TEXT_ADAPTER_DISPOSED');
    const start=epoch,c=withState?ctx():null;
    if(op!=='source.confirm')pending=null;
    const request={version:APP_VERSION,ticket:copy(control.ticket),op,...(c?{state:copy(c.state),assetsMap:collectTextAssets(c.state,c.assetsMap)}:{}),...extra};
    if(c)requireValue(c.state.revision===control.ticket.revision,'STATE_TICKET_REVISION');
    const result=await invoke(request,control);
    requireValue(!disposed&&start===epoch,'TEXT_ADAPTER_RESET');if(control.signal.aborted)fail('CANCELLED');
    requireValue(result?.version===APP_VERSION&&sameTicket(result.ticket,control.ticket),'ADAPTER_TICKET');
    if(c){const now=ctx();requireValue(now.state.revision===control.ticket.revision,'STALE_JOB');}
    return result;
  }
  async function asSource(response,kind,{conversion=false,source}={}){
    const p=response.prepared,assets=p.sourceAssets.map(a=>({kind:'dependency',bytes:new Uint8Array(a.bytes)}));
    let numericSvgHash=null;
    if(p.svg){numericSvgHash=await hash(p.svg);assets.push({kind:'derived',bytes:new Uint8Array(p.svg)});}
    const metadata={adapter:'arch-text-operations/1',...(response.sourceContext?{sourceContext:copy(response.sourceContext)}:{}),artifactHash:p.artifactHash,claims:copy(p.claims),
      sourceRecords:p.sourceAssets.map(a=>copy(a.record)),selection:copy(p.selection??null),
      originalText:p.geometry?.text?.originalText??p.selection?.originalText??null,
      normalizedText:p.geometry?.text?.text??p.selection?.canonicalText??null,
      numericSvgHash,svgExport:copy(p.svgExport??null),parameters:copy(response.parameters),assembly:copy(response.assembly),
      preview:response.preview?{sha256:response.preview.sha256,pixelToSourceMm:copy(response.preview.pixelToSourceMm),renderer:copy(response.preview.renderer)}:null,
      rendererGap:p.preview?.status==='renderer-gap'?copy(p.preview):null,previewDiagnostic:copy(response.previewDiagnostic??null),
      sourceConversion:copy(response.conversion??null)};
    const result={version:APP_VERSION,ticket:copy(response.ticket),kind,metadata,assets};
    if(response.preview){const v=response.preview;result.preview={width:v.width,height:v.height,pixelSizeMm:v.pixelSizeMm,png:new Uint8Array(v.png),mediaType:'image/png'};}
    if(conversion){
      requireValue(response.preview&&response.conversion?.status==='proposal','SOURCE_CONVERSION_PROPOSAL');
      const v=response.preview;result.raster={width:v.width,height:v.height,data:new Uint8ClampedArray(v.data),pixelSizeMm:v.pixelSizeMm,preview:new Uint8Array(v.png),previewMediaType:'image/png'};
      const original=copy(source.raw);
      const references=[{sha256:original.hash,bytes:original.byteLength},...response.prepared.sourceAssets.map(a=>({sha256:a.record.sha256,bytes:a.bytes.length})),
        ...(result.metadata.numericSvgHash?[{sha256:result.metadata.numericSvgHash,bytes:response.prepared.svg.length}]:[]),
        {sha256:v.sha256,bytes:v.data.length},{sha256:await hash(v.png),bytes:v.png.length}];
      const payload={version:'arch-text-preparation/1',kind,status:'proposal',sourceContext:copy(response.sourceContext),receipt:copy(response.conversion.receipt),original,
        assets:[...new Map(references.map(a=>[a.sha256,a])).values()],renderer:copy(response.preview.renderer),details:copy(response.conversion.details),
        settingsHash:await artifactHash({parameters:response.parameters,assembly:response.assembly,geometryOptions:p.geometry?.options??null}),
        raster:{width:v.width,height:v.height,pixelSizeMm:v.pixelSizeMm,sha256:v.sha256,pngHash:await hash(v.png)}};
      const preparation={...payload,approvalHash:await artifactHash(payload)},confirmation=confirmationFor(preparation);
      result.metadata.sourceConversion=copy(preparation);
      pending={preparation:copy(preparation),confirmation:copy(confirmation)};
      return {status:'proposal',result,confirmation,changes:[
        'Chuyển nguồn đã giữ thành ảnh '+v.width+'×'+v.height+' điểm (sRGB, RGBA8) để sửa.',
        'Giữ nguyên byte gốc, chữ, hash của font/hình và các bản ghi biến thể.',
        'Lấy mẫu có thể làm đổi chi tiết nhỏ; việc giảm màu vật liệu và độ chính xác chế tạo chưa được kiểm chứng.',
      ]};
    }
    return result;
  }
  return Object.freeze({
    version:APP_VERSION,
    capabilities:[{id:'source.text',available:true},{id:'source.font-import',available:true},{id:'source.emoji',available:true}],
    async queryFonts(query=''){const c=ctx();restoreFonts(c);return catalog.queryFonts(query);},
    async queryEmoji(query='',collectionId,offset=0){ctx();return catalog.queryEmoji(query,collectionId,offset);},
    async ingest(input){
      checkControl(input);fileName(input.file?.name);const file={name:input.file.name,mediaType:input.file.mediaType,bytes:ownedBytes(input.file.bytes,input.purpose==='font'?16000000:64000)};
      if(input.purpose==='font'){
        const response=await call('font.import',input,{file},false);catalog.registerImported(response.font);
        return {version:APP_VERSION,ticket:copy(input.ticket),kind:'text',metadata:copy(response.metadata)};
      }
      requireValue(input.purpose==='source'&&(file.mediaType==='text/plain'||/\.txt$/i.test(file.name)),'SOURCE_FORMAT_UNSUPPORTED');
      const start=epoch,c=ctx(),state=input.state??c.state;
      const response=await call('text.import',input,{file,state:copy(state),sourceContext:copy(input.sourceContext),assetsMap:collectTextAssets(state,c.assetsMap)});
      const result=await asSource(response,'text');publication(input,start);return result;
    },
    async selectEmoji(input){
      const start=epoch;const response=await call('emoji.select',input,{id:input.id,collectionId:input.collectionId,sourceContext:copy(input.sourceContext)});
      const s=response.prepared.selection,record=response.prepared.sourceAssets[0].record;
      const descriptor={version:'arch-emoji-selection/1',collectionId:s.collectionId,id:s.item.id,originalText:s.originalText,sourceKind:s.sourceKind,sourceHash:record.sha256};
      const bytes=utf8.encode(JSON.stringify(descriptor));
      const result=await asSource(response,'emoji');publication(input,start);
      return {file:{name:'emoji-'+s.collectionId+'-'+s.item.id+'.arch-emoji.json',mediaType:'application/vnd.web-3d-arch.emoji+json',bytes},
        result};
    },
    async convert(input){
      requireValue(input.target==='raster'&&['text','emoji'].includes(input.source?.kind),'SOURCE_CONVERSION_UNSUPPORTED');
      // 256 is the explicit source-preview default; the parent's segmentation res is separate.
      const raster=input.raster??input.state.provenance?.textSourceOptions?.raster??{width:256,height:256};
      const start=epoch;const response=await call('source.convert',input,{state:copy(input.state),assetsMap:collectTextAssets(input.state,input.assets),raster:copy(raster),sourceContext:copy(input.sourceContext)});
      const result=await asSource(response,input.source.kind,{conversion:true,source:input.source});publication(input,start);return result;
    },
    prepareText(input){return call('prepare.text',input,input.groupBinding?{groupBinding:copy(input.groupBinding)}:{});},
    prepareSource(input){return call('prepare.source',input,input.groupBinding?{groupBinding:copy(input.groupBinding)}:{});},
    /** Call only after the controller's exact-head/candidate-hash and explicit consent checks. */
    async acceptProposal(input){
      checkControl(input);const start=epoch,confirmation=copy(input.confirmation);
      requireValue(pending,'NO_PROPOSAL');const selected=pending;
      requireValue(sameTicket(selected.preparation.receipt.ticket,input.ticket),'CONFIRMATION_TICKET');
      requireValue(input.acceptedAtRevision===input.ticket.revision+1,'CONFIRMATION_REVISION');
      requireValue(await artifactHash(confirmation)===await artifactHash(selected.confirmation),'CONFIRMATION_REQUIRED');
      // source/assets are the generic app contract names. Descriptive early-API aliases
      // are accepted only when unambiguous.
      requireValue(!(input.source&&input.candidateSource)||input.source===input.candidateSource,'CONFIRMATION_SOURCE');
      requireValue(!(input.assets&&input.assetsMap)||input.assets===input.assetsMap,'CONFIRMATION_ASSETS');
      const candidate=copy(input.source??input.candidateSource),map=byteMap(input.assets??input.assetsMap),p=selected.preparation;
      requireValue(candidate?.kind===p.kind&&candidate.raw?.hash===p.original.hash&&candidate.raw.byteLength===p.original.byteLength,'CONFIRMATION_SOURCE');
      requireValue(candidate.id===p.sourceContext.id&&candidate.revision===p.sourceContext.revision,'CONFIRMATION_SOURCE');
      requireValue(await artifactHash(input.sourceContext)===await artifactHash(p.sourceContext)&&await artifactHash(candidate.metadata?.sourceContext)===await artifactHash(p.sourceContext),'CONFIRMATION_CONTEXT');
      requireValue(candidate.metadata.artifactHash===p.receipt.artifactHash,'CONFIRMATION_METADATA');
      requireValue(await artifactHash(candidate.metadata?.sourceConversion)===await artifactHash(p),'CONFIRMATION_METADATA');
      const raster=candidate.raster;
      requireValue(raster&&raster.width===p.raster.width&&raster.height===p.raster.height&&raster.pixelSizeMm===p.raster.pixelSizeMm&&
        raster.rgba===p.raster.sha256&&raster.preview===p.raster.pngHash&&raster.originalPreview===p.raster.pngHash,'CONFIRMATION_RASTER');
      requireValue(Array.isArray(candidate.assetHashes),'CONFIRMATION_ASSETS');
      for(const ref of p.assets){requireValue(candidate.assetHashes.includes(ref.sha256),'CONFIRMATION_ASSET_MISSING');await checkedAsset(map,ref.sha256,ref.bytes);}
      publication(input,start);requireValue(pending===selected,'NO_PROPOSAL');
      const response=await call('source.confirm',input,{receipt:copy(p.receipt),decision:'accept-source-conversion'},false);
      publication(input,start);requireValue(pending===selected&&response.status==='confirmed','CONFIRMATION_REQUIRED');pending=null;
      return {version:APP_VERSION,ticket:copy(input.ticket),confirmation,
        receipt:{kind:p.kind,version:'arch-source-confirmation-receipt/1',approvalHash:p.approvalHash,proposalHash:p.receipt.proposalHash,
          sourceHash:p.original.hash,rgbaHash:p.raster.sha256,artifactHash:p.receipt.artifactHash,settingsHash:p.settingsHash,
          projectId:input.ticket.projectId,sourceRevision:candidate.revision,acceptedAtRevision:input.acceptedAtRevision}};
    },
    reset(){epoch++;pending=null;catalog.reset();},
    clearPrivateState(){epoch++;pending=null;catalog.reset();},
    dispose(){if(disposed)return;disposed=true;epoch++;pending=null;catalog.reset();},
  });
}
