import type {Control,DomainState,ModelLease,SourceContext,SourceResult,SourceDescriptor} from '../../app/adapters.mjs';
export interface MeshContext {userId:string;projectId:string;state:DomainState;headHash:string;sessionKey:unknown;model:ModelLease|null}
export interface MeshExpected {userId:string;projectId:string;revision:string;headHash:string}
export interface MeshPublication {version:'arch-mesh-publication/1';revision:string;headHash:string;transactionHash:string}
export interface MeshModel extends ModelLease {kind:'mesh-scene';mesh:Record<string,unknown>&{kind:'mesh-scene';headHash:string;revision:string;derivedSnapshotHash:string;proposalHash:string}}
export interface MeshCommitArgs {control:Control;expected:MeshExpected;publication:MeshPublication;model:MeshModel;history:Record<string,unknown>}
export type MeshCommitResult={committed:true;visible?:true;model:MeshModel;transactionId?:string;head?:unknown}|{committed:true;visible:false;model:null;transactionId?:string;head?:unknown;diagnostic:{code:'COMMITTED_MODEL_UNAVAILABLE';reason:string;storeCommitted:true}};
export interface MeshFile {name:string;bytes:Uint8Array;mediaType?:string}
export interface MeshSelection {input:Record<string,unknown>;approval:Record<string,unknown>}
declare const owned:unique symbol;
export interface MeshOwned {readonly [owned]:true;readonly version:'arch-root-mesh-adapter/1';readonly stage:string;readonly applied:false;release():void}
export interface MeshInputProposal extends MeshOwned {readonly proposalHash:string;readonly proof:Record<string,unknown>;readonly preview:unknown}
export interface MeshCsgProposal extends MeshOwned {readonly proposalHash:string;readonly state:string;readonly proof:Record<string,unknown>;previewBytes():Uint8Array;verify(control:Control):Promise<string>}
export interface MeshInspection {
 version:'arch-mesh-model-state/1';modelLeaseId:string;head:{headHash:string;revision:string};snapshot:{id:number;generation:number;epoch:number};contextHash:string;
 semantics:{mechanicsSemantics:3;sourceSemantics:2;kind:'mesh-scene';postCsgGates:Record<string,unknown>;parameterBindings:string};
 gates:{matchingHead:true;nativeBuildAccepted:true;sourceVerdict:0;mechanicsVerdict:0;exportBlocked:false};
 exportDescriptor:{parts:{id:string;partIndex:number;sourceIndex:number;slot:number;rgba:number;materialId:string;sourceSemanticIds:string[];materialProvenanceId?:string}[];sourceHashes:{id:string;sha256:string}[]};
 lineageScope:string;
}
export interface MeshCandidateScope {version:'arch-mesh-candidate-inspector/1';context():MeshContext;inspectModel(input:{model:ModelLease;control:Control}):Promise<MeshInspection>;check():void;release():void}
export interface MeshRootAdapter {
 version:'arch-root-mesh-adapter/1';
 source:{version:'arch-app-adapters/1';capabilities:{id:string;available:boolean}[];ingest(input:Control&{file:MeshFile;purpose:'mesh';state:DomainState;sourceContext:SourceContext}):Promise<SourceResult>};
 prepareInput(input:{control:Control;file:MeshFile;mesh:SourceDescriptor;selection:MeshSelection}):Promise<MeshInputProposal>;
 approveInput(proposal:MeshInputProposal,input:{control:Control;proposalHash:string}):Promise<MeshOwned>;
 prepareApply(prepared:MeshOwned,input:{control:Control;model:ModelLease;command:Record<string,unknown>;publication?:MeshPublication;materialNames:Record<string,string>;sourceHashes:{id:string;sha256:string}[];replayRecord?:Record<string,unknown>}):Promise<MeshCsgProposal>;
 confirmApply(proposal:MeshCsgProposal,input:{control:Control;proposalHash:string}):Promise<MeshCommitResult&{history:Record<string,unknown>}>;
 inspectModel(input:{model:ModelLease;control:Control}):Promise<MeshInspection>;
 createCandidateInspection(input:{model:MeshModel;control:Control;state:DomainState;headHash:string}):Promise<MeshCandidateScope>;
 reset():void;dispose():void;
}
export function createRootMeshAdapter(input:{
 operation<T>(control:Control,invoke:(client:any,generation:number)=>Promise<T>):Promise<T>;
 kernelLeases:WeakMap<ModelLease,any>;context():MeshContext;
 commitCandidate(input:MeshCommitArgs):Promise<MeshCommitResult>;
 verifyGeneratedBase?(input:{model:ModelLease;control:Control}):void|Promise<void>;
 publishReplay?(input:{control:Control;expected:MeshExpected;model:MeshModel;recipeHash:string;history:Record<string,unknown>}):Promise<MeshCommitResult>;
}):MeshRootAdapter;
