// Test entry only. Real Opus UI/controller/backend/storage/Worker/renderer;
// explicitly bounded SVG extrusion recipe for the initial integration milestone.
import {mountApplication} from '../../src/integration/application.mjs';
import {effectiveValues,resolveFieldMm} from '../../src/domain/index.mjs';
import engineWorkerURL from '../../src/core/engine-worker.mjs?worker&url';
import editingWorkerURL from '../../src/editing/worker.mjs?worker&url';
import pngWorkerURL from '../../src/core/png-worker.mjs?worker&url';
const config=await(await fetch('/test-config.json',{cache:'no-store'})).json();
const deliveries=[];
const application=mountApplication({element:document.getElementById('app'),
  deviceId:config.deviceId,moduleURL:'/runtime/arch-kernel.mjs',engineIdentity:config.engineIdentity,engineWorkerURL,editingWorkerURL,pngWorkerURL,
  leasePolicy:'allow-authenticated-online',
  selectRecipe:({state,assets})=>{
    const source=state.content.app.source;
    if(source?.kind!=='svg'||source.raster)throw Object.assign(new Error('TEST_RECIPE_SCOPE'),{code:'TEST_RECIPE_SCOPE'});
    return {kind:'svg',source:new TextDecoder('utf-8',{fatal:true}).decode(assets.get(source.raw.hash)),
      longEdgeMm:effectiveValues(state).size,thicknessMm:resolveFieldMm(state,'baseH'),toleranceMm:.004};
  },
  download:{async save(result){deliveries.push({...result,bytes:new Uint8Array(result.bytes)});},reset(){deliveries.length=0;}}
});
const initialized=await application.initialized;
globalThis.applicationTest={application,controller:application.controller,initialized,deliveries};
