import test from 'node:test';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
import {createAppController} from '../../src/app/controller.mjs';
import {sha256,uuid} from '../../src/app/common.mjs';
import {verifyDocument} from '../../src/app/documents.mjs';
import * as domain from '../../src/domain/index.mjs';
import {domainStateFingerprint} from '../../src/storage/history.mjs';
import {createMechanicsDomainAdapter} from '../../src/kernel/mechanics/src/domain-adapter.mjs';
import {createProductOperations,packProductRequest,readProductSemantics,readProductHead} from '../../src/core/product-operations.mjs';
import {createGeometryProposalBridge} from '../../src/integration/geometry-proposals.mjs';
import {readArchSnapshot} from '../../src/viewport/arch-view.mjs';
import {source,materials,regions} from '../product-runtime/fixtures.mjs';
import {namedTestAdapters,deferred} from '../app/test-doubles.mjs';

if(!process.env.ARCH_WASM_MODULE||!process.env.PROJECT_REVIEW_RUN)throw Error('Own run and current ARCH_WASM_MODULE required');
const moduleFactory=(await import(pathToFileURL(process.env.ARCH_WASM_MODULE))).default,encode=createMechanicsDomainAdapter(domain),utf8=new TextEncoder();
// Explicit Node-only CAS store. History/document validation and root WASM are
// real; this test does not qualify browser persistence or the production source compositor.
function memoryStore(){const rows=new Map();return {
  capabilities:{selectedBackend:'TEST-memory',database:{readOnly:false}},close(){},
  status:()=>({canEdit:true,canRescue:true,capabilities:{database:{readOnly:false}}}),
  async listProjects(){return [];},async load(id){return structuredClone(rows.get(id)??{status:'empty'});},
  async commit(input,{signal}={}){
    assert.ok(!signal?.aborted);const before=rows.get(input.projectId)?.headRevision??0;
    assert.equal(input.expectedRevision,before,'actual CAS');
    const assets=await Promise.all(input.assets.map(async a=>({...a,bytes:a.bytes.slice(),hash:await sha256(a.bytes),byteLength:a.bytes.length})));
    await verifyDocument(input.document,new Map(assets.map(a=>[a.hash,a])));assert.ok(!signal?.aborted);
    const head={revision:before+1,transactionId:input.transactionId};
    rows.set(input.projectId,{status:'editable',head,headRevision:head.revision,assets,manifest:{document:structuredClone(input.document),engine:input.engine,assets:assets.map(({bytes,...a})=>a),dependencies:[]}});
    return {head};
  }
};}
function ok(r){assert.equal(r.ok,true,JSON.stringify(r));return r;}
async function fixture(){
  const M=await moduleFactory({print:()=>{},printErr:()=>{}}),ops=createProductOperations(M),bridge=createGeometryProposalBridge(),double=namedTestAdapters();let generation=0;
  const controls={confirmations:0,proposalReleases:0,modelReleases:0,gate:null,confirmationStarted:deferred(),tamper:false};
  const reset=()=>{assert.equal(M._arch_control_reset(++generation),1);return generation;};
  const rawEngine={version:'arch-app-adapters/1',identity:{id:'TEST-real-root-proposal',version:'1'},capabilities:[{id:'geometry.build',available:true}],
    async build(input){
      const state=input.state,size=domain.resolveFieldMm(state,'size');
      const sourceHash=await sha256(utf8.encode(source)),headHash=await domainStateFingerprint(state),record=encode(state);
      const packed=packProductRequest({domainRecord:record,headHash,sourceHash,sourceId:9007199254741099n,provenanceId:2000n,materials,regions,
        provenance:{kind:'TEST-explicit-product-bindings',regionSources:regions.map((r,i)=>({sourceIndex:i,sourceKey:i?'right':'left',semanticId:r.semanticId.toString()})),materials:[]},
        upstreamBindings:record.records.filter(r=>r.fieldId<=7).sort((a,b)=>a.fieldId-b.fieldId)});
      const g=reset();let id;
      // The production source bridge regenerates input at the requested size.
      // This explicit fixture uses the root SVG long-edge binding for that step.
      try{id=ops.buildRequest(ops.prepare({kind:'product',source:{kind:'svg',source,longEdgeMm:size},packed},g),g);}
      catch(e){
        if(!e.proposal)throw e;const native=e.proposal;let released=false;
        const p={version:'arch-product-geometry-proposal/1',ticket:structuredClone(input.ticket),code:e.code,head:readProductHead(native.descriptor),metadata:readProductSemantics(native.semanticBytes),
          async confirm(control){assert.deepEqual(control.ticket,input.ticket);assert.ok(!control.signal.aborted);controls.confirmations++;controls.confirmationStarted.resolve();if(controls.gate)await controls.gate.promise;assert.ok(!control.signal.aborted);return ops.confirm(native.id,native.descriptor,{headHash,revision:state.revision},reset());},
          release(){if(!released){released=true;controls.proposalReleases++;ops.releaseProposal(native.id);}}};
        if(!bridge.onGeometryProposal(p)){p.release();throw e;}
        throw Object.assign(Error('PRODUCT_GEOMETRY_PROPOSAL'),{code:'PRODUCT_GEOMETRY_PROPOSAL'});
      }
      const bytes=new Uint8Array(M.HEAPU8.subarray(M._arch_snapshot_ptr(id),M._arch_snapshot_ptr(id)+M._arch_snapshot_len(id))),view=readArchSnapshot(bytes);let released=false;
      return {version:rawEngine.version,ticket:input.ticket,generation:g,leaseId:String(id),blocks:[],
        stats:{widthMm:view.bounds.size[0],depthMm:view.bounds.size[1],heightMm:view.bounds.size[2],triangles:view.triangles.length/3,materialCount:view.parts.length,verdict:'unverified'},
        bytes(){assert.ok(!released);return bytes;},release(){if(!released){released=true;controls.modelReleases++;M._arch_snapshot_release(id);}}};
    }};
  const wrapped=bridge.wrap(rawEngine),engine={...wrapped,async build(input){const r=await wrapped.build(input);return controls.tamper&&r.status==='parameters-proposal'?{...r,parameters:[{id:'size',value:50}]}:r;}};
  const c=createAppController({origin:'https://test.invalid',deviceId:uuid(),adapters:{...double.adapters,engine}});
  c.store=memoryStore();c.session={...c.session,status:'signed-in',user:{id:'TEST-native-proposal-user',name:'TEST',role:'member'}};c.remote.settings={values:{}};c.api.userId=c.session.user.id;c.emit();
  ok(await c.dispatch({type:'project.create',product:'clicky'}));ok(await c.importFile(new File([source],'two-regions.svg',{type:'image/svg+xml'})));
  ok(await c.dispatch({type:'parameter.set',id:'offset',value:'0'}));
  return {c,controls,M,dispose:async()=>{await c.dispose();bridge.reset();assert.equal(M._arch_raster_owned_bytes(),0);}};
}
async function makeProposal(f){
  ok(await f.c.result(()=>f.c.build(true)));const old=f.c.visible.lease,hash=await sha256(old.bytes());
  // A domain-valid size with insufficient room for the actual tray boss.
  // The LEGO base<=bore trigger is rejected earlier by domain validation.
  ok(await f.c.dispatch({type:'parameter.set',id:'size',value:'28'}));
  assert.equal(f.c.doc.state.product,'clicky');assert.equal(domain.resolveFieldMm(f.c.doc.state,'size'),28);
  const before=structuredClone(f.c.doc),head=f.c.headRevision,result=await f.c.result(()=>f.c.build(true));
  assert.equal(result.ok,false,JSON.stringify({result,values:domain.effectiveValues(f.c.doc.state),stats:f.c.visible?.lease.stats}));
  return {old,hash,before,head,result};
}
test('real native no-mesh proposal: explicit consent, one history commit, fresh rebuild and old visible lease',async()=>{
  const f=await fixture();try{
    const p=await makeProposal(f);assert.equal(p.result.diagnostic.code,'PROPOSAL_REQUIRED');
    assert.equal(f.c.preview,null);assert.equal(f.c.visible.lease,p.old);assert.equal(await sha256(p.old.bytes()),p.hash);
    assert.deepEqual(f.c.doc,p.before);assert.equal(f.controls.confirmations,0);
    const pending=f.c.pendingOperation;assert.ok(pending.changes.some(x=>x.includes('28')));
    ok(await f.c.result(()=>f.c.acceptOperation(pending.id,true)));
    assert.equal(f.controls.confirmations,1);assert.equal(f.controls.proposalReleases,1);
    assert.equal(f.c.headRevision,p.head+1);assert.equal(f.c.doc.state.revision,p.before.state.revision+1);
    assert.ok(domain.resolveFieldMm(f.c.doc.state,'size')>28);assert.notEqual(f.c.visible.lease,p.old);
    assert.equal(f.c.visible.lease.ticket.revision,f.c.doc.state.revision);assert.ok(f.c.visible.lease.stats.triangles>12);
    assert.throws(()=>p.old.bytes());assert.equal(f.c.pendingOperation,null);assert.equal(f.c.job,null);
  }finally{await f.dispose();}
});
test('native proposal discard, changed head and response mutation never apply a parameter',async()=>{
  for(const action of ['discard','edit','tamper']){const f=await fixture();try{
    f.controls.tamper=action==='tamper';const p=await makeProposal(f);
    if(action==='tamper'){assert.equal(p.result.diagnostic.code,'GEOMETRY_PROPOSAL_CHANGED');assert.equal(f.c.pendingOperation,null);}
    else{assert.equal(p.result.diagnostic.code,'PROPOSAL_REQUIRED');const id=f.c.pendingOperation.id;
      if(action==='discard')f.c.discardPendingProposal(id);else ok(await f.c.dispatch({type:'parameter.set',id:'size',value:'29'}));
      const late=await f.c.result(()=>f.c.acceptOperation(id,true));assert.equal(late.diagnostic.code,'STALE_CONFIRMATION');
    }
    assert.equal(f.controls.confirmations,0);assert.equal(f.controls.proposalReleases,1);assert.equal(f.c.visible.lease,p.old);assert.equal(await sha256(p.old.bytes()),p.hash);
    assert.equal(domain.resolveFieldMm(f.c.doc.state,'size'),action==='edit'?29:28);
  }finally{await f.dispose();}}
});
test('native acknowledgement in progress cannot be falsely discarded; one-shot acceptance',async()=>{
  const f=await fixture();try{
    await makeProposal(f);f.controls.gate=deferred();const id=f.c.pendingOperation.id;
    const pending=f.c.result(()=>f.c.acceptOperation(id,true));
    await Promise.race([f.controls.confirmationStarted.promise,pending.then(r=>{throw Error('Confirmation did not start: '+JSON.stringify(r));})]);
    assert.throws(()=>f.c.discardPendingProposal(id),{code:'APPROVAL_IN_PROGRESS'});
    const duplicate=await f.c.result(()=>f.c.acceptOperation(id,true));assert.equal(duplicate.diagnostic.code,'STALE_CONFIRMATION');
    f.controls.gate.resolve();ok(await pending);assert.equal(f.controls.confirmations,1);assert.equal(f.controls.proposalReleases,1);
  }finally{f.controls.gate?.resolve();await f.dispose();}
});
