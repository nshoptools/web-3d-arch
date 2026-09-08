import {resolve} from 'node:path';
import {RUNTIME_FILES} from '../release/runtime-files.mjs';
import {TOOL_FILES,DOC_FILES,pinRuntime} from '../release/plan.mjs';
import {VERSION,LIMITS,need,exact,canonical,parse,pin,checked,filePin,put,hash,jsonBytes,inputRoot,walk,table,rel,sourceName,assertTable,readPlain} from './core.mjs';
import {validateEngineBuild,captureEngineBuild} from './engine-build.mjs';
export const SOURCE_DIRS=Object.freeze(['src/app','src/contracts','src/core','src/domain','src/editing','src/input','src/integration','src/mesh-import/src','src/printing/src','src/storage','src/ui','src/viewport','src/kernel/mechanics/src','src/kernel/source-assembly/src']);
export const SOURCE_FILES=Object.freeze(['index.html','src/main.mjs','package.json','package-lock.json','tsconfig.json','src/kernel/final-scene-export/runtime-helper.mjs','src/kernel/final-scene-export/float-runtime.mjs','src/kernel/Cargo.lock','src/printing/package-lock.json','src/assets/harfbuzz/package.json','src/assets/opentype/package.json','docs/development/toolchain-lock.json','src/assets/harfbuzz/LICENSE','src/assets/harfbuzz/licenses/harfbuzz-COPYING','src/assets/opentype/LICENSE',...['catalog','deployment','artwork','build-receipt'].map(n=>'src/assets/source-library/'+n+'.json'),'src/printing/docs/pins.json','src/printing/docs/unified-pins.json',...['lib3mf-BSD-2-Clause.txt','libzip-LICENSE.txt','zlib-LICENSE.txt','cpp-base64-LICENSE.txt','fast-float-Apache-2.0.txt','fast-float-MIT.txt'].map(n=>'src/printing/docs/licenses/'+n),'src/kernel/native/CMakeLists.txt','src/printing/CMakeLists.txt','tools/kernel/build.ps1','tools/kernel/module-incoming-api.json','src/kernel/native/product-exports.json']);
export const REQUIRED_LICENSES=Object.freeze(['application','react','react-dom','scheduler','three','fflate','xmldom','clipper2','manifold','emscripten','harfbuzz','harfbuzzjs','opentype','lib3mf','libzip','zlib','cpp-base64','fast-float-apache','fast-float-mit','fast-float-boost','emscripten-dlmalloc']);
export function sourceFiles(root){
 root=inputRoot(root);const names=new Set(SOURCE_FILES);
 for(const d of SOURCE_DIRS)for(const p of walk(resolve(root,d),{accept:n=>sourceName(n)&&/\.(?:mjs|cjs|js|ts|tsx|jsx|css|json)$/.test(n),descend:sourceName}))names.add(rel(root,p));
 for(const f of [...RUNTIME_FILES,...TOOL_FILES.map(f=>'tools/release/'+f),...DOC_FILES.map(f=>'docs/release/'+f)])names.add(f);
 return [...names].sort().map(n=>resolve(root,n));
}
export function validateInput(value){
 exact(value,['version','sourceRoot','appToolchainRoot','printingToolchainRoot','engine','library','licenses','privateLicenseRef']);
 need(value.version==='arch-application-input/1','APPLICATION_INPUT_VERSION');for(const k of ['sourceRoot','appToolchainRoot','printingToolchainRoot'])inputRoot(value[k]);
 exact(value.engine,['module','wasm','abi','semantics','source','buildReceipt']);
 need(value.engine.abi===2&&value.engine.semantics===3&&value.engine.source===2,'ENGINE_VERSION_REQUIRED');
 checked(value.engine.module,16*1024*1024);const wasm=checked(value.engine.wasm);need(WebAssembly.validate(wasm),'WASM_INVALID');
 validateEngineBuild(value.engine,value.sourceRoot);
 exact(value.library,['root','catalog','deployment','artwork','receipt','ready']);const library=inputRoot(value.library.root);
 for(const [key,name]of [['catalog','catalog'],['deployment','deployment'],['artwork','artwork'],['receipt','build-receipt'],['ready','ready']]){
  exact(value.library[key],['file','sha256','bytes']);need(value.library[key].file==='source-library/'+name+'.json','LIBRARY_CONFIG_PATH');
  const b=checked({...value.library[key],file:resolve(library,value.library[key].file)});
  if(key!=='ready'){const main=pin(resolve(value.sourceRoot,'src/assets/source-library/'+name+'.json'));need(main.sha256===hash(b)&&main.bytes===b.length,'LIBRARY_MAIN_MISMATCH');}
 }
 const c=parse(readPlain(resolve(library,value.library.catalog.file),LIMITS.fileBytes)),d=parse(readPlain(resolve(library,value.library.deployment.file),LIMITS.fileBytes));
 need(d.records?.length===21391&&d.totalUniqueBytes===306260612&&c.previews?.length===7751,'PRODUCTION_LIBRARY_REQUIRED');
 need(Array.isArray(value.licenses)&&value.licenses.length>=REQUIRED_LICENSES.length&&value.licenses.length<=256,'LICENSES_REQUIRED');
 const seen=new Set();for(const l of value.licenses){exact(l,['id','spdx','source','revision','file','sha256','bytes']);need(/^[A-Za-z0-9_-]{1,80}$/.test(l.id)&&!seen.has(l.id),'LICENSE_ID');for(const k of ['spdx','source','revision'])need(typeof l[k]==='string'&&l[k].length>0&&l[k].length<=2048,'LICENSE_PROVENANCE');need(/(?:LICENSE|NOTICE|OFL)(?:[._-][A-Za-z0-9_-]+)?(?:\.txt)?$|\.LICENSE$/i.test(l.file.split(/[\\/]/).at(-1)),'LICENSE_FILE_NAME');checked(filePin(l),1024*1024);seen.add(l.id);}
 need(REQUIRED_LICENSES.every(id=>seen.has(id)),'LICENSE_COVERAGE');
 need(typeof value.privateLicenseRef==='string'&&value.privateLicenseRef.length>0&&value.privateLicenseRef.length<=2048,'PROJECT_LICENSE_REFERENCE');
 need(value.licenses.find(l=>l.id==='application').spdx.startsWith('LicenseRef-'),'PROJECT_PRIVATE_LICENSE_REQUIRED');

 const byID=new Map(value.licenses.map(l=>[l.id,l]));
 for(const [id,name,tc]of [['react','react','app'],['react-dom','react-dom','app'],['scheduler','scheduler','app'],['three','three','app'],['fflate','fflate','printing'],['xmldom','@xmldom/xmldom','printing']]){
  const base=resolve(tc==='app'?value.appToolchainRoot:value.printingToolchainRoot,'node_modules',name),pkg=parse(readPlain(resolve(base,'package.json'),1048576)),l=byID.get(id);
  need(l.sha256===pin(resolve(base,'LICENSE')).sha256&&l.revision===pkg.version&&l.spdx===pkg.license,'LICENSE_PACKAGE_MISMATCH');
 }
 const native=parse(readPlain(resolve(value.sourceRoot,'docs/development/toolchain-lock.json'),1048576));
 for(const id of ['clipper2','manifold'])need(byID.get(id).sha256===native[id].licenseSha256.toLowerCase()&&byID.get(id).revision===native[id].revision,'LICENSE_NATIVE_MISMATCH');
 for(const [id,base]of [['harfbuzzjs','src/assets/harfbuzz'],['opentype','src/assets/opentype']]){
  const pkg=parse(readPlain(resolve(value.sourceRoot,base,'package.json'),1048576)),l=byID.get(id);
  need(l.sha256===pin(resolve(value.sourceRoot,base,'LICENSE')).sha256&&l.revision===pkg.version&&l.spdx===pkg.license,'LICENSE_PACKAGE_MISMATCH');
 }
 need(byID.get('harfbuzz').sha256===pin(resolve(value.sourceRoot,'src/assets/harfbuzz/licenses/harfbuzz-COPYING')).sha256&&byID.get('harfbuzz').revision===native.harfbuzz.revision,'LICENSE_NATIVE_MISMATCH');
 need(byID.get('emscripten').revision===native.emsdk,'LICENSE_NATIVE_MISMATCH');
 const printing=parse(readPlain(resolve(value.sourceRoot,'src/printing/docs/pins.json'),1048576));
 need(byID.get('lib3mf').revision===printing.core.version,'LICENSE_NATIVE_MISMATCH');
 for(const [id,name]of [['lib3mf','lib3mf-BSD-2-Clause.txt'],['libzip','libzip-LICENSE.txt'],['zlib','zlib-LICENSE.txt'],['cpp-base64','cpp-base64-LICENSE.txt'],['fast-float-apache','fast-float-Apache-2.0.txt'],['fast-float-mit','fast-float-MIT.txt']])
  need(byID.get(id).sha256===pin(resolve(value.sourceRoot,'src/printing/docs/licenses',name)).sha256,'LICENSE_NATIVE_MISMATCH');
 return value;
}
export function capture(input,out){
 const root=input.sourceRoot,rows=table(sourceFiles(root),{base:root}),dest=resolve(out,'inputs/source');
 const main=rows.find(r=>r.relative==='src/main.mjs'),entry=rows.find(r=>r.relative==='src/integration/product-entry.mjs');
 need(main&&entry&&readPlain(main.file,LIMITS.fileBytes).includes(Buffer.from('./integration/product-entry.mjs')),'PRODUCTION_ENTRY_REQUIRED');
 need(parse(readPlain(resolve(root,'package.json'),1048576)).private===true,'PRIVATE_APPLICATION_REQUIRED');
 for(const r of rows)put(resolve(dest,r.relative),checked(filePin(r)));
 const pair={};for(const [key,name]of [['module','arch-kernel.mjs'],['wasm','arch-kernel.wasm']]){const b=checked(input.engine[key]);put(resolve(out,'inputs/engine',name),b);pair[key]=pin(resolve(out,'inputs/engine',name));}
 const licenses=[];for(const l of input.licenses){const path=resolve(out,'inputs/licenses',l.id,'NOTICE.txt');put(path,checked(filePin(l)));licenses.push({...l,file:path});}
 const library=[];for(const k of ['catalog','deployment','artwork','receipt','ready']){const p={...input.library[k],file:resolve(input.library.root,input.library[k].file)};const b=checked(p);put(resolve(out,'inputs/library',input.library[k].file),b);library.push({...p,key:k});}
 const toolchains=[];for(const [id,tc]of [['app',input.appToolchainRoot],['printing',input.printingToolchainRoot]]){
  const lock=pin(resolve(tc,'package-lock.json'));put(resolve(out,'inputs/toolchains',id+'-package-lock.json'),checked(lock));
  const rows=table(walk(resolve(tc,'node_modules'),{maxFiles:LIMITS.toolchainFiles}),{maxBytes:LIMITS.toolchainBytes,base:tc});
  need(rows.every(r=>!r.relative.includes('/.cache/')),'TOOLCHAIN_CACHE_INPUT');
  toolchains.push({id,root:tc,lock,files:rows});
 }
 const engineBuild=captureEngineBuild(input.engine,root,out);
 const snapshot={version:VERSION,sourceRoot:root,source:rows,engineBuild,engineOriginal:input.engine,engineOwned:pair,library,licenses:input.licenses,privateLicenseRef:input.privateLicenseRef,toolchains};
 put(resolve(out,'inputs/snapshot.json'),jsonBytes(snapshot));
 put(resolve(out,'runtime-lock.json'),jsonBytes(pinRuntime(dest)));
 assertTable(rows);return {snapshot,source:dest,licenses};
}
export function unchanged(snapshot){
 const now=sourceFiles(snapshot.sourceRoot);
 need(canonical(now)===canonical(snapshot.source.map(r=>r.file)),'SOURCE_FILE_SET_CHANGED');
 assertTable(snapshot.source,'SOURCE_CHANGED');assertTable([snapshot.engineOriginal.module,snapshot.engineOriginal.wasm],'ENGINE_CHANGED');
 assertTable([snapshot.engineBuild.receipt,...snapshot.engineBuild.files],'ENGINE_BUILD_CHANGED');
 assertTable(snapshot.library,'LIBRARY_CONFIG_CHANGED');assertTable(snapshot.licenses,'LICENSE_CHANGED');
 for(const tc of snapshot.toolchains){const names=walk(resolve(tc.root,'node_modules'),{maxFiles:LIMITS.toolchainFiles});need(canonical(names)===canonical(tc.files.map(r=>r.file)),'TOOLCHAIN_FILE_SET_CHANGED');assertTable(tc.files,'TOOLCHAIN_CHANGED');assertTable([tc.lock],'TOOLCHAIN_CHANGED');}
}
