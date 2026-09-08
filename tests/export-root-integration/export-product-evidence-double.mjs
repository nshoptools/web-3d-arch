// Test-only mesh routing provider for direct helper tests. Native APMS/head,
// source/part IDs and bytes are real. A supplied meshEvidence callback is an
// explicitly injected verdict, not production finalScene qualification.
import {readProductHead} from '../../src/core/product-operations.mjs';
import {productExportDescriptor} from '../../src/core/product-export-descriptor.mjs';
import {readArchSnapshot} from '../../src/viewport/arch-view.mjs';
import {sha256} from '../../src/printing/src/contracts.mjs';
export function productEvidenceDouble({kernelLeases,context,materialSourceIds,meshEvidence}){
 let ready=null;
 const descriptor=()=>{const c=context(),r=kernelLeases.get(c.model);return {c,r,d:productExportDescriptor(r.root,{headHash:c.headHash,revision:c.state.revision})};};
 const describe=()=>{descriptor();return ready??{status:'unverified',reasonCode:'FINAL_SCENE_EVIDENCE_UNVERIFIED'};};
 return {describe,async prepare(){const {c,r,d}=descriptor(),view=readArchSnapshot(r.root.bytes()),registry=materialSourceIds().entries;
  const identity={snapshotSha256:await sha256(r.root.bytes().slice()),head:readProductHead(r.root.metadata.descriptor)};
  const proof=meshEvidence?.({identity});
  ready={status:'ready',key:'explicit-direct-helper-test-routing',projectId:c.projectId,revision:c.state.revision,headHash:c.headHash,
   snapshotId:r.root.id,snapshotGeneration:r.root.generation,epoch:r.root.epoch,snapshotSha256:identity.snapshotSha256,
   gates:{invalidInput:false,kernelFailure:false,assemblyView:false,unappliedMeshEdit:false},meshVerdict:proof?.verdict??'unverified',
   projectScheduleHash:c.state.schedule.hash,sourceHashes:d.sourceHashes,parts:d.parts.map(p=>{
    const entry=registry.find(e=>e.materialId===p.materialId);if(!entry)throw Error('Explicit test material missing');
    return {...p,semanticId:p.id,sourceIndex:view.parts[p.partIndex].sourceIndex,materialSourceId:entry.materialSourceId};
   }),provenance:{testDouble:true,qualification:'injected routing verdict; actual app provider checked in separate RPC suite'}};
  return ready;
 },dispose(){ready=null;}};
}
