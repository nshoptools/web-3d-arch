import {resolve,dirname} from 'node:path';
import {mkdirSync,writeFileSync,mkdtempSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {environment,outputPath} from '../../tools/application/core.mjs';
import {deriveWrapper} from '../../tools/application/engine.mjs';
export const candidate=resolve(new URL('../../',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
export const digest=b=>createHash('sha256').update(b).digest('hex');
export function directory(label='case'){const base=outputPath(resolve(environment().run,'temp','application-tests'));mkdirSync(base,{recursive:true});return mkdtempSync(resolve(base,label+'-'));}
export function write(root,name,bytes){const file=resolve(root,name);outputPath(file);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,bytes);return file;}
export const wasm=Uint8Array.of(0,97,115,109,1,0,0,0);
export const wrapper=Buffer.from('const locateFile=()=>"arch-kernel.wasm";const binary=new URL(\'arch-kernel.wasm\',import.meta.url);export default ()=>({locateFile,binary});\n');
/** Deliberately synthetic compiler-record fixture; never passed to prepare/package. */
export function frontendFixture(){
 const root=directory('frontend'),d=deriveWrapper(wrapper,wasm),engine={...d.receipt},entry='assets/index-A1B2C3D4.js';
 const workers=['engine-worker','png-worker','mesh-qualification-worker','worker'],bundles=[{type:'chunk',fileName:entry,isEntry:true,facadeModuleId:'/src/main.mjs',imports:[],dynamicImports:[],css:['assets/main.css'],assets:[]}];
 write(root,entry,'export const syntheticCompilerFixture=true;\n');write(root,'assets/main.css','body{color:#123}\n');
 write(root,'index.html','<!doctype html><html><head><link rel="stylesheet" href="/assets/main.css"></head><body><script type="module" src="/'+entry+'"></script></body></html>');
 for(const n of workers){const fileName='assets/'+n+'-A1B2C3D4.js';write(root,fileName,'export const syntheticWorkerFixture=true;\n');bundles.push({type:'chunk',fileName,isEntry:true,facadeModuleId:'/src/'+(n==='worker'?'editing':'core')+'/'+n+'.mjs',imports:[],dynamicImports:[]});}
 write(root,d.receipt.moduleName,d.bytes);write(root,d.receipt.wasmName,wasm);
 const manifest={'index.html':{file:entry,isEntry:true,css:['assets/main.css']}};
 write(root,'.vite/manifest.json',JSON.stringify(manifest));return {root,entry,engine,graph:{bundles},manifest};
}
