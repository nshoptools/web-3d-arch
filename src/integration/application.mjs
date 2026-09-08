import {mountApp} from '../ui/index.tsx';
import {createAppController,createThreeViewportAdapter,createRasterEditingAdapter} from '../app/index.mjs';
import {ThreeViewport} from '../viewport/three-viewport.mjs';
import {createKernelAdapters} from './kernel-adapters.mjs';
import {createPNGEncoder} from '../core/png-client.mjs';
import {createBrowserDownload} from './download.mjs';
import {createApplicationSources} from './source-compositor.mjs';
import {createEngineTextRenderer} from '../core/engine-text-renderer.mjs';
import {applicationContext} from './application-context.mjs';
import {createProductApplicationServices} from './product-services.mjs';
import {scheduleApplicationPreparation} from './preparation-scheduler.mjs';
import './application.css';

/** Composition root. Deployment supplies checked source/product/printer adapters;
 * test adapters may be injected by a separate test entry, never URL switches. */
export function mountApplication({element,origin=location.origin,deviceId,moduleURL,
  engineWorkerURL,editingWorkerURL,pngWorkerURL,engineIntegrity,selectRecipe,sourceExtension,sourceLibrary,sourcePrepareAdoption,engineIdentity,
  exportExtension,printing,productProcessing,mirror,purge,storagePolicy,download,
  leasePolicy='signed-offline',navigate,fetchImpl}={}){
  if(!(element instanceof HTMLElement))throw new Error('APP_HOST_REQUIRED');
  const ownedHostClass=!element.classList.contains('arch-application-host');
  element.classList.add('arch-application-host');
  if(sourceLibrary&&sourceExtension)throw new Error('SOURCE_COMPOSITION_CONFLICT');
  if(productProcessing&&(!sourceLibrary||selectRecipe||sourceExtension||sourcePrepareAdoption||exportExtension||printing))throw new Error('PRODUCT_COMPOSITION_CONFLICT');
  let controller;
  const context=()=>applicationContext(controller);
  const textConfig=sourceLibrary?{...sourceLibrary,origin}:null;
  const kernel=createKernelAdapters({moduleURL,workerURL:engineWorkerURL,engineIntegrity,selectRecipe:productProcessing?()=>{throw new Error('PRODUCT_ENGINE_ROUTE_REQUIRED');}:selectRecipe,sourceExtension,exportExtension,identity:engineIdentity,
    textConfig,createTextRenderer:sourceLibrary?createEngineTextRenderer({catalog:sourceLibrary.catalog}):null});
  const sources=sourceLibrary&&!productProcessing?createApplicationSources({kernel,...sourceLibrary,origin,context,prepareAdoption:sourcePrepareAdoption}):null;
  const png=createPNGEncoder({workerURL:pngWorkerURL});
  const editing=createRasterEditingAdapter({workerURL:editingWorkerURL,encodePNG:png});
  const delivery=download??createBrowserDownload();
  const viewport=createThreeViewportAdapter({ThreeViewport,
    onSelection:blockId=>void controller?.dispatch({type:'selection.set',blockId}),
    onDiagnostic:diagnostic=>controller?.report(Object.assign(new Error(diagnostic.message??diagnostic.code),diagnostic)),
    onCapabilitiesChanged:()=>controller?.emit()});
  const productServices=productProcessing?createProductApplicationServices({...productProcessing,kernel,sourceLibrary,origin,context,viewport,encodePNG:png,
    settings:()=>controller?.session.user?{userId:controller.session.user.id,sessionKey:controller.epoch,settings:controller.remote.settings}:null,
    onChange:()=>controller?.emit()}):null;
  const adapters={engine:productServices?.engine??kernel.engine,source:productServices?.source??sources?.source??kernel.source,
    exporter:productServices?.exporter??kernel.exporter,viewport,editing,download:delivery,
    ...(productServices?{printing:productServices.printing,preparation:productServices.preparation,productTransactions:productServices.transactions,meshTransactions:productServices.meshTransactions}:printing?{printing}:{}),...(mirror?{mirror}:{}),...(purge?{purge}:{}),
    async reset(){
      const operations=[()=>editing.reset(),()=>png.reset(),async()=>{
        try{if(productServices)await productServices.reset();else await sources?.reset();}finally{await kernel.reset();}
      },()=>viewport.clearPrivateState(),()=>delivery.reset?.(),()=>printing?.reset?.(),()=>mirror?.reset?.()];
      const settled=await Promise.allSettled(operations.map(async action=>action()));
      if(settled.some(r=>r.status==='rejected'))throw new Error('PRIVATE_RESET_FAILED');
    }};
  controller=createAppController({origin,deviceId,adapters,storagePolicy,leasePolicy,
    ...(navigate?{navigate}:{}),...(fetchImpl?{fetchImpl}:{})});
  const unmount=mountApp(element,controller);
  const stopPreparation=productServices?scheduleApplicationPreparation(controller):()=>{};
  const onOffline=()=>controller.setOnline(false);
  const onOnline=()=>{controller.setOnline(true);void controller.initialize();};
  window.addEventListener('offline',onOffline);window.addEventListener('online',onOnline);
  const initialized=controller.initialize();
  let disposal=null;
  return {controller,initialized,dispose(){if(disposal)return disposal;
    window.removeEventListener('offline',onOffline);window.removeEventListener('online',onOnline);
    stopPreparation();unmount();disposal=controller.dispose();if(ownedHostClass)element.classList.remove('arch-application-host');return disposal;}};
}
