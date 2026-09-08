// Explicit lifecycle double. Proposal geometry/proof/SHA here are synthetic;
// confirmed STL uses the real ordinary same-Module fixture serializer.
import assert from 'node:assert/strict';
import {sha256} from '../../src/printing/src/contracts.mjs';
export const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
export function installFloatDouble(T,h){
 const original=T.client.finalExport,originalCap=T.client.serviceCapabilities.finalFloat;
 const saved=Object.fromEntries(['prepareFinalFloat','confirmFinalFloat','releaseFinalFloat'].map(k=>[k,T.client[k]]));
 const d={prepares:0,confirms:0,releases:0,resident:0,prepared:null,policy:null,command:null,beforePrepare:null,beforeConfirm:null,afterPrepare:null,afterConfirm:null};
 T.client.serviceCapabilities.finalFloat=true;
 T.client.finalExport=async()=>{throw Object.assign(Error('INVALID_SERIALIZATION:STL_FLOAT_COLLISION'),{code:'INVALID_SERIALIZATION'});};
 T.client.prepareFinalFloat=async(root,command,policy,{generation})=>{
  d.prepares++;d.policy=structuredClone(policy);d.command=structuredClone(command);d.prepareGeneration=generation;
  await d.beforePrepare?.();
  const confirmation=Object.freeze({version:'arch-final-float-confirmation/1',proposalHash:'a'.repeat(64),sourceHash:await sha256(root.bytes().slice()),sourceGeneration:root.generation,sourceRevision:String(h.context.state.revision),optionsHash:'b'.repeat(64)});
  const c={version:'arch-final-float-conditioning/1',algorithm:'explicit-lifecycle-test-double',requiresConfirmation:true,confirmed:false,proposalHash:confirmation.proposalHash,geometryHash:'c'.repeat(64),contextHash:'d'.repeat(64),sourceVertices:10,sourceTriangles:16,candidateVertices:8,candidateTriangles:12,collapsedEdges:2,removedDegenerateFaceImages:4,maximumDisplacementMm:policy.maximumDisplacementMm/4,hausdorffUpperBoundMm:policy.maximumDisplacementMm/2,requestedLimitMm:policy.maximumDisplacementMm,workUnits:123,workLimit:policy.workLimit,qualification:{wholePipelineErrorBoundMm:null,physicalFit:'unqualified',ambientIsotopy:'unverified',materialPolicy:'union STL only'}};
  let released=false;const p={version:'arch-final-float-proposal/1',confirmation,metadata:{version:'arch-final-float-proposal/1',confirmation,conditioning:c,materialMapping:structuredClone(command.mapping)},
   view(){throw Error('Application adapter must not inspect or edit geometry views');},release(){if(released)return;released=true;d.releases++;d.resident--;}};
  d.resident++;d.prepared=p;await d.afterPrepare?.(p);return p;
 };
 T.client.confirmFinalFloat=async(p,c,{generation})=>{
  assert.equal(p,d.prepared);assert.deepEqual(c,p.confirmation);assert.ok(Object.isFrozen(c));d.confirms++;d.confirmGeneration=generation;
  await d.beforeConfirm?.();const a=await original(h.root,d.command,{generation});
  a.metadata.floatConditioning={...structuredClone(p.metadata.conditioning),confirmed:true};
  a.metadata.errorLedger.floatConditioningHausdorffUpperBoundMm=p.metadata.conditioning.hausdorffUpperBoundMm;
  a.metadata.warnings.push('EXPLICITLY_CONFIRMED_FLOAT_CONDITIONING');await d.afterConfirm?.(a);return a;
 };
 T.client.releaseFinalFloat=p=>{assert.equal(p,d.prepared);p.release();};
 d.restore=()=>{T.client.finalExport=original;T.client.serviceCapabilities.finalFloat=originalCap;
  for(const [k,v]of Object.entries(saved))if(v===undefined)delete T.client[k];else T.client[k]=v;};
 return d;
}
