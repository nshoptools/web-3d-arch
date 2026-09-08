import type {Control,DomainState,ModelLease,SourceDescriptor} from '../../app/adapters.mjs';
import type {MeshCommitArgs,MeshCommitResult,MeshPublication,MeshExpected,MeshModel} from './root-app-adapter.mjs';
export interface MeshAsset {hash:string;bytes:Uint8Array;byteLength:number;kind:string}
export interface MeshDocument extends Record<string,unknown> {state:DomainState}
export interface HostCapture {document:MeshDocument;assets:Map<string,MeshAsset>;store:any;userId:string;projectId:string;sessionKey:unknown;model:ModelLease|null;headRevision:number}
export interface MeshHostBindings {
 current():HostCapture;engine:{id:string;version:string};preflight(control:Control):Promise<void>;
 qualifyCandidate(input:{control:Control;model:MeshModel;state:DomainState;headHash:string}):Promise<{status:string;meshVerdict:string;[key:string]:unknown}>;
 adopt(input:{expected:HostCapture;candidate?:{document:MeshDocument;assets:Map<string,MeshAsset>;pruned:unknown[]};model:MeshModel;head?:unknown;transactionId?:string;qualification:unknown}):true;
}
export function meshParameterBindings(state:DomainState,input:{resolved:unknown;transformConvention:string;transformBinary64LE:string}):Record<string,unknown>;
export function createMeshReplayRecord(input:{original:SourceDescriptor;baseState:DomainState;assets:Map<string,MeshAsset>;engine:{id:string;version:string};parser:Record<string,unknown>;approval:Record<string,unknown>;command:Record<string,unknown>;materialNames:Record<string,string>;sourceHashes:{id:string;sha256:string}[];parameters:Record<string,unknown>;targetOptions?:{id:string;label:string;mainBody:boolean}[]}):Promise<{recipe:Record<string,unknown>;assetHashes:string[];assets:Map<string,MeshAsset>}>;
export function replayMeshRequest(input:{state:DomainState;assets:Map<string,MeshAsset>;engine:{id:string;version:string}}):Promise<{version:'arch-mesh-replay-request/1';baseState:DomainState;baseAssetHashes:string[];source:SourceDescriptor;file:{name:string;bytes:Uint8Array};selection:{input:Record<string,unknown>;approval:Record<string,unknown>};command:Record<string,unknown>;materialNames:Record<string,string>;sourceHashes:{id:string;sha256:string}[];recipe:Record<string,unknown>;requiresFreshGeometryAndGates:true}>;
export function prepareMeshHostTransaction(input:MeshHostBindings&{nextState:DomainState;assets:Map<string,MeshAsset>;acceptPruning?:boolean}):Promise<{version:'arch-mesh-host-transaction/1';expected:MeshExpected;publication:MeshPublication;outputHash:string;nextState:DomainState;verify():Promise<string>;commitCandidate(args:MeshCommitArgs):Promise<MeshCommitResult>;release():void}>;
export function createMeshReplayPublication(input:MeshHostBindings):Promise<{replay:Awaited<ReturnType<typeof replayMeshRequest>>;recipeHash:string;publishReplay(input:{control:Control;expected:MeshExpected;model:MeshModel;recipeHash:string}):Promise<MeshCommitResult>}>;

/** Compare the opened retention view without weakening state/history/head identity. */
export function meshReplayDocumentMatches(stored:unknown,current:unknown,dependencies:readonly string[]):boolean;
