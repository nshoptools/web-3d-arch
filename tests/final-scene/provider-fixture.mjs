// Explicit synthetic ownership/transport double for provider boundary unit tests.
// Geometry is always checked by the production checker, never hardcoded pass.
import {arch,box,stl} from './fixtures.mjs';
import {sha256} from '../../src/storage/common.mjs';
import {qualifyMesh} from '../../src/core/mesh-qualification.mjs';
import {createFinalSceneEvidence} from '../../src/integration/final-scene-evidence.mjs';
export async function providerFixture(options={}){
 const {fixtureMeshes=box(),...bindingOptions}=options;
 const bytes=arch(fixtureMeshes),ticket={id:'qualification',userId:'user-a',projectId:'project-a',revision:2,generation:99},abort=new AbortController();
 const control={version:'arch-app-adapters/1',ticket,signal:abort.signal,onProgress:()=>{}};
 const state={revision:2,product:'keychain'},headHash=await sha256('synthetic-state');
 let released=false,calls=0,finished=false,transportGeneration=99;
 const root={id:11,generation:7,epoch:4,metadata:{semanticBytes:new Uint8Array([1,2]),descriptor:new Uint8Array([3,4])},bytes:()=>{if(released)throw Error('released');return bytes;}};
 const runtime={epoch:4,serviceCapabilities:{finalExport:true},async finalExport(){
  calls++;const b=stl(box());return {bytes:b,metadata:{sourceSnapshotSha256:await sha256(bytes),sourceSnapshotGeneration:7,sourceProjectRevision:'2',format:'stl-union',download:{bytes:b.length,sha256:await sha256(b)}}};
 }};
 const model={version:'arch-app-adapters/1',ticket:{...ticket,generation:1},generation:7,leaseId:'4:11',bytes:root.bytes,release(){released=true;}};
 const record={root,client:runtime},kernelLeases=new WeakMap([[model,record]]);
 const inspection={version:'arch-product-model-state/1',modelLeaseId:model.leaseId,head:{headHash,revision:'2'},snapshot:{id:11,generation:7,epoch:4},
  semantics:{mechanicsSemantics:3,sourceSemantics:2},contextHash:await sha256('context'),
  gates:{matchingHead:true,nativeBuildAccepted:true,sourceVerdict:0,mechanicsVerdict:0,exportBlocked:false},
  exportDescriptor:{parts:[{partIndex:0,sourceIndex:0,slot:1,rgba:0xff0000ff,materialId:'stable-material',id:'stable-part',sourceSemanticIds:['stable-source'],materialProvenanceId:'18446744073709550000'}],sourceHashes:[{id:'stable-source',sha256:await sha256('source')}]}
 };
 const live={state,userId:ticket.userId,projectId:ticket.projectId,sessionKey:{},headHash,model},gates={key:'gate-1',invalidInput:false,kernelFailure:false,assemblyView:false,unappliedMeshEdit:false};
 const validator={check:async(bytes,opts)=>qualifyMesh(bytes,opts),async reset(){finished=true;}};
 const bindings={kernelLeases,inspectModel:async()=>inspection,operation:async(c,fn)=>fn(runtime,++transportGeneration),context:()=>live,gateState:()=>gates,
  materialSourceIds:()=>[{materialId:'stable-material',materialSourceId:401}],validationClient:validator,...bindingOptions};
 const provider=createFinalSceneEvidence(bindings);
 return {provider,bindings,bytes,model,root,runtime,record,inspection,live,gates,control,abort,kernelLeases,validator,calls:()=>calls,released:()=>released,finished:()=>finished};
}
