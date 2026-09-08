import {resolve} from 'node:path';
import {checked,pin,parse,readPlain,need,exact,canonical,portable,environment,filePin,hash,put,jsonBytes} from './core.mjs';
const BUILD_INPUTS=['tools/kernel/build.ps1','tools/kernel/module-incoming-api.json','src/kernel/native/product-exports.json'];
const TOOLCHAIN_INPUTS=['.toolchain/emsdk/upstream/emscripten/src/settings.js','.toolchain/emsdk/upstream/emscripten/src/preamble.js'];
/** Admission for this pinned generated-wrapper shape, never execution attestation. */
export function inspectIncomingBinding(incoming,script,wrapper){
 need(Array.isArray(incoming)&&incoming.length>0&&incoming.length<=128&&incoming.every(v=>typeof v==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(v))&&new Set(incoming).size===incoming.length,'ENGINE_INCOMING_API');
 for(const key of ['wasmBinary','locateFile','print','printErr'])need(incoming.includes(key),'ENGINE_INCOMING_API');
 need(typeof script==='string'&&script.includes('module-incoming-api.json')&&script.includes('"-sINCOMING_MODULE_JS_API=$kernelIncomingApi"'),'ENGINE_BUILD_FLAG');
 need(typeof wrapper==='string'&&/\bwasmBinary\s*=\s*Module\[(["'])wasmBinary\1\]/.test(wrapper),'ENGINE_WASM_INPUT_BINDING');
 return {incomingModuleApi:[...incoming],generatedAssignmentObserved:true,actualWorkerIntegrity:'requires-separate-execution-evidence'};
}
export function validateEngineBuild(engine,sourceRoot){
 need(/(?:^|[\\/])[^\\/]*receipt\.json$/i.test(engine.buildReceipt?.file??''),'ENGINE_BUILD_RECEIPT_PATH');
 const bytes=checked(engine.buildReceipt,262144),receipt=parse(bytes);
 exact(receipt,['version','createdAt','mode','printing','testFixtures','command','exitCode','toolchainSources','buildInputs','incomingModuleApi','observations','outputs','logs']);
 need(receipt.version==='arch-kernel-build-receipt/1'&&receipt.mode==='production'&&receipt.printing===true&&receipt.testFixtures===false&&receipt.exitCode===0,'ENGINE_BUILD_RECEIPT');
 need(typeof receipt.createdAt==='string'&&Number.isFinite(Date.parse(receipt.createdAt)),'ENGINE_BUILD_RECEIPT');
 exact(receipt.command,['script','arguments']);exact(receipt.command.arguments,['Target','Printing','EvidenceTag','ModuleDirectory']);
 const args=receipt.command.arguments;
 need(receipt.command.script==='tools/kernel/build.ps1'&&args.Target==='wasm'&&args.Printing===true&&[args.EvidenceTag,args.ModuleDirectory].every(v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$/.test(v)),'ENGINE_BUILD_COMMAND');
 exact(receipt.outputs,['module','wasm']);
 const outputPath=receipt.outputs.module?.path;
 need(typeof outputPath==='string','ENGINE_BUILD_OUTPUT');
 const parts=/^(tmp\/reviews\/(?:codex|opus|grok)\/runs\/[A-Za-z0-9][A-Za-z0-9_-]{0,79})\/work\/([A-Za-z0-9][A-Za-z0-9_-]{0,59})\/arch-kernel\.mjs$/.exec(outputPath);
 need(parts&&parts[2]===args.ModuleDirectory,'ENGINE_BUILD_OUTPUT');
 need(receipt.outputs.wasm?.path===parts[1]+'/work/'+parts[2]+'/arch-kernel.wasm','ENGINE_BUILD_OUTPUT');
 const rows=[];
 function add(row,base,role,max=1048576){
  exact(row,['path','bytes','sha256']);if(role!=='toolchain')portable(row.path);else need(TOOLCHAIN_INPUTS.includes(row.path),'ENGINE_BUILD_INPUTS');
  const ref={file:resolve(base,row.path),bytes:row.bytes,sha256:row.sha256};
  checked(ref,max);rows.push({...ref,role,path:row.path});return ref;
 }
 for(const kind of ['module','wasm']){
  const r=receipt.outputs[kind];need(r.sha256===engine[kind].sha256&&r.bytes===engine[kind].bytes,'ENGINE_BUILD_OUTPUT');
  add(r,environment().root,'output',64*1024*1024);
 }
 for(const [key,names,base,role] of [['buildInputs',BUILD_INPUTS,sourceRoot,'build'],['toolchainSources',TOOLCHAIN_INPUTS,environment().root,'toolchain']]){
  need(Array.isArray(receipt[key])&&canonical(receipt[key].map(r=>r.path).sort())===canonical([...names].sort()),'ENGINE_BUILD_INPUTS');
  for(const row of receipt[key])add(row,base,role);
 }
 const wanted=['configure','build','rust','module-link'].map(k=>parts[1]+'/evidence/'+args.EvidenceTag+'-wasm-'+k+'.log');
 need(Array.isArray(receipt.logs)&&canonical(receipt.logs.map(r=>r.path).sort())===canonical(wanted.sort()),'ENGINE_BUILD_LOGS');
 for(const row of receipt.logs)add(row,environment().root,'log');
 exact(receipt.observations,['generatedReadsWasmBinary','wasmUnchangedFromSourceR1','actualWorkersIntegrity','scope']);
 need(receipt.observations.generatedReadsWasmBinary===true&&typeof receipt.observations.wasmUnchangedFromSourceR1==='boolean'&&
  typeof receipt.observations.actualWorkersIntegrity==='string'&&receipt.observations.actualWorkersIntegrity.length<=128&&
  typeof receipt.observations.scope==='string'&&receipt.observations.scope.length<=1024,'ENGINE_BUILD_OBSERVATIONS');
 const incoming=parse(readPlain(resolve(sourceRoot,BUILD_INPUTS[1]),65536));
 need(canonical(receipt.incomingModuleApi)===canonical(incoming),'ENGINE_INCOMING_API');
 const binding=inspectIncomingBinding(incoming,readPlain(resolve(sourceRoot,BUILD_INPUTS[0]),1048576).toString('utf8'),checked(engine.module,16*1024*1024).toString('utf8'));
 return {version:'arch-application-engine-build/1',receipt:filePin(engine.buildReceipt),receiptVersion:receipt.version,command:receipt.command,exitCode:0,
  sourceWrapperSHA256:engine.module.sha256,wasmSHA256:engine.wasm.sha256,...binding,files:rows};
}
export function captureEngineBuild(engine,sourceRoot,out){
 const contract=validateEngineBuild(engine,sourceRoot);
 put(resolve(out,'inputs/engine-build/receipt.json'),checked(contract.receipt,262144));
 // This bounded private provenance is retained with prepared.json, never public.
 for(let i=0;i<contract.files.length;i++){const row=contract.files[i];if(row.role==='output')continue;
  put(resolve(out,'inputs/engine-build',String(i).padStart(2,'0')+'.bin'),checked(filePin(row),1048576));}
 put(resolve(out,'engine-build-contract.json'),jsonBytes(contract));return contract;
}
