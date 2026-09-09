import {createApplicationSources} from './source-compositor.mjs';
import {createProductSourceContexts} from './product-source-contexts.mjs';
import {createMeshGeneratedBase} from './mesh-generated-base.mjs';
import {createMeshApplicationServices} from './mesh-services.mjs';
import {meshFinalSceneGateState,meshSceneMaterialBindings} from '../mesh-import/src/candidate-qualification.mjs';
import {createProductAdapters} from './product-adapters.mjs';
import {createProductTransactions} from './product-transactions.mjs';
import {createGeometryProposalBridge} from './geometry-proposals.mjs';
import {createExportAdapters} from './export-adapters.mjs';
import {createPrintingAdapters} from './printing-adapters.mjs';
import {createViewportExportProvider} from './viewport-export.mjs';
import {finalSceneGateState} from './final-scene-gates.mjs';
const VERSION='arch-app-adapters/1';
const need=(v,code)=>{if(!v)throw Object.assign(new Error(code),{code});};
const unavailable=reasonCode=>({status:'unverified',reasonCode,reason:reasonCode,verdict:'unverified'});

/** A local serialization namespace for the complete current material table.
 * Full IDs are retained beside every ordinal; neither colors nor narrowed
 * semantic IDs are identity. A different head receives a separately sealed map. */
export function sceneMaterialBindings(current,inspection){
 const rows=current?.state?.content?.app?.materials;
 need(Array.isArray(rows)&&rows.length<=4096,'SCENE_MATERIAL_BINDINGS');
 const names=new Set();for(const row of rows){
  need(typeof row.id==='string'&&row.id.length>0&&row.id.length<=512&&row.id.isWellFormed()&&!names.has(row.id),'SCENE_MATERIAL_BINDINGS');names.add(row.id);
 }
 const mapping=[...names].sort().map((materialId,index)=>({materialId,materialSourceId:index+1}));
 need(inspection?.exportDescriptor?.parts?.every(part=>names.has(part.materialId)),'SCENE_MATERIAL_UNMAPPED');
 return Object.freeze(mapping.map(Object.freeze));
}

/** Compose the actual services around one parent EngineClient/Module. The two
 * qualification factories are mandatory and supplied by the compiled entry;
 * they cannot be selected by a URL, project data, or user settings. */
