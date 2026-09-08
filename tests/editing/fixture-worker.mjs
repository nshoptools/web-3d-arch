import {runSuite} from './suite.mjs';
self.onmessage = async () => {
  self.postMessage({type:'started',worker:typeof document==='undefined',isolated:crossOriginIsolated});
  const records=await runSuite();self.postMessage({type:'complete',records});
};
