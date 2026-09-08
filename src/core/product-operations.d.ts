export type U64 = bigint | string;
export interface ParamRecord {fieldId:number;mode:number;origin:number;datum:number;referenceLayer:number;layerCount:number;value:number;provenanceId:U64}
export interface MaterialRecord {role:number;rgba:number;slot:number;origin:number;provenanceId:U64}
export interface RegionRecord {sourceIndex:number;contextSlot?:number;contourCount?:number;fillRule?:number;overrideHeight?:boolean;semanticId:U64;provenanceId:U64;textGroup?:U64;material:MaterialRecord;height?:ParamRecord}
export interface TextRecord {semanticId:U64;provenanceId:U64;placement:0|1;baseOn:boolean;basePad:number;baseRound:number;height:ParamRecord;baseHeight:ParamRecord}
export interface DomainRecord {abiVersion:2;requiresSourceContext:true;product:number;revision:U64;records:ParamRecord[];inactive:unknown;provenance:unknown;schedule:{version:number;firstSource:number;regularSource:number;firstNm:U64;regularNm:U64;provenanceId:U64};matingToleranceMm:number;exportToleranceMm:number}
export interface ContextReference {id:number;generation:number;sourceHash:string;epoch?:number}
export interface ProductRecipe {kind:'product';packed:Uint8Array;source:
 {kind:'svg';source:string;thicknessMm?:number;longEdgeMm?:number;toleranceMm?:number} |
 {kind:'snapshot';id:number;generation:number;epoch?:number} |
 {kind:'raster';acceptedHandle:number;epoch?:number;thicknessMm?:number} |
 {kind:'contexts';contexts:ContextReference[]}}
export interface PackRequest {domainRecord:DomainRecord;headHash:string;sourceHash:string;sourceId:U64;provenanceId:U64;regions:RegionRecord[];texts?:TextRecord[];materials:MaterialRecord[];upstreamBindings:ParamRecord[];
 bevelOverrides?:{targetId:U64;provenanceId:U64;enabled:boolean;shape:number;steps:number;origin:number;radius:number}[];
 provenance:{regionSources:{contextSlot?:number;sourceIndex:number;sourceKey:string;semanticId:string}[];[key:string]:unknown};
 eyeletTextId?:U64;sourceToleranceMm?:number;limits?:{maxSlabs?:number;maxPoints?:number;maxOperations?:number;maxMetadataBytes?:number}}
export interface Head {revision:string;sourceGeneration:number;product:number;sourceHash:string;canonicalSourceHash:string;requestHash:string;headHash:string;proposalHash:string}
export interface Metadata {semanticBytes:Uint8Array;descriptor:Uint8Array;sourceMetadata:Record<string,unknown>}
export interface Proposal extends Metadata {id:number;epoch?:number}
export interface SemanticPart {meshPart:number;id:string;featureIndex:number;role:number;slot:number;origin:number;assemblyGroup:number;provenanceId:string;sourceId:string;previewTransform:number[]}
export interface Interval {fieldId:number;datum:number;mode:number;conversionAvailable:boolean;referenceLayer:number|null;z0:number;z1:number;floorDelta:number|null;ceilDelta:number|null;nearestDelta:number|null}
export interface Semantics {schema:'APMS/1';mechanicsAbi:2;mechanicsSemantics:3;sourceSemantics:2;revision:string;sourceId:string;provenanceId:string;product:number;sourceVerdict:number;mechanicsVerdict:number;exportBlocked:boolean;fitQualification:'unqualified';totalErrorBoundMm:null;parts:SemanticPart[];intervals:Interval[];features:{id:string;kind:number;parameterId:number;role:number;group:number;sourceId:string;provenanceId:string;dimensions:number[]}[];lineage:{sourceId:string;slabId:string;materialProvenanceId:string;stage:number;band:number}[];parameters:(ParamRecord&{field:string|null})[];tables:Map<number,{offset:number;stride:number;count:number}>;bytes:Uint8Array;[key:string]:unknown}
export class ProductOperationError extends Error {code:string;proposal:Proposal|null;constructor(code:string,proposal?:Proposal|null)}
export function packProductRequest(request:PackRequest):Uint8Array;
export function packProductConfirmation(descriptor:Uint8Array,current:{headHash:string;revision:U64}):Uint8Array;
export function readProductSemantics(bytes:Uint8Array):Semantics;
export function readProductHead(bytes:Uint8Array):Head;
/** Module is the existing Emscripten root runtime; ABI/version checks are runtime checks. */
export function createProductOperations(Module:Record<string,unknown>):{
 prepare(recipe:ProductRecipe,generation:number):number;buildRequest(request:number,generation:number):number;releaseRequest(id:number):number;
 metadata(id:number):Metadata;releaseProposal(id:number):number;confirm(id:number,descriptor:Uint8Array,current:{headHash:string;revision:U64},generation:number):Uint8Array};
