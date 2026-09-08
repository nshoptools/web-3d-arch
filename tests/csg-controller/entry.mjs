// Separate test entry calls the ACTUAL production composition, including UI.
// No selectRecipe, generatedBase, qualification, store or download override.
import {bootProductApplication} from '../../src/integration/product-entry.mjs';
import {observeApplication} from './observer.mjs';
const abort=new AbortController();let application;
window.addEventListener('pagehide',()=>{abort.abort();void application?.dispose();},{once:true});
try{
 application=await bootProductApplication({element:document.getElementById('app'),entryURL:import.meta.url,signal:abort.signal});
 globalThis.csgAcceptance=observeApplication(application);
 await application.initialized;
}catch(error){
 globalThis.csgAcceptanceBootError={code:String(error.code??error.message??'BOOT_FAILED').slice(0,100),stack:String(error.stack??'').slice(0,16000)};
 throw error;
}

