import type {Control,DomainState,ModelLease} from '../../app/adapters.mjs';
import type {MeshRootAdapter,MeshContext,MeshInspection,MeshModel} from './root-app-adapter.mjs';
import type {FinalSceneEvidence,GateState} from '../../integration/final-scene-evidence.mjs';
export function createMeshCandidateQualification(input:{mesh:MeshRootAdapter;kernelLeases:WeakMap<ModelLease,any>;operation<T>(control:Control,invoke:(client:any,generation:number)=>Promise<T>):Promise<T>;workerURL?:URL|string}):(input:{control:Control;model:MeshModel;state:DomainState;headHash:string})=>Promise<Readonly<FinalSceneEvidence>>;
export function meshSceneMaterialBindings(context:MeshContext,inspection:MeshInspection):readonly {materialId:string;materialSourceId:number}[];
export function meshFinalSceneGateState(context:MeshContext,inspection:MeshInspection):Readonly<GateState>;
