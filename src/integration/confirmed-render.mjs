import {sha256,canonicalJSON} from '../storage/common.mjs';
import {checkControl,requireValue,copy} from './source-catalog.mjs';

/** Verify durable user consent for a vector/paint render before treating its
 * pixels (possibly subsequently edited) as an input to material segmentation. */
export async function confirmedRender({state,source,assets,c}){
  checkControl(c);requireValue(['svg','text','emoji'].includes(source?.kind)&&source.raster,'SOURCE_RENDER_APPROVAL_REQUIRED');
  requireValue(assets instanceof Map,'SOURCE_ASSET_MAP');
  const p=source.metadata?.sourceConversion,r=source.metadata?.confirmationReceipt;
  requireValue(p&&r&&p.kind===source.kind&&r.kind===source.kind&&p.status==='proposal','SOURCE_RENDER_APPROVAL_REQUIRED');
  const {approvalHash,...payload}=p;
  requireValue(await sha256(canonicalJSON(payload))===approvalHash,'SOURCE_RENDER_PREPARATION_CHANGED');
  requireValue(r.version==='arch-source-confirmation-receipt/1'&&r.approvalHash===approvalHash&&r.proposalHash===p.receipt?.proposalHash&&
    r.artifactHash===p.receipt?.artifactHash&&r.artifactHash===source.metadata.artifactHash&&r.settingsHash===p.settingsHash&&
    r.sourceHash===source.raw.hash&&r.sourceHash===p.original?.hash&&p.original.byteLength===source.raw.byteLength&&
    r.rgbaHash===p.raster?.sha256&&r.projectId===c.ticket.projectId&&r.projectId===p.receipt.ticket.projectId&&
    r.sourceRevision===p.sourceContext?.revision&&p.sourceContext.id===source.id&&source.revision>=r.sourceRevision&&
    r.acceptedAtRevision===p.receipt.ticket.revision+1&&state.revision>=r.acceptedAtRevision,'SOURCE_RENDER_RECEIPT_CHANGED');
  requireValue(Array.isArray(p.assets)&&p.assets.length>0&&p.assets.length<=256,'SOURCE_RENDER_ASSET_BUDGET');
  let total=0;
  async function read(hash,bytes){
    requireValue(source.assetHashes.includes(hash),'SOURCE_RENDER_ASSET_REFERENCE');const b=assets.get(hash);
    requireValue(b instanceof Uint8Array&&b.buffer instanceof ArrayBuffer&&(bytes===undefined||b.length===bytes),'SOURCE_RENDER_ASSET_MISSING');
    requireValue(await sha256(b)===hash,'SOURCE_RENDER_ASSET_CHANGED');checkControl(c);return b;
  }
  for(const ref of p.assets){total+=ref.bytes;requireValue(Number.isSafeInteger(ref.bytes)&&ref.bytes>0&&total<=128*1024*1024,'SOURCE_RENDER_ASSET_BUDGET');await read(ref.sha256,ref.bytes);}
  const raster=source.raster,data=await read(raster.rgba,raster.width*raster.height*4);
  const renderer=p.renderer?.id;
  requireValue(canonicalJSON(p.renderer)===canonicalJSON(source.metadata?.preview?.renderer),'SOURCE_RENDER_PROVENANCE');
  requireValue(typeof renderer==='string'&&renderer.length>0&&renderer.length<=200,'SOURCE_RENDER_PROVENANCE');
  const origin={sourceHash:source.raw.hash,settingsHash:p.settingsHash,renderer,confirmationId:approvalHash};
  return {width:raster.width,height:raster.height,data:new Uint8ClampedArray(data),origin,
    lineage:{initialRGBAHash:p.raster.sha256,initialPreviewHash:p.raster.pngHash,parentRGBAHash:p.raster.sha256,parentPreparationHash:approvalHash,renderOrigin:copy(origin)}};
}
