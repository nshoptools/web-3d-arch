export class RasterError extends Error { constructor(code:string,message?:string,details?:Record<string,unknown>); code:string; details:Record<string,unknown>; }
export type RGB=[number,number,number];
export interface RasterOptions {
 k?:number; res?:360|520|720|960|1280; smooth?:number; minA?:number; denoise?:number;
 eps?:number; tension?:number; longEdgeMm?:number;
 alpha?:{policy:'reject-partial'}|{policy:'threshold';cutoff:number}|{policy:'matte';matte:RGB};
 palette?:RGB[]; backgroundLabels?:number[];
}
export interface RasterLimits {
 maxSourceBytes?:number;maxDimension?:number;maxDecodedPixels?:number;maxDecodedBytes?:number;
 maxMetadataBytes?:number;maxWorkingBytes?:number;maxProcessingPixels?:number;maxUniqueColors?:number;
 maxVertices?:number;maxEdges?:number;maxRegions?:number;maxWorkUnits?:number;
}
export interface RenderOrigin {sourceHash:string;settingsHash:string;renderer:string;confirmationId:string}
export interface RootControl {generation:number;signal?:AbortSignal}
export interface RasterSummary {
 schema:2;status:'ready'|'empty'|'requires-confirmation';publicationGeneration:number;
 accepted:boolean;requiresConfirmation:boolean;proposalHash:string;originalRGBAHash:string;sourceHash:string;
 inputWidth:number;inputHeight:number;width:number;height:number;widthMm:number;heightMm:number;
 mmPerPixelX:number;mmPerPixelY:number;materials:number;regions:number;vertices:number;edges:number;
 loops:number;chains:number;curves:number;derivedErrorBoundMm:number;boundDomain:string;
 [key:string]:unknown;
}
export interface RasterPacket {version:'arch-raster-packet/1';buffers:{kind:number;bytes:Uint8Array}[]}
export interface PreparedRaster {
 readonly summary:Readonly<RasterSummary>;readonly metadata:Readonly<Record<string,unknown>>;
 readonly readable:Readonly<Record<string,unknown>>;
 describe():{header:Uint8Array;tlv:Uint8Array};copy():RasterPacket;
 acquire():PreparedRaster;release():void;
}
export interface SourceContext {
 readonly kind:'raster-source-context';readonly sourceAssemblyRequired:true;
 readonly generation:number;readonly byteLength:number;copy():Uint8Array;release():void;
}
export type EncodedRequest={bytes:Uint8Array;options?:RasterOptions;limits?:RasterLimits};
export type RGBARequest={data:Uint8ClampedArray|Uint8Array;width:number;height:number;options?:RasterOptions;limits?:RasterLimits;origin?:RenderOrigin|null};
export type SourceReference={kind:'snapshot';id:number;generation:number}|{kind:'raster';acceptedHandle:number;proposalHash:string};
export interface RuntimeResetOptions {runtimeRetired?:boolean}
export interface RasterOperations {
 version:'arch-raster-operations/1';
 prepareEncoded(request:EncodedRequest,control:RootControl):PreparedRaster;
 prepareRGBA(request:RGBARequest,control:RootControl):PreparedRaster;
 confirm(lease:PreparedRaster,proposalHash:string,control:RootControl):PreparedRaster;
 buildSourceContext(lease:PreparedRaster,options:{thicknessMm:number},control:RootControl):SourceContext;
 withSourceReference<T>(lease:PreparedRaster|SourceContext,consume:(ref:Readonly<SourceReference>)=>T):T;
 cancel(generation:number):boolean;
 control():{generation:number;phase:number;progress:number;cancelledGeneration:number};
 ownedBytes():number;retire():void;reset(options?:RuntimeResetOptions):void;
}
export function createRasterOperations(existingModule:Record<string,unknown>,options?:{maxCopyBytes?:number}):RasterOperations;
export interface RasterDispatcher {
 dispatch(method:string,request?:unknown,control?:RootControl):unknown;
 withSourceReference<T>(token:string,consume:(ref:Readonly<SourceReference>)=>T):T;
 transferables(value:unknown):ArrayBuffer[];
}
export function createRasterDispatcher(operations:RasterOperations):RasterDispatcher;
export interface RemoteRasterLease {
 readonly summary:Readonly<RasterSummary>;readonly metadata:Readonly<Record<string,unknown>>;
 copy():Promise<RasterPacket>;acquire():Promise<RemoteRasterLease>;release():Promise<void>;
}
export interface RemoteContext {
 readonly kind:'raster-source-context';readonly sourceAssemblyRequired:true;
 readonly generation:number;readonly byteLength:number;copy():Promise<Uint8Array>;release():Promise<void>;
}
export interface RasterTransport {
 version:'arch-raster-operations/1';
 prepareEncoded(request:EncodedRequest,control?:unknown):Promise<RemoteRasterLease>;
 prepareRGBA(request:RGBARequest,control?:unknown):Promise<RemoteRasterLease>;
 confirm(lease:RemoteRasterLease,hash:string,control?:unknown):Promise<RemoteRasterLease>;
 buildSourceContext(lease:RemoteRasterLease,options:{thicknessMm:number},control?:unknown):Promise<RemoteContext>;
 productSource(lease:RemoteRasterLease|RemoteContext):Readonly<{kind:'raster-token';token:string}>;
 cancel():unknown;retire():void;reset(options?:RuntimeResetOptions):Promise<void>;
}
export function createRasterTransport(binding:{call:(method:string,payload:unknown,control?:unknown)=>Promise<unknown>;cancel?:()=>unknown}):RasterTransport;
export const DEFAULT_OPTIONS:Readonly<RasterOptions>;
export const DEFAULT_LIMITS:Readonly<RasterLimits>;
export function validatePacket(packet:RasterPacket):{summary:RasterSummary;metadata:Record<string,unknown>;options:RasterOptions;limits:RasterLimits;origin:RenderOrigin|null};
export function readableSummary(summary:RasterSummary,metadata:Record<string,unknown>):Readonly<Record<string,unknown>>;
