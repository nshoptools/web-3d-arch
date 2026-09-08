/** Additive package types. Main app/Worker/client/root ABI are parent-owned. */
export type Json=null|string|number|boolean|Json[]|{[key:string]:Json};
export interface Ticket {id:string;userId:string;projectId:string;revision:number;generation:number}
export interface Control {version:'arch-app-adapters/1';ticket:Ticket;signal:AbortSignal;onProgress(p:{stage:string;progress:number|null}):void}
export interface Context {userId:string;projectId:string;revision:number;generation:number;headHash:string;moduleSessionId:string}
export type Unit='millimeter'|'centimeter'|'inch'|'foot'|'meter'|'micron';
export interface MeshSelection {
 version:'arch-mesh-csg-selection/1';unit:Unit;
 /** Columns x/y/z then translation, in mm AFTER explicit source-unit conversion. */
 transform:{version:'arch-affine-mm/1';matrix:[number,number,number,number,number,number,number,number,number,number,number,number]};
 materials:{id:string;nativeId:string;name:string;rgba:number;slot:number}[];
 /** STL: exactly one entry per parsed part. */
 partMaterialIds?:string[];
 /** OBJ: exactly one entry per original usemtl name (null = unassigned in file). */
 sourceMaterialAssignments?:{sourceName:string|null;materialId:string}[];
 operation:'union'|'difference'|'intersection';targets:string[];
 materialPolicy:'requireDisjointMaterials'|'keepSelectedTargetMaterial';
 /** Exact unsigned nonzero uint64 decimal strings, issued by parent identity ledger. */
 featureId:string;sourceId:string;provenanceId:string;
 conditioning:'none';toleranceCeilingMm:number;
 limits:{vertices:number;triangles:number;parts:number;work:number};
}
declare const opaque:unique symbol;
export interface MeshToken {readonly [opaque]:true}
export interface MeshProposal {
 version:'arch-app-adapters/1';ticket:Ticket;status:'prepared-proposal';stage:'mesh-input'|'mesh-csg';
 proposalHash:string;proof:Readonly<Record<string,Json>>;changes:string[];
 requiresFinalGates:true;exportable:false;committed:false;
 verify(control:Control):Promise<string>;
 /** Transfers ownership; old proposal.release then becomes a no-op. No root commit. */
 confirm(control:Control,approval:{confirmed:true;proposalHash:string}):Promise<MeshToken>;
 release():void;
}
export interface MeshDescriptor {
 id:string;name:string;kind:'mesh';revision:number;raw:{hash:string;byteLength:number};
 mediaType:string;assetHashes:string[];metadata:Record<string,Json>;applied:false;
}
export interface GeneratedOperand {
 /** Identity of the existing Worker-local Module; never serialized through UI. */
 module:unknown;
 /** Already owns one primary or explicitly acquired lease; adapter never reacquires. */
 snapshotId:number;
 bindings:{semanticId:string;sourceId:string;provenanceId:string;sourceIndex:number;materialIndex:number}[];
 materials:{materialId:string;rgba:number;slot:number}[];
 generatedSource:Record<string,Json>;
 release():void;
}
export interface MeshAdapter {
 version:'arch-imported-mesh-adapter/1';
 source:{version:'arch-app-adapters/1';capabilities:{id:string;available:boolean}[];
  ingest(input:Control&{state:{revision:number};purpose:'mesh';sourceContext:{version:'arch-source-context/1';operation:'import';id:string;revision:number;predecessor:Json};
   file:{name:string;mediaType:string;bytes:Uint8Array}}):Promise<{version:'arch-app-adapters/1';ticket:Ticket;kind:'mesh';metadata:Record<string,Json>}>};
 capabilities:{id:string;available:boolean;reason?:string}[];
 prepareApply(input:Control&({state:{revision:number;content:{app:{mesh:MeshDescriptor}}};mesh:MeshDescriptor;assets:ReadonlyMap<string,Uint8Array>;selection:MeshSelection}|{approvedInput:MeshToken})):Promise<MeshProposal>;
 /** One job/generation handoff after the first proposal job has finished; stable head/module required. */
 rebindApprovedInput(token:MeshToken,newControl:Control):MeshToken;
 /** Trusted synchronous stage callback only. No publication, async, reentry or retained raw pointers. */
 withNativeCandidate<T>(token:MeshToken,control:Control,fn:(borrow:{module:unknown;handle:number;requiresFinalGates:true;exportable:false;committed:false;proof:unknown;approvals:unknown})=>T):T;
 copyCandidate(token:MeshToken,control:Control):{mesh:{vertices:Float64Array;triangles:Uint32Array;parts:Uint8Array;faceOrigins:Uint32Array;partStride:40;unit:'millimeter'};
  original:Uint8Array;objSourceFaceMap:Uint32Array;confirmation:Uint8Array;proof:unknown;approvals:unknown;requiresFinalGates:true;exportable:false;committed:false};
 release(token:MeshToken):void;reset():void;clearPrivateState():void;dispose():void;
}
export declare const MESH_ADAPTER_VERSION:'arch-imported-mesh-adapter/1';
export declare function createImportedMeshAdapter(options:{importer:unknown;csg:unknown;context:()=>Context;acquireGenerated?:(input:Control&Record<string,unknown>)=>Promise<GeneratedOperand>}):MeshAdapter;
