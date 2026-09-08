import type {RasterOptions,RasterLimits,RasterPacket,RenderOrigin,RuntimeResetOptions} from '../core/raster-operations.mjs';
import type {ModelLease} from '../app/adapters.mjs';
export type RasterRecipeControl=AppControl & {state:unknown;sourceContext?:SourceContext;assets:ReadonlyMap<string,Uint8Array>};
export type RasterRecipeProposal={status:'proposal';sourceProposal:unknown};
export interface ReadyRasterGeometry {
 status:'ready';kind:'raster-source-geometry';sourceAssemblyRequired:true;
 coordinateKind:28;unitMm:number;packet:RasterPacket;receipt:RasterApprovalReceipt;preparation:unknown;
}
/** A finished root product lease; a source packet does not satisfy this. */
export type RasterProductModelLease=Omit<ModelLease,'release'> & {release():void|Promise<void>};
export type RasterConsumerInput=ReadyRasterGeometry & {
 readonly nativeSource:{readonly kind:'raster-token';readonly token:string;readonly epoch?:number};
};
/** Controller allocates this before preparation; acceptance echoes the exact context. */
export interface SourceContext {
 version:'arch-source-context/1';operation:'import'|'convert';id:string;revision:number;
 predecessor:null|{id:string;revision:number;rawHash:string};
}
export interface RasterConfirmation {
 kind:'raster';version:'arch-raster-confirmation/1';approvalHash:string;proposalHash:string;
}
export interface RasterApprovalReceipt {
 kind:'raster';version:'arch-source-confirmation-receipt/1';approvalHash:string;proposalHash:string;
 sourceHash:string;rgbaHash:string;settingsHash:string;projectId:string;sourceRevision:number;acceptedAtRevision:number;
}
export interface AppControl {
 version:'arch-app-adapters/1';ticket:{id:string;userId:string;projectId:string;revision:number;generation:number};
 signal:AbortSignal;onProgress:(value:{stage:string;progress:number|null})=>void;
}
export interface ApprovalAnswer {
 version:'arch-app-adapters/1';ticket:AppControl['ticket'];confirmation:RasterConfirmation;receipt:RasterApprovalReceipt;
}
/** Borrowed only until the consumer settles; retain a separate native context for later use. */
export type RasterApprovalConsumerInput=ApprovalAnswer & RasterConsumerInput;
export type RasterApprovalControl=AppControl & {sourceContext:SourceContext;confirmation:RasterConfirmation;source:unknown;assets:ReadonlyMap<string,Uint8Array>;acceptedAtRevision:number};
/** Domain/source/result records use the parent's src/app/adapters.d.mts definitions. */
export interface RasterSourceAdapter {
 version:'arch-app-adapters/1';capabilities:{id:string;available:boolean}[];
 ingest(input:AppControl & {state:unknown;sourceContext:SourceContext;file:{name:string;mediaType:string;bytes:Uint8Array};purpose:'source'}):Promise<unknown>;
 convert(input:AppControl & {state:unknown;sourceContext:SourceContext;source:unknown;assets:ReadonlyMap<string,Uint8Array>;target:'raster'}):Promise<unknown>;
 acceptProposal(input:RasterApprovalControl,consume?:null):Promise<ApprovalAnswer>;
 /** Called once after exact consent validation, on the same runtime/operation. Throw propagates. */
 acceptProposal<T>(input:RasterApprovalControl,consume:(source:RasterApprovalConsumerInput)=>T|Promise<T>):Promise<T>;
 /** Missing/stale consent without sourceContext throws RASTER_SOURCE_CONVERSION_REQUIRED. */
 prepareRecipe(input:RasterRecipeControl):Promise<RasterRecipeProposal|ReadyRasterGeometry>;
 prepareRecipe<T extends RasterProductModelLease>(input:RasterRecipeControl,consume:(source:RasterConsumerInput)=>T|Promise<T>):Promise<T|RasterRecipeProposal>;
 reset(options?:RuntimeResetOptions):Promise<void>;
}
export function rasterOptionsForState(state:unknown,policy?:{alpha?:RasterOptions['alpha'];palette?:RasterOptions['palette'];backgroundLabels?:number[];limits?:RasterLimits}):{options:RasterOptions;limits:RasterLimits};
export function createRasterAdapters(options:{
 runtime:unknown;encodePNG?:(input:{width:number;height:number;data:Uint8ClampedArray},control:{signal:AbortSignal})=>Promise<Uint8Array>;
 processingPolicy?:(input:{state:unknown})=>{alpha?:RasterOptions['alpha'];palette?:RasterOptions['palette'];backgroundLabels?:number[];limits?:RasterLimits};
 renderSource?:(input:unknown)=>Promise<{data:Uint8ClampedArray;width:number;height:number;origin:RenderOrigin}>;
}):{source:RasterSourceAdapter;reset(options?:RuntimeResetOptions):Promise<void>};
export function createRasterRecipeHelper(options:{source:RasterSourceAdapter;assemble:(input:unknown)=>unknown}):(control:AppControl & {state:unknown;sourceContext?:SourceContext;assets:ReadonlyMap<string,Uint8Array>})=>Promise<unknown>;
