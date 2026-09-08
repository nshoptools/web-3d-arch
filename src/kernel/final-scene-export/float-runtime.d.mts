export type Hash = string;
export type Revision = string;
export interface FinalMaterial {part:number;slot:number;rgba:number;source:number;materialSource:number;reserved?:0}
export interface FinalExportOptions {
 format:1;generation?:number;gates:number;verdict:1;inspection:0;
 revision:Revision;expectedRevision:Revision;filename:string;mapping:FinalMaterial[];
 orientation?:0|1|2;rest?:0|1;error?:number;matrix?:number[];limits?:number[];
 sectionMode?:0;side?:0;color?:0;units?:0;z0?:0;z1?:0;step?:0;
}
export interface FloatConditioningOptions {version:1;maximumDisplacementMm:number;workLimit:number}
export interface FloatConfirmation {
 version:'arch-final-float-confirmation/1';proposalHash:Hash;sourceHash:Hash;
 sourceGeneration:number;sourceRevision:Revision;optionsHash:Hash;
}
export interface FloatComponent {vertices:number;edges:number;faces:number;euler:number;orientation:1|-1;volumeMm3:number}
export interface FloatSummary {
 version:'arch-final-float-conditioning/1';algorithm:'nearest-binary32-paired-edge-link-quotient/1';
 requiresConfirmation:true;confirmed:boolean;proposalHash:Hash;geometryHash:Hash;contextHash:Hash;
 sourceVertices:number;sourceTriangles:number;candidateVertices:number;candidateTriangles:number;
 collapsedEdges:number;removedDegenerateFaceImages:number;maximumDisplacementMm:number;
 hausdorffUpperBoundMm:number;requestedLimitMm:number;components:FloatComponent[];candidateVolumeMm3:number;
 workUnits:number;workLimit:number;workingAdmissionBytes:number;residentBytes:number;
 qualification:{wholePipelineErrorBoundMm:null;physicalFit:'unqualified';ambientIsotopy:'unverified';materialPolicy:string};
}
export interface FloatMetadata {version:'arch-final-float-proposal/1';confirmation:FloatConfirmation;conditioning:FloatSummary;
 originalUnionVolumeMm3:number;originalBoundsMm:number[];originalTransform:number[];materialMapping:FinalMaterial[]}
export interface FloatProposal {
 readonly version:'arch-final-float-proposal/1';readonly id:number;readonly epoch:number;
 readonly confirmation:Readonly<FloatConfirmation>;readonly metadata:FloatMetadata;
 /** Fresh defensive copy, valid independently of native memory growth. */
 view(kind:1|3):Float64Array;
 view(kind:2|4|5|6|7|8):Uint32Array;
 /** Primary proposal release is idempotent; retired cleanup never starts a Worker. */
 release():void;
}
export interface FinalArtifact {bytes:Uint8Array;metadata:Record<string,unknown>}
export interface RootReader {readonly id:number;readonly generation:number;readonly epoch:number;bytes():Uint8Array}
export interface SceneGeometryRequest {revision:Revision;expectedRevision:Revision;mapping:Required<Omit<FinalMaterial,'reserved'>>[]}
export interface SceneGeometryMetadata {
 version:'arch-final-scene-geometry/1';sourceSnapshotSha256:Hash;sourceSnapshotId:number;sourceSnapshotGeneration:number;
 revision:Revision;format:'ARCH/1';geometry:'material-union';grouping:'slot-rgba-materialSource/1';
 groups:{part:number;slot:number;rgba:number;materialSource:number;inputParts:number[];sourceIndices:number[]}[];
 meshVerdict:'unverified';nativeWarningFlags:number;coordinateFrame:'source-manufacturing-mm';boundsMm:number[];sourceUnchanged:true;
}
export interface PrintingVersions {readonly rootABI:2;readonly arch3mfABI:1;readonly kernel3mfABI:2;readonly epoch:number}
export interface FinalFloatClient {
 readonly serviceCapabilities?:{readonly printingVersions:PrintingVersions|null;readonly finalFloat?:boolean;readonly finalSceneGeometry?:boolean};
 prepareFinalFloat(root:RootReader,options:FinalExportOptions,conditioning:FloatConditioningOptions,control:{generation:number}):Promise<FloatProposal>;
 confirmFinalFloat(proposal:FloatProposal,confirmation:FloatConfirmation,control:{generation:number}):Promise<FinalArtifact>;
 releaseFinalFloat(proposal:FloatProposal):void;
 finalSceneGeometry(root:RootReader,options:SceneGeometryRequest,control:{generation:number}):Promise<{bytes:Uint8Array;metadata:SceneGeometryMetadata}>;
}
export interface RootModule {HEAPU8:Uint8Array;[exportName:string]:unknown}
export function encodeFinalFloatPrepare(options:FinalExportOptions,conditioning:FloatConditioningOptions):Uint8Array;
export function encodeFinalFloatConfirmation(confirmation:FloatConfirmation):Uint8Array;
export function encodeFinalSceneGeometry(options:SceneGeometryRequest,sourceGeneration:number):Uint8Array;
/** Same injected Module; caller has already reset its owned root generation. */
export function prepareFinalFloat(module:RootModule,snapshot:number,options:FinalExportOptions,conditioning:FloatConditioningOptions,generation:number):{id:number;metadata:FloatMetadata;buffers:{kind:number;byteOffset:number;byteLength:number}[]};
export function confirmFinalFloat(module:RootModule,proposal:number,confirmation:FloatConfirmation,generation:number):FinalArtifact;
export function finalSceneGeometry(module:RootModule,snapshot:number,sourceGeneration:number,options:SceneGeometryRequest,generation:number):{bytes:Uint8Array;metadata:SceneGeometryMetadata};
