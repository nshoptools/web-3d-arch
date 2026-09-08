import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {profiles,sha256} from './fixtures.mjs';
import {nativeService} from './native-service.mjs';
import {bindRuntime,BAMBU,U1} from './runtime-fixture.mjs';
import {inspect3MF} from '../../src/printing/src/zip-inspect.mjs';
const run=process.env.PROJECT_REVIEW_RUN,base=fileURLToPath(new URL('../../',import.meta.url));
const moduleFile=process.env.PRINTING_MODULE,manifest=JSON.parse(await readFile(resolve(run,'inputs/runtime-test-module.json'),'utf8'));
assert.ok(moduleFile,'explicit PRINTING_MODULE');const moduleBytes=await readFile(moduleFile),wasmBytes=await readFile(moduleFile.replace(/\.mjs$/,'.wasm'));
assert.equal(await sha256(moduleBytes),manifest.moduleSha256);assert.equal(await sha256(wasmBytes),manifest.wasmSha256);
const factory=(await import(pathToFileURL(moduleFile))).default;let factoryCalls=0;factoryCalls++;
const M=await factory({wasmBinary:wasmBytes,print(){},printErr(){}}),T=nativeService(M),P=await profiles(base);
const proof={runtimeABI:M._arch_abi_version(),printingABI:M._arch3mf_abi_version(),kernelPrintingABI:M._arch3mf_kernel_abi_version(),...manifest,evidenceId:'actual-current-module-getters-and-printing-test'};
const output=resolve(run,'evidence/runtime-'+(process.env.PRINTING_EVIDENCE_LABEL??'node'));await mkdir(output,{recursive:true});
after(()=>{assert.equal(T.live.size,0);assert.equal(factoryCalls,1);});
for(const [name,adapterId,profile]of [['bambu',BAMBU,P.bambu],['u1',U1,P.u1]])test('real same-module '+name+' project output through Ohm with preserved source/primary lease',async()=>{
 const e=await bindRuntime({client:T.client,operation:T.operation,root:T.build(),profile,proof});
 try{
  const before=await sha256(new Uint8Array(e.root.bytes())),r=await e.adapter.refresh();assert.equal(r.selection.status,'ready',JSON.stringify(r.selection));
  const id=name==='bambu'?'3mf-bambu-project':'3mf-snapmaker-project',count=T.counters.printing;
  const result=await e.exporter.export(e.input(id));assert.equal(T.counters.printing,count+1);assert.equal(result.ticket.generation,901);
  const d=await inspect3MF(result.bytes,{adapterId});assert.equal(d.meshes.length,2);assert.equal(d.manifest.profileHash,profile.sha256);
  assert.equal(Number(d.settings.initial_layer_print_height),.25);assert.equal(Number(d.settings.layer_height),.2);
  assert.equal(d.manifest.materialAliases['material:đỏ'],0);assert.equal(d.manifest.materialAliases['material:xanh'],1);
  assert.equal(await sha256(new Uint8Array(e.root.bytes())),before);assert.ok(M._arch_snapshot_ptr(e.root.id)>0);
  assert.equal(r.printers[0].qualified,false);assert.equal(result.metadata.qualification.slicer,'unverified');
  await writeFile(resolve(output,name+'.3mf'),result.bytes);await writeFile(resolve(output,name+'.json'),JSON.stringify({metadata:result.metadata,provider:r.selection.provenance,sharedModuleInstances:factoryCalls},null,2));
 }finally{e.close();}
});
test('unqualified normal target stays blocked while neutral STL uses the same module independently',async()=>{
 const e=await bindRuntime({client:T.client,operation:T.operation,root:T.build(),profile:P.bambu,proof});
 try{await e.adapter.refresh();e.current.exportOptions['3mf-bambu-project'].inspection=false;
  assert.equal(e.exporter.formats(e.input('3mf-bambu-project')).find(f=>f.id==='3mf-bambu-project').reasonCode,'MESH_INSPECTION_REQUIRED');
  e.auth.settings.values.printerProfiles=[];e.auth.settings.revision++;await e.adapter.list();
  const formats=e.exporter.formats(e.input('stl-union'));assert.equal(formats.find(f=>f.id==='stl-union').enabled,true);
  const out=await e.exporter.export(e.input('stl-union'));assert.equal(out.mimeType,'model/stl');assert.ok(out.bytes.length>84);
  await writeFile(resolve(output,'neutral.stl'),out.bytes);
 }finally{e.close();}
});
test('profile change after real serialization drops late bytes; no resubmit and primary remains owned',async()=>{
 const e=await bindRuntime({client:T.client,operation:T.operation,root:T.build(),profile:P.bambu,proof});
 try{await e.adapter.refresh();const before=await sha256(new Uint8Array(e.root.bytes())),count=T.counters.printing;let received=0;
  T.hooks.afterPrinting=out=>{received=out.bytes.length;e.auth.settings.revision++;};
  await assert.rejects(e.exporter.export(e.input('3mf-bambu-project')),{code:'PRINTING_REFRESH_REQUIRED'});
  assert.ok(received>0);assert.equal(T.counters.printing,count+1);assert.equal(await sha256(new Uint8Array(e.root.bytes())),before);
 }finally{T.hooks.afterPrinting=null;e.close();}
});
test('account/reset/cancel during received native output rejects artifact without releasing primary',async()=>{
 for(const change of [e=>{e.auth=null;e.current=null;},e=>e.adapter.reset(),(e,abort)=>abort.abort()]){
  const e=await bindRuntime({client:T.client,operation:T.operation,root:T.build(),profile:P.bambu,proof}),abort=new AbortController();
  try{await e.adapter.refresh();const count=T.counters.printing;T.hooks.afterPrinting=()=>change(e,abort);
   await assert.rejects(e.exporter.export(e.input('3mf-bambu-project',abort.signal)));
   assert.equal(T.counters.printing,count+1);assert.ok(M._arch_snapshot_ptr(e.root.id)>0);
  }finally{T.hooks.afterPrinting=null;e.close();}
 }
});
