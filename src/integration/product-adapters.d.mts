import type {Control,DomainState,ModelLease,Ticket,Block} from '../app/adapters.mjs';
import type {ProductMaterialExtension} from '../contracts/product-material.mjs';
export type {ProductMaterialExtension} from '../contracts/product-material.mjs';
export const PRODUCT_APP_VERSION:'arch-product-app/1';
export const PRODUCT_MECHANICS_SEMANTICS:3;
export const PRODUCT_SOURCE_SEMANTICS:2;
export const PRODUCT_ROLES:readonly ['body','artwork','rim','skirt','stem','tray','fastener','text','textBase'];
export type NativeRole=typeof PRODUCT_ROLES[number];
export type Json=null|boolean|number|string|Json[]|{[key:string]:Json};
export type Hash=string;
export interface HeightRecord {mode:1|2;origin:0|1|2;datum:number;referenceLayer:number;layerCount:number;value:number}
export interface ContextBinding {key:string;sha256:Hash;derivationHash:Hash|null}
export interface RegionBinding {sourceKey:string;contextKey:string;nativeKey:string;materialId:string;textKey:string|null;height:HeightRecord|null;geometryHash?:Hash;authoredKey?:string|null}
export interface TextBinding {sourceKey:string;placement:0|1;baseOn:boolean;basePad:number;baseRound:number;height:HeightRecord;baseHeight:HeightRecord}
export interface SourcePaletteBinding {
 parserId:string;materialId:string;identityTuple:string[];parserDefaultsHash:Hash;measurementHash:Hash;
}
export interface BindingRecord {
 version:'arch-product-bindings/1';projectId:string;sourceId:string;sourceRevision:number;rawHash:Hash;
 contexts:ContextBinding[];regions:RegionBinding[];roles:Record<NativeRole,string>;texts:TextBinding[];
 eyeletTextKey:string|null;sourceToleranceMm:number;textStateHash:Hash|null;
 nextRegionSerial?:number;retiredRegions?:RegionBinding[];adoptionProvenance?:Record<string,Json>;
 heightBindingEvidence?:Record<string,Json>;
 identityLedger?:{version:'arch-product-identities/1';records:Identity[]};
}
export interface SourceDescriptor {
 id:string;name:string;revision:number;kind:'svg'|'raster'|'text'|'emoji';raw:{hash:Hash;byteLength:number};assetHashes:Hash[];
 metadata:Record<string,unknown>&{sourceContext:{version:'arch-source-context/1';operation:'import'|'convert';id:string;revision:number;predecessor:null|{id:string;revision:number;rawHash:Hash}};productBindings?:BindingRecord};
 [key:string]:unknown;
}
export interface Material {
 id:string;label:string;color:string;slot:number|null;role:'region'|'body'|'text'|'textBase'|'stem'|'tray'|'other';
 overridden:boolean;backgroundEligible?:boolean;excluded:boolean;areaPercent?:number;heightLayers?:number;product?:ProductMaterialExtension;
 [key:string]:unknown;
}
export function validateProductMaterialExtension(value:unknown):Readonly<ProductMaterialExtension>;
export interface Identity {kind:string;key:string;id:string;sha256:Hash;tuple:readonly string[]}
export interface CanonicalContext {
 key:string;sourceHash:Hash;derivationHash:Hash|null;
 regions:{nativeKey:string;sourceIndex:number;geometryHash:Hash;authoredKey:string|null;rgba:number;materialId?:string}[];
}
export interface MaterialDefaultsPolicy {version:'arch-product-material-defaults/1';provenance:Record<string,Json>;products:Record<'keychain'|'clicky'|'strap'|'lego'|'charm',Record<NativeRole,{color:string}>>}
export const PRODUCT_MATERIAL_DEFAULTS:Readonly<MaterialDefaultsPolicy>;
export interface Adoption {
 version:'arch-product-adoption/1';status:'ready'|'proposal'|'blocked';adoptionHash:Hash;
 expected:{projectId:string;revision:number;headHash:Hash;sourceId:string;sourceRevision:number;rawHash:Hash};
 productBindings:BindingRecord;source:SourceDescriptor;sourceMetadata:SourceDescriptor['metadata'];materials:Material[];materialDefaults:Material[];
 changes:Record<string,Json>[];diagnostics:Record<string,Json>[];proposals:Record<string,Json>[];
 requiresCommit:true;geometryChanged:false;identityLedgerHash:Hash;
 fitQualification:'unqualified';printerQualification:'unverified';
}
export function prepareBindings(input:{projectId:string;state:DomainState;source:SourceDescriptor;canonicalContexts:CanonicalContext[];sourceMaterials?:Material[];sourceMaterialDefaults?:Material[];defaults?:MaterialDefaultsPolicy;textBindings?:{texts:TextBinding[];eyeletTextKey?:string|null;contextTextKeys?:Record<string,string>}|null;sourceToleranceMm?:number}):Promise<Adoption>;
export function deriveProductIdentities(input:{projectId:string;sourceId:string;keys:{kind:string;key:string}[]}):Promise<readonly Identity[]>;
export class ProductAppError extends Error {code:string;details:Record<string,unknown>;constructor(code:string,details?:Record<string,unknown>)}
export interface ProductHead {revision:string;sourceGeneration:number;product:number;sourceHash:Hash;canonicalSourceHash:Hash;requestHash:Hash;headHash:Hash;proposalHash:Hash}
export interface RootLease {id:number;epoch:number;generation:number;metadata:{semanticBytes:Uint8Array;descriptor:Uint8Array;sourceMetadata:Record<string,unknown>};bytes():Uint8Array;release():void}
export type SourceReference={kind:'raster-token';token:string;epoch:number}|{kind:'snapshot';id:number;generation:number;epoch:number};
export type SourceRecipe=SourceReference|{kind:'contexts';contexts:(({token:string;epoch:number}|{id:number;generation:number;epoch:number})&{sourceHash:Hash;translationNm?:readonly [string,string]})[]}|{kind:'svg';source:string;thicknessMm?:number;longEdgeMm?:number;toleranceMm?:number};
export interface ProductRecipe {kind:'product';source:SourceRecipe;packed:Uint8Array}
export interface RuntimeClient {epoch:number;
 sourceFrame?(source:RootLease,request:{version:'arch-source-frame/1';sourceHash:Hash;matrix:readonly [number,number,number,number,number,number]},options:{generation:number}):Promise<RootLease>;
probeProduct?(request:ProductRecipe,options:{generation:number}):Promise<NativeDatumProposal>;build(request:ProductRecipe,options:{generation:number}):Promise<RootLease>;build(request:{kind:'svg';source:string;thicknessMm?:number;longEdgeMm?:number;toleranceMm?:number},options:{generation:number}):Promise<Omit<RootLease,'metadata'>&{metadata:Record<string,unknown>}>;releaseProductProposal(proposal:unknown):void;confirmProduct(proposal:unknown,current:{headHash:Hash;revision:number},options:{generation:number}):Promise<Uint8Array>}
export type Operation=<T>(control:Control,invoke:(client:RuntimeClient,generation:number)=>T|Promise<T>)=>Promise<T>;
export interface DomainRecord {abiVersion:2;requiresSourceContext:true;product:number;revision:number;records:{fieldId:number;mode:number;origin:number;datum:number;referenceLayer:number;layerCount:number;value:number;provenanceId:bigint}[];[key:string]:unknown}
/** Trusted composition callback. Normal app instances MUST leave it absent.
 * Only mesh-generated-base's private factory mints a live token. */
