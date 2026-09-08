import {beginJournal,pinExistingObjects} from '/src/journal.mjs';
const begin=(h,f,id='job-'+crypto.randomUUID())=>beginJournal(f.store.db,{id,owner:'batch-test',projectId:'p',expectedRevision:1,fingerprint:'f'.repeat(64),manifestHash:'e'.repeat(64)});
const inventory=(h,n=8)=>Array.from({length:n},(_,i)=>({kind:'source',bytes:h.common.encoder.encode('batch-source-'+i)}));
export const batchCases={
 async batchPinOneTransaction(h,b){
  const f=await h.fixture(b),input={...h.input('p',0),assets:inventory(h)},saved=await f.store.commit(input);
  const assets=(await f.store.load('p')).manifest.assets,job=await begin(h,f),tx=f.store.db.transaction;let transactions=0;
  f.store.db.transaction=function(...args){transactions++;return tx.apply(this,args);};
  let result;try{result=await pinExistingObjects(f.store.db,job,[...assets,{hash:'a'.repeat(64),byteLength:5}]);}finally{f.store.db.transaction=tx;}
  h.equal(transactions,1,'one strict transaction for all existing pins');h.equal(result.size,8);
  h.equal((await h.row(f,'journals',job.id)).pins.sort(),assets.map(a=>a.hash).sort());
  await pinExistingObjects(f.store.db,job,assets);for(const asset of assets)h.equal((await h.row(f,'objects',asset.hash)).pins.filter(id=>id===job.id).length,1);
  await f.store.discardPending(job.id);h.equal((await f.store.load('p')).manifestHash,saved.manifestHash);
  return {existing:8,missing:1,transactions,duplicates:0,committedRetained:true};
 },
 async batchRollbackAndFence(h,b){
  const f=await h.fixture(b);await f.store.commit({...h.input('p',0),assets:inventory(h,3)});
  const assets=(await f.store.load('p')).manifest.assets,job=await begin(h,f),damaged=await h.row(f,'objects',assets[1].hash);
  await h.put(f,'objects',{...damaged,state:'deleting'});
  await h.rejects(()=>pinExistingObjects(f.store.db,job,assets),['OBJECT_UNAVAILABLE']);
  h.equal((await h.row(f,'objects',assets[0].hash)).pins,[]);h.equal((await h.row(f,'journals',job.id)).pins,[]);
  await h.put(f,'objects',damaged);
  await h.rejects(()=>pinExistingObjects(f.store.db,{...job,fence:job.fence+1},assets),['STALE_GENERATION']);
  const abort=new AbortController();let guards=0;
  await h.rejects(()=>pinExistingObjects(f.store.db,job,assets,{signal:abort.signal,guard:()=>{if(++guards===4){abort.abort();h.common.abortCheck(abort.signal);}}}),['ABORTED']);
  for(const a of assets)h.equal((await h.row(f,'objects',a.hash)).pins,[]);h.equal((await h.row(f,'journals',job.id)).pins,[]);
  await f.store.discardPending(job.id);return {rollbackAfterEarlierPin:true,staleFence:true,abortDuringBatch:true};
 },
 async batchLateDamageBlocksPublication(h,b){
  let armed=false,target;
  const f=await h.fixture(b,{checkpoint:async name=>{if(armed&&name==='publish.before-transaction'){armed=false;await h.damageAsset(f,target,'corrupt');}}});
  const assets=inventory(h,3);await f.store.commit({...h.input('p',0),assets});const loaded=await f.store.load('p'),head=loaded.head;
  target=loaded.manifest.assets.at(-1).hash;armed=true;
  await h.rejects(()=>f.store.commit({...h.input('p',1),assets}),['ASSET_HASH']);
  h.equal(await h.row(f,'heads','p'),head);
  h.assert((await h.rows(f,'journals')).filter(j=>j.status==='aborted').every(j=>j.pins.length===0));
  return {allPinnedAssetsReverified:true,headUnchanged:true,faultCheckpoint:'publish.before-transaction'};
 },
 async batchConcurrentCAS(h,b){
  let arrived=0,resolve;const gate=new Promise(r=>resolve=r);const checkpoint=async name=>{if(name==='publish.before-transaction'&&armed){if(++arrived===2)resolve();await gate;}};
  let armed=false;const f=await h.fixture(b,{checkpoint}),assets=inventory(h,4);await f.store.commit({...h.input('p',0),assets});
  const second=await h.fixture(b,{userId:f.userId,checkpoint});armed=true;
  const results=await Promise.allSettled([f.store.commit({...h.input('p',1,{title:'writer-a'}),assets}),second.store.commit({...h.input('p',1,{title:'writer-b'}),assets})]);
  h.equal(results.filter(r=>r.status==='fulfilled').length,1);h.equal(results.find(r=>r.status==='rejected').reason.code,'CONFLICT');
  const loaded=await second.store.load('p');h.equal(loaded.head.revision,2);h.equal(loaded.assets.length,4);
  const conflicts=(await h.rows(second,'journals')).filter(j=>j.status==='conflict');h.equal(conflicts.length,1);h.equal(conflicts[0].pins.length,4);
  f.store.close();return {independentConnections:2,casWinners:1,conflictRetained:true};
 }
};
