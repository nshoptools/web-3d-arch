import {createSchedule} from '../../src/domain/layers.mjs';
import {createPrintingAdapters} from '../../src/integration/printing-adapters.mjs';
import {canonical} from '../../src/printing/src/contracts.mjs';
export const clone=x=>structuredClone(x),APP='arch-app-adapters/1',BAMBU='export.3mf.bambu-project',U1='export.3mf.snapmaker-project';
export const modulePins={moduleSha256:'65c5bfc89adcd0a8d34c4d47743c6cc05167688f6ecfe4179772a2d1f4029c62',wasmSha256:'f13bdd2b5b778ac0f2ec70fb2d43052de68e7d415d03218bea6f0a09718e40a9'};
export function environment(profile){
 const userId='test-member-a',projectId='test-project-a',sessionKey={},generation=19,revision=7;
 const app={printerId:profile.payload.id,materials:[
  {id:'material:đỏ',label:'Vùng đỏ',color:'#FF0000',slot:1,excluded:false},
  {id:'material:xanh',label:'Vùng xanh',color:'#0000FF',slot:2,excluded:false}]};
 const state={kind:'web-3d-arch.project-domain',schemaVersion:1,revision,product:'keychain',sourceKind:'svg',schedule:createSchedule({firstLayerHeight:.25,layerHeight:.2,sources:{firstLayerHeight:'user',layerHeight:'user'},profileId:null}),content:{app},parameters:{common:{},byProduct:{}},provenance:{}};
 let live=true;const root={id:11,generation,epoch:3,bytes(){if(!live)throw Object.assign(Error('released'),{code:'SNAPSHOT_RELEASED'});return new Uint8Array(128);}};
 const model={version:APP,ticket:{id:'build-test',userId,projectId,revision,generation:400},generation,leaseId:'test-model-11',bytes:()=>root.bytes(),release(){live=false;}};
 const client={epoch:3,disposed:false,export3MF(){throw Error('UNIT_TEST_NO_RUNTIME');}},record={root,client};
 const context={state,userId,projectId,sessionKey,headHash:'a'.repeat(64),model};
 const scene={status:'ready',key:'analytic-test-evidence',projectId,revision,headHash:context.headHash,snapshotId:11,snapshotGeneration:generation,epoch:3,snapshotSha256:'b'.repeat(64),
  gates:{invalidInput:false,kernelFailure:false,assemblyView:false,unappliedMeshEdit:false},meshVerdict:'unverified',projectScheduleHash:state.schedule.hash,
  sourceHashes:[{id:'analytic-source',sha256:'c'.repeat(64)}],
  parts:[{partIndex:0,sourceIndex:8,semanticId:'region:left',sourceSemanticIds:['authored:left'],materialId:'material:đỏ',materialSourceId:1001,slot:1,rgba:0xff0000ff},
   {partIndex:1,sourceIndex:9,semanticId:'region:right',sourceSemanticIds:['authored:right'],materialId:'material:xanh',materialSourceId:1002,slot:2,rgba:0x0000ffff}],
  provenance:{testOnly:'Metadata fixture; no mesh qualification asserted'}};
 const runtime={version:'arch-printing-runtime/1',status:'ready',key:'unit-runtime-evidence',client,epoch:3,runtimeABI:2,printingABI:1,kernelPrintingABI:2,...modulePins,evidenceId:'unit-only-ABI-fixture'};
 const env={auth:{userId,sessionKey,settings:{schemaVersion:1,revision:2,values:{printerProfiles:[clone(profile)]}}},current:context,scene,runtime,model,root,record,kernelLeases:new WeakMap([[model,record]])};
 env.bindings={settings:()=>env.auth,context:()=>env.current,kernelLeases:env.kernelLeases,finalScene:()=>env.scene,runtime:()=>env.runtime};
 env.adapter=createPrintingAdapters(env.bindings);
 env.replaceProfile=async modify=>{const p=clone(env.auth.settings.values.printerProfiles[0].payload);modify(p);env.auth.settings.values.printerProfiles=[await sealed(p)];env.auth.settings.revision++;};
 return env;
}
