import type {Control,DomainState,ModelLease} from '../app/adapters.mjs';
import type {ProductModelLease,CurrentModelState,RootLease,RuntimeClient,Operation,Json} from './product-adapters.mjs';
import type {SourceContextKernel,SourceContextServices} from './product-source-contexts.mjs';
export const MESH_GENERATED_BASE_VERSION:'arch-mesh-generated-base/1';
export const MESH_GENERATED_BASE_LIMITS:Readonly<{concurrent:1;stateBytes:number;assets:10000;assetBytes:number;oneAssetBytes:number}>;
export class MeshGeneratedBaseError extends Error {code:string;details:Record<string,unknown>;constructor(code:string,details?:Record<string,unknown>)}
export interface GeneratedBaseAsset {hash:string;byteLength:number;kind:string;bytes:Uint8Array}
export interface GeneratedBaseDescriptor {
 version:'arch-generated-base-replay/1';stateAssetHash:string;stateFingerprint:string;
 engine:{id:string;version:string};required:{rootAbi:2;arch:1;mechanicsSemantics:3;sourceSemantics:2;meshRuntime:1};
}
export interface GeneratedBaseContext {
 state:DomainState;userId:string;projectId:string;sessionKey:string;headHash:string;model:ModelLease|null;
 assetsMap:ReadonlyMap<string,Uint8Array>;
}
export interface GeneratedBaseBinding {
 version:'arch-mesh-generated-base/1';purpose:'generated-operand-only';mode:'prepare'|'replay';replacedRecipeHash:string|null;base:GeneratedBaseDescriptor;
 savedRevision:number;projectedFingerprint:string;
 current:{userId:string;projectId:string;revision:number;headHash:string};
 delegatedImportFields:readonly {id:string;saved:Json;current:Json}[];
 projection:{revision:'current-authority';mesh:'omitted-generated-stage';importParameters:'catalog-defaults-generated-stage-only'};
 source:{id:string;revision:number;rawHash:string};sourceAssetHashes:readonly string[];
 geometryChanges:readonly [];requiresImportedCSG:true;qualifiedCSG:false;
 runtime:{mechanicsAbi:2;mechanicsSemantics:3;sourceAbi:1;sourceSemantics:2;datumExtension:1;sourceFrame:1};
 nativeHead:ProductModelLease['product']['head'];contextHash:string;modelLeaseId:string;
}
export interface GeneratedBaseScope {
 readonly version:'arch-mesh-generated-base/1';
 readonly model:ProductModelLease&{readonly kind:'generated-base';readonly generatedBaseOnly:true;release():Promise<void>};
 readonly inspection:CurrentModelState;readonly exportDescriptor:CurrentModelState['exportDescriptor'];
 readonly binding:Readonly<GeneratedBaseBinding>;
 /** Checks live CURRENT ticket/session/head, assets, registry and runtime epoch. */
 check(control?:Control):void;assertCurrent(control?:Control):void;
 /** Always dispatches with the original current control on the parent scheduler. */
 operation<T>(invoke:(client:RuntimeClient,generation:number)=>T|Promise<T>):Promise<T>;
 /** Call in finally after prepare/confirm. Idempotent, async; resets no shared runtime. */
 release():Promise<void>;
}
export interface MeshGeneratedBase {
 readonly version:'arch-mesh-generated-base/1';
 prepare(input:{control:Control;savedBaseState:DomainState;currentState?:DomainState;mode?:'prepare'|'replay';assets:ReadonlyMap<string,GeneratedBaseAsset>}):Promise<GeneratedBaseScope>;
 withBase<T>(input:{control:Control;mode:'prepare'|'replay';base:GeneratedBaseDescriptor;assets:ReadonlyMap<string,GeneratedBaseAsset>},
  consume:(scope:GeneratedBaseScope)=>T|Promise<T>):Promise<T>;
 /** Trusted root adapter injection. Throws for forged, released or current-visible
  * ordinary/derived models. Never accept a boolean from project JSON instead. */
 verifyGeneratedBase(input:{model:ModelLease;control:Control}):Readonly<GeneratedBaseBinding>;
 assertScope(scope:GeneratedBaseScope,input:{control:Control;model:ModelLease}):Readonly<GeneratedBaseBinding>;
 reset():Promise<void>;dispose():Promise<void>;
}
export function createMeshGeneratedBase(input:{
 kernel:SourceContextKernel&{kernelLeases:WeakMap<ModelLease,{root:RootLease;client:RuntimeClient}>};
 sources:SourceContextServices;context:()=>GeneratedBaseContext|null;engineIdentity:{id:string;version:string};
}):MeshGeneratedBase;
