import type {ExportOption,Capability,ProductId,Verdict,Json,PrinterView,EditorGesture,EditorView,MaterialView,EmojiEntry,FontEntry,AppSnapshot,AppCommand as Command} from '../contracts/app-bridge.js';
export type Version='arch-app-adapters/1';
export interface Ticket {id:string;userId:string;projectId:string;revision:number;generation:number}
export interface DomainState {kind:'web-3d-arch.project-domain';schemaVersion:1;revision:number;product:ProductId;sourceKind:'none'|'raster'|'svg'|'text'|'emoji'|'mesh';schedule:Record<string,Json>;parameters:{common:Record<string,{origin:'auto'|'user';value:Json}>;byProduct:Record<ProductId,Record<string,{origin:'auto'|'user';value:Json}>>};content:Record<string,Json>;provenance:Record<string,Json>}
export interface Control {version:Version;ticket:Ticket;signal:AbortSignal;onProgress(value:{stage:string;progress:number|null}):void}
export interface Block {id:string;label:string;kind:'body'|'text'|'region'|'other';materialId:string|null}
export interface ModelLease {version:Version;ticket:Ticket;generation:number;leaseId:string;bytes():Uint8Array;stats:{widthMm:number;depthMm:number;heightMm:number;triangles:number;materialCount:number;verdict:Verdict};blocks:Block[];release():void}
export interface PrivateLifecycle {reset?():void|Promise<void>;clearPrivateState?():void|Promise<void>;dispose?():void|Promise<void>}
export interface ParameterProposal {version:Version;status:'parameters-proposal';ticket:Ticket;head:Record<string,Json>;parameters:readonly {id:string;value:Json}[];fingerprint:string;changes:readonly string[];confirm(control:Control):Promise<unknown>;release():void}
export interface EngineAdapter extends PrivateLifecycle {version:Version;identity:{id:string;version:string};capabilities:Capability[];build(input:Control & {state:DomainState;assets:ReadonlyMap<string,Uint8Array>}):Promise<ModelLease|{status:'proposal';model:ModelLease;changes:string[]}|ParameterProposal>}
export interface ViewportAdapter extends PrivateLifecycle {version:Version;capabilities:Capability[];attach(host:HTMLElement):()=>void;setModel(input:{lease:ModelLease;revision:number;blocks:Block[]}):void;action(action:'fit'|'center'|'top'|'front'|'perspective'|'explode'|'toggle-grid'|'toggle-measure'):void|Promise<void|{kind:'placement-proposal';translationMm:[number,number,number]}>;setSelection(id:string|null):void;setPrinter?(profile:{bedPolygonMm:[number,number][];maxZMm:number}|null):void;clear():void}
export interface Raster {width:number;height:number;data:Uint8ClampedArray;pixelSizeMm:number;preview:Uint8Array;previewMediaType:'image/png'}
export interface SourceContext {readonly version:'arch-source-context/1';readonly operation:'import'|'convert';readonly id:string;readonly revision:number;readonly predecessor:null|{readonly id:string;readonly revision:number;readonly rawHash:string}}
export interface SourceConfirmation {kind:'raster'|'text'|'emoji'|'svg';version:string;approvalHash:string;proposalHash:string}
export interface SourceAcceptanceReceipt {kind:'raster'|'text'|'emoji'|'svg';version:'arch-source-confirmation-receipt/1';approvalHash:string;proposalHash:string;sourceHash:string;rgbaHash:string;settingsHash:string;projectId:string;sourceRevision:number;acceptedAtRevision:number;artifactHash?:string}
export interface SourceAcceptance {version:Version;ticket:Ticket;confirmation:SourceConfirmation;receipt:SourceAcceptanceReceipt}
export interface SourceResult {confirmation?:SourceConfirmation;version:Version;ticket:Ticket;kind:'raster'|'svg'|'text'|'emoji'|'mesh';metadata:Record<string,Json>;assets?:{kind:'source'|'dependency'|'derived';bytes:Uint8Array}[];materials?:MaterialView[];preview?:{width:number;height:number;pixelSizeMm:number;png:Uint8Array;mediaType:'image/png'};raster?:Raster}

