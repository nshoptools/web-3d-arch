import {createProductAdapters,prepareBindings,PRODUCT_ROLES,PRODUCT_MATERIAL_DEFAULTS,type PreparationContext,type BorrowedSource,type RuntimeClient,type SourceDescriptor,type CanonicalContext} from '../../src/integration/product-adapters.mjs';
import type {Control,DomainState,ModelLease} from '../../src/app/adapters.mjs';
declare const c:Control,state:DomainState,source:SourceDescriptor,canonicalContexts:CanonicalContext[];
declare const client:RuntimeClient;
declare function withPrepared<T>(context:PreparationContext,consume:(source:BorrowedSource)=>Promise<T>):Promise<T>;
const record=await prepareBindings({projectId:c.ticket.projectId,state,source,canonicalContexts,defaults:PRODUCT_MATERIAL_DEFAULTS});
const delta={productBindings:record.productBindings,materials:record.materials,materialDefaults:record.materialDefaults};
delta.productBindings.roles.body satisfies string;
PRODUCT_ROLES satisfies readonly string[];
const a=createProductAdapters({
 operation:async(control,invoke)=>invoke(client,1),
 kernelLeases:new WeakMap<ModelLease,{root:Awaited<ReturnType<typeof client.build>> & {metadata:any};client:RuntimeClient}>(),
 context:()=>({userId:c.ticket.userId,projectId:c.ticket.projectId,sessionKey:'1:1',state}),
 withPreparedSource:withPrepared,
 onGeometryProposal:proposal=>{proposal.release();return true;},
 onSourceProposal:()=>true
});
const model=await a.engine.build({...c,state,assets:new Map()});
model.blocks[0].sourceSemanticIds satisfies string[];
const current=await a.inspectModel({model,control:c});
current.gates.independentMeshVerdict satisfies 0;
const hp=await a.prepareHeightBindings({model,control:c,changes:[{target:{kind:'region',sourceKey:'persistent'},mode:'layers',layers:4}]});
hp.requiresNativeRebuild satisfies true;
// @ts-expect-error Unspecified binding is not legal for layer counts.
a.prepareHeightBindings({model,control:c,changes:[{target:{kind:'parameter',field:'artH'},mode:'layers',layers:4,binding:'unspecified-mm'}]});
model.release();
await a.prepareRecipe({...c,state,assets:new Map()},async recipe=>{
 const root=await client.build(recipe.recipe,{generation:2});
 try{return await a.mapModelLease({prepared:recipe,root,client,generation:2});}
 catch(error){root.release();throw error;}
});
await a.reset();
// @ts-expect-error A Module factory is not an allowed injection or initializer.
createProductAdapters({moduleFactory:async()=>({})});
// @ts-expect-error Durable region identity cannot be a numeric paint index.
const badContext:CanonicalContext={key:'s',sourceHash:'x',derivationHash:null,regions:[{nativeKey:'n',sourceIndex:0,geometryHash:'g',authoredKey:2,rgba:0xffffffff}]};
