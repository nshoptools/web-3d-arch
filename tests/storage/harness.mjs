import * as storage from '/src/index.mjs';
import * as common from '/src/common.mjs';
import * as idb from '/src/idb.mjs';
import * as zip from '/src/zip.mjs';
import {cases} from '/cases.mjs';
const fixtures=new Map();
const T=Date.UTC(2026,8,8,3);
function assert(value,message='Assertion failed'){if(!value)throw new Error(message);}
function equal(a,b,message='Values differ'){assert(common.canonicalJSON(a)===common.canonicalJSON(b),message+': '+common.canonicalJSON({actual:a,expected:b}));}
async function rejects(fn,codes){
  try{await fn();}catch(error){if(codes)assert(codes.includes(typeof error.code==='string'?error.code:error.name),'Unexpected rejection '+(error.code??error.name)+': '+error.message);return error;}
  throw new Error('Expected rejection');
}
async function fixture(backend,{userId='test-'+crypto.randomUUID(),policy={},checkpoint,syncCheckpoint}={}){
  const time={value:T};const lease={userId,deviceId:'device-a',authVersion:1,verifiedAt:T,expiresAt:T+3600000,verified:true};
  const store=await storage.openProjectStore({userId,deviceId:'device-a',now:()=>time.value,policy:{backend,coordination:'cas-only',...policy},checkpoint,syncCheckpoint});
  await store.unlock(lease);
  const f={store,time,lease,userId,backend,policy};fixtures.set(userId,f);return f;
}
function input(projectId,revision,{text='source-'+revision,title='Project '+revision,transactionId='tx-'+crypto.randomUUID(),document,retainManifests=[]}={}){
  return {projectId,expectedRevision:revision,transactionId,engine:{id:'fixture-rebuild',version:'1.0.0'},domainSchemaVersion:1,
    document:document??{title,product:'keychain',revision,size:50+revision,source:{text:'Giữ nguồn 🇻🇳',rawDecimal:'1,7'}},
    assets:[{kind:'source',bytes:common.encoder.encode(text)}],retainManifests};
}
async function row(f,store,key){return idb.readRecord(f.store.db,store,key);}
async function rows(f,store){return idb.readRecords(f.store.db,store);}
async function put(f,store,value){return idb.atomic(f.store.db,[store],'readwrite',t=>{t.store(store).put(value);});}
async function remove(f,store,key){return idb.atomic(f.store.db,[store],'readwrite',t=>{t.store(store).delete(key);});}
async function damageAsset(f,hash,action){
  const object=await row(f,'objects',hash);assert(object,'Asset object missing before damage');
  if(object.backend==='opfs'){
    const root=await navigator.storage.getDirectory();
    const dir=await(await root.getDirectoryHandle('web-3d-arch')).getDirectoryHandle(f.store.namespace);
    if(action==='remove')await dir.removeEntry(object.locator);
    else {const handle=await dir.getFileHandle(object.locator);const writer=await handle.createWritable();const bad=new Uint8Array(object.byteLength).fill(0x78);await writer.write(bad);await writer.close();}
  }else if(action==='remove')await remove(f,'blobs',object.locator);
  else await put(f,'blobs',{locator:object.locator,blob:new Blob([new Uint8Array(object.byteLength).fill(0x78)])});
}
async function replaceManifest(f,projectId,transform){
  const h=await row(f,'heads',projectId),old=await row(f,'manifests',h.currentHash);
  const doc=JSON.parse(new TextDecoder().decode(old.bytes));transform(doc);
  const bytes=common.encoder.encode(JSON.stringify(doc)),hash=await common.sha256(bytes);
  await put(f,'manifests',{...old,hash,bytes});
  h.currentHash=hash;await put(f,'heads',h);return {bytes,hash};
}
function crash(name){const error=new Error('Injected fault checkpoint: '+name);error.code='FAULT_CHECKPOINT';error.crash=true;return error;}
const helpers={storage,common,idb,zip,assert,equal,rejects,fixture,input,row,rows,put,remove,damageAsset,replaceManifest,crash,T};
async function run(name,backend){
  const start=performance.now();const before=new Set(fixtures.keys());
  try{
    const details=await cases[name](helpers,backend);
    return {name,backend,status:'pass',durationMs:Math.round(performance.now()-start),details:details??{}};
  }catch(error){
    return {name,backend,status:'fail',durationMs:Math.round(performance.now()-start),error:{name:error.name,code:error.code??null,message:error.message,stack:error.stack}};
  }finally{for(const [id,f]of fixtures)if(!before.has(id)){f.store.close();fixtures.delete(id);}}
}
globalThis.testAPI={...helpers,caseNames:Object.keys(cases),run,fixtures,ready:true};
