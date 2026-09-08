import type {Control,DomainState,SourceAdapter,SourceAdoptionInput,SourceAdoption,SourceResult,ProductSourceAuthority} from '../app/adapters.mjs';
import type {Adoption,CanonicalContext,Operation,RuntimeClient,PreparationContext,BorrowedSource,TextBinding,SourceDescriptor,Material,BindingRecord,DatumProbe,DatumFace,ProductHead,Hash} from './product-adapters.mjs';
export const PRODUCT_SOURCE_CONTEXTS_VERSION:'arch-product-source-contexts/1';
export const PRODUCT_SOURCE_LIMITS:Readonly<{contexts:33;regions:256;points:200000;indices:600000;contours:66666;snapshotBytes:number;assets:10000;assetBytes:number;svgBytes:1048576;metadataBytes:65536;artifactBytes:16384;adoptionBytes:262144}>;
export interface TextManufacturingFrame {
 readonly version:'arch-text-manufacturing-frame/1'|'arch-text-manufacturing-frame/2';readonly originalNumericSvgHash:string;
 readonly transform:readonly [number,number,number,number,number,number];
 readonly originalFrame:readonly [number,number,number,number,number,number];
 readonly mode:'absolute-overlay'|'source-art-normalized-origin';
 readonly translationNm?:readonly [string,string];readonly translationInputMm?:readonly [number,number];
 readonly translationQuantization?:{rule:'nearest-ties-even-serialized-decimal-nm';signedDeltaMm:readonly [number,number];boundMm:number};readonly canonicalTranslationErrorBoundMm?:0;
 readonly sourceGeometryChanged:false;readonly totalErrorBoundMm:null;readonly sha256:string;readonly derivationHash:string;
}
export interface PendingBindings {
 readonly version:'arch-product-bindings-pending/1';readonly projectId:string;readonly sourceId:string;readonly sourceRevision:number;readonly rawHash:string;
 readonly reason:'RASTER_SEGMENTATION_APPROVAL_REQUIRED'|'SOURCE_NUMERIC_OUTLINES_UNAVAILABLE';
 readonly requiredAction:'source.convert-raster';readonly canonicalGeometry:false;readonly requiresExplicitSourceApproval:true;
}
export interface DeferredAdoption {
 readonly version:'arch-product-adoption-deferred/1';readonly status:'deferred';readonly adoptionHash:string;
 readonly expected:Adoption['expected'];readonly productBindings:PendingBindings;
 readonly materials:SourceAdoption['materials'];readonly materialDefaults:SourceAdoption['materialDefaults'];
 readonly requiresCommit:true;readonly geometryChanged:false;readonly modelAvailable:false;
 readonly diagnostics:readonly {code:'PRODUCT_SOURCE_CONVERSION_REQUIRED';reason:PendingBindings['reason'];requiredAction:'source.convert-raster'}[];
}
export interface ArtifactPlan {
 readonly version:'arch-product-artifacts/1';
 readonly overlay:null|Readonly<{contextKey:'text:primary';sourceKey:'text:primary';svgHash:string;artifactHash:string;textStateHash:string;derivationHash:string;frame:TextManufacturingFrame;sourceRecords:readonly unknown[];claims:unknown;parameters:unknown;assembly:unknown}>;
 readonly assets:readonly {kind:'derived'|'dependency';bytes:Uint8Array}[];
}
export interface RasterPacket {version:'arch-raster-packet/1';buffers:{kind:number;bytes:Uint8Array}[]}
export interface SourceContextRuntimeClient extends RuntimeClient {
 readonly serviceCapabilities:Readonly<{sourceFrameVersion?:number;geometryVersions:{mechanicsAbi:number;mechanicsSemantics:number;sourceAbi:number;sourceSemantics:number;datumExtension:number};raster?:boolean}>;
}
export interface SourceContextKernel {operation:Operation;ensureRuntime(control:Control):Promise<SourceContextRuntimeClient>}
export interface SourceContextServices {
 source:SourceAdapter;
 text:{prepareText(control:Control):Promise<{prepared:unknown;parameters:unknown;assembly:unknown}>};
 raster:{prepareRecipe<T>(control:Control&{state:DomainState;assets:ReadonlyMap<string,Uint8Array>},consume:(ready:{status:'ready';nativeSource:{kind:'raster-token';token:string;epoch:number};packet:RasterPacket;receipt:unknown;preparation:unknown})=>Promise<T>):Promise<T|{status:'proposal';sourceProposal:unknown}>};
}
export function sourceGeometry(input:{bytes:Uint8Array;metadata:Record<string,unknown>;key?:string;sourceHash:string;derivationHash?:string|null;translationNm?:readonly [string,string];includeRings?:boolean;control?:Control}):Promise<CanonicalContext>;
export function rasterSourceGeometry(input:{packet:RasterPacket;key?:string;sourceHash:string;derivationHash:string;includeRings?:boolean;control?:Control}):Promise<CanonicalContext>;
export interface TextBindingResolution {texts:TextBinding[];eyeletTextKey?:string|null;contextTextKeys?:Record<string,string>}
export function createProductSourceContexts(options:{
 generatedBaseAuthority?:(token:object)=>import('./product-adapters.mjs').GeneratedBaseAuthority;
 kernel:SourceContextKernel;sources:SourceContextServices;
 /** Default is Boole ASFR/1; bundle/2 must be selected explicitly for the prior qualified Module. */
 frameTransport?:'source-frame/1'|'product-context-bundle/2';
 context:()=>{state:DomainState;userId:string;projectId:string;sessionKey:string;assetsMap?:ReadonlyMap<string,Uint8Array>};
 probeDatums?:(input:Control&{control:Control;state:DomainState;prospectiveState:DomainState;assets:Map<string,Uint8Array>})=>Promise<DatumProbe>;
 prepareProspectiveText?:(request:{version:'arch-app-adapters/1';ticket:Control['ticket'];op:'prepare.source'|'prepare.text';state:DomainState;assetsMap:unknown},control:Control)=>Promise<unknown>;
 resolveTextBindings?:(input:{control:Control;state:Readonly<DomainState>;source:Readonly<SourceDescriptor>;canonicalContexts:CanonicalContext[];required:{heightDatum:133;baseDatum:134;coordinateFrame:'manufacturing-z';mechanicsSemantics:3;sourceSemantics:2}})=>Promise<TextBindingResolution|null>;
}):{
 version:'arch-product-source-contexts/1';source:SourceAdapter;
 captureArtifacts(control:Control&{state?:DomainState}):Promise<ArtifactPlan>;
 captureSourceResult<T extends SourceResult|{status:'proposal';result:SourceResult}>(control:Control&{state?:DomainState;purpose?:'source'},reply:T,plan?:ArtifactPlan):Promise<T>;
 prepareAdoptionPlan(input:SourceAdoptionInput):Promise<Adoption|DeferredAdoption>;
 prepareAdoption(input:SourceAdoptionInput):Promise<SourceAdoption>;
 withPreparedSource<T>(input:PreparationContext,consume:(source:BorrowedSource)=>Promise<T>):Promise<T|{status:'proposal';sourceProposal:unknown}>;
 prepareUpdate(input:SourceUpdateInput|Omit<SourceUpdateInput,keyof Control>&{control:Control}):Promise<SourceUpdateProposal>;
 withValidatedRegions<T>(input:ValidatedSourceInput,consume:(checked:ValidatedSourceRegions)=>Promise<T>):Promise<T|{status:'proposal';sourceProposal:unknown}>;
 withPreparedDatumSource<T>(input:PreparationContext&{baseState:DomainState},consume:(source:BorrowedSource)=>Promise<T>):Promise<T|{status:'proposal';sourceProposal:unknown}>;
 /** Invalidates private borrows; it does not reset the parent Module/scheduler. */
 reset():Promise<void>;
};

