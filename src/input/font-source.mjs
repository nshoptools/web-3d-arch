/** Public validated input adapter; the core also accepts the unified engine's HarfBuzz namespace. */
import * as hb from '../assets/harfbuzz/dist/index.mjs';
import {createFontSourceWithHarfBuzz} from './font-source-core.mjs';
export {createEmojiLookup} from './font-source-core.mjs';
export function createFontSource(inputBytes, catalogEntry) {
  return createFontSourceWithHarfBuzz(inputBytes, catalogEntry, hb);
}
