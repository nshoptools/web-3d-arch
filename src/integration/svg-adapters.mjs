import {effectiveValues} from '../domain/index.mjs';
import {sha256,canonicalJSON} from '../storage/common.mjs';
import {APP_VERSION,copy,requireValue,checkControl,checkedSourceContext,sameTicket} from './source-catalog.mjs';

const digest=value=>sha256(canonicalJSON(value));
const equal=(a,b)=>canonicalJSON(a)===canonicalJSON(b);
const confirmationFor=p=>({kind:'svg',version:'arch-svg-confirmation/1',approvalHash:p.approvalHash,proposalHash:p.receipt.proposalHash});

/** SVG remains vector until this exact render is accepted. The result is editable
 * RGBA, not material regions or a finished model. Subsequent segmentation has its
 * own proposal bound to this persisted render receipt. */
export function createSVGSourceAdapter({kernel,context}){
  requireValue(typeof kernel?.svgPreview==='function'&&typeof context==='function','SVG_ADAPTER_BINDING');
  let epoch=0,pending=null;
  function guard(c,e){
    checkControl(c);requireValue(e===epoch,'SOURCE_PRIVATE_RESET');const live=context();
    requireValue(live?.state?.revision===c.ticket.revision&&live.userId===c.ticket.userId&&live.projectId===c.ticket.projectId,'STALE_JOB');
  }
  async function asset(assets,h,size){
    requireValue(assets instanceof Map,'SOURCE_ASSET_MAP');const b=assets.get(h);
    requireValue(b instanceof Uint8Array&&b.buffer instanceof ArrayBuffer&&b.length===size&&await sha256(b)===h,'SOURCE_ASSET_CHANGED');return new Uint8Array(b);
  }
  return Object.freeze({
    version:APP_VERSION,capabilities:[{id:'source.svg',available:true}],
    async ingest(c){
      const e=epoch;guard(c,e);pending=null;
      requireValue(c.purpose==='source','SOURCE_PURPOSE');checkedSourceContext(c.sourceContext,c.state,'import');
      const result=await kernel.svgPreview(c,c.file);guard(c,e);
      return {...result,metadata:{...result.metadata,sourceContext:copy(c.sourceContext)}};
    },
    async convert(c){
      const e=epoch;guard(c,e);pending=null;
      requireValue(c.target==='raster'&&c.source?.kind==='svg'&&!c.source.raster,'SVG_RENDER_SOURCE');
      const source=copy(c.source),sourceContext=checkedSourceContext(c.sourceContext,c.state,'convert');
      const bytes=await asset(c.assets,source.raw.hash,source.raw.byteLength);guard(c,e);
      const values=effectiveValues(c.state),settings={resolution:Number(values.res),longEdgeMm:values.size,toleranceMm:.004};
      const result=await kernel.svgPreview(c,{bytes},{...settings,includeRGBA:true});guard(c,e);
      const raster=result.raster,rgbaHash=await sha256(new Uint8Array(raster.data.buffer,raster.data.byteOffset,raster.data.byteLength)),pngHash=await sha256(raster.preview);
      const settingsHash=await digest({...settings,renderer:result.metadata.previewDerivation,frame:result.metadata.frame});
      const artifactHash=await digest({version:'arch-svg-render/1',sourceHash:source.raw.hash,rgbaHash,settingsHash});
      const changes=[
        'Chuyển đường SVG đã kiểm sang lưới '+raster.width+' × '+raster.height+' pixel để chỉnh sửa.',
        'Giữ nguyên byte SVG gốc, đơn vị, phép biến đổi và thông số dựng ảnh.',
        'Lấy mẫu và khử răng cưa có thể thay đổi chi tiết nhỏ; chưa phân vùng vật liệu hoặc chứng nhận độ chính xác in.'
      ];
      const details={kind:'svg-to-rgba8',sourceHash:source.raw.hash,rgbaHash,settingsHash,width:raster.width,height:raster.height,
        pixelSizeMm:raster.pixelSizeMm,changes,sourceBoundVerified:false,fitVerified:false};
      const payload={version:'arch-svg-preparation/1',kind:'svg',status:'proposal',sourceContext,original:source.raw,
        receipt:{ticket:copy(c.ticket),artifactHash,proposalHash:await digest(details)},settingsHash,details,renderer:{id:'arch-engine-planar-preview',version:'scanline-2x2-v1'},
        assets:[{sha256:source.raw.hash,bytes:bytes.length},{sha256:rgbaHash,bytes:raster.data.byteLength},{sha256:pngHash,bytes:raster.preview.length}],
        raster:{width:raster.width,height:raster.height,pixelSizeMm:raster.pixelSizeMm,sha256:rgbaHash,pngHash}};
      const preparation={...payload,approvalHash:await digest(payload)};guard(c,e);
      const metadata={...copy(source.metadata),...result.metadata,sourceContext,artifactHash,sourceConversion:preparation,
        preview:{sha256:rgbaHash,renderer:{id:'arch-engine-planar-preview',version:'scanline-2x2-v1'},frame:result.metadata.frame}};
      delete metadata.confirmationReceipt;delete metadata.rasterPreparation;
      pending=copy(preparation);
      return {status:'proposal',confirmation:confirmationFor(preparation),changes,
        result:{...result,metadata,materials:copy(c.state.content.app.materials),assets:[{kind:'source',bytes}]}};
    },
    async acceptProposal(c){
      const e=epoch;guard(c,e);requireValue(pending,'NO_PROPOSAL');const selected=pending,p=copy(selected),source=copy(c.source);
      requireValue(sameTicket(p.receipt.ticket,c.ticket)&&equal(c.confirmation,confirmationFor(p)),'CONFIRMATION_REQUIRED');
      requireValue(c.acceptedAtRevision===c.ticket.revision+1,'CONFIRMATION_REVISION');
      requireValue(source.kind==='svg'&&source.id===p.sourceContext.id&&source.revision===p.sourceContext.revision&&equal(source.raw,p.original),'CONFIRMATION_SOURCE');
      requireValue(equal(c.sourceContext,p.sourceContext)&&equal(source.metadata?.sourceContext,p.sourceContext)&&
        equal(source.metadata?.sourceConversion,p)&&source.metadata?.artifactHash===p.receipt.artifactHash,'CONFIRMATION_METADATA');
      const r=source.raster;
      requireValue(r&&r.width===p.raster.width&&r.height===p.raster.height&&r.pixelSizeMm===p.raster.pixelSizeMm&&
        r.rgba===p.raster.sha256&&r.preview===p.raster.pngHash&&r.originalPreview===p.raster.pngHash,'CONFIRMATION_RASTER');
      for(const ref of p.assets){requireValue(source.assetHashes.includes(ref.sha256),'CONFIRMATION_ASSET_MISSING');await asset(c.assets,ref.sha256,ref.bytes);guard(c,e);}
      requireValue(pending===selected,'NO_PROPOSAL');pending=null;
      return {version:APP_VERSION,ticket:copy(c.ticket),confirmation:copy(c.confirmation),
        receipt:{kind:'svg',version:'arch-source-confirmation-receipt/1',approvalHash:p.approvalHash,proposalHash:p.receipt.proposalHash,
          sourceHash:p.original.hash,rgbaHash:p.raster.sha256,artifactHash:p.receipt.artifactHash,settingsHash:p.settingsHash,
          projectId:c.ticket.projectId,sourceRevision:source.revision,acceptedAtRevision:c.acceptedAtRevision}};
    },
    reset(){epoch++;pending=null;}
  });
}
