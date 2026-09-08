// Run from project root after dot-sourcing this run's environment.
import {readFile,writeFile,mkdir,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {fixtureData} from './fixture-data.mjs';
import {runSharedSuite} from './shared-suite.mjs';
import {testEnvironment,testModule} from './test-environment.mjs';
const {root,run}=await testEnvironment();
export async function guardedOutput(relative){
  const output=path.resolve(run,relative);if(!output.startsWith(run+path.sep))throw Error('Escaped output');
  for(let p=output;p!==run;p=path.dirname(p)){try{if((await lstat(p)).isSymbolicLink())throw Error('Reparse output');}catch(e){if(e.code!=='ENOENT')throw e;}}
  await mkdir(path.dirname(output),{recursive:true});return output;
}
const hb=await import(pathToFileURL(path.join(root,'src/input/harfbuzz-engine.mjs')));
const core=await import(pathToFileURL(path.join(root,'src/input/font-source-core.mjs')));
const referenceModule=await import(pathToFileURL(path.join(root,'src/input/font-source.mjs')));
const modulePath=await testModule(root);
const engine=await(await import(pathToFileURL(modulePath))).default();hb.initializeHarfBuzz(engine);
const data=await fixtureData(root),refs=new Map(),referenceCases={};
async function reference(key,text,options,kind){
  if(!refs.has(key))refs.set(key,await referenceModule.createFontSource(await data.readBytes(data.entries[key]),data.entries[key]));
  const source=refs.get(key),shape=source.shapeRun(text,options);
  const value=kind==='paint'?source.colorPaint(shape.glyphs[0].glyphId):kind==='bitmap'?source.bitmap(shape.glyphs[0].glyphId):shape;
  referenceCases[JSON.stringify([key,text,options,kind??null])]=value;return value;
}
let generation=1;
async function buildSvg(bytes){
  const g=generation++;if(engine._arch_control_reset(g)!==1)throw Error('Control reset failed');
  const handle=engine._arch_input_create(bytes.length);if(!handle)throw Error('Input allocation failed');
  engine.HEAPU8.set(bytes,engine._arch_input_ptr(handle));
  const result=engine._arch_build_svg(handle,2,0,.004,g);
  if(!result)throw Error(new TextDecoder().decode(engine.HEAPU8.subarray(engine._arch_error_ptr(),engine._arch_error_ptr()+engine._arch_error_len())));
  try{
    return {bytes:engine._arch_snapshot_len(result),metadata:JSON.parse(new TextDecoder().decode(engine.HEAPU8.subarray(engine._arch_metadata_ptr(result),engine._arch_metadata_ptr(result)+engine._arch_metadata_len(result))))};
  }finally{engine._arch_snapshot_release(result);}
}
const results=await runSharedSuite(data,{createFontSource:(bytes,entry)=>core.createFontSourceWithHarfBuzz(bytes,entry,hb),reference,buildSvg,onResult:r=>console.log((r.ok?'ok ':'not ok ')+r.name+(r.ok?'':'\n'+r.error))});
const replacer=(_k,v)=>v instanceof Uint8Array?{__bytes:Array.from(v)}:v;
await writeFile(await guardedOutput('evidence/reference-cases.json'),JSON.stringify(referenceCases,replacer));
await writeFile(await guardedOutput('evidence/node-results.json'),JSON.stringify({node:process.version,abi:engine._arch_abi_version(),harfbuzz:hb.versionString(),passed:results.filter(r=>r.ok).length,total:results.length,results},null,2));
console.log(JSON.stringify({passed:results.filter(r=>r.ok).length,total:results.length}));
if(results.some(r=>!r.ok))process.exitCode=1;
