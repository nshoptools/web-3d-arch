import { fail } from '../core.mjs';
import { XaiImageAdapter } from './xai-image.mjs';
// Explicit operational opt-in; keys are ALWAYS supplied by each vault credential.
export function productionAdapters(selection='') {
  if(selection==='')return [];
  fail(selection==='xai-imagine',500,'AI_ADAPTER_SELECTION_INVALID');
  return [new XaiImageAdapter()];
}