export function createProductApplicationServices({kernel,sourceLibrary,origin,context,settings,viewport,
 createFinalSceneEvidence,createSourceSVGExport,qualificationWorkerURL,runtimeEvidence,resolveTextBindings,encodePNG,onChange=()=>{}}){
 need(kernel?.operation&&kernel.kernelLeases&&typeof context==='function','PRODUCT_COMPOSITION_REQUIRED');
 need(sourceLibrary&&typeof createFinalSceneEvidence==='function'&&typeof createSourceSVGExport==='function','PRODUCT_QUALIFICATION_REQUIRED');
 const sources=createApplicationSources({kernel,...sourceLibrary,origin,context,encodePNG});
 let product;
 const sourceContexts=createProductSourceContexts({kernel,sources,context,probeDatums:input=>product.probeDatums(input),...(resolveTextBindings?{resolveTextBindings}:{})});
 const proposals=createGeometryProposalBridge();
 product=createProductAdapters({operation:kernel.operation,kernelLeases:kernel.kernelLeases,context,
  withPreparedSource:sourceContexts.withPreparedSource,withPreparedDatumSource:sourceContexts.withPreparedDatumSource,
  probeNative:(client,recipe,{generation})=>client.probeProduct(recipe,{generation}),onGeometryProposal:proposals.onGeometryProposal});
 const transactions=createProductTransactions({sourceContexts,context});
 const productEngine=proposals.wrap(product.engine);
 const engine=Object.freeze({...productEngine,capabilities:[...productEngine.capabilities,{id:'mesh.apply',available:true}]});
 const generatedBase=createMeshGeneratedBase({kernel,sources,context,engineIdentity:engine.identity});
 const meshServices=createMeshApplicationServices({kernel,context,generatedBase,workerURL:qualificationWorkerURL});
 const source=Object.freeze({...sourceContexts.source,capabilities:[...sourceContexts.source.capabilities,{id:'mesh.import',available:true}],
  ingest:input=>input.purpose==='mesh'?meshServices.source.ingest(input):sourceContexts.source.ingest(input)});
 const inspectModel=input=>input.model?.kind==='mesh-scene'?meshServices.mesh.inspectModel(input):product.inspectModel(input);
 const sceneGate=(c,i)=>i.version==='arch-mesh-model-state/1'?meshFinalSceneGateState(c,i):finalSceneGateState(c,i);
 const sceneMaterials=(c,i)=>i.version==='arch-mesh-model-state/1'?meshSceneMaterialBindings(c,i):sceneMaterialBindings(c,i);
 const finalScene=createFinalSceneEvidence({kernelLeases:kernel.kernelLeases,inspectModel,operation:kernel.operation,context,
  gateState:sceneGate,materialSourceIds:sceneMaterials,workerURL:qualificationWorkerURL,onChange});
 const sourceSnapshot=createSourceSVGExport({context,kernel,sources,sourceContexts});
 const printing=createPrintingAdapters({settings,context,kernelLeases:kernel.kernelLeases,finalScene:finalScene.describe,
  runtime:runtimeEvidence??(()=>unavailable('PRINTING_RUNTIME_UNVERIFIED'))});
 const frame=createViewportExportProvider({viewport,context});
 const exporter=createExportAdapters({operation:kernel.operation,kernelLeases:kernel.kernelLeases,context,
  finalScene:finalScene.describe,sourceSnapshot,viewport:frame,printing});
 function checkedScene(model){const current=context(),record=kernel.kernelLeases.get(model);return current&&record?finalScene.describe(record,current):unavailable('FINAL_SCENE_EVIDENCE_UNVERIFIED');}
 const preparation={
  async prepare(input){
   // Each provider checks the exact captured authority before publishing. Root
   // calls remain sequential so native generations and source leases stay owned.
   // A source whose colour regions are not adopted yet has no SVG snapshot to
   // prepare: the export gate says so on the SVG option itself, so the refusal
   // is not a project problem, and it must not skip the printing refresh below.
   if(input.state.content.app.source){try{await sourceSnapshot.refresh({control:input});}catch(error){if(error?.code!=='SOURCE_SVG_REGIONS_REQUIRED')throw error;}}
   need(!input.signal.aborted,'CANCELLED');
   if(input.model&&input.model.ticket.revision===input.ticket.revision&&checkedScene(input.model).status!=='ready')
    await finalScene.qualify({model:input.model,control:input});
   need(!input.signal.aborted,'CANCELLED');await printing.refresh({signal:input.signal});
  },
  async qualifyModel(input){await finalScene.qualify({model:input.model,control:input});need(!input.signal.aborted,'CANCELLED');await printing.refresh({signal:input.signal});},
  modelVerdict(model){const evidence=checkedScene(model);return evidence.status==='ready'?evidence.meshVerdict:evidence.verdict??'unverified';},
 };
 return Object.freeze({engine,source,meshTransactions:meshServices,exporter,printing,preparation,product,transactions,sourceContexts,sourceSnapshot,finalScene,
  async reset(){
   const failures=[];
   for(const retire of [()=>meshServices.reset(),()=>transactions.reset(),()=>sourceContexts.reset(),()=>proposals.reset(),()=>exporter.reset(),()=>printing.reset(),()=>sourceSnapshot.reset(),()=>finalScene.reset(),()=>product.reset(),()=>sources.reset()]){
    try{await retire();}catch(error){failures.push(error);}
   }
   need(failures.length===0,'PRIVATE_RESET_FAILED');
  },
 });
}
