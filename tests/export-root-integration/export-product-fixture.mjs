// Actual same-Module SVG -> source assembly -> mechanics -> APMS/PRHD -> exporter.
// Client transport and committed source/viewport providers are labelled doubles.
import {makeRequest,source} from '../product-runtime/fixtures.mjs';
import {createProductOperations,readProductSemantics} from '../../src/core/product-operations.mjs';
import {domainStateFingerprint} from '../../src/storage/history.mjs';
import {sha256} from '../../src/printing/src/contracts.mjs';
import {createExportAdapters} from '../../src/integration/export-adapters.mjs';
import {productEvidenceDouble} from './export-product-evidence-double.mjs';
import {setup} from './export-fixture.mjs';

export async function productSetup(T,{product='keychain',changes=[],proof=null,profiles={}}={}){
 const sourceHash=await sha256(new TextEncoder().encode(source)),initial=makeRequest(product,'noi',{sourceHash,headHash:'0'.repeat(64),changes});
 const state=structuredClone(initial.project);
 state.content.app={source:{id:'test:authored-svg',revision:1,raw:{hash:sourceHash}}};
 const headHash=await domainStateFingerprint(state),request=makeRequest(product,'noi',{sourceHash,headHash,changes});
 const ops=createProductOperations(T.M),generation=T.next();let id=0,root,h;
 try{
  id=ops.buildRequest(ops.prepare({kind:'product',source:{kind:'svg',source},packed:request.packed},generation),generation);
  root=T.adoptRoot(id,generation,ops.metadata(id));h=await setup(T,{nativeRoot:root,profiles});
 }catch(e){if(root)root.release();else if(id)T.M._arch_snapshot_release(id);if(e.proposal)ops.releaseProposal(e.proposal.id);throw e;}
 for(const key of Object.keys(h.state))delete h.state[key];Object.assign(h.state,state);
 Object.assign(h.model.ticket,{revision:state.revision});h.context.headHash=headHash;
 Object.assign(h.source,{sourceId:state.content.app.source.id,sourceRevision:1,rawHash:sourceHash,dependencies:[{sha256:sourceHash,bytes:new TextEncoder().encode(source).length}]});
 for(const id of ['stl-union','stl-material-zip','svg-section'])h.exportOptions[id].inspection=true;
 const sem=readProductSemantics(root.metadata.semanticBytes);
 // Explicit test registry. IDs are supplied keyed by their authored semantic
 // material identity, not by whichever part order/slot/color is encountered.
 const registry={key:'test:explicit-material-registry:1',entries:[
  ...Array.from({length:9},(_,i)=>({materialId:'explicit-material-'+(3000+i),materialSourceId:11000+i})),
  {materialId:'explicit-material-4001',materialSourceId:12001},{materialId:'explicit-material-4002',materialSourceId:12002}]};
 let meshProof=proof;
 const binding=productEvidenceDouble({kernelLeases:h.bindings.kernelLeases,context:h.bindings.context,
  materialSourceIds:()=>registry,meshEvidence:input=>typeof meshProof==='function'?meshProof(input):meshProof});
 h.exporter.dispose();h.bindings.finalScene=binding.describe;h.exporter=createExportAdapters(h.bindings);
 const oldInput=h.input,oldClose=h.close;h.input=id=>{const value=oldInput(id);value.ticket.revision=state.revision;return value;};
 return Object.assign(h,{sem,binding,registry,record:h.bindings.kernelLeases.get(h.model),
  setProof(p){meshProof=p;},close(){binding.dispose();h.exporter.dispose();oldClose();}});
}
