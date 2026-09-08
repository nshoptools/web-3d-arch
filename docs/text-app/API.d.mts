import type {Control,Ticket,SourceAdapter,SourceResult,DomainState,SourceContext,SourceConfirmation} from '../../src/app/adapters.mjs';
import type {FontCatalogEntry,Collection,PreparedSource,Geometry,Matrix,RendererIdentity} from '../../src/input/index.mjs';
export interface AssetURL {sha256:string;bytes:number;url:string;mediaType:string}
export interface SourceCatalogRecord {
 version:'arch-source-catalog/1';fonts:FontCatalogEntry[];
 collections:(Collection & {selection:{kind:'outline'|'COLRv1'|'CBDT/CBLC'|'svg';fontId?:string;svgIndex?:number}})[];
 previews:{collectionId:string;itemId:string;sha256:string;sourceKind:string;[key:string]:unknown}[];
 defaultFontId:string;defaultCollectionId:string;
 labels?:{version:string;source:string;entries:{collectionId:string;itemId:string;vi?:string;keywords?:string[]}[]};
}
export interface Catalog {
 origin:string;defaultFontId:string;defaultCollectionId:string;
 sourceCollections():Collection[];asset(hash:string):AssetURL;font(id?:string):FontCatalogEntry;
 emoji(id:string,collectionId?:string):{collectionId:string;item:unknown;text:string;source:unknown;preview:unknown};
 queryFonts(query?:string):Awaited<ReturnType<NonNullable<SourceAdapter['queryFonts']>>>;
 queryEmoji(query?:string,collectionId?:string,offset?:number):Awaited<ReturnType<NonNullable<SourceAdapter['queryEmoji']>>>;
 registerImported(record:FontCatalogEntry):FontCatalogEntry;reset():void;
 snapshot():{catalog:SourceCatalogRecord;assetURLs:AssetURL[];origin:string};
}
export interface GroupBinding {textId:string|bigint;sourceId:string|bigint;provenanceId:string|bigint}
export interface PreparedGroups {
 version:'arch-prepared-text-groups/1';status:'binding-required'|'prepared-curves';coordinateSpace:'mm-y-up';regions:never[];
 required?:string[];texts:{id:string;sourceId:string;provenanceId:string;artifactHash:string;sourceHashes:string[];geometry:Geometry;
 svg:Uint8Array|null;svgExport:{status:string;parserViewportToSourceMm?:Matrix|null};canonicalization:'parent-validated-source-parser-required';sourceBoundVerified:false;fitVerified:false}[];
}
export interface Preview {
 width:number;height:number;data:Uint8ClampedArray;png:Uint8Array;mediaType:'image/png';pixelSizeMm:number;
 sha256:string;pixelToSourceMm:Matrix;renderer:RendererIdentity|Record<string,unknown>;nativeProfileMetadata:unknown;
}
export interface PreparedResult {
 version:'arch-app-adapters/1';ticket:Ticket;sourceContext:SourceContext|null;prepared:PreparedSource;preview:Preview|null;
 previewDiagnostic:{code:string;message:string;stage:string}|null;preparedGroups:PreparedGroups;
 assembly:Record<string,unknown>;parameters:Record<string,unknown>;
 conversion?:{status:'proposal';receipt:{ticket:Ticket;artifactHash:string;proposalHash:string};details:Record<string,unknown>};
}
export interface Confirmation {kind:'text'|'emoji';version:'arch-text-confirmation/1';approvalHash:string;proposalHash:string}
export interface AcceptanceReceipt {
 kind:'text'|'emoji';version:'arch-source-confirmation-receipt/1';approvalHash:string;proposalHash:string;
 sourceHash:string;rgbaHash:string;artifactHash:string;settingsHash:string;projectId:string;sourceRevision:number;acceptedAtRevision:number;
}
export interface AcceptanceInput extends Control {
 sourceContext:SourceContext;confirmation:SourceConfirmation;source:Record<string,unknown>;assets:ReadonlyMap<string,Uint8Array>;acceptedAtRevision:number;
}
export interface AcceptanceResult {version:'arch-app-adapters/1';ticket:Ticket;confirmation:Confirmation;receipt:AcceptanceReceipt}
export interface TextAdapter extends SourceAdapter {
 ingest(input:Control & {state?:DomainState;sourceContext?:SourceContext;file:{name:string;mediaType:string;bytes:Uint8Array};purpose:'font'|'source'|'mesh'}):Promise<SourceResult>;
 convert(input:Parameters<NonNullable<SourceAdapter['convert']>>[0] & {raster?:{width:number;height:number}}):Promise<{
  status:'proposal';result:SourceResult;changes:string[];confirmation:Confirmation}>;
 acceptProposal(input:AcceptanceInput):Promise<AcceptanceResult>;
 prepareText(input:Control & {groupBinding?:GroupBinding}):Promise<PreparedResult>;prepareSource(input:Control & {groupBinding?:GroupBinding}):Promise<PreparedResult>;
 queryFonts:NonNullable<SourceAdapter['queryFonts']>;queryEmoji:NonNullable<SourceAdapter['queryEmoji']>;
 selectEmoji:NonNullable<SourceAdapter['selectEmoji']>;reset():void;clearPrivateState():void;dispose():void;
}
export type Request={version:'arch-app-adapters/1';ticket:Ticket;op:'font.import'|'text.import'|'prepare.text'|'prepare.source'|'emoji.select'|'source.convert'|'source.confirm';
 sourceContext?:SourceContext;state?:DomainState;assetsMap?:ReadonlyMap<string,Uint8Array>;file?:{name:string;mediaType:string;bytes:Uint8Array};id?:string;collectionId?:string;
 groupBinding?:GroupBinding;raster?:{width:number;height:number};receipt?:{ticket:Ticket;artifactHash:string;proposalHash:string};decision?:'accept-source-conversion'};