export function manufacturingTextSVG(svgBytes:Uint8Array,svgExport:{status:'ready';parserViewportToSourceMm:readonly [number,number,number,number,number,number]},options?:{overlay?:boolean}):Promise<{bytes:Uint8Array;descriptor:TextManufacturingFrame}>;
export type RingsNm=readonly (readonly (readonly [string,string])[])[];
export interface ValidatedRegion {nativeKey:string;sourceIndex:number;geometryHash:string;authoredKey:string|null;rgba:number;ringsNm:RingsNm}
export interface ValidatedSourceInput {
 control:Control;state:DomainState;source?:SourceDescriptor;assets:ReadonlyMap<string,Uint8Array>;
 frame?:'manufacturing'|'source';includeOverlay?:boolean;toleranceMm?:number;
}
export interface ValidatedSourceRegions {
 readonly version:'arch-validated-source-regions/1';readonly source:Readonly<SourceDescriptor>;readonly state:Readonly<DomainState>;
 readonly headHash:Hash;readonly sessionKey:string;readonly mechanicsSemantics:3;readonly sourceSemantics:2;
 readonly frame:'manufacturing'|'source';readonly assets:ReadonlyMap<string,Uint8Array>;
 readonly contexts:readonly {
  readonly key:string;readonly sourceHash:Hash;readonly derivationHash:Hash|null;readonly kind:'svg'|'raster';
  readonly coordinateFrame:'manufacturing-xy-mm'|'parser-viewport-mm'|'raster-working-mm-x-right-y-down';
  readonly nativeToSourceMm:readonly number[]|null;readonly sourceBytes:Uint8Array;
  readonly metadata:Record<string,unknown>;readonly validation:Record<string,unknown>;readonly regions:readonly ValidatedRegion[];
  readonly packet?:RasterPacket;readonly originalNumericSvgHash?:Hash|null;
 }[];
 assertCurrent():void;readonly geometryVerified:false;readonly totalErrorBoundMm:null;
}
export interface SourceUpdateInput {
 control?:Control;version:Control['version'];ticket:Control['ticket'];signal:AbortSignal;onProgress:Control['onProgress'];
 state:DomainState;assets:ReadonlyMap<string,Uint8Array>;text?:Record<string,unknown>;
 sourceAuthority?:ProductSourceAuthority;prospectiveState?:DomainState;source?:SourceDescriptor;materials?:Material[];materialDefaults?:Material[];
 materialChanges?:readonly {materialId:string;heightLayers:number}[];
 parameterChanges?:readonly {id:string;value:unknown}[];
}
export interface SourceUpdateExpected {userId:string;projectId:string;revision:number;headHash:Hash;sessionKey:string}
export interface SourceUpdateProposal {
 readonly version:'arch-product-source-update/1';readonly status:'proposal'|'blocked';readonly expected:SourceUpdateExpected;
 readonly proposalHash:Hash;readonly proposedStateHash:Hash|null;readonly nativeHead:ProductHead|null;
 readonly faces:readonly DatumFace[];readonly diagnostics:readonly Record<string,unknown>[];
 readonly planeChoices:readonly {
  strategy:'floor'|'ceil';datum:number;semanticId:string;faceZMm:number;proposedFaceZMm:number;deltaMm:number;referenceLayer:number;
  parameterChanges:readonly {id:string;value:unknown}[];domainValid:boolean;requiresNewNativeProbe:true;requiresExplicitGeometryConsent:true;
 }[];
 readonly bindingProposals:readonly Record<string,unknown>[];readonly bindingChanges:readonly Record<string,unknown>[];
 readonly assetReferences:readonly {sha256:Hash;bytes:number}[];
 readonly requiresAtomicCommit:true;readonly requiresExplicitConsent:true;readonly requiresNativeRebuild:true;readonly geometryVerified:false;
 preview():{state:DomainState;assets:readonly {kind:string;sha256:Hash;bytes:Uint8Array}[]};
 replan(control:Control,choiceIndex:number):Promise<SourceUpdateProposal>;
 confirm(control:Control):Promise<{
  version:'arch-product-source-update-commit/1';proposalHash:Hash;expected:SourceUpdateExpected;state:DomainState;nativeReceipt:Uint8Array|null;
  source:SourceDescriptor;productBindings:BindingRecord;materials:Material[];materialDefaults:Material[];text:Record<string,unknown>;
  assets:readonly {kind:string;sha256:Hash;bytes:Uint8Array}[];requiresAtomicCommit:true;requiresNativeRebuild:true;
 }>;
 release():void;
}
