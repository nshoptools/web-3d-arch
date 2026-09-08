import type {Control,DomainState,ExportAdapter,ExportArtifact,ExportContext,ExportFormat,ModelLease} from '../app/adapters.mjs';

export const EXPORT_APP_VERSION:'arch-app-adapters/1';
export type FormatId='svg-color'|'svg-section'|'3mf-bambu-project'|'3mf-snapmaker-project'|'stl-material-zip'|'stl-union'|'png-viewport';
export type VendorId='export.3mf.bambu-project'|'export.3mf.snapmaker-project';
export type Json=null|boolean|number|string|Json[]|{[key:string]:Json};
export type Data=Record<string,Json>;
export type MeshVerdict='pass'|'fail'|'unverified';
export interface Unavailable {status:'unverified'|'disabled';reasonCode:string;reason:string;verdict?:'fail'|'unverified'|'unsupported'}
export type Pose={kind:'manufacturing'|'pattern-down-x';restOnBed:boolean}|{kind:'isometry';restOnBed:boolean;matrix:[number,number,number,number,number,number,number,number,number,number,number,number]};
export type Section=({mode:'single';zMm:number}|{mode:'sequence';startMm:number;endMm:number;stepMm:number})&{units:'mm'|'in';side:'front'|'back';color:'black'|'material'};
export interface FileOptions {filename:string;inspection:boolean}
export interface NativeOptions extends FileOptions {pose:Pose;errorMm:number;limits?:[vertices:number,triangles:number,groups:number,sections:number,sectionPoints:number,outputBytes:number,workingBytes:number,reserved:0]}
export interface SourceSVGOptions extends FileOptions {units:'source';side:'source';color:'source'}
export interface FormatOptions {
 'svg-color':SourceSVGOptions;
 'svg-section':NativeOptions&{section:Section};
 'stl-union':NativeOptions;
 'stl-material-zip':NativeOptions;
 '3mf-bambu-project':FileOptions&{pose:{kind:'manufacturing';restOnBed:false}};
 '3mf-snapmaker-project':FileOptions&{pose:{kind:'manufacturing';restOnBed:false}};
 'png-viewport':FileOptions;
}
export interface ApplicationContext {
 state:DomainState;userId:string;projectId:string;
 /** Authoritative, opaque identity; changes whenever access/session resets. */
 sessionKey:unknown;headHash:string;model:ModelLease|null;
 exportOptions?:Partial<FormatOptions>;
}
export interface RootLease {readonly id:number;readonly generation:number;readonly epoch:number;bytes():Uint8Array}
export interface ServiceArtifact {bytes:Uint8Array;metadata:Data;report?:Data}
export interface FinalFloatConfirmation {
 readonly version:'arch-final-float-confirmation/1';readonly proposalHash:string;
 readonly sourceHash:string;readonly sourceGeneration:number;
 readonly sourceRevision:string;readonly optionsHash:string;
}
/** Exact opaque object supplied by the shared EngineClient; never project JSON. */
export interface FinalFloatLease {
 readonly version:'arch-final-float-proposal/1';readonly metadata:Data;
 readonly confirmation:FinalFloatConfirmation;
 view(kind:number):Float64Array|Uint32Array;release():void;
}
export interface FinalFloatPolicy {version:1;maximumDisplacementMm:number;workLimit:number}
export interface SharedEngineClient {
 readonly disposed?:boolean;
 readonly epoch?:number;
 readonly serviceCapabilities?:{finalExport?:boolean;finalFloat?:boolean;geometryVersions?:Record<string,number>};
 finalExport(lease:RootLease,options:Record<string,unknown>,control:{generation:number}):Promise<ServiceArtifact>;
 export3MF(lease:RootLease,request:Record<string,unknown>,control:{generation:number;format:'project'}):Promise<ServiceArtifact>;
 prepareFinalFloat?(lease:RootLease,options:Record<string,unknown>,policy:FinalFloatPolicy,control:{generation:number}):Promise<FinalFloatLease>;
 confirmFinalFloat?(proposal:FinalFloatLease,descriptor:FinalFloatConfirmation,control:{generation:number}):Promise<ServiceArtifact>;
 releaseFinalFloat?(proposal:FinalFloatLease):void;
}
export interface KernelRecord {root:RootLease;client:SharedEngineClient}
export type CommonOperation=<T>(control:Control,invoke:(client:SharedEngineClient,generation:number)=>Promise<T>)=>Promise<T>;
export interface SourceHash {id:string;sha256:string}
export interface SemanticPart {
 partIndex:number;sourceIndex:number;slot:number;rgba:number;
 /** Explicit stable uint32 binding, never a truncated uint64 or color-derived ID. */
 materialSourceId:number;
 semanticId:string;materialId:string;sourceSemanticIds:string[];materialProvenanceId?:string;
}
export interface FinalSceneEvidence {
 status:'ready';key:string;projectId:string;revision:number;headHash:string;
 snapshotId:number;snapshotGeneration:number;epoch:number;snapshotSha256:string;
 gates:{invalidInput:boolean;kernelFailure:boolean;assemblyView:boolean;unappliedMeshEdit:boolean};
 meshVerdict:MeshVerdict;sourceHashes:SourceHash[];parts:SemanticPart[];provenance?:Data;
 /** Required for 3MF: schedule hash retained from the actual snapshot's build. */
 projectScheduleHash?:string;
}
export interface SourceDescriptor {
 status:'ready';key:string;sourceId:string;sourceRevision:number;rawHash:string;
 representation:'validated-vector-paint';validation:'pass';serializer:string;
 dependencies:{sha256:string;bytes:number}[];provenance?:Data;
}
export interface ProviderControl extends Control {context:{userId:string;projectId:string;revision:number;sessionKey:unknown;headHash:string;state:DomainState}}
export interface SourceSVGResult {
 bytes:Uint8Array;key:string;sourceId:string;sourceRevision:number;rawHash:string;
 provenance?:Data;
 /** Only actual semantic changes. They become the existing controller proposal. */
 changes?:string[];
}
export interface SourceSnapshotProvider {
 describe(context:ApplicationContext):SourceDescriptor|Unavailable;
 acquire(descriptor:SourceDescriptor,control:ProviderControl&{assets:ReadonlyMap<string,Uint8Array>}):Promise<{
  serializeSVG(options:SourceSVGOptions,control:Control):Promise<SourceSVGResult>;
  release():void|Promise<void>;
 }>;
}
export interface FrameDescriptor {
 status:'ready';key:string;frameKey:string;width:number;height:number;
 view:'model'|'source'|'assembly';displayedRevision:number;displayedLeaseId:string|null;provenance?:Data;
}
export interface ViewportProvider {
 describe(context:ApplicationContext):FrameDescriptor|Unavailable;
 capture(descriptor:FrameDescriptor,control:ProviderControl):Promise<{bytes:Uint8Array;key:string;frameKey:string;release?():void|Promise<void>}>;
}
export interface PrintingDescriptor {
 status:'ready';key:string;
 /** Trusted same-runtime service availability. Current root ready RPC has no printing bit. */
 runtimeAvailable:true;
 printerProfile:{payload:Data;sha256:string};schedule:{payload:Data;sha256:string};
 materialTable:{schemaVersion:1;materials:{id:string;name:string;type:string;color:string;slot:number;extruder:number}[]};provenance?:Data;
}
export interface PrintingProvider {describe(adapterId:VendorId,context:ApplicationContext):PrintingDescriptor|Unavailable}
export interface ExportBindings {
 operation:CommonOperation;kernelLeases:WeakMap<ModelLease,KernelRecord>;
 /** Must be null after losing authorization; sessionKey also changes on reset. */
 context():ApplicationContext|null;
 finalScene?(record:KernelRecord,context:ApplicationContext):FinalSceneEvidence|Unavailable;
 sourceSnapshot?:SourceSnapshotProvider;viewport?:ViewportProvider;printing?:PrintingProvider;
 options?<K extends FormatId>(id:K,context:ApplicationContext):FormatOptions[K]|undefined;
}
export interface ApplicationArtifact extends ExportArtifact {metadata:Data}
/** No bytes before explicit confirmation. Keep original Control live until retirement. */
export interface PreparedExportProposal {
 readonly status:'prepared-proposal';readonly version:typeof EXPORT_APP_VERSION;
 readonly ticket:Control['ticket'];readonly proposalHash:string;
 /** Runtime array is frozen; mutable declaration matches the parent's public contract. */
 readonly changes:string[];
 readonly bytes?:never;readonly artifact?:never;
 confirm(control:Control):Promise<ApplicationArtifact>;release():void;
}
export interface ApplicationExporter extends Omit<ExportAdapter,'export'> {
 export(input:Parameters<ExportAdapter['export']>[0]):Promise<ApplicationArtifact|{status:'proposal';artifact:ApplicationArtifact;changes:string[]}|PreparedExportProposal>;
 reset():void;dispose():void;
}
export const EXPORT_FORMATS:readonly (Pick<ExportFormat,'id'|'label'|'extension'|'prerequisite'>&{id:FormatId;nativeFormat?:1|2|3;adapterId?:VendorId})[];
export class ExportAdapterError extends Error {readonly code:string;readonly details:Record<string,unknown>;constructor(code:string,message?:string,details?:Record<string,unknown>)}
export function createExportAdapters(bindings:ExportBindings):ApplicationExporter;
