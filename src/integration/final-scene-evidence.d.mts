import type {MeshInspection} from '../mesh-import/src/root-app-adapter.mjs';
import type {Control,DomainState,ModelLease,Ticket} from '../app/adapters.mjs';
import type {MeshReport} from '../core/mesh-qualification.mjs';
import type {MeshQualificationClient} from '../core/mesh-qualification-client.mjs';
export const FINAL_SCENE_VERSION:'arch-final-scene-evidence/1';
export type Hash=string;
export type ScheduleHash=`sha256:${string}`;
export type Json=null|boolean|number|string|Json[]|{[key:string]:Json};
export interface SourceHash {id:string;sha256:Hash}
export interface SceneContext {
 state:DomainState;userId:string;projectId:string;sessionKey:unknown;
 /** Native/domain fingerprint; never substitute the journal manifest hash. */
 headHash:Hash;model:ModelLease|null;
}
export interface RootLease {id:number;generation:number;epoch:number;metadata:{semanticBytes?:Uint8Array;descriptor?:Uint8Array;[key:string]:unknown};bytes():Uint8Array}
export interface NativeMapping {part:number;slot:number;rgba:number;source:number;materialSource:number}
export interface MaterialSourceTable {version:'arch-material-source-table/1';scope:'exact-project-head';projectId:string;headHash:Hash;revision:number;bindings:{materialId:string;materialSourceId:number}[];digest:Hash}
/** Normalized checker provenance, NOT a root wire type or filament-slot mapping. */
export interface MaterialUnionPart {partIndex:number;archSourceIndex:number;materialKey:{slot:number;rgba:number;materialSourceId:number};inputPartIndices:number[];inputSourceIndices:number[]}
export interface MaterialUnionGroup {part:number;slot:number;rgba:number;materialSource:number;inputParts:number[];sourceIndices:number[]}
export interface UnionMetadata {
 version:'arch-final-scene-geometry/1';sourceSnapshotSha256:Hash;sourceSnapshotId:number;sourceSnapshotGeneration:number;revision:string;format:'ARCH/1';geometry:'material-union';
 grouping:'slot-rgba-materialSource/1';groups:MaterialUnionGroup[];
 coordinateFrame:'source-manufacturing-mm';sourceUnchanged:true;meshVerdict:'unverified';nativeWarningFlags?:number;boundsMm?:number[];
}
export interface SceneClient {
 epoch:number;disposed?:boolean;serviceCapabilities?:{finalExport?:boolean;finalSceneGeometry?:boolean};
 finalSceneGeometry?(root:RootLease,request:{revision:string;expectedRevision:string;mapping:NativeMapping[]},control:{generation:number}):Promise<{bytes:Uint8Array;metadata:UnionMetadata}>;
 finalExport?(root:RootLease,request:Record<string,unknown>,control:{generation:number}):Promise<{bytes:Uint8Array;metadata:Record<string,unknown>}>;
}
export interface KernelRecord {root:RootLease;client:SceneClient}
export interface ProductPart {
 id:string;partIndex:number;sourceIndex:number;slot:number;rgba:number;materialId:string;sourceSemanticIds:string[];materialProvenanceId?:string;
}
export interface ProductInspection {
 version:'arch-product-model-state/1';modelLeaseId:string;
 head:{headHash:Hash;revision:string};snapshot:{id:number;generation:number;epoch:number};contextHash:Hash;
 source:{id:string;revision:number;rawHash:Hash};
 semantics:{mechanicsSemantics:number;sourceSemantics:number;schema?:string;product?:number;revision?:string;
  parameters?:{field:string|null;mode:number;value:number;fieldId?:number}[];layerBoundaries?:number[]};
 gates:{matchingHead:true;nativeBuildAccepted:boolean;sourceVerdict:number;mechanicsVerdict:number;exportBlocked:boolean};
 exportDescriptor:{parts:ProductPart[];sourceHashes:SourceHash[]};
}
export interface GateState {
 key:string;invalidInput:boolean;kernelFailure:boolean;assemblyView:boolean;unappliedMeshEdit:boolean;
 /** Hash retained from the actual build, not recomputed from a later revision. */
 projectScheduleHash?:ScheduleHash;
}
export interface SemanticPart extends Omit<ProductPart,'id'> {semanticId:string;materialSourceId:number}
export interface FinalSceneEvidence {
 status:'ready';key:Hash;projectId:string;revision:number;headHash:Hash;
 snapshotId:number;snapshotGeneration:number;epoch:number;snapshotSha256:Hash;
 gates:Pick<GateState,'invalidInput'|'kernelFailure'|'assemblyView'|'unappliedMeshEdit'>;
 meshVerdict:'pass'|'fail'|'unverified';sourceHashes:SourceHash[];parts:SemanticPart[];projectScheduleHash?:ScheduleHash;
 provenance:Record<string,Json>&{version:typeof FINAL_SCENE_VERSION;checker:'arch-mesh-qualification/1';snapshot:MeshReport;materialReadback:MeshReport|null;materialReadbackSha256:Hash|null;materialReadbackParts:MaterialUnionPart[]|null;union:MeshReport|null;unionSha256:Hash|null;
 unionMethod:'afgm-single-material-group/1'|'afgm-neutral-analysis-group/1'|'legacy-stl-inspection/1'|null;unionAnalysisParts:MaterialUnionPart[]|null;
 unionScope:'independent-binary64-union-readback'|'independent-binary32-union-readback';unionGeometryEquivalence:'unverified';
 globalPipelineErrorMm:null;physicalFit:'unqualified';printerQualification:'unverified';productContextHash:Hash;gateKey:string;materialSourceTable:MaterialSourceTable;mechanicsSemantics:3;sourceSemantics:2};
}
export interface Unavailable {status:'unverified';reasonCode:string;reason:string;verdict:'unverified'|'fail'|'unsupported'}
export interface FinalSceneProvider {
 version:typeof FINAL_SCENE_VERSION;
 qualify(input:{model:ModelLease;control:Control}):Promise<{version:'arch-app-adapters/1';ticket:Ticket;evidence:Readonly<FinalSceneEvidence>}>;
 refresh(input:{model:ModelLease;control:Control}):Promise<{version:'arch-app-adapters/1';ticket:Ticket;evidence:Readonly<FinalSceneEvidence>}>;
 describe(record:object,context:SceneContext):Readonly<FinalSceneEvidence>|Unavailable;
 reset():Promise<void>;dispose():Promise<void>;
}
export class FinalSceneError extends Error {code:string;constructor(code:string)}
export interface FinalSceneBindings {
 kernelLeases:WeakMap<ModelLease,KernelRecord>;
 inspectModel(input:{model:ModelLease;control:Control}):Promise<ProductInspection|MeshInspection>;
 operation<T>(control:Control,invoke:(client:SceneClient,generation:number)=>Promise<T>):Promise<T>;
 context():SceneContext|null;
 gateState(context:SceneContext,inspection:ProductInspection|MeshInspection):GateState|null;
 materialSourceIds(context:SceneContext,inspection:ProductInspection|MeshInspection):readonly {materialId:string;materialSourceId:number}[];
 workerURL?:URL|string;onChange?():void;
 /** Explicit test/deployment transport only. Production default is the real
  * bounded Worker, never a native stats verdict or a pass-producing fallback. */
 validationClient?:MeshQualificationClient|null;
}
export function createFinalSceneEvidence(bindings:FinalSceneBindings):FinalSceneProvider;
