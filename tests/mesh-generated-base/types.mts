import {createMeshGeneratedBase,type MeshGeneratedBase,type GeneratedBaseScope,type GeneratedBaseContext} from '../../src/integration/mesh-generated-base.mjs';
import type {Control,DomainState,ModelLease} from '../../src/app/adapters.mjs';
declare const service:MeshGeneratedBase,control:Control,state:DomainState,current:GeneratedBaseContext;
declare const assets:Parameters<MeshGeneratedBase['prepare']>[0]['assets'];
const scoped:GeneratedBaseScope=await service.prepare({control,savedBaseState:state,currentState:current.state,assets});
const model:ModelLease=scoped.model;
const checked=service.verifyGeneratedBase({model,control});
checked.current.headHash satisfies string;
scoped.check();scoped.exportDescriptor;await scoped.release();
const result:number=await service.withBase({control,base:checked.base,assets,mode:'replay'},async s=>{
 s.assertCurrent();return s.model.stats.triangles;
});
await service.reset();await service.dispose();
type FactoryOptions=Parameters<typeof createMeshGeneratedBase>[0];
declare const options:FactoryOptions;
const built:MeshGeneratedBase=createMeshGeneratedBase(options);
void result;void built;
