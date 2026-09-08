import test from 'node:test';
import assert from 'node:assert/strict';
import {M,client,operation,raster,svgState,rasterState,ownTestState,setLive,controlFor,noOwned} from '../product-app/harness.mjs';
import {createProductSourceContexts} from '../../src/integration/product-source-contexts.mjs';
import {createProductAdapters,validateProductMaterialExtension} from '../../src/integration/product-adapters.mjs';
import {validateState} from '../../src/app/documents.mjs';
client.serviceCapabilities={geometryVersions:{mechanicsAbi:M._arch_mech_abi_version(),mechanicsSemantics:M._arch_mech_semantics_version(),sourceAbi:M._arch_source_abi_version(),sourceSemantics:M._arch_source_semantics_version(),datumExtension:M._arch_mech_source_datum_extension_version()}};
let live;
function bridge(){
 const kernel={operation,ensureRuntime:async()=>client,kernelLeases:new WeakMap()};
 const sources={source:{ingest(){throw Error('Unused in this fixture');}},raster:raster.source};
 const source=createProductSourceContexts({frameTransport:'product-context-bundle/2',kernel,sources,context:()=>live});
 const product=createProductAdapters({operation,kernelLeases:kernel.kernelLeases,context:()=>live,withPreparedSource:source.withPreparedSource});
 return {source,product};
}
async function initial(kind){
 const fixture=await (kind==='svg'?svgState:rasterState)(),state=structuredClone(fixture.state),source=structuredClone(state.content.app.source);
 delete source.metadata.productBindings;
 state.content.app.source=null;state.content.app.materials=[];state.content.app.materialDefaults=[];state.sourceKind='none';state.revision--;
 live={sessionKey:'test-session-1',userId:'user-a',projectId:'project-persistent',state};setLive(live);
 return {state,source,assets:fixture.assets};
}
for(const kind of ['svg','raster'])test('Production canonical bridge '+kind+' adopted and built',async()=>{
 const f=await initial(kind),c=controlFor(f.state),{source,product}=bridge();
 const reply=await source.prepareAdoption({...c,purpose:'source',operation:'import',sourceContext:f.source.metadata.sourceContext,...f,materials:[],materialDefaults:[]});
 assert.deepEqual(Object.keys(reply).sort(),['version','ticket','productBindings','materials','materialDefaults'].sort());
 for(const m of [...reply.materials,...reply.materialDefaults]){validateProductMaterialExtension(m.product);assert.equal(typeof m.backgroundEligible,'boolean');}
 const state=structuredClone(f.state);state.revision++;state.sourceKind=f.source.kind;
 state.content.app.source={...f.source,metadata:{...f.source.metadata,productBindings:reply.productBindings}};
 state.content.app.materials=structuredClone(reply.materials);state.content.app.materialDefaults=structuredClone(reply.materialDefaults);
 live={...live,state:validateState(state)};setLive(live);
 const model=await product.engine.build({...controlFor(state),state,assets:f.assets});
 assert.equal(model.product.semantics.mechanicsSemantics,3);assert.equal(model.product.semantics.sourceSemantics,2);
 model.release();await product.reset();source.reset();noOwned();
});
