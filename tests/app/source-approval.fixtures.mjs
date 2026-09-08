// TEST FIXTURES ONLY. Metadata builders do not validate native raster/text output.
import {createSourceContext} from '../../src/app/source-approval.mjs';
export function testPreparation(control,rawHash,rgbaHash,kind='raster'){
 const common={kind,approvalHash:'a'.repeat(64),settingsHash:'e'.repeat(64)};
 return kind==='raster'?{...common,proposalHash:'b'.repeat(64),
  context:{projectId:control.ticket.projectId,baseRevision:control.ticket.revision,sourceRevision:control.sourceContext.revision},
  input:{mode:control.sourceContext.operation==='convert'?'rgba':'encoded',parentSourceRevision:control.sourceContext.predecessor?.revision??0,originalHash:rawHash,rgbaHash}
 }:{...common,receipt:{proposalHash:'b'.repeat(64)},original:{hash:rawHash},raster:{sha256:rgbaHash}};
}
export function testFlatReceipt(input){
 const {source,confirmation,ticket}=input,p=confirmation.kind==='raster'?source.metadata.rasterPreparation:source.metadata.sourceConversion;
 return {version:input.version,ticket:{...ticket},confirmation:{...confirmation},receipt:{
  kind:confirmation.kind,version:'arch-source-confirmation-receipt/1',approvalHash:confirmation.approvalHash,proposalHash:confirmation.proposalHash,
  sourceHash:source.raw.hash,rgbaHash:source.raster.rgba,settingsHash:p.settingsHash,projectId:ticket.projectId,sourceRevision:source.revision,acceptedAtRevision:input.acceptedAtRevision}};
}
export function testBinding(kind='raster',previous=null){
 const sourceContext=createSourceContext(previous?'convert':'import',previous),control={version:'arch-app-adapters/1',ticket:{id:'test-ticket',userId:'test-user',projectId:'test-project',revision:12,generation:2},sourceContext};
 const confirmation={kind,version:'TEST-confirmation/1',approvalHash:'a'.repeat(64),proposalHash:'b'.repeat(64)};
 const source={id:sourceContext.id,revision:sourceContext.revision,kind,raw:{hash:previous?.raw.hash??'c'.repeat(64)},raster:{rgba:'d'.repeat(64)},metadata:{sourceContext}};
 source.metadata[kind==='raster'?'rasterPreparation':'sourceConversion']=testPreparation(control,source.raw.hash,source.raster.rgba,kind);
 return {control,confirmation,source,acceptedAtRevision:control.ticket.revision+1};
}
