import type {RasterSourceAdapter} from '../../src/integration/raster-adapters.mjs';
import type {RecipeControl,ProductModelLease,SourceProposal,StandaloneRecipe} from './callback-contract.mjs';
declare const current:RasterSourceAdapter,source:RasterSourceAdapter,c:RecipeControl,model:ProductModelLease;
const standalone:Promise<StandaloneRecipe>=current.prepareRecipe(c);
const result:Promise<ProductModelLease|SourceProposal>=source.prepareRecipe(c,async ready=>{
 const coordinateKind:28=ready.coordinateKind;
 const token:string=ready.nativeSource.token;
 // @ts-expect-error Native heap handles are not exposed by the transport token.
 const forbidden=ready.nativeSource.acceptedHandle;
 void coordinateKind;void token;void forbidden;
 return model;
});
declare const incomplete:Omit<ProductModelLease,'release'>;
// @ts-expect-error Product consumers must return a releasable ModelLease.
source.prepareRecipe(c,()=>incomplete);
// @ts-expect-error Copied geometry bytes alone do not own a finished model lease.
source.prepareRecipe(c,ready=>ready.packet);
void standalone;void result;
