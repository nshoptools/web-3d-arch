// Test-only transport/provider doubles, backed by real same-Module native services.
// This does not exercise or claim qualification of the parent's EngineClient RPC.
import {createExportAdapters,EXPORT_FORMATS} from '../../src/integration/export-adapters.mjs';
import {readArchSnapshot} from '../../src/viewport/arch-view.mjs';
import {encodeFinalExportOptions,exportFinalFileBytes} from '../../src/kernel/final-scene-export/runtime-helper.mjs';
import {createUnifiedPrinting} from '../../src/printing/src/unified.mjs';
import {sha256,sealed} from '../../src/printing/src/contracts.mjs';
import {encodeRasterPNG} from '../../src/core/png-encode.mjs';
import {createSchedule} from '../../src/domain/layers.mjs';

export const sourceSVG='<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="0 0 20 10"><defs><linearGradient id="paint"><stop stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff"/></linearGradient><clipPath id="clip"><path d="M0 0H20V10H0Z"/></clipPath></defs><g clip-path="url(#clip)"><path fill="url(#paint)" fill-rule="evenodd" d="M0 0H20V10H0Z M8 3H12V7H8Z"/><path fill="#00ff00" d="M1 1C2 1 2 2 1 2Z"/></g></svg>';
export const rgba=new Uint8ClampedArray([255,0,0,255,0,0,255,255,0,255,0,128,0,0,0,0]);
const clone=v=>structuredClone(v);
export function serviceTransport(M){
 let generation=0;const printing=typeof M._arch3mf_abi_version==='function'?createUnifiedPrinting(M):null;
 const counters={operations:0,final:0,printing:0,rootReleases:0,providerReleases:0,frameReleases:0};
 const before={operation:null,final:null,printing:null,acquire:null,serialize:null,capture:null,release:null};
 const next=()=>{const g=++generation;if(M._arch_control_reset(g)!==1)throw Error('test control reset');return g;};
 const read=id=>M.HEAPU8.subarray(M._arch_snapshot_ptr(id),M._arch_snapshot_ptr(id)+M._arch_snapshot_len(id));
 const client={disposed:false,serviceCapabilities:{finalExport:M._arch_final_export_version?.()===1},
  async finalExport(root,options,{generation}){counters.final++;const c=clone(options);c.generation=root.generation;await before.final?.(c);return exportFinalFileBytes(M,root.id,encodeFinalExportOptions(c),generation);},
  async export3MF(root,request,{generation,format}){counters.printing++;await before.printing?.(request);if(!printing)throw Error('test module has no lib3mf');const reader=printing.acquireReaderLease(root.id,root.generation);return printing.exportSnapshot3MF(reader,request,{format});}
 };
 return {M,client,counters,before,printing,
  async operation(control,invoke){if(control.signal.aborted)throw Object.assign(Error('CANCELLED'),{code:'CANCELLED'});counters.operations++;const g=next();await before.operation?.(control,g);return invoke(client,g);},
  makeRoot(index){const g=next(),id=M._arch_final_test_fixture(index,g);if(!id)throw Error('test fixture '+index);let released=false;
   return {id,generation:g,epoch:73,bytes(){if(released)throw Object.assign(Error('SNAPSHOT_RELEASED'),{code:'SNAPSHOT_RELEASED'});return read(id);},release(){if(!released){released=true;counters.rootReleases++;if(M._arch_snapshot_release(id)!==1)throw Error('test root release');}}};},
  stats:()=>Array.from({length:5},(_,i)=>M._arch_final_test_stats(i)),
 };
}
export async function setup(transport,{index=2,profiles={},model=true,firstLayerHeight=.16}={}){
 const T=transport,root=T.makeRoot(index),view=readArchSnapshot(root.bytes()),sourceBytes=new TextEncoder().encode(sourceSVG),rawHash=await sha256(sourceBytes);
 const state={revision:7,schedule:createSchedule({firstLayerHeight,layerHeight:.2,sources:{firstLayerHeight:'user',layerHeight:'user'},profileId:null}),content:{app:{source:{id:'svg:committed',revision:3,raw:{hash:rawHash}}}}};
 const ticket={id:'build-1',userId:'owner-a',projectId:'project-a',revision:7,generation:101};
 const modelLease={ticket,leaseId:'primary-'+root.id,generation:root.generation,bytes:()=>root.bytes(),release:()=>{throw Error('adapter must not release model');}};
 const native={filename:'Móc kiểm.stl',inspection:false,pose:{kind:'manufacturing',restOnBed:false},errorMm:.004};
 const exportOptions={
  'stl-union':clone(native),'stl-material-zip':{...clone(native),filename:'Móc kiểm.zip'},
  'svg-section':{...clone(native),filename:'Mặt cắt.svg',section:{mode:'single',zMm:1,units:'mm',side:'front',color:'black'}},
  'svg-color':{filename:'Nguồn màu.svg',inspection:false,units:'source',side:'source',color:'source'},
  'png-viewport':{filename:'Khung nhìn.png',inspection:false},
  '3mf-bambu-project':{filename:'Bambu P1S.3mf',inspection:true,pose:{kind:'manufacturing',restOnBed:false}},
  '3mf-snapmaker-project':{filename:'Snapmaker U1.3mf',inspection:true,pose:{kind:'manufacturing',restOnBed:false}},
 };
 const context={state,userId:ticket.userId,projectId:ticket.projectId,headHash:'e'.repeat(64),sessionKey:{opaque:'session-1'},model:model?modelLease:null,exportOptions};
 const kernelLeases=new WeakMap([[modelLease,{root,client:T.client}]]);
 let evidence={status:'ready',key:'final:1',projectId:context.projectId,revision:7,headHash:context.headHash,snapshotId:root.id,snapshotGeneration:root.generation,epoch:root.epoch,snapshotSha256:await sha256(root.bytes().slice()),
  gates:{invalidInput:false,kernelFailure:false,assemblyView:false,unappliedMeshEdit:false},meshVerdict:'pass',projectScheduleHash:state.schedule.hash,sourceHashes:[{id:'svg:committed',sha256:rawHash}],
  parts:view.parts.map(p=>({partIndex:p.index,sourceIndex:p.sourceIndex,slot:p.color===0xff0000ff?1:2,rgba:p.color,materialSourceId:p.color===0xff0000ff?1201:1202,semanticId:'source:chữ-á:part-'+p.index,materialId:p.color===0xff0000ff?'user:đỏ':'user:xanh',sourceSemanticIds:['source:chữ-á','svg:path-'+p.sourceIndex],materialProvenanceId:p.color===0xff0000ff?'18446744073709551001':'18446744073709551002'})),provenance:{test:'synthetic analytic final source; injected verdict for export routing; measured separately'}};
 const source={status:'ready',key:'source:3',sourceId:'svg:committed',sourceRevision:3,rawHash,representation:'validated-vector-paint',validation:'pass',serializer:'test committed canonical paint provider (double)',dependencies:[{sha256:rawHash,bytes:sourceBytes.length}],provenance:{curves:true,holes:true,paint:'original test gradient',testProvider:true}};
 const frame={status:'ready',key:'viewport:1',frameKey:'camera/model/source-view:1',width:2,height:2,displayedRevision:7,displayedLeaseId:model?modelLease.leaseId:null,view:model?'model':'source',provenance:{producer:'synthetic frame double; real portable PNG encoder'}};
 const profileDescriptors={};
 for(const [adapterId,profile] of Object.entries(profiles)){
  profileDescriptors[adapterId]={status:'ready',key:adapterId+':1',runtimeAvailable:!!T.printing,printerProfile:clone(profile),schedule:await sealed({schemaVersion:1,kind:'constant-first-regular',profileId:profile.payload.id,profileHash:profile.sha256,firstLayerHeight,layerHeight:.2,origin:{firstLayerHeight:'user',layerHeight:'user'}}),materialTable:{schemaVersion:1,materials:[...new Map(evidence.parts.map(p=>[p.materialId,{id:p.materialId,name:p.materialId,type:profile.payload.settings.filament_type[p.slot-1],color:'#'+p.rgba.toString(16).padStart(8,'0').slice(0,6),slot:p.slot,extruder:profile.payload.printer.slotExtruders[p.slot-1]}])).values()]},provenance:{testOnly:true}};
 }
 const sourceSnapshot={describe:()=>source,async acquire(){await T.before.acquire?.();return {async serializeSVG(){await T.before.serialize?.();return {bytes:sourceBytes,key:source.key,sourceId:source.sourceId,sourceRevision:source.sourceRevision,rawHash:source.rawHash,provenance:{testProvider:true}};},async release(){T.counters.providerReleases++;await T.before.release?.();}};}};
 const viewport={describe:()=>frame,async capture(){await T.before.capture?.();return {bytes:await encodeRasterPNG({width:2,height:2,data:rgba}),key:frame.key,frameKey:frame.frameKey,async release(){T.counters.frameReleases++;await T.before.release?.();}};}};
 const bindings={operation:T.operation,kernelLeases,context:()=>context,finalScene:()=>evidence,sourceSnapshot,viewport,printing:{describe:id=>profileDescriptors[id]??{status:'unverified',reasonCode:'PRINTING_PROFILE_UNVERIFIED',reason:'No selected sealed profile'}}};
 const exporter=createExportAdapters(bindings),assets=new Map([[rawHash,sourceBytes]]);
 const input=id=>({version:'arch-app-adapters/1',ticket:{...ticket,id:'export-'+id,generation:902},signal:new AbortController().signal,onProgress(){},state,model:context.model,renderer:{available:true},formatId:id,prerequisite:EXPORT_FORMATS.find(f=>f.id===id).prerequisite,assets});
 return {T,root,model:modelLease,context,state,exportOptions,source,sourceBytes,rawHash,frame,assets,profileDescriptors,bindings,exporter,input,get evidence(){return evidence;},set evidence(v){evidence=v;},close(){exporter.dispose();root.release();for(const k of Object.keys(T.before))T.before[k]=null;}};
}
