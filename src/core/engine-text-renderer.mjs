import {attachMainThreadColorRenderer} from '../input/color-render-bridge.mjs';

/** Factory for the engine's optional private WebKit color endpoint. The engine
 * requests it only after a failed actual Worker canvas probe. Source identity
 * follows the captured active job and becomes invalid at cancellation/retirement. */
export function createEngineTextRenderer({catalog,onTiming}={}){
  if(!Array.isArray(catalog?.fonts))throw new Error('TEXT_RENDERER_CATALOG');
  const sources=structuredClone(catalog.fonts.filter(f=>['COLRv1','CBDT/CBLC'].includes(f.colorFormat)));
  return ({port,runtime,capabilities,isCurrent})=>{
    if(runtime?.engine!=='webkit'||capabilities?.canvas2d!==false)throw new Error('MAIN_RENDERER_FALLBACK_NOT_REQUIRED');
    return attachMainThreadColorRenderer(port,{...runtime,sources,isCurrent,onTiming});
  };
}
