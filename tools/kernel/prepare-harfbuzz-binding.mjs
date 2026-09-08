import {readFile,writeFile,realpath,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=await realpath(fileURLToPath(new URL('../../',import.meta.url)));
if(!process.env.PROJECT_REVIEW_RUN||path.resolve(process.env.PROJECT_ROOT??'')!==root)throw new Error('Prepare the project environment first.');
const source=await readFile(path.join(root,'src/assets/harfbuzz/dist/index.mjs'),'utf8');
const sourceHash=createHash('sha256').update(source).digest('hex');
if(sourceHash!=='04ece1914c8720ad96257728119c1bf24088ee4ef3ab2a2ca688c9a4895d4e7e')throw new Error('Validated harfbuzzjs wrapper changed; review the derivation before updating.');
const replaceOnce=(text,old,replacement)=>{if(text.split(old).length!==2)throw new Error('Unexpected wrapper structure');return text.replace(old,replacement);};
let derived=replaceOnce(source,'import createHarfBuzz from "./harfbuzz.js";','// Generated from the original harfbuzzjs 1.6.1 wrapper. Do not edit by hand.\n// Generator: tools/kernel/prepare-harfbuzz-binding.mjs\n// Original bytes/license: src/assets/harfbuzz; only loader and SAB decoding differ.');
derived=replaceOnce(derived,'utf8Decoder.decode(Module.HEAPU8.subarray(ptr, end))','utf8Decoder.decode(new Uint8Array(Module.HEAPU8.subarray(ptr, end)))');
derived=replaceOnce(derived,'init(await createHarfBuzz());',`/** Bind once to the same Emscripten instance that owns geometry and its heap. */
export function initializeHarfBuzz(engine) {
  if (Module) throw new Error('HARFBUZZ_ALREADY_INITIALIZED');
  if (engine._arch_abi_version?.() !== 2) throw new Error('CORE_ABI_MISMATCH');
  const native = Object.create(null);
  for (const [name, value] of Object.entries(engine)) {
    if (name.startsWith('_hb_') || name === '_malloc' || name === '_free') native[name.slice(1)] = value;
  }
  if (typeof native.hb_shape !== 'function' || typeof native.hb_paint_funcs_create !== 'function') throw new Error('HARFBUZZ_EXPORTS_MISSING');
  // Proxy heap properties dynamically: memory.grow replaces the typed views.
  init(new Proxy(engine, {get(target, key) {return key === 'wasmExports' ? native : Reflect.get(target, key);}}));
}
`);
const output=path.join(root,'src/input/harfbuzz-engine.mjs');
await writeFile(output,derived);
const provenance={schemaVersion:1,source:'src/assets/harfbuzz/dist/index.mjs',sourceSha256:sourceHash,nativeRevision:'36cb489cb02ce4b92099669ba9f9bea348eff93f',output:'src/input/harfbuzz-engine.mjs',outputSha256:createHash('sha256').update(derived).digest('hex'),changes:['explicit initializeHarfBuzz(engine), one module/heap','dynamic Module view proxy maps published HB functions','copy bounded UTF-8 result before browser TextDecoder; does not copy mesh'],license:'src/assets/harfbuzz/LICENSE'};
await mkdir(path.join(root,'docs/development'),{recursive:true});
await writeFile(path.join(root,'docs/development/harfbuzz-binding.json'),JSON.stringify(provenance,null,2)+'\n');
console.log(JSON.stringify(provenance));
