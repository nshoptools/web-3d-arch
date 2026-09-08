import type {Control,DomainState,ModelLease} from '../app/adapters.mjs';
import type {MeshRootAdapter,MeshCommitResult} from '../mesh-import/src/root-app-adapter.mjs';
import type {MeshAsset,MeshHostBindings} from '../mesh-import/src/app-csg-transaction.mjs';
import type {MeshGeneratedBase} from './mesh-generated-base.mjs';
export interface MeshApplyOptions {unit?:string;targetId?:string;materialId?:string}
export interface MeshApplyStage {outputHash:string;changes:string[];verify():Promise<string>;confirm():Promise<MeshCommitResult>;release():void}
export interface MeshInputStage {outputHash:string;changes:string[];verify():Promise<string>;confirm(control:Control):Promise<MeshApplyStage>;release():void}
export type MeshHost=Omit<MeshHostBindings,'engine'|'qualifyCandidate'>;
export interface MeshApplicationServices {
 targetOptions(state:DomainState,model:ModelLease|null):{id:string;label:string;mainBody:boolean}[];
 mesh:MeshRootAdapter;source:MeshRootAdapter['source'];needsApply(state:DomainState,assets:ReadonlyMap<string,MeshAsset|Uint8Array>):boolean;
 prepare(input:{control:Control;state:DomainState;assets:Map<string,MeshAsset>;options:MeshApplyOptions;host:MeshHost;engine:{id:string;version:string}}):Promise<MeshInputStage>;
 replay(input:{control:Control;host:MeshHost;engine:{id:string;version:string}}):Promise<MeshCommitResult>;reset():Promise<void>;
}
export function generatedMeshTargets(parts:any[]):{id:string;label:string;mainBody:boolean}[];
export function resolveMeshTarget(parts:any[],targetId:string):any;
export function meshTargetOptions(state:any,model:any):{id:string;label:string;mainBody:boolean}[];
export function meshNeedsApply(state:DomainState,assets:ReadonlyMap<string,MeshAsset|Uint8Array>):boolean;
export function meshTransform(values:Record<string,number>):number[];
export function createMeshApplicationServices(input:{kernel:any;context:()=>any;generatedBase:MeshGeneratedBase;workerURL?:URL|string}):MeshApplicationServices;