export interface GeneratedBaseAuthority {
 state:DomainState;currentState:DomainState;headHash:Hash;provenance:Record<string,Json>;assertCurrent():void;
}
export interface PreparationContext {
 generatedBase?:object;
 control:Control;state:DomainState;assets:Map<Hash,Uint8Array>;source:SourceDescriptor;bindings:BindingRecord;domainRecord:DomainRecord;receipt:Record<string,Json>|null;
 /** Optional wrapper for SVG/text RPCs. Raster facade already delegates to the
  * same parent operation. Each mutation gets a fresh transport generation. */
 run<T>(invoke:(client:RuntimeClient,generation:number)=>T|Promise<T>):Promise<T>;
}
export interface BorrowedSource {
 version:'arch-product-contexts/1';owner:RuntimeClient;epoch:number;source:SourceRecipe;
 contexts:{key:string;sourceHash:Hash;derivationHash:Hash|null;regions:{nativeKey:string;sourceIndex:number}[]}[];
 /** Each reader returns the exact live reference from facade.productSource or
  * a root snapshot lease. Never persist these references in project metadata. */
 references:(()=>SourceReference)[];assertOwned():void;authorization:Record<string,Json>|null;textStateHash:string|null;
 upstreamBindings?:{fieldId:number;mode:number;value:number}[];
}
export interface GeometryProposal {
 version:'arch-product-geometry-proposal/1';ticket:Ticket;code:string;metadata:Record<string,Json>;head:ProductHead;
 /** Only call from explicit user consent after parent head CAS/preflight. Does
  * not change the domain or create a model. Consumed even on failure. */
 confirm(control:Control):Promise<Uint8Array>;release():void;
}
export interface ProductModelLease extends ModelLease {
 blocks:(Block&{role:NativeRole;sourceSemanticIds:string[];partIndex:number;featureIndex:number})[];
 product:{version:'arch-product-app/1';head:ProductHead;contextHash:Hash;semantics:Record<string,Json>;exportDescriptor:Record<string,Json>};
}
export interface PreparedRecipe {
 readonly recipe:ProductRecipe;readonly headHash:Hash;readonly revision:number;readonly contextHash:Hash;
 assertCurrent():Promise<void>;
}
export function createProductAdapters(options:{
 generatedBaseAuthority?:(token:object)=>GeneratedBaseAuthority;
 operation:Operation;kernelLeases:WeakMap<ModelLease,{root:RootLease;client:RuntimeClient}>;
 context:()=>{userId:string;projectId:string;sessionKey:string;state:DomainState};
 withPreparedSource:<T>(context:PreparationContext,consume:(source:BorrowedSource)=>Promise<T>)=>Promise<T|{status:'proposal';[key:string]:unknown}>;
 withPreparedDatumSource?:<T>(context:PreparationContext&{baseState:DomainState},consume:(source:BorrowedSource)=>Promise<T>)=>Promise<T|{status:'proposal';[key:string]:unknown}>;
 probeNative?:(client:RuntimeClient,recipe:ProductRecipe,control:{generation:number})=>Promise<NativeDatumProposal>;
 /** Return literal true synchronously to accept ownership. Without a consumer,
  * native proposal is released; source proposals return a precise diagnostic. */
 onGeometryProposal?:(proposal:GeometryProposal)=>true|false|void;
 onSourceProposal?:(proposal:{status:'proposal';[key:string]:unknown})=>true|false|void;
}):{
 version:'arch-product-app/1';
 engine:{version:'arch-app-adapters/1';identity:{id:'arch-product-app';version:'1'};capabilities:{id:string;available:boolean;reason?:string}[];build(input:Control&{state:DomainState;assets:ReadonlyMap<string,Uint8Array>;generatedBase?:object}):Promise<ProductModelLease>};
 prepareRecipe<T>(input:Control&{state:DomainState;assets:ReadonlyMap<string,Uint8Array>},consume:(recipe:PreparedRecipe)=>Promise<T>):Promise<T>;
 /** Valid only inside prepareRecipe's callback. Caller releases root on failure. */
 mapModelLease(input:{prepared:PreparedRecipe;root:RootLease;client:RuntimeClient;generation:number}):Promise<ProductModelLease>;
 inspectModel(input:{model:ProductModelLease;control:Control}):Promise<CurrentModelState>;
 probeDatums(input:Control&{control?:Control;state:DomainState;prospectiveState:DomainState;assets:ReadonlyMap<string,Uint8Array>}):Promise<DatumProbe>;
 prepareHeightBindings(input:{model:ProductModelLease;control:Control;changes:HeightChange[]}):Promise<HeightProposal>;
 reset():Promise<void>;
};

