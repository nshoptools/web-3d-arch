import {resolve} from 'node:path';
import {parse,readPlain,inputRoot,pin,checked,put,jsonBytes,newDirectory,need,exact,safeCode} from './core.mjs';
/** Pins declared files only. Does not discover a module, license grant or native compatibility. */
export function pinApplicationInput(request,destination){
 exact(request,['version','sourceRoot','appToolchainRoot','printingToolchainRoot','engine','libraryRoot','licenses','privateLicenseRef']);
 need(request.version==='arch-application-request/1','APPLICATION_REQUEST_VERSION');
 const out=newDirectory(destination);for(const k of ['sourceRoot','appToolchainRoot','printingToolchainRoot','libraryRoot'])inputRoot(request[k]);
 exact(request.engine,['module','wasm','abi','semantics','source','buildReceipt']);checked(request.engine.module);checked(request.engine.wasm);
 need(Array.isArray(request.licenses)&&request.licenses.length<=256,'LICENSES_REQUIRED');
 for(const l of request.licenses){exact(l,['id','spdx','source','revision','file']);need(/(?:LICENSE|LICENCE|COPYING|COPYRIGHT|NOTICE|OFL|UNLICENSE)(?:[._-][A-Za-z0-9_-]+)*(?:\.[A-Za-z]+)?$/i.test(l.file.split(/[\\/]/).at(-1)),'LICENSE_FILE_NAME');}
 need(/(?:^|[\\/])[^\\/]*receipt\.json$/i.test(request.engine.buildReceipt?.file??''),'ENGINE_BUILD_RECEIPT_PATH');checked(request.engine.buildReceipt,262144);
 const licenses=request.licenses.map(l=>{exact(l,['id','spdx','source','revision','file']);need(/^[A-Za-z0-9_-]{1,80}$/.test(l.id),'LICENSE_ID');need(/(?:LICENSE|LICENCE|COPYING|COPYRIGHT|NOTICE|OFL|UNLICENSE)(?:[._-][A-Za-z0-9_-]+)*(?:\.[A-Za-z]+)?$/i.test(l.file.split(/[\\/]/).at(-1)),'LICENSE_FILE_NAME');const original=pin(l.file,1024*1024);
  const file=resolve(out,'notices',l.id,'NOTICE.txt');put(file,checked(original));return {...l,file,sha256:original.sha256,bytes:original.bytes};});
 const library={root:request.libraryRoot};for(const [key,name]of [['catalog','catalog'],['deployment','deployment'],['artwork','artwork'],['receipt','build-receipt'],['ready','ready']]){
  const r=pin(resolve(request.libraryRoot,'source-library/'+name+'.json'));library[key]={...r,file:'source-library/'+name+'.json'};
 }
 const input={version:'arch-application-input/1',sourceRoot:request.sourceRoot,appToolchainRoot:request.appToolchainRoot,printingToolchainRoot:request.printingToolchainRoot,engine:request.engine,library,licenses,privateLicenseRef:request.privateLicenseRef};

 put(resolve(out,'request.json'),jsonBytes(request));put(resolve(out,'license-origins.json'),jsonBytes(request.licenses.map(l=>({...l,...pin(l.file,1024*1024)}))));
 put(resolve(out,'application-input.json'),jsonBytes(input));return {status:'pinned',sha256:pin(resolve(out,'application-input.json')).sha256,licenses:licenses.length};
}
if(process.argv[1]&&import.meta.url===new URL('file:///'+resolve(process.argv[1]).replaceAll('\\','/')).href){
 try{const [request,dest,...rest]=process.argv.slice(2);need(request&&dest&&!rest.length,'CLI_ARGUMENTS');console.log(JSON.stringify(pinApplicationInput(parse(readPlain(pin(request).file,4*1024*1024)),dest)));}
 catch(e){console.error(JSON.stringify({status:'failed',code:safeCode(e)}));process.exitCode=1;}
}
