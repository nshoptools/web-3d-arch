import type {RasterSourceAdapter,RasterApprovalControl,ApprovalAnswer,RasterApprovalConsumerInput} from '../../src/integration/raster-adapters.mjs';
declare const source:RasterSourceAdapter, input:RasterApprovalControl;
const previous:Promise<ApprovalAnswer>=source.acceptProposal(input);
const nullable:Promise<ApprovalAnswer>=source.acceptProposal(input,null);
const returned:Promise<string>=source.acceptProposal(input,async ready=>{
 const receipt:ApprovalAnswer=ready;
 const packet:RasterApprovalConsumerInput=ready;
 const sourceToken:string=packet.nativeSource.token;
 const sameTicket:typeof input.ticket=receipt.ticket;
 return sourceToken+sameTicket.id;
});
// @ts-expect-error Only an opaque token may cross the app boundary.
source.acceptProposal(input,ready=>ready.nativeSource.acceptedHandle);
// @ts-expect-error Invalid consumer must be rejected.
source.acceptProposal(input,{});
// @ts-expect-error Consumer results are not falsely typed as the old envelope.
const bad:Promise<ApprovalAnswer>=source.acceptProposal(input,()=>7);
void [previous,nullable,returned,bad];
