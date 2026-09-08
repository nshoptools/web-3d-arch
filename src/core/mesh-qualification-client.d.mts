import type {MeshFormat,MeshLimits,MeshReport} from './mesh-qualification.mjs';
export interface MeshQualificationClient {
 check(bytes:Uint8Array,options?:{format?:MeshFormat;limits?:Partial<MeshLimits>;signal?:AbortSignal}):Promise<MeshReport>;
 reset():Promise<void>;
}
export function createMeshQualificationClient(options?:{workerURL?:URL|string;WorkerClass?:typeof Worker;timeoutMs?:number}):MeshQualificationClient;
