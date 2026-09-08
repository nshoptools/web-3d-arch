import {mountApplication} from './application.mjs';
import {loadReleaseBootstrap,deviceIdentity,createPrintingRuntimeEvidence} from './release-bootstrap.mjs';
import {createFinalSceneEvidence} from './final-scene-evidence.mjs';
import {createSourceSVGExport} from './source-svg-export.mjs';
import engineWorkerURL from '../core/engine-worker.mjs?worker&url';
import editingWorkerURL from '../editing/worker.mjs?worker&url';
import pngWorkerURL from '../core/png-worker.mjs?worker&url';
import qualificationWorkerURL from '../core/mesh-qualification-worker.mjs?worker&url';

/** Sole production composition. No mock recipe, injected pass provider, test
 * configuration endpoint or URL-selected implementation is part of this entry. */
export async function bootProductApplication({element,entryURL,signal}={}){
 if(!(element instanceof HTMLElement))throw new Error('APP_HOST_REQUIRED');
 const bootstrap=await loadReleaseBootstrap({entryURL,signal});if(signal?.aborted)throw new Error('CANCELLED');
 const application=mountApplication({element,deviceId:deviceIdentity(),moduleURL:bootstrap.moduleURL,engineIdentity:bootstrap.engineIdentity,engineIntegrity:bootstrap.engineIntegrity,
  engineWorkerURL,editingWorkerURL,pngWorkerURL,sourceLibrary:bootstrap.sourceLibrary,
  leasePolicy:'allow-authenticated-online',productProcessing:{createFinalSceneEvidence,createSourceSVGExport,qualificationWorkerURL,runtimeEvidence:createPrintingRuntimeEvidence(bootstrap)}});
 return application;
}