export type ReadonlyJson = null | boolean | number | string | readonly ReadonlyJson[] | ReadonlyJsonObject;
export interface ReadonlyJsonObject {readonly [key:string]:ReadonlyJson}
export type DeepReadonly<T> = Json extends T ? ReadonlyJson : T extends object ? {readonly [K in keyof T]:DeepReadonly<T[K]>} : T;
export interface SourceDescriptor {
 id:string;name:string;kind:SourceResult['kind'];raw:{hash:string;byteLength:number};mediaType:string;revision:number;assetHashes:string[];metadata:Record<string,Json>;
 preview?:{width:number;height:number;pixelSizeMm:number;png:string;mediaType:'image/png'};
 raster?:{width:number;height:number;pixelSizeMm:number;rgba:string;preview:string;originalPreview:string};
}
export interface SourceAdoptionInput extends Control {
 purpose:'source';operation:'import'|'convert';sourceContext:SourceContext;
 state:DeepReadonly<DomainState>;source:DeepReadonly<SourceDescriptor>;
 materials:readonly DeepReadonly<MaterialView>[];materialDefaults:readonly DeepReadonly<MaterialView>[];
 assets:ReadonlyMap<string,Uint8Array>;
}
export interface SourceAdoption {
 version:Version;ticket:Ticket;productBindings:Record<string,Json>;
 materials:MaterialView[];materialDefaults:MaterialView[];
}

export interface SourceAdapter extends PrivateLifecycle {prepareAdoption?(input:SourceAdoptionInput):Promise<SourceAdoption>;version:Version;capabilities:Capability[];ingest(input:Control & {sourceContext?:SourceContext;file:{name:string;mediaType:string;bytes:Uint8Array};purpose:'source'|'mesh'|'font';state:DomainState;baseState?:DomainState}):Promise<SourceResult|{status:'proposal';result:SourceResult;changes:string[];confirmation?:SourceConfirmation}>;acceptProposal?(input:Control & {sourceContext:SourceContext;confirmation:SourceConfirmation;source:Record<string,Json>;assets:ReadonlyMap<string,Uint8Array>;acceptedAtRevision:number}):Promise<SourceAcceptance>;acceptProposal?<T>(input:Control & {state:DomainState;sourceContext:SourceContext;confirmation:SourceConfirmation;source:Record<string,Json>;assets:ReadonlyMap<string,Uint8Array>;acceptedAtRevision:number},consume:(accepted:SourceAcceptance&{sourceAuthority?:ProductSourceAuthority})=>Promise<T>):Promise<T>;convert?(input:Control & {sourceContext:SourceContext;target:'raster';state:DomainState;source:Record<string,Json>;assets:ReadonlyMap<string,Uint8Array>}):Promise<SourceResult|{status:'proposal';result:SourceResult;changes:string[];confirmation?:SourceConfirmation}>;selectEmoji?(input:Control & {sourceContext:SourceContext;id:string;collectionId:string}):Promise<{file:{name:string;mediaType:string;bytes:Uint8Array};result:SourceResult}>;queryEmoji?(query:string,collectionId?:string,offset?:number):Promise<{entries:EmojiEntry[];total:number;collections:{id:string;label:string}[]}>;queryFonts?(query:string):Promise<FontEntry[]>}
export interface EditingAdapter extends PrivateLifecycle {version:Version;capabilities:Capability[];edit(input:Control & {gesture:EditorGesture;editor:EditorView;color:[number,number,number,number];source:{id:string;hash:string;revision:number};raster:Raster}):Promise<{version:Version;ticket:Ticket;raster:Raster;changed:boolean}>}
export interface ExportContext {state:DomainState;model:ModelLease|null;renderer:{available:boolean}}
export interface ExportFormat extends ExportOption {/** Omitted means matching-model (legacy). */prerequisite?:'committed-source'|'renderer'|'matching-model'}
export interface ExportArtifact {version:Version;ticket:Ticket;bytes:Uint8Array;mimeType:string;filename:string;metadata?:Record<string,Json>}
export interface ExportProposal {status:'proposal';artifact:ExportArtifact;changes:string[]}
export interface PreparedExportProposal {status:'prepared-proposal';version:Version;ticket:Ticket;proposalHash:string;changes:string[];confirm(control:Control):Promise<ExportArtifact>;release():void}
export interface ExportAdapter extends PrivateLifecycle {
 version:Version;capabilities:Capability[];
 formats(input:ExportContext):ExportFormat[];
 export(input:Control & ExportContext & {formatId:string;prerequisite:'committed-source'|'renderer'|'matching-model';assets:ReadonlyMap<string,Uint8Array>}):Promise<ExportArtifact|ExportProposal|PreparedExportProposal>;
}
export interface PreparationAdapter extends PrivateLifecycle {
 prepare(input:Control&{state:DomainState;assets:ReadonlyMap<string,Uint8Array>;model:ModelLease|null}):Promise<void>;
 qualifyModel?(input:Control&{model:ModelLease}):Promise<void>;
 /** Current independent evidence; never mutate or replace an owned ModelLease. */
 modelVerdict?(model:ModelLease):'pass'|'fail'|'unverified'|'unsupported';
}
export interface AppAdapters {meshTransactions?:import('../integration/mesh-services.mjs').MeshApplicationServices;productTransactions?:ProductTransactionsAdapter;reset?():void|Promise<void>;engine?:EngineAdapter;viewport?:ViewportAdapter;source?:SourceAdapter;editing?:EditingAdapter;exporter?:ExportAdapter;preparation?:PreparationAdapter;printing?:{version:Version;capabilities:Capability[];list():Promise<PrinterView[]>};mirror?:{version:Version;capabilities:Capability[];pickDirectory():Promise<{label:string}>;write(input:{projectId:string;revision:number;bytes:Uint8Array;sha256:string}):Promise<{at:string;revision:number;sha256:string}>};download?:{save(input:{bytes:Uint8Array;mimeType:string;filename:string;signal:AbortSignal}):Promise<void>};purge?:{eraseUser(input:{userId:string;deviceId:string}):Promise<void>}}


