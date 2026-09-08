export const MESH_QUALIFIER_VERSION:'arch-mesh-qualification/1';
export interface MeshLimits {bytes:number;vertices:number;triangles:number;parts:number;candidatePairs:number;containmentWork:number}
export const DEFAULT_MESH_LIMITS:Readonly<MeshLimits>;
export type MeshFormat='ARCH/1'|'STL/binary';
export interface MeshReport {
 version:typeof MESH_QUALIFIER_VERSION;verdict:'pass'|'fail'|'unverified';code:string;format:MeshFormat;
 checks:Record<string,'pass'|'not-applicable'|'requires-union-readback'>;
 stats:{candidatePairs:number;exactPairs:number;containmentWork:number;sharedFacePairs:number;boundaryContacts:number;milliseconds:number;vertices?:number;triangles?:number;parts?:number;bytes?:number;components?:number};
 diagnostics:{stage:string;code:string;details:Record<string,unknown>}[];
 scope:{coordinates:'exact-represented-bytes';repair:false;epsilonWelding:false;globalPipelineError:'unverified';physicalFit:'unqualified';thinFeatures:'unverified';designIntent:'unverified';slicer:'unverified'};
}
export function qualifyMesh(bytes:Uint8Array,options?:{format?:MeshFormat;limits?:Partial<MeshLimits>;signal?:AbortSignal}):MeshReport;
export function readQualificationSTL(bytes:Uint8Array):{vertices:number[][];faces:number[][];parts:{vertexStart:number;vertexCount:number;faceStart:number;faceCount:number}[]};