export interface CurrentModelState {
 version:'arch-product-model-state/1';modelLeaseId:string;head:ProductHead;contextHash:Hash;
 snapshot:{id:number;generation:number;epoch:number};source:{id:string;revision:number;rawHash:Hash};
 semantics:Record<string,Json>;exportDescriptor:Record<string,Json>;
 gates:{matchingHead:true;nativeBuildAccepted:boolean;sourceVerdict:number;mechanicsVerdict:number;exportBlocked:boolean;
  independentMeshVerdict:0;requiresParentGateState:true;finalSceneValidation:'unverified';totalErrorBoundMm:null;fitQualification:'unqualified';printerQualification:'unverified'};
}
export type HeightTarget={kind:'parameter';field:string}|{kind:'region';sourceKey:string}|{kind:'text';sourceKey:string;field:'height'|'baseHeight'};
export type HeightChange={target:HeightTarget}&({mode:'layers';layers:number;binding?:'actual-face'}|{mode:'mm';mm:number;binding?:'actual-face'|'unspecified-mm'});
export interface HeightProposal {
 version:'arch-product-height-proposal/1';status:'blocked'|'proposal';proposalHash:Hash;
 expected:{projectId:string;userId:string;revision:number;headHash:Hash;requestHash:Hash;contextHash:Hash;source:CurrentModelState['source'];mechanicsSemantics:3;sourceSemantics:2};
 updates:Record<string,Json>[];diagnostics:Record<string,Json>[];
 productBindings:BindingRecord|null;materials:Material[]|null;text:Record<string,Json>|null;
 parameterCommand:{id:'parameters.set';args:{changes:{id:string;value:Json}[]}}|null;
 requiresExplicitConsent:true;requiresAtomicCommit:true;requiresNativeRebuild:true;geometryVerified:false;fitQualification:'unqualified';
}

export interface NativeDatumProposal {id:number;epoch:number;semanticBytes:Uint8Array;descriptor:Uint8Array;sourceMetadata:Record<string,unknown>}
export interface DatumFace {
 fieldId:number;datum:number;mode:number;conversionAvailable:boolean;referenceLayer:number|null;semanticId:string;
 z0:number;z1:number;coordinateFrame:'manufacturing-z';
}
export interface DatumProbe {
 version:'arch-product-datum-probe/1';status:'proposal'|'blocked';head:ProductHead;baseHeadHash:Hash;contextHash:Hash;
 metadata:Record<string,Json>&{mechanicsSemantics:3;sourceSemantics:2;datumProbeVersion:1};
 requiresExplicitConsent:true;geometryVerified:false;
 confirm(control:Control):Promise<Uint8Array>;release():void;
}
