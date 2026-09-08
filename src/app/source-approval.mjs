import {assert,data,canonicalJSON,utf8,keys,assertTicket,uuid,freeze} from './common.mjs';
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export function boundedSourceMetadata(input){
 const value=data(input);assert(value&&typeof value==='object'&&!Array.isArray(value),'SOURCE_METADATA');
 assert(utf8.encode(canonicalJSON(value)).length<=65536,'SOURCE_METADATA_BUDGET');return value;
}
export function createSourceContext(operation,previous=null){
 assert(['import','convert'].includes(operation),'SOURCE_CONTEXT_OPERATION');
 const predecessor=previous?{id:previous.id,revision:previous.revision,rawHash:previous.raw.hash}:null;
 if(predecessor)assert(typeof predecessor.id==='string'&&Number.isSafeInteger(predecessor.revision)&&predecessor.revision>=0&&hash(predecessor.rawHash),'SOURCE_CONTEXT_PREDECESSOR');
 if(operation==='convert')assert(predecessor&&predecessor.revision<Number.MAX_SAFE_INTEGER,'SOURCE_REVISION_OVERFLOW');
 return freeze({version:'arch-source-context/1',operation,id:operation==='convert'?previous.id:uuid(),revision:operation==='convert'?previous.revision+1:0,predecessor});
}
export function sourceConfirmation(input){
 const c=boundedSourceMetadata(input);keys(c,['kind','version','approvalHash','proposalHash']);
 assert(['raster','text','emoji','svg'].includes(c.kind),'SOURCE_CONFIRMATION_KIND');
 assert(typeof c.version==='string'&&c.version.length>0&&c.version.length<=120,'SOURCE_CONFIRMATION_VERSION');
 for(const key of ['approvalHash','proposalHash'])assert(hash(c[key]),'SOURCE_CONFIRMATION_HASH');
 return c;
}
/** Check cross-layer bindings, never recompute worker-owned canonical settings/native hashes. */
export function sourcePreparation({control,confirmation,source}){
 const context=control.sourceContext;
 assert(context?.version==='arch-source-context/1'&&source.id===context.id&&source.revision===context.revision&&
  canonicalJSON(source.metadata?.sourceContext)===canonicalJSON(context),'SOURCE_CONTEXT_BINDING');
 assert(source.raster&&hash(source.raw?.hash)&&hash(source.raster.rgba),'SOURCE_RECEIPT_BINDING');
 let preparation,proposalHash,sourceHash,rgbaHash;
 if(confirmation.kind==='raster'){
  preparation=source.metadata.rasterPreparation;
  assert(preparation?.context?.projectId===control.ticket.projectId&&preparation.context.baseRevision===control.ticket.revision&&
   preparation.context.sourceRevision===context.revision,'SOURCE_PREPARATION_CONTEXT');
  const input=preparation.input;
  assert(input&&['encoded','rgba'].includes(input.mode),'SOURCE_PREPARATION_CONTEXT');
  if(input.mode==='rgba')assert(context.operation==='convert'&&input.parentSourceRevision===context.predecessor?.revision,'SOURCE_PREPARATION_CONTEXT');
  if(context.operation==='convert')assert(input.mode==='rgba'&&source.raw.hash===context.predecessor.rawHash,'SOURCE_PREPARATION_CONTEXT');
  proposalHash=preparation.proposalHash;sourceHash=input.originalHash;rgbaHash=input.rgbaHash;
 }else{
  assert(source.kind===confirmation.kind,'SOURCE_RECEIPT_BINDING');
  preparation=source.metadata.sourceConversion;
  assert(preparation?.kind===confirmation.kind,'SOURCE_PREPARATION_CONTEXT');
  proposalHash=preparation.receipt?.proposalHash;sourceHash=preparation.original?.hash;rgbaHash=preparation.raster?.sha256;
 }
 assert(preparation?.approvalHash===confirmation.approvalHash&&proposalHash===confirmation.proposalHash,'SOURCE_RECEIPT_HASH');
 assert(sourceHash===source.raw.hash&&rgbaHash===source.raster.rgba,'SOURCE_RECEIPT_BINDING');
 assert(hash(preparation.settingsHash),'SOURCE_RECEIPT_SETTINGS');
 return preparation;
}
export function sourceReceipt(result,{control,confirmation,source,acceptedAtRevision}){
 const r=boundedSourceMetadata(result);keys(r,['version','ticket','confirmation','receipt']);assertTicket(r,control.ticket);
 assert(canonicalJSON(sourceConfirmation(r.confirmation))===canonicalJSON(confirmation),'SOURCE_CONFIRMATION_ECHO');
 const receipt=r.receipt,required=['kind','version','approvalHash','proposalHash','sourceHash','rgbaHash','settingsHash','projectId','sourceRevision','acceptedAtRevision'];
 keys(receipt,[...required,...(confirmation.kind==='raster'?[]:['artifactHash'])],required);
 assert(receipt.version==='arch-source-confirmation-receipt/1'&&receipt.kind===confirmation.kind,'SOURCE_RECEIPT_VERSION');
 const p=sourcePreparation({control,confirmation,source});
 assert(receipt.approvalHash===confirmation.approvalHash&&receipt.proposalHash===confirmation.proposalHash,'SOURCE_RECEIPT_HASH');
 assert(receipt.sourceHash===source.raw.hash&&receipt.rgbaHash===source.raster.rgba&&receipt.projectId===control.ticket.projectId&&
  receipt.sourceRevision===control.sourceContext.revision&&receipt.acceptedAtRevision===acceptedAtRevision&&
  Number.isSafeInteger(acceptedAtRevision)&&acceptedAtRevision===control.ticket.revision+1,'SOURCE_RECEIPT_BINDING');
 assert(receipt.settingsHash===p.settingsHash,'SOURCE_RECEIPT_SETTINGS');
 if(Object.hasOwn(receipt,'artifactHash'))assert(hash(receipt.artifactHash)&&receipt.artifactHash===source.metadata.artifactHash,'SOURCE_RECEIPT_ARTIFACT');
 return receipt;
}
