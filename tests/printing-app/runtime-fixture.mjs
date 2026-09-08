// Actual native/RPC outputs; upstream scene authority remains an explicitly named analytic test fixture.
import {createExportAdapters} from '../../src/integration/export-adapters.mjs';
import {createPrintingAdapters} from '../../src/integration/printing-adapters.mjs';
import {readArchSnapshot} from '../../src/viewport/arch-view.mjs';
import {sha256} from '../../src/printing/src/contracts.mjs';
import {environment,APP,BAMBU,U1} from './context-fixture.mjs';
export const SOURCE='<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="0 0 20 10"><path fill="#ff0000" d="M0 0H10V10H0Z"/><path fill="#0000ff" d="M10 0H20V10H10Z"/></svg>';
const need=(x,m)=>{if(!x)throw Error(m);};
export async function bindRuntime({client,operation,root,profile,proof}){
 const e=environment(profile);e.adapter.dispose();const view=readArchSnapshot(root.bytes());
 need(view.parts.length===2,'analytic source must have two parts');need(view.parts[0].color===0xff0000ff&&view.parts[1].color===0x0000ffff,'analytic source part order/color');
 Object.assign(e.model,{generation:root.generation,leaseId:'runtime-'+root.epoch+'-'+root.id,bytes:()=>root.bytes(),release:()=>root.release()});
 e.root=root;e.record={root,client};e.kernelLeases=new WeakMap([[e.model,e.record]]);
 e.current.model=e.model;const rawHash=await sha256(new TextEncoder().encode(SOURCE));
 e.current.state.content.app.source={id:'analytic-two-colors',revision:0,raw:{hash:rawHash,byteLength:new TextEncoder().encode(SOURCE).length}};
 Object.assign(e.scene,{snapshotId:root.id,snapshotGeneration:root.generation,epoch:root.epoch,snapshotSha256:await sha256(new Uint8Array(root.bytes())),
  sourceHashes:[{id:'analytic-two-colors',sha256:rawHash}],provenance:{testOnly:'Explicit analytic material authority; real ARCH bytes and output independently read; mesh verdict remains unverified'}});
 e.scene.parts.forEach((part,index)=>Object.assign(part,{partIndex:index,sourceIndex:view.parts[index].sourceIndex}));
 e.runtime={version:'arch-printing-runtime/1',status:'ready',key:proof.evidenceId,client,epoch:client.epoch,...proof};
 e.bindings={settings:()=>e.auth,context:()=>e.current,kernelLeases:e.kernelLeases,finalScene:()=>e.scene,runtime:()=>e.runtime};
 e.adapter=createPrintingAdapters(e.bindings);
 const pose={kind:'manufacturing',restOnBed:false};
 e.current.exportOptions={'3mf-bambu-project':{filename:'Inspection-P1S.3mf',inspection:true,pose},'3mf-snapmaker-project':{filename:'Inspection-U1.3mf',inspection:true,pose},
  'stl-union':{filename:'Neutral-inspection.stl',inspection:true,pose,errorMm:.004}};
 e.exporter=createExportAdapters({operation,kernelLeases:e.kernelLeases,context:()=>e.current,finalScene:()=>e.scene,printing:e.adapter});
 e.input=(formatId,signal=new AbortController().signal)=>({version:APP,ticket:{...e.model.ticket,id:'printing-export-'+formatId,generation:901},
  state:e.current.state,model:e.model,renderer:{available:false},formatId,prerequisite:'matching-model',assets:new Map(),signal,onProgress(){}});
 e.close=()=>{e.exporter.dispose();e.adapter.dispose();root.release();};
 return e;
}
export {BAMBU,U1};
