import {VERSION,assert,data,decode} from './common.mjs';
import {effectiveValues,resolveFieldMm} from '../domain/index.mjs';
/** Real KernelLease binding. Caller shares kernelLeases with the actual native exporter. */
export function createEngineAdapter({client,readArchSnapshot,identity,selectRecipe,nextTransportGeneration,kernelLeases=new WeakMap()}){
 assert(client?.build&&readArchSnapshot&&identity?.version&&selectRecipe&&typeof nextTransportGeneration==='function','ENGINE_BINDING_REQUIRED');
 return {version:VERSION,identity,capabilities:[{id:'geometry.build',available:true}],
  async build({ticket,state,assets,signal,onProgress}){
   const recipe=await selectRecipe({state,assets});
   assert(recipe?.kind==='svg'&&typeof recipe.source==='string'&&Number.isFinite(recipe.thicknessMm)&&recipe.thicknessMm>0&&Number.isFinite(recipe.longEdgeMm)&&recipe.longEdgeMm>0&&Number.isFinite(recipe.toleranceMm)&&recipe.toleranceMm>0,'BUILD_RECIPE');
   assert(!signal.aborted,'CANCELLED');const generation=nextTransportGeneration();assert(Number.isSafeInteger(generation)&&generation>0&&generation<0xffffffff,'TRANSPORT_GENERATION');
   const cancel=()=>{void client.cancel();};signal.addEventListener('abort',cancel,{once:true});let root,retained=false;
   try{
    onProgress({stage:'worker-build',progress:null});root=await client.build(recipe,{generation});assert(!signal.aborted,'CANCELLED');
    const snapshot=readArchSnapshot(root.bytes());assert(snapshot.generation===generation&&root.generation===generation&&snapshot.bounds,'ARCH_GENERATION');
    const [widthMm,depthMm,heightMm]=snapshot.bounds.size;let released=false;
    const model={version:VERSION,ticket:data(ticket),generation,leaseId:'kernel-'+root.epoch+'-'+root.id,bytes:()=>{assert(!released,'LEASE_RELEASED');return root.bytes();},
     stats:{widthMm,depthMm,heightMm,triangles:snapshot.triangles.length/3,materialCount:snapshot.parts.length,verdict:'unverified'},
     blocks:snapshot.parts.map(p=>({id:'part-'+p.index,label:'Part '+(p.index+1),kind:'body',materialId:null})),
     release(){if(!released){released=true;kernelLeases.delete(model);root.release();}}};
    kernelLeases.set(model,root);retained=true;return model;
   }finally{signal.removeEventListener('abort',cancel);if(!retained)root?.release();}
  }};
}
/** Explicit source-only extrusion recipe. Caller adjudicates which project features this kernel implements. */
export function svgExtrusionRecipe({toleranceMm,authorizeScope}){
 assert(Number.isFinite(toleranceMm)&&toleranceMm>0&&typeof authorizeScope==='function','RECIPE_POLICY_REQUIRED');
 return async({state,assets})=>{
  const source=state.content.app.source;assert(source?.kind==='svg'&&!source.raster,'SVG_SOURCE_REQUIRED');assert(await authorizeScope(state)===true,'ENGINE_FEATURE_SCOPE_UNSUPPORTED');
  const bytes=assets.get(source.raw.hash);assert(bytes&&bytes.length<=1048576,'SVG_BYTE_BUDGET');
  return {kind:'svg',source:decode(bytes),thicknessMm:resolveFieldMm(state,'baseH'),longEdgeMm:effectiveValues(state).size,toleranceMm};
 };
}
export function createThreeViewportAdapter({ThreeViewport,onSelection=()=>{},onDiagnostic=()=>{},onCapabilitiesChanged=()=>{}}){
 let viewport=null,printer=null;
 return {version:VERSION,capabilities:[{id:'viewport.webgl',available:false,reason:'Viewport has not been attached/probed'},{id:'viewport.center-bed',available:false,reason:'Select a verified bed profile before centering'}],
  attach(host){
   assert(!viewport,'VIEWPORT_ALREADY_ATTACHED');viewport=new ThreeViewport(host,{onSelection,onDiagnostic});if(printer)viewport.setPrinter(printer);
   this.capabilities=this.capabilities.map(c=>c.id==='viewport.webgl'?{id:c.id,available:true}:c);onCapabilitiesChanged();
   const attached=viewport;let detached=false;return ()=>{if(detached)return;detached=true;attached.dispose();if(viewport!==attached)return;viewport=null;this.capabilities=this.capabilities.map(c=>c.id==='viewport.webgl'?{id:c.id,available:false,reason:'Viewport detached'}:c);onCapabilitiesChanged();};
  },
  setModel(input){if(viewport)viewport.setModel(input);},
  action(action){assert(viewport,'VIEWPORT_NOT_ATTACHED');return viewport.action(action);},
  setSelection(id){viewport?.setSelection(id);},
  describeFrame(){return viewport?.describeFrame()??{status:'disabled',reasonCode:'PNG_VIEWPORT_UNAVAILABLE',reason:'Khung 3D chưa được gắn.'};},
  capturePNG(descriptor,control){assert(viewport,'VIEWPORT_NOT_ATTACHED');return viewport.capturePNG(descriptor,control);},
  setPrinter(profile){printer=profile;viewport?.setPrinter(profile);this.capabilities=this.capabilities.map(c=>c.id==='viewport.center-bed'?{id:c.id,available:!!profile}:c);onCapabilitiesChanged();},
  clear(){viewport?.clear();},clearPrivateState(){viewport?.clear();viewport?.setPrinter(null);printer=null;this.capabilities=this.capabilities.map(c=>c.id==='viewport.center-bed'?{id:c.id,available:false,reason:'Select a verified bed profile before centering'}:c);}
 };
}
