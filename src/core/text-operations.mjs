import * as bundledHB from '../input/harfbuzz-engine.mjs';
import {createFontSourceWithHarfBuzz} from '../input/font-source-core.mjs';
import {createTextSourceAdapter,createNativeColorRenderer,createColorRendererClient,VERSION as SOURCE_VERSION,artifactHash} from '../input/index.mjs';
import {ownedBytes,hash,fontEntry,finite,sha} from '../input/source-contract.mjs';
import {parseDecimal} from '../domain/decimal.mjs';
import {encodeRasterPNG} from './png-encode.mjs';
import {createSourceCatalog,createAssetReader,APP_VERSION,copy,fail,requireValue,checkedTicket,sameTicket,checkedSourceContext} from '../integration/source-catalog.mjs';

export const TEXT_OPERATIONS_VERSION='arch-text-operations/1';
let boundModule=null;
function bind(Module,hb){
  requireValue(Module?._arch_abi_version?.()===2,'CORE_ABI_MISMATCH');
  if(hb){requireValue(typeof hb.Blob==='function'&&typeof hb.Face==='function'&&typeof hb.shape==='function','HARFBUZZ_BINDING');return hb;}
  if(!boundModule){bundledHB.initializeHarfBuzz(Module);boundModule=Module;}
  requireValue(boundModule===Module,'HARFBUZZ_MODULE_REPLACEMENT_REQUIRES_WORKER_RESET');return bundledHB;
}
const num=(raw,min,max,name)=>finite(parseDecimal(raw).value,min,max,name);
const sourceId=(state,ticket)=>state?.content?.app?.source?.id??ticket.projectId+'/text';
const expectedFor=(state,ticket)=>({sourceId:sourceId(state,ticket),revision:state?.content?.app?.source?.revision??ticket.revision});
const textSize=t=>({value:num(t.sizeMm,.001,1000,'text em mm'),unit:'mm'});
const placement=t=>({xMm:num(t.xMm,-10000,10000,'text x'),yMm:num(t.yMm,-10000,10000,'text y'),rotationDegrees:0});
function assembly(t){
  return {asSource:t.asSource,placement:t.placement,baseEnabled:t.baseEnabled,bevelEnabled:t.bevelEnabled,
    heightLayers:finite(num(t.heightLayers,0,1000000,'text layers'),0,1000000,'text layers',true),baseThicknessLayers:finite(num(t.baseThicknessLayers,0,1000000,'base layers'),0,1000000,'base layers',true),
    baseWidthMm:num(t.baseWidthMm,0,10000,'base width'),baseRadiusMm:num(t.baseRadiusMm,0,10000,'base radius'),
    status:'requires-product-assembly',meshVerified:false};
}
function textState(state,ticket){
  requireValue(state?.revision===ticket.revision&&state.content?.app?.text,'STATE_TICKET_REVISION');
  const t=copy(state.content.app.text);
  requireValue(typeof t.text==='string'&&typeof t.fontId==='string'&&['mm','pt'].includes(t.sizeUnit)&&['beside','on-model'].includes(t.placement),'TEXT_STATE');
  for(const k of ['asSource','baseEnabled','bevelEnabled'])requireValue(typeof t[k]==='boolean','TEXT_STATE');
  return t;
}
function sfnt(bytes){
  requireValue(bytes.length>=12,'FONT_HEADER');const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),magic=v.getUint32(0);
  requireValue(magic===0x00010000||magic===0x4f54544f,'FONT_FORMAT_UNSUPPORTED');
  const count=v.getUint16(4);requireValue(count>0&&count<=256&&12+16*count<=bytes.length,'FONT_TABLE_LIMIT');
  const tables=new Map(),ranges=[];
  for(let i=0;i<count;i++){
    const at=12+16*i,tag=String.fromCharCode(...bytes.subarray(at,at+4)),offset=v.getUint32(at+8),length=v.getUint32(at+12);
    requireValue(!tables.has(tag)&&offset>=12+16*count&&offset+length<=bytes.length,'FONT_TABLE_BOUNDS');
    tables.set(tag,{offset,length});if(length)ranges.push({offset,end:offset+length});
  }
  ranges.sort((a,b)=>a.offset-b.offset);for(let i=1;i<ranges.length;i++)requireValue(ranges[i].offset>=ranges[i-1].end,'FONT_TABLE_OVERLAP');
  requireValue(tables.has('head')&&tables.has('cmap')&&tables.get('maxp')?.length>=6,'FONT_REQUIRED_TABLE');
  requireValue((tables.has('glyf')&&tables.has('loca'))||tables.has('CFF ')||tables.has('CFF2'),'FONT_OUTLINE_REQUIRED');
  requireValue(!['COLR','CBDT','CBLC','sbix','SVG '].some(t=>tables.has(t)),'COLOR_FONT_IMPORT_UNSUPPORTED');
  const glyphCount=v.getUint16(tables.get('maxp').offset+4);requireValue(glyphCount>1,'FONT_GLYPH_COUNT');
  return {glyphCount,format:magic===0x4f54544f?'opentype':'truetype',outlineFormat:tables.has('glyf')?'glyf':tables.has('CFF2')?'CFF2':'CFF'};
}
/** Probe an actual context. Presence of the constructor is not a usable-canvas assertion. */
export function probeWorkerColorCapabilities(){
  let canvas2d=false;
  if(typeof OffscreenCanvas==='function')try{const c=new OffscreenCanvas(5,5);canvas2d=!!c.getContext('2d');c.width=c.height=1;}catch{}
  return {canvas2d,fontFace:typeof FontFace==='function',fontSet:!!globalThis.fonts,imageBitmap:typeof createImageBitmap==='function'};
}
/** Bind the whole prepared text to caller-owned persistent identity. Glyph/path indices stay local. */
export function bindPreparedTextGroup(prepared,binding){
  const required=['textId','sourceId','provenanceId'];
  if(!binding)return {version:'arch-prepared-text-groups/1',status:'binding-required',required,coordinateSpace:'mm-y-up',regions:[],texts:[]};
  const id=(v)=>{requireValue(typeof v==='bigint'||typeof v==='string'&&/^[1-9][0-9]{0,19}$/.test(v),'PRODUCT_PERSISTENT_ID');
    const n=BigInt(v);requireValue(n>0n&&n<=0xffffffffffffffffn,'PRODUCT_PERSISTENT_ID');return String(n);};
  const ids=Object.fromEntries(required.map(k=>[k,id(binding[k])]));
  requireValue(prepared.kind==='paths'&&prepared.geometry,'TEXT_PATH_GROUP_REQUIRED');
  return {version:'arch-prepared-text-groups/1',status:'prepared-curves',coordinateSpace:'mm-y-up',regions:[],
    texts:[{id:ids.textId,sourceId:ids.sourceId,provenanceId:ids.provenanceId,artifactHash:prepared.artifactHash,
      sourceHashes:prepared.sourceAssets.map(a=>a.record.sha256),geometry:copy(prepared.geometry),
      svg:prepared.svg?new Uint8Array(prepared.svg):null,svgExport:copy(prepared.svgExport),
      canonicalization:'parent-validated-source-parser-required',sourceBoundVerified:false,fitVerified:false}]};
}

