import {durableHistoryProof} from './root-history-browser.mjs';
import {createRootMeshAdapter} from '../src/root-app-adapter.mjs';
import {createFinalSceneEvidence} from '../../integration/final-scene-evidence.mjs';
import {EngineClient} from '../../core/engine-client.mjs';
import {createMeshClient} from '../src/root-client.mjs';
import {readProductSemantics} from '../../core/product-operations.mjs';
import {readArchSnapshot} from '../../viewport/arch-view.mjs';
import {qualifyMesh} from '../../core/mesh-qualification.mjs';
import {source,productFixture,inputFixture,bindingInventory,affine,selectionFor,commandFor} from './root-fixtures.mjs';
const assert=(v,s)=>{if(!v)throw Error(s);};
const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof b==='string'?new TextEncoder().encode(b):b)),x=>x.toString(16).padStart(2,'0')).join('');
async function rejected(fn,pattern){try{await fn();}catch(e){assert(pattern.test(e.code??e.message),String(e.code??e));return e.code??e.message;}throw Error('expected rejection '+pattern);}
export async function runProof(pin){
 const client=new EngineClient({moduleURL:pin.module.url,integrity:pin,watchdogMs:45000,cancelGraceMs:3000}),mesh=createMeshClient(client),records=[];
 let parent;let next=0;const generation=()=>++next;
 try{
  await client.start();assert(client.runtimeIntegrity?.wasmLoading==='verified-owned-wasmBinary','integrity');
  assert(client.serviceCapabilities.mesh===true&&client.serviceCapabilities.sourceFrameVersion===1,'mesh/ASFR routes');
  assert(client.serviceCapabilities.finalFloat&&client.serviceCapabilities.finalSceneGeometry,'float/material routes');
  const headHash=await sha('root-product-fixture'),product=productFixture({sourceHash:await sha(source),headHash});
  parent=await client.build({kind:'product',source:{kind:'svg',source},packed:product.packed},{generation:generation()});
  const original=parent.bytes().slice(),originalHash=await sha(original),sem=readProductSemantics(parent.metadata.semanticBytes),inventory=bindingInventory(original,sem);
  const context={userId:'test-author',projectId:'test-project',revision:sem.revision,headHash};
  const output={version:'arch-root-mesh-browser-proof/1',runtimeIntegrity:client.runtimeIntegrity,capabilities:client.serviceCapabilities,records,artifacts:[{name:'parent.arch',bytes:Array.from(original)}]};
  let unitInput=inputFixture();delete unitInput.unit;
  const unit=await mesh.previewImport({context,input:unitInput,selection:selectionFor(affine(31,3,-2,1))},{generation:generation()});
  assert(unit.applied===false&&!unit.token&&unit.state==='unit-choice-required','no hidden unit');
  records.push({name:'missing-unit',state:unit.state});
  for(const [name,format,encoding,operation,transform,blocked]of[
   ['rotated-stl-difference','stl','ascii','difference',affine(31,3,-2,1),false],
   ['rotated-obj-difference','obj','ascii','difference',affine(-23,3,-2,1),false],
   ['side-union','stl','binary','union',affine(35,19,-2,1),false],
   ['intersection-datum','stl','ascii','intersection',affine(17,3,-2,1),true],
  ]){
   let preview,prepared,proposal,derived;
   try{
    preview=await mesh.previewImport({context,input:inputFixture(format,encoding),selection:selectionFor(transform)},{generation:generation()});
    assert(preview.state==='approval-required'&&preview.applied===false,'input preview');
    await rejected(()=>mesh.approveImport(preview,{context,approved:true,approvalHash:'0'.repeat(64)},{generation:generation()}),/MESH_EXACT_INPUT_APPROVAL_REQUIRED/);
    prepared=await mesh.approveImport(preview,{context,approved:true,approvalHash:preview.approvalHash},{generation:generation()});preview=null;
    const command=commandFor(inventory,transform,operation);
    await rejected(()=>mesh.prepare(parent,prepared,{context:{...context,headHash:'0'.repeat(64)},command},{generation:generation()}),/MESH_STALE_CONTEXT/);
    proposal=await mesh.prepare(parent,prepared,{context,command},{generation:generation()});
    assert(proposal.state===(blocked?'blocked':'confirmation-required'),JSON.stringify(proposal.report.postCsgGates));
    assert(await sha(parent.bytes().slice())===originalHash,'parent immutable');
    const before=proposal.previewBytes().slice();
    output.artifacts.push({name:name+'.arch',bytes:Array.from(before)});
    if(blocked){
     await rejected(()=>mesh.confirm(proposal,{context,approved:true,proposalHash:proposal.confirmation.proposalHash},{generation:generation()}),/MESH_POST_CSG_OR_TOPOLOGY_BLOCKED/);
    }else{
     assert(proposal.qualification.verdict==='pass','actual checker');
     await rejected(()=>mesh.confirm(proposal,{context,approved:true,proposalHash:'0'.repeat(64)},{generation:generation()}),/MESH_EXACT_CONFIRMATION_MISMATCH/);
     derived=await mesh.confirm(proposal,{context,approved:true,proposalHash:proposal.confirmation.proposalHash},{generation:generation()});proposal=null;
     assert(derived.generation===next&&derived.metadata.kind==='mesh-scene'&&derived.metadata.applied===true,'root lease');
     const b=derived.bytes().slice();assert(readArchSnapshot(b).generation===next,'published generation');
     assert(await sha(b)===derived.metadata.derivedSnapshotHash,'derived hash');
     output.artifacts.push({name:name+'.published.arch',bytes:Array.from(b)});
     const mapping=derived.metadata.materialLineage.map(p=>({part:p.part,slot:p.slot,rgba:p.rgba,source:p.sourceIndex,materialSource:Number(p.materialId)}));
     const readback=await client.finalSceneGeometry(derived,{revision:sem.revision,expectedRevision:sem.revision,mapping},{generation:generation()});
     assert(readback.metadata.sourceSnapshotSha256===derived.metadata.derivedSnapshotHash,'actual derived material readback');
     assert(qualifyMesh(readback.bytes).verdict==='pass','independent material readback');
     output.artifacts.push({name:name+'.material.arch',bytes:Array.from(readback.bytes)});
    }
    records.push({name,state:blocked?'blocked':'published',gates:derived?.metadata.postCsgGates??proposal.report.postCsgGates,parentUnchanged:true});
   }finally{derived?.release();proposal?.release();prepared?.release();preview?.release();}
  }
  // Actual client/Worker/native publication + a deterministic host CAS,
  // followed by the main final-scene provider's independent real Worker.
  const kernelLeases=new WeakMap(),host={userId:context.userId,projectId:context.projectId,state:{revision:Number(sem.revision)},headHash,sessionKey:'test-session'};
  const baseModel={generation:parent.generation,bytes:()=>parent.bytes()};host.model=baseModel;kernelLeases.set(baseModel,{root:parent,client});
  const operation=(c,fn)=>{assert(!c.signal.aborted,'cancelled host job');return fn(client,generation());};
  const control=()=>({version:'arch-app-adapters/1',ticket:{id:crypto.randomUUID(),userId:host.userId,projectId:host.projectId,revision:host.state.revision,generation:next+1},signal:new AbortController().signal,onProgress:()=>{}});
  let targetState,commits=0,rejectCommit=true;
  const adapter=createRootMeshAdapter({operation,kernelLeases,context:()=>host,commitCandidate:async({expected,publication,model,history})=>{
   assert(expected.headHash===host.headHash&&Number(expected.revision)===host.state.revision,'CAS expected head');
   assert(publication.transactionHash===await sha(JSON.stringify(targetState)),'exact candidate state');
   assert(history.original.raw.hash===history.inputApproval.sourceHash,'history original');
   if(rejectCommit)throw Object.assign(Error('TEST_CAS_REJECTED'),{code:'TEST_CAS_REJECTED'});
   host.state=targetState;host.headHash=publication.headHash;host.model=model;commits++;return {committed:true,model};
  }});
  let preparedApp,proposalApp,derivedModel,provider;
  try{
   const input=inputFixture('obj'),file={name:input.name,bytes:input.bytes},c=control();
   const sourceContext={version:'arch-source-context/1',operation:'import',id:'import-history-source',revision:0};
   const ingested=await adapter.source.ingest({...c,file,purpose:'mesh',state:host.state,sourceContext});
   assert(ingested.metadata.meshImport.unit===null&&ingested.metadata.meshImport.generatedParameters==='unapplied','ingest gate');
   const descriptor={id:sourceContext.id,name:file.name,kind:'mesh',revision:0,raw:{hash:await sha(file.bytes),byteLength:file.bytes.length},metadata:ingested.metadata};
   const transform=affine(-23,3,-2,1),inputConfig={unit:input.unit,materials:input.materials,sourceMaterialAssignments:input.sourceMaterialAssignments,maxErrorMm:input.maxErrorMm};
   const previewApp=await adapter.prepareInput({control:control(),file,mesh:descriptor,selection:{input:inputConfig,approval:selectionFor(transform)}});
   preparedApp=await adapter.approveInput(previewApp,{control:control(),proposalHash:previewApp.proposalHash});
   previewApp.release(); // transferred owner must not release the prepared input
   const command=commandFor(inventory,transform,'difference');
   targetState={revision:host.state.revision+1,mesh:{source:descriptor,command,applied:true}};
   const publication={version:'arch-mesh-publication/1',revision:String(targetState.revision),headHash:await sha('head:'+JSON.stringify(targetState)),transactionHash:await sha(JSON.stringify(targetState))};
   const args={model:baseModel,command,publication,materialNames:{'800':'tool','901':'body','902':'left','903':'right'},
    sourceHashes:[{id:'generated-original',sha256:await sha(source)},{id:descriptor.id,sha256:descriptor.raw.hash}]};
   proposalApp=await adapter.prepareApply(preparedApp,{control:control(),...args});
   assert(proposalApp.state==='confirmation-required','app prepared');
   await rejected(()=>adapter.confirmApply(proposalApp,{control:control(),proposalHash:proposalApp.proposalHash}),/TEST_CAS_REJECTED/);
   assert(host.model===baseModel&&host.state.revision===Number(sem.revision)&&commits===0,'failed CAS unchanged');
   proposalApp.release();proposalApp=null;rejectCommit=false;
   proposalApp=await adapter.prepareApply(preparedApp,{control:control(),...args});
   const receipt=await adapter.confirmApply(proposalApp,{control:control(),proposalHash:proposalApp.proposalHash});proposalApp=null;
   derivedModel=receipt.model;assert(commits===1&&host.model===derivedModel&&derivedModel.mesh.revision===String(targetState.revision),'atomic visible adoption');
   provider=createFinalSceneEvidence({kernelLeases,inspectModel:adapter.inspectModel,operation,context:()=>host,
    gateState:()=>({key:'derived-head-'+host.headHash,invalidInput:false,kernelFailure:false,assemblyView:false,unappliedMeshEdit:false}),
    materialSourceIds:()=>[{materialId:'body',materialSourceId:901},{materialId:'left',materialSourceId:902},{materialId:'right',materialSourceId:903}]});
   const evidence=await provider.qualify({model:derivedModel,control:control()});
   assert(evidence.evidence.status==='ready'&&evidence.evidence.meshVerdict==='pass'&&evidence.evidence.provenance.sceneKind==='mesh-scene','derived final-scene provider');
   output.artifacts.push({name:'transaction.published.arch',bytes:Array.from(derivedModel.bytes())});
   records.push({name:'app-transaction-cas-and-final-scene-provider',state:'published',failedCasUnchanged:true,commits,evidence:evidence.evidence});
  }finally{await provider?.dispose();derivedModel?.release();proposalApp?.release();preparedApp?.release();adapter.dispose();}
  for(const failureMode of ['none','adopt','session'])records.push(await durableHistoryProof({client,generation,pin,artifacts:output.artifacts,failureMode}));
  let preview=await mesh.previewImport({context,input:inputFixture(),selection:selectionFor(affine(31,3,-2,1))},{generation:generation()});
  const priorEpoch=client.epoch;client.terminate('TEST_RETIRE');await rejected(()=>mesh.approveImport(preview,{context,approved:true,approvalHash:preview.approvalHash},{generation:generation()}),/MESH_RUNTIME_RETIRED/);
  preview.release();assert(client.epoch>priorEpoch,'epoch retirement');records.push({name:'stale-epoch',state:'rejected'});
  return output;
 }finally{parent?.release();client.dispose();}
}
globalThis.runProof=runProof;