/** Private synchronous-object authority; never JSON, a pointer, a token or a stored field. */
declare const productSourceAuthority:unique symbol;
export interface ProductSourceAuthority {readonly [productSourceAuthority]:true}
export interface ProductTransactionExpected {userId:string;projectId:string;revision:number;headHash:string;sessionKey:string}
export interface ProductTransactionPlan {
 readonly version:'arch-product-transaction/1';readonly status:'proposal'|'blocked';readonly expected:ProductTransactionExpected;
 readonly proposalHash:string;readonly proposedStateHash:string|null;readonly nativeHead:unknown;readonly changes:readonly string[];
 readonly planeChoices?:readonly unknown[];readonly diagnostics:readonly unknown[];
 preview():{state:DomainState;assets:readonly {kind:string;sha256:string;bytes:Uint8Array}[]};
 confirm(control:Control):Promise<{version:'arch-product-source-update-commit/1';proposalHash:string;expected:ProductTransactionExpected;state:DomainState;assets:readonly {kind:string;sha256:string;bytes:Uint8Array}[];nativeReceipt:Uint8Array|null;requiresAtomicCommit:true;requiresNativeRebuild:boolean}>;
 replan?(control:Control,choiceIndex:number):Promise<ProductTransactionPlan>;
 release():void;
}
export interface ProductTransactionsAdapter extends PrivateLifecycle {
 version:Version;handles(input:{state?:DomainState;command:Command}):boolean;
 prepareCommand(input:{control:Control;state:DomainState;assets:ReadonlyMap<string,Uint8Array>;command:Command}):Promise<ProductTransactionPlan>;
 prepareAdoption(input:{control:Control;state:DomainState;source:SourceDescriptor;assets:ReadonlyMap<string,Uint8Array>;materials:readonly MaterialView[];materialDefaults:readonly MaterialView[];operation:'import'|'convert';sourceAuthority?:ProductSourceAuthority;text?:Readonly<Record<string,Json>>}):Promise<ProductTransactionPlan>;
 recordRasterEdit?(input:{source:SourceDescriptor;nextSource:SourceDescriptor;gesture:EditorGesture;assets:ReadonlyMap<string,Uint8Array>}):Promise<Record<string,Json>|null>;
}