/** Same ABI2 Module only. The parent serializes this service with its other native operations.
 * @param {import('../../docs/text-app/API.mjs').TextOperationOptions} options
 * @returns {import('../../docs/text-app/API.mjs').TextOperations}
 */
export function createTextOperations({Module,catalog,assetURLs,origin,hb,runtime,fetchImpl,rendererPort,previewPaths,encodePNG=encodeRasterPNG,deadlineMs=10000}){
  const shaper=bind(Module,hb),library=createSourceCatalog({catalog,assetURLs,origin}),reader=createAssetReader({assetURLs,origin,fetchImpl});
  finite(deadlineMs,20,10000,'text operation deadline',true);
  requireValue(runtime&&typeof runtime.engine==='string'&&typeof runtime.version==='string','RUNTIME_IDENTITY');
  const capabilities=probeWorkerColorCapabilities();let portRenderer=null,disposed=false,epoch=0,active=null,pending=null,jobs=0;
  function chooseRenderer(port){
    if(port){
      requireValue(runtime.engine==='webkit'&&!capabilities.canvas2d,'MAIN_RENDERER_FALLBACK_NOT_REQUIRED');
      portRenderer=createColorRendererClient(port,{deadlineMs});return portRenderer;
    }
    return createNativeColorRenderer(runtime);
  }
  let renderer=chooseRenderer(rendererPort),source;
  function makeSource(){
    return createTextSourceAdapter({collections:library.sourceCollections(),renderer,
      createFontSource:(bytes,entry)=>createFontSourceWithHarfBuzz(bytes,entry,shaper),
      readBytes:(ref,{signal})=>reader(ref,{signal,assetsMap:active?.assetsMap??new Map()})});
  }
  source=makeSource();
  async function inspectFont(file,job,retained){
    const bytes=ownedBytes(file.bytes,16000000),directory=sfnt(bytes),digest=await hash(bytes);job.check();
    if(retained)requireValue(retained.sha256===digest&&retained.bytes===bytes.length,'HASH_MISMATCH');
    const blob=new shaper.Blob(bytes),face=new shaper.Face(blob),axes=face.getAxisInfos();
    requireValue(Object.keys(axes).length<=32,'FONT_AXIS_LIMIT');
    const name=n=>{const v=face.getName(n,'en');if(v===null||v===undefined)return '';requireValue(typeof v==='string'&&v.length<=4096,'FONT_NAME_LIMIT');return v;};
    const family=name(16)||name(1)||file.name,style=name(17)||name(2)||'normal';
    const original=retained?.source??{kind:'user-import',originalFileName:file.name,originalMediaType:file.mediaType,modified:false};
    const record=fontEntry({id:'imported:'+digest,name:name(4)||family,family,style,format:directory.format,outlineFormat:directory.outlineFormat,
      unitsPerEm:face.upem,glyphCount:directory.glyphCount,axes,defaultVariation:Object.fromEntries(Object.entries(axes).map(([k,v])=>[k,v.default])),
      variable:Object.keys(axes).length>0,bytes:bytes.length,sha256:digest,source:copy(original),
      license:copy(retained?.license??{status:'user-responsibility',embeddedNotice:name(13),embeddedURL:name(14)}),
      coverage:{vietnamese:'not-assumed',inspection:'bounded-sfnt-and-HarfBuzz',meshValidated:false}});
    const f=new shaper.Font(face);f.setScale(face.upem,face.upem);
    const unicode=face.collectUnicodes();requireValue(unicode.length>0&&unicode.length<=150000,'FONT_CMAP_LIMIT');
    let sample=null;
    for(const point of [0x41,0x61,...unicode.subarray(0,128)]){
      const glyphId=f.nominalGlyph(point);if(!glyphId)continue;const outline=f.glyphToJson(glyphId);
      requireValue(outline.length<=100000,'FONT_OUTLINE_LIMIT');
      if(outline.length){sample={text:String.fromCodePoint(point),glyphId,commands:outline.length};break;}
    }
    requireValue(sample,'FONT_EMPTY_OUTLINES');await job.step('font-inspected');job.check();
    return {record,bytes,sample};
  }
  async function selectedFont(state,t,job){
    if(t.fontId.startsWith('imported:')){
      const digest=sha(t.fontId.slice(9));requireValue((state.content.app.fontAssets??[]).includes(digest),'FONT_PROJECT_REFERENCE');
      const bytes=job.assetsMap.get(digest);requireValue(bytes,'FONT_ASSET_MISSING');
      const stored=state.provenance?.inputFonts?.[digest],retained=stored?.font??stored;
      const loaded=await inspectFont({bytes,name:retained?.source?.originalFileName??t.fontId,mediaType:retained?.source?.originalMediaType??'font/ttf'},job,retained);
      library.registerImported(loaded.record);return loaded.record;
    }
    return library.font(t.fontId||library.defaultFontId);
  }
  async function commandFor(r,t,job){
    const base={version:SOURCE_VERSION,id:r.ticket.id,expected:expectedFor(r.state,r.ticket),size:textSize(t),placement:placement(t)};
    if(r.op==='emoji.select'){
      const chosen=library.emoji(r.id,r.collectionId);return {...base,kind:'emoji',collectionId:chosen.collectionId,text:chosen.text,source:chosen.source,
        ...(['COLRv1','CBDT/CBLC'].includes(chosen.source.kind)?{raster:r.raster??{width:256,height:256}}:{})};
    }
    const src=r.state.content.app.source;
    if(r.op!=='prepare.text'&&r.op!=='text.import'&&!t.asSource&&src?.kind==='emoji'){
      const value=job.assetsMap.get(src.raw.hash);requireValue(value,'SOURCE_ASSET_MISSING');const raw=ownedBytes(value,65536);requireValue(await hash(raw)===src.raw.hash,'HASH_MISMATCH');
      requireValue(raw.length<=65536,'EMOJI_DESCRIPTOR_LIMIT');
      const selected=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
      requireValue(selected.version==='arch-emoji-selection/1','EMOJI_DESCRIPTOR_VERSION');
      const chosen=library.emoji(selected.originalText,selected.collectionId);
      requireValue(chosen.item.id===selected.id&&chosen.text===selected.originalText&&chosen.source.kind===selected.sourceKind,'EMOJI_DESCRIPTOR_CHANGED');
      const digest=chosen.source.font?.sha256??chosen.source.asset?.sha256;requireValue(digest===selected.sourceHash,'EMOJI_DESCRIPTOR_CHANGED');
      return {...base,kind:'emoji',collectionId:chosen.collectionId,text:selected.originalText,source:chosen.source,
        ...(['COLRv1','CBDT/CBLC'].includes(chosen.source.kind)?{raster:r.raster??{width:256,height:256}}:{})};
    }
    let text=t.text;
    if(r.op==='text.import')text=new TextDecoder('utf-8',{fatal:true}).decode(ownedBytes(r.file.bytes,64000));
    else if(r.op!=='prepare.text'&&!t.asSource&&src?.kind==='text'){
      const value=job.assetsMap.get(src.raw.hash);requireValue(value,'SOURCE_ASSET_MISSING');const bytes=ownedBytes(value,64000);requireValue(await hash(bytes)===src.raw.hash,'HASH_MISMATCH');
      text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    }else if(r.op!=='prepare.text'&&!t.asSource&&src)fail('SOURCE_KIND_UNSUPPORTED');
    const font=await selectedFont(r.state,t,job),params=r.state.provenance?.textSourceOptions??{};
    return {...base,kind:'text',text,font,variations:copy(params.variationsByFont?.[font.id]??font.defaultVariation??{}),
      lineSpacing:num(t.lineSpacing,.1,10,'line spacing'),letterSpacingMm:num(t.letterSpacing,-100,100,'letter spacing'),bendDegrees:num(t.bend,-180,180,'bend'),
      ...(params.layout?{layout:copy(params.layout)}:{}),...(params.align?{align:params.align}:{}),
      ...(params.script?{script:params.script}:{}),...(params.language?{language:params.language}:{}),...(params.direction?{direction:params.direction}:{})};
  }
  async function previewFor(prepared,r,job){
    let p;
    if(prepared.preview?.status==='ready')p={...prepared.preview,data:new Uint8ClampedArray(prepared.preview.rgba),pixelSizeMm:Math.hypot(...prepared.preview.pixelToSourceMm.slice(0,2))};
    else if(['paths','svg'].includes(prepared.kind)&&previewPaths){
      try{p=await previewPaths({prepared:copy(prepared),ticket:copy(r.ticket),signal:job.abort.signal,resolution:r.raster?.width??256});}
      catch(e){
        if(!['REGION_BELOW_BOOLEAN_RESOLUTION','PREVIEW_CANVAS_UNAVAILABLE'].includes(e.code))throw e;
        job.previewDiagnostic={code:e.code,message:String(e.message).slice(0,512),stage:'parent-source-preview'};
      }
    }
    if(!p)return null;
    finite(p.width,1,1280,'preview width',true);finite(p.height,1,1280,'preview height',true);
    requireValue(p.data instanceof Uint8ClampedArray&&p.data.buffer instanceof ArrayBuffer&&p.data.length===p.width*p.height*4,'PREVIEW_RGBA');
    requireValue(Array.isArray(p.pixelToSourceMm)&&p.pixelToSourceMm.length===6&&p.pixelToSourceMm.every(Number.isFinite),'PREVIEW_SOURCE_TRANSFORM');
    requireValue(p.pixelToSourceMm[0]*p.pixelToSourceMm[3]-p.pixelToSourceMm[1]*p.pixelToSourceMm[2]!==0,'PREVIEW_SOURCE_TRANSFORM');
    const data=new Uint8ClampedArray(p.data),png=await encodePNG({width:p.width,height:p.height,data},{signal:job.abort.signal});job.check();
    const pixelSizeMm=Math.hypot(p.pixelToSourceMm[0],p.pixelToSourceMm[1]);requireValue(pixelSizeMm>0,'PREVIEW_PIXEL_SIZE');
    return {width:p.width,height:p.height,data,png:new Uint8Array(png),mediaType:'image/png',pixelSizeMm,
      sha256:await hash(new Uint8Array(data.buffer)),pixelToSourceMm:copy(p.pixelToSourceMm),nativeProfileMetadata:copy(p.nativeProfileMetadata??null),renderer:copy(p.renderer??{id:'parent-validated-planar-preview',engine:runtime.engine,version:runtime.version})};
  }
  return Object.freeze({
    version:TEXT_OPERATIONS_VERSION,capabilities:copy(capabilities),
    async run(request,control){
      requireValue(!disposed,'TEXT_OPERATIONS_DISPOSED');requireValue(!active,'TEXT_OPERATIONS_BUSY');
      requireValue(request?.version===APP_VERSION,'ADAPTER_VERSION');const ticket=checkedTicket(request.ticket);
      requireValue(typeof control?.isCurrent==='function','CURRENT_TICKET_REQUIRED');
      requireValue(++jobs<=256,'TEXT_OPERATION_LIFETIME');
      const r={...request,...(request.state?{state:copy(request.state)}:{}),ticket},jobEpoch=epoch;
      const assetsMap=request.assetsMap??new Map();requireValue(assetsMap instanceof Map&&assetsMap.size<=256,'TEXT_ASSET_MAP');
      let retainedBytes=0;for(const [h,b] of assetsMap){sha(h);requireValue(b instanceof Uint8Array&&b.buffer instanceof ArrayBuffer,'TEXT_ASSET_BYTES');retainedBytes+=b.length;}
      requireValue(retainedBytes<=128*1024*1024,'TEXT_ASSET_BUDGET');
      const abort=new AbortController(),started=performance.now();
      const abortOuter=()=>abort.abort();control.signal?.addEventListener('abort',abortOuter,{once:true});
      if(control.signal?.aborted)abort.abort();
      const timer=setTimeout(()=>abort.abort(),deadlineMs);
      const job={abort,assetsMap,check(){
        if(disposed||jobEpoch!==epoch||abort.signal.aborted)fail(performance.now()-started>=deadlineMs?'TEXT_OPERATION_DEADLINE':'CANCELLED');
        requireValue(control.isCurrent(copy(ticket))===true,'STALE_JOB');
      },async step(stage){job.check();control.onProgress?.({stage,progress:null});await new Promise(resolve=>setTimeout(resolve,0));job.check();}};
      active=job;
      try{
        job.check();
        if(r.op==='source.confirm'){
          requireValue(pending,'NO_PROPOSAL');const selected=pending,receipt=r.receipt;
          requireValue(receipt&&sameTicket(receipt.ticket,selected.receipt.ticket)&&receipt.proposalHash===selected.receipt.proposalHash&&receipt.artifactHash===selected.receipt.artifactHash,'CONFIRMATION_REQUIRED');
          requireValue(['userId','projectId','revision'].every(k=>ticket[k]===selected.receipt.ticket[k]),'STALE_JOB');
          requireValue(r.decision==='accept-source-conversion','CONFIRMATION_REQUIRED');
          if(selected.prepared.proposalHash)await source.confirm({id:selected.prepared.id,expected:selected.prepared.expected,proposalHash:selected.prepared.proposalHash,decision:r.decision},
            {signal:abort.signal,isCurrent:()=>{job.check();return true;}});
          await job.step('source-confirmed');requireValue(pending===selected,'STALE_JOB');pending=null;
          return {version:APP_VERSION,ticket:copy(ticket),status:'confirmed',receipt:copy(selected.receipt),raster:copy(selected.preview),prepared:copy(selected.prepared)};
        }
        if(pending)source.cancel(pending.prepared.id);pending=null;
        if(r.op==='font.import'){
          const loaded=await inspectFont(r.file,job,r.record);job.check();library.registerImported(loaded.record);
          return {version:APP_VERSION,ticket:copy(ticket),kind:'text',font:loaded.record,bytes:loaded.bytes,metadata:{font:loaded.record,sample:loaded.sample,sourceBoundVerified:false,fitVerified:false}};
        }
        requireValue(['prepare.text','prepare.source','emoji.select','text.import','source.convert'].includes(r.op),'TEXT_OPERATION_UNKNOWN');
        const adoption=['emoji.select','text.import','source.convert'].includes(r.op)?checkedSourceContext(r.sourceContext,r.state,r.op==='source.convert'?'convert':'import'):null;
        const t=textState(r.state,ticket),command=await commandFor(r,t,job);
        const prepared=await source.prepare(command,{signal:abort.signal,isCurrent:()=>{job.check();return true;},
          onProgress:p=>control.onProgress?.({stage:p.phase,progress:Math.min(1,p.work/p.maxWork)})});
        job.check();const preview=await previewFor(prepared,r,job);job.check();
        const result={version:APP_VERSION,ticket:copy(ticket),sourceContext:copy(adoption),prepared,preview,previewDiagnostic:copy(job.previewDiagnostic??null),assembly:assembly(t),
          preparedGroups:bindPreparedTextGroup(prepared,r.groupBinding??(!prepared.selection?r.state.provenance?.textSourceOptions?.groupBinding:undefined)),
          parameters:{sizeMm:textSize(t).value,sizeUnit:t.sizeUnit,sizeDisplay:t.sizeDisplay,coordinateSpace:'mm-y-up',variationSource:'state.provenance.textSourceOptions.variationsByFont'}};
        if(r.op==='source.convert'){
          requireValue(preview,'SOURCE_RASTER_RENDERER_UNAVAILABLE');
          const conversion={kind:'source-to-rgba8',sourceHash:prepared.artifactHash,rasterHash:preview.sha256,pixelToSourceMm:preview.pixelToSourceMm,width:preview.width,height:preview.height,
            losses:['Curves and continuous paint sampled to the explicitly selected pixel grid','Antialiasing and straight RGBA8 rounding; no material color reduction applied'],sourceBoundVerified:false,fitVerified:false};
          const receipt={ticket:copy(ticket),artifactHash:prepared.artifactHash,proposalHash:await artifactHash(conversion)};
          job.check();pending={prepared:copy(prepared),preview:copy(preview),receipt:copy(receipt)};
          result.conversion={status:'proposal',receipt,details:conversion};
        }
        await job.step('text-operation-ready');return result;
      }catch(error){source.cancel(ticket.id);if(pending?.receipt.ticket.id===ticket.id||r.op==='source.confirm')pending=null;
        if(abort.signal.aborted&&performance.now()-started>=deadlineMs)fail('TEXT_OPERATION_DEADLINE');throw error;}
      finally{clearTimeout(timer);control.signal?.removeEventListener('abort',abortOuter);active=null;if(disposed)source=null;}
    },
    // Cancellation invalidates the proposal without disposing the renderer.
    // A later job on the same Worker can still use its private color port.
    cancel(){active?.abort.abort();if(pending)source.cancel(pending.prepared.id);pending=null;},
    reset({rendererPort:nextPort}={}){
      epoch++;active?.abort.abort();if(pending)source.cancel(pending.prepared.id);pending=null;library.reset();portRenderer?.dispose();portRenderer=null;
      renderer=chooseRenderer(nextPort);source=makeSource();
    },
    dispose(){if(disposed)return;disposed=true;epoch++;active?.abort.abort();if(pending)source.cancel(pending.prepared.id);pending=null;library.reset();portRenderer?.dispose();portRenderer=null;if(!active)source=null;},
    stats:()=>({active:!!active,pending:pending?copy(pending.receipt):null,epoch,jobs,disposed,source:source?.stats()??null}),
  });
}
