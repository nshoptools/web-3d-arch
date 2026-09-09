import test from 'node:test';
import assert from 'node:assert/strict';
import {openProjectStore} from '../../src/storage/store.mjs';
import {exportRescuePackage,importRescueCopy,isRescuePackage} from '../../src/storage/package.mjs';
import {readStoredZip,writeStoredZip} from '../../src/storage/zip.mjs';
import {encoder,decodeUTF8,parseJSON,canonicalJSON} from '../../src/storage/common.mjs';
import {createMemoryIndexedDB} from '../app/memory-indexeddb.mjs';
// Audit RO-01: exporting a rescue package, importing it as a copy and exporting again must not
// grow the package on every round. Real store, real package/zip/manifest code; in-memory IndexedDB.
const T=Date.UTC(2026,8,9);
async function storeFixture(){
 globalThis.indexedDB??=createMemoryIndexedDB();
 const userId='TEST-package-'+crypto.randomUUID(),deviceId='TEST-device';
 const store=await openProjectStore({userId,deviceId,now:()=>T+1000,policy:{backend:'idb',coordination:'cas-only'}});
 await store.unlock({userId,deviceId,authVersion:1,verifiedAt:T,expiresAt:T+3600000,verified:true});return store;
}
const source=new Uint8Array(256*1024);for(let i=0;i<source.length;i++)source[i]=(i*2654435761>>>13)&255;
const generation=projectId=>({projectId,expectedRevision:0,transactionId:'tx-'+crypto.randomUUID(),engine:{id:'TEST-fixture',version:'1'},domainSchemaVersion:1,
 document:{title:'Dự án gốc',revision:1,retainedAssets:[]},assets:[{kind:'source',bytes:source}]});
const packageAssets=zip=>parseJSON(decodeUTF8(readStoredZip(zip).get('package.json'))).files.filter(f=>f.type==='asset');

test('RO-01: export → import copy → export keeps the package the same size and never nests the previous ZIP',async()=>{
 const store=await storeFixture();
 await store.commit(generation('origin'));
 let projectId='origin';const sizes=[];
 for(let round=0;round<5;round++){
  const pkg=await exportRescuePackage(store,projectId);
  sizes.push(pkg.bytes.length);
  assert.ok(packageAssets(pkg.bytes).every(f=>f.byteLength!==pkg.bytes.length),'a package must not carry a package of its own size');
  const copyId='copy-'+round;
  const imported=await importRescueCopy(store,pkg.bytes,{projectId:copyId,transactionId:'tx-'+crypto.randomUUID()});
  assert.equal(imported.status,'imported-copy');assert.equal(imported.originalPackageRetained,false);
  const loaded=await store.load(copyId);
  assert.equal(loaded.status,'editable');
  assert.ok(!loaded.manifest.dependencies.includes(imported.originalPackageHash),'the verified package is not re-embedded as a dependency');
  assert.ok(loaded.assets.every(a=>!(a.kind==='dependency'&&isRescuePackage(a.bytes))),'no nested rescue package survives a verified import');
  assert.equal(loaded.assets.find(a=>a.kind==='source')?.bytes.length,source.length,'the source bytes travel unchanged');
  projectId=copyId;
 }
 const first=sizes[0];
 for(const size of sizes)assert.ok(Math.abs(size-first)<=2048,'package size must stay flat across rounds: '+JSON.stringify(sizes));
});

test('RO-01: an incomplete package is still kept whole so nothing unread is lost',async()=>{
 const store=await storeFixture();
 await store.commit(generation('origin'));
 const pkg=await exportRescuePackage(store,'origin');
 // Mark the package incomplete, as a rescue of a damaged store would.
 const files=readStoredZip(pkg.bytes);const meta=parseJSON(decodeUTF8(files.get('package.json')));meta.complete=false;meta.issues=[{code:'TEST_PARTIAL'}];
 files.set('package.json',encoder.encode(canonicalJSON(meta)));
 const partial=writeStoredZip([...files.entries()].map(([name,bytes])=>({name,bytes})));
 const imported=await importRescueCopy(store,partial,{projectId:'partial-copy',transactionId:'tx-'+crypto.randomUUID()});
 assert.equal(imported.status,'imported-copy');assert.equal(imported.originalPackageRetained,true);
 const loaded=await store.load('partial-copy');
 assert.ok(loaded.manifest.dependencies.includes(imported.originalPackageHash),'an incomplete package is retained as a dependency');
 assert.ok(loaded.assets.some(a=>a.hash===imported.originalPackageHash&&isRescuePackage(a.bytes)));
});
