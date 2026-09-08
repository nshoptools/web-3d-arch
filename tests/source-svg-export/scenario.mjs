import * as domain from '../../src/domain/index.mjs';
import {appContent,validateState,setParameter} from '../../src/app/documents.mjs';
import {SourceOperations} from '../../src/app/sources.mjs';
import {createSourceContext,sourceReceipt} from '../../src/app/source-approval.mjs';
import {createProductSourceContexts} from '../../src/integration/product-source-contexts.mjs';
import {createSourceSVGExport} from '../../src/integration/source-svg-export.mjs';
import {createExportAdapters} from '../../src/integration/export-adapters.mjs';
import {sha256,canonicalJSON} from '../../src/storage/common.mjs';
import {domainStateFingerprint} from '../../src/storage/history.mjs';
import {encodeRasterPNG} from '../../src/core/png-encode.mjs';
export const APP='arch-app-adapters/1',clone=structuredClone,UTF=new TextEncoder(),text=b=>new TextDecoder().decode(b);
export const SVG='<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="30mm" viewBox="0 0 40 30"><g transform="translate(1 1)"><path id="red" fill="#e04444" fill-rule="evenodd" d="M0 0H18V28H0Z M4 5H8V9H4Z"/></g><path id="blue" fill="#3388ee" d="M22 4 C35 0 36 26 22 26 Q18 12 22 4 Z"/></svg>';
export const need=(v,m)=>{if(!v)throw Error(m);};
export async function scenario({kernel,sources,driver}){
 const e={state:domain.createProject({product:'keychain',content:{app:appContent('Source export test only')}}),userId:'source-user-a',projectId:'source-project',sessionKey:'1:1',records:new Map(),n:0,kernel,sources,driver};
 const writer=new SourceOperations();
 e.assets=()=>new Map([...e.records].map(([h,r])=>[h,new Uint8Array(r.bytes)]));
 e.sync=async()=>{e.live={state:e.state,userId:e.userId,projectId:e.projectId,sessionKey:e.sessionKey,headHash:await domainStateFingerprint(e.state),model:null,assetsMap:e.assets(),exportOptions:{'svg-color':{filename:'Nguồn.svg',inspection:false,units:'source',side:'source',color:'source'}}};driver.set(e.live);};
 await e.sync();
 e.control=operation=>({version:APP,ticket:{id:'source-'+ ++e.n,userId:e.userId,projectId:e.projectId,revision:e.state.revision,generation:e.n},signal:new AbortController().signal,onProgress:()=>{},...(operation?{sourceContext:createSourceContext(operation,e.state.content.app.source)}:{})});
 e.bridge=createProductSourceContexts({kernel,sources,context:driver.get});e.provider=createSourceSVGExport({kernel,sources,context:driver.get});
 e.exporter=createExportAdapters({operation:kernel.operation,kernelLeases:kernel.kernelLeases,context:driver.get,sourceSnapshot:e.provider});
 e.adopt=async(reply,file,c)=>{
  const r=reply.result??reply,raw=await writer.addAsset(file.bytes,'source',e.records),hashes=[raw.hash];
  for(const a of r.assets??[])hashes.push((await writer.addAsset(a.bytes,a.kind,e.records)).hash);
  const raster=r.raster?await writer.rasterDescriptor(r.raster,e.records):null,preview=r.preview?await writer.previewDescriptor(r.preview,e.records):null;
  if(raster)hashes.push(raster.rgba,raster.preview,raster.originalPreview);if(preview)hashes.push(preview.png);
  const source={id:c.sourceContext.id,revision:c.sourceContext.revision,kind:r.kind,name:file.name,mediaType:file.mediaType,raw,assetHashes:[...new Set(hashes)],metadata:{...clone(r.metadata),sourceContext:clone(c.sourceContext)},...(raster?{raster}:{}),...(preview?{preview}:{})};
  await e.sync();const adoptionInput={...c,purpose:'source',operation:c.sourceContext.operation,source,state:clone(e.state),assets:e.assets(),materials:r.materials??e.state.content.app.materials,materialDefaults:r.materials??e.state.content.app.materialDefaults};
  const d=await e.bridge.prepareAdoption(adoptionInput);
  source.metadata.productBindings=clone(d.productBindings);
  if(reply.confirmation){const receipt=await e.bridge.source.acceptProposal({...c,state:clone(e.state),source,assets:e.assets(),confirmation:reply.confirmation,acceptedAtRevision:e.state.revision+1});source.metadata.confirmationReceipt=sourceReceipt(receipt,{control:c,confirmation:reply.confirmation,source,acceptedAtRevision:e.state.revision+1});}
  e.state=clone(e.state);e.state.revision++;e.state.sourceKind=source.kind;e.state.content.app.source=source;e.state.content.app.materials=clone(d.materials);e.state.content.app.materialDefaults=clone(d.materialDefaults);e.state=validateState(e.state);await e.sync();e.file=file;return source;
 };
 e.ingest=async(kind,{svg=SVG,value='E\u0302\u0301',emoji='😀',overlay=false}={})=>{
  if(overlay){e.state=clone(e.state);Object.assign(e.state.content.app.text,{text:'O',xMm:'42',yMm:'2',placement:'beside',baseEnabled:false});e.state.revision++;await e.sync();}
  const c=e.control('import');let file,reply;
  if(kind==='emoji'||kind==='color'){const r=await e.bridge.source.selectEmoji({...c,id:emoji,collectionId:kind==='emoji'?'noto-emoji-monochrome':'noto-color-emoji'});file=r.file;reply=r.result;}
  else {let b=kind==='svg'?UTF.encode(svg):UTF.encode(value);
   if(kind==='raster'){const data=new Uint8ClampedArray(16*12*4);for(let y=0;y<12;y++)for(let x=0;x<16;x++){if((x>=3&&x<6&&y>=2&&y<5)||(x<2&&y>8))continue;data.set(x<9?[224,68,68,255]:[51,136,238,255],4*(y*16+x));}b=await encodeRasterPNG({width:16,height:12,data});}
   file={name:'original.'+({svg:'svg',text:'txt',raster:'png'}[kind]),mediaType:{svg:'image/svg+xml',text:'text/plain',raster:'image/png'}[kind],bytes:b};
   reply=await e.bridge.source.ingest({...c,state:clone(e.state),purpose:'source',file});
  }
  return e.adopt(reply,file,c);
 };
 e.convert=async()=>{const c=e.control('convert'),source=e.state.content.app.source,r=await e.bridge.source.convert({...c,target:'raster',source,state:clone(e.state),assets:e.assets()});need(r.status==='proposal','real explicit source proposal required');return e.adopt(r,e.file,c);};
 e.update=async fn=>{e.state=clone(e.state);fn(e.state);e.state.revision++;await e.sync();};
 e.refresh=()=>e.provider.refresh({control:e.control()});
 e.export=()=>e.exporter.export({...e.control(),state:e.state,model:null,renderer:{available:false},formatId:'svg-color',prerequisite:'committed-source',assets:e.assets()});
 e.close=async()=>{e.exporter.dispose();e.provider.dispose();e.bridge.reset();await sources.reset();};
 return e;
}
