import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {writeFileSync,linkSync} from 'node:fs';
import {loadManifest,MAX_MANIFEST_ASSETS,MAX_MANIFEST_BYTES,MIME} from '../../src/host/manifest.mjs';
import {dir,write} from './helpers.mjs';
import {hash,jsonBytes} from '../../tools/release/core.mjs';
function fixture(){
 const root=dir('manifest'),webroot=resolve(root,'public'),b=Buffer.from('<!doctype html><title>Manifest limits</title>');
 const r=write(webroot,'index.html',b),asset={url:'/index.html',file:'index.html',sha256:r.sha256,bytes:r.bytes,mime:MIME['.html'],cache:'revalidate'};
 const doc={schemaVersion:1,buildId:'limits',assets:[asset],navigations:{'/':'/index.html'}};
 const manifestPath=resolve(root,'manifest.json'),config={webroot,manifestPath,maxAssetBytes:64*1024*1024,maxPublicBytes:512*1024*1024,immutableMaxAge:31536000};
 const save=d=>writeFileSync(manifestPath,jsonBytes(d??doc));save();return {root,webroot,doc,asset,config,save};
}
test('explicit host cap constants and count boundary reject before any enormous file tree',()=>{
 assert.equal(MAX_MANIFEST_ASSETS,65536);assert.equal(MAX_MANIFEST_BYTES,32*1024*1024);
 const f=fixture();f.doc.assets=Array(65537).fill(f.asset);f.save();
 assert.throws(()=>loadManifest(f.config),{code:'MANIFEST_INVALID'});
 f.doc.assets=Array(65536).fill(f.asset);f.save();
 // At the accepted count, the original duplicate check still runs after first real file.
 assert.throws(()=>loadManifest(f.config),{code:'MANIFEST_DUPLICATE'});
});
test('32MiB exact manifest accepted, next byte rejected; defaults/total sums unchanged',()=>{
 const f=fixture(),json=jsonBytes(f.doc),at=Buffer.alloc(MAX_MANIFEST_BYTES,32);json.copy(at);
 writeFileSync(f.config.manifestPath,at);assert.equal(loadManifest(f.config).assetCount,1);
 writeFileSync(f.config.manifestPath,Buffer.concat([at,Buffer.from(' ')]));assert.throws(()=>loadManifest(f.config),{code:'FILE_REJECTED'});
 f.save();assert.throws(()=>loadManifest({...f.config,maxPublicBytes:f.asset.bytes-1}),{code:'PUBLIC_BYTES_LIMIT'});
 assert.equal(loadManifest({...f.config,maxPublicBytes:f.asset.bytes}).publicBytes,f.asset.bytes);
});
test('cap extension preserves MIME, strict exact schema, casefold, private paths and integrity checks',()=>{
 for(const [change,code]of [
  [f=>{f.asset.mime='image/svg+xml';},'MIME_REJECTED'],
  [f=>{f.asset.extra='hidden';},'CONFIG_FIELDS_INVALID'],
  [f=>{f.doc.assets.push({...f.asset,url:'/INDEX.html',file:'INDEX.html'});},'MANIFEST_DUPLICATE'],
  [f=>{f.asset.file='private/data.html';},'ASSET_PATH_REJECTED'],
  [f=>{f.asset.sha256='0'.repeat(64);},'ASSET_INTEGRITY'],
  [f=>{f.asset.file='../index.html';},'PATH_REJECTED']
 ]){
  const f=fixture();change(f);f.save();assert.throws(()=>loadManifest(f.config),{code});
 }
});
test('inert SVG bytes can be .bin; active SVG and hardlink aliases remain rejected',()=>{
 const f=fixture(),b=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),sha=hash(b),file=sha+'.bin';
 write(f.webroot,file,b);f.doc.assets.push({url:'/'+file,file,sha256:sha,bytes:b.length,mime:'application/octet-stream',cache:'immutable'});f.save();
 assert.equal(loadManifest(f.config).assetCount,2);
 f.doc.assets[1].file=sha+'.svg';f.doc.assets[1].url='/'+sha+'.svg';f.doc.assets[1].mime='image/svg+xml';f.save();
 assert.throws(()=>loadManifest(f.config),{code:'MIME_REJECTED'});
 const g=fixture();linkSync(resolve(g.webroot,'index.html'),resolve(g.root,'second-link.html'));
 assert.throws(()=>loadManifest(g.config),{code:'FILE_REJECTED'});
});
