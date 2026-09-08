// Private acceptance infrastructure. Never derives product qualification from seals.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,lstat,realpath,readdir} from 'node:fs/promises';
import {createReadStream,readFileSync,lstatSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join,relative,isAbsolute,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
const HASH=/^[a-f0-9]{64}$/;
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function fileHash(file){const h=createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex');}
export function relativeFile(v){
 assert.equal(typeof v,'string');assert.ok(v.length>0&&v.length<=2048&&!v.includes('\\')&&!v.includes('\0')&&!isAbsolute(v));
 assert.ok(v.split('/').every(s=>s&&s!=='.'&&s!=='..'&&!/[:%?#]/.test(s)),'plain relative path');return v;
}
export async function plainInside(root,file){
 root=realpathSync.native(root);file=resolve(file);const rel=relative(root,file);
 assert.ok(rel&&!rel.startsWith('..')&&!isAbsolute(rel),'inside declared root');
 let p=root;for(const part of rel.split(sep)){p=join(p,part);assert.equal(lstatSync(p).isSymbolicLink(),false,'no symlink/junction');}
 assert.equal(realpathSync.native(file).toLowerCase(),file.toLowerCase());return file;
}
async function fileSet(root){
 const out=[];async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);assert.ok(!e.isSymbolicLink());if(e.isDirectory())await walk(p);else{assert.ok(e.isFile());out.push(relative(root,p).split(sep).join('/'));}}}
 await walk(root);return out.sort();
}
async function checkTable(root,table,maxBytes){
 assert.ok(Array.isArray(table)&&table.length>0&&table.length<=66048);let total=0;const seen=new Set();
 for(const r of table){
  const name=relativeFile(r.path??r.file);assert.ok(!seen.has(name.toLowerCase()),'duplicate file');seen.add(name.toLowerCase());
  assert.match(r.sha256,HASH);assert.ok(Number.isSafeInteger(r.bytes)&&r.bytes>=0&&r.bytes<=64*1024*1024);total+=r.bytes;assert.ok(total<=maxBytes);
  const p=await plainInside(root,join(root,name)),st=lstatSync(p);assert.ok(st.isFile()&&st.nlink===1);assert.equal(st.size,r.bytes,name+' bytes');assert.equal(sha256(readFileSync(p)),r.sha256,name+' SHA');
 }return total;
}
export async function verifyArtifact(input,{repositoryRoot}){
 assert.equal(input.version,'product-acceptance-input/2');assert.equal(input.purpose,'whole-product');
 assert.match(input.id,/^[a-zA-Z0-9_-]{1,64}$/);assert.match(input.releaseSHA256,HASH);assert.match(input.preparedSHA256,HASH);
 const releaseRoot=await plainInside(repositoryRoot,input.releaseRoot),preparedRoot=await plainInside(repositoryRoot,input.preparedRoot);
 const releaseBytes=await readFile(join(releaseRoot,'release-manifest.json')),preparedBytes=await readFile(join(preparedRoot,'prepared.json'));
 assert.equal(sha256(releaseBytes),input.releaseSHA256,'release seal');assert.equal(sha256(preparedBytes),input.preparedSHA256,'prepared seal');
 const release=JSON.parse(releaseBytes),prepared=JSON.parse(preparedBytes);
 assert.equal(release.version,'arch-release-package/1');assert.equal(release.databaseSchema,5);
 assert.equal(prepared.status,'prepared');assert.equal(prepared.releasePlanSHA256,input.releaseSHA256,'prepared -> release');
 const packageBytes=await checkTable(releaseRoot,release.files,768*1024*1024);
 assert.deepEqual(await fileSet(releaseRoot),[...release.files.map(f=>f.path),'release-manifest.json'].sort(),'exact release files');
 await checkTable(preparedRoot,prepared.files,1024*1024*1024);
 assert.deepEqual(await fileSet(preparedRoot),[...prepared.files.map(f=>f.file),'prepared.json'].sort(),'exact owned prepared files');
 // Canonical verifier is imported only after every member has matched the trusted seal.
 const {verifyRelease}=await import(pathToFileURL(join(releaseRoot,'tools/release/verify.mjs')).href);
 const checked=verifyRelease(releaseRoot,input.releaseSHA256);
 assert.equal(prepared.engine.sourceWrapperSHA256??prepared.engineBuild.sourceWrapperSHA256,input.engine.canonicalModuleSHA256);
 assert.equal(prepared.engine.wasmSHA256,input.engine.wasmSHA256);
 assert.equal(prepared.engine.moduleSHA256,input.engine.derivedModuleSHA256);
 assert.equal(prepared.engineBuild.receipt.sha256,input.engine.buildReceiptSHA256);
 return {version:'product-acceptance-artifact-check/1',scope:'immutable artifact integrity; no whole-product functional verdict',input,
  releaseRoot,preparedRoot,manifestPath:join(releaseRoot,'public-manifest.json'),webroot:join(releaseRoot,'public'),
  packageBytes,files:checked.files,publicAssets:checked.publicAssets,publicBytes:checked.publicBytes,buildId:checked.buildId,
  preparedFileCount:prepared.files.length,canonicalModuleSHA256:input.engine.canonicalModuleSHA256,
  derivedModuleSHA256:input.engine.derivedModuleSHA256,wasmSHA256:input.engine.wasmSHA256,buildReceiptSHA256:input.engine.buildReceiptSHA256,
  releaseSHA256:input.releaseSHA256,preparedSHA256:input.preparedSHA256};
}
export async function sealCheck(input,options){
 const checked=await verifyArtifact(input,options),dir=join(options.runDirectory,'inputs',input.id);
 await mkdir(dir);await writeFile(join(dir,'artifact-check.json'),JSON.stringify(checked,null,2)+'\n',{flag:'wx'});
 for(const name of ['prepared.json','engine-derivation.json','engine-build-contract.json','compiler-graph.json','frontend-receipt.json'])
  await writeFile(join(dir,name),await readFile(join(input.preparedRoot,name)),{flag:'wx'});
 for(const name of ['release-manifest.json','public-manifest.json'])
  await writeFile(join(dir,name),await readFile(join(input.releaseRoot,name)),{flag:'wx'});
 return checked;
}
