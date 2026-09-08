import type {Control} from '../app/adapters.mjs';
import type {ApplicationContext,SourceSnapshotProvider,SourceDescriptor,Unavailable} from './export-adapters.mjs';
import type {SourceContextKernel} from './product-source-contexts.mjs';
import type {RasterSourceAdapter} from './raster-adapters.mjs';
export const SOURCE_SVG_VERSION:'arch-source-svg-export/1';
export const SOURCE_SVG_LIMITS:Readonly<{dependencies:256;dependencyBytes:number;sourceBytes:1048576;outputBytes:number;jsonBytes:number;nodes:100000;depth:24;regions:256;points:200000;leases:4}>;
export interface SourceSVGContext extends ApplicationContext {assetsMap:ReadonlyMap<string,Uint8Array>}
export interface SourceSVGServices {
 text:{prepareSource(control:Control):Promise<unknown>;prepareText(control:Control):Promise<unknown>};
 raster:Pick<RasterSourceAdapter,'prepareRecipe'>;
}
export type SourceSVGKernel=SourceContextKernel;
export interface SourceSVGProvider extends SourceSnapshotProvider {
 readonly version:typeof SOURCE_SVG_VERSION;
 refresh(input:{control:Control}):Promise<{version:'arch-app-adapters/1';ticket:Control['ticket'];descriptor:SourceDescriptor}>;
 describe(context:ApplicationContext):SourceDescriptor|Unavailable;
 reset():void;dispose():void;
}
export class SourceSVGError extends Error {readonly code:string;constructor(code:string)}
export function createSourceSVGExport(bindings:{context():SourceSVGContext|null;kernel:SourceSVGKernel;sources:SourceSVGServices}):SourceSVGProvider;
