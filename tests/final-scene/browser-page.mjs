import {createKernelAdapters} from '../../src/integration/kernel-adapters.mjs';
import {createProductAdapters} from '../../src/integration/product-adapters.mjs';
import {domainStateFingerprint} from '../../src/storage/history.mjs';
import {createFinalSceneEvidence} from '../../src/integration/final-scene-evidence.mjs';
import {materialSourceIdsFromState} from '../../src/integration/material-source-ledger.mjs';
import {finalSceneGateState} from '../../src/integration/final-scene-gates.mjs';
import {createMeshQualificationClient} from '../../src/core/mesh-qualification-client.mjs';
import {arch,box} from './fixtures.mjs';
const need=(v,c)=>{if(!v)throw Error(c);};
/** Component binding test: real root EngineClient + product ownership inspector.
 * The source fixture was prepared by actual native SVG and prepareBindings.
 * This callback is test-only source orchestration, not an application replacement. */
export async function run(){
 let live=null,serial=0;const trace=[],errors=[];
 const kernel=createKernelAdapters({moduleURL:'/runtime/arch-kernel.mjs',workerURL:'/src/core/engine-worker.mjs',selectRecipe:()=>{throw Error('NO_BARE_RECIPE');}});
 const context=()=>live;
 const withPreparedSource=async(args,consume)=>{
  const roots=[];
  try{
   for(const b of args.bindings.contexts)roots.push(await args.run((client,generation)=>client.build({kind:'svg',source:new TextDecoder().decode(args.assets.get(b.sha256)),thicknessMm:.2,toleranceMm:.001},{generation})));
   const owner=await kernel.ensureRuntime(args.control),references=roots.map(root=>()=>{root.bytes();return {kind:'snapshot',id:root.id,generation:root.generation,epoch:root.epoch};});
   const contexts=roots.map((root,i)=>({key:args.bindings.contexts[i].key,sourceHash:root.metadata.sourceHash,derivationHash:args.bindings.contexts[i].derivationHash,
    regions:root.metadata.paints.map((p,sourceIndex)=>({nativeKey:p.sourceId??p.id,sourceIndex}))}));
   return await consume({version:'arch-product-contexts/1',owner,epoch:owner.epoch,source:references[0](),references,contexts,
    assertOwned(){roots.forEach(r=>r.bytes());},authorization:null,textStateHash:args.bindings.textStateHash});
  }finally{roots.forEach(r=>r.release());}
 };
 const product=createProductAdapters({operation:kernel.operation,kernelLeases:kernel.kernelLeases,context,withPreparedSource});
 const materialSourceIds=(c,i)=>{
  materialSourceIdsFromState(c,i); // validates actual source and the persisted digest
  return c.state.content.app.source.metadata.productBindings.adoptionProvenance.materialSourceLedger.entries.map(row=>({...row}));
 };
 let gateSerial=0;
 const gateState=(c,i)=>{const actual=finalSceneGateState(c,i);return {...actual,key:actual.key+':test-generation-'+gateSerial};};
 const evidence=createFinalSceneEvidence({operation:kernel.operation,kernelLeases:kernel.kernelLeases,inspectModel:product.inspectModel,context,gateState,materialSourceIds});
 const control=()=>({version:'arch-app-adapters/1',ticket:{id:'qualify-'+(++serial),userId:live.userId,projectId:live.projectId,revision:live.state.revision,generation:serial},signal:new AbortController().signal,onProgress:()=>{}});
 try{
  const vc=createMeshQualificationClient(),valid=await vc.check(arch(box())),invalid=arch(box());new DataView(invalid.buffer).setFloat64(128,NaN,true);
  need(valid.verdict==='pass','WORKER_VALID');need((await vc.check(invalid)).verdict==='fail','WORKER_INVALID');
  const abort=new AbortController(),cancelled=vc.check(arch(box()),{signal:abort.signal});abort.abort();await cancelled.then(()=>{throw Error('WORKER_CANCEL');},e=>need(e.code==='CANCELLED','WORKER_CANCEL_CODE'));
  await vc.reset();trace.push({case:'real-validator-worker-valid-invalid-cancel',status:'pass'});
  for(const name of ['keychain','clicky','strap','lego','charm']){
   const f=await (await fetch('/fixtures/'+name+'.json')).json(),assets=new Map(f.assets.map(([h,b])=>[h,new Uint8Array(b)]));
   live={userId:'user-a',projectId:'project-persistent',state:f.state,model:null,sessionKey:'final-scene-session-1',headHash:await domainStateFingerprint(f.state)};
   let model;const start=performance.now();
   try{
    model=await product.engine.build({...control(),state:f.state,assets});live.model=model;
    const record=kernel.kernelLeases.get(model),before=model.bytes().slice(),c=control();let r;
    try{r=await evidence.refresh({model,control:c});}
    catch(e){errors.push({product:name,code:e.code??e.message});trace.push({case:name,status:'unavailable',code:e.code??e.message,milliseconds:performance.now()-start});continue;}
    need(r.ticket===c.ticket||JSON.stringify(r.ticket)===JSON.stringify(c.ticket),'TICKET_ECHO');
    const proof=r.evidence.provenance;
    const materialOnly=proof.materialReadback?.verdict==='pass'&&proof.union===null&&r.evidence.meshVerdict==='unverified';
    need(r.evidence.meshVerdict==='pass'||materialOnly,'MESH_NOT_PASS');need(r.evidence.snapshotGeneration===model.generation,'GENERATION');
    need(proof.snapshot.verdict==='pass'&&(materialOnly||proof.union?.verdict==='pass'),'PROOF_VECTOR');
    need(r.evidence.projectScheduleHash===f.state.schedule.hash,'BUILD_SCHEDULE_HASH');
    const {digest,...table}=proof.materialSourceTable;
    const tableHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode((await import('../../src/storage/common.mjs')).canonicalJSON(table)))),n=>n.toString(16).padStart(2,'0')).join('');
    need(digest===tableHash&&table.bindings.length===f.state.content.app.materials.length,'FULL_MATERIAL_TABLE');
    need(evidence.describe(record,live)===r.evidence,'EXACT_CACHED_EVIDENCE');
    const after=model.bytes();need(before.every((b,i)=>b===after[i]),'ROOT_MUTATED');
    // A different session, not a malformed one: the product requires the key to be a string
    // (product-adapters name()), so an object made this throw before it could describe anything.
    const saved=live.sessionKey;live.sessionKey='final-scene-session-2';need(evidence.describe(record,live).status!=='ready','SESSION_INVALIDATION');live.sessionKey=saved;
    gateSerial++;need(evidence.describe(record,live).status!=='ready','GATE_INVALIDATION');
    trace.push({case:name,status:materialOnly?'material-only':'pass',snapshotSha256:r.evidence.snapshotSha256,snapshot:proof.snapshot,materialReadback:proof.materialReadback,union:proof.union,materialTableDigest:digest,projectScheduleHash:r.evidence.projectScheduleHash,materialCount:new Set(r.evidence.parts.map(p=>p.materialId)).size,milliseconds:performance.now()-start});
    model.release();need(evidence.describe(record,live).status!=='ready','RELEASE_INVALIDATION');model=null;
   }finally{model?.release();await evidence.reset();await product.reset();}
  }
  const runtime=await kernel.ensureRuntime(control());
  return {trace,errors,crossOriginIsolated,versions:runtime.serviceCapabilities.geometryVersions,finalSceneGeometry:runtime.serviceCapabilities.finalSceneGeometry??false};
 }finally{await evidence.reset();await product.reset();await kernel.reset();}
}