export interface SameModule { _arch_abi_version():number;[key:string]:unknown }
export interface TextOperationOptions {
 Module:SameModule;catalog:SourceCatalogRecord;assetURLs:AssetURL[];origin:string;
 /** Trusted parent namespace already bound to precisely Module. The HB API has no binding getter. */
 hb?:Record<string,unknown>;runtime:{engine:string;version:string};fetchImpl?:typeof fetch;rendererPort?:MessagePort;deadlineMs?:number;
 previewPaths?:(input:{prepared:PreparedSource;ticket:Ticket;signal:AbortSignal;resolution:number})=>Promise<{
  width:number;height:number;data:Uint8ClampedArray;pixelToSourceMm:Matrix;renderer?:Record<string,unknown>;nativeProfileMetadata?:unknown}|null>;
 encodePNG?:(input:{width:number;height:number;data:Uint8ClampedArray},control:{signal:AbortSignal})=>Promise<Uint8Array>;
}
export interface TextOperations {
 version:'arch-text-operations/1';capabilities:{canvas2d:boolean;fontFace:boolean;fontSet:boolean;imageBitmap:boolean};
 run(request:Request,control:{signal?:AbortSignal;onProgress?:Control['onProgress'];isCurrent(ticket:Ticket):boolean}):Promise<PreparedResult|Record<string,unknown>>;
 cancel():void;reset(input?:{rendererPort?:MessagePort}):void;dispose():void;stats():Record<string,unknown>;
}
export interface TextAdapterOptions {
 catalog:Catalog;invoke:(request:Request,control:Control)=>Promise<PreparedResult|Record<string,unknown>>;
 context:()=>{state:DomainState;assetsMap:ReadonlyMap<string,Uint8Array>};
}
export type CreateTextAdapters=(options:TextAdapterOptions)=>TextAdapter;
export type CreateTextOperations=(options:TextOperationOptions)=>TextOperations;
