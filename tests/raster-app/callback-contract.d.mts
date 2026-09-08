import type {RasterSourceAdapter,AppControl,SourceContext,RasterApprovalReceipt} from '../../src/integration/raster-adapters.mjs';
import type {RasterPacket} from '../../src/core/raster-operations.mjs';
import type {ModelLease} from '../../src/app/adapters.mjs';
/** Additive callback contract proposed for the production declaration. Runtime
 * source remains parent owned; this type does not cast a source packet to a model. */
export type RecipeControl=AppControl & {state:unknown;sourceContext?:SourceContext;assets:ReadonlyMap<string,Uint8Array>};
export interface SourceGeometry {
 status:'ready';kind:'raster-source-geometry';sourceAssemblyRequired:true;
 coordinateKind:28;unitMm:number;packet:RasterPacket;receipt:RasterApprovalReceipt;preparation:unknown;
}
export type SourceProposal={status:'proposal';sourceProposal:unknown};
export type StandaloneRecipe=SourceGeometry|SourceProposal;
export type ProductModelLease=Omit<ModelLease,'release'> & {release():void|Promise<void>};
export type ConsumerInput=SourceGeometry & {readonly nativeSource:{readonly kind:'raster-token';readonly token:string;readonly epoch?:number}};
export interface CallbackSourceAdapter extends Omit<RasterSourceAdapter,'prepareRecipe'> {
 prepareRecipe(input:RecipeControl):Promise<StandaloneRecipe>;
 prepareRecipe<T extends ProductModelLease>(input:RecipeControl,consume:(source:ConsumerInput)=>T|Promise<T>):Promise<T|SourceProposal>;
}