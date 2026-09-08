import {createSourceCatalog,requireValue,checkControl} from './source-catalog.mjs';
import {createTextAdapters} from './text-adapters.mjs';
import {createRasterAdapters} from './raster-adapters.mjs';
import {createSVGSourceAdapter} from './svg-adapters.mjs';
import {createSourceRasterRuntime} from './source-runtime.mjs';
import {confirmedRender} from './confirmed-render.mjs';

/** A proposed manufacturing simplification, never implicit acceptance. Alpha
 * below 128 is removed; remaining pixels become opaque. The native proposal
 * records the cutoff and measured changes and retains pre-processing RGBA. */
export const APPLICATION_RASTER_POLICY=Object.freeze({version:'arch-app-raster-policy/1',alpha:Object.freeze({policy:'threshold',cutoff:128})});

/** Source composition for the production controller. Every native operation uses
 * kernel.operation; SVG/text remain original curves until conversion is accepted. */
export function createApplicationSources({kernel,catalog,assetURLs,origin,context,prepareAdoption,processingPolicy,encodePNG}={}){
  requireValue(typeof context==='function'&&typeof kernel?.operation==='function','SOURCE_COMPOSITION');
  const library=createSourceCatalog({catalog,assetURLs,origin}),runtime=createSourceRasterRuntime(kernel);
  const text=createTextAdapters({catalog:library,context,
    invoke(request,c){checkControl(c);return kernel.operation(c,(client,generation)=>client.textOperation(request,{generation}));}});
  const svg=createSVGSourceAdapter({kernel,context});
  const raster=createRasterAdapters({runtime,renderSource:confirmedRender,
    processingPolicy:processingPolicy??(()=>({alpha:APPLICATION_RASTER_POLICY.alpha})),...(encodePNG?{encodePNG}:{})});
  const source=Object.freeze({version:'arch-app-adapters/1',capabilities:[...svg.capabilities,...text.capabilities,...raster.source.capabilities],
    ingest(c){
      if(c.purpose==='font'||c.purpose==='source'&&(c.file?.mediaType==='text/plain'||/\.txt$/i.test(c.file?.name??'')))return text.ingest(c);
      requireValue(c.purpose==='source','SOURCE_FORMAT_UNSUPPORTED');
      if(c.file?.mediaType==='image/svg+xml'||/\.svg$/i.test(c.file?.name??''))return svg.ingest(c);
      return raster.source.ingest(c);
    },
    convert(c){
      if(c.source?.raster||c.source?.kind==='raster')return raster.source.convert(c);
      if(c.source?.kind==='svg')return svg.convert(c);
      return text.convert(c);
    },
    acceptProposal(c){
      if(c.confirmation?.kind==='raster')return raster.source.acceptProposal(c);
      if(c.confirmation?.kind==='svg')return svg.acceptProposal(c);
      requireValue(['text','emoji'].includes(c.confirmation?.kind),'SOURCE_CONFIRMATION_KIND');return text.acceptProposal(c);
    },
    queryFonts:(...args)=>text.queryFonts(...args),queryEmoji:(...args)=>text.queryEmoji(...args),selectEmoji:c=>text.selectEmoji(c),
    ...(prepareAdoption?{prepareAdoption}:{}),
    async reset(){svg.reset();text.reset();await raster.reset();}
  });
  return Object.freeze({source,text,raster:raster.source,runtime,reset:()=>source.reset()});
}
